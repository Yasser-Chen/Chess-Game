// Use the lite bundle so the engine stays local while remaining safely under
// GitHub's 100 MB file limit.
const STOCKFISH_SCRIPT_PATH = "static/stockfish/stockfish-18-lite-single.js";
const STOCKFISH_WASM_PATH = "static/stockfish/stockfish-18-lite-single.wasm";
const STOCKFISH_SHARED_WORKER_PATH = "static/classes/stockfish-shared-worker.js";

function buildStockfishWorkerUrl() {
  const scriptUrl = new URL(STOCKFISH_SCRIPT_PATH, window.location.href);
  const wasmUrl = new URL(STOCKFISH_WASM_PATH, window.location.href);

  // The bundled Stockfish worker reads the worker URL hash as the exact WASM URL.
  // Without this, some browsers try to fetch stockfish.wasm or resolve the
  // wasm next to the current page, which makes the engine fail with
  // "WASM streaming failed: TypeError: Failed to fetch".
  scriptUrl.hash = encodeURIComponent(wasmUrl.href);
  return scriptUrl.href;
}

function createSharedStockfishEngine() {
  if (typeof SharedWorker == "undefined") return null;

  const workerUrl = new URL(STOCKFISH_SHARED_WORKER_PATH, window.location.href);
  const sharedWorker = new SharedWorker(workerUrl.href, "chess-stockfish");
  const port = sharedWorker.port;
  const engine = {
    isShared: true,
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    ready: false,
    uciRequested: false,
    readyRequested: false,
    closed: false,
  };

  const emitLine = function (line) {
    if (typeof engine.onmessage == "function") {
      engine.onmessage({ data: line });
    }
  };

  engine.postMessage = function (command) {
    if (this.closed) return;
    if (command == "uci") {
      this.uciRequested = true;
      if (this.ready) emitLine("uciok");
      return;
    }
    if (command == "isready") {
      this.readyRequested = true;
      if (this.ready) emitLine("readyok");
      return;
    }
    if (command == "stop") {
      port.postMessage({ type: "cancel" });
    }
    // Engine-wide options are configured once by the broker. Forwarding them
    // from every tab would let one page mutate another page's active search.
  };

  engine.startSearch = function (commands, priority) {
    if (this.closed) return;
    port.postMessage({
      type: "search",
      commands,
      priority: priority == "bot" ? "bot" : "evaluation",
    });
  };

  engine.terminate = function () {
    if (this.closed) return;
    this.closed = true;
    try {
      port.postMessage({ type: "close" });
      port.close();
    } catch (e) {
      // The browser may already have detached this page's port.
    }
  };

  port.onmessage = function (event) {
    const message = event.data || {};
    if (message.type == "ready") {
      engine.ready = true;
      if (engine.uciRequested) {
        emitLine("uciok");
      } else if (engine.readyRequested) {
        emitLine("readyok");
      }
      return;
    }
    if (message.type == "line") {
      emitLine(message.line);
      return;
    }
    if (message.type == "error" && typeof engine.onerror == "function") {
      engine.onerror({ message: message.message || "Shared Stockfish worker failed" });
    }
  };
  port.onmessageerror = function (event) {
    if (typeof engine.onmessageerror == "function") engine.onmessageerror(event);
  };
  port.start();
  port.postMessage({ type: "connect" });
  return engine;
}

function chessSquareFromCoords(x, y) {
  const files = "abcdefgh";
  return `${files[y - 1]}${9 - x}`;
}

function coordsFromChessSquare(square) {
  const files = "abcdefgh";
  return {
    x: 9 - Number(square[1]),
    y: files.indexOf(square[0]) + 1,
  };
}

function pieceToFenLetter(piece) {
  const letters = {
    King: "k",
    Queen: "q",
    Rook: "r",
    Bishop: "b",
    Knight: "n",
    Pawn: "p",
  };
  const pieceType = piece && (piece.type || (piece.constructor && piece.constructor.name));
  const letter = letters[pieceType];
  if (!letter) return "";
  return piece.color == "white" ? letter.toUpperCase() : letter;
}

