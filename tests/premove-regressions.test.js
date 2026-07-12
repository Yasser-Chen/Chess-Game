require("./setup");

const { Board, getAuthoritativeMoveTarget } = require("../static/classes/board.js");
const { shouldAnimateMove } = require("../static/classes/action/move.js");

describe("premove regressions", () => {
  test("a future DOM occupant is not treated as a captured model piece", () => {
    const movingPawn = { x: 4, y: 4, color: "black" };
    const visuallyPremovedKnight = { x: 6, y: 5, color: "white" };

    expect(
      getAuthoritativeMoveTarget(
        [movingPawn, visuallyPremovedKnight],
        movingPawn,
        { capturedPiece: null }
      )
    ).toBeNull();
  });

  test("the authoritative target is captured even if its element is elsewhere", () => {
    const movingPiece = { x: 4, y: 4, color: "black" };
    const capturedPiece = { x: 4, y: 4, color: "white" };

    expect(
      getAuthoritativeMoveTarget(
        [movingPiece, capturedPiece],
        movingPiece,
        { capturedPiece }
      )
    ).toBe(capturedPiece);
  });

  test("explicitly disabling animation wins during online play", () => {
    window.isGameOnline = true;
    window.BotPlaying = false;

    expect(shouldAnimateMove({ animate: false })).toBe(false);
    expect(shouldAnimateMove({ animate: true })).toBe(true);
  });

  test("a quiet move does not treat an old null capture slot as a piece", () => {
    const origin = $("<div></div>");
    const destination = $("<div></div>");
    const element = $("<i></i>");
    const movingPiece = {
      x: 4,
      y: 4,
      color: "black",
      element,
      recalculateAttackingSquares: jest.fn(),
    };
    origin.append(element);

    const board = Object.create(Board.prototype);
    board.pieces = [movingPiece, null];
    board.moves = [];
    board.movesCounter = 0;
    board.highlightMoveSquares = jest.fn();

    expect(() => board.moveTo(movingPiece, destination, {
      fromX: 3,
      fromY: 4,
      capturedPiece: null,
      isCapture: false,
      deferMoveSound: true,
      animate: false,
    })).not.toThrow();

    expect(board.pieces).toEqual([movingPiece, null]);
    expect(destination[0].contains(movingPiece.element)).toBe(true);
  });
});
