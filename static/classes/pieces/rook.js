function Rook(x, y, color) {
  this.element = $(`<i class="fg-${color} fas fa-chess-rook"></i>`);
  Piece.call(this, x, y, color);
}
Rook.prototype.recalculateAttackingSquares = function (board) {
  this.attackingSquares = [];
  this.attackingSquares.exists = comparingObjs;
  this.attackingSquares.pushItem = pushItem;

  for (let i = this.x + 1; i <= 8; i++) {
    let oldPiece = board.pieceAtSquare(i, this.y);
    this.attackingSquares.pushItem({ x: i, y: this.y });
    if (oldPiece) {
      break;
    }
  }
  for (let j = this.y + 1; j <= 8; j++) {
    let oldPiece = board.pieceAtSquare(this.x, j);
    this.attackingSquares.pushItem({ x: this.x, y: j });
    if (oldPiece) {
      break;
    }
  }
  for (let i = this.x - 1; i >= 1; i--) {
    let oldPiece = board.pieceAtSquare(i, this.y);
    this.attackingSquares.pushItem({ x: i, y: this.y });
    if (oldPiece) {
      break;
    }
  }
  for (let j = this.y - 1; j >= 1; j--) {
    let oldPiece = board.pieceAtSquare(this.x, j);
    this.attackingSquares.pushItem({ x: this.x, y: j });
    if (oldPiece) {
      break;
    }
  }
};

Rook.prototype.isLegal = function (board, x, y) {
  let oldPiece = board.pieceAtSquare(x, y);
  // can't eat same color
  if (oldPiece) {
    if (oldPiece.color == this.color) return false;
  }
  if (this.y != y && this.x != x) {
    return false;
  }

  if (this.x < x) {
    for (let i = this.x + 1; i < x; i++) {
      let oldPiece = board.pieceAtSquare(i, this.y);
      if (oldPiece) {
        return false;
      }
    }
  } else if (this.y < y) {
    for (let j = this.y + 1; j < y; j++) {
      let oldPiece = board.pieceAtSquare(this.x, j);
      if (oldPiece) {
        return false;
      }
    }
  } else if (this.x > x) {
    for (let i = this.x - 1; i > x; i--) {
      let oldPiece = board.pieceAtSquare(i, this.y);
      if (oldPiece) {
        return false;
      }
    }
  } else if (this.y > y) {
    for (let j = this.y - 1; j > y; j--) {
      let oldPiece = board.pieceAtSquare(this.x, j);
      if (oldPiece) {
        return false;
      }
    }
  } else {
    return false;
  }

  return true;
};

// CommonJS export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Rook;
}