function pieceTypeName(piece) {
  return piece && (piece.type || (piece.constructor && piece.constructor.name)) || "";
}

function boardToFen(board) {
  if (!board) return "startpos";

  if (board.pieces && typeof board.pieceAtSquare != "function") {
    board = {
      pieces: board.pieces,
      turn: board.turn,
      movesCounter: board.movesCounter,
      normalMovesCounter: board.normalMovesCounter,
      lastMove: board.lastMove,
      lastPawnMoved: board.lastPawnMoved,
      pieceAtSquare: function (x, y) {
        return this.pieces.find(function (piece) {
          return piece && piece.x == x && piece.y == y;
        }) || null;
      },
    };
  }

  const ranks = [];
  for (let x = 1; x <= 8; x++) {
    let rank = "";
    let empty = 0;
    for (let y = 1; y <= 8; y++) {
      const piece = board.pieceAtSquare(x, y);
      const letter = pieceToFenLetter(piece);
      if (letter) {
        if (empty) {
          rank += empty;
          empty = 0;
        }
        rank += letter;
      } else {
        empty++;
      }
    }
    if (empty) rank += empty;
    ranks.push(rank);
  }

  const activeColor = board.turn == "black" ? "b" : "w";
  let castling = "";
  const whiteKing = board.pieceAtSquare(8, 5);
  const blackKing = board.pieceAtSquare(1, 5);
  const whiteKingsideRook = board.pieceAtSquare(8, 8);
  const whiteQueensideRook = board.pieceAtSquare(8, 1);
  const blackKingsideRook = board.pieceAtSquare(1, 8);
  const blackQueensideRook = board.pieceAtSquare(1, 1);

  if (whiteKing && pieceTypeName(whiteKing) == "King" && !whiteKing.firstMoveDone) {
    if (whiteKingsideRook && pieceTypeName(whiteKingsideRook) == "Rook" && !whiteKingsideRook.firstMoveDone) castling += "K";
    if (whiteQueensideRook && pieceTypeName(whiteQueensideRook) == "Rook" && !whiteQueensideRook.firstMoveDone) castling += "Q";
  }
  if (blackKing && pieceTypeName(blackKing) == "King" && !blackKing.firstMoveDone) {
    if (blackKingsideRook && pieceTypeName(blackKingsideRook) == "Rook" && !blackKingsideRook.firstMoveDone) castling += "k";
    if (blackQueensideRook && pieceTypeName(blackQueensideRook) == "Rook" && !blackQueensideRook.firstMoveDone) castling += "q";
  }

  const latestSnapshot = board.positionHistory && board.positionHistory.length
    ? board.positionHistory[board.positionHistoryIndex >= 0 ? board.positionHistoryIndex : board.positionHistory.length - 1]
    : null;
  const lastMove = board.lastMove || (latestSnapshot && latestSnapshot.lastMove) || [];
  const lastPawnMoved = board.lastPawnMoved || (latestSnapshot && latestSnapshot.lastPawnMoved) ||
    (typeof window != "undefined" ? window.lastPawnMoved : null);
  const origin = lastMove.find((square) => square && square.role == "origin");
  const destination = lastMove.find((square) => square && square.role == "destination");
  const enPassant = lastPawnMoved && pieceTypeName(lastPawnMoved) == "Pawn" &&
    origin && destination && origin.y == destination.y && Math.abs(origin.x - destination.x) == 2
      ? chessSquareFromCoords((origin.x + destination.x) / 2, destination.y)
      : "-";

  const halfmoveClock = Math.max(0, Number(board.movesCounter) || 0);
  const boardHalfMoves = Number(board.normalMovesCounter);
  const playedHalfMoves = Number.isFinite(boardHalfMoves)
    ? boardHalfMoves
    : Number(typeof window != "undefined" ? window.normalMovesCounter : 0);
  const fullmoveNumber = Number.isFinite(playedHalfMoves)
    ? Math.max(1, Math.floor(playedHalfMoves / 2) + 1)
    : 1;
  return `${ranks.join("/")} ${activeColor} ${castling || "-"} ${enPassant} ${halfmoveClock} ${fullmoveNumber}`;
}

