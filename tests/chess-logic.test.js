/**
 * Rule-level tests against the production chess implementation.
 *
 * Do not recreate piece or board rules in this file. Every legality decision
 * must go through the classes used by the browser game.
 */
require("./setup");

const Piece = require("../static/classes/pieces/piece.js");
const Pawn = require("../static/classes/pieces/pawn.js");
const Knight = require("../static/classes/pieces/knight.js");
const Bishop = require("../static/classes/pieces/bishop.js");
const Rook = require("../static/classes/pieces/rook.js");
const Queen = require("../static/classes/pieces/queen.js");
const King = require("../static/classes/pieces/king.js");
const { Board } = require("../static/classes/board.js");

Object.assign(global, { Piece, Pawn, Knight, Bishop, Rook, Queen, King });
Object.assign(window, { Piece, Pawn, Knight, Bishop, Rook, Queen, King });

function createRuleBoard(pieces = [], turn = "white") {
  const board = Object.create(Board.prototype);
  board.pieces = pieces;
  board.moves = [];
  board.movesCounter = 0;
  board.movesPlayedByColor = { white: 0, black: 0 };
  board.turn = turn;
  board.resetAttacks();
  return board;
}

function createInitialBoard(turn = "white") {
  const pieces = [];
  for (let y = 1; y <= 8; y++) {
    pieces.push(new Pawn(7, y, "white"), new Pawn(2, y, "black"));
  }
  for (const color of ["white", "black"]) {
    const x = color == "white" ? 8 : 1;
    pieces.push(
      new Rook(x, 1, color),
      new Knight(x, 2, color),
      new Bishop(x, 3, color),
      new Queen(x, 4, color),
      new King(x, 5, color),
      new Bishop(x, 6, color),
      new Knight(x, 7, color),
      new Rook(x, 8, color)
    );
  }
  return createRuleBoard(pieces, turn);
}

function findKing(board, color) {
  return board.pieces.find((piece) =>
    piece && piece.color == color && piece.constructor.name == "King"
  );
}

function isFullyLegal(board, piece, x, y) {
  return piece.isLegal(board, x, y) && !board.isCheckIfMovePlayed(piece, x, y);
}

function legalMovesFor(board, color) {
  const moves = [];
  for (const piece of board.pieces) {
    if (!piece || piece.color != color) continue;
    for (let x = 1; x <= 8; x++) {
      for (let y = 1; y <= 8; y++) {
        if (isFullyLegal(board, piece, x, y)) {
          moves.push({ piece, x, y });
        }
      }
    }
  }
  return moves;
}

function playRuleMove(board, fromX, fromY, toX, toY) {
  const piece = board.pieceAtSquare(fromX, fromY);
  if (!piece || piece.color != board.turn || !isFullyLegal(board, piece, toX, toY)) {
    throw new Error(`Illegal test move: ${fromX},${fromY} -> ${toX},${toY}`);
  }

  const captured = board.pieceAtSquare(toX, toY);
  if (captured) board.pieces[board.pieces.indexOf(captured)] = null;
  if (window.lastPawnMoved) window.lastPawnMoved.cantEnpassant = true;
  piece.x = toX;
  piece.y = toY;
  piece.firstMoveDone = true;
  if (piece.constructor.name == "Pawn") window.lastPawnMoved = piece;
  board.turn = board.turn == "white" ? "black" : "white";
  board.resetAttacks();
  return piece;
}

beforeEach(() => {
  window.lastPawnMoved = null;
  window.isGameOnline = false;
  window.isGameVsBot = false;
  window.gameState = "playing";
});

