"""
Continuous Clock Synchronization Module

Implements NTP-like clock synchronization between server and clients.
Key concepts:
- Client measures offset = (server_time - client_timestamp_received) - (client_timestamp_sent - client_time_now)
  Simplified: offset = server_time - client_time (when round-trip time is small)
- Client uses estimated_server_time = client_time + offset
- Periodic resynchronization with gradual smoothing to avoid jumps
"""

import time
import collections


class ClockOffsetTracker:
    """Tracks clock offset between client and server using timestamp exchanges."""
    
    def __init__(self, smoothing_factor=0.1, history_size=10):
        """
        Args:
            smoothing_factor: How much to trust new measurements (0-1).
                Lower = more smoothing, slower to adapt but smoother.
            history_size: Number of recent measurements to keep for statistics.
        """
        self.smoothing_factor = smoothing_factor
        self.history_size = history_size
        
        # Current estimated offset: client should add this to client time to get server time
        self.offset = 0.0
        self.smoothed_offset = 0.0
        
        # Round-trip time estimate
        self.round_trip_time = 0.0
        
        # History of offset measurements for statistics
        self.offset_history = collections.deque(maxlen=history_size)
        self.last_sync_time = 0  # client time of last sync
        self.sync_interval = 2.0  # target sync interval in seconds
        
    def measure_offset(self, client_send_time, server_receive_time, server_send_time):
        """
        Measure clock offset using a timestamp exchange.
        
        Args:
            client_send_time: Client's timestamp when sending request (ms)
            server_receive_time: Server's timestamp when receiving request (ms)
            server_send_time: Server's timestamp when sending response (ms)
            
        Returns:
            dict with offset, rtt, and server_time estimates
        """
        # Round trip time
        rtt = time.time() * 1000 - client_send_time  # Will be set by caller
        
        # Estimated offset: how much client time needs to be adjusted to get server time
        # offset = ((server_receive_time - client_send_time) + (server_send_time - client_receive_time)) / 2
        # Simplified for our case:
        # delay = (rtt) / 2
        # offset = server_receive_time - client_send_time - delay
        
        # For our 2-way sync:
        # T1 = client send time
        # T2 = server receive time  
        # T3 = server send time
        # T4 = client receive time (current time)
        # offset = ((T2 - T1) + (T3 - T4)) / 2
        # server_time = client_time + offset
        
        current_client_time = time.time() * 1000
        t1 = client_send_time
        t2 = server_receive_time
        t3 = server_send_time
        t4 = current_client_time
        
        # Calculate offset assuming symmetric delay
        offset = ((t2 - t1) + (t3 - t4)) / 2
        rtt = t4 - t1
        
        # Store in history
        self.offset_history.append(offset)
        
        # Smooth the offset
        if self.smoothed_offset == 0:
            self.smoothed_offset = offset
        else:
            # Exponential moving average
            self.smoothed_offset = self.smoothing_factor * offset + (1 - self.smoothing_factor) * self.smoothed_offset
            
        self.offset = offset
        self.round_trip_time = rtt
        self.last_sync_time = current_client_time
        
        return {
            'offset': self.smoothed_offset,
            'rtt': rtt,
            'server_time': server_send_time,
            'estimated_server_time': self.get_estimated_server_time()
        }
    
    def get_estimated_server_time(self, client_time=None):
        """
        Get estimated server time based on client time and offset.
        
        Args:
            client_time: Client timestamp in milliseconds. If None, uses current time.
            
        Returns:
            Estimated server time in milliseconds
        """
        if client_time is None:
            client_time = time.time() * 1000
        return client_time + self.smoothed_offset
    
    def get_server_time(self):
        """Get current estimated server time."""
        return self.get_estimated_server_time()
    
    def should_sync(self):
        """Check if it's time for another sync."""
        if self.last_sync_time == 0:
            return True
        return (time.time() * 1000 - self.last_sync_time) >= (self.sync_interval * 1000)
    
    def get_stats(self):
        """Get synchronization statistics."""
        if not self.offset_history:
            return {
                'offset': 0,
                'rtt': 0,
                'offset_std': 0,
                'sample_count': 0
            }
        
        offsets = list(self.offset_history)
        import statistics
        return {
            'offset': self.smoothed_offset,
            'rtt': self.round_trip_time,
            'offset_mean': statistics.mean(offsets),
            'offset_std': statistics.stdev(offsets) if len(offsets) > 1 else 0,
            'sample_count': len(offsets)
        }


class ServerClock:
    """Server-side clock management."""
    
    @staticmethod
    def get_current_time_ms():
        """Get current server time in milliseconds."""
        return int(time.time() * 1000)
    
    @staticmethod
    def format_timer(server_time_ms):
        """
        Format server time as a remaining time string (MM:SS).
        Used to tell clients what the current server time is relative to game start.
        """
        return server_time_ms