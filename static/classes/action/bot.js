const BOT_TYPES = {
  WEAK: "weak",
  SLOW_WEAK: "slow_weak",
  STOCKFISH: "stockfish",
};

const BOT_CONFIGS = {
  [BOT_TYPES.WEAK]: {
    id: BOT_TYPES.WEAK,
    label: "Weak Bot",
    move: randomBotMove,
  },
  [BOT_TYPES.SLOW_WEAK]: {
    id: BOT_TYPES.SLOW_WEAK,
    label: "Slow Weak Bot (Premove Practice)",
    move: slowRandomBotMove,
    delay: 2200,
  },
  [BOT_TYPES.STOCKFISH]: {
    id: BOT_TYPES.STOCKFISH,
    label: "Super Strong Bot",
    move: stockfishBotMove,
    depth: 20,
    // A fixed thinking budget keeps the engine comfortably inside even the
    // shortest allowed game clock while remaining much stronger than random.
    moveTime: 3000,
    timeout: 10000,
  },
};

let activeBotRequestId = 0;
let activeBotWatchdog = null;
let activeBotRetryTimer = null;

function getSelectedBotConfig() {
  const selectedBot = window.selectedBotType || BOT_TYPES.WEAK;
  return BOT_CONFIGS[selectedBot] || BOT_CONFIGS[BOT_TYPES.WEAK];
}

function setSelectedBotType(botType) {
  window.selectedBotType = BOT_CONFIGS[botType] ? botType : BOT_TYPES.WEAK;
  return window.selectedBotType;
}

function botMove(board, color) {
  if (!board || window.gameState != "playing") {
    window.BotPlaying = false;
    return false;
  }

  if (window.BotPlaying && activeBotWatchdog) {
    return false;
  }

  const selectedBot = getSelectedBotConfig();
  try {
    return selectedBot.move(board, color);
  } catch (error) {
    console.error(`${selectedBot.label} failed before completing its move.`, error);
    finishBotRequest();
    if (selectedBot.id == BOT_TYPES.STOCKFISH) {
      return retryStockfishMove(
        board,
        color,
        null,
        "Stockfish failed before starting its search; retrying Stockfish."
      );
    }
    return false;
  }
}

function clearBotWatchdog(requestId) {
  if (requestId && requestId != activeBotRequestId) return;
  if (activeBotWatchdog) {
    clearTimeout(activeBotWatchdog);
    activeBotWatchdog = null;
  }
}

function clearBotRetry() {
  if (activeBotRetryTimer) {
    clearTimeout(activeBotRetryTimer);
    activeBotRetryTimer = null;
  }
}

function finishBotRequest(requestId) {
  if (requestId && requestId != activeBotRequestId) return false;
  clearBotWatchdog(requestId);
  clearBotRetry();
  window.BotPlaying = false;
  return true;
}

function isCurrentBotTurn(board, color) {
  return !!(
    board &&
    window.gameState == "playing" &&
    (!board.turn || board.turn == color) &&
    (!window.board || window.board === board)
  );
}

function getBotSearchBoard(board) {
  return board && board.isHistoryPreview && board.positionHistory && board.positionHistory.length
    ? board.positionHistory[board.positionHistory.length - 1]
    : board;
}

function getBotPositionKey(board) {
  const searchBoard = getBotSearchBoard(board);
  if (typeof window.boardToFen == "function") return window.boardToFen(searchBoard);

  // Keep the race guard useful in stripped-down/test builds where the
  // Stockfish service (and therefore boardToFen) has not been loaded.
  const pieces = (searchBoard && searchBoard.pieces || []).filter(Boolean).map(function (piece) {
    const type = piece.type || (piece.constructor && piece.constructor.name) || "Piece";
    return [piece.color, type, piece.x, piece.y].join(":");
  }).sort();
  return `${searchBoard && searchBoard.turn || ""}|${pieces.join("|")}`;
}

function retryStockfishMove(board, color, requestId, reason) {
  if (requestId && requestId != activeBotRequestId) return false;
  if (reason) console.warn(reason);

  clearBotWatchdog(requestId);
  // Invalidate the old promise before retrying. A late bestmove from an
  // abandoned search must never be allowed to move in a newer position.
  activeBotRequestId++;
  window.BotPlaying = false;
  if (!isCurrentBotTurn(board, color)) return false;

  clearBotRetry();
  activeBotRetryTimer = setTimeout(function () {
    activeBotRetryTimer = null;
    if (isCurrentBotTurn(board, color) && !window.BotPlaying) {
      stockfishBotMove(board, color);
    }
  }, 500);
  return true;
}

