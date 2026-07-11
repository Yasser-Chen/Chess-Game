const FIFTY_MOVE_RULE_HALFMOVES = 100;
const SEVENTY_FIVE_MOVE_RULE_HALFMOVES = 150;

function getPieceConstructorByName(name) {
  if (!name) return null;

  if (typeof window != "undefined" && window[name]) {
    return window[name];
  }

  if (typeof globalThis != "undefined" && globalThis[name]) {
    return globalThis[name];
  }

  return null;
}

function cloneLastMoveSquares(squares) {
  return (squares || []).map(function (square) {
    return {
      x: square.x,
      y: square.y,
      role: square.role,
    };
  });
}

function animatePieceTranslation(sourceElement, fromRect, toRect, finalElement) {
  const moveAnimationDuration =
    typeof animationTime != "undefined" ? animationTime : 100;
  if (
    !sourceElement ||
    !fromRect ||
    !toRect ||
    !fromRect.width ||
    !fromRect.height ||
    !toRect.width ||
    !toRect.height
  ) {
    if (finalElement) {
      finalElement.css({ opacity: "" });
    }
    return null;
  }

  const gameElement =
    typeof document != "undefined" ? document.getElementById("game") : null;
  const sourceStyles =
    typeof window != "undefined" && typeof window.getComputedStyle == "function"
      ? window.getComputedStyle(sourceElement)
      : null;
  const sourceFontSize = sourceStyles && sourceStyles.fontSize ? sourceStyles.fontSize : `${fromRect.height}px`;

  const ghost = $("<div>");
  const ghostPiece = $(sourceElement).clone(false, false);
  ghostPiece.removeAttr("id");
  ghostPiece
    .removeClass("ui-draggable ui-draggable-handle ui-draggable-dragging")
    .css({
      position: "static",
      top: "0px",
      left: "0px",
      width: "100%",
      height: "100%",
      margin: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: sourceFontSize,
      lineHeight: 1,
      transform: "none",
    });

  ghost.addClass("chess-move-ghost").css({
    position: "fixed",
    top: `${fromRect.top}px`,
    left: `${fromRect.left}px`,
    width: `${fromRect.width}px`,
    height: `${fromRect.height}px`,
    margin: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    pointerEvents: "none",
    opacity: 1,
    transition: `transform ${moveAnimationDuration}ms ease-out, opacity ${moveAnimationDuration}ms ease-out`,
    transform: "translate3d(0, 0, 0)",
    overflow: "hidden",
  });
  ghost.append(ghostPiece);
  $(gameElement || document.body).append(ghost);

  if (finalElement) {
    finalElement.css({ opacity: 0 });
  }

  window.requestAnimationFrame(function () {
    window.requestAnimationFrame(function () {
      ghost.css({
        transform: `translate3d(${toRect.left - fromRect.left}px, ${toRect.top - fromRect.top}px, 0)`,
        opacity: 1,
      });
    });
  });

  setTimeout(function () {
    ghost.remove();
    if (finalElement) {
      finalElement.css({ opacity: "" });
    }
  }, moveAnimationDuration + 30);

  return ghost;
}

function snapshotPieceKey(pieceData) {
  if (!pieceData) return "";

  return [
    pieceData.color,
    pieceData.type,
    pieceData.x,
    pieceData.y,
    pieceData.firstMoveDone ? "moved" : "fresh",
    pieceData.cantEnpassant ? "no-ep" : "ep",
  ].join("|");
}

function snapshotPieceIdentity(pieceData) {
  if (!pieceData) return "";

  return [
    pieceData.color,
    pieceData.type,
  ].join("|");
}

function snapshotPieceLooseIdentity(pieceData) {
  if (!pieceData) return "";

  return [pieceData.color, pieceData.type].join("|");
}

function consumeMatchingSnapshotPiece(candidates, matcher) {
  for (let i = 0; i < candidates.length; i++) {
    if (matcher(candidates[i])) {
      return candidates.splice(i, 1)[0];
    }
  }

  return null;
}

