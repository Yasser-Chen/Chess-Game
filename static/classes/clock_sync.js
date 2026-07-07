/**
 * Continuous Clock Synchronization Module
 * 
 * Implements NTP-like clock synchronization between server and clients.
 * Ensures both players use server time for game timers, compensating for:
 * - Clock drift (periodic resync)
 * - Network delays (RTT compensation)
 * - System clock adjustments (smoothing)
 * 
 * Usage:
 *   1. Include this script before menu.js
 *   2. Call window.startClockSync() when game starts
 *   3. Call window.stopClockSync() when game ends
 *   4. Use window.estimatedServerTime() instead of Date.now() for game logic
 */

(function() {
  'use strict';

  // Configuration
  const DEFAULT_SMOOTHING_FACTOR = 0.15;  // Exponential moving average factor
  const SYNC_INTERVAL_MS = 5000;          // Sync every 5 seconds

  // State
  let SERVER_TIME_OFFSET = 0;
  let OFFSET_SMOOTHING = DEFAULT_SMOOTHING_FACTOR;
  let clockSyncInterval = null;
  let _clockSyncRequestTime = 0;
  let lastSyncOffset = 0;
  let lastSyncRTT = 0;
  let lastSyncTime = 0;

  /**
   * Get estimated server time in milliseconds
   * @returns {number} Estimated server time
   */
  function estimatedServerTime() {
    return Date.now() + SERVER_TIME_OFFSET;
  }

  /**
   * Get estimated server time in seconds
   * @returns {number} Estimated server time in seconds
   */
  function estimatedServerTimeSec() {
    return (Date.now() + SERVER_TIME_OFFSET) / 1000;
  }

  /**
   * Set/adjust the clock offset with smoothing to prevent jumps
   * @param {number} newOffset - New offset value in milliseconds
   */
  function setServerTimeOffset(newOffset) {
    if (SERVER_TIME_OFFSET === 0) {
      // First sync - use the value directly
      SERVER_TIME_OFFSET = newOffset;
    } else {
      // Gradual adjustment using exponential moving average
      SERVER_TIME_OFFSET = 
        SERVER_TIME_OFFSET * (1 - OFFSET_SMOOTHING) + 
        newOffset * OFFSET_SMOOTHING;
    }
    lastSyncOffset = SERVER_TIME_OFFSET;
  }

  /**
   * Measure clock offset using NTP-like 4-way timestamp exchange
   * 
   * T1 = client send time
   * T2 = server receive time (from server)
   * T3 = server send time (from server)
   * T4 = client receive time (current)
   * 
   * offset = ((T2 - T1) + (T3 - T4)) / 2
   * rtt = T4 - T1
   * 
   * @param {number} t1 - Client send time
   * @param {number} t2 - Server receive time
   * @param {number} t3 - Server send time
   * @returns {{offset: number, rtt: number}}
   */
  function measureClockOffset(t1, t2, t3) {
    const t4 = Date.now();
    const offset = ((t2 - t1) + (t3 - t4)) / 2;
    const rtt = t4 - t1;
    return { offset: offset, rtt: rtt };
  }

  /**
   * Handle incoming clock sync response from server
   * @param {number} serverTime - Server timestamp from response
   */
  function handleClockSyncResponse(serverTime, clientSendTime) {
    const t1 = clientSendTime || _clockSyncRequestTime;
    const t2 = serverTime;
    const t3 = serverTime;
    
    if (t1 > 0 && Number.isFinite(t2)) {
      const result = measureClockOffset(t1, t2, t3);
      setServerTimeOffset(result.offset);
      lastSyncRTT = result.rtt;
      lastSyncTime = Date.now();
      console.log('[ClockSync] Offset:', result.offset.toFixed(2), 'ms, RTT:', result.rtt.toFixed(2), 'ms');
    }
    
    _clockSyncRequestTime = 0;
  }

  /**
   * Perform a clock synchronization round-trip via WebSocket
   * @param {WebSocket} socket - Active WebSocket connection
   */
  function doClockSync(socket) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const t1 = Date.now();
    _clockSyncRequestTime = t1;
    socket.send(JSON.stringify({
      chess_event: JSON.stringify({
        type: 'clock_sync_request',
        client_send_time: t1
      })
    }));
  }

  /**
   * Start periodic clock synchronization
   * @param {WebSocket} socket - Active WebSocket connection
   */
  function startClockSync(socket) {
    stopClockSync(); // Stop any existing interval
    
    clockSyncInterval = setInterval(function() {
      doClockSync(socket);
    }, SYNC_INTERVAL_MS);
  }

  /**
   * Stop periodic clock synchronization
   */
  function stopClockSync() {
    if (clockSyncInterval) {
      clearInterval(clockSyncInterval);
      clockSyncInterval = null;
    }
  }

  /**
   * Get sync statistics for debugging
   * @returns {{offset: number, rtt: number, lastSyncTime: number}}
   */
  function getSyncStats() {
    return {
      offset: SERVER_TIME_OFFSET,
      rtt: lastSyncRTT,
      lastSyncTime: lastSyncTime
    };
  }

  /**
   * Set custom smoothing factor
   * @param {number} factor - Smoothing factor (0-1), lower = smoother
   */
  function setSmoothingFactor(factor) {
    OFFSET_SMOOTHING = Math.max(0, Math.min(1, factor));
  }

  // Expose public API
  window.ClockSync = {
    estimatedServerTime: estimatedServerTime,
    estimatedServerTimeSec: estimatedServerTimeSec,
    setServerTimeOffset: setServerTimeOffset,
    measureClockOffset: measureClockOffset,
    handleClockSyncResponse: handleClockSyncResponse,
    doClockSync: doClockSync,
    startClockSync: startClockSync,
    stopClockSync: stopClockSync,
    getSyncStats: getSyncStats,
    setSmoothingFactor: setSmoothingFactor
  };

  // Also expose as global functions for backward compatibility
  window.estimatedServerTime = estimatedServerTime;
  window.estimatedServerTimeSec = estimatedServerTimeSec;
  window.setServerTimeOffset = setServerTimeOffset;
  window.measureClockOffset = measureClockOffset;
  window.startClockSync = function() { return startClockSync(window.gameSocket); };
  window.stopClockSync = stopClockSync;

})();