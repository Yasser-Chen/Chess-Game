require("./setup");

const { Board, centerDraggableOnPointer } = require("../static/classes/board.js");

function createSquare(x, y) {
  const square = $(document.createElement("td"));
  square.attr("x", x).attr("y", y);
  document.body.appendChild(square[0]);
  return square;
}

function createPiece(name, x, y, color) {
  const piece = {
    x,
    y,
    color,
    element: $("<i></i>"),
    constructor: { name },
    isLegal: jest.fn(() => false),
  };
  piece.element.data("piece", piece);
  return piece;
}

function createClickBoard() {
  const board = Object.create(Board.prototype);
  board.board = null;
  board.turn = "white";
  board.playAs = "white";
  board.pieces = [];
  board.premoveStack = [];
  board.premoveVisualPositions = new Map();
  board.isHistoryPreview = false;
  board.selectedClickPiece = null;
  board.getSquare = jest.fn((x, y) => $(`td[x=${x}][y=${y}]`));
  board.isCheckIfMovePlayed = jest.fn(() => false);
  return board;
}

describe("click-to-move", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.gameState = "playing";
    window.isGameOnline = false;
    window.isGameVsBot = false;
    window.humainIsUpgrading = false;
    window.shouldAnimateProgrammaticMove = false;
  });

  test("dragging centers the piece under the pointer regardless of its grab point", () => {
    const adjustOffsetFromHelper = jest.fn();
    const draggableInstance = {
      helperProportions: { width: 80, height: 80 },
      _adjustOffsetFromHelper: adjustOffsetFromHelper,
    };

    expect(centerDraggableOnPointer(draggableInstance)).toBe(true);
    expect(adjustOffsetFromHelper).toHaveBeenCalledWith({ left: 40, top: 40 });
  });

  test("clicking a piece and then a square dispatches the same drop path", () => {
    const origin = createSquare(8, 2);
    const destination = createSquare(6, 3);
    const knight = createPiece("Knight", 8, 2, "white");
    origin.append(knight.element);

    const board = createClickBoard();
    board.pieces = [knight];
    board.dropPieceOnSquare = jest.fn(() => true);

    expect(board.handleSquareClick(origin, knight)).toBe(true);
    expect(board.selectedClickPiece).toBe(knight);
    expect(knight.element.hasClass("click-move-selected-piece")).toBe(true);

    expect(board.handleSquareClick(destination, null)).toBe(true);
    expect(board.dropPieceOnSquare).toHaveBeenCalledWith(knight, destination);
    expect(board.selectedClickPiece).toBeNull();
  });

  test("click selection is available for premoves during the opponent turn", () => {
    window.isGameOnline = true;
    window.playAs = "white";

    const origin = createSquare(8, 2);
    const destination = createSquare(6, 3);
    const knight = createPiece("Knight", 8, 2, "white");
    origin.append(knight.element);

    const board = createClickBoard();
    board.turn = "black";
    board.pieces = [knight];
    board.dropPieceOnSquare = jest.fn(() => true);

    expect(board.handleSquareClick(origin, knight)).toBe(true);
    expect(board.handleSquareClick(destination, null)).toBe(true);
    expect(board.dropPieceOnSquare).toHaveBeenCalledWith(knight, destination);
  });

  test("clicking anywhere on a future occupied square selects its premove piece", () => {
    window.isGameOnline = true;
    window.playAs = "white";

    const origin = createSquare(8, 2);
    const futureSquare = createSquare(6, 3);
    const knight = createPiece("Knight", 8, 2, "white");
    knight.premoveId = "future-knight";
    origin.append(knight.element);

    const board = createClickBoard();
    board.turn = "black";
    board.pieces = [knight];
    board.coordinatesForSquare = jest.fn(() => ({ x: 6, y: 3 }));
    board.premoveStack = [{
      key: knight.premoveId,
      fromX: 8,
      fromY: 2,
      toX: 6,
      toY: 3,
      visualToX: 6,
      visualToY: 3,
    }];
    board.premoveVisualPositions.set(knight.premoveId, { x: 6, y: 3 });
    futureSquare.append(knight.element);

    // A click on the square background has no icon-derived clickedPiece.
    expect(board.handleSquareClick(futureSquare, null)).toBe(true);
    expect(board.selectedClickPiece).toBe(knight);
    expect(futureSquare.attr("aria-selected")).toBe("true");
  });

  test("an assumed-captured premove piece cannot be selected", () => {
    window.isGameOnline = true;
    window.playAs = "white";

    const square = createSquare(8, 6);
    const bishop = createPiece("Bishop", 8, 6, "white");
    square.append(bishop.element);

    const board = createClickBoard();
    board.turn = "black";
    board.pieces = [bishop];
    board.isPremovePieceAvailable = jest.fn(() => false);

    expect(board.handleSquareClick(square, bishop)).toBe(false);
    expect(board.selectedClickPiece).toBeNull();
  });

  test("click moves request smooth animation from the existing drop handler", () => {
    const squareElement = document.createElement("td");
    const square = {
      0: squareElement,
      length: 1,
      droppable: jest.fn((action, option) => {
        expect(action).toBe("option");
        expect(option).toBe("drop");
        return function (event, ui) {
          expect(window.shouldAnimateProgrammaticMove).toBe(true);
          expect(ui.draggable.data("piece")).toBe(knight);
        };
      }),
    };
    const knight = createPiece("Knight", 8, 2, "white");
    const board = createClickBoard();

    expect(board.dropPieceOnSquare(knight, square)).toBe(true);
    expect(window.shouldAnimateProgrammaticMove).toBe(false);
  });

  test("clicking an occupied square stays committed to the selected piece", () => {
    const firstSquare = createSquare(8, 2);
    const secondSquare = createSquare(8, 3);
    const first = createPiece("Knight", 8, 2, "white");
    const second = createPiece("Bishop", 8, 3, "white");
    firstSquare.append(first.element);
    secondSquare.append(second.element);

    const board = createClickBoard();
    board.pieces = [first, second];
    board.dropPieceOnSquare = jest.fn();

    board.handleSquareClick(firstSquare, first);
    board.handleSquareClick(secondSquare, second);

    expect(board.selectedClickPiece).toBeNull();
    expect(board.dropPieceOnSquare).toHaveBeenCalledWith(first, secondSquare);
    expect(first.element.hasClass("click-move-selected-piece")).toBe(false);
    expect(second.element.hasClass("click-move-selected-piece")).toBe(false);
  });

  test("clicking the home rook after the king uses the castling drop path", () => {
    const kingSquare = createSquare(8, 5);
    const rookSquare = createSquare(8, 8);
    const king = createPiece("King", 8, 5, "white");
    const rook = createPiece("Rook", 8, 8, "white");
    kingSquare.append(king.element);
    rookSquare.append(rook.element);

    const board = createClickBoard();
    board.pieces = [king, rook];
    board.dropPieceOnSquare = jest.fn(() => true);

    board.handleSquareClick(kingSquare, king);
    board.handleSquareClick(rookSquare, rook);

    expect(board.dropPieceOnSquare).toHaveBeenCalledWith(king, rookSquare);
    expect(board.selectedClickPiece).toBeNull();
  });
});
