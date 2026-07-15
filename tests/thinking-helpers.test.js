require("./setup");

const { Board } = require("../static/classes/board.js");

function createThinkingBoard() {
  const board = Object.create(Board.prototype);
  board.board = null;
  board.isFlipped = false;
  board.thinkingSquareHighlights = new Set();
  board.thinkingArrows = new Map();
  board.thinkingGesture = null;
  return board;
}

describe("thinking helpers", () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="game"><div id="boardArea"><table id="board"><tbody><tr>' +
      '<td x="4" y="5"></td><td x="6" y="3"></td><td x="8" y="2"></td>' +
      '</tr></tbody></table></div></div>';
    window.gameState = "playing";
    window.isGameOnline = false;
    window.isGameVsBot = false;
    window.playAs = null;
  });

  test("right-click square state toggles on and off", () => {
    const board = createThinkingBoard();

    expect(board.toggleThinkingSquare(4, 5)).toBe(true);
    expect(board.thinkingSquareHighlights.has("4,5")).toBe(true);
    expect(document.querySelector('td[x="4"][y="5"]').classList.contains("thinking-square-highlight")).toBe(true);

    expect(board.toggleThinkingSquare(4, 5)).toBe(true);
    expect(board.thinkingSquareHighlights.has("4,5")).toBe(false);
    expect(document.querySelector('td[x="4"][y="5"]').classList.contains("thinking-square-highlight")).toBe(false);
  });

  test("the same directed arrow gesture toggles the arrow", () => {
    const board = createThinkingBoard();

    expect(board.toggleThinkingArrow(8, 2, 6, 3)).toBe(true);
    expect(board.thinkingArrows.size).toBe(1);
    expect(document.querySelectorAll("#thinkingArrowPaths .thinking-arrow")).toHaveLength(1);
    expect(document.getElementById("thinkingArrowHead").getAttribute("viewBox")).toBe("0 0 12 8");
    expect(document.getElementById("thinkingArrowHead").getAttribute("refX")).toBe("4");
    expect(document.getElementById("thinkingArrowHead").getAttribute("markerWidth")).toBe("0.41");
    expect(document.getElementById("thinkingArrowHead").getAttribute("markerHeight")).toBe("0.71");
    expect(document.querySelector("#thinkingArrowHead path").getAttribute("d"))
      .toBe("M 0 0 L 12 4 L 0 8 Z");

    expect(board.toggleThinkingArrow(8, 2, 6, 3)).toBe(true);
    expect(board.thinkingArrows.size).toBe(0);
    expect(document.querySelectorAll("#thinkingArrowPaths .thinking-arrow")).toHaveLength(0);
  });

  test("knight arrows bend into an L while ordinary arrows stay straight", () => {
    const board = createThinkingBoard();

    expect(board.getThinkingArrowPath({ fromX: 8, fromY: 2, toX: 6, toY: 3 }))
      .toBe("M 1.5 7.25 L 1.5 5.5 L 2.18 5.5");
    expect(board.getThinkingArrowPath({ fromX: 8, fromY: 2, toX: 4, toY: 5 }))
      .toBe("M 1.65 7.3 L 4.308 3.756");
  });

  test("arrows stay fully visible while waiting for the opponent's move", () => {
    const board = createThinkingBoard();
    board.turn = "black";
    board.playAs = "white";
    window.isGameVsBot = true;
    window.playAs = "white";

    board.beginThinkingGesture(8, 2);
    board.updateThinkingGesture(6, 3);
    expect(document.querySelector(".thinking-arrow-preview")).not.toBeNull();
    expect(document.querySelector(".thinking-arrow-premove-hint")).toBeNull();

    board.finishThinkingGesture(6, 3);
    expect(document.querySelector(".thinking-arrow")).not.toBeNull();
    expect(document.querySelector(".thinking-arrow-premove-hint")).toBeNull();
  });

  test("a held gesture previews and commits an arrow", () => {
    const board = createThinkingBoard();

    expect(board.beginThinkingGesture(8, 2)).toBe(true);
    expect(board.updateThinkingGesture(6, 3)).toBe(true);
    expect(document.querySelector(".thinking-arrow-preview")).not.toBeNull();
    expect(board.finishThinkingGesture(6, 3)).toBe(true);
    expect(board.thinkingGesture).toBeNull();
    expect(board.thinkingArrows.has("8,2>6,3")).toBe(true);
    expect(document.querySelector(".thinking-arrow-preview")).toBeNull();
  });

  test("clearing helpers removes squares, arrows, and an active gesture", () => {
    const board = createThinkingBoard();
    board.toggleThinkingSquare(4, 5);
    board.toggleThinkingArrow(8, 2, 6, 3);
    board.beginThinkingGesture(4, 5);

    expect(board.clearThinkingHelpers()).toBe(true);
    expect(board.hasThinkingHelpers()).toBe(false);
    expect(document.querySelectorAll(".thinking-square-highlight")).toHaveLength(0);
    expect(document.querySelectorAll("#thinkingArrowPaths .thinking-arrow")).toHaveLength(0);
  });

  test("playing a move clears every thinking helper", () => {
    const board = createThinkingBoard();
    const pieceElement = $("<i></i>");
    const movingPiece = {
      x: 4,
      y: 5,
      color: "white",
      element: pieceElement,
      recalculateAttackingSquares: jest.fn(),
    };
    const origin = board.getSquare(4, 5);
    const destination = $(document.querySelector('td[x="6"][y="3"]'));
    origin.append(pieceElement);
    board.pieces = [movingPiece];
    board.moves = [];
    board.movesCounter = 0;
    board.highlightMoveSquares = jest.fn();
    board.toggleThinkingSquare(4, 5);
    board.toggleThinkingArrow(8, 2, 6, 3);

    movingPiece.x = 6;
    movingPiece.y = 3;
    board.moveTo(movingPiece, destination, {
      fromX: 4,
      fromY: 5,
      capturedPiece: null,
      isCapture: false,
      deferMoveSound: true,
      animate: false,
    });

    expect(board.hasThinkingHelpers()).toBe(false);
    expect(document.querySelectorAll(".thinking-square-highlight")).toHaveLength(0);
    expect(document.querySelectorAll("#thinkingArrowPaths .thinking-arrow")).toHaveLength(0);
  });
});