describe("legal move generation", () => {
  test("the untouched starting position has exactly 20 legal moves per side", () => {
    const board = createInitialBoard();
    expect(legalMovesFor(board, "white")).toHaveLength(20);
    expect(legalMovesFor(board, "black")).toHaveLength(20);
  });

  test("sliding pieces cannot pass through either friendly or enemy blockers", () => {
    const rook = new Rook(4, 4, "white");
    const board = createRuleBoard([
      new King(8, 5, "white"),
      new King(1, 5, "black"),
      rook,
      new Pawn(4, 6, "white"),
      new Pawn(2, 4, "black"),
    ]);

    expect(rook.isLegal(board, 4, 5)).toBe(true);
    expect(rook.isLegal(board, 4, 6)).toBe(false);
    expect(rook.isLegal(board, 4, 7)).toBe(false);
    expect(rook.isLegal(board, 2, 4)).toBe(true);
    expect(rook.isLegal(board, 1, 4)).toBe(false);
  });

  test("knights jump over crowded surrounding squares", () => {
    const knight = new Knight(5, 5, "white");
    const blockers = [
      new Pawn(4, 4, "white"), new Pawn(4, 5, "white"),
      new Pawn(4, 6, "white"), new Pawn(5, 4, "white"),
      new Pawn(5, 6, "white"), new Pawn(6, 4, "white"),
      new Pawn(6, 5, "white"), new Pawn(6, 6, "white"),
    ];
    const board = createRuleBoard([
      new King(8, 5, "white"), new King(1, 5, "black"), knight, ...blockers,
    ]);

    expect(knight.isLegal(board, 3, 4)).toBe(true);
    expect(knight.isLegal(board, 3, 6)).toBe(true);
    expect(knight.isLegal(board, 5, 6)).toBe(false);
  });

  test("a pawn cannot double-step through a blocker or after moving", () => {
    const pawn = new Pawn(7, 4, "white");
    const board = createRuleBoard([
      new King(8, 5, "white"), new King(1, 5, "black"), pawn,
    ]);
    expect(pawn.isLegal(board, 5, 4)).toBe(true);

    board.pieces.push(new Knight(6, 4, "black"));
    expect(pawn.isLegal(board, 5, 4)).toBe(false);
    board.pieces.pop();
    pawn.firstMoveDone = true;
    expect(pawn.isLegal(board, 5, 4)).toBe(false);
    expect(pawn.isLegal(board, 6, 4)).toBe(true);
  });

  test.each([
    ["rook", Rook, [5, 8], [7, 7]],
    ["bishop", Bishop, [7, 7], [5, 8]],
    ["queen", Queen, [5, 8], [6, 8]],
    ["knight", Knight, [3, 4], [4, 4]],
    ["king", King, [4, 4], [3, 3]],
  ])("the production %s accepts its movement shape and rejects another", (_name, PieceType, legal, illegal) => {
    const piece = new PieceType(5, 5, "white");
    const board = createRuleBoard([
      new King(8, 8, "white"), new King(1, 1, "black"), piece,
    ]);
    expect(piece.isLegal(board, legal[0], legal[1])).toBe(true);
    expect(piece.isLegal(board, illegal[0], illegal[1])).toBe(false);
  });

  test("attack rays include the first occupied square but never squares behind it", () => {
    const rook = new Rook(5, 5, "white");
    const blocker = new Pawn(5, 7, "black");
    const board = createRuleBoard([
      new King(8, 8, "white"), new King(1, 1, "black"), rook, blocker,
    ]);
    rook.recalculateAttackingSquares(board);

    expect(rook.attackingSquares.exists({ x: 5, y: 6 })).toBe(true);
    expect(rook.attackingSquares.exists({ x: 5, y: 7 })).toBe(true);
    expect(rook.attackingSquares.exists({ x: 5, y: 8 })).toBe(false);
  });

  test("pawns capture enemies diagonally but cannot capture forward or take friendly pieces", () => {
    const pawn = new Pawn(6, 4, "white");
    const enemy = new Knight(5, 5, "black");
    const friend = new Knight(5, 3, "white");
    const forwardEnemy = new Rook(5, 4, "black");
    const board = createRuleBoard([
      new King(8, 8, "white"), new King(1, 1, "black"),
      pawn, enemy, friend, forwardEnemy,
    ]);

    expect(pawn.isLegal(board, 5, 5)).toBe(true);
    expect(pawn.isLegal(board, 5, 3)).toBe(false);
    expect(pawn.isLegal(board, 5, 4)).toBe(false);
  });
});