function stockfishBotMove(board, color) {
  const stockfishBot = board.stockfishBotService || window.StockfishBotChess || window.StockfishChess;

  if (stockfishBot && typeof stockfishBot.getBestMove == "function") {
    const requestId = ++activeBotRequestId;
    window.BotPlaying = true;
    const selectedBot = getSelectedBotConfig();
    const boardForSearch = getBotSearchBoard(board);
    const searchedPosition = getBotPositionKey(board);

    activeBotWatchdog = setTimeout(function () {
      if (requestId != activeBotRequestId || window.gameState != "playing") return;
      retryStockfishMove(
        board,
        color,
        requestId,
        "Stockfish bot timed out; retrying Stockfish."
      );
    }, (selectedBot.timeout || 45000) + 5000);

    stockfishBot.getBestMove(boardForSearch, {
      depth: selectedBot.depth || 18,
      moveTime: selectedBot.moveTime,
      timeout: selectedBot.timeout || 45000,
      owner: board.stockfishOwner,
    }).then(function (uciMove) {
      if (requestId != activeBotRequestId || window.gameState != "playing") return;
      if (!isCurrentBotTurn(board, color) || getBotPositionKey(board) != searchedPosition) {
        retryStockfishMove(
          board,
          color,
          requestId,
          "Discarded a stale Stockfish answer because the position changed."
        );
        return;
      }
      const stockfishMove = typeof window.uciToMove == "function" ? window.uciToMove(uciMove) : null;
      if (stockfishMove) {
        let moveWasPlayed = false;
        try {
          moveWasPlayed = makeMove(
            board,
            stockfishMove.x,
            stockfishMove.y,
            stockfishMove.newX,
            stockfishMove.newY
          );
        } catch (error) {
          console.error("Stockfish move execution failed.", error);
        }
        if (!moveWasPlayed) {
          retryStockfishMove(
            board,
            color,
            requestId,
            `Stockfish returned a move that could not be played (${uciMove}); retrying Stockfish.`
          );
        } else {
          finishBotRequest(requestId);
          if (board && typeof board.tryExecutePremoveStack == "function") {
            board.tryExecutePremoveStack();
          }
        }
      } else {
        retryStockfishMove(
          board,
          color,
          requestId,
          "Stockfish did not return a usable best move; retrying Stockfish."
        );
      }
    }).catch(function (error) {
      if (requestId != activeBotRequestId || window.gameState != "playing") return;
      console.error("Stockfish search failed.", error);
      retryStockfishMove(
        board,
        color,
        requestId,
        "Stockfish bot failed; retrying Stockfish."
      );
    });
    return true;
  }

  return retryStockfishMove(
    board,
    color,
    null,
    "Stockfish service is unavailable; retrying Stockfish."
  );
}

function randomBotMove(board, color) {
  if (!board || window.gameState != "playing") {
    window.BotPlaying = false;
    return false;
  }

  let possibleMove = [];

  for (const piece of board.pieces || []) {
    if (piece && piece.color == color) {
      for (let x = 1; x <= 8; x++) {
        for (let y = 1; y <= 8; y++) {
          try {
            if (
              piece.isLegal(board, x, y) &&
              !board.isCheckIfMovePlayed(piece, x, y)
            ) {
              possibleMove.push({ x: piece.x, y: piece.y, newX: x, newY: y });
            }
          } catch (error) {
            // A broken candidate must not poison the bot's entire turn. Other
            // pieces and destinations may still provide a valid recovery move.
            console.warn("Ignored a bot move candidate that could not be validated.", error);
          }
        }
      }
    }
  }

  while (possibleMove.length && isCurrentBotTurn(board, color)) {
    const moveIndex = Math.floor(Math.random() * possibleMove.length);
    const move = possibleMove.splice(moveIndex, 1)[0];
    window.BotPlaying = true;
    let moveWasPlayed = false;
    try {
      moveWasPlayed = makeMove(board, move.x, move.y, move.newX, move.newY);
    } catch (error) {
      console.error("A legal bot move failed during execution; trying another move.", error);
    } finally {
      // Never leave the bot locked if a move path unexpectedly throws.
      window.BotPlaying = false;
    }
    if (moveWasPlayed && board && typeof board.tryExecutePremoveStack == "function") {
      board.tryExecutePremoveStack();
    }
    if (moveWasPlayed) return true;
  }

  window.BotPlaying = false;
  return false;
}

function slowRandomBotMove(board, color) {
  if (!board || window.gameState != "playing") {
    window.BotPlaying = false;
    return false;
  }

  const requestId = ++activeBotRequestId;
  const selectedBot = getSelectedBotConfig();
  window.BotPlaying = true;
  activeBotWatchdog = setTimeout(function () {
    if (
      requestId != activeBotRequestId ||
      window.gameState != "playing" ||
      (window.board && window.board !== board)
    ) {
      finishBotRequest(requestId);
      return;
    }

    clearBotWatchdog(requestId);
    window.BotPlaying = false;
    randomBotMove(board, color);
  }, selectedBot.delay || 2200);
  return true;
}

function cancelBotRequest() {
  activeBotRequestId++;
  clearBotWatchdog();
  clearBotRetry();
  window.BotPlaying = false;
}

// CommonJS export for Node.js testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = botMove;
}

if (typeof window !== "undefined") {
  window.BOT_TYPES = BOT_TYPES;
  window.BOT_CONFIGS = BOT_CONFIGS;
  window.getSelectedBotConfig = getSelectedBotConfig;
  window.setSelectedBotType = setSelectedBotType;
  window.cancelBotRequest = cancelBotRequest;
  window.selectedBotType = window.selectedBotType || BOT_TYPES.WEAK;
}
