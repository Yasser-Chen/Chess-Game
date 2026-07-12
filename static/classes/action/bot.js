const BOT_TYPES = {
  WEAK: "weak",
  STOCKFISH: "stockfish",
};

const BOT_CONFIGS = {
  [BOT_TYPES.WEAK]: {
    id: BOT_TYPES.WEAK,
    label: "Weak Bot",
    move: randomBotMove,
  },
  [BOT_TYPES.STOCKFISH]: {
    id: BOT_TYPES.STOCKFISH,
    label: "Super Strong Bot",
    move: stockfishBotMove,
    depth: 20,
    moveTime: 0,
    timeout: 45000,
  },
};

let activeBotRequestId = 0;
let activeBotWatchdog = null;

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

  return getSelectedBotConfig().move(board, color);
}

function clearBotWatchdog(requestId) {
  if (requestId && requestId != activeBotRequestId) return;
  if (activeBotWatchdog) {
    clearTimeout(activeBotWatchdog);
    activeBotWatchdog = null;
  }
}

function finishBotRequest(requestId) {
  if (requestId && requestId != activeBotRequestId) return false;
  clearBotWatchdog(requestId);
  window.BotPlaying = false;
  return true;
}

function failStockfishMove(reason) {
  if (reason) console.error(reason);
  finishBotRequest();
  return false;
}

function stockfishBotMove(board, color) {
  const stockfishBot = window.StockfishBotChess || window.StockfishChess;

  if (stockfishBot && typeof stockfishBot.getBestMove == "function") {
    const requestId = ++activeBotRequestId;
    window.BotPlaying = true;
    const selectedBot = getSelectedBotConfig();
    const liveSnapshot =
      board.isHistoryPreview && board.positionHistory && board.positionHistory.length
        ? board.positionHistory[board.positionHistory.length - 1]
        : null;
    const boardForSearch = liveSnapshot || board;

    activeBotWatchdog = setTimeout(function () {
      if (requestId != activeBotRequestId || window.gameState != "playing") return;
      activeBotRequestId++;
      clearBotWatchdog();
      console.error("Stockfish bot timed out. No random move was played.");
      finishBotRequest();
    }, (selectedBot.timeout || 45000) + 5000);

    stockfishBot.getBestMove(boardForSearch, {
      depth: selectedBot.depth || 18,
      moveTime: selectedBot.moveTime,
      timeout: selectedBot.timeout || 45000,
    }).then(function (uciMove) {
      if (requestId != activeBotRequestId || window.gameState != "playing") return;
      const stockfishMove = typeof window.uciToMove == "function" ? window.uciToMove(uciMove) : null;
      if (stockfishMove) {
        const moveWasPlayed = makeMove(
          board,
          stockfishMove.x,
          stockfishMove.y,
          stockfishMove.newX,
          stockfishMove.newY
        );
        if (!moveWasPlayed) {
          failStockfishMove(
            `Stockfish returned a move that could not be played (${uciMove}); no random fallback was used.`
          );
        } else {
          finishBotRequest(requestId);
          if (board && typeof board.tryExecutePremoveStack == "function") {
            board.tryExecutePremoveStack();
          }
        }
      } else {
        failStockfishMove("Stockfish did not return a usable best move; no random fallback was used.");
      }
    }).catch(function (error) {
      if (requestId != activeBotRequestId || window.gameState != "playing") return;
      failStockfishMove("Stockfish bot failed; no random fallback was used.");
    });
    return true;
  }

  console.error("Stockfish service is unavailable; no random fallback was used.");
  window.BotPlaying = false;
  return false;
}

function randomBotMove(board, color) {
  if (!board || window.gameState != "playing") {
    window.BotPlaying = false;
    return false;
  }

  let possibleMove = [];

  for (const piece of board.pieces) {
    if (piece && piece.color == color) {
      for (let x = 1; x <= 8; x++) {
        for (let y = 1; y <= 8; y++) {
          if (
            piece.isLegal(board, x, y) &&
            !board.isCheckIfMovePlayed(piece, x, y)
          ) {
            possibleMove.push({ x: piece.x, y: piece.y, newX: x, newY: y });
          }
        }
      }
    }
  }

  let move =
    possibleMove[Math.floor(Math.random() * possibleMove.length)] ?? null;

  if (move) {
    window.BotPlaying = true;
    let moveWasPlayed = false;
    try {
      moveWasPlayed = makeMove(board, move.x, move.y, move.newX, move.newY);
    } finally {
      // Never leave the bot locked if a move path unexpectedly throws.
      window.BotPlaying = false;
    }
    if (moveWasPlayed && board && typeof board.tryExecutePremoveStack == "function") {
      board.tryExecutePremoveStack();
    }
    return moveWasPlayed;
  }

  window.BotPlaying = false;
  return false;
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
  window.selectedBotType = window.selectedBotType || BOT_TYPES.WEAK;
}
