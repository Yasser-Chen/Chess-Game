require("./setup");

const {
  boardToFen,
  createStockfishService,
  normalizeStockfishEvaluation,
} = require("../static/classes/stockfish-service.js");
const { Board } = require("../static/classes/board.js");

describe("evaluation consistency regressions", () => {
  test("normalizes Stockfish side-to-move scores to White's perspective", () => {
    expect(normalizeStockfishEvaluation("cp", 42, "w", 3).whiteCp).toBe(42);
    expect(normalizeStockfishEvaluation("cp", 42, "b", 3).whiteCp).toBe(-42);
    expect(normalizeStockfishEvaluation("mate", -2, "b", 3).whiteCp).toBe(10000);
    expect(normalizeStockfishEvaluation("mate", 0, "b", 3).whiteCp).toBe(10000);
    expect(normalizeStockfishEvaluation("mate", 0, "w", 3).whiteCp).toBe(-10000);
  });

  test("builds canonical FEN metadata from a recorded position", () => {
    const snapshot = {
      pieces: [
        { type: "King", color: "white", x: 8, y: 5, firstMoveDone: false },
        { type: "Rook", color: "white", x: 8, y: 1, firstMoveDone: false },
        { type: "Rook", color: "white", x: 8, y: 8, firstMoveDone: false },
        { type: "King", color: "black", x: 1, y: 5, firstMoveDone: false },
        { type: "Rook", color: "black", x: 1, y: 1, firstMoveDone: false },
        { type: "Rook", color: "black", x: 1, y: 8, firstMoveDone: false },
        { type: "Pawn", color: "black", x: 4, y: 5, firstMoveDone: true },
      ],
      turn: "white",
      movesCounter: 0,
      normalMovesCounter: 1,
      lastPawnMoved: { type: "Pawn", color: "black", x: 4, y: 5 },
      lastMove: [
        { x: 2, y: 5, role: "origin" },
        { x: 4, y: 5, role: "destination" },
      ],
    };

    const fields = boardToFen(snapshot).split(" ");
    expect(fields.slice(1)).toEqual(["w", "KQkq", "e6", "0", "1"]);
  });

  test("queues a fixed-depth evaluation and keeps only its final search score", () => {
    const service = createStockfishService("test-engine");
    const commands = [];
    service.engine = {};
    service.ready = true;
    service.post = (command) => commands.push(command);

    service.analyze({
      pieces: [],
      turn: "black",
      movesCounter: 0,
      normalMovesCounter: 1,
      positionHistoryIndex: 4,
    });

    expect(commands).toContain("setoption name Clear Hash");
    expect(commands).toContain("go depth 14");
    service.handleLine("info depth 14 score cp 35 nodes 1000");
    expect(service.pendingEval.latest).toMatchObject({ index: 4, whiteCp: -35 });
  });

  test("stores one evaluation per history position", () => {
    const board = Object.create(Board.prototype);
    board.evaluationHistory = [];
    board.positionHistory = [{}, {}];
    board.positionHistoryIndex = 1;

    board.recordEvaluationPoint({ index: 0, type: "cp", whiteCp: 10 });
    board.recordEvaluationPoint({ index: 0, type: "cp", whiteCp: 15 });

    expect(board.evaluationHistory).toHaveLength(1);
    expect(board.evaluationHistory[0].whiteCp).toBe(15);
    expect(board.positionHistory[0].evaluation.whiteCp).toBe(15);
  });
});
