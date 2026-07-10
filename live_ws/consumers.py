import json
import time
from channels.generic.websocket import WebsocketConsumer
from asgiref.sync import async_to_sync


class LiveWebSocketsConsumer(WebsocketConsumer):
    def connect(self):
        route_kwargs = self.scope.get('url_route', {}).get('kwargs', {})
        game_time_seconds = route_kwargs.get('game_time_seconds')
        increment_seconds = route_kwargs.get('increment_seconds')

        try:
            game_time_seconds = int(game_time_seconds)
            increment_seconds = int(increment_seconds)
        except (TypeError, ValueError):
            self.close(code=4000)
            return

        self.room_group_name = f'online_chess_{game_time_seconds}_{increment_seconds}'

        async_to_sync(self.channel_layer.group_add)(
            self.room_group_name,
            self.channel_name
        )

        self.accept()
    

    def receive(self, text_data):
        text_data_json = json.loads(text_data)
        chess_event = text_data_json['chess_event']
        
        # Handle clock sync requests
        if isinstance(chess_event, str):
            event = json.loads(chess_event)
        else:
            event = chess_event
            
        event_type = event.get('type', '')
        
        if event_type == 'clock_sync_request':
            client_send_time = event.get('client_send_time', 0)
            server_time = round(time.time() * 1000)
            # Send back server time for clock sync calculation
            self.send(text_data=json.dumps({
                'type': 'clock_sync_response',
                'server_time': server_time,
                'client_send_time': client_send_time
            }))
            return

        server_time = round(time.time() * 1000)
        if event_type == 'sync':
            # Authoritatively schedule match start using the server clock.
            # This avoids both clients counting down to different local Date.now() values.
            event['server_time'] = server_time
            event['date_start'] = server_time + 2000
            chess_event = json.dumps(event)
        elif isinstance(event, dict):
            event.setdefault('server_time', server_time)
            chess_event = json.dumps(event)
        
        async_to_sync(self.channel_layer.group_send)(
            self.room_group_name,
            {
                'type':'live_ws_chess_event',
                'chess_event':chess_event
            }
        )

    def live_ws_chess_event(self, event):
        chess_event = event['chess_event']

        self.send(text_data=json.dumps({
            'type':'live_ws',
            'chess_event':chess_event
        }))