function uciToMove(uci) {
  if (!uci || uci.length < 4) return null;
  const fromSquare = uci.slice(0, 2);
  let toSquare = uci.slice(2, 4);

  // Stockfish uses standard UCI king destinations for castling (e1g1,
  // e1c1, e8g8, e8c8). This board's move API represents castling by moving
  // the king onto its rook, after which the drop handler places both pieces
  // on their final squares. Translate only those four unambiguous moves.
  const castlingRookSquares = {
    e1g1: "h1",
    e1c1: "a1",
    e8g8: "h8",
    e8c8: "a8",
  };
  toSquare = castlingRookSquares[`${fromSquare}${toSquare}`] || toSquare;

  const from = coordsFromChessSquare(fromSquare);
  const to = coordsFromChessSquare(toSquare);
  if (!from.y || !to.y || !from.x || !to.x) return null;
  return { x: from.x, y: from.y, newX: to.x, newY: to.y, promotion: uci[4] || null };
}

function normalizeStockfishEvaluation(type, raw, activeColor, index) {
  const sideToMoveCp = type == "mate"
    ? (raw > 0 ? 10000 : -10000)
    : raw;
  const whiteCp = activeColor == "b" ? -sideToMoveCp : sideToMoveCp;
  return { type, raw, whiteCp, index, source: "engine" };
}

