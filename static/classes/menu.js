// Defensive startup cleanup for a runtime reloaded into the same tab. A normal
// navigation gets a new Window, but development reloaders or duplicate bundle
// injection can leave an old board, timers, and socket reachable. Only this
// tab's globals are touched; other pages have separate Window objects.
(function cleanupPreviousChessRuntime() {
  const previousBoard = window.board;
  if (previousBoard && typeof previousBoard.resetGame == "function") {
    previousBoard.resetGame();
  }
  if (typeof window.stopClockSync == "function") {
    window.stopClockSync();
  }
  const previousSocket = window.gameSocket;
  if (previousSocket && typeof previousSocket.close == "function") {
    try {
      previousSocket.close();
    } catch (e) {
      // The old socket may already be closing.
    }
  }
  window.board = null;
  window.gameSocket = null;
})();

window.chessAppReady = false;

window.markChessAppReady = function () {
  const requiredGlobals = [
    "Board",
    "Move",
    "Pawn",
    "King",
    "Queen",
    "Bishop",
    "Rook",
    "Knight",
    "initHtmlBoard",
  ];
  const missingGlobals = requiredGlobals.filter(function (name) {
    return typeof window[name] == "undefined";
  });

  if (missingGlobals.length) {
    window.chessAppReady = false;
    $("#app_loading_panel .spinner-border").css("display", "none");
    $("#app_loading_message").text(
      "The chess game could not finish loading. Please refresh and try again."
    );
    return false;
  }

  window.chessAppReady = true;
  $("#app_loading_panel").css("display", "none");
  $("#main_pannnel").css("display", "block");
  $("#startGameBtn")
    .prop("disabled", false)
    .attr("aria-disabled", "false");
  if (typeof window.resumeOnlineConnectionOnLoad == "function") {
    window.resumeOnlineConnectionOnLoad();
  }
  return true;
};

var gameStartInProgress = false;

// Global function to reset game and immediately start a new game with same settings
window.resetGameAndStartNew = function () {
  clearPersistedOnlineSession();
  // Clean up existing game
  if (window.board && typeof window.board.resetGame == "function") {
    window.board.resetGame();
  }

  // Clean up WebSocket and prevent its close event from reconnecting.
  if (onlineConnection) onlineConnection.active = false;
  closeActiveGameSocket();

  // Stop clock sync
  if (typeof window.stopClockSync == "function") {
    window.stopClockSync();
  }

  // Reset game state
  window.gameState = "notPlaying";
  window.isGameOnline = false;
  window.isGameVsBot = false;
  window.BotPlaying = false;
  window.humainIsUpgrading = false;
  window.lastPawnMoved = null;
  window.lastUpgradedPiece = false;
  window.pendingGameOver = null;
  window.normalMovesCounter = 0;

  // Clear searching loop
  if (searchingLoop) {
    clearInterval(searchingLoop);
    searchingLoop = -1;
  }

  // Hide results panel completely and remove it
  $(".overlay").css("display", "flex");
  $("#results_pannnel").remove();

  // Show main panel, hide loading
  $("#main_pannnel").css("display", "block");
  $("#loadding_pannnel").css("display", "none");

  // Reset timer displays
  $("#WhiteTimer").text("05:00");
  $("#BlackTimer").text("05:00");

  // Clean up board - only remove piece elements (i tags), keep the table grid structure
  $("#board i").remove();
  window.board = null;

  // Immediately start a new game using the current color preference. Choosing
  // Random rolls again for every local or bot game.
  const playAs = resolveSelectedPlayerColor();
  const mode = $('input[name="mode_of_play"]:checked').val();
  if (mode == "vs_bot" && typeof window.setSelectedBotType == "function") {
    window.setSelectedBotType($("#botTypeSelect").val());
  }

  // Set mode-specific state before creating the game
  if (mode == "vs_bot") {
    window.isGameVsBot = true;
  } else if (mode == "online") {
    // Online PvP needs a fresh socket + matchmaking handshake, so restart by
    // launching the existing online matchmaking flow instead of only resetting
    // the local board.
    window.isGameOnline = false;
    $("#main_pannnel").css("display", "none");
    $("#loadding_pannnel").css("display", "flex");
    $("#loading_chess_event").html("Looking for a match");

    setTimeout(function () {
      initGame();
    }, 0);
    return;
  }

  // Create new game directly with the same settings
  window.board = new Board($("#board"), playAs);
  initHtmlBoard(board, playAs == "black");

  for (let i = 1; i <= 8; i++) {
    board.add(new Pawn(2, i, "black"));
    board.add(new Pawn(7, i, "white"));
  }

  board.add(new King(8, 5, "white"));
  board.add(new King(1, 5, "black"));

  board.add(new Queen(8, 4, "white"));
  board.add(new Queen(1, 4, "black"));

  board.add(new Bishop(8, 6, "white"));
  board.add(new Bishop(8, 3, "white"));
  board.add(new Bishop(1, 3, "black"));
  board.add(new Bishop(1, 6, "black"));

  board.add(new Rook(8, 8, "white"));
  board.add(new Rook(8, 1, "white"));
  board.add(new Rook(1, 8, "black"));
  board.add(new Rook(1, 1, "black"));

  board.add(new Knight(8, 2, "white"));
  board.add(new Knight(8, 7, "white"));
  board.add(new Knight(1, 7, "black"));
  board.add(new Knight(1, 2, "black"));

  board.resetAttacks();
  board.recordCurrentPosition({ resetHistory: true });

  if (mode == "vs_bot") {
    window.isGameVsBot = true;
  }
  $(".overlay").css("display", "none");

  board.playAs = playAs;
  window.playAs = playAs;
  board.updateDraggables(true);
  if (typeof board.updateGameActionControls == "function") {
    board.updateGameActionControls();
  }
  startBotTurnIfNeeded(board);
};

