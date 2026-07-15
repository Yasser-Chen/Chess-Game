/**
 * Differential move-generation checks against the production chess classes.
 *
 * The vendored EPD contains 6,969 independently generated positions. Perft at
 * depth one is exactly the number of legal moves in each position, including
 * castling, en passant, and four distinct promotion choices.
 */
require("./setup");

const fs = require("fs");
const path = require("path");
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

const PIECE_TYPES = {
  p: Pawn,
  n: Knight,
  b: Bishop,
  r: Rook,
  q: Queen,
  k: King,
};

const DATASET_PATH = path.join(__dirname, "fixtures", "jchess-perft.epd");
const PERFT_CASES = fs
  .readFileSync(DATASET_PATH, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, index) => {
    const fields = line.split(";");
    const depthOne = fields[1] && fields[1].match(/^D1 (\d+)$/);
    if (!depthOne) throw new Error(`Missing D1 result on dataset line ${index + 1}`);
    return {
      id: index + 1,
      fen: fields[0],
      expectedMoves: Number(depthOne[1]),
    };
  });

function squareToCoordinates(square) {
  const file = square.charCodeAt(0) - 96;
  const rank = Number(square[1]);
  return { x: 9 - rank, y: file };
}

function boardFromFen(fen) {
  const [placement, activeColor, castlingRights, enPassantSquare] = fen.split(" ");
  const pieces = [];

  placement.split("/").forEach((rankText, rankIndex) => {
    let file = 1;
    for (const symbol of rankText) {
      if (/\d/.test(symbol)) {
        file += Number(symbol);
        continue;
      }
      const PieceType = PIECE_TYPES[symbol.toLowerCase()];
      const color = symbol == symbol.toUpperCase() ? "white" : "black";
      const piece = new PieceType(rankIndex + 1, file, color);
      piece.firstMoveDone = true;
      if (
        piece.constructor.name == "Pawn" &&
        ((color == "white" && piece.x == 7) || (color == "black" && piece.x == 2))
      ) {
        piece.firstMoveDone = false;
      }
      pieces.push(piece);
      file++;
    }
  });

  const enableCastle = (right, color, rookFile) => {
    if (!castlingRights.includes(right)) return;
    const homeX = color == "white" ? 8 : 1;
    const king = pieces.find((piece) =>
      piece.constructor.name == "King" && piece.color == color && piece.x == homeX && piece.y == 5
    );
    const rook = pieces.find((piece) =>
      piece.constructor.name == "Rook" && piece.color == color && piece.x == homeX && piece.y == rookFile
    );
    if (king && rook) {
      king.firstMoveDone = false;
      rook.firstMoveDone = false;
    }
  };
  enableCastle("K", "white", 8);
  enableCastle("Q", "white", 1);
  enableCastle("k", "black", 8);
  enableCastle("q", "black", 1);

  const board = Object.create(Board.prototype);
  board.pieces = pieces;
  board.turn = activeColor == "w" ? "white" : "black";
  board.resetAttacks();

  window.lastPawnMoved = null;
  if (enPassantSquare != "-") {
    const target = squareToCoordinates(enPassantSquare);
    const movedPawnX = board.turn == "white" ? target.x + 1 : target.x - 1;
    const movedPawn = board.pieceAtSquare(movedPawnX, target.y);
    if (movedPawn && movedPawn.constructor.name == "Pawn" && movedPawn.color != board.turn) {
      movedPawn.cantEnpassant = false;
      window.lastPawnMoved = movedPawn;
    }
  }

  return board;
}

function countLegalMoves(board) {
  let count = 0;
  for (const piece of board.pieces) {
    if (!piece || piece.color != board.turn) continue;
    for (let x = 1; x <= 8; x++) {
      for (let y = 1; y <= 8; y++) {
        if (!piece.isLegal(board, x, y) || board.isCheckIfMovePlayed(piece, x, y)) continue;
        const promotes =
          piece.constructor.name == "Pawn" &&
          ((piece.color == "white" && x == 1) || (piece.color == "black" && x == 8));
        count += promotes ? 4 : 1;
      }
    }
  }
  return count;
}

beforeEach(() => {
  window.lastPawnMoved = null;
  window.gameState = "playing";
  window.isGameOnline = false;
  window.isGameVsBot = false;
});

describe("jchess perft dataset", () => {
  test("contains all 6,969 upstream standard-chess positions", () => {
    expect(PERFT_CASES).toHaveLength(6969);
  });

  test.each(PERFT_CASES)("position $id has the authoritative legal-move count", ({ fen, expectedMoves }) => {
    expect(countLegalMoves(boardFromFen(fen))).toBe(expectedMoves);
  });
});