function createStockfishService(name) {
  const service = {
    name: name || "stockfish",
    isStockfishService: true,
    activeOwner: null,
    engine: null,
    ready: false,
    enabled: false,
    configuredForStrength: false,
    readyCallbacks: [],
    pendingBestMove: null,
    pendingEval: null,
    evalQueue: [],
    lastFen: null,
    sharedFallbackStarted: false,
  };

  service.post = function (command) {
    if (!this.engine) return;
    this.engine.postMessage(command);
  };

  service.claim = function (owner) {
    if (!owner) return false;
    if (this.activeOwner === owner) return true;

    // A new board generation supersedes any unfinished work from the previous
    // one. Dispose the old worker before changing ownership so late cleanup
    // from the old board cannot target the new worker.
    if (this.activeOwner || this.engine) this.dispose();
    this.activeOwner = owner;
    return true;
  };

  service.init = function (forceDedicated) {
    if (this.engine || typeof Worker == "undefined") return;
    try {
      if (!forceDedicated && !this.sharedFallbackStarted) {
        try {
          this.engine = createSharedStockfishEngine();
        } catch (sharedWorkerError) {
          // Some browsers expose SharedWorker but disable it for the current
          // context. Fall back to a page-owned worker without breaking the game.
          this.engine = null;
        }
      }
      this.engine = this.engine || new Worker(buildStockfishWorkerUrl());
      this.enabled = true;
      this.engine.onmessage = (event) => this.handleLine(String(event.data || ""));
      this.engine.onerror = (error) => this.markUnavailable(
        error && error.message ? error.message : "Stockfish worker failed to load"
      );
      this.engine.onmessageerror = () => this.markUnavailable("Stockfish worker message failed");
      this.post("uci");
      this.post("isready");
    } catch (error) {
      this.markUnavailable(error && error.message ? error.message : "Stockfish unavailable");
    }
  };

  service.markUnavailable = function (message) {
    console.warn(`${this.name} unavailable: ${message}`);
    this.enabled = false;
    this.ready = false;
    this.configuredForStrength = false;
    this.readyCallbacks.splice(0).forEach((callback) => callback(false));
    if (this.pendingBestMove) {
      const pending = this.pendingBestMove;
      this.pendingBestMove = null;
      if (pending.timer) clearTimeout(pending.timer);
      pending.resolve(null);
    }
    this.pendingEval = null;
    this.evalQueue = [];
    if (this.engine) {
      try {
        this.engine.terminate();
      } catch (e) {
        // Ignore terminate failures; the worker is already unusable.
      }
    }
    this.engine = null;
  };

  service.dispose = function (owner) {
    if (owner && this.activeOwner !== owner) return false;

    this.enabled = false;
    this.ready = false;
    this.configuredForStrength = false;
    this.lastFen = null;
    this.evalQueue = [];
    this.pendingEval = null;
    this.readyCallbacks.splice(0).forEach((callback) => callback(false));

    if (this.pendingBestMove) {
      const pending = this.pendingBestMove;
      this.pendingBestMove = null;
      if (pending.timer) clearTimeout(pending.timer);
      pending.resolve(null);
    }

    if (this.engine) {
      try {
        this.engine.onmessage = null;
        this.engine.onerror = null;
        this.engine.onmessageerror = null;
        this.engine.terminate();
      } catch (e) {
        // The worker may already have stopped during page or game teardown.
      }
    }
    this.engine = null;
    this.activeOwner = null;
    return true;
  };

  service.handleLine = function (line) {
    if (!line) return;
    if (line == "evaluationcancelled") {
      const interrupted = this.pendingEval;
      this.pendingEval = null;
      if (interrupted && !this.evalQueue.some((request) =>
        request.fen == interrupted.fen && request.index == interrupted.index
      )) {
        interrupted.latest = null;
        this.evalQueue.unshift(interrupted);
      }
      this.startNextEvaluation();
      return;
    }
    if (line == "uciok") {
      if (!this.configuredForStrength) {
        this.configuredForStrength = true;
        this.post("setoption name UCI_LimitStrength value false");
        this.post("setoption name Skill Level value 20");
        this.post("setoption name Threads value 1");
        this.post("setoption name Hash value 64");
      }
      this.post("isready");
      return;
    }

    if (line == "readyok") {
      this.ready = true;
      const callbacks = this.readyCallbacks.splice(0);
      callbacks.forEach((callback) => callback());
      this.startNextEvaluation();
      return;
    }

    const evalMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
    if (evalMatch && this.pendingEval) {
      const type = evalMatch[1];
      const raw = Number(evalMatch[2]);
      this.pendingEval.latest = normalizeStockfishEvaluation(
        type,
        raw,
        this.pendingEval.activeColor,
        this.pendingEval.index
      );
    }

    if (line.indexOf("bestmove ") == 0) {
      const bestMove = line.split(/\s+/)[1];
      if (this.pendingBestMove) {
        const pending = this.pendingBestMove;
        this.pendingBestMove = null;
        if (pending.timer) clearTimeout(pending.timer);
        pending.resolve(bestMove && bestMove != "(none)" ? bestMove : null);
        this.startNextEvaluation();
      }
      if (this.pendingEval) {
        if (this.pendingEval.latest) {
          updateEvaluationBar(this.pendingEval.latest);
        }
        this.pendingEval = null;
        this.startNextEvaluation();
      }
    }
  };

  service.startNextEvaluation = function () {
    if (!this.engine || !this.ready || this.pendingEval || this.pendingBestMove || !this.evalQueue.length) return;
    const request = this.evalQueue.shift();
    this.pendingEval = request;
    this.lastFen = request.fen;
    // Identical position + identical depth + an empty hash makes independent
    // clients converge on the same result as closely as a local engine can.
    const commands = [
      "ucinewgame",
      "setoption name Clear Hash",
      "position fen " + request.fen,
      "go depth " + request.depth,
    ];
    if (typeof this.engine.startSearch == "function") {
      this.engine.startSearch(commands, "evaluation");
    } else {
      commands.forEach((command) => this.post(command));
    }
  };

  service.analyze = function (board, owner) {
    if (owner && this.activeOwner !== owner) return;
    this.init();
    if (!this.engine) return;
    const fen = boardToFen(board);
    const index = Number.isInteger(board.positionHistoryIndex)
      ? board.positionHistoryIndex
      : null;
    const duplicate =
      (this.pendingEval && this.pendingEval.fen == fen && this.pendingEval.index == index) ||
      this.evalQueue.some((request) => request.fen == fen && request.index == index);
    if (duplicate) return;

    const request = {
      fen,
      index,
      activeColor: fen.split(/\s+/)[1] == "b" ? "b" : "w",
      depth: 14,
      latest: null,
      owner: owner || this.activeOwner,
    };

    // Keep every distinct history position. The queue is processed in the
    // background and is bounded far above a normal game to prevent unbounded
    // growth from malformed callers.
    if (this.evalQueue.length >= 512) this.evalQueue.shift();
    this.evalQueue.push(request);
    if (this.ready) {
      this.startNextEvaluation();
    } else {
      // Background analysis needs the same stalled-SharedWorker watchdog as
      // interactive bot searches. Without this call, a broker that constructs
      // but never reaches readyok leaves every graph sample queued forever.
      this.whenReady().then(() => this.startNextEvaluation());
    }
  };

  service.whenReady = function () {
    this.init();
    if (!this.engine) return Promise.resolve(false);
    if (this.ready) return Promise.resolve(true);

    return new Promise((resolve) => {
      let resolved = false;
      const finish = (value) => {
        if (resolved) return;
        resolved = true;
        resolve(value === false ? false : true);
      };

      this.readyCallbacks.push(finish);
      this.post("isready");
      setTimeout(() => {
        if (this.ready) {
          finish(true);
          return;
        }

        // A SharedWorker can be constructed successfully yet still fail before
        // its nested WASM worker completes the UCI handshake. Retrying the same
        // persistent broker then returns null forever. Abandon it once for this
        // service and continue with the proven page-owned worker path.
        if (this.engine && this.engine.isShared && !this.sharedFallbackStarted) {
          this.sharedFallbackStarted = true;
          const stalledSharedEngine = this.engine;
          this.engine = null;
          try {
            stalledSharedEngine.onmessage = null;
            stalledSharedEngine.onerror = null;
            stalledSharedEngine.onmessageerror = null;
            stalledSharedEngine.terminate();
          } catch (e) {
            // The stalled shared port may already have disconnected.
          }
          this.init(true);
          if (!this.engine) {
            finish(false);
            return;
          }
          this.post("isready");
          setTimeout(() => finish(this.ready), 5000);
          return;
        }

        finish(false);
      }, 5000);
    });
  };

  service.getBestMove = function (board, options) {
    const searchOptions = typeof options == "object" ? options : { depth: options };
    const owner = searchOptions.owner;
    if (owner && this.activeOwner !== owner) return Promise.resolve(null);

    this.init();
    if (!this.engine) return Promise.resolve(null);

    const depth = searchOptions.depth || 16;
    const hasMoveTime = Number(searchOptions.moveTime) > 0;
    const moveTime = hasMoveTime ? Number(searchOptions.moveTime) : 0;
    const timeout = Number(searchOptions.timeout) > 0
      ? Number(searchOptions.timeout)
      : hasMoveTime
        ? Math.max(7000, moveTime + 5000)
        : 45000;

    return this.whenReady().then((isReady) => {
      if (!isReady || !this.engine) return null;

      const fen = boardToFen(board);
      this.lastFen = fen;
      this.pendingEval = null;
      this.post("stop");

      return new Promise((resolve) => {
        const pending = { resolve, timer: null, owner: owner || this.activeOwner };
        this.pendingBestMove = pending;
        const commands = [
          "ucinewgame",
          `position fen ${fen}`,
          hasMoveTime ? `go movetime ${moveTime}` : `go depth ${depth}`,
        ];
        if (typeof this.engine.startSearch == "function") {
          this.engine.startSearch(commands, "bot");
        } else {
          commands.forEach((command) => this.post(command));
        }
        pending.timer = setTimeout(() => {
          if (this.pendingBestMove === pending) {
            // A timed-out worker may still be stuck in native/WASM search.
            // Tear it down so the next bot turn starts with a clean engine.
            this.markUnavailable("best-move search timed out");
          }
        }, timeout);
      });
    });
  };

  return service;
}

