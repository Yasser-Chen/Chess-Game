function Knight(x, y, color) {
  this.element = $(`<i class="fg-${color} fas fa-chess-knight"></i>`);
  Piece.call(this, x, y, color);
}
Knight.prototype.recalculateAttackingSquares = function (board) {
  this.attackingSquares = [];
  this.attackingSquares.exists = comparingObjs;
  this.attackingSquares.pushItem = pushItem;

  this.attackingSquares.pushItem({ x: this.x - 1, y: this.y - 2 });
  this.attackingSquares.pushItem({ x: this.x - 1, y: this.y + 2 });
  this.attackingSquares.pushItem({ x: this.x + 1, y: this.y - 2 });
  this.attackingSquares.pushItem({ x: this.x + 1, y: this.y + 2 });
  this.attackingSquares.pushItem({ x: this.x - 2, y: this.y - 1 });
  this.attackingSquares.pushItem({ x: this.x - 2, y: this.y + 1 });
  this.attackingSquares.pushItem({ x: this.x + 2, y: this.y - 1 });
  this.attackingSquares.pushItem({ x: this.x + 2, y: this.y + 1 });
};
Knight.prototype.isLegal = function (board, x, y) {
  //check if king is in check
  let oldPiece = board.pieceAtSquare(x, y);
  // can't eat same color
  if (oldPiece) {
    if (oldPiece.color == this.color) return false;
  }

  if (
    (this.x - 1 == x || this.x + 1 == x) &&
    (this.y - 2 == y || this.y + 2 == y)
  ) {
    return true;
  } else if (
    (this.x - 2 == x || this.x + 2 == x) &&
    (this.y - 1 == y || this.y + 1 == y)
  ) {
    return true;
  } else {
    return false;
  }

  return true;
};

// CommonJS export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Knight;
}
