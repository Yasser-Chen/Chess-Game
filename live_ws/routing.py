from django.urls import re_path 
from . import consumers

websocket_urlpatterns = [
    re_path(
        r'ws/socket-server/(?P<game_time_seconds>\d+)/(?P<increment_seconds>\d+)/$',
        consumers.LiveWebSocketsConsumer.as_asgi()
    )
]