function updateStockfishStatus(text, isError) {
  // Status text intentionally disabled: live engine state was noisy and not useful.
}

function updateEvaluationBar(evaluation) {
  const fill = $("#evaluationWhiteFill");
  const label = $("#evaluationScore");
  if (!fill.length || !label.length || !evaluation) return;

  const isGameOver = typeof window != "undefined" && window.gameState != "playing";
  if (evaluation.source != "history" && typeof window != "undefined" && window.board &&
      typeof window.board.recordEvaluationPoint == "function") {
    window.board.recordEvaluationPoint(evaluation);
  }

  if (!isGameOver && evaluation.source != "final") {
    hideEvaluationBar();
    return;
  }

  const whitePercent = evaluation.type == "mate"
    ? evaluation.whiteCp > 0 ? 100 : 0
    : Math.max(5, Math.min(95, 50 + Math.max(-1000, Math.min(1000, evaluation.whiteCp)) / 20));

  const whiteIsTop = typeof window != "undefined" && window.board &&
    (typeof window.board.getVisualSideForColor == "function"
      ? window.board.getVisualSideForColor("white") == "top"
      : !!window.board.isFlipped);
  $("#evaluationBar")
    .toggleClass("evaluation-white-top", !!whiteIsTop)
    .addClass("evaluation-visible");
  if (typeof window != "undefined" && window.matchMedia && window.matchMedia("(max-width: 680px)").matches) {
    fill.css({ width: `${whitePercent}%`, height: "100%" });
  } else {
    fill.css({ height: `${whitePercent}%`, width: "100%" });
  }

  if (evaluation.type == "mate") {
    const side = evaluation.whiteCp > 0 ? "+" : "-";
    label.text(`${side}M${Math.abs(evaluation.raw)}`);
  } else {
    const pawns = evaluation.whiteCp / 100;
    label.text(`${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`);
  }
}

