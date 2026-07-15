require("./setup");

const {
  boardToFen,
  createStockfishService,
  normalizeStockfishEvaluation,
  uciToMove,
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

  test.each([
    ["e1g1", { x: 8, y: 5, newX: 8, newY: 8, promotion: null }],
    ["e1c1", { x: 8, y: 5, newX: 8, newY: 1, promotion: null }],
    ["e8g8", { x: 1, y: 5, newX: 1, newY: 8, promotion: null }],
    ["e8c8", { x: 1, y: 5, newX: 1, newY: 1, promotion: null }],
  ])("translates Stockfish castling %s to this board's king-on-rook move", (uci, expected) => {
    expect(uciToMove(uci)).toEqual(expected);
  });

  test("leaves ordinary UCI moves and promotion suffixes unchanged", () => {
    expect(uciToMove("e2e4")).toEqual({
      x: 7,
      y: 5,
      newX: 5,
      newY: 5,
      promotion: null,
    });
    expect(uciToMove("a7a8q")).toEqual({
      x: 2,
      y: 1,
      newX: 1,
      newY: 1,
      promotion: "q",
    });
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

  test("keeps every distinct history evaluation while Stockfish is busy", () => {
    const service = createStockfishService("bounded-queue-engine");
    service.engine = { postMessage: jest.fn() };
    service.ready = true;
    service.post = jest.fn();
    service.pendingEval = { fen: "search-in-progress", index: 0 };

    service.analyze({ pieces: [], turn: "white", positionHistoryIndex: 1 });
    service.analyze({ pieces: [], turn: "black", positionHistoryIndex: 2 });

    expect(service.evalQueue.map((request) => request.index)).toEqual([1, 2]);
  });

  test("background analysis starts the worker readiness watchdog", async () => {
    const service = createStockfishService("background-readiness-engine");
    service.init = jest.fn();
    service.engine = { postMessage: jest.fn() };
    service.ready = false;
    service.whenReady = jest.fn(() => Promise.resolve(true));
    service.startNextEvaluation = jest.fn();

    service.analyze({ pieces: [], turn: "white", positionHistoryIndex: 2 });
    await Promise.resolve();

    expect(service.whenReady).toHaveBeenCalledTimes(1);
    expect(service.startNextEvaluation).toHaveBeenCalledTimes(1);
  });

  test("discards an unfinished evaluation when a shared bot search preempts it", () => {
    const service = createStockfishService("preempted-evaluation-engine");
    service.engine = { postMessage: jest.fn() };
    service.ready = true;
    service.pendingEval = {
      index: 3,
      latest: { index: 3, type: "mate", raw: -1, whiteCp: -10000 },
    };

    service.handleLine("evaluationcancelled");

    expect(service.pendingEval).toMatchObject({ index: 3, latest: null });
  });

  test("disposing a service terminates its worker and settles pending work", async () => {
    const service = createStockfishService("disposed-engine");
    const terminate = jest.fn();
    const resolve = jest.fn();
    const timer = setTimeout(() => {}, 10000);
    service.engine = { terminate };
    service.ready = true;
    service.pendingEval = { fen: "old-position" };
    service.evalQueue = [{ fen: "next-position" }];
    service.pendingBestMove = { resolve, timer };

    service.dispose();

    expect(terminate).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(null);
    expect(service.engine).toBeNull();
    expect(service.pendingEval).toBeNull();
    expect(service.evalQueue).toEqual([]);
  });

  test("stale board cleanup cannot terminate a newer board's worker", () => {
    const service = createStockfishService("owned-engine");
    const oldBoard = {};
    const currentBoard = {};
    const oldTerminate = jest.fn();
    const currentTerminate = jest.fn();

    service.claim(oldBoard);
    service.engine = { terminate: oldTerminate };
    service.claim(currentBoard);
    service.engine = { terminate: currentTerminate };

    expect(oldTerminate).toHaveBeenCalledTimes(1);
    expect(service.dispose(oldBoard)).toBe(false);
    expect(currentTerminate).not.toHaveBeenCalled();
    expect(service.activeOwner).toBe(currentBoard);

    expect(service.dispose(currentBoard)).toBe(true);
    expect(currentTerminate).toHaveBeenCalledTimes(1);
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

  test("evaluation drift uses solid side areas and maps forced mate to the exact edge", () => {
    const board = Object.create(Board.prototype);
    board.positionHistory = [{}, {}];
    board.evaluationHistory = [
      { index: 0, type: "cp", whiteCp: 0 },
      { index: 1, type: "mate", raw: -1, whiteCp: -10000 },
    ];

    const graph = board.renderEvaluationDriftGraph();

    expect(graph).toContain('class="evaluation-drift-area-black"');
    expect(graph).toContain('class="evaluation-drift-area-white"');
    expect(graph).toContain('preserveAspectRatio="none"');
    expect(graph).not.toContain('class="evaluation-drift-point"');
    expect(graph).toContain('class="evaluation-drift-cursor" data-history-index="1" x1="415.0" y1="120.0"');
    expect(graph).toContain('class="evaluation-drift-hit" data-history-index="1"');
    expect(graph).toContain('class="evaluation-drift-hover-line"');
    expect(graph).not.toContain("evaluation-drift-endpoint-halo");
  });

  test("a timed-out best-move search terminates the stuck worker", async () => {
    jest.useFakeTimers();
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    const service = createStockfishService("timeout-engine");
    const terminate = jest.fn();
    service.engine = { terminate };
    service.ready = true;
    service.post = jest.fn();

    const result = service.getBestMove({ pieces: [], turn: "white" }, { timeout: 100 });
    await Promise.resolve();
    jest.advanceTimersByTime(100);

    await expect(result).resolves.toBeNull();
    expect(terminate).toHaveBeenCalled();
    expect(service.engine).toBeNull();
    expect(warning).toHaveBeenCalledWith(
      "timeout-engine unavailable: best-move search timed out"
    );
    warning.mockRestore();
    jest.useRealTimers();
  });

  test("falls back to a dedicated worker when the shared broker never becomes ready", async () => {
    jest.useFakeTimers();
    const originalWorker = global.Worker;
    const dedicatedEngine = {
      postMessage: jest.fn(),
      terminate: jest.fn(),
      onmessage: null,
      onerror: null,
      onmessageerror: null,
    };
    global.Worker = jest.fn(() => dedicatedEngine);

    const service = createStockfishService("shared-fallback-engine");
    const stalledSharedEngine = {
      isShared: true,
      postMessage: jest.fn(),
      terminate: jest.fn(),
      onmessage: null,
      onerror: null,
      onmessageerror: null,
    };
    service.engine = stalledSharedEngine;
    service.enabled = true;

    const readiness = service.whenReady();
    jest.advanceTimersByTime(5000);

    expect(stalledSharedEngine.terminate).toHaveBeenCalledTimes(1);
    expect(global.Worker).toHaveBeenCalledTimes(1);
    dedicatedEngine.onmessage({ data: "uciok" });
    dedicatedEngine.onmessage({ data: "readyok" });
    await expect(readiness).resolves.toBe(true);

    service.dispose();
    global.Worker = originalWorker;
    jest.useRealTimers();
  });
});
