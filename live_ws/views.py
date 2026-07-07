from django.shortcuts import render
import uuid
import time

# Create your views here.

def lobby(request):
    server_time = round(time.time() * 1000)
    return render(request, 'game/index.html', {
        'MY_USER_ID': str(uuid.uuid4()),
        'server_time': server_time,
    })
