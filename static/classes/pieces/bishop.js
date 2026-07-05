function Bishop(x, y, color) {
  this.element = $(`<i class="fg-${color} fas fa-chess-bishop"></i>`);
  Piece.call(this, x, y, color);
}
Bishop.prototype.recalculateAttackingSquares = function (board) {
  this.attackingSquares = [];
  this.attackingSquares.exists = comparingObjs;
  this.attackingSquares.pushItem = pushItem;

  let oldPiece1, oldPiece2, oldPiece3, oldPiece4;

  for (let inc = 1; inc <= 8; inc++) {
    if (oldPiece1 == undefined) {
      oldPiece1 = board.pieceAtSquare(this.x + inc, this.y - inc);
      this.attackingSquares.pushItem({ x: this.x + inc, y: this.y - inc });
    }
    if (oldPiece2 == undefined) {
      oldPiece2 = board.pieceAtSquare(this.x - inc, this.y + inc);
      this.attackingSquares.pushItem({ x: this.x - inc, y: this.y + inc });
    }
    if (oldPiece3 == undefined) {
      oldPiece3 = board.pieceAtSquare(this.x - inc, this.y - inc);
      this.attackingSquares.pushItem({ x: this.x - inc, y: this.y - inc });
    }
    if (oldPiece4 == undefined) {
      oldPiece4 = board.pieceAtSquare(this.x + inc, this.y + inc);
      this.attackingSquares.pushItem({ x: this.x + inc, y: this.y + inc });
    }
  }
};
Bishop.prototype.isLegal = function (board, x, y) {
  let oldPiece = board.pieceAtSquare(x, y);
  // can't eat same color
  if (oldPiece) {
    if (oldPiece.color == this.color) return false;
  }

  if (diff(this.y, y) == diff(this.x, x)) {
  } else {
    return false;
  }

  // musn't have anything in between
  if (this.x < x && this.y < y) {
    for (let i = this.x + 1; i < x; i++) {
      for (let j = this.y + 1; j < y; j++) {
        if (diff(j, y) == diff(i, x)) {
          let oldPiece = board.pieceAtSquare(i, j);
          if (oldPiece) {
            return false;
          }
        }
      }
    }
  } else if (this.x > x && this.y > y) {
    for (let i = this.x - 1; i > x; i--) {
      for (let j = this.y - 1; j > y; j--) {
        if (diff(j, y) == diff(i, x)) {
          let oldPiece = board.pieceAtSquare(i, j);
          if (oldPiece) {
            return false;
          }
        }
      }
    }
  } else if (this.x < x && this.y > y) {
    for (let i = this.x + 1; i < x; i++) {
      for (let j = this.y - 1; j > y; j--) {
        if (diff(j, y) == diff(i, x)) {
          let oldPiece = board.pieceAtSquare(i, j);
          if (oldPiece) {
            return false;
          }
        }
      }
    }
  } else if (this.x > x && this.y < y) {
    for (let i = this.x - 1; i > x; i--) {
      for (let j = this.y + 1; j < y; j++) {
        if (diff(j, y) == diff(i, x)) {
          let oldPiece = board.pieceAtSquare(i, j);
          if (oldPiece) {
            return false;
          }
        }
      }
    }
  } else {
    return false;
  }

  return true;
};

// CommonJS export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Bishop;
}
