function Move(board) {
  let tab = [];

  for (const piece of board.pieces) {
    if (piece) {
      tab.push(
        `${piece.color}-${piece.x}-${piece.y}-${piece.constructor.name}`.padEnd(
          6
        )
      );
    }
  }

  tab.sort();

  this.boardDescription = tab.join("||");
}

function normalizeBoardCoordinate(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : NaN;
}

function isBoardCoordinate(x, y) {
  return x >= 1 && x <= 8 && y >= 1 && y <= 8;
}

function resetPieceElementPosition(piece) {
  if (!piece || !piece.element) return;

  const element = $(piece.element);
  if (typeof element.stop == "function") {
    element.stop(true, true);
  }
  element.css({
    top: "0px",
    left: "0px",
  });
}

function makeMove(board, x, y, newX, newY) {
  const options = arguments[5] || {};
  if (!board || window.gameState != "playing") {
    return false;
  }

  x = normalizeBoardCoordinate(x);
  y = normalizeBoardCoordinate(y);
  newX = normalizeBoardCoordinate(newX);
  newY = normalizeBoardCoordinate(newY);

  if (!board || !isBoardCoordinate(x, y) || !isBoardCoordinate(newX, newY)) {
    console.warn("Ignored move with invalid board coordinates", {
      x,
      y,
      newX,
      newY,
    });
    return false;
  }

  let searchOld = board.pieceAtSquare(x, y);
  if (!searchOld) {
    console.warn("Ignored move because no piece exists on the source square", {
      x,
      y,
      newX,
      newY,
    });
    return false;
  }

  const shouldAnimateProgrammaticMove =
    options.animate === true ||
    window.BotPlaying === true ||
    window.isGameOnline === true;

  let square = typeof board.getSquare == "function"
    ? board.getSquare(newX, newY)
    : $(`td[x=${newX}][y=${newY}]`);
  if (!square.length) {
    resetPieceElementPosition(searchOld);
    console.warn("Ignored move because the target square is not rendered", {
      x,
      y,
      newX,
      newY,
    });
    return false;
  }

  let targetBeforeMove = board.pieceAtSquare(newX, newY);
  let isCastlingMove =
    searchOld.constructor.name == "King" &&
    targetBeforeMove &&
    targetBeforeMove.color == searchOld.color &&
    targetBeforeMove.constructor.name == "Rook";

  resetPieceElementPosition(searchOld);

  let dropHandler =
    typeof square.droppable == "function"
      ? square.droppable("option", "drop")
      : null;

  if (typeof dropHandler != "function") {
    console.warn("Ignored move because the board square has no drop handler", {
      x,
      y,
      newX,
      newY,
    });
    return false;
  }

  window.isApplyingRemoteMove = true;
  window.shouldAnimateProgrammaticMove = shouldAnimateProgrammaticMove;
  try {
    dropHandler.call(
      square[0],
      { stopPropagation: function () {} },
      { draggable: $(searchOld.element) }
    );
  } finally {
    window.isApplyingRemoteMove = false;
    window.shouldAnimateProgrammaticMove = false;
  }

  resetPieceElementPosition(searchOld);

  return (
    (searchOld.x == newX && searchOld.y == newY) ||
    (isCastlingMove && searchOld.x == x && searchOld.y != y) ||
    board.pieces.indexOf(searchOld) == -1
  );
}

// CommonJS export for Node.js testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = { Move, makeMove };
}
