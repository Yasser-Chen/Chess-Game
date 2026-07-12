// Use the lite bundle so the engine stays local while remaining safely under
// GitHub's 100 MB file limit.
const STOCKFISH_SCRIPT_PATH = "static/stockfish/stockfish-18-lite-single.js";
const STOCKFISH_WASM_PATH = "static/stockfish/stockfish-18-lite-single.wasm";

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
  const from = coordsFromChessSquare(uci.slice(0, 2));
  const to = coordsFromChessSquare(uci.slice(2, 4));
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
    engine: null,
    ready: false,
    enabled: false,
    configuredForStrength: false,
    readyCallbacks: [],
    pendingBestMove: null,
    pendingEval: null,
    evalQueue: [],
    lastFen: null,
  };

  service.post = function (command) {
    if (!this.engine) return;
    this.engine.postMessage(command);
  };

  service.init = function () {
    if (this.engine || typeof Worker == "undefined") return;
    try {
      this.engine = new Worker(buildStockfishWorkerUrl());
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

  service.handleLine = function (line) {
    if (!line) return;
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
    this.post("ucinewgame");
    this.post("setoption name Clear Hash");
    this.post("position fen " + request.fen);
    this.post("go depth " + request.depth);
  };

  service.analyze = function (board) {
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

    this.evalQueue.push({
      fen,
      index,
      activeColor: fen.split(/\s+/)[1] == "b" ? "b" : "w",
      depth: 14,
      latest: null,
    });
    this.startNextEvaluation();
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
      setTimeout(() => finish(this.ready), 5000);
    });
  };

  service.getBestMove = function (board, options) {
    this.init();
    if (!this.engine) return Promise.resolve(null);

    const searchOptions = typeof options == "object" ? options : { depth: options };
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
      this.post("ucinewgame");
      this.post("isready");
      this.post(`position fen ${fen}`);

      return new Promise((resolve) => {
        const pending = { resolve, timer: null };
        this.pendingBestMove = pending;
        this.post(hasMoveTime ? `go movetime ${moveTime}` : `go depth ${depth}`);
        pending.timer = setTimeout(() => {
          if (this.pendingBestMove === pending) {
            this.pendingBestMove = null;
            resolve(null);
            this.startNextEvaluation();
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

window.StockfishChess = createStockfishService();
window.StockfishBotChess = createStockfishService("stockfish-bot");
window.boardToFen = boardToFen;
window.uciToMove = uciToMove;
window.hideEvaluationBar = hideEvaluationBar;
window.showFinalEvaluation = showFinalEvaluation;
window.updateEvaluationBar = updateEvaluationBar;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    boardToFen,
    createStockfishService,
    normalizeStockfishEvaluation,
    uciToMove,
  };
}
