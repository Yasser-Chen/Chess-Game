function Board(board) {
  window.gameState = "playing";
  let bigBoardObject = this;
  this.movesCounter = 0;
  window.normalMovesCounter = 0;
  this.board = board;
  this.turn = "white";
  this.pieces = [];
  this.moves = [];
  this.timerWhite = startTimer(
    window.timeSetted + 0.5,
    function () {
      stallMate.play();
      bigBoardObject.playerWon("black", "on time");
    },
    $("#WhiteTimer")[0]
  );
  this.timerBlack = startTimer(
    window.timeSetted + 0.5,
    function () {
      stallMate.play();
      bigBoardObject.playerWon("white", "on time");
    },
    $("#BlackTimer")[0]
  );
  gameStarted.play();
  this.timerWhite.resume();
  this.timerBlack.pause();

  $(`.fg-${this.turn}`).draggable({
    drag: onPieceDrag,
    accept: "td",
    containment: "#game",
    stop: onPieceStopDrag,
    scroll: false,
  });

  $(`#game`).addClass(`role-${this.turn}`);
  $("td").droppable({
    drop: function (event, ui) {
      event.stopPropagation();
      let square = $(this);
      let piece = $(ui.draggable).data("piece");
      let x = +square.attr("x");
      let y = +square.attr("y");

      if (
        bigBoardObject.turn == piece.color &&
        (piece.x != x || piece.y != y)
      ) {
        //don't count useless moves

        //disallow everything if your king is or will be in check

        if (bigBoardObject.movesCounter == 30) {
          bigBoardObject.stallMate(
            "15 moves without moving a pawn or eating a piece"
          );
        }
        //else do this =>
        else if (
          piece.isLegal(bigBoardObject, x, y) &&
          !bigBoardObject.isCheckIfMovePlayed(piece, x, y)
        ) {
          if (
            piece.constructor.name == "Pawn" &&
            piece.isEnPassant(bigBoardObject, x, y)
          ) {
            bigBoardObject.attackPawnBeheindEnPassant(piece, x, y);
          }
          $(".incheck").removeClass("incheck");
          piece.x = x;
          piece.y = y;
          if (window.lastPawnMoved) {
            window.lastPawnMoved.cantEnpassant = true;
          }
          piece.firstMoveDone = true;

          if (piece.constructor.name == "Pawn") {
            window.lastPawnMoved = piece;
          }

          let currentMove = new Move(bigBoardObject),
            repetitionCounter = 1;
          for (const move of bigBoardObject.moves) {
            if (move.boardDescription == currentMove.boardDescription) {
              repetitionCounter++;
              if (repetitionCounter == 3) {
                bigBoardObject.stallMate("Draw by 3 times repeatition");
              }
            }
          }

          var soketObj = {
            x: $(piece.element).parent().attr("x"),
            y: $(piece.element).parent().attr("y"),
            newX: square.attr("x"),
            newY: square.attr("y"),
          };

          bigBoardObject.moveTo(piece, square);

          window.normalMovesCounter++;

          //detect if a checkmate was done
          if (
            piece.constructor.name == "Pawn" &&
            ((piece.x == 8 && piece.color == "black") ||
              (piece.x == 1 && piece.color == "white"))
          ) {
            $(`.fg-${bigBoardObject.turn}.ui-draggable`).draggable("destroy");

            if (window.isGameOnline && window.lastUpgradedPiece) {
              //put pieces here so that you do all the upgrading job in the listener
              piece.element.popover("dispose");
              let index = bigBoardObject.pieces.indexOf(piece);
              delete bigBoardObject.pieces[index];
              square.empty();
              bigBoardObject.add(
                new window[window.lastUpgradedPiece](
                  piece.x,
                  piece.y,
                  piece.color
                )
              );
              bigBoardObject.alterTurns();
              if (this.turn == "white") {
                this.timerWhite.resume();
                this.timerBlack.pause();
              } else if (this.turn == "black") {
                this.timerWhite.pause();
                this.timerBlack.resume();
              }

              window.lastUpgradedPiece = false;
            }

            window.humainIsUpgrading = true;
            let div = $("<div>");
            let btn = $(`<button class="btn btn-dark btn-select-piece">
                                          <i class="fas fa-chess-queen"></i>
                                      </button>`);
            btn.on("click", function () {
              piece.element.popover("dispose");
              let index = bigBoardObject.pieces.indexOf(piece);
              delete bigBoardObject.pieces[index];
              square.empty();
              bigBoardObject.add(new Queen(piece.x, piece.y, piece.color));
              if (window.isGameOnline) {
                soketObj.piece = "Queen";
                soketObj.type = "upgrade";
                window.gameSocket.send(
                  JSON.stringify({
                    chess_event: JSON.stringify(soketObj),
                  })
                );
              }
              bigBoardObject.alterTurns();
              if (this.turn == "white") {
                this.timerWhite.resume();
                this.timerBlack.pause();
              } else if (this.turn == "black") {
                this.timerWhite.pause();
                this.timerBlack.resume();
              }
              if (window.isGameVsBot) {
                window.humainIsUpgrading = false;
                botMove(bigBoardObject, "black");
              }
            });
            div.append(btn);
            btn = $(`<button class="btn btn-light btn-select-piece">
                                      <i class="fas fa-chess-knight"></i>
                                  </button>`);
            btn.on("click", function () {
              piece.element.popover("dispose");
              let index = bigBoardObject.pieces.indexOf(piece);
              delete bigBoardObject.pieces[index];
              square.empty();
              bigBoardObject.add(new Knight(piece.x, piece.y, piece.color));
              if (window.isGameOnline) {
                soketObj.piece = "Knight";
                soketObj.type = "upgrade";
                window.gameSocket.send(
                  JSON.stringify({
                    chess_event: JSON.stringify(soketObj),
                  })
                );
              }
              bigBoardObject.alterTurns();
              if (this.turn == "white") {
                this.timerWhite.resume();
                this.timerBlack.pause();
              } else if (this.turn == "black") {
                this.timerWhite.pause();
                this.timerBlack.resume();
              }
              if (window.isGameVsBot) {
                window.humainIsUpgrading = false;
                botMove(bigBoardObject, "black");
              }
            });
            div.append(btn);
            btn = $(`<button class="btn btn-dark btn-select-piece">
                                      <i class="fas fa-chess-rook"></i>
                                  </button>`);
            btn.on("click", function () {
              piece.element.popover("dispose");
              let index = bigBoardObject.pieces.indexOf(piece);
              delete bigBoardObject.pieces[index];
              square.empty();
              bigBoardObject.add(new Rook(piece.x, piece.y, piece.color));
              if (window.isGameOnline) {
                soketObj.piece = "Rook";
                soketObj.type = "upgrade";
                window.gameSocket.send(
                  JSON.stringify({
                    chess_event: JSON.stringify(soketObj),
                  })
                );
              }
              bigBoardObject.alterTurns();
              if (this.turn == "white") {
                this.timerWhite.resume();
                this.timerBlack.pause();
              } else if (this.turn == "black") {
                this.timerWhite.pause();
                this.timerBlack.resume();
              }
              if (window.isGameVsBot) {
                window.humainIsUpgrading = false;
                botMove(bigBoardObject, "black");
              }
            });
            div.append(btn);
            btn = $(`<button class="btn btn-light btn-select-piece">
                                      <i class="fas fa-chess-bishop"></i>
                                  </button>`);
            btn.on("click", function () {
              piece.element.popover("dispose");
              let index = bigBoardObject.pieces.indexOf(piece);
              delete bigBoardObject.pieces[index];
              square.empty();
              bigBoardObject.add(new Bishop(piece.x, piece.y, piece.color));
              if (window.isGameOnline) {
                soketObj.piece = "Bishop";
                soketObj.type = "upgrade";
                window.gameSocket.send(
                  JSON.stringify({
                    chess_event: JSON.stringify(soketObj),
                  })
                );
              }
              bigBoardObject.alterTurns();
              if (this.turn == "white") {
                this.timerWhite.resume();
                this.timerBlack.pause();
              } else if (this.turn == "black") {
                this.timerWhite.pause();
                this.timerBlack.resume();
              }
              if (window.isGameVsBot) {
                window.humainIsUpgrading = false;
                botMove(bigBoardObject, "black");
              }
            });
            div.append(btn);

            piece.element.popover({
              placement: "bottom",
              container: "body",
              html: true,
              content: div,
            });
            piece.element.popover("show");
          } else {
            if (window.isGameOnline) {
              window.gameSocket.send(
                JSON.stringify({
                  chess_event: JSON.stringify(soketObj),
                })
              );
            }
            bigBoardObject.alterTurns();
          }

          if (window.isGameVsBot) {
            if (window.BotPlaying) {
              window.BotPlaying = false;
            } else if (!window.humainIsUpgrading) {
              botMove(bigBoardObject, "black");
            }
          }
        }
      }
    },
  });
}
Board.prototype.attackPawnBeheindEnPassant = function (piece, x, y) {
  if (piece.color == "black") {
    let index = this.pieces.indexOf(this.pieceAtSquare(5, y));
    delete this.pieces[index];
    $(`td[x=5][y=${y}]`).empty();
  } else if (piece.color == "white") {
    let index = this.pieces.indexOf(this.pieceAtSquare(4, y));
    delete this.pieces[index];
    $(`td[x=4][y=${y}]`).empty();
  }
};