describe("king safety", () => {
  test("a pinned piece has geometrically valid moves rejected by king safety", () => {
    const king = new King(8, 5, "white");
    const pinnedRook = new Rook(7, 5, "white");
    const board = createRuleBoard([
      king, pinnedRook, new Rook(1, 5, "black"), new King(1, 1, "black"),
    ]);

    expect(pinnedRook.isLegal(board, 7, 6)).toBe(true);
    expect(board.isCheckIfMovePlayed(pinnedRook, 7, 6)).toBe(true);
    expect(isFullyLegal(board, pinnedRook, 7, 6)).toBe(false);
    expect(isFullyLegal(board, pinnedRook, 6, 5)).toBe(true);
  });

  test("a king cannot move onto a square attacked by an enemy piece", () => {
    const king = new King(8, 5, "white");
    const board = createRuleBoard([
      king, new King(1, 1, "black"), new Rook(1, 6, "black"),
    ]);

    expect(king.isLegal(board, 8, 6)).toBe(true);
    expect(board.isCheckIfMovePlayed(king, 8, 6)).toBe(true);
    expect(isFullyLegal(board, king, 8, 6)).toBe(false);
  });

  test("legality probes restore every piece and square after simulation", () => {
    const board = createInitialBoard();
    const knight = board.pieceAtSquare(8, 7);
    const before = board.pieces.map((piece) => piece && `${piece.constructor.name}:${piece.x}:${piece.y}`);

    expect(isFullyLegal(board, knight, 6, 6)).toBe(true);
    expect(board.pieces.map((piece) => piece && `${piece.constructor.name}:${piece.x}:${piece.y}`)).toEqual(before);
    expect(board.pieceAtSquare(8, 7)).toBe(knight);
    expect(board.pieceAtSquare(6, 6)).toBeNull();
  });

  test("capturing the checking piece resolves check when no second line attacks", () => {
    const king = new King(8, 5, "white");
    const rook = new Rook(8, 4, "white");
    const attacker = new Rook(1, 5, "black");
    const board = createRuleBoard([king, rook, attacker, new King(1, 1, "black")]);

    expect(board.inCheck("white", king.x, king.y)).toBe(true);
    expect(isFullyLegal(board, rook, 1, 4)).toBe(false);
    expect(isFullyLegal(board, king, 8, 6)).toBe(true);
  });
});

describe("terminal positions", () => {
  test("detects Fool's Mate as checkmate using a real move sequence", () => {
    const board = createInitialBoard();
    playRuleMove(board, 7, 6, 6, 6); // f2-f3
    playRuleMove(board, 2, 5, 4, 5); // e7-e5
    playRuleMove(board, 7, 7, 5, 7); // g2-g4
    playRuleMove(board, 1, 4, 5, 8); // Qd8-h4#

    const whiteKing = findKing(board, "white");
    expect(board.inCheck("white", whiteKing.x, whiteKing.y)).toBe(true);
    expect(board.hasAuthMoves("white")).toBe(false);
  });

  test("distinguishes stalemate from checkmate", () => {
    const stalemate = createRuleBoard([
      new King(1, 1, "black"), // Ka8
      new King(3, 3, "white"), // Kc6
      new Queen(3, 2, "white"), // Qb6
    ], "black");
    const blackKing = findKing(stalemate, "black");
    expect(stalemate.inCheck("black", blackKing.x, blackKing.y)).toBe(false);
    expect(stalemate.hasAuthMoves("black")).toBe(false);

    const checkmate = createRuleBoard([
      new King(1, 1, "black"), // Ka8
      new King(3, 3, "white"), // Kc6
      new Queen(2, 2, "white"), // Qb7#
    ], "black");
    expect(checkmate.inCheck("black", 1, 1)).toBe(true);
    expect(checkmate.hasAuthMoves("black")).toBe(false);
  });

  test("a similar position with an escape square is not called mate", () => {
    const board = createRuleBoard([
      new King(1, 1, "black"),
      new King(8, 8, "white"),
    ], "black");
    const king = findKing(board, "black");
    expect(board.inCheck("black", king.x, king.y)).toBe(false);
    expect(board.hasAuthMoves("black")).toBe(true);
  });
});

