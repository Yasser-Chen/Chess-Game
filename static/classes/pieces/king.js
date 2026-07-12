function King(x, y, color) {
  this.element = $(`<i class="fg-${color} king fas fa-chess-king"></i>`);
  Piece.call(this, x, y, color);
}
King.prototype.recalculateAttackingSquares = function (board) {
  this.attackingSquares = [];
  this.attackingSquares.exists = comparingObjs;
  this.attackingSquares.pushItem = pushItem;

  if (this.x + 1 < 9) {
    if (this.y - 1 > 0) {
      this.attackingSquares.pushItem({ x: this.x + 1, y: this.y - 1 });
    }
    this.attackingSquares.pushItem({ x: this.x + 1, y: this.y });
    if (this.y + 1 < 9) {
      this.attackingSquares.pushItem({ x: this.x + 1, y: this.y + 1 });
    }
  }
  if (this.x - 1 > 0) {
    if (this.y - 1 > 0) {
      this.attackingSquares.pushItem({ x: this.x - 1, y: this.y - 1 });
    }
    this.attackingSquares.pushItem({ x: this.x - 1, y: this.y });
    if (this.y + 1 < 9) {
      this.attackingSquares.pushItem({ x: this.x - 1, y: this.y + 1 });
    }
  }
  this.attackingSquares.pushItem({ x: this.x, y: this.y - 1 });
  this.attackingSquares.pushItem({ x: this.x, y: this.y + 1 });
};
King.prototype.isLegal = function (board, x, y) {
  let oldPiece = board.pieceAtSquare(x, y);
  if (oldPiece && oldPiece.color == this.color) {
    const homeRank = this.color == "white" ? 8 : 1;
    const isHomeRook =
      oldPiece.constructor.name == "Rook" &&
      oldPiece.x == homeRank &&
      (oldPiece.y == 1 || oldPiece.y == 8);

    if (
      !isHomeRook ||
      this.x != homeRank ||
      this.y != 5 ||
      this.firstMoveDone ||
      oldPiece.firstMoveDone
    ) {
      return false;
    }

    const isKingside = oldPiece.y == 8;
    const emptyFiles = isKingside ? [6, 7] : [4, 3, 2];
    const safeKingFiles = isKingside ? [5, 6, 7] : [5, 4, 3];

    if (emptyFiles.some((file) => board.pieceAtSquare(homeRank, file))) {
      return false;
    }

    for (const possiblePiece of board.pieces) {
      if (!possiblePiece || possiblePiece.color == this.color) continue;
      possiblePiece.recalculateAttackingSquares(board);
      if (safeKingFiles.some((file) =>
        possiblePiece.attackingSquares.exists({ x: homeRank, y: file })
      )) {
        return false;
      }
    }

    return true;
  }

  return (
    (this.x + 1 == x || this.x - 1 == x || this.x == x) &&
    (this.y + 1 == y || this.y - 1 == y || this.y == y) &&
    (this.x != x || this.y != y)
  );
};

// CommonJS export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = King;
}