Board.prototype.isCheckIfMovePlayed = function (piece, x, y) {
  let king = null;
  let isCheckNow = false;
  for (const p of this.pieces) {
    if (p) {
      if (p.constructor.name == "King" && piece.color == p.color) {
        king = p;
        break;
      }
    }
  }
  //copying old active bord
  var AllpiecesBefore = [];
  for (i = 0; i < this.pieces.length; i++) {
    AllpiecesBefore[i] = this.pieces[i];
  }

  let pieceMove = board.pieceAtSquare(x, y),
    indexOfDelete = -1;
  let pieceX = piece.x;
  let pieceY = piece.y;

  piece.x = x;
  piece.y = y;
  if (pieceMove) {
    if (pieceMove.color != piece.color) {
      indexOfDelete = AllpiecesBefore.indexOf(pieceMove);
      this.pieces[AllpiecesBefore.indexOf(pieceMove)] = null;
    }
  }

  isCheckNow = this.inCheck(king.color, king.x, king.y);

  piece.x = pieceX;
  piece.y = pieceY;
  if (indexOfDelete != -1) {
    this.pieces[indexOfDelete] = AllpiecesBefore[indexOfDelete];
  }
  return isCheckNow;
};

Board.prototype.playerWon = function (color, reason) {
  window.gameState = "notPlaying";
  this.timerWhite.pause();
  this.timerBlack.pause();
  if (color == "white") {
    $(".overlay").html(
      '<div style="text-align:center;" ><b>White wins</b>' +
        `<br />${reason}</div>`
    );
  } else if (color == "black") {
    $(".overlay").html(
      '<div style="text-align:center;"><b>Black wins</b>' +
        `<br />${reason}</div>`
    );
  }
  $(".overlay").css("display", "flex");
};

