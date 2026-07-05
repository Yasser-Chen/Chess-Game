function Pawn(x, y, color) {
  this.element = $(`<i class="fg-${color} fas fa-chess-pawn"></i>`);
  Piece.call(this, x, y, color);
}
Pawn.prototype.recalculateAttackingSquares = function (board) {
  this.attackingSquares = [];
  this.attackingSquares.exists = comparingObjs;
  this.attackingSquares.pushItem = pushItem;

  let forwardOnly;
  if (this.color == "black") {
    forwardOnly = function (a, b) {
      return a + b;
    };
  } else if (this.color == "white") {
    forwardOnly = function (a, b) {
      return a - b;
    };
  }

  if (this.y == 8) {
    this.attackingSquares.pushItem({
      x: forwardOnly(this.x, 1),
      y: this.y - 1,
    });
  } else if (this.y == 1) {
    this.attackingSquares.pushItem({
      x: forwardOnly(this.x, 1),
      y: this.y + 1,
    });
  } else {
    this.attackingSquares.pushItem({
      x: forwardOnly(this.x, 1),
      y: this.y + 1,
    });
    this.attackingSquares.pushItem({
      x: forwardOnly(this.x, 1),
      y: this.y - 1,
    });
  }
};

Pawn.prototype.isEnPassant = function (board, x, y) {
  let oldPiece = board.pieceAtSquare(x, y);
  if (oldPiece) {
    return false;
  } else if (
    this.x == 4 &&
    this.color == "white" &&
    x == 3 &&
    (y == this.y - 1 || y == this.y + 1)
  ) {
    let enPassantPiece = board.pieceAtSquare(4, y);
    if (
      enPassantPiece &&
      window.lastPawnMoved &&
      window.lastPawnMoved == enPassantPiece &&
      !window.lastPawnMoved.cantEnpassant
    ) {
      return true;
    }
  } else if (
    this.x == 5 &&
    this.color == "black" &&
    x == 6 &&
    (y == this.y - 1 || y == this.y + 1)
  ) {
    let enPassantPiece = board.pieceAtSquare(5, y);
    if (
      enPassantPiece &&
      window.lastPawnMoved &&
      window.lastPawnMoved == enPassantPiece &&
      !window.lastPawnMoved.cantEnpassant
    ) {
      return true;
    }
  }
  return false;
};

Pawn.prototype.isLegal = function (board, x, y) {
  //check if king is in check
  let oldPiece = board.pieceAtSquare(x, y);
  // can't eat same color
  if (oldPiece) {
    if (oldPiece.color == this.color) return false;
  } else if (
    //could be En passant
    this.x == 4 &&
    this.color == "white" &&
    x == 3 &&
    (y == this.y - 1 || y == this.y + 1)
  ) {
    let enPassantPiece = board.pieceAtSquare(4, y);
    if (
      enPassantPiece &&
      window.lastPawnMoved &&
      window.lastPawnMoved == enPassantPiece &&
      !window.lastPawnMoved.cantEnpassant
    ) {
      return true;
    }
  } else if (
    //could be En passant
    this.x == 5 &&
    this.color == "black" &&
    x == 6 &&
    (y == this.y - 1 || y == this.y + 1)
  ) {
    let enPassantPiece = board.pieceAtSquare(5, y);
    if (
      enPassantPiece &&
      window.lastPawnMoved &&
      window.lastPawnMoved == enPassantPiece &&
      !window.lastPawnMoved.cantEnpassant
    ) {
      return true;
    }
  }

  let forwardOnly;
  if (this.color == "black") {
    forwardOnly = function (a, b) {
      return a + b;
    };
  } else if (this.color == "white") {
    forwardOnly = function (a, b) {
      return a - b;
    };
  }
  if (this.y == y && !oldPiece) {
    if (forwardOnly(this.x, 1) == x) {
    } else if (
      !this.firstMoveDone &&
      forwardOnly(this.x, 2) == x &&
      !board.pieceAtSquare(forwardOnly(this.x, 1), y)
    ) {
    } else {
      return false;
    }
  } else if (this.y - 1 == y && forwardOnly(this.x, 1) == x && oldPiece) {
  } else if (this.y + 1 == y && forwardOnly(this.x, 1) == x && oldPiece) {
  } else {
    return false;
  }

  return true;
};

// CommonJS export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Pawn;
}