// Global function to reset game and show hub
window.resetGameAndShowHub = function () {
  clearPersistedOnlineSession();
  // Clean up existing game
  if (window.board && typeof window.board.resetGame == "function") {
    window.board.resetGame();
  }

  // Clean up WebSocket and prevent its close event from reconnecting.
  if (onlineConnection) onlineConnection.active = false;
  closeActiveGameSocket();

  // Stop clock sync
  if (typeof window.stopClockSync == "function") {
    window.stopClockSync();
  }

  // Reset game state
  window.gameState = "notPlaying";
  window.isGameOnline = false;
  window.isGameVsBot = false;
  window.BotPlaying = false;
  window.humainIsUpgrading = false;
  window.lastPawnMoved = null;
  window.lastUpgradedPiece = false;
  window.playAs = null;
  window.pendingGameOver = null;
  window.normalMovesCounter = 0;

  // Clear searching loop
  if (searchingLoop) {
    clearInterval(searchingLoop);
    searchingLoop = -1;
  }

  // Hide results panel completely and remove it
  $(".overlay").css("display", "flex");
  $("#results_pannnel").remove();

  // Show main panel, hide loading
  $("#main_pannnel").css("display", "block");
  $("#loadding_pannnel").css("display", "none");

  // Reset timer displays
  $("#WhiteTimer").text("05:00");
  $("#BlackTimer").text("05:00");

  // Clean up board - only remove piece elements (i tags), keep the table grid structure
  $("#board i").remove();
  window.board = null;
};

$("html").droppable({
  drop: function (event, ui) {
    event.preventDefault();
    $(ui.draggable).css({
      top: "0px",
      left: "0px",
    });
    if (window.gameState != "playing" && window.board && typeof window.board.disableDraggables == "function") {
      window.board.disableDraggables($("i"));
    }
  },
});

