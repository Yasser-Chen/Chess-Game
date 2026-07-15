require("./setup");

const botMove = require("../static/classes/action/bot.js");
const { Board } = require("../static/classes/board.js");

describe("bot premove support", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    window.gameState = "playing";
    window.BotPlaying = false;
    window.selectedBotType = "slow_weak";
  });

  afterEach(() => {
    if (typeof window.cancelBotRequest == "function") window.cancelBotRequest();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    delete global.makeMove;
    window.board = null;
    delete window.StockfishBotChess;
  });

  test("the slow weak bot is explicitly labelled for premove practice", () => {
    expect(window.BOT_CONFIGS.slow_weak.label).toMatch(/Premove Practice/);
  });

  test("the slow weak bot waits before moving and then executes queued premoves", () => {
    const botPiece = {
      color: "black",
      x: 1,
      y: 1,
      isLegal: (_board, x, y) => x == 2 && y == 1,
    };
    const board = {
      pieces: [botPiece],
      isCheckIfMovePlayed: jest.fn(() => false),
      tryExecutePremoveStack: jest.fn(),
    };
    window.board = board;
    global.makeMove = jest.fn(() => true);

    expect(botMove(board, "black")).toBe(true);
    expect(window.BotPlaying).toBe(true);
    expect(global.makeMove).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2199);
    expect(global.makeMove).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(global.makeMove).toHaveBeenCalledWith(board, 1, 1, 2, 1);
    expect(board.tryExecutePremoveStack).toHaveBeenCalled();
    expect(window.BotPlaying).toBe(false);
  });

  test("the weak bot ignores one broken move candidate and still moves", () => {
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    window.selectedBotType = "weak";
    const botPiece = {
      color: "black",
      x: 1,
      y: 1,
      isLegal: jest.fn((_board, x, y) => {
        if (x == 1 && y == 1) throw new Error("bad candidate");
        return x == 2 && y == 1;
      }),
    };
    const board = {
      turn: "black",
      pieces: [botPiece],
      isCheckIfMovePlayed: jest.fn(() => false),
      tryExecutePremoveStack: jest.fn(),
    };
    window.board = board;
    global.makeMove = jest.fn(() => true);

    expect(botMove(board, "black")).toBe(true);
    expect(global.makeMove).toHaveBeenCalledWith(board, 1, 1, 2, 1);
    expect(window.BotPlaying).toBe(false);
    expect(warning).toHaveBeenCalledWith(
      "Ignored a bot move candidate that could not be validated.",
      expect.objectContaining({ message: "bad candidate" })
    );
    warning.mockRestore();
  });

  test("Stockfish returning no move retries the engine without playing randomly", async () => {
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    window.selectedBotType = "stockfish";
    const botPiece = {
      color: "black",
      x: 1,
      y: 1,
      isLegal: (_board, x, y) => x == 2 && y == 1,
    };
    const board = {
      turn: "black",
      pieces: [botPiece],
      isCheckIfMovePlayed: jest.fn(() => false),
      tryExecutePremoveStack: jest.fn(),
    };
    window.board = board;
    window.StockfishBotChess = { getBestMove: jest.fn(() => Promise.resolve(null)) };
    global.makeMove = jest.fn(() => true);

    expect(botMove(board, "black")).toBe(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(global.makeMove).not.toHaveBeenCalled();
    expect(board.tryExecutePremoveStack).not.toHaveBeenCalled();
    expect(window.BotPlaying).toBe(false);
    expect(warning).toHaveBeenCalledWith(
      "Stockfish did not return a usable best move; retrying Stockfish."
    );

    jest.advanceTimersByTime(500);
    expect(window.StockfishBotChess.getBestMove).toHaveBeenCalledTimes(2);
    warning.mockRestore();
  });

  test("a Stockfish answer for an old position is discarded instead of racing the board", async () => {
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    window.selectedBotType = "stockfish";
    const botPiece = { color: "black", x: 1, y: 1, constructor: { name: "Pawn" } };
    const board = { turn: "black", pieces: [botPiece], tryExecutePremoveStack: jest.fn() };
    window.board = board;
    window.uciToMove = jest.fn(() => ({ x: 1, y: 1, newX: 2, newY: 1 }));
    let resolveSearch;
    window.StockfishBotChess = {
      getBestMove: jest.fn(() => new Promise((resolve) => { resolveSearch = resolve; })),
    };
    global.makeMove = jest.fn(() => true);

    expect(botMove(board, "black")).toBe(true);
    board.pieces.push({ color: "white", x: 8, y: 8, constructor: { name: "Queen" } });
    resolveSearch("a8a7");
    await Promise.resolve();
    await Promise.resolve();

    expect(global.makeMove).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      "Discarded a stale Stockfish answer because the position changed."
    );
    warning.mockRestore();
  });

  test("the next bot turn starts after premove execution can release its lock", () => {
    window.isGameVsBot = true;
    const board = Object.create(Board.prototype);
    board.playAs = "white";
    board.turn = "black";
    board.botMoveTimer = null;
    board.isExecutingPremoveStack = true;
    window.board = board;
    const originalBotMove = global.botMove;
    global.botMove = jest.fn(() => {
      expect(board.isExecutingPremoveStack).toBe(false);
      return true;
    });

    try {
      expect(board.scheduleBotMove("black")).toBe(true);
      expect(global.botMove).not.toHaveBeenCalled();

      board.isExecutingPremoveStack = false;
      jest.runOnlyPendingTimers();

      expect(global.botMove).toHaveBeenCalledWith(board, "black");
      expect(board.botMoveTimer).toBeNull();
    } finally {
      global.botMove = originalBotMove;
    }
  });
});
