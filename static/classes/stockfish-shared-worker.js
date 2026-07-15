// One Stockfish engine for every same-origin page using this SharedWorker.
// Pages own ports and jobs; the broker owns the expensive WASM worker.
const STOCKFISH_SCRIPT_PATH = "../stockfish/stockfish-18-lite-single.js";
const STOCKFISH_WASM_PATH = "../stockfish/stockfish-18-lite-single.wasm";

const clients = new Set();
const botQueue = [];
const evaluationQueue = [];
let engine = null;
let engineReady = false;
let activeJob = null;
let preemptedJob = null;

function buildEngineUrl() {
  const scriptUrl = new URL(STOCKFISH_SCRIPT_PATH, self.location.href);
  const wasmUrl = new URL(STOCKFISH_WASM_PATH, self.location.href);
  scriptUrl.hash = encodeURIComponent(wasmUrl.href);
  return scriptUrl.href;
}

function broadcast(message) {
  clients.forEach(function (client) {
    try {
      client.port.postMessage(message);
    } catch (e) {
      clients.delete(client);
    }
  });
}

function initEngine() {
  if (engine) return;
  engine = new Worker(buildEngineUrl());
  engine.onmessage = function (event) {
    const line = String(event.data || "");
    if (line == "uciok") {
      engine.postMessage("setoption name UCI_LimitStrength value false");
      engine.postMessage("setoption name Skill Level value 20");
      engine.postMessage("setoption name Threads value 1");
      engine.postMessage("setoption name Hash value 64");
      engine.postMessage("isready");
      return;
    }
    if (line == "readyok" && !engineReady) {
      engineReady = true;
      broadcast({ type: "ready" });
      startNextJob();
      return;
    }

    if (activeJob && !activeJob.cancelled) {
      try {
        activeJob.client.port.postMessage({ type: "line", line });
      } catch (e) {
        activeJob.cancelled = true;
      }
    }

    if (line.indexOf("bestmove ") == 0) {
      activeJob = null;
      preemptedJob = null;
      startNextJob();
    }
  };
  engine.onerror = function (event) {
    broadcast({
      type: "error",
      message: event && event.message ? event.message : "Shared Stockfish engine failed",
    });
    try {
      engine.terminate();
    } catch (e) {
      // The failed nested worker may already be gone.
    }
    engine = null;
    engineReady = false;
    activeJob = null;
    preemptedJob = null;
  };
  engine.postMessage("uci");
}

function startNextJob() {
  if (!engineReady || activeJob) return;
  const next = botQueue.shift() || evaluationQueue.shift();
  if (!next) return;
  if (next.cancelled || !clients.has(next.client)) {
    startNextJob();
    return;
  }
  activeJob = next;
  next.commands.forEach(function (command) {
    engine.postMessage(command);
  });
}

function removeQueuedJobs(client) {
  [botQueue, evaluationQueue].forEach(function (queue) {
    for (let index = queue.length - 1; index >= 0; index--) {
      if (queue[index].client === client) queue.splice(index, 1);
    }
  });
}

function cancelClientJobs(client) {
  removeQueuedJobs(client);
  if (activeJob && activeJob.client === client) {
    activeJob.cancelled = true;
    engine.postMessage("stop");
  }
}

function closeClient(client) {
  cancelClientJobs(client);
  clients.delete(client);
  try {
    client.port.close();
  } catch (e) {
    // The page may already have detached its port.
  }

  if (!clients.size) {
    botQueue.length = 0;
    evaluationQueue.length = 0;
    if (engine) {
      try {
        engine.terminate();
      } catch (e) {
        // The nested worker may already have stopped.
      }
    }
    engine = null;
    engineReady = false;
    activeJob = null;
    self.close();
  }
}

function queueJob(client, message) {
  const job = {
    client,
    commands: Array.isArray(message.commands) ? message.commands.slice() : [],
    priority: message.priority == "bot" ? "bot" : "evaluation",
    cancelled: false,
  };
  if (!job.commands.length) return;

  if (job.priority == "bot") {
    botQueue.push(job);
    // A bot move is interactive. Stop a background evaluation, discard it,
    // and start the bot as soon as Stockfish acknowledges the stop.
    if (activeJob && activeJob.priority == "evaluation" && !preemptedJob) {
      preemptedJob = activeJob;
      activeJob.cancelled = true;
      try {
        // Tell the client this search was discarded. A synthetic bestmove
        // completion would make it commit the last partial `info score` line,
        // which can be a wildly unstable mate score from an unfinished depth.
        activeJob.client.port.postMessage({ type: "line", line: "evaluationcancelled" });
      } catch (e) {
        // A closing page no longer needs its evaluation completion signal.
      }
      engine.postMessage("stop");
    }
  } else {
    // Each port needs at most its latest waiting evaluation.
    for (let index = evaluationQueue.length - 1; index >= 0; index--) {
      if (evaluationQueue[index].client === client) evaluationQueue.splice(index, 1);
    }
    evaluationQueue.push(job);
  }
  startNextJob();
}

self.onconnect = function (event) {
  const port = event.ports[0];
  const client = { port };
  clients.add(client);
  initEngine();

  port.onmessage = function (portEvent) {
    const message = portEvent.data || {};
    if (message.type == "connect") {
      if (engineReady) port.postMessage({ type: "ready" });
      return;
    }
    if (message.type == "search") {
      queueJob(client, message);
      return;
    }
    if (message.type == "cancel") {
      cancelClientJobs(client);
      return;
    }
    if (message.type == "close") {
      closeClient(client);
    }
  };
  port.start();
};
