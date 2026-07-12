import json
import secrets
import threading
import time
import uuid

from asgiref.sync import async_to_sync
from channels.generic.websocket import WebsocketConsumer


class LiveWebSocketsConsumer(WebsocketConsumer):
    """Pair two waiting clients and assign their colors on the server."""

    waiting_channels = {}
    matched_channels = set()
    matchmaking_lock = threading.Lock()

    def connect(self):
        route_kwargs = self.scope.get("url_route", {}).get("kwargs", {})

        try:
            game_time_seconds = int(route_kwargs.get("game_time_seconds"))
            increment_seconds = int(route_kwargs.get("increment_seconds"))
        except (TypeError, ValueError):
            self.close(code=4000)
            return

        self.queue_name = f"online_chess_{game_time_seconds}_{increment_seconds}"
        self.match_group_name = None
        self.accept()

    def disconnect(self, close_code):
        with self.matchmaking_lock:
            if self.waiting_channels.get(self.queue_name) == self.channel_name:
                self.waiting_channels.pop(self.queue_name, None)
            self.matched_channels.discard(self.channel_name)

        if self.match_group_name:
            async_to_sync(self.channel_layer.group_discard)(
                self.match_group_name,
                self.channel_name,
            )

    def receive(self, text_data):
        try:
            payload = json.loads(text_data)
            chess_event = payload["chess_event"]
            event = json.loads(chess_event) if isinstance(chess_event, str) else chess_event
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            self.close(code=4001)
            return

        event_type = event.get("type", "")

        if event_type == "clock_sync_request":
            self.send(text_data=json.dumps({
                "type": "clock_sync_response",
                "server_time": round(time.time() * 1000),
                "client_send_time": event.get("client_send_time", 0),
            }))
            return

        if event_type == "sync":
            self._enter_matchmaking_queue()
            return

        # Game traffic is accepted only after this socket has been paired and
        # is broadcast solely to its match, not every game with the same clock.
        if not self.match_group_name:
            return

        event.setdefault("server_time", round(time.time() * 1000))
        async_to_sync(self.channel_layer.group_send)(
            self.match_group_name,
            {
                "type": "live_ws_chess_event",
                "chess_event": json.dumps(event),
            },
        )

    def _enter_matchmaking_queue(self):
        first_channel = None
        match_group_name = None

        with self.matchmaking_lock:
            if self.channel_name in self.matched_channels:
                return

            waiting_channel = self.waiting_channels.get(self.queue_name)
            if waiting_channel and waiting_channel != self.channel_name:
                first_channel = self.waiting_channels.pop(self.queue_name)
                match_group_name = f"chess_match_{uuid.uuid4().hex}"
                self.matched_channels.update((first_channel, self.channel_name))
            else:
                self.waiting_channels[self.queue_name] = self.channel_name

        if not first_channel:
            return

        channels = [first_channel, self.channel_name]
        white_index = secrets.randbelow(2)
        server_time = round(time.time() * 1000)
        date_start = server_time + 2000

        for index, channel_name in enumerate(channels):
            async_to_sync(self.channel_layer.group_add)(match_group_name, channel_name)
            async_to_sync(self.channel_layer.send)(
                channel_name,
                {
                    "type": "match_found",
                    "match_group_name": match_group_name,
                    "color": "white" if index == white_index else "black",
                    "server_time": server_time,
                    "date_start": date_start,
                },
            )

    def match_found(self, event):
        self.match_group_name = event["match_group_name"]
        self.send(text_data=json.dumps({
            "type": "match_found",
            "color": event["color"],
            "server_time": event["server_time"],
            "date_start": event["date_start"],
        }))

    def live_ws_chess_event(self, event):
        self.send(text_data=json.dumps({
            "type": "live_ws",
            "chess_event": event["chess_event"],
        }))