Board.prototype.pieceAtSquare = function (x, y) {
  for (const piece of this.pieces) {
    if (piece) {
      if (piece.x == x && piece.y == y) {
        return piece;
      }
    }
  }
  return null;
};

Board.prototype.stallMate = function (reason) {
  window.gameState = "notPlaying";
  this.timerWhite.pause();
  this.timerBlack.pause();
  $(".overlay").html(
    '<div style="text-align:center;"><b>Stall Mate</b>' +
      `<br />${reason}</div>`
  );
  $(".overlay").css("display", "flex");
  stallMate.play();
};
Board.prototype.inCheck = function (color, Kx, Ky) {
  let square = $(`.king.fg-${this.turn}`).parent("td");
  let attrX, attrY;
  if (!(Kx && Ky)) {
    attrX = square.attr("x");
    attrY = square.attr("y");
  } else {
    attrX = Kx;
    attrY = Ky;
  }
  for (const piece of this.pieces) {
    if (piece) {
      if (piece.color != color) {
        piece.recalculateAttackingSquares(this);
        if (piece.attackingSquares.exists({ x: attrX, y: attrY })) {
          return true;
        }
      }
    }
  }
  return false;
};
Board.prototype.hasAuthMoves = function (color) {
  let king = null;
  for (const piece of this.pieces) {
    if (piece) {
      if (piece.constructor.name == "King" && piece.color == color) {
        king = piece;
        break;
      }
    }
  }
  //copying old active bord
  var AllpiecesBefore = [];
  for (i = 0; i < this.pieces.length; i++) {
    AllpiecesBefore[i] = this.pieces[i];
  }
  // look only for how to prevent it to the king
  for (const piece of AllpiecesBefore) {
    if (piece) {
      let oldAttacks = [];
      Object.assign(oldAttacks, piece.attackingSquares);
      let pieceX = piece.x,
        pieceY = piece.y;

      if (piece.color == color) {
        if (piece.constructor.name != "Pawn") {
          for (const attack of oldAttacks) {
            let indexOfDelete = -1;
            let p = this.pieceAtSquare(attack.x, attack.y);
            if (p) {
              if (p.color == color) {
                continue;
              } else {
                indexOfDelete = AllpiecesBefore.indexOf(p);
                this.pieces[AllpiecesBefore.indexOf(p)] = null;
              }
            }
            piece.x = attack.x;
            piece.y = attack.y;
            piece.recalculateAttackingSquares(this);

            let kingX = king.x,
              kingY = king.y;
            if (piece.constructor.name == "King") {
              kingX = attack.x;
              kingY = attack.y;
            }
            if (!this.inCheck(color, kingX, kingY)) {
              //recorrect changed data
              piece.x = pieceX;
              piece.y = pieceY;
              piece.attackingSquares = oldAttacks;
              this.pieces = AllpiecesBefore;
              return true;
            }
            if (indexOfDelete != -1) {
              this.pieces[indexOfDelete] = AllpiecesBefore[indexOfDelete];
            }
          }
        } else if (piece.constructor.name == "Pawn") {
          let forwardOnly;
          if (piece.color == "black") {
            forwardOnly = function (a, b) {
              return a + b;
            };
          } else if (piece.color == "white") {
            forwardOnly = function (a, b) {
              return a - b;
            };
          }

          let pieceMove;

          pieceMove = board.pieceAtSquare(forwardOnly(piece.x, 1), piece.y);
          piece.x = forwardOnly(piece.x, 1);
          if (!pieceMove) {
            if (!this.inCheck(color, king.x, king.y)) {
              //recorrect changed data
              piece.x = pieceX;
              piece.y = pieceY;
              piece.attackingSquares = oldAttacks;
              this.pieces = AllpiecesBefore;
              return true;
            }
            if (
              (piece.color == "black" && piece.x == 2) ||
              (piece.color == "white" && piece.x == 7)
            ) {
              pieceMove = board.pieceAtSquare(forwardOnly(piece.x, 2), piece.y);
              piece.x = forwardOnly(piece.x, 2);
              if (!pieceMove) {
                if (!this.inCheck(color, king.x, king.y)) {
                  //recorrect changed data
                  piece.x = pieceX;
                  piece.y = pieceY;
                  piece.attackingSquares = oldAttacks;
                  this.pieces = AllpiecesBefore;
                  return true;
                }
              }
            }
          }
          piece.x = pieceX;
          piece.y = pieceY;
          pieceMove = board.pieceAtSquare(forwardOnly(piece.x, 1), piece.y + 1);
          let indexOfDelete = -1;
          piece.x = forwardOnly(piece.x, 1);
          piece.y = piece.y + 1;
          if (pieceMove) {
            if (pieceMove.color != color) {
              indexOfDelete = AllpiecesBefore.indexOf(pieceMove);
              this.pieces[AllpiecesBefore.indexOf(pieceMove)] = null;
              if (!this.inCheck(color, king.x, king.y)) {
                //recorrect changed data
                piece.x = pieceX;
                piece.y = pieceY;
                piece.attackingSquares = oldAttacks;
                this.pieces = AllpiecesBefore;
                return true;
              }
            }
          }
          piece.x = pieceX;
          piece.y = pieceY;
          pieceMove = board.pieceAtSquare(forwardOnly(piece.x, 1), piece.y - 1);
          piece.x = forwardOnly(piece.x, 1);
          piece.y = piece.y - 1;
          if (pieceMove) {
            if (pieceMove.color != color) {
              indexOfDelete = AllpiecesBefore.indexOf(pieceMove);
              this.pieces[AllpiecesBefore.indexOf(pieceMove)] = null;
              if (!this.inCheck(color, king.x, king.y)) {
                //recorrect changed data
                piece.x = pieceX;
                piece.y = pieceY;
                piece.attackingSquares = oldAttacks;
                this.pieces = AllpiecesBefore;
                return true;
              }
            }
          }
          if (indexOfDelete != -1) {
            this.pieces[indexOfDelete] = AllpiecesBefore[indexOfDelete];
          }
        }
      }
      piece.x = pieceX;
      piece.y = pieceY;
      piece.attackingSquares = oldAttacks;
    }
  }
  this.pieces = AllpiecesBefore;
  return false;
};
Board.prototype.resetAttacks = function () {
  for (const piece of this.pieces) {
    if (piece) {
      piece.recalculateAttackingSquares(this);
    }
  }
};
Board.prototype.add = function (piece) {
  this.pieces.push(piece);
  $(`td[x=${piece.x}][y=${piece.y}]`).html(piece.element);
};
Board.prototype.alterTurns = function () {
  this.turn = this.turn == "white" ? "black" : "white";

  let inCheck = this.inCheck(this.turn);

  let playCheckSound = false;
  if (inCheck) {
    $(`.king.fg-${this.turn}`).parent("td").addClass("incheck");
    playCheckSound = true;
  }
  let hasAuthMoves = this.hasAuthMoves(this.turn);

  //if can't play and check = check mate
  if (inCheck && !hasAuthMoves) {
    playCheckSound = false;
    checkMate.play();
    this.playerWon(this.turn == "white" ? "black" : "white", ` by checkmate`);
  } else if (!hasAuthMoves) {
    this.stallMate(`No legal move left for ${this.turn}`);
  }

  if (playCheckSound) {
    check.play();
  }

  $(`.fg-${this.turn == "white" ? "black" : "white"}.ui-draggable`).draggable(
    "destroy"
  );

  if (this.turn == "white" && $(".popover.show").length == 0) {
    this.timerWhite.resume();
    this.timerBlack.pause();
  } else if (this.turn == "black" && $(".popover.show").length == 0) {
    this.timerWhite.pause();
    this.timerBlack.resume();
  }

  if (window.isGameOnline) {
    $(`i.ui-draggable`).draggable("destroy");
    if (window.playAs == this.turn) {
      $(`.fg-${this.turn}`).draggable({
        drag: onPieceDrag,
        accept: "td",
        containment: "#game",
        stop: onPieceStopDrag,
        scroll: false,
      });
    }
  } else {
    $(`.fg-${this.turn}`).draggable({
      drag: onPieceDrag,
      accept: "td",
      containment: "#game",
      stop: onPieceStopDrag,
      scroll: false,
    });
  }

  $(`#game`).removeClass("role-black role-white");
  $(`#game`).addClass(`role-${this.turn}`);
};
Board.prototype.moveTo = function (piece, square) {
  $(piece.element).css({
    top: "0px",
    left: "0px",
  });
  let oldPiece = ($(square).find("i") ?? { data: () => {} }).data("piece");
  let oldIndex = this.pieces.indexOf(oldPiece);

  if (
    oldPiece &&
    piece.color == oldPiece.color &&
    piece.x == oldPiece.x &&
    piece.constructor.name == "King" &&
    oldPiece.constructor.name == "Rook"
  ) {
    let rookWasOnHFile = oldPiece.y == 8;
    
    if (rookWasOnHFile) {
      // Short castling
      piece.y = 7;
      oldPiece.y = 6;
    } else {
      // Long castling
      piece.y = 3;
      oldPiece.y = 4;
    }
    
    piece.firstMoveDone = true;
    oldPiece.firstMoveDone = true;
    
    let kingEl = $(piece.element).detach();
    kingEl.css({
      top: "0px",
      left: "0px",
    });
    kingEl.draggable({
      drag: onPieceDrag,
      accept: "td",
      containment: "#game",
      stop: onPieceStopDrag,
      scroll: false,
    });
    piece.element = kingEl[0];
    
    let rookEl = $(oldPiece.element).detach();
    rookEl.css({
      top: "0px",
      left: "0px",
    });
    rookEl.draggable({
      drag: onPieceDrag,
      accept: "td",
      containment: "#game",
      stop: onPieceStopDrag,
      scroll: false,
    });
    oldPiece.element = rookEl[0];
    
    $(`td[x=${piece.x}][y=${piece.y}]`).append(kingEl);
    $(`td[x=${oldPiece.x}][y=${oldPiece.y}]`).append(rookEl);

    piece.recalculateAttackingSquares(this);
    oldPiece.recalculateAttackingSquares(this);

    castel.play();
    this.movesCounter = 0;
  } else {
    if (oldIndex != -1) {
      this.movesCounter = 0;
      this.pieces[oldIndex] = null;
      eat.play();
      $(square).empty();
    } else {
      movePlayed.play();
    }

    let a = $(piece.element).detach();
    a.draggable({
      drag: onPieceDrag,
      accept: "td",
      containment: "#game",
      stop: onPieceStopDrag,
      scroll: false,
    });
    piece.element = a;

    //15 rule
    if (piece.constructor.name == "Pawn") {
      this.movesCounter = 0;
    }

    piece.recalculateAttackingSquares(this);
    $(square).append(a);
  }

  this.moves.push(new Move(this));

  this.movesCounter++;
};
