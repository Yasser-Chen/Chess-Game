// Global function to reset game and immediately start a new game with same settings
window.resetGameAndStartNew = function () {
  // Clean up existing game
  if (window.board && typeof window.board.resetGame == "function") {
    window.board.resetGame();
  }

  // Clean up WebSocket
  if (window.gameSocket) {
    try {
      window.gameSocket.close();
    } catch (e) {
      // Ignore
    }
    window.gameSocket = null;
  }

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

  // Immediately start a new game using the last selected settings
  // Use the stored playAs value (white or black) from the previous game
  const playAs = window._lastPlayAs || "white";
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
};

// Global function to reset game and show hub
window.resetGameAndShowHub = function () {
  // Clean up existing game
  if (window.board && typeof window.board.resetGame == "function") {
    window.board.resetGame();
  }

  // Clean up WebSocket
  if (window.gameSocket) {
    try {
      window.gameSocket.close();
    } catch (e) {
      // Ignore
    }
    window.gameSocket = null;
  }

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

function setMatchmakingCancelEnabled(enabled) {
  const cancelButton = $("#cancelMatchmakingBtn");
  if (!cancelButton.length) return;

  cancelButton
    .prop("disabled", !enabled)
    .toggleClass("disabled", !enabled)
    .attr("aria-disabled", enabled ? "false" : "true");
}

function closeActiveGameSocket() {
  if (!window.gameSocket) return;

  try {
    window.gameSocket.close();
  } catch (e) {
    // Ignore WebSocket close errors during user cancellation/reset.
  }
  window.gameSocket = null;
}

function updateBotOptionsVisibility() {
  const isVsBot = $('input[name="mode_of_play"]:checked').val() == "vs_bot";
  $("#botOptionsPanel").toggle(isVsBot);
}

$(document).on("change", 'input[name="mode_of_play"]', updateBotOptionsVisibility);

$(document).on("change", "#botTypeSelect", function () {
  if (typeof window.setSelectedBotType == "function") {
    window.setSelectedBotType($(this).val());
  } else {
    window.selectedBotType = $(this).val() || "weak";
  }
});

$(function () {
  updateBotOptionsVisibility();
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
  closeActiveGameSocket();
  setMatchmakingCancelEnabled(true);
  $("#loading_chess_event").html("Looking for a match");
  $("#loadding_pannnel").css({ display: "none" });
  $("#main_pannnel").css({ display: "block" });
}

window.cancelOnlineMatchmaking = cancelOnlineMatchmaking;

var createNewGame = (playAs) => {
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
      window.board.resetGame();
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

  if (window.pendingGameOver && typeof board.applyGameOver == "function") {
    const pendingGameOver = window.pendingGameOver;
    window.pendingGameOver = null;
    board.applyGameOver(pendingGameOver);
  }
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
        return;
      }

      $("#loadding_pannnel").css({ display: "flex" });
      $("#main_pannnel").css({ display: "none" });
      setMatchmakingCancelEnabled(true);

      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const gameTimeSeconds = Math.trunc(window.timeSetted);
      const incrementSeconds = Math.trunc(window.increment);
      let url = `${protocol}://${window.location.host}/ws/socket-server/${gameTimeSeconds}/${incrementSeconds}/`;

      window.gameSocket = new WebSocket(url);

       window.gameSocket.onmessage = function (e) {
        let rawData = JSON.parse(e.data);
        let data = rawData.chess_event ? JSON.parse(rawData.chess_event) : rawData;

        // Handle clock sync responses
        if (data.type === 'clock_sync_response') {
          if (window.ClockSync) {
            window.ClockSync.handleClockSyncResponse(data.server_time, data.client_send_time);
          }
          return;
        }

        if (data.type === "draw_offer") {
          if (window.board && typeof window.board.receiveDrawOffer == "function") {
            window.board.receiveDrawOffer(data);
          }
          return;
        }

        if (data.type === "draw_declined") {
          if (window.board && typeof window.board.receiveDrawDeclined == "function") {
            window.board.receiveDrawDeclined(data);
          }
          return;
        }

        if (data.type === "game_over") {
          if (window.board && typeof window.board.applyGameOver == "function") {
            window.board.applyGameOver(data);
          } else {
            window.gameState = "notPlaying";
            window.pendingGameOver = data;
          }
          return;
        }

        if (
          !syncDone &&
          ((data.type == "sync" && data.priority != priority) ||
            data.type == "sync_accepted")
        ) {
          syncDone = true;
          clearInterval(searchingLoop);

          window.gameSocket.send(
            JSON.stringify({
              chess_event: JSON.stringify({
                type: "sync_accepted",
                priority: priority,
                date_start: data.date_start,
              }),
            })
          );

          // Perform initial clock sync using the server-stamped sync message
          const t1 = Date.now();
          const t2 = data.server_time || data.date_start;
          const t3 = t2;
          const t4 = Date.now();
          if (t1 > 0 && t2 > 0) {
            const offset = ((t2 - t1) + (t3 - t4)) / 2;
            window.setServerTimeOffset(offset);
            window.lastSyncOffset = offset;
            window.lastSyncRTT = t4 - t1;
            window.lastSyncTime = Date.now();
            console.log('[Clock Sync] Initial offset:', offset.toFixed(2), 'ms');
          }

          const nowServerTime = window.estimatedServerTime ? window.estimatedServerTime() : Date.now();
          const date1 = new Date(nowServerTime);
          const date2 = new Date();
          date2.setTime(data.date_start);

          const diffTime = Math.max(0, date2 - date1);
          console.log(diffTime);

          $("#loading_chess_event").html("Match Found");
          setMatchmakingCancelEnabled(false);

          if (data.type == "sync_accepted") {
            //must play as black
            setTimeout(function () {
              createNewGame("black");

              window.playAs = "black";
              // Start periodic clock sync after game starts
              if (window.isGameOnline && window.gameState == "playing") {
                window.startClockSync();
              }
            }, diffTime);
          } else {
            setTimeout(function () {
              createNewGame("white");

              window.playAs = "white";
              // Start periodic clock sync after game starts
              if (window.isGameOnline && window.gameState == "playing") {
                window.startClockSync();
              }
            }, diffTime);
          }
        } else if (window.gameState != "playing") {
          return;
        } else if (data.type == "upgrade") {
          window.lastUpgradedPiece = data.piece;
          if (makeMove(board, data.x, data.y, data.newX, data.newY, { animate: true, remote: true }) && board && typeof board.tryExecutePremoveStack == "function") {
            board.tryExecutePremoveStack();
          }
        } else if (
          data.type != "upgrade" &&
          data.type != "sync" &&
          data.type != "sync_accepted"
        ) {
          if (makeMove(board, data.x, data.y, data.newX, data.newY, { animate: true, remote: true }) && board && typeof board.tryExecutePremoveStack == "function") {
            board.tryExecutePremoveStack();
          }
        }
      };

      setTimeout(function () {
        clearInterval(searchingLoop);
        searchingLoop = setInterval(function () {
          if (!window.gameSocket || window.gameSocket.readyState !== 1 || syncDone) {
            clearInterval(searchingLoop);
            return;
          }
          window.gameSocket.send(
            JSON.stringify({
              chess_event: JSON.stringify({
                type: "sync",
                priority: priority,
                game_time_seconds: gameTimeSeconds,
                increment_seconds: incrementSeconds,
              }),
            })
          );
        }, 1000);
      }, 100);
    } else {
      createNewGame();
    }
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
