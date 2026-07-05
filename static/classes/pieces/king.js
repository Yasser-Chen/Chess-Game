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
  // can't eat same color
  if (oldPiece) {
    if (oldPiece.color == this.color) {
      //can't castle in check and can't when a square is attacked ! you can if the rook is attacked so no worried looking if that square is attacked ! now only
      /*
                      LONG CASTLING :
                          Y2 
                          Y3 
                          Y4
                      SHORT CASTLING :
                          Y6 
                          Y7 
                      NOT ATTACKED BY OPPOSITE COLORS !
                  */
      if (
        oldPiece.constructor.name == "Rook" &&
        !oldPiece.firstMoveDone &&
        !this.firstMoveDone &&
        this.x == oldPiece.x
      ) {
        if (oldPiece.y > this.y) {
          // SHORT CASTELING
          if (
            board.pieceAtSquare(this.x, 6) ||
            board.pieceAtSquare(this.x, 7)
          ) {
            return false;
          } else {
            for (const posiblPiece of board.pieces) {
              if (posiblPiece) {
                if (posiblPiece.color != this.color) {
                  posiblPiece.recalculateAttackingSquares(board);

                  if (
                    posiblPiece.attackingSquares.exists({ x: this.x, y: 6 }) ||
                    posiblPiece.attackingSquares.exists({ x: this.x, y: 7 })
                  ) {
                    return false;
                  }
                }
              }
            }
          }
        } else {
          // LONG CASTELING
          if (
            board.pieceAtSquare(this.x, 4) ||
            board.pieceAtSquare(this.x, 3) ||
            board.pieceAtSquare(this.x, 2)
          ) {
            return false;
          } else {
            for (const posiblPiece of board.pieces) {
              if (posiblPiece) {
                if (posiblPiece.color != this.color) {
                  posiblPiece.recalculateAttackingSquares(board);

                  if (
                    posiblPiece.attackingSquares.exists({ x: this.x, y: 2 }) ||
                    posiblPiece.attackingSquares.exists({ x: this.x, y: 3 }) ||
                    posiblPiece.attackingSquares.exists({ x: this.x, y: 4 })
                  ) {
                    return false;
                  }
                }
              }
            }
          }
        }
        return true;
      }
      return false;
    }
  }

  if (
    (this.x + 1 == x || this.x - 1 == x || this.x == x) &&
    (this.y + 1 == y || this.y - 1 == y || this.y == y)
  ) {
  } else {
    return false;
  }

  return true;
};

// CommonJS export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = King;
}
