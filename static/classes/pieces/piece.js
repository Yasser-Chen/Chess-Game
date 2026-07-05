function Piece(x, y, color) {
  this.x = x;
  this.y = y;
  this.color = color;
  this.attackingSquares = [];
  this.attackingSquares.exists = comparingObjs;
  this.attackingSquares.pushItem = pushItem;

  if (this.element == undefined) {
    this.element = $(`<i class="fg-${color} fas fa-pizza-slice"></i>`);
  }
  this.element.data("piece", this);
  this.element.draggable({
    drag: onPieceDrag,
    accept: "td",
    containment: "#game",
    stop: onPieceStopDrag,
    scroll: false,
  });
}

Piece.prototype.isLegal = function (board, x, y) {
  // CHECK IF THE KING WILL GET A CHECK IF THIS MOVE IS GOING TO HAPPEND
  // AND RETURN FALSE
  let oldPiece = board.pieceAtSquare(x, y);
  // can't eat same color
  if (oldPiece) {
    if (oldPiece.color == this.color) return false;
  }
  return true;
};

// CommonJS export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Piece;
}