function hideEvaluationBar() {
  $("#evaluationBar").removeClass("evaluation-visible");
}

function showPendingEvaluationBar() {
  const fill = $("#evaluationWhiteFill");
  const label = $("#evaluationScore");
  if (!fill.length || !label.length) return;
  $("#evaluationBar").addClass("evaluation-visible");
  if (typeof window != "undefined" && window.matchMedia && window.matchMedia("(max-width: 680px)").matches) {
    fill.css({ width: "50%", height: "100%" });
  } else {
    fill.css({ height: "50%", width: "100%" });
  }
  label.text("…");
}

function showFinalEvaluation(result) {
  if (!result || result.result == "draw" || !result.winner) {
    hideEvaluationBar();
    return;
  }

  updateEvaluationBar({
    type: "mate",
    raw: 1,
    whiteCp: result.winner == "white" ? 10000 : -10000,
    source: "final",
  });
}

// If this bundle is evaluated again in the same Window, synchronously dispose
// only services created by the previous evaluation before replacing them.
// Window globals are tab-scoped, so this cannot terminate another open page's
// workers.
[window.StockfishChess, window.StockfishBotChess].forEach(function (service) {
  if (service && service.isStockfishService && typeof service.dispose == "function") {
    service.dispose();
  }
});

const pageEvaluationService = createStockfishService();
const pageBotService = createStockfishService("stockfish-bot");
window.StockfishChess = pageEvaluationService;
window.StockfishBotChess = pageBotService;
window.boardToFen = boardToFen;
window.uciToMove = uciToMove;
window.hideEvaluationBar = hideEvaluationBar;
window.showPendingEvaluationBar = showPendingEvaluationBar;
window.showFinalEvaluation = showFinalEvaluation;
window.updateEvaluationBar = updateEvaluationBar;

if (typeof window.addEventListener == "function") {
  window.addEventListener("pagehide", function () {
    // Capture this bundle's exact instances. A late event from an older bundle
    // must never dispose replacement services installed after it.
    pageEvaluationService.dispose();
    pageBotService.dispose();
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    boardToFen,
    createStockfishService,
    normalizeStockfishEvaluation,
    uciToMove,
  };
}
