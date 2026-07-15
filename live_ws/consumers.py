import json
import re
import secrets
import threading
import time
import uuid

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from channels.generic.websocket import WebsocketConsumer


class LiveWebSocketsConsumer(WebsocketConsumer):
    """Match players, retain resumable games, and enforce disconnect forfeits."""

    DISCONNECT_GRACE_SECONDS = 30
    CLIENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,128}$")

    waiting_channels = {}
    matches = {}
    matches_by_client = {}
    matchmaking_lock = threading.RLock()

    def connect(self):
        route_kwargs = self.scope.get("url_route", {}).get("kwargs", {})
        try:
            game_time_seconds = int(route_kwargs.get("game_time_seconds"))
            increment_seconds = int(route_kwargs.get("increment_seconds"))
        except (TypeError, ValueError):
            self.close(code=4000)
            return

        self.queue_name = f"online_chess_{game_time_seconds}_{increment_seconds}"
        self.game_time_seconds = game_time_seconds
        self.increment_seconds = increment_seconds
        self.match_group_name = None
        self.match_id = None
        self.client_id = None
        self.accept()

    def disconnect(self, close_code):
        disconnected_match = None
        disconnect_generation = None

        with self.matchmaking_lock:
            waiting = self.waiting_channels.get(self.queue_name)
            if waiting and waiting["channel_name"] == self.channel_name:
                self.waiting_channels.pop(self.queue_name, None)

            match = self.matches.get(self.match_id)
            player = match and match["players"].get(self.client_id)
            # An older socket may close after its replacement has connected.
            if player and player["channel_name"] == self.channel_name and not match["ended"]:
                player["connected"] = False
                player["channel_name"] = None
                player["generation"] += 1
                disconnected_match = match
                disconnect_generation = player["generation"]

        if self.match_group_name:
            async_to_sync(self.channel_layer.group_discard)(
                self.match_group_name, self.channel_name
            )

        if disconnected_match:
            async_to_sync(self.channel_layer.group_send)(
                disconnected_match["group_name"],
                {
                    "type": "connection_notice",
                    "client_id": self.client_id,
                    "connected": False,
                    "grace_seconds": self.DISCONNECT_GRACE_SECONDS,
                },
            )
            timer = threading.Timer(
                self.DISCONNECT_GRACE_SECONDS,
                self._forfeit_disconnected_player,
                args=(self.match_id, self.client_id, disconnect_generation),
            )
            timer.daemon = True
            timer.start()

    def receive(self, text_data):
        try:
            payload = json.loads(text_data)
            chess_event = payload["chess_event"]
            event = json.loads(chess_event) if isinstance(chess_event, str) else chess_event
            if not isinstance(event, dict):
                raise TypeError
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            self.close(code=4001)
            return

        event_type = event.get("type", "")
        if event_type == "ping":
            self.send(text_data=json.dumps({
                "type": "pong",
                "server_time": round(time.time() * 1000),
            }))
            return

        if event_type == "clock_sync_request":
            self.send(text_data=json.dumps({
                "type": "clock_sync_response",
                "server_time": round(time.time() * 1000),
                "client_send_time": event.get("client_send_time", 0),
            }))
            return

        if event_type == "sync":
            self._subscribe(event)
            return

        if not self.match_id or not self.client_id:
            return

        server_time = round(time.time() * 1000)
        event["server_time"] = server_time
        finished_match_id = None
        with self.matchmaking_lock:
            match = self.matches.get(self.match_id)
            player = match and match["players"].get(self.client_id)
            if (
                not match
                or match["ended"]
                or not player
                or player["channel_name"] != self.channel_name
            ):
                return

            if self._is_move_event(event):
                if not self._is_valid_move_event(event):
                    return
                if player["color"] != match["clock"]["active_color"]:
                    return
                current_clock = self._clock_snapshot_locked(match, server_time)
                if current_clock[f"{player['color']}_ms"] <= 0:
                    return
                self._record_move_clock_locked(match, server_time)
                only_king = event.get("onlyKing")
                if isinstance(only_king, dict):
                    for color in ("white", "black"):
                        if isinstance(only_king.get(color), bool):
                            match["only_king"][color] = only_king[color]
                self._schedule_clock_timeout_locked(match)

            event["clock"] = self._clock_snapshot_locked(match, server_time)
            match["last_sequence"] += 1
            event["_server_seq"] = match["last_sequence"]
            event["_sender_id"] = self.client_id
            match["history"].append(dict(event))
            if event_type == "game_over":
                match["ended"] = True
                if match.get("clock_timer"):
                    match["clock_timer"].cancel()
                finished_match_id = self.match_id
                for player_id in match["players"]:
                    self.matches_by_client.pop(player_id, None)

        async_to_sync(self.channel_layer.group_send)(
            self.match_group_name,
            {"type": "live_ws_chess_event", "chess_event": json.dumps(event)},
        )
        if finished_match_id:
            with self.matchmaking_lock:
                self.matches.pop(finished_match_id, None)

    def _subscribe(self, event):
        client_id = str(event.get("client_id", ""))
        if not self.CLIENT_ID_PATTERN.fullmatch(client_id):
            self.close(code=4002)
            return

        try:
            last_sequence = max(0, int(event.get("last_event_seq", 0)))
        except (TypeError, ValueError):
            last_sequence = 0

        self.client_id = client_id
        resumed_match = None

        with self.matchmaking_lock:
            match_id = self.matches_by_client.get(client_id)
            match = self.matches.get(match_id)
            if match and not match["ended"]:
                player = match["players"][client_id]
                player["connected"] = True
                player["channel_name"] = self.channel_name
                player["generation"] += 1
                self.match_id = match_id
                self.match_group_name = match["group_name"]
                resumed_match = match
                missed_events = [
                    item for item in match["history"]
                    if item.get("_server_seq", 0) > last_sequence
                ]
                async_to_sync(self.channel_layer.group_add)(
                    match["group_name"], self.channel_name
                )
                self.send(text_data=json.dumps({
                    "type": "match_resumed",
                    "color": player["color"],
                    "server_time": round(time.time() * 1000),
                    "date_start": match["date_start"],
                    "last_event_seq": match["last_sequence"],
                    "missed_events": missed_events,
                    # The full checkpoint lets the client rebuild authoritative
                    # state after an ambiguous disconnect during socket.send().
                    "history": [dict(item) for item in match["history"]],
                    "clock": self._clock_snapshot_locked(
                        match, round(time.time() * 1000)
                    ),
                }))
            else:
                if event.get("resume_only"):
                    self.send(text_data=json.dumps({"type": "resume_unavailable"}))
                    return
                self._enter_matchmaking_queue_locked()

        if not resumed_match:
            return

        async_to_sync(self.channel_layer.group_send)(
            resumed_match["group_name"],
            {
                "type": "connection_notice",
                "client_id": client_id,
                "connected": True,
                "grace_seconds": self.DISCONNECT_GRACE_SECONDS,
            },
        )

    def _enter_matchmaking_queue_locked(self):
        waiting = self.waiting_channels.get(self.queue_name)
        if waiting and waiting["client_id"] != self.client_id:
            self.waiting_channels.pop(self.queue_name, None)
            self._create_match_locked(waiting)
        else:
            self.waiting_channels[self.queue_name] = {
                "client_id": self.client_id,
                "channel_name": self.channel_name,
            }

    def _create_match_locked(self, waiting):
        match_id = uuid.uuid4().hex
        group_name = f"chess_match_{match_id}"
        client_ids = [waiting["client_id"], self.client_id]
        channels = [waiting["channel_name"], self.channel_name]
        white_index = secrets.randbelow(2)
        server_time = round(time.time() * 1000)
        date_start = server_time + 2000
        players = {}

        for index, client_id in enumerate(client_ids):
            players[client_id] = {
                "color": "white" if index == white_index else "black",
                "channel_name": channels[index],
                "connected": True,
                "generation": 0,
            }
            self.matches_by_client[client_id] = match_id

        match = {
            "id": match_id,
            "group_name": group_name,
            "queue_name": self.queue_name,
            "date_start": date_start,
            "players": players,
            "history": [],
            "last_sequence": 0,
            "ended": False,
            "increment_ms": self.increment_seconds * 1000,
            "clock": {
                "white_ms": self.game_time_seconds * 1000,
                "black_ms": self.game_time_seconds * 1000,
                "active_color": "white",
                "turn_started_at": date_start,
                "generation": 0,
            },
            "clock_timer": None,
            "only_king": {"white": False, "black": False},
        }
        self.matches[match_id] = match
        self._schedule_clock_timeout_locked(match)

        for client_id, channel_name in zip(client_ids, channels):
            async_to_sync(self.channel_layer.group_add)(group_name, channel_name)
            async_to_sync(self.channel_layer.send)(channel_name, {
                "type": "match_found",
                "match_id": match_id,
                "match_group_name": group_name,
                "color": players[client_id]["color"],
                "server_time": server_time,
                "date_start": date_start,
                "clock": self._clock_snapshot_locked(match, server_time),
            })

    @staticmethod
    def _is_move_event(event):
        return all(key in event for key in ("x", "y", "newX", "newY"))

    @staticmethod
    def _is_valid_move_event(event):
        coordinates = [event.get(key) for key in ("x", "y", "newX", "newY")]
        if not all(type(value) is int and 1 <= value <= 8 for value in coordinates):
            return False
        return coordinates[:2] != coordinates[2:]

    @staticmethod
    def _clock_snapshot_locked(match, server_time):
        clock = match["clock"]
        white_ms = clock["white_ms"]
        black_ms = clock["black_ms"]
        elapsed = max(0, server_time - clock["turn_started_at"])
        if clock["active_color"] == "white":
            white_ms = max(0, white_ms - elapsed)
        else:
            black_ms = max(0, black_ms - elapsed)
        return {
            "white_ms": round(white_ms),
            "black_ms": round(black_ms),
            "active_color": clock["active_color"],
            "server_time": server_time,
            "ticks_from": max(server_time, clock["turn_started_at"]),
        }

    @classmethod
    def _record_move_clock_locked(cls, match, server_time):
        snapshot = cls._clock_snapshot_locked(match, server_time)
        clock = match["clock"]
        clock["white_ms"] = snapshot["white_ms"]
        clock["black_ms"] = snapshot["black_ms"]
        moved_color = clock["active_color"]
        remaining_key = f"{moved_color}_ms"
        clock[remaining_key] += match["increment_ms"]
        clock["active_color"] = "black" if moved_color == "white" else "white"
        clock["turn_started_at"] = server_time
        clock["generation"] += 1

    @classmethod
    def _schedule_clock_timeout_locked(cls, match):
        existing_timer = match.get("clock_timer")
        if existing_timer:
            existing_timer.cancel()
        clock = match["clock"]
        remaining = clock[f"{clock['active_color']}_ms"]
        now = round(time.time() * 1000)
        delay_ms = max(50, clock["turn_started_at"] - now + remaining)
        timer = threading.Timer(
            delay_ms / 1000,
            cls._forfeit_on_time,
            args=(match["id"], clock["active_color"], clock["generation"]),
        )
        timer.daemon = True
        match["clock_timer"] = timer
        timer.start()

    @classmethod
    def _forfeit_on_time(cls, match_id, timed_out_color, generation):
        with cls.matchmaking_lock:
            match = cls.matches.get(match_id)
            if not match or match["ended"]:
                return
            clock = match["clock"]
            if (
                clock["active_color"] != timed_out_color
                or clock["generation"] != generation
            ):
                return
            now = round(time.time() * 1000)
            snapshot = cls._clock_snapshot_locked(match, now)
            if snapshot[f"{timed_out_color}_ms"] > 0:
                cls._schedule_clock_timeout_locked(match)
                return

            winner_color = "black" if timed_out_color == "white" else "white"
            is_insufficient_material = match["only_king"].get(winner_color, False)
            match["ended"] = True
            for player_id in match["players"]:
                cls.matches_by_client.pop(player_id, None)

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(match["group_name"], {
            "type": "live_ws_chess_event",
            "chess_event": json.dumps({
                "type": "game_over",
                "result": "draw" if is_insufficient_material else "win",
                "winner": None if is_insufficient_material else winner_color,
                "reason": (
                    "Draw by insufficient mating material"
                    if is_insufficient_material
                    else f"{timed_out_color.capitalize()} ran out of time"
                ),
                "server_time": now,
                "clock": snapshot,
            }),
        })
        with cls.matchmaking_lock:
            cls.matches.pop(match_id, None)

    @classmethod
    def _forfeit_disconnected_player(cls, match_id, client_id, generation):
        with cls.matchmaking_lock:
            match = cls.matches.get(match_id)
            player = match and match["players"].get(client_id)
            if (
                not match
                or match["ended"]
                or not player
                or player["connected"]
                or player["generation"] != generation
            ):
                return

            winner = next(
                details for other_id, details in match["players"].items()
                if other_id != client_id
            )
            match["ended"] = True
            if match.get("clock_timer"):
                match["clock_timer"].cancel()
            for player_id in match["players"]:
                cls.matches_by_client.pop(player_id, None)

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(match["group_name"], {
            "type": "live_ws_chess_event",
            "chess_event": json.dumps({
                "type": "game_over",
                "winner": winner["color"],
                "reason": "Opponent disconnected and did not reconnect in time",
                "server_time": round(time.time() * 1000),
            }),
        })
        with cls.matchmaking_lock:
            cls.matches.pop(match_id, None)

    def match_found(self, event):
        self.match_id = event["match_id"]
        self.match_group_name = event["match_group_name"]
        self.send(text_data=json.dumps({
            "type": "match_found",
            "color": event["color"],
            "server_time": event["server_time"],
            "date_start": event["date_start"],
            "clock": event["clock"],
        }))

    def connection_notice(self, event):
        if event["client_id"] == self.client_id:
            return
        self.send(text_data=json.dumps({
            "type": "opponent_connection",
            "connected": event["connected"],
            "grace_seconds": event["grace_seconds"],
        }))

    def live_ws_chess_event(self, event):
        self.send(text_data=json.dumps({
            "type": "live_ws",
            "chess_event": event["chess_event"],
        }))
