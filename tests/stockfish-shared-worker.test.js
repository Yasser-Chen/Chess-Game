require("./setup");

describe("shared Stockfish broker", () => {
  test("shares one engine, prioritizes bots, and closes only after the last client", () => {
    const originalSelf = global.self;
    const originalWorker = global.Worker;
    const nestedEngine = {
      postMessage: jest.fn(),
      terminate: jest.fn(),
      onmessage: null,
      onerror: null,
    };
    const workerScope = {
      location: { href: "https://chess.test/static/classes/stockfish-shared-worker.js" },
      close: jest.fn(),
      onconnect: null,
    };
    const makePort = () => ({
      postMessage: jest.fn(),
      close: jest.fn(),
      start: jest.fn(),
      onmessage: null,
    });

    global.self = workerScope;
    global.Worker = jest.fn(() => nestedEngine);
    jest.isolateModules(() => {
      require("../static/classes/stockfish-shared-worker.js");
    });

    const evaluationPort = makePort();
    const botPort = makePort();
    workerScope.onconnect({ ports: [evaluationPort] });
    workerScope.onconnect({ ports: [botPort] });
    expect(global.Worker).toHaveBeenCalledTimes(1);

    nestedEngine.onmessage({ data: "uciok" });
    nestedEngine.onmessage({ data: "readyok" });
    expect(evaluationPort.postMessage).toHaveBeenCalledWith({ type: "ready" });
    expect(botPort.postMessage).toHaveBeenCalledWith({ type: "ready" });

    evaluationPort.onmessage({
      data: { type: "search", priority: "evaluation", commands: ["position fen eval", "go depth 14"] },
    });
    botPort.onmessage({
      data: { type: "search", priority: "bot", commands: ["position fen bot", "go movetime 3000"] },
    });
    expect(nestedEngine.postMessage).toHaveBeenCalledWith("stop");
    expect(evaluationPort.postMessage).toHaveBeenCalledWith({
      type: "line",
      line: "evaluationcancelled",
    });

    nestedEngine.onmessage({ data: "bestmove e2e4" });
    expect(nestedEngine.postMessage).toHaveBeenCalledWith("position fen bot");
    expect(nestedEngine.postMessage).toHaveBeenCalledWith("go movetime 3000");

    evaluationPort.onmessage({ data: { type: "close" } });
    expect(nestedEngine.terminate).not.toHaveBeenCalled();
    expect(workerScope.close).not.toHaveBeenCalled();

    botPort.onmessage({ data: { type: "close" } });
    expect(nestedEngine.terminate).toHaveBeenCalledTimes(1);
    expect(workerScope.close).toHaveBeenCalledTimes(1);

    global.self = originalSelf;
    global.Worker = originalWorker;
  });
});