let searchingLoop = -1;
let reconnectTimer = null;
let reconnectStartedAt = 0;
let reconnectAttempts = 0;
let lastServerEventSeq = 0;
let lastPongAt = 0;
let socketClosedIntentionally = false;
let onlineConnection = null;

function getOnlineClientId() {
  const storageKey = "chess-online-client-id";
  try {
    let clientId = window.sessionStorage.getItem(storageKey);
    if (!clientId) {
      clientId = window.crypto && typeof window.crypto.randomUUID == "function"
        ? window.crypto.randomUUID().replace(/-/g, "")
        : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem(storageKey, clientId);
    }
    return clientId;
  } catch (e) {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  }
}

const onlineClientId = getOnlineClientId();
const onlineSessionStorageKey = "chess-online-active-session";

function readPersistedOnlineSession() {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(onlineSessionStorageKey));
    if (!value || !Number.isFinite(value.gameTimeSeconds) || !Number.isFinite(value.incrementSeconds)) return null;
    return value;
  } catch (e) {
    return null;
  }
}

function persistOnlineSession(phase) {
  if (!onlineConnection) return;
  const value = {
    phase: phase,
    gameTimeSeconds: onlineConnection.gameTimeSeconds,
    incrementSeconds: onlineConnection.incrementSeconds,
  };
  try {
    window.sessionStorage.setItem(onlineSessionStorageKey, JSON.stringify(value));
  } catch (e) {
    // Recovery remains available for transient disconnects in this page.
  }
}

function clearPersistedOnlineSession() {
  try {
    window.sessionStorage.removeItem(onlineSessionStorageKey);
  } catch (e) {
    // Ignore unavailable session storage.
  }
}

function applyServerClock(clock) {
  if (!clock || !window.board) return;
  const whiteMs = Number(clock.white_ms);
  const blackMs = Number(clock.black_ms);
  if (!Number.isFinite(whiteMs) || !Number.isFinite(blackMs)) return;

  const serverNow = window.estimatedServerTime ? window.estimatedServerTime() : Date.now();
  const ticksFrom = Number(clock.ticks_from || clock.server_time || serverNow);
  const elapsed = Math.max(0, serverNow - ticksFrom);
  const adjustedWhite = clock.active_color == "white" ? Math.max(0, whiteMs - elapsed) : whiteMs;
  const adjustedBlack = clock.active_color == "black" ? Math.max(0, blackMs - elapsed) : blackMs;
  board.timerWhite.pause();
  board.timerBlack.pause();
  board.timerWhite.setRemainingMs(adjustedWhite);
  board.timerBlack.setRemainingMs(adjustedBlack);
  if (ticksFrom > serverNow) {
    const currentBoard = board;
    setTimeout(function () {
      if (window.board === currentBoard && window.gameState == "playing") {
        applyServerClock(clock);
      }
    }, ticksFrom - serverNow);
    return;
  }
  if (window.gameState == "playing") {
    if (clock.active_color == "white") board.timerWhite.resume();
    else board.timerBlack.resume();
  }
}

