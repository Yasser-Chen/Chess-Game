function botMove(board, color) {
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
    let moveWasPlayed = makeMove(board, move.x, move.y, move.newX, move.newY);
    if (!moveWasPlayed) {
      window.BotPlaying = false;
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