function Board(board, playAs) {
  window.gameState = "playing";
  let bigBoardObject = this;
  this.movesCounter = 0;
  this.movesPlayedByColor = { white: 0, black: 0 };
  window.normalMovesCounter = 0;
  this.board = board;
  this.playAs = playAs;
  this.turn = "white";
  this.pieces = [];
  this.moves = [];
  this.positionHistory = [];
  this.positionHistoryIndex = -1;
  this.isHistoryPreview = false;
  this.pendingHistoryMove = null;
  this.pendingHistoryTurn = null;
  this.draggableUpdateTimer = null;
  this.gameOverBroadcasted = false;
  this.gameActionControlsElement = null;
  this.gameActionConfirmationElement = null;
  this.drawOfferElement = null;
  this.pendingDrawOffer = null;
  this.drawOfferSent = false;
  this.fiftyMoveDrawClaimElement = null;
  this.removeFiftyMoveDrawClaimButton();
  this.timerWhite = startTimer(
    window.timeSetted + 0.5,
    function () {
      playChessSound(stallMate);
      bigBoardObject.playerWon("black", "on time");
    },
    $("#WhiteTimer")[0]
  );
  this.timerBlack = startTimer(
    window.timeSetted + 0.5,
    function () {
      playChessSound(stallMate);
      bigBoardObject.playerWon("white", "on time");
    },
    $("#BlackTimer")[0]
  );
  playChessSound(gameStarted);
  this.timerWhite.resume();
  this.timerBlack.pause();

  const boardOrientation = playAs == "black" ? "black" : "white";
  $(`#game`)
    .removeClass("game-over role-black role-white play-as-black play-as-white history-preview")
    .addClass(`role-${this.turn} play-as-${boardOrientation}`);
  this.bindHistoryNavigationControls();
  $("td").droppable({
    drop: function (event, ui) {
      event.stopPropagation();
      let square = $(this);
      let piece = $(ui.draggable).data("piece");
      if (!piece) return;

      if (window.gameState != "playing") {
        bigBoardObject.resetPiecePosition(piece);
        bigBoardObject.disableDraggables($("i"));
        return;
      }

      let coordinates = bigBoardObject.coordinatesForSquare(square);
      let x = coordinates.x;
      let y = coordinates.y;

      if (!bigBoardObject.isInsideBoard(x, y)) {
        bigBoardObject.resetPiecePosition(piece);
        return;
      }

      if (
        bigBoardObject.turn == piece.color &&
        (piece.x != x || piece.y != y)
      ) {
        if (bigBoardObject.isHistoryPreview) {
          bigBoardObject.resetPiecePosition(piece);
          return;
        }

        const originX = piece.x;
        const originY = piece.y;

        //don't count useless moves

        //disallow everything if your king is or will be in check

        if (
          piece.isLegal(bigBoardObject, x, y) &&
          !bigBoardObject.isCheckIfMovePlayed(piece, x, y)
        ) {
          const targetPieceBeforeMove = bigBoardObject.pieceAtSquare(x, y);
          const isEnPassantMove =
            piece.constructor.name == "Pawn" &&
            piece.isEnPassant(bigBoardObject, x, y);
          const moveIsCapture =
            isEnPassantMove ||
            (targetPieceBeforeMove && targetPieceBeforeMove.color != piece.color);

          if (isEnPassantMove) {
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
            drawByRepetitionReason = null,
            repetitionCounter = 1;
          for (const move of bigBoardObject.moves) {
            if (move.boardDescription == currentMove.boardDescription) {
              repetitionCounter++;
              if (repetitionCounter == 3) {
                drawByRepetitionReason = "Draw by 3 times repeatition";
                break;
              }
            }
          }

          var soketObj = {
            x: originX,
            y: originY,
            newX: x,
            newY: y,
          };

          // Detect promotion before moveTo so quiet promotions can delay the
          // normal move sound until after the player chooses a piece.
          const pawnReachedPromotionRank =
            piece.constructor.name == "Pawn" &&
            ((piece.x == 8 && piece.color == "black") ||
              (piece.x == 1 && piece.color == "white"));
          const deferQuietPromotionMoveSound =
            pawnReachedPromotionRank && !moveIsCapture;

          bigBoardObject.moveTo(piece, square, {
            isCapture: moveIsCapture,
            deferMoveSound: deferQuietPromotionMoveSound,
            turnAfterMove: piece.color == "white" ? "black" : "white",
            animate: window.shouldAnimateProgrammaticMove === true || window.BotPlaying === true,
          });

          bigBoardObject.movesPlayedByColor[piece.color] =
            (bigBoardObject.movesPlayedByColor[piece.color] || 0) + 1;

          window.normalMovesCounter++;

          //detect if a pawn should be promoted
          if (pawnReachedPromotionRank) {
            const finishPromotion = function (PieceType, pieceName) {
              if (!bigBoardObject.promotePawn(piece, square, PieceType)) {
                return false;
              }

              bigBoardObject.recordCurrentPosition({
                turn: piece.color == "white" ? "black" : "white",
              });

              if (window.isGameOnline && pieceName) {
                soketObj.piece = pieceName;
                soketObj.type = "upgrade";
                if (!window.isApplyingRemoteMove) {
                  window.gameSocket.send(
                    JSON.stringify({
                      chess_event: JSON.stringify(soketObj),
                    })
                  );
                }
              }

              const turnCompleted = bigBoardObject.finishTurnAfterLegalMove(
                drawByRepetitionReason,
                piece.color
              );
              if (!turnCompleted) {
                return false;
              }

              if (deferQuietPromotionMoveSound && window.gameState == "playing") {
                if (typeof playMoveSoundWhenSettled == "function") {
                  playMoveSoundWhenSettled();
                } else {
                  playChessSound(movePlayed);
                }
              }
              return true;
            };

            if (window.isGameOnline && window.lastUpgradedPiece) {
              finishPromotion(window[window.lastUpgradedPiece] || Queen);
              window.lastUpgradedPiece = false;
            } else if (window.isGameVsBot && window.BotPlaying) {
              finishPromotion(Queen);
            } else {
              window.humainIsUpgrading = true;
              bigBoardObject.updateDraggables();
              let div = $("<div>");
              div.addClass("promotion-choice-popover-body");
              const promotionChoices = [
                { piece: Queen, name: "Queen", btnClass: "btn-dark", icon: "fa-chess-queen" },
                { piece: Knight, name: "Knight", btnClass: "btn-light", icon: "fa-chess-knight" },
                { piece: Rook, name: "Rook", btnClass: "btn-dark", icon: "fa-chess-rook" },
                { piece: Bishop, name: "Bishop", btnClass: "btn-light", icon: "fa-chess-bishop" },
              ];

              for (const choice of promotionChoices) {
                let btn = $(`<button class="btn ${choice.btnClass} btn-select-piece">
                                      <i class="fas ${choice.icon}"></i>
                                  </button>`);
                btn.on("click", function () {
                  window.humainIsUpgrading = false;
                  if (finishPromotion(choice.piece, choice.name) && window.isGameVsBot) {
                    botMove(bigBoardObject, "black");
                  }
                });
                div.append(btn);
              }

              $(piece.element).popover({
                placement: "bottom",
                container: "body",
                html: true,
                template:
                  '<div class="popover promotion-piece-popover" role="tooltip"><div class="arrow"></div><div class="popover-body"></div></div>',
                content: div,
              });
              $(piece.element).popover("show");
            }
          } else {
            if (window.isGameOnline && !window.isApplyingRemoteMove) {
              window.gameSocket.send(
                JSON.stringify({
                  chess_event: JSON.stringify(soketObj),
                })
              );
            }

            bigBoardObject.recordCurrentPosition({
              turn: piece.color == "white" ? "black" : "white",
            });

            if (!bigBoardObject.finishTurnAfterLegalMove(drawByRepetitionReason, piece.color)) {
              return;
            }
          }

          if (window.isGameVsBot && window.gameState == "playing") {
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
    this.getSquare(5, y).empty();
  } else if (piece.color == "white") {
    let index = this.pieces.indexOf(this.pieceAtSquare(4, y));
    delete this.pieces[index];
    this.getSquare(4, y).empty();
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
  for (let i = 0; i < this.pieces.length; i++) {
    AllpiecesBefore[i] = this.pieces[i];
  }

  let pieceMove = this.pieceAtSquare(x, y),
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
  const options = arguments[2] || {};
  const payload = {
    type: "game_over",
    result: "win",
    winner: color,
    reason: reason || "",
  };
  const shouldAnnounce = this.finalizeGame(payload);

  let resultHtml;
  if (color == "white") {
    resultHtml =
      '<div style="text-align:center;" ><b>White wins</b>' +
      `<br />${payload.reason}</div>`;
  } else if (color == "black") {
    resultHtml =
      '<div style="text-align:center;"><b>Black wins</b>' +
      `<br />${payload.reason}</div>`;
  }
  this.showGameOverOverlay(resultHtml);
  if (shouldAnnounce && typeof reason == "string" && /resign/i.test(reason)) {
    playChessSound(checkMate, { force: true });
  }
  this.broadcastGameOver(payload, options, shouldAnnounce);
};

Board.prototype.finalizeGame = function (payload) {
  const wasPlaying = window.gameState == "playing";
  window.gameState = "notPlaying";
  window.gameOverResult = payload || window.gameOverResult || { type: "game_over" };
  window.BotPlaying = false;
  window.humainIsUpgrading = false;
  window.pendingMoveSoundToken = null;
  this.removeFiftyMoveDrawClaimButton();
  this.removeGameActionControls();
  this.removeGameActionConfirmation();
  this.removeDrawOfferPrompt();

  if (this.draggableUpdateTimer) {
    clearTimeout(this.draggableUpdateTimer);
    this.draggableUpdateTimer = null;
  }

  this.cancelActiveDrag();
  this.disableDraggables($("i"));
  $(".possibleMove").removeClass("possibleMove");
  $(".incheck").removeClass("incheck");
  $(`#game`).removeClass("role-black role-white").addClass("game-over");

  try {
    if (typeof $("i").popover == "function") {
      $("i").popover("dispose");
    }
    if (typeof $(".popover").remove == "function") {
      $(".popover").remove();
    }
  } catch (e) {
    // Ignore Bootstrap popover cleanup differences between browser/test environments.
  }

  const stopTimer = function (timer) {
    if (!timer) return;
    if (typeof timer.stop == "function") {
      timer.stop();
    } else if (typeof timer.pause == "function") {
      timer.pause();
    }
  };

  stopTimer(this.timerWhite);
  stopTimer(this.timerBlack);

  if (typeof window.stopClockSync == "function") {
    window.stopClockSync();
  }

  if (wasPlaying && typeof window.dispatchEvent == "function") {
    try {
      window.dispatchEvent(new CustomEvent("chess:game-over", { detail: window.gameOverResult }));
    } catch (e) {
      // CustomEvent is not available in every test environment.
    }
  }

  return wasPlaying;
};

Board.prototype.broadcastGameOver = function (payload, options, shouldAnnounce) {
  options = options || {};

  if (
    options.broadcast === false ||
    !shouldAnnounce ||
    this.gameOverBroadcasted ||
    window.isApplyingRemoteMove ||
    !window.isGameOnline ||
    !window.gameSocket ||
    window.gameSocket.readyState !== 1
  ) {
    return;
  }

  this.gameOverBroadcasted = true;
  window.gameSocket.send(
    JSON.stringify({
      chess_event: JSON.stringify(payload),
    })
  );
};

Board.prototype.applyGameOver = function (payload) {
  payload = payload || {};
  this.gameOverBroadcasted = true;

  if (payload.result == "draw" || !payload.winner) {
    this.stallMate(payload.reason || "Game ended", { broadcast: false });
    return;
  }

  this.playerWon(payload.winner, payload.reason || "", { broadcast: false });
};

Board.prototype.getLocalActionColor = function () {
  if (window.gameState != "playing" || this.isHistoryPreview) return null;
  if (window.humainIsUpgrading || $(".popover.show").length > 0) return null;

  if (window.isGameVsBot) {
    return "white";
  }

  if (window.isGameOnline) {
    return window.playAs || this.playAs || null;
  }

  return this.turn;
};

Board.prototype.canColorAct = function (color) {
  if (!color || window.gameState != "playing" || this.isHistoryPreview) return false;
  if (window.humainIsUpgrading || $(".popover.show").length > 0) return false;

  if (window.isGameVsBot) {
    return color == "white";
  }

  if (window.isGameOnline) {
    const playAs = window.playAs || this.playAs;
    return color == playAs;
  }

  return color == "white" || color == "black";
};

Board.prototype.canColorAbort = function (color) {
  if (!this.canColorAct(color)) return false;
  return (this.movesPlayedByColor[color] || 0) === 0;
};

Board.prototype.canColorOfferDraw = function (color) {
  if (!this.canColorAct(color)) return false;
  if (window.isGameVsBot) return false;
  if ((this.movesPlayedByColor[color] || 0) === 0) return false;
  return !this.drawOfferSent && !this.pendingDrawOffer;
};

Board.prototype.canColorResign = function (color) {
  return this.canColorAct(color);
};

Board.prototype.canLocalPlayerAbort = function () {
  const color = this.getLocalActionColor();
  if (!color) return false;
  return this.canColorAbort(color);
};

Board.prototype.canLocalPlayerOfferDraw = function () {
  const color = this.getLocalActionColor();
  return this.canColorOfferDraw(color);
};

Board.prototype.canLocalPlayerResign = function () {
  const color = this.getLocalActionColor();
  return this.canColorResign(color);
};

Board.prototype.sendChessEvent = function (payload) {
  if (!window.isGameOnline || !window.gameSocket || window.gameSocket.readyState !== 1) {
    return false;
  }

  window.gameSocket.send(
    JSON.stringify({
      chess_event: JSON.stringify(payload),
    })
  );
  return true;
};

Board.prototype.abortGame = function (color) {
  color = color || this.getLocalActionColor();
  if (!this.canColorAbort(color)) return false;
  this.removeGameActionConfirmation();
  this.stallMate(`${this.capitalizeColor(color)} aborted before making a move`);
  return true;
};

Board.prototype.resignGame = function (color) {
  color = color || this.getLocalActionColor();
  if (!this.canColorResign(color)) return false;

  const winner = color == "white" ? "black" : "white";
  this.removeGameActionConfirmation();
  this.playerWon(winner, `${this.capitalizeColor(color)} resigned`);
  return true;
};

Board.prototype.offerDraw = function (color) {
  color = color || this.getLocalActionColor();
  if (!this.canColorOfferDraw(color)) return false;

  this.removeGameActionConfirmation();

  if (window.isGameOnline) {
    if (!this.sendChessEvent({ type: "draw_offer", offered_by: color })) {
      return false;
    }
    this.drawOfferSent = true;
    this.updateGameActionControls();
    return true;
  }

  this.pendingDrawOffer = { offered_by: color };
  this.showDrawOfferPrompt(this.pendingDrawOffer);
  this.updateGameActionControls();
  return true;
};

Board.prototype.receiveDrawOffer = function (payload) {
  if (window.gameState != "playing") return;
  payload = payload || {};
  const localColor = this.getLocalActionColor();
  if (payload.offered_by && payload.offered_by == localColor) return;
  this.pendingDrawOffer = payload;
  this.showDrawOfferPrompt(payload);
  this.updateGameActionControls();
};

Board.prototype.receiveDrawDeclined = function () {
  this.drawOfferSent = false;
  this.updateGameActionControls("Draw declined");
};

Board.prototype.acceptDrawOffer = function () {
  if (!this.pendingDrawOffer) return false;
  const offeredBy = this.pendingDrawOffer.offered_by || "Opponent";
  const reason = `Draw agreed by ${this.capitalizeColor(offeredBy)} offer`;
  this.pendingDrawOffer = null;
  this.removeDrawOfferPrompt();
  this.stallMate(reason);
  return true;
};

Board.prototype.declineDrawOffer = function () {
  if (!this.pendingDrawOffer) return false;
  this.pendingDrawOffer = null;
  this.removeDrawOfferPrompt();
  if (window.isGameOnline) {
    this.sendChessEvent({ type: "draw_declined", declined_by: this.getLocalActionColor() });
  }
  this.updateGameActionControls();
  return true;
};

Board.prototype.removeDrawOfferPrompt = function () {
  if (this.drawOfferElement && typeof this.drawOfferElement.remove == "function") {
    this.drawOfferElement.remove();
  }
  this.drawOfferElement = null;
  $("#drawOfferPrompt").remove();
};

Board.prototype.showDrawOfferPrompt = function (payload) {
  const offeredBy = payload && payload.offered_by ? payload.offered_by : "opponent";
  const targetColor = offeredBy == "white" ? "black" : "white";
  const host = $(`#${this.capitalizeColor(targetColor)}GameActions`);
  if (!host || !host.length) return;

  this.removeDrawOfferPrompt();
  const prompt = $(
    `<div id="drawOfferPrompt" class="draw-offer-prompt-inline">
      <span class="draw-offer-message"><i class="fas fa-handshake"></i> ${this.capitalizeColor(offeredBy)} offered draw</span>
      <div class="clock-action-row">
        <span role="button" tabindex="0" class="clock-action-link accept-draw-offer" id="acceptDrawOfferBtn"><i class="fas fa-check"></i> accept</span>
        <span role="button" tabindex="0" class="clock-action-link decline-draw-offer" id="declineDrawOfferBtn"><i class="fas fa-times"></i> decline</span>
      </div>
    </div>`
  );

  prompt.find("#acceptDrawOfferBtn").on("click", () => this.acceptDrawOffer());
  prompt.find("#declineDrawOfferBtn").on("click", () => this.declineDrawOffer());
  host.append(prompt);
  this.drawOfferElement = prompt;
};

Board.prototype.removeGameActionConfirmation = function () {
  if (this.gameActionConfirmationElement && typeof this.gameActionConfirmationElement.remove == "function") {
    this.gameActionConfirmationElement.remove();
  }
  this.gameActionConfirmationElement = null;
  try {
    if (this.gameActionConfirmationTrigger && typeof this.gameActionConfirmationTrigger.popover == "function") {
      this.gameActionConfirmationTrigger.popover("dispose");
    }
  } catch (e) {
    // Ignore Bootstrap popover cleanup differences between browser/test environments.
  }
  this.gameActionConfirmationTrigger = null;
  $("#gameActionConfirmation").remove();
};

Board.prototype.showGameActionConfirmation = function (color, actionName, message, onConfirm) {
  if (!this.canColorAct(color)) return false;

  const host = $(`#${this.capitalizeColor(color)}GameActions`);
  if (!host || !host.length) return false;
  const trigger = host.find(`.${actionName.replace(/\s+/g, "-")}-game-action, .${actionName.replace(/\s+/g, "-")}-action`).first();

  this.removeGameActionConfirmation();

  const prompt = $(
    `<div id="gameActionConfirmation" class="game-action-confirmation-popover">
      <div class="game-action-confirmation-message"><i class="fas fa-question-circle"></i> ${message}</div>
      <div class="game-action-confirmation-buttons">
        <button type="button" class="game-action-confirmation-button confirm-game-action" title="Confirm ${actionName}" aria-label="Confirm ${actionName}">
          <i class="fas fa-check"></i>
        </button>
        <button type="button" class="game-action-confirmation-button cancel-game-action" title="Cancel" aria-label="Cancel">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>`
  );

  prompt.find(".confirm-game-action").on("click", () => {
    this.removeGameActionConfirmation();
    if (typeof onConfirm == "function") {
      onConfirm();
    }
  });
  prompt.find(".cancel-game-action").on("click", () => this.removeGameActionConfirmation());

  if (trigger.length && typeof trigger.popover == "function") {
    trigger.popover({
      placement: color == "white" ? "top" : "bottom",
      container: "body",
      html: true,
      content: prompt,
    });
    trigger.popover("show");
    this.gameActionConfirmationTrigger = trigger;
  } else {
    host.append(prompt);
  }
  this.gameActionConfirmationElement = prompt;
  return true;
};

Board.prototype.confirmAbortGame = function (color) {
  color = color || this.getLocalActionColor();
  if (!this.canColorAbort(color)) return false;

  return this.showGameActionConfirmation(
    color,
    "abort",
    "Are you sure you want to abort this game?",
    () => this.abortGame(color)
  );
};

Board.prototype.confirmOfferDraw = function (color) {
  color = color || this.getLocalActionColor();
  if (!this.canColorOfferDraw(color)) return false;

  return this.showGameActionConfirmation(
    color,
    "offer draw",
    "Are you sure you want to offer a draw?",
    () => this.offerDraw(color)
  );
};

Board.prototype.confirmResignGame = function (color) {
  color = color || this.getLocalActionColor();
  if (!this.canColorResign(color)) return false;

  return this.showGameActionConfirmation(
    color,
    "resign",
    "Are you sure you want to resign?",
    () => this.resignGame(color)
  );
};

Board.prototype.removeGameActionControls = function () {
  if (this.gameActionControlsElement && typeof this.gameActionControlsElement.remove == "function") {
    this.gameActionControlsElement.remove();
  }
  this.gameActionControlsElement = null;
  this.removeGameActionConfirmation();
  $("#gameActionControls").remove();
  $("#WhiteGameActions, #BlackGameActions").empty();
};

Board.prototype.updateGameActionControls = function (statusText) {
  if (window.gameState != "playing") {
    this.removeGameActionControls();
    return;
  }

  const renderForColor = (color) => {
    const host = $(`#${this.capitalizeColor(color)}GameActions`);
    if (!host || !host.length) return;

    host.children(".clock-action-row, .game-action-status").remove();

    if (!this.canColorAct(color)) {
      return;
    }

    const canAbort = this.canColorAbort(color);
    const canDraw = this.canColorOfferDraw(color);
    const canResign = this.canColorResign(color);
    const actionRow = $('<div class="clock-action-row"></div>');

    if (canAbort) {
      const abort = $(`<span role="button" tabindex="0" class="clock-action-link abort-game-action"><i class="fas fa-flag"></i> abort</span>`);
      abort.on("click", () => this.confirmAbortGame(color));
      actionRow.append(abort);
    } else if (canDraw) {
      const draw = $(`<span role="button" tabindex="0" class="clock-action-link offer-draw-action"><i class="fas fa-handshake"></i> offer draw</span>`);
      draw.on("click", () => this.confirmOfferDraw(color));
      actionRow.append(draw);
    }

    if (!canAbort && canResign) {
      const resign = $(`<span role="button" tabindex="0" class="clock-action-link resign-game-action"><i class="fas fa-flag-checkered"></i> resign</span>`);
      resign.on("click", () => this.confirmResignGame(color));
      actionRow.append(resign);
    }

    if (actionRow.children().length) {
      host.append(actionRow);
    }

    if (statusText && this.canColorAct(color)) {
      host.append(`<div class="game-action-status">${statusText}</div>`);
    } else if (this.drawOfferSent && this.canColorAct(color)) {
      host.append(`<div class="game-action-status"><i class="fas fa-paper-plane"></i> draw offer sent</div>`);
    }
  };

  if (window.isGameOnline || window.isGameVsBot) {
    const color = this.getLocalActionColor();
    ["white", "black"].forEach((side) => {
      if (side != color) {
        $(`#${this.capitalizeColor(side)}GameActions`).children(".clock-action-row, .game-action-status").remove();
      }
    });
    if (color) renderForColor(color);
  } else {
    renderForColor("white");
    renderForColor("black");
  }
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

Board.prototype.isInsideBoard = function (x, y) {
  x = Number(x);
  y = Number(y);
  return Number.isInteger(x) && Number.isInteger(y) && x >= 1 && x <= 8 && y >= 1 && y <= 8;
};

Board.prototype.getSquare = function (x, y) {
  x = Number(x);
  y = Number(y);

  if (!this.isInsideBoard(x, y)) {
    return $("__missing_board_square__");
  }

  if (this.board && typeof this.board.find == "function") {
    const rowIndex = this.isFlipped ? 8 - x : x - 1;
    const columnIndex = this.isFlipped ? 8 - y : y - 1;
    const rows = this.board.find("tbody tr");
    const row = rows[rowIndex] || (typeof rows.get == "function" ? rows.get(rowIndex) : null);

    if (row) {
      const squares = $(row).find("td");
      const square = squares[columnIndex] || (typeof squares.get == "function" ? squares.get(columnIndex) : null);

      if (square) {
        return $(square);
      }
    }
  }

  return $(`td[x=${x}][y=${y}]`);
};

Board.prototype.coordinatesForSquare = function (square) {
  const squareElement = $(square)[0];
  const rowElement = squareElement && squareElement.parentElement;
  const rowContainer = rowElement && rowElement.parentElement;

  if (squareElement && rowElement && rowContainer) {
    const rowIndex = Array.prototype.indexOf.call(rowContainer.children, rowElement);
    const columnIndex = Array.prototype.indexOf.call(rowElement.children, squareElement);

    if (rowIndex >= 0 && columnIndex >= 0) {
      return {
        x: this.isFlipped ? 8 - rowIndex : rowIndex + 1,
        y: this.isFlipped ? 8 - columnIndex : columnIndex + 1,
      };
    }
  }

  return {
    x: Number($(square).attr("x")),
    y: Number($(square).attr("y")),
  };
};

Board.prototype.clearMoveHighlights = function () {
  const squares = this.board && typeof this.board.find == "function"
    ? this.board.find("td")
    : $("td");

  squares
    .removeClass("last-move")
    .removeClass("last-move-origin")
    .removeClass("last-move-destination");
};

Board.prototype.highlightMoveSquares = function (squares) {
  this.clearMoveHighlights();

  for (const squareInfo of squares || []) {
    if (!squareInfo || !this.isInsideBoard(squareInfo.x, squareInfo.y)) continue;

    const square = this.getSquare(squareInfo.x, squareInfo.y);
    if (!square.length) continue;

    square.addClass("last-move");
    if (squareInfo.role == "origin") {
      square.addClass("last-move-origin");
    } else if (squareInfo.role == "destination") {
      square.addClass("last-move-destination");
    }
  }
};

Board.prototype.bindHistoryNavigationControls = function () {
  const bigBoardObject = this;

  $("#historyBackBtn").off("click.chessHistory").on("click.chessHistory", function () {
    bigBoardObject.previewPositionBy(-1);
  });

  $("#historyForwardBtn").off("click.chessHistory").on("click.chessHistory", function () {
    bigBoardObject.previewPositionBy(1);
  });

  $(document)
    .off("keydown.chessHistoryNavigation")
    .on("keydown.chessHistoryNavigation", function (event) {
      if (!bigBoardObject || !bigBoardObject.positionHistory || !bigBoardObject.positionHistory.length) {
        return;
      }

      const target = event.target;
      const targetTag = target && target.tagName ? target.tagName.toLowerCase() : "";
      if (target && (target.isContentEditable || /input|textarea|select|button/.test(targetTag))) {
        return;
      }

      if (event.key == "ArrowLeft") {
        event.preventDefault();
        bigBoardObject.previewPositionBy(-1);
      } else if (event.key == "ArrowRight") {
        event.preventDefault();
        bigBoardObject.previewPositionBy(1);
      } else if (event.key == "Home") {
        event.preventDefault();
        bigBoardObject.previewPositionAt(0);
      } else if (event.key == "End") {
        event.preventDefault();
        bigBoardObject.previewPositionAt(bigBoardObject.positionHistory.length - 1);
      }
    });

  this.updateHistoryNavigationControls();
};

Board.prototype.updateHistoryNavigationControls = function () {
  const hasHistory = this.positionHistory && this.positionHistory.length > 0;
  const historyIndex = this.positionHistoryIndex >= 0 ? this.positionHistoryIndex : 0;
  const lastIndex = hasHistory ? this.positionHistory.length - 1 : 0;

  $("#historyBackBtn").prop("disabled", !hasHistory || historyIndex <= 0);
  $("#historyForwardBtn").prop("disabled", !hasHistory || historyIndex >= lastIndex);
};

Board.prototype.findPieceSnapshotDescriptor = function (piece) {
  if (!piece) return null;

  return {
    type: piece.constructor.name,
    color: piece.color,
    x: piece.x,
    y: piece.y,
    firstMoveDone: !!piece.firstMoveDone,
    cantEnpassant: !!piece.cantEnpassant,
  };
};

Board.prototype.findPieceFromSnapshotDescriptor = function (descriptor) {
  if (!descriptor) return null;

  for (const piece of this.pieces) {
    if (
      piece &&
      piece.constructor.name == descriptor.type &&
      piece.color == descriptor.color &&
      piece.x == descriptor.x &&
      piece.y == descriptor.y &&
      (!!piece.firstMoveDone == !!descriptor.firstMoveDone)
    ) {
      return piece;
    }
  }

  return null;
};

Board.prototype.captureCurrentPosition = function () {
  const pieces = [];

  for (const piece of this.pieces) {
    if (!piece) continue;
    pieces.push(this.findPieceSnapshotDescriptor(piece));
  }

  return {
    pieces: pieces,
    turn: this.turn,
    movesCounter: this.movesCounter,
    movesPlayedByColor: {
      white: this.movesPlayedByColor.white || 0,
      black: this.movesPlayedByColor.black || 0,
    },
    normalMovesCounter: window.normalMovesCounter || 0,
    lastPawnMoved: this.findPieceSnapshotDescriptor(window.lastPawnMoved),
    lastMove: cloneLastMoveSquares(this.pendingHistoryMove),
  };
};

Board.prototype.recordCurrentPosition = function (options) {
  options = options || {};

  if (!this.positionHistory) {
    this.positionHistory = [];
  }

  if (options.resetHistory) {
    this.positionHistory = [];
    this.positionHistoryIndex = -1;
  }

  const snapshot = this.captureCurrentPosition();
  snapshot.turn = options.turn || this.pendingHistoryTurn || snapshot.turn;

  if (this.positionHistoryIndex < this.positionHistory.length - 1) {
    this.positionHistory = this.positionHistory.slice(0, this.positionHistoryIndex + 1);
  }

  this.positionHistory.push(snapshot);
  this.positionHistoryIndex = this.positionHistory.length - 1;
  this.pendingHistoryMove = null;
  this.pendingHistoryTurn = null;
  this.isHistoryPreview = false;
  $("#game").removeClass("history-preview");
  this.updateHistoryNavigationControls();
  return snapshot;
};

Board.prototype.findHistorySnapshotAnimations = function (fromSnapshot, toSnapshot) {
  if (!fromSnapshot || !toSnapshot || !fromSnapshot.pieces || !toSnapshot.pieces) {
    return [];
  }

  const fromPieces = fromSnapshot.pieces.map(function (piece) {
    return Object.assign({}, piece);
  });
  const toPieces = toSnapshot.pieces.map(function (piece) {
    return Object.assign({}, piece);
  });

  for (let i = fromPieces.length - 1; i >= 0; i--) {
    const fromPiece = fromPieces[i];
    const matched = consumeMatchingSnapshotPiece(toPieces, function (toPiece) {
      return snapshotPieceKey(fromPiece) == snapshotPieceKey(toPiece);
    });

    if (matched) {
      fromPieces.splice(i, 1);
    }
  }

  const animations = [];

  for (const fromPiece of fromPieces) {
    const toPiece = consumeMatchingSnapshotPiece(toPieces, function (candidate) {
      return snapshotPieceIdentity(fromPiece) == snapshotPieceIdentity(candidate);
    });

    if (toPiece) {
      animations.push({ from: fromPiece, to: toPiece });
    }
  }

  for (const fromPiece of fromPieces) {
    const toPiece = consumeMatchingSnapshotPiece(toPieces, function (candidate) {
      return snapshotPieceLooseIdentity(fromPiece) == snapshotPieceLooseIdentity(candidate);
    });

    if (toPiece) {
      animations.push({ from: fromPiece, to: toPiece });
    }
  }

  return animations;
};

Board.prototype.captureHistoryAnimationSources = function (fromSnapshot, toSnapshot) {
  const animations = this.findHistorySnapshotAnimations(fromSnapshot, toSnapshot);
  const sources = [];

  for (const animation of animations) {
    const piece = this.pieceAtSquare(animation.from.x, animation.from.y);
    if (!piece || piece.color != animation.from.color || piece.constructor.name != animation.from.type) {
      continue;
    }

    if (!piece.element || typeof piece.element.getBoundingClientRect != "function") {
      continue;
    }

    const fromSquare = this.getSquare(animation.from.x, animation.from.y);
    sources.push({
      from: animation.from,
      to: animation.to,
      element: piece.element,
      fromRect:
        piece.element && typeof piece.element.getBoundingClientRect == "function"
          ? piece.element.getBoundingClientRect()
          : fromSquare[0] && typeof fromSquare[0].getBoundingClientRect == "function"
            ? fromSquare[0].getBoundingClientRect()
            : null,
    });
  }

  return sources;
};

Board.prototype.captureHistoryLastMoveAnimationSources = function (fromSnapshot, toSnapshot, direction) {
  const moveSquares =
    direction >= 0
      ? cloneLastMoveSquares(toSnapshot && toSnapshot.lastMove)
      : cloneLastMoveSquares(fromSnapshot && fromSnapshot.lastMove);

  if (!moveSquares || moveSquares.length < 2) {
    return [];
  }

  const origins = moveSquares.filter(function (square) {
    return square && square.role == "origin";
  });
  const destinations = moveSquares.filter(function (square) {
    return square && square.role == "destination";
  });

  const sources = [];
  const pairCount = Math.min(origins.length, destinations.length);

  for (let i = 0; i < pairCount; i++) {
    const fromSquareInfo = direction >= 0 ? origins[i] : destinations[i];
    const toSquareInfo = direction >= 0 ? destinations[i] : origins[i];
    if (!fromSquareInfo || !toSquareInfo) continue;

    const piece = this.pieceAtSquare(fromSquareInfo.x, fromSquareInfo.y);
    if (!piece || !piece.element || typeof piece.element.getBoundingClientRect != "function") {
      continue;
    }

    sources.push({
      from: this.findPieceSnapshotDescriptor(piece),
      to: {
        type: piece.constructor.name,
        color: piece.color,
        x: toSquareInfo.x,
        y: toSquareInfo.y,
      },
      element: piece.element,
      fromRect: piece.element.getBoundingClientRect(),
    });
  }

  return sources;
};

Board.prototype.playHistorySnapshotAnimations = function (sources) {
  for (const source of sources || []) {
    const targetSquare = this.getSquare(source.to.x, source.to.y);
    const finalElement = targetSquare.find("i").filter(function () {
      const piece = $(this).data("piece");
      return (
        piece &&
        piece.color == source.to.color &&
        piece.constructor.name == source.to.type
      );
    }).first();

    const targetElement = finalElement.length ? finalElement : targetSquare;
    const toRect =
      finalElement.length && typeof finalElement[0].getBoundingClientRect == "function"
        ? finalElement[0].getBoundingClientRect()
        : targetSquare[0] && typeof targetSquare[0].getBoundingClientRect == "function"
        ? targetSquare[0].getBoundingClientRect()
        : null;

    animatePieceTranslation(source.element, source.fromRect, toRect, targetElement);
  }
};

Board.prototype.applyPositionSnapshot = function (snapshot) {
  if (!snapshot || !snapshot.pieces) {
    return false;
  }

  this.cancelActiveDrag();
  this.disableDraggables($("i"));
  this.clearMoveHighlights();
  $("#board i").remove();
  this.pieces = [];

  for (const pieceData of snapshot.pieces) {
    const PieceType = getPieceConstructorByName(pieceData.type);
    if (!PieceType) continue;

    const piece = new PieceType(pieceData.x, pieceData.y, pieceData.color);
    piece.firstMoveDone = !!pieceData.firstMoveDone;
    if (Object.prototype.hasOwnProperty.call(pieceData, "cantEnpassant")) {
      piece.cantEnpassant = !!pieceData.cantEnpassant;
    }

    this.add(piece);
  }

  this.resetAttacks();
  this.turn = snapshot.turn || this.turn;
  this.movesCounter = snapshot.movesCounter || 0;
  this.movesPlayedByColor = {
    white: (snapshot.movesPlayedByColor && snapshot.movesPlayedByColor.white) || 0,
    black: (snapshot.movesPlayedByColor && snapshot.movesPlayedByColor.black) || 0,
  };
  window.normalMovesCounter = snapshot.normalMovesCounter || 0;
  window.lastPawnMoved = this.findPieceFromSnapshotDescriptor(snapshot.lastPawnMoved);

  this.highlightMoveSquares(snapshot.lastMove || []);
  this.isHistoryPreview = this.positionHistoryIndex < this.positionHistory.length - 1;
  $("#game").toggleClass("history-preview", this.isHistoryPreview);
  $("#game").removeClass("role-black role-white").addClass(`role-${this.turn}`);

  if (this.isHistoryPreview) {
    this.removeGameActionControls();
    this.removeFiftyMoveDrawClaimButton();
    this.disableDraggables($("i"));
  } else if (window.gameState == "playing") {
    this.updateFiftyMoveDrawClaimButton();
    this.updateGameActionControls();
    this.updateDraggables(true);
  }

  this.updateHistoryNavigationControls();
  return true;
};

Board.prototype.getHistoryPreviewSound = function (previousSnapshot, currentSnapshot) {
  if (!previousSnapshot || !currentSnapshot) return null;

  const previousPieces = previousSnapshot.pieces || [];
  const currentPieces = currentSnapshot.pieces || [];
  const moveSquares = currentSnapshot.lastMove || [];

  if (moveSquares.length === 4) {
    const destinationPieces = moveSquares
      .filter(function (square) {
        return square && square.role == "destination";
      })
      .map(
        function (square) {
          return this.pieceAtSquare(square.x, square.y);
        },
        this
      )
      .filter(Boolean);

    if (
      destinationPieces.length == 2 &&
      destinationPieces[0].color == destinationPieces[1].color &&
      ((destinationPieces[0].constructor.name == "King" && destinationPieces[1].constructor.name == "Rook") ||
        (destinationPieces[0].constructor.name == "Rook" && destinationPieces[1].constructor.name == "King"))
    ) {
      return castel;
    }
  }

  if (previousPieces.length > currentPieces.length) {
    return eat;
  }

  return movePlayed;
};

Board.prototype.playHistoryPreviewSound = function (previousSnapshot, currentSnapshot) {
  if (window.gameState != "playing" || !currentSnapshot) return;

  const primarySound = this.getHistoryPreviewSound(previousSnapshot, currentSnapshot);
  if (primarySound) {
    playChessSound(primarySound, { force: true });
  }

  const inCheck = this.inCheck(this.turn);
  const hasAuthMoves = this.hasAuthMoves(this.turn);

  if (inCheck && !hasAuthMoves) {
    if (typeof stopChessSounds == "function") {
      stopChessSounds(check);
    }
    playChessSound(checkMate, { force: true });
  } else if (!hasAuthMoves) {
    playChessSound(stallMate, { force: true });
  } else if (inCheck) {
    playChessSound(check, { force: true });
  }
};

Board.prototype.previewPositionAt = function (index) {
  if (!this.positionHistory || !this.positionHistory.length) {
    return false;
  }

  const previousIndex = this.positionHistoryIndex;
  const currentSnapshot =
    previousIndex >= 0 ? this.positionHistory[previousIndex] : this.captureCurrentPosition();
  const clampedIndex = Math.max(0, Math.min(index, this.positionHistory.length - 1));
  this.positionHistoryIndex = clampedIndex;
  const snapshot = this.positionHistory[clampedIndex];
  const previousSnapshot = clampedIndex > 0 ? this.positionHistory[clampedIndex - 1] : null;
  const previewDirection = clampedIndex > previousIndex ? 1 : -1;
  const animationSources =
    previousIndex !== clampedIndex
      ? this.captureHistoryLastMoveAnimationSources(currentSnapshot, snapshot, previewDirection)
      : [];
  const fallbackAnimationSources =
    previousIndex !== clampedIndex && !animationSources.length
      ? this.captureHistoryAnimationSources(currentSnapshot, snapshot)
      : [];
  const applied = this.applyPositionSnapshot(snapshot);

  if (applied && (animationSources.length || fallbackAnimationSources.length)) {
    this.playHistorySnapshotAnimations(
      animationSources.length ? animationSources : fallbackAnimationSources
    );
  }

  if (clampedIndex == this.positionHistory.length - 1 && window.gameState == "playing") {
    this.isHistoryPreview = false;
    $("#game").removeClass("history-preview");
    this.updateDraggables(true);
  }

  if (applied && previousIndex !== clampedIndex && window.gameState == "playing") {
    this.playHistoryPreviewSound(previousSnapshot, snapshot);
  }

  return applied;
};

Board.prototype.previewPositionBy = function (offset) {
  if (!this.positionHistory || !this.positionHistory.length) {
    return false;
  }

  const currentIndex = this.positionHistoryIndex >= 0 ? this.positionHistoryIndex : this.positionHistory.length - 1;
  return this.previewPositionAt(currentIndex + offset);
};

Board.prototype.resetPiecePosition = function (piece) {
  if (!piece || !piece.element) return;
  $(piece.element).css({
    top: "0px",
    left: "0px",
  });
};

Board.prototype.promotePawn = function (pawn, square, PieceType) {
  if (!pawn || !PieceType || !this.isInsideBoard(pawn.x, pawn.y)) {
    console.warn("Ignored pawn promotion with invalid data", { pawn, PieceType });
    return null;
  }

  let targetSquare = square && square.length ? square : this.getSquare(pawn.x, pawn.y);
  if (!targetSquare.length) {
    console.warn("Ignored pawn promotion because the target square is not rendered", {
      x: pawn.x,
      y: pawn.y,
    });
    return null;
  }

  if (pawn.element && typeof $(pawn.element).popover == "function") {
    $(pawn.element).popover("dispose");
  }

  let index = this.pieces.indexOf(pawn);
  if (index != -1) {
    this.pieces[index] = null;
  }

  targetSquare.empty();
  let promotedPiece = new PieceType(pawn.x, pawn.y, pawn.color);
  this.add(promotedPiece);
  return promotedPiece;
};


Board.prototype.getMoveCountDrawFullMoves = function () {
  return Math.floor(this.movesCounter / 2);
};

Board.prototype.canClaimFiftyMoveDraw = function () {
  return (
    !this.isHistoryPreview &&
    window.gameState == "playing" &&
    this.movesCounter >= FIFTY_MOVE_RULE_HALFMOVES &&
    this.movesCounter < SEVENTY_FIVE_MOVE_RULE_HALFMOVES
  );
};

Board.prototype.getLocalDrawClaimColor = function () {
  if (window.gameState != "playing") {
    return null;
  }

  if (window.humainIsUpgrading || $(".popover.show").length > 0) {
    return null;
  }

  if (window.isGameVsBot) {
    return null;
  }

  if (window.isGameOnline) {
    const playAs = window.playAs || this.playAs;
    return playAs == this.turn ? this.turn : null;
  }

  return this.turn;
};

Board.prototype.getCurrentDrawClaimColor = function () {
  const claimingColor = this.getLocalDrawClaimColor();
  return claimingColor && claimingColor == this.turn ? claimingColor : null;
};

Board.prototype.getVisualSideForColor = function (color) {
  if (color == "white") {
    return this.isFlipped ? "top" : "bottom";
  }

  if (color == "black") {
    return this.isFlipped ? "bottom" : "top";
  }

  return "bottom";
};

Board.prototype.capitalizeColor = function (color) {
  return color ? `${color.charAt(0).toUpperCase()}${color.slice(1)}` : "Player";
};

Board.prototype.getFiftyMoveDrawReason = function (claimingColor) {
  const fullMoves = this.getMoveCountDrawFullMoves();
  const claimant = claimingColor
    ? `${this.capitalizeColor(claimingColor)} claimed a draw`
    : "Draw claimed";

  return `${claimant} by the 50-move rule (${fullMoves} full moves without a pawn move or capture)`;
};

Board.prototype.getSeventyFiveMoveDrawReason = function () {
  const fullMoves = this.getMoveCountDrawFullMoves();
  return `Automatic draw by the 75-move rule (${fullMoves} full moves without a pawn move or capture)`;
};

Board.prototype.removeFiftyMoveDrawClaimButton = function () {
  const removeElements = function (elements) {
    if (!elements) return;

    if (typeof elements.remove == "function") {
      elements.remove();
      return;
    }

    if (elements.length !== undefined) {
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i] && (elements[i]._element || elements[i]);
        if (element && element.parentNode) {
          element.parentNode.removeChild(element);
        }
      }
    }
  };

  removeElements(this.fiftyMoveDrawClaimElement);

  if (typeof document != "undefined") {
    removeElements(document.querySelectorAll("#fiftyMoveDrawClaim, .fifty-move-draw-claim"));
  }

  this.fiftyMoveDrawClaimElement = null;
};

Board.prototype.showFiftyMoveDrawClaimButton = function () {
  if (!this.canClaimFiftyMoveDraw() || window.isGameVsBot) {
    this.removeFiftyMoveDrawClaimButton();
    return;
  }

  const game = $("#game");
  if (!game || !game.length) return;

  const boardArea = $("#boardArea");
  const drawClaimHost = boardArea && boardArea.length ? boardArea : game;

  this.removeFiftyMoveDrawClaimButton();

  const claimingColor = this.getCurrentDrawClaimColor();
  if (!claimingColor) {
    return;
  }

  const visualSide = this.getVisualSideForColor(claimingColor);
  const container = $(
    `<div id="fiftyMoveDrawClaim" class="fifty-move-draw-claim fifty-move-draw-claim-${claimingColor} fifty-move-draw-claim-${visualSide}" data-claim-color="${claimingColor}" role="group" aria-label="${this.capitalizeColor(claimingColor)} 50-move rule draw claim"></div>`
  );

  const button = $(
    `<button type="button" class="btn btn-warning fifty-move-draw-claim-button">
      ${this.capitalizeColor(claimingColor)} claim draw
    </button>`
  );

  if (typeof button.on == "function") {
    button.on("click", () => {
      this.claimFiftyMoveDraw(claimingColor);
    });
  } else if (button[0]) {
    button[0].onclick = () => this.claimFiftyMoveDraw(claimingColor);
  }

  container.append(button);
  drawClaimHost.append(container);
  this.fiftyMoveDrawClaimElement = container;
};

Board.prototype.updateFiftyMoveDrawClaimButton = function () {
  if (this.canClaimFiftyMoveDraw() && !window.isGameVsBot && this.getCurrentDrawClaimColor()) {
    this.showFiftyMoveDrawClaimButton();
  } else {
    this.removeFiftyMoveDrawClaimButton();
  }
};

Board.prototype.claimFiftyMoveDraw = function (claimingColor) {
  if (!this.canClaimFiftyMoveDraw()) return false;

  const activeClaimingColor = this.getCurrentDrawClaimColor();
  if (!activeClaimingColor || (claimingColor && claimingColor != activeClaimingColor)) {
    return false;
  }

  this.removeFiftyMoveDrawClaimButton();
  this.stallMate(this.getFiftyMoveDrawReason(activeClaimingColor));
  return true;
};

Board.prototype.applyMoveCountDrawRules = function () {
  if (this.movesCounter >= SEVENTY_FIVE_MOVE_RULE_HALFMOVES) {
    this.removeFiftyMoveDrawClaimButton();
    this.stallMate(this.getSeventyFiveMoveDrawReason());
    return true;
  }

  if (window.isGameVsBot && this.canClaimFiftyMoveDraw()) {
    this.removeFiftyMoveDrawClaimButton();
    this.stallMate(this.getFiftyMoveDrawReason("bot"));
    return true;
  }

  return false;
};

Board.prototype.finishTurnAfterLegalMove = function (drawByRepetitionReason, movedColor) {
  if (drawByRepetitionReason) {
    this.removeFiftyMoveDrawClaimButton();
    this.stallMate(drawByRepetitionReason);
    return false;
  }

  if (this.applyMoveCountDrawRules(movedColor)) {
    return false;
  }

  this.alterTurns();

  if (window.gameState != "playing") {
    this.removeFiftyMoveDrawClaimButton();
    return false;
  }

  this.updateFiftyMoveDrawClaimButton();
  this.updateGameActionControls();
  return true;
};

Board.prototype.stallMate = function (reason) {
  const options = arguments[1] || {};
  const payload = {
    type: "game_over",
    result: "draw",
    reason: reason || "Draw",
  };
  const shouldAnnounce = this.finalizeGame(payload);
  const drawHtml =
    '<div style="text-align:center;"><b>Draw</b>' +
    `<br />${payload.reason}</div>`;
  this.showGameOverOverlay(drawHtml);
  if (shouldAnnounce) {
    playChessSound(stallMate);
  }
  this.broadcastGameOver(payload, options, shouldAnnounce);
};

Board.prototype.showGameOverOverlay = function (resultContentHtml) {
  const overlay = $(".overlay");
  if (!overlay.length) return;

  const boardObject = this;
  window.gameResultHubShowable = true;
  window.gameResultHubDismissed = false;

  function hideResultHubForAnalysis() {
    if (!window.gameResultHubShowable) return;
    window.gameResultHubDismissed = true;
    resultsPanel.css("display", "none");
    overlay.css("display", "none");
  }

  function showResultHubAgain() {
    if (!window.gameResultHubShowable || window.gameState == "playing") return;
    window.gameResultHubDismissed = false;
    overlay.css("display", "flex");
    overlay.find("#main_pannnel").css("display", "none");
    overlay.find("#loadding_pannnel").css("display", "none");
    resultsPanel.css("display", "block");
  }

  function stopShowingResultHub() {
    window.gameResultHubShowable = false;
    window.gameResultHubDismissed = false;
    $(document).off("click.gameResultHubToggle keydown.gameResultHubToggle");
  }

  window.hideGameResultHubForAnalysis = hideResultHubForAnalysis;
  window.showGameResultHubAgain = showResultHubAgain;
  window.stopShowingGameResultHub = stopShowingResultHub;

  // Show overlay, hide main hub panel, show results panel
  overlay.css("display", "flex");
  overlay.find("#main_pannnel").css("display", "none");
  overlay.find("#loadding_pannnel").css("display", "none");

  let resultsPanel = overlay.find("#results_pannnel");
  if (!resultsPanel.length) {
    resultsPanel = $(
      '<div class="row card" id="results_pannnel" style="display:none; margin-top: 20px; position: relative;">' +
        '<button id="dismissResultsBtn" type="button" aria-label="Hide result hub" title="Hide result hub" style="position:absolute; top:6px; right:8px; border:0; background:transparent; font-size:22px; line-height:1; cursor:pointer; z-index:2;">&times;</button>' +
        '<div class="col-12" style="line-height:10px !important">&nbsp;</div>' +
        '<div class="col-12">' +
        '  <div class="d-flex justify-content-center">' +
        '    <div id="results_content" style="text-align:center;"></div>' +
        "  </div>" +
        "</div>" +
        '<div class="col-12" style="line-height:10px !important">&nbsp;</div>' +
        '<div class="col-12">' +
        "  <div class='d-flex justify-content-center'>" +
        "    <div class='btn-group'>" +
        "      <button id='closeResultsBtn' class='btn btn-outline-secondary btn-sm'>Close</button>" +
        "      <button id='replayBtn' class='btn btn-outline-success btn-sm'>Restart</button>" +
        "    </div>" +
        "  </div>" +
        "</div>" +
        '<div class="col-12" style="line-height:10px !important">&nbsp;</div>' +
        "</div>"
    );
    overlay.append(resultsPanel);
  }

  overlay.find("#results_content").html(resultContentHtml);
  resultsPanel.css("display", "block");

  resultsPanel.find("#dismissResultsBtn").off("click").on("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    hideResultHubForAnalysis();
  });

  // Close button: hide results and show main hub
  resultsPanel.find("#closeResultsBtn").off("click").on("click", function () {
    stopShowingResultHub();
    resultsPanel.css("display", "none");
    overlay.css("display", "flex");
    overlay.find("#main_pannnel").css("display", "block");
  });

  // Restart button: reset game and immediately start a new game
  resultsPanel.find("#replayBtn").off("click").on("click", function () {
    stopShowingResultHub();
    resultsPanel.css("display", "none");
    window.resetGameAndStartNew();
  });

  $(document)
    .off("click.gameResultHubToggle keydown.gameResultHubToggle")
    .on("click.gameResultHubToggle", function (event) {
      if (!window.gameResultHubShowable || !window.gameResultHubDismissed || window.gameState == "playing") return;

      const target = event.target;
      const isBoardClick = target && typeof target.closest == "function" && target.closest("#board, #boardArea");
      const isExemptControl =
        target &&
        typeof target.closest == "function" &&
        target.closest(
          "button, .btn, #resizeToggleBtn, #perfectZoomBtn, #zoomOutBtn, #zoomInBtn, #fullscreenBtn, #historyBackBtn, #historyForwardBtn, .board-zoom-controls, .history-navigation-controls, input, select, textarea, label, a"
        );

      if (isBoardClick || !isExemptControl) {
        showResultHubAgain();
      }
    })
    .on("keydown.gameResultHubToggle", function (event) {
      const isEscape = event.key == "Escape" || event.key == "Esc" || event.which == 27;
      if (!isEscape || !window.gameResultHubShowable || window.gameState == "playing") return;
      event.preventDefault();
      if (window.gameResultHubDismissed || resultsPanel.css("display") == "none") {
        showResultHubAgain();
      } else {
        hideResultHubForAnalysis();
      }
    });
};

Board.prototype.resetGame = function () {
  if (typeof window.stopShowingGameResultHub == "function") {
    window.stopShowingGameResultHub();
  }
  this.finalizeGame({ type: "game_over", result: "draw", reason: "Game reset" });
  this.positionHistory = [];
  this.positionHistoryIndex = -1;
  this.isHistoryPreview = false;
  $("#game").removeClass("history-preview");
  this.pendingHistoryMove = null;
  this.pendingHistoryTurn = null;
  $(document).off("keydown.chessHistoryNavigation");

  if (this.timerWhite) {
    this.timerWhite.stop();
    this.timerWhite = null;
  }
  if (this.timerBlack) {
    this.timerBlack.stop();
    this.timerBlack = null;
  }

  if (window.gameSocket && window.gameSocket.readyState === 1) {
    try {
      window.gameSocket.close();
    } catch (e) {
      // Ignore WebSocket close errors
    }
    window.gameSocket = null;
  }

  if (typeof window.stopClockSync == "function") {
    window.stopClockSync();
  }

  // Clear all pieces from board squares and reset pieces array
  this.pieces.forEach((piece) => {
    if (piece && piece.element) {
      $(piece.element).remove();
    }
  });
  this.pieces = [];

  // Remove all piece elements (i tags) from the board, keep the grid structure
  $("#board i").remove();

  // Clean up jQuery UI
  $("td").unbind("droppable");
  if (typeof $("td").droppable == "function") {
    try {
      $("td").droppable("destroy");
    } catch (e) {
      // Ignore if not initialized
    }
  }
  try {
    $("i").removeClass("ui-draggable ui-draggable-dragging").draggable("destroy");
  } catch (e) {
    // Ignore if not initialized
    $("i").removeClass("ui-draggable ui-draggable-dragging");
  }
  $(".possibleMove").removeClass("possibleMove");
  $(".incheck").removeClass("incheck");
  $(".ui-draggable-dragging").remove();
  $(".popover").remove();

  // Clear last-move highlight classes from board squares
  this.clearMoveHighlights();

  $(`#game`)
    .removeClass("game-over role-black role-white play-as-black play-as-white")
    .addClass("role-white");

  if (window.board) {
    window.board = null;
  }
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
  for (let i = 0; i < this.pieces.length; i++) {
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

          pieceMove = this.pieceAtSquare(forwardOnly(piece.x, 1), piece.y);
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
              pieceMove = this.pieceAtSquare(forwardOnly(piece.x, 2), piece.y);
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
          pieceMove = this.pieceAtSquare(forwardOnly(piece.x, 1), piece.y + 1);
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
          pieceMove = this.pieceAtSquare(forwardOnly(piece.x, 1), piece.y - 1);
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

Board.prototype.draggableOptions = function () {
  const boardRef = this;

  return {
    start: function () {
      const piece = $(this).data("piece");
      const activeColor = boardRef.getActiveDraggableColor();

      if (!piece || !activeColor || piece.color != activeColor) {
        boardRef.resetPiecePosition(piece);
        return false;
      }
    },
    drag: onPieceDrag,
    accept: "td",
    containment: "#game",
    stop: onPieceStopDrag,
    scroll: false,
  };
};

Board.prototype.cancelActiveDrag = function () {
  if (typeof dragStart != "undefined") {
    dragStart = false;
  }

  if (typeof window.setResizeToggleDraggingState == "function") {
    window.setResizeToggleDraggingState(false);
  }

  $(".possibleMove").removeClass("possibleMove");

  try {
    $(document).trigger("mouseup");
    $(window).trigger("mouseup");
  } catch (e) {
    // If jQuery UI is not active, there is nothing to cancel.
  }

  const draggingPieces = $(".ui-draggable-dragging");
  draggingPieces.each(function () {
    const element = $(this);

    if (typeof element.stop == "function") {
      element.stop(true, true);
    }

    if (typeof element.draggable == "function") {
      try {
        element.draggable("option", "disabled", true);
      } catch (e) {
        // The element may already be destroyed.
      }
      try {
        element.draggable("destroy");
      } catch (e) {
        // Keep cleanup idempotent.
      }
    }

    element
      .removeClass("ui-draggable ui-draggable-handle ui-draggable-dragging")
      .css({ top: "0px", left: "0px" });
  });
};

Board.prototype.disableDraggables = function (elements) {
  $(elements).each(function () {
    const element = $(this);
    if (typeof element.stop == "function") {
      element.stop(true, true);
    }
    if (typeof element.draggable == "function") {
      try {
        if (element.data("ui-draggable") || element.data("draggable")) {
          element.draggable("option", "disabled", true);
          element.draggable("destroy");
        }
      } catch (e) {
        // If jQuery UI thinks this element is already destroyed, keep going.
      }
    }
    element
      .removeClass("ui-draggable ui-draggable-handle ui-draggable-dragging")
      .css({ top: "0px", left: "0px" });
  });
};

Board.prototype.enableDraggables = function (elements) {
  const options = this.draggableOptions();
  $(elements).each(function () {
    const element = $(this);
    if (typeof element.draggable != "function") return;

    try {
      if (element.data("ui-draggable") || element.data("draggable")) {
        element.draggable("destroy");
      }
    } catch (e) {
      // Re-initialize below if the previous draggable instance was stale.
    }

    element.css({ top: "0px", left: "0px" }).draggable(options);
  });
};

Board.prototype.getActiveDraggableColor = function () {
  if (window.gameState != "playing" || this.isHistoryPreview) return null;
  if (window.humainIsUpgrading || $(".popover.show").length > 0) return null;

  if (window.isGameVsBot) {
    return this.turn == "white" ? "white" : null;
  }

  if (window.isGameOnline) {
    const playAs = window.playAs || this.playAs;
    return playAs == this.turn ? this.turn : null;
  }

  return this.turn;
};

Board.prototype.updateDraggables = function () {
  if (this.draggableUpdateTimer) {
    clearTimeout(this.draggableUpdateTimer);
  }

  const applyDraggableState = () => {
    this.draggableUpdateTimer = null;
    this.disableDraggables($("i"));

    const activeColor = this.getActiveDraggableColor();
    if (activeColor) {
      this.enableDraggables($(`.fg-${activeColor}`));
    }
  };

  if (arguments[0] === true) {
    applyDraggableState();
  } else {
    this.draggableUpdateTimer = setTimeout(applyDraggableState, 0);
  }
};

Board.prototype.add = function (piece) {
  if (!piece || !this.isInsideBoard(piece.x, piece.y)) {
    console.warn("Ignored piece with invalid board coordinates", piece);
    return false;
  }

  let square = this.getSquare(piece.x, piece.y);
  if (!square.length) {
    console.warn("Ignored piece because its target square is not rendered", piece);
    return false;
  }

  this.resetPiecePosition(piece);
  this.pieces.push(piece);
  square.empty().append(piece.element);
  return true;
};
Board.prototype.alterTurns = function () {
  if (window.gameState != "playing") return;

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
    if (typeof stopChessSounds == "function") {
      stopChessSounds(check);
    }
    playChessSound(checkMate);
    this.playerWon(this.turn == "white" ? "black" : "white", ` by checkmate`);
    return;
  } else if (!hasAuthMoves) {
    this.stallMate(`No legal move left for ${this.turn}`);
    return;
  }

  if (playCheckSound) {
    playChessSound(check);
  }

  if (this.turn == "white" && $(".popover.show").length == 0) {
    this.timerWhite.resume();
    this.timerBlack.pause();
  } else if (this.turn == "black" && $(".popover.show").length == 0) {
    this.timerWhite.pause();
    this.timerBlack.resume();
  }

  this.updateDraggables();
  this.updateGameActionControls();

  $(`#game`).removeClass("role-black role-white");
  $(`#game`).addClass(`role-${this.turn}`);
};
Board.prototype.moveTo = function (piece, square) {
  const moveOptions = arguments[2] || {};
  const shouldAnimate = moveOptions.animate === true;
  const originSquare = $(piece.element).parent("td");
  const originCoordinates = originSquare.length
    ? this.coordinatesForSquare(originSquare)
    : { x: piece.x, y: piece.y };

  const originRect =
    originSquare[0] && typeof originSquare[0].getBoundingClientRect == "function"
      ? originSquare[0].getBoundingClientRect()
      : null;
  const destinationRect =
    square && square[0] && typeof square[0].getBoundingClientRect == "function"
      ? square[0].getBoundingClientRect()
      : null;

  $(piece.element).css({
    top: "0px",
    left: "0px",
  });
  let oldPiece = ($(square).find("i") ?? { data: () => {} }).data("piece");
  let oldIndex = this.pieces.indexOf(oldPiece);
  const isCastlingMove =
    oldPiece &&
    piece.color == oldPiece.color &&
    piece.x == oldPiece.x &&
    piece.constructor.name == "King" &&
    oldPiece.constructor.name == "Rook";
  const moveResetsHalfMoveClock =
    !isCastlingMove &&
    (piece.constructor.name == "Pawn" || oldIndex != -1 || moveOptions.isCapture);

  this.pendingHistoryTurn = moveOptions.turnAfterMove || null;

  if (isCastlingMove) {
    const rookOrigin = { x: oldPiece.x, y: oldPiece.y };
    const rookOriginSquare = $(oldPiece.element).parent("td");
    const rookOriginRect =
      rookOriginSquare[0] && typeof rookOriginSquare[0].getBoundingClientRect == "function"
        ? rookOriginSquare[0].getBoundingClientRect()
        : null;
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
    piece.element = kingEl[0];
    
    let rookEl = $(oldPiece.element).detach();
    rookEl.css({
      top: "0px",
      left: "0px",
    });
    oldPiece.element = rookEl[0];
    
    this.getSquare(piece.x, piece.y).append(kingEl);
    this.getSquare(oldPiece.x, oldPiece.y).append(rookEl);
    if (shouldAnimate) {
      const kingTargetRect = this.getSquare(piece.x, piece.y)[0].getBoundingClientRect();
      const rookTargetRect = this.getSquare(oldPiece.x, oldPiece.y)[0].getBoundingClientRect();

      animatePieceTranslation(piece.element, originRect, kingTargetRect, kingEl);
      animatePieceTranslation(oldPiece.element, rookOriginRect, rookTargetRect, rookEl);
    }
    this.highlightMoveSquares([
      { x: originCoordinates.x, y: originCoordinates.y, role: "origin" },
      { x: piece.x, y: piece.y, role: "destination" },
      { x: rookOrigin.x, y: rookOrigin.y, role: "origin" },
      { x: oldPiece.x, y: oldPiece.y, role: "destination" },
    ]);

    this.pendingHistoryMove = [
      { x: originCoordinates.x, y: originCoordinates.y, role: "origin" },
      { x: piece.x, y: piece.y, role: "destination" },
      { x: rookOrigin.x, y: rookOrigin.y, role: "origin" },
      { x: oldPiece.x, y: oldPiece.y, role: "destination" },
    ];

    piece.recalculateAttackingSquares(this);
    oldPiece.recalculateAttackingSquares(this);

    playChessSound(castel);
  } else {
    if (oldIndex != -1 || moveOptions.isCapture) {
      if (oldIndex != -1) {
        this.pieces[oldIndex] = null;
      }
      playChessSound(eat);
      $(square).empty();
    } else if (!moveOptions.deferMoveSound) {
      if (typeof playMoveSoundWhenSettled == "function") {
        playMoveSoundWhenSettled();
      } else {
        playChessSound(movePlayed);
      }
    }

    let a = $(piece.element).detach();
    piece.element = a[0];

    piece.recalculateAttackingSquares(this);
    $(square).append(a);
    if (shouldAnimate) {
      animatePieceTranslation(a[0], originRect, destinationRect, a);
    }
    this.highlightMoveSquares([
      { x: originCoordinates.x, y: originCoordinates.y, role: "origin" },
      { x: piece.x, y: piece.y, role: "destination" },
    ]);

    this.pendingHistoryMove = [
      { x: originCoordinates.x, y: originCoordinates.y, role: "origin" },
      { x: piece.x, y: piece.y, role: "destination" },
    ];
  }

  this.moves.push(new Move(this));

  if (moveResetsHalfMoveClock) {
    this.movesCounter = 0;
  } else {
    this.movesCounter++;
  }
};