describe("special moves", () => {
  test("en passant exists only for the immediately eligible adjacent pawn", () => {
    const whitePawn = new Pawn(4, 4, "white");
    whitePawn.firstMoveDone = true;
    const blackPawn = new Pawn(4, 5, "black");
    blackPawn.firstMoveDone = true;
    const board = createRuleBoard([
      new King(8, 5, "white"), new King(1, 5, "black"), whitePawn, blackPawn,
    ]);

    window.lastPawnMoved = blackPawn;
    blackPawn.cantEnpassant = false;
    expect(whitePawn.isEnPassant(board, 3, 5)).toBe(true);
    expect(whitePawn.isLegal(board, 3, 5)).toBe(true);

    blackPawn.cantEnpassant = true;
    expect(whitePawn.isEnPassant(board, 3, 5)).toBe(false);
    expect(whitePawn.isLegal(board, 3, 5)).toBe(false);
  });

  test("kingside castling requires an unmoved home king and rook with a clear safe path", () => {
    const king = new King(8, 5, "white");
    const rook = new Rook(8, 8, "white");
    const board = createRuleBoard([king, rook, new King(1, 5, "black")]);

    expect(king.isLegal(board, 8, 8)).toBe(true);
    rook.firstMoveDone = true;
    expect(king.isLegal(board, 8, 8)).toBe(false);
  });

  test("castling is illegal while in check or through an attacked square", () => {
    const king = new King(8, 5, "white");
    const rook = new Rook(8, 8, "white");
    const checkingBoard = createRuleBoard([
      king, rook, new King(1, 1, "black"), new Rook(1, 5, "black"),
    ]);
    expect(king.isLegal(checkingBoard, 8, 8)).toBe(false);

    const king2 = new King(8, 5, "white");
    const rook2 = new Rook(8, 8, "white");
    const throughCheck = createRuleBoard([
      king2, rook2, new King(1, 1, "black"), new Rook(1, 6, "black"),
    ]);
    expect(king2.isLegal(throughCheck, 8, 8)).toBe(false);
  });

  test("queenside castling may occur when b1 is attacked but c1 and d1 are safe", () => {
    const king = new King(8, 5, "white");
    const rook = new Rook(8, 1, "white");
    const board = createRuleBoard([
      king, rook, new King(1, 8, "black"), new Rook(1, 2, "black"),
    ]);

    expect(king.isLegal(board, 8, 1)).toBe(true);
  });

  test("an unmoved rook away from its home corner cannot be used for castling", () => {
    const king = new King(8, 5, "white");
    const promotedOrRelocatedRook = new Rook(8, 7, "white");
    const board = createRuleBoard([
      king, promotedOrRelocatedRook, new King(1, 5, "black"),
    ]);
    expect(king.isLegal(board, 8, 7)).toBe(false);
  });

  test("black castling applies the same home-square and safety rules", () => {
    const king = new King(1, 5, "black");
    const rook = new Rook(1, 8, "black");
    const board = createRuleBoard([king, rook, new King(8, 5, "white")], "black");
    expect(king.isLegal(board, 1, 8)).toBe(true);

    board.pieces.push(new Rook(8, 6, "white"));
    board.resetAttacks();
    expect(king.isLegal(board, 1, 8)).toBe(false);
  });

  test("promotion replaces the pawn in the production board model and rendered square", () => {
    const pawn = new Pawn(1, 4, "white");
    const board = createRuleBoard([
      pawn, new King(8, 8, "white"), new King(1, 8, "black"),
    ]);
    const square = $("<div></div>");
    square.append(pawn.element);
    board.getSquare = () => square;

    const promoted = board.promotePawn(pawn, square, Queen);

    expect(promoted).toBeInstanceOf(Queen);
    expect(board.pieces).toContain(promoted);
    expect(board.pieces).not.toContain(pawn);
    expect(square.find(".fa-chess-queen").length).toBe(1);
    expect(square.find(".fa-chess-pawn").length).toBe(0);
  });
});

describe("draw counters", () => {
  test("the fifty-move claim begins at 100 halfmoves and ends at the automatic threshold", () => {
    const board = createRuleBoard([new King(8, 5, "white"), new King(1, 5, "black")]);
    window.isGameOnline = false;
    window.isGameVsBot = false;

    board.movesCounter = 99;
    expect(board.canClaimFiftyMoveDraw()).toBe(false);
    board.movesCounter = 100;
    expect(board.canClaimFiftyMoveDraw()).toBe(true);
    board.movesCounter = 149;
    expect(board.canClaimFiftyMoveDraw()).toBe(true);
    board.movesCounter = 150;
    expect(board.canClaimFiftyMoveDraw()).toBe(false);
  });
});

describe("bot player color", () => {
  beforeEach(() => {
    window.isGameOnline = false;
    window.isGameVsBot = true;
    window.gameState = "playing";
    window.humainIsUpgrading = false;
  });

  test("choosing black gives the player control of black and the bot control of white", () => {
    const blackPiece = new Rook(8, 1, "black");
    const board = createRuleBoard([
      blackPiece,
      new King(8, 5, "white"),
      new King(1, 5, "black"),
    ], "black");
    board.playAs = "black";
    window.playAs = "black";

    expect(board.getLocalActionColor()).toBe("black");
    expect(board.getActiveDraggableColor()).toBe("black");
    expect(board.getBotColor()).toBe("white");
    expect(board.canColorAct("black")).toBe(true);
    expect(board.canColorAct("white")).toBe(false);

    board.turn = "white";
    expect(board.getActiveDraggableColor()).toBeNull();
    expect(board.canQueuePremoveForPiece(blackPiece)).toBe(true);
  });

  test("choosing white keeps white as the player and black as the bot", () => {
    const board = createRuleBoard([
      new King(8, 5, "white"),
      new King(1, 5, "black"),
    ]);
    board.playAs = "white";
    window.playAs = "white";

    expect(board.getActiveDraggableColor()).toBe("white");
    expect(board.getBotColor()).toBe("black");
  });
});