window.resumeOnlineConnectionOnLoad = function () {
  if (window.STATIC_EXPORT || onlineConnection) return false;
  const saved = readPersistedOnlineSession();
  if (!saved) return false;

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${window.location.host}/ws/socket-server/${saved.gameTimeSeconds}/${saved.incrementSeconds}/`;
  $("#playerTimeInput").val(saved.gameTimeSeconds);
  $("#playerIncrementInput").val(saved.incrementSeconds);
  $('input[name="mode_of_play"][value="online"]').prop("checked", true);
  updatePlayerColorOptions();
  window.timeSetted = saved.gameTimeSeconds;
  window.increment = saved.incrementSeconds;
  syncDone = saved.phase == "game";
  gameStartInProgress = true;
  onlineConnection = {
    url: url,
    active: true,
    resumeOnly: saved.phase == "game",
    gameTimeSeconds: saved.gameTimeSeconds,
    incrementSeconds: saved.incrementSeconds,
  };
  $("#app_loading_panel").css("display", "none");
  showOwnReconnectState();
  openOnlineSocket();
  return true;
};

function setMatchmakingCancelEnabled(enabled) {
  const cancelButton = $("#cancelMatchmakingBtn");
  if (!cancelButton.length) return;

  cancelButton
    .prop("disabled", !enabled)
    .toggleClass("disabled", !enabled)
    .attr("aria-disabled", enabled ? "false" : "true");
}

function closeActiveGameSocket() {
  socketClosedIntentionally = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (searchingLoop) {
    clearInterval(searchingLoop);
    searchingLoop = -1;
  }
  if (!window.gameSocket) return;

  try {
    window.gameSocket.close();
  } catch (e) {
    // Ignore WebSocket close errors during user cancellation/reset.
  }
  window.gameSocket = null;
}

function sendSocketEvent(event) {
  if (!window.gameSocket || window.gameSocket.readyState !== WebSocket.OPEN) return false;
  window.gameSocket.send(JSON.stringify({ chess_event: JSON.stringify(event) }));
  return true;
}

function setConnectionBanner(message, kind) {
  const banner = $("#connectionStatusBanner");
  if (!banner.length) return;
  banner
    .text(message || "")
    .attr("data-kind", kind || "info")
    .toggleClass("visible", !!message);
}

function startSocketHeartbeat() {
  if (searchingLoop) clearInterval(searchingLoop);
  lastPongAt = Date.now();
  searchingLoop = setInterval(function () {
    if (!window.gameSocket || window.gameSocket.readyState !== WebSocket.OPEN) return;
    // Background tabs can throttle timers heavily, so tolerate delayed pongs
    // while still generating regular traffic when the tab is active.
    if (Date.now() - lastPongAt > 90000) {
      window.gameSocket.close(4003, "Heartbeat timeout");
      return;
    }
    sendSocketEvent({ type: "ping", client_time: Date.now() });
  }, 15000);
}

function showOwnReconnectState() {
  $(".overlay").css("display", "flex");
  $("#main_pannnel").css("display", "none");
  $("#loadding_pannnel").css("display", "flex");
  $("#loading_chess_event").text("Reconnecting…");
  $("#cancelMatchmakingBtn").css("display", syncDone ? "none" : "inline-block");
}

function restoreConnectedView() {
  setConnectionBanner("", "info");
  if (window.board && window.gameState == "playing") {
    $(".overlay").css("display", "none");
  }
  $("#cancelMatchmakingBtn").css("display", "inline-block");
}

function scheduleSocketReconnect() {
  if (!onlineConnection || !onlineConnection.active || socketClosedIntentionally) return;
  if (!reconnectStartedAt) reconnectStartedAt = Date.now();
  if (Date.now() - reconnectStartedAt >= 28000) {
    onlineConnection.active = false;
    gameStartInProgress = false;
    if (window.gameState == "playing") {
      window.resetGameAndShowHub();
      setConnectionBanner("Connection lost. The game could not be recovered.", "error");
    } else {
      $("#loadding_pannnel").css("display", "none");
      $("#main_pannnel").css("display", "block");
      setConnectionBanner("Connection lost. Please start matchmaking again.", "error");
    }
    return;
  }

  showOwnReconnectState();
  const delay = Math.min(500 * Math.pow(2, reconnectAttempts++), 4000);
  reconnectTimer = setTimeout(openOnlineSocket, delay);
}

function processOnlineGameEvent(data, replaying) {
  const serverSequence = Number(data._server_seq) || 0;
  if (serverSequence) {
    // WebSockets are ordered, but reconnect replay and a replacement socket
    // can overlap. Never apply the same authoritative event twice.
    if (serverSequence <= lastServerEventSeq) return;
    lastServerEventSeq = serverSequence;
  }
  const isOwnEcho = data._sender_id == onlineClientId && !replaying;

  if (data.type === "draw_offer") {
    if (window.board && typeof window.board.receiveDrawOffer == "function") {
      window.board.receiveDrawOffer(data);
    }
    applyServerClock(data.clock);
    return;
  }
  if (data.type === "draw_declined") {
    if (window.board && typeof window.board.receiveDrawDeclined == "function") {
      window.board.receiveDrawDeclined(data);
    }
    applyServerClock(data.clock);
    return;
  }
  if (data.type === "game_over") {
    if (onlineConnection) onlineConnection.active = false;
    clearPersistedOnlineSession();
    setConnectionBanner("", "info");
    if (window.board && typeof window.board.applyGameOver == "function") {
      window.board.applyGameOver(data);
    } else {
      window.gameState = "notPlaying";
      window.pendingGameOver = data;
    }
    return;
  }
  if (window.gameState != "playing" || isOwnEcho) {
    applyServerClock(data.clock);
    return;
  }
  if (data.type == "upgrade") {
    window.lastUpgradedPiece = data.piece;
  }
  if (data.type == "upgrade" || (data.type != "sync" && data.type != "match_found")) {
    if (makeMove(board, data.x, data.y, data.newX, data.newY, { animate: !replaying, remote: true }) && board && typeof board.tryExecutePremoveStack == "function") {
      board.tryExecutePremoveStack();
    }
  }
  applyServerClock(data.clock);
}

function handleOnlineSocketMessage(e) {
  let rawData;
  let data;
  try {
    rawData = JSON.parse(e.data);
    data = rawData.chess_event ? JSON.parse(rawData.chess_event) : rawData;
  } catch (error) {
    return;
  }

  if (data.type === "pong") {
    lastPongAt = Date.now();
    reconnectStartedAt = 0;
    return;
  }
  if (data.type === "clock_sync_response") {
    lastPongAt = Date.now();
    if (window.ClockSync) {
      window.ClockSync.handleClockSyncResponse(data.server_time, data.client_send_time);
    }
    return;
  }
  if (data.type === "opponent_connection") {
    setConnectionBanner(
      data.connected ? "Opponent reconnected." : `Opponent disconnected. Waiting up to ${data.grace_seconds} seconds…`,
      data.connected ? "success" : "warning"
    );
    if (data.connected) setTimeout(function () { setConnectionBanner("", "info"); }, 2500);
    return;
  }
  if (data.type === "resume_unavailable") {
    clearPersistedOnlineSession();
    if (onlineConnection) onlineConnection.active = false;
    closeActiveGameSocket();
    syncDone = false;
    gameStartInProgress = false;
    $("#loadding_pannnel").css("display", "none");
    $("#main_pannnel").css("display", "block");
    setConnectionBanner("The previous online game has ended.", "info");
    return;
  }
  if (data.type === "match_resumed") {
    syncDone = true;
    reconnectStartedAt = 0;
    // Rebuild from the server's complete checkpoint. This also repairs the
    // narrow case where a move changed the local board while socket.send()
    // raced a disconnect and the server never received it.
    createNewGame(data.color, { preserveOnlineConnection: true });
    window.playAs = data.color;
    lastServerEventSeq = 0;
    (data.history || data.missed_events || []).forEach(function (event) {
      processOnlineGameEvent(event, true);
    });
    lastServerEventSeq = Math.max(lastServerEventSeq, data.last_event_seq || 0);
    applyServerClock(data.clock);
    if (onlineConnection) onlineConnection.resumeOnly = true;
    persistOnlineSession("game");
    restoreConnectedView();
    window.startClockSync();
    return;
  }
  if (!syncDone && data.type == "match_found") {
    syncDone = true;
    reconnectStartedAt = 0;
    const t1 = Date.now();
    const t2 = data.server_time || data.date_start;
    if (t1 > 0 && t2 > 0) window.setServerTimeOffset(t2 - t1);
    const nowServerTime = window.estimatedServerTime ? window.estimatedServerTime() : Date.now();
    const diffTime = Math.max(0, data.date_start - nowServerTime);
    $("#loading_chess_event").html("Match Found");
    setMatchmakingCancelEnabled(false);
    if (onlineConnection) onlineConnection.resumeOnly = true;
    persistOnlineSession("game");
    const connectionAtMatch = onlineConnection;
    setTimeout(function () {
      if (
        onlineConnection !== connectionAtMatch ||
        !onlineConnection ||
        !onlineConnection.active ||
        (window.board && window.gameState == "playing")
      ) {
        return;
      }
      createNewGame(data.color);
      window.playAs = data.color;
      applyServerClock(data.clock);
      restoreConnectedView();
      if (window.isGameOnline && window.gameState == "playing") window.startClockSync();
    }, diffTime);
    return;
  }
  processOnlineGameEvent(data, false);
}

function openOnlineSocket() {
  if (!onlineConnection || !onlineConnection.active) return;
  const socket = new WebSocket(onlineConnection.url);
  window.gameSocket = socket;
  socketClosedIntentionally = false;

  socket.onopen = function () {
    if (window.gameSocket !== socket) return;
    reconnectAttempts = 0;
    lastPongAt = Date.now();
    sendSocketEvent({
      type: "sync",
      client_id: onlineClientId,
      last_event_seq: lastServerEventSeq,
      resume_only: !!onlineConnection.resumeOnly,
    });
    startSocketHeartbeat();
  };
  socket.onmessage = function (event) {
    // A close and replacement can happen before the old socket's queued
    // messages drain. Only the currently-owned socket may mutate this game.
    if (window.gameSocket !== socket) return;
    handleOnlineSocketMessage(event);
  };
  socket.onerror = function () {
    // onclose owns retry scheduling so each failure creates only one retry.
  };
  socket.onclose = function () {
    if (window.gameSocket !== socket) return;
    window.gameSocket = null;
    if (searchingLoop) {
      clearInterval(searchingLoop);
      searchingLoop = -1;
    }
    if (typeof window.stopClockSync == "function") window.stopClockSync();
    scheduleSocketReconnect();
  };
}

function updateBotOptionsVisibility() {
  const isVsBot = $('input[name="mode_of_play"]:checked').val() == "vs_bot";
  $("#botOptionsPanel").toggle(isVsBot);
}

function updatePlayerColorOptions() {
  const isOnline = $('input[name="mode_of_play"]:checked').val() == "online";
  const colorInputs = $('input[name="player_color"]');
  const colorLabels = $("#playerColorOptions label");

  $("#playerColorOptions").toggleClass("online-color-locked", isOnline);
  colorInputs.prop("disabled", isOnline);
  colorLabels
    .toggleClass("disabled", isOnline)
    .removeClass("color-choice-forced")
    .attr("aria-disabled", isOnline ? "true" : "false");

  if (isOnline) {
    colorInputs.prop("checked", false);
    colorLabels.removeClass("active");
    const randomInput = $('input[name="player_color"][value="random"]');
    randomInput.prop("checked", true);
    randomInput.closest("label").addClass("active color-choice-forced");
  }
}

$("#playerColorOptions").on("click", ".btn", function (event) {
  if (!$("#playerColorOptions").hasClass("online-color-locked")) return;

  // Stop Bootstrap's button-toggle handler from clearing the forced Random
  // selection when a disabled online color button is clicked.
  event.preventDefault();
  event.stopPropagation();
});

function resolveSelectedPlayerColor() {
  const selected = $('input[name="player_color"]:checked').val();
  if (selected == "white" || selected == "black") return selected;
  return Math.random() < 0.5 ? "white" : "black";
}

window.resolveSelectedPlayerColor = resolveSelectedPlayerColor;

function startBotTurnIfNeeded(gameBoard) {
  if (!window.isGameVsBot || !gameBoard || gameBoard.turn == gameBoard.playAs) return;

  setTimeout(function () {
    if (window.board === gameBoard && window.gameState == "playing") {
      botMove(gameBoard, gameBoard.turn);
    }
  }, 0);
}

$(document).on("change", 'input[name="mode_of_play"]', function () {
  updateBotOptionsVisibility();
  updatePlayerColorOptions();
});

$(document).on("change", "#botTypeSelect", function () {
  if (typeof window.setSelectedBotType == "function") {
    window.setSelectedBotType($(this).val());
  } else {
    window.selectedBotType = $(this).val() || "weak";
  }
});

$(function () {
  updateBotOptionsVisibility();
  updatePlayerColorOptions();
  if (typeof window.setSelectedBotType == "function") {
    window.setSelectedBotType($("#botTypeSelect").val());
  } else {
    window.selectedBotType = $("#botTypeSelect").val() || "weak";
  }
});

function cancelOnlineMatchmaking() {
  if (syncDone) {
    return;
  }

  if (searchingLoop) {
    clearInterval(searchingLoop);
    searchingLoop = -1;
  }

  syncDone = false;
  gameStartInProgress = false;
  clearPersistedOnlineSession();
  if (onlineConnection) onlineConnection.active = false;
  closeActiveGameSocket();
  setMatchmakingCancelEnabled(true);
  $("#loading_chess_event").html("Looking for a match");
  $("#loadding_pannnel").css({ display: "none" });
  $("#main_pannnel").css({ display: "block" });
}

window.cancelOnlineMatchmaking = cancelOnlineMatchmaking;

var createNewGame = (playAs, options) => {
  options = options || {};
  // Store the last playAs for restart functionality
  window._lastPlayAs = playAs || window.playAs;
  window.isGameVsBot = false;
  window.isGameOnline = false;
  window.BotPlaying = false;
  window.humainIsUpgrading = false;
  window.lastPawnMoved = null;
  window.lastUpgradedPiece = false;
  window.pendingGameOver = null;
  if ($('input[name="mode_of_play"]:checked').val() == "vs_bot") {
    if (typeof window.setSelectedBotType == "function") {
      window.setSelectedBotType($("#botTypeSelect").val());
    } else {
      window.selectedBotType = $("#botTypeSelect").val() || "weak";
    }
  }

  // If a board already exists, reset it first
  if (window.board) {
    if (typeof window.board.resetGame == "function") {
      window.board.resetGame({
        preserveOnlineConnection: options.preserveOnlineConnection === true,
      });
    }
    window.board = null;
  }

  // Remove any leftover piece elements from the board before creating new game
  $("#board i").remove();

  // Reset timer displays before creating new board
  $("#WhiteTimer").text("05:00");
  $("#BlackTimer").text("05:00");

  window.board = new Board($("#board"), playAs);

  initHtmlBoard(board, playAs == "black");

  for (let i = 1; i <= 8; i++) {
    board.add(new Pawn(2, i, "black"));
    board.add(new Pawn(7, i, "white"));
  }

  board.add(new King(8, 5, "white"));
  board.add(new King(1, 5, "black"));

  board.add(new Queen(8, 4, "white"));
  board.add(new Queen(1, 4, "black"));

  board.add(new Bishop(8, 6, "white"));
  board.add(new Bishop(8, 3, "white"));
  board.add(new Bishop(1, 3, "black"));
  board.add(new Bishop(1, 6, "black"));

  board.add(new Rook(8, 8, "white"));
  board.add(new Rook(8, 1, "white"));
  board.add(new Rook(1, 8, "black"));
  board.add(new Rook(1, 1, "black"));

  board.add(new Knight(8, 2, "white"));
  board.add(new Knight(8, 7, "white"));
  board.add(new Knight(1, 7, "black"));
  board.add(new Knight(1, 2, "black"));

  board.resetAttacks();
  board.recordCurrentPosition({ resetHistory: true });

  if ($('input[name="mode_of_play"]:checked').val() == "vs_bot") {
    window.isGameVsBot = true;
  } else if ($('input[name="mode_of_play"]:checked').val() == "online") {
    window.isGameOnline = true;
  }
  $(".overlay").css("display", "none");

  board.playAs = playAs;
  window.playAs = playAs;
  board.updateDraggables(true);
  if (typeof board.updateGameActionControls == "function") {
    board.updateGameActionControls();
  }
  startBotTurnIfNeeded(board);

  if (window.pendingGameOver && typeof board.applyGameOver == "function") {
    const pendingGameOver = window.pendingGameOver;
    window.pendingGameOver = null;
    board.applyGameOver(pendingGameOver);
  }
  gameStartInProgress = false;
};

$("#playerIncrementInput , #playerTimeInput").on("input", function (e) {
  $(".is-invalid").removeClass("is-invalid");
  window.timeSetted = +$("#playerTimeInput").val();
  window.increment = +$("#playerIncrementInput").val();

  if (
    isNaN(window.timeSetted) ||
    !(20 < window.timeSetted && window.timeSetted <= 60 * 60)
  ) {
    $("#playerTimeInput").addClass("is-invalid");
  }

  if (
    isNaN(window.increment) ||
    !(0 <= window.increment && window.increment <= 10)
  ) {
    $("#playerIncrementInput").addClass("is-invalid");
  }
});

var syncDone = false;

function initGame() {
  if (!window.chessAppReady || gameStartInProgress) return;
  gameStartInProgress = true;

  $(".is-invalid").removeClass("is-invalid");
  let isValid = true;
  syncDone = false;
  window.pendingGameOver = null;
  window.normalMovesCounter = 0;
  window.timeSetted = +$("#playerTimeInput").val();
  window.increment = +$("#playerIncrementInput").val();

  if (
    isNaN(window.timeSetted) ||
    !(20 < window.timeSetted && window.timeSetted <= 24 * 60 * 60)
  ) {
    $("#playerTimeInput").addClass("is-invalid");
    isValid = false;
  }

  if (
    isNaN(window.increment) ||
    !(0 <= window.increment && window.increment <= 10)
  ) {
    $("#playerIncrementInput").addClass("is-invalid");
    isValid = false;
  }

  if (isValid) {
    if ($('input[name="mode_of_play"]:checked').val() == "online") {
      if (window.STATIC_EXPORT) {
        alert("Online mode requires the Django/WebSocket backend. Please choose offline or vs bot.");
        gameStartInProgress = false;
        return;
      }

      $("#loadding_pannnel").css({ display: "flex" });
      $("#main_pannnel").css({ display: "none" });
      setMatchmakingCancelEnabled(true);

      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const gameTimeSeconds = Math.trunc(window.timeSetted);
      const incrementSeconds = Math.trunc(window.increment);
      let url = `${protocol}://${window.location.host}/ws/socket-server/${gameTimeSeconds}/${incrementSeconds}/`;
      lastServerEventSeq = 0;
      reconnectStartedAt = 0;
      reconnectAttempts = 0;
      socketClosedIntentionally = false;
      onlineConnection = { url: url, active: true };
      onlineConnection.gameTimeSeconds = gameTimeSeconds;
      onlineConnection.incrementSeconds = incrementSeconds;
      onlineConnection.resumeOnly = false;
      persistOnlineSession("queue");
      setConnectionBanner("", "info");
      openOnlineSocket();
    } else {
      createNewGame(resolveSelectedPlayerColor());
    }
  }

  if (!isValid) {
    gameStartInProgress = false;
  }
}

function showSquaresQueen() {
  var arr = {};
  for (var a of board.pieces) {
    ((a ?? {}).attackingSquares ?? []).forEach(function (e) {
      if (a.constructor.name == "Queen" && a.color == "white") {
        arr[`${e.x}_${e.y}`] = $(`td[x=${e.x}][y=${e.y}]`)[0];
      }
    });
  }
  console.log(arr);
}
