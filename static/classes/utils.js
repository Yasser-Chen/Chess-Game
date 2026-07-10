window.gameState = "notPlaying";

var castel = new Audio(`static/audios/castel.mp3`),
  check = new Audio(`static/audios/check.mp3`),
  checkMate = new Audio(`static/audios/checkmate.mp3`),
  eat = new Audio(`static/audios/eat.mp3`),
  gameStarted = new Audio(`static/audios/game started.mp3`),
  movePlayed = new Audio(`static/audios/move played.mp3`),
  timeWarning = new Audio(`static/audios/time-warning.mp3`),
  stallMate = new Audio(`static/audios/stallmate.mp3`);

const MOVE_SOUND_SUPPRESSION_MS = 350;
window.suppressMoveSoundUntil = 0;

function isNormalMoveSound(sound) {
  return sound === movePlayed;
}

function shouldSuppressNormalMoveSound(sound) {
  return (
    sound === eat ||
    sound === castel ||
    sound === check ||
    sound === checkMate ||
    sound === stallMate
  );
}

function restartChessSound(sound) {
  if (!sound) return;
  try {
    if (typeof sound.pause == "function") {
      sound.pause();
    }
    sound.currentTime = 0;
  } catch (e) {
    // Keep playback instant even if resetting is not available yet.
  }
}

function stopChessSounds(sound) {
  restartChessSound(sound);
}

function playChessSound(sound, options) {
  options = options || {};
  if (!sound || typeof sound.play != "function") return;

  if (sound === checkMate) {
    restartChessSound(check);
  }

  if (isNormalMoveSound(sound)) {
    if (!options.force) {
      if (window.gameState != "playing") return;
      if ((window.suppressMoveSoundUntil || 0) > Date.now()) return;
    }
  } else if (shouldSuppressNormalMoveSound(sound)) {
    window.pendingMoveSoundToken = null;
    window.suppressMoveSoundUntil = Date.now() + MOVE_SOUND_SUPPRESSION_MS;
    restartChessSound(movePlayed);
  }

  restartChessSound(sound);

  const playResult = sound.play();
  if (playResult && typeof playResult.catch == "function") {
    playResult.catch(function () {
      // Browsers can block autoplay before user interaction; ignore safely.
    });
  }
}

function playMoveSoundWhenSettled() {
  const token = {};
  window.pendingMoveSoundToken = token;

  setTimeout(function () {
    if (window.pendingMoveSoundToken !== token) return;
    window.pendingMoveSoundToken = null;
    playChessSound(movePlayed);
  }, 0);
}

window.stopChessSounds = stopChessSounds;
window.playChessSound = playChessSound;
window.playMoveSoundWhenSettled = playMoveSoundWhenSettled;

const BOARD_ZOOM_STORAGE_KEY = "chessBoardZoom";
const BOARD_ZOOM_MIN = 0.75;
const BOARD_ZOOM_MAX = 6;
const BOARD_ZOOM_STEP = 0.1;
const RESIZE_CONTROLS_STORAGE_KEY = "chessResizeControlsVisible";
let suppressPerfectBoardZoomUntil = 0;
let lastWindowOuterWidth = 0;
let lastWindowOuterHeight = 0;

function getStoredBoardZoom() {
  try {
    if (typeof localStorage == "undefined") return 1;
    const savedZoom = Number(localStorage.getItem(BOARD_ZOOM_STORAGE_KEY));
    return Number.isFinite(savedZoom) ? savedZoom : 1;
  } catch (e) {
    return 1;
  }
}

function clampBoardZoom(zoom) {
  return Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, Number(zoom) || 1));
}

function applyBoardZoom(zoom) {
  const nextZoom = Number(clampBoardZoom(zoom).toFixed(2));
  const game = document.getElementById("game");
  if (!game) return nextZoom;

  game.style.setProperty("--board-zoom", nextZoom);
  try {
    if (typeof localStorage != "undefined") {
      localStorage.setItem(BOARD_ZOOM_STORAGE_KEY, String(nextZoom));
    }
  } catch (e) {
    // Storage can be unavailable in private browsing or test environments.
  }

  const zoomOutButton = document.getElementById("zoomOutBtn");
  const zoomInButton = document.getElementById("zoomInBtn");
  if (zoomOutButton) {
    zoomOutButton.disabled = nextZoom <= BOARD_ZOOM_MIN;
  }
  if (zoomInButton) {
    zoomInButton.disabled = nextZoom >= BOARD_ZOOM_MAX;
  }

  return nextZoom;
}

function calculatePerfectBoardZoom() {
  const game = document.getElementById("game");
  const boardArea = document.getElementById("boardArea");
  if (!game || !boardArea) return 1;

  const previousZoom = getComputedStyle(game).getPropertyValue("--board-zoom") || "1";
  game.style.setProperty("--board-zoom", 1);
  const baseBoardSize = boardArea.getBoundingClientRect().width || 500;
  game.style.setProperty("--board-zoom", previousZoom.trim() || 1);

  const isMobile = window.matchMedia && window.matchMedia("(max-width: 680px)").matches;
  const reservedSpace = isMobile ? 128 : 32;
  const availableWidth = isMobile ? window.innerWidth - 16 : window.innerWidth - 190;
  const availableHeight = window.innerHeight - reservedSpace;
  const desiredBoardSize = Math.max(240, Math.min(availableWidth, availableHeight));

  return clampBoardZoom(desiredBoardSize / baseBoardSize);
}

function applyPerfectBoardZoom() {
  applyBoardZoom(calculatePerfectBoardZoom());
}

function suppressPerfectBoardZoomForFullscreenToggle() {
  suppressPerfectBoardZoomUntil = Date.now() + 900;
}

function isBrowserZoomActive() {
  if (!window.visualViewport || typeof window.visualViewport.scale != "number") return false;
  return Math.abs(window.visualViewport.scale - 1) > 0.01;
}

function shouldApplyPerfectBoardZoomOnResize() {
  const currentOuterWidth = window.outerWidth || 0;
  const currentOuterHeight = window.outerHeight || 0;

  if (!lastWindowOuterWidth || !lastWindowOuterHeight) {
    lastWindowOuterWidth = currentOuterWidth;
    lastWindowOuterHeight = currentOuterHeight;
    return true;
  }

  const outerSizeChanged =
    currentOuterWidth !== lastWindowOuterWidth || currentOuterHeight !== lastWindowOuterHeight;

  lastWindowOuterWidth = currentOuterWidth;
  lastWindowOuterHeight = currentOuterHeight;

  return outerSizeChanged;
}

function getStoredResizeControlsVisible() {
  try {
    if (typeof localStorage == "undefined") return true;
    const savedValue = localStorage.getItem(RESIZE_CONTROLS_STORAGE_KEY);
    if (savedValue === null) return true;
    return savedValue === "true";
  } catch (e) {
    return true;
  }
}

function applyResizeControlsVisibility(showControls, persist) {
  const resizeToggleButton = document.getElementById("resizeToggleBtn");
  const resizeToggleIcon = document.getElementById("resizeToggleIcon");
  const zoomControls = document.querySelector(".board-zoom-controls");
  const isVisible = !!showControls;

  if (zoomControls) {
    zoomControls.classList.toggle("is-hidden", !isVisible);
    zoomControls.classList.toggle("is-visible", isVisible);
  }

  if (resizeToggleButton) {
    resizeToggleButton.classList.toggle("is-controls-visible", isVisible);
    resizeToggleButton.classList.toggle("is-controls-hidden", !isVisible);
    resizeToggleButton.title = isVisible ? "Hide resize buttons" : "Show resize buttons";
    resizeToggleButton.setAttribute("aria-label", isVisible ? "Hide resize buttons" : "Show resize buttons");
  }

  if (resizeToggleIcon) {
    resizeToggleIcon.className = isVisible ? "fas fa-eye" : "fas fa-eye-slash";
  }

  if (persist !== false) {
    try {
      if (typeof localStorage != "undefined") {
        localStorage.setItem(RESIZE_CONTROLS_STORAGE_KEY, String(isVisible));
      }
    } catch (e) {
      // Persistence can be unavailable in private browsing or test environments.
    }
  }

  return isVisible;
}

function setResizeToggleDraggingState(isDragging) {
  if (!document.body) return;
  document.body.classList.toggle("is-dragging-piece", !!isDragging);
}

function changeBoardZoom(direction) {
  const currentZoom = getStoredBoardZoom();
  applyBoardZoom(currentZoom + direction * BOARD_ZOOM_STEP);
}

function getFullscreenElement() {
  return document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement ||
    null;
}

function updateFullscreenButton() {
  const fullscreenButton = document.getElementById("fullscreenBtn");
  if (!fullscreenButton) return;

  const isFullscreen = !!getFullscreenElement();
  fullscreenButton.textContent = isFullscreen ? "⛶" : "⛶";
  fullscreenButton.title = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";
  fullscreenButton.setAttribute("aria-label", isFullscreen ? "Exit fullscreen" : "Enter fullscreen");
}

function toggleFullscreen() {
  suppressPerfectBoardZoomForFullscreenToggle();

  const fullscreenElement = getFullscreenElement();

  if (fullscreenElement) {
    const exitFullscreen = document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.msExitFullscreen;
    if (exitFullscreen) {
      exitFullscreen.call(document);
    }
    return;
  }

  const target = document.documentElement;
  const requestFullscreen = target.requestFullscreen ||
    target.webkitRequestFullscreen ||
    target.msRequestFullscreen;
  if (requestFullscreen) {
    requestFullscreen.call(target);
  }
}

function initBoardZoomControls() {
  applyPerfectBoardZoom();

  const zoomControls = document.querySelector(".board-zoom-controls");
  const resizeToggleButton = document.getElementById("resizeToggleBtn");
  const perfectZoomButton = document.getElementById("perfectZoomBtn");
  const zoomOutButton = document.getElementById("zoomOutBtn");
  const zoomInButton = document.getElementById("zoomInBtn");
  const fullscreenButton = document.getElementById("fullscreenBtn");
  let fitZoomTimer = null;

  function schedulePerfectBoardZoom() {
    if (suppressPerfectBoardZoomUntil && Date.now() < suppressPerfectBoardZoomUntil) return;
    if (isBrowserZoomActive()) return;
    if (!shouldApplyPerfectBoardZoomOnResize()) return;

    if (fitZoomTimer) {
      clearTimeout(fitZoomTimer);
    }

    fitZoomTimer = setTimeout(function () {
      fitZoomTimer = null;
      applyPerfectBoardZoom();
    }, 80);
  }
  window.addEventListener("resize", function () {
    schedulePerfectBoardZoom();
  });

  if (resizeToggleButton) {
    resizeToggleButton.addEventListener("click", function () {
      const controlsAreVisible = zoomControls && !zoomControls.classList.contains("is-hidden");
      applyResizeControlsVisibility(!controlsAreVisible, true);
    });
  }

  if (perfectZoomButton) {
    perfectZoomButton.addEventListener("click", applyPerfectBoardZoom);
  }

  if (zoomOutButton) {
    zoomOutButton.addEventListener("click", function () {
      changeBoardZoom(-1);
    });
  }

  if (zoomInButton) {
    zoomInButton.addEventListener("click", function () {
      changeBoardZoom(1);
    });
  }

  if (fullscreenButton) {
    fullscreenButton.addEventListener("click", toggleFullscreen);
  }

  document.addEventListener("fullscreenchange", updateFullscreenButton);
  document.addEventListener("webkitfullscreenchange", updateFullscreenButton);
  document.addEventListener("MSFullscreenChange", updateFullscreenButton);
  lastWindowOuterWidth = window.outerWidth || 0;
  lastWindowOuterHeight = window.outerHeight || 0;
  applyResizeControlsVisibility(getStoredResizeControlsVisible(), false);
  updateFullscreenButton();
}

window.applyBoardZoom = applyBoardZoom;
window.changeBoardZoom = changeBoardZoom;
window.applyPerfectBoardZoom = applyPerfectBoardZoom;
window.toggleFullscreen = toggleFullscreen;
window.setResizeToggleDraggingState = setResizeToggleDraggingState;

const animationTime = 100; // in milliseconds

var dragStart = false;

window.lastPawnMoved = null;

function isGamePlaying() {
  return window.gameState == "playing";
}

function resetDraggedPiece(ui) {
  if (ui && ui.helper) {
    $(ui.helper).css({
      top: "0px",
      left: "0px",
    });
  }
}

function enableTouchDragForJqueryUi() {
  if (window.jqueryUiTouchDragEnabled) return;
  window.jqueryUiTouchDragEnabled = true;

  const touchToMouseType = {
    touchstart: "mousedown",
    touchmove: "mousemove",
    touchend: "mouseup",
    touchcancel: "mouseup",
  };

  function dispatchMouseEventFromTouch(event) {
    if (!event.changedTouches || event.changedTouches.length === 0) return;

    const target = event.target;
    const isPieceDrag =
      target &&
      typeof target.closest == "function" &&
      target.closest(".board td i, .ui-draggable, .ui-draggable-dragging");

    if (!isPieceDrag) return;

    const touch = event.changedTouches[0];
    const mouseEvent = new MouseEvent(touchToMouseType[event.type], {
      bubbles: true,
      cancelable: true,
      view: window,
      detail: 1,
      screenX: touch.screenX,
      screenY: touch.screenY,
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0,
      buttons: event.type == "touchend" || event.type == "touchcancel" ? 0 : 1,
    });

    event.preventDefault();
    target.dispatchEvent(mouseEvent);
  }

  ["touchstart", "touchmove", "touchend", "touchcancel"].forEach(function (eventName) {
    document.addEventListener(eventName, dispatchMouseEventFromTouch, { passive: false });
  });
}

function initHtmlBoard(board, FLIP = false) {
  board.isFlipped = FLIP;
  board.board.find("td")
    .removeAttr("x")
    .removeAttr("y")
    .removeAttr("data-rank")
    .removeAttr("data-file")
    .removeClass("cords cord-rank cord-file");
  const rankClasses = Array.from({ length: 8 }, (_, index) => `cords-${index + 1}`);
  const fileClasses = [
    "cords-a",
    "cords-b",
    "cords-c",
    "cords-d",
    "cords-e",
    "cords-f",
    "cords-g",
    "cords-h",
  ];

  let iStart = 1,
    jStart = 1,
    Di = 1,
    Dj = 1;

  if (FLIP) {
    iStart = 8;
    jStart = 8;
    Di = -1;
    Dj = -1;
  }

  let i = iStart;
  let rowIndex = 0;
  for (let row of board.board.find("tbody tr")) {
    let j = jStart;
    let columnIndex = 0;
    for (let square of $(row).find("td")) {
      $(square).attr("x", i);
      $(square).attr("y", j);
      $(square).removeClass(rankClasses.join(" ")).removeClass(fileClasses.join(" "));

      if (columnIndex == 0) {
        $(square).addClass("cords cord-rank").attr("data-rank", 9 - i);
      }
      if (rowIndex == 7) {
        $(square).addClass("cords cord-file").attr("data-file", String.fromCharCode(96 + j));
      }
      j += Dj;
      columnIndex++;
    }
    i += Di;
    rowIndex++;
  }
}

function onPieceDrag(e, ui) {
  if (!isGamePlaying()) {
    dragStart = false;
    setResizeToggleDraggingState(false);
    $(".possibleMove").removeClass("possibleMove");
    resetDraggedPiece(ui);
    return false;
  }

  const activeBoard = window.board || (typeof board != "undefined" ? board : null);
  if (activeBoard && activeBoard.isHistoryPreview) {
    dragStart = false;
    setResizeToggleDraggingState(false);
    $(".possibleMove").removeClass("possibleMove");
    resetDraggedPiece(ui);
    return false;
  }

  if (!dragStart) {
    dragStart = true;
    setResizeToggleDraggingState(true);
    var pieceElem = ui.helper[0],
      piece = $(pieceElem).data("piece");

    if (!piece || !activeBoard) {
      return false;
    }

    for (let x = 1; x <= 8; x++) {
      for (let y = 1; y <= 8; y++) {
        if (
          piece.isLegal(activeBoard, x, y) &&
          !activeBoard.isCheckIfMovePlayed(piece, x, y)
        ) {
          (typeof activeBoard.getSquare == "function"
            ? activeBoard.getSquare(x, y)
            : $(`td[x=${x}][y=${y}]`)
          ).addClass("possibleMove");
        }
      }
    }
  }
}
function onPieceStopDrag() {
  dragStart = false;
  setResizeToggleDraggingState(false);
  $(".possibleMove").removeClass("possibleMove");
}

function comparingObjs(obj) {
  for (const elem of this) {
    if (typeof elem == "object" && elem.x == obj.x && elem.y == obj.y) {
      return true;
    }
  }
  return false;
}
function pushItem(item) {
  if (1 <= item.x && item.x <= 8 && 1 <= item.y && item.y <= 8) {
    this.push(item);
  }
}
$("body").on("click", function (e) {
  var isRightMB;
  e = e || window.event;

  if ("which" in e)
    // Gecko (Firefox), WebKit (Safari/Chrome) & Opera
    isRightMB = e.which == 3;
  else if ("button" in e)
    // IE, Opera
    isRightMB = e.button == 2;

  if (isRightMB) {
    $(".ui-draggable-dragging").css({
      top: "0px",
      left: "0px",
    });
  }
});

function diff(num1, num2) {
  if (num1 > num2) {
    return Math.abs(num1 - num2);
  } else {
    return Math.abs(num2 - num1);
  }
}

function startTimer(seconds, oncomplete, display) {
  let timer,
    isRunning = false,
    isFinished = false,
    // Use server time as reference when available, fall back to local time
    gameStartTime = getTimerNow(),
    ms = sanitizeTimerSeconds(seconds) * 1000,
    obj = {};

  function getTimerNow() {
    const now = window.estimatedServerTime ? window.estimatedServerTime() : new Date().getTime();
    return Number.isFinite(now) ? now : new Date().getTime();
  }

  function sanitizeTimerSeconds(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function getMoveIncrementMs() {
    const increment = Number(window.increment);
    return window.normalMovesCounter > 0 && Number.isFinite(increment) && increment > 0
      ? increment * 1000
      : 0;
  }

  function getRemainingMs() {
    const elapsed = isRunning ? getTimerNow() - gameStartTime : 0;
    return Math.max(0, ms - elapsed);
  }

  function renderTime(now) {
    now = Number.isFinite(now) ? Math.max(0, now) : 0;
    const m = Math.floor(now / 60000),
      s = Math.floor(now / 1000) % 60;
    const formattedSeconds = (s < 10 ? "0" : "") + s;
    const formattedMinutes = (m < 10 ? "0" : "") + m;
    if (display) {
      display.innerHTML = formattedMinutes + ":" + formattedSeconds;
    }
  }
    
  obj.resume = function () {
    if (isFinished || !isGamePlaying()) return;
    // Use estimated server time for startTime reference
    gameStartTime = getTimerNow();
    if (timer != undefined) {
      clearInterval(timer);
    }
    isRunning = true;
    timer = setInterval(obj.step, 250);
    renderTime(getRemainingMs());
  };
  obj.pause = function () {
    if (isFinished) {
      clearInterval(timer);
      isRunning = false;
      return;
    }
    if (isRunning) {
      ms = getRemainingMs() + getMoveIncrementMs();
    }
    renderTime(ms);

    clearInterval(timer);
    isRunning = false;
  };

  obj.stop = function () {
    if (!isFinished) {
      ms = getRemainingMs();
    }
    renderTime(ms);
    clearInterval(timer);
    isRunning = false;
    isFinished = true;
  };

  obj.step = function () {
    if (isFinished) return 0;
    if (!isGamePlaying()) {
      obj.stop();
      return ms;
    }
    // Use estimated server time instead of local time
    var now = getRemainingMs(),
      m = Math.floor(now / 60000),
      s = Math.floor(now / 1000) % 60;
    s = (s < 10 ? "0" : "") + s;
    m = (m < 10 ? "0" : "") + m;
    if (window.gameState == "playing") {
      display.innerHTML = m + ":" + s;
      if (now <= 20000) {
        if (!$(display).hasClass("low-on-time")) {
          $(display).addClass("low-on-time");
          playChessSound(timeWarning);
        }
      } else {
        $(display).removeClass("low-on-time");
      }
    }
    // else{
    //     clearInterval(timer);
    // }
    if (now <= 0) {
      clearInterval(timer);
      isFinished = true;
      isRunning = false;
      obj.resume = function () {};
      obj.step = function () {};
      obj.pause = function () {};
      obj.stop = function () {};
      if (oncomplete) oncomplete();
    }
    return now;
  };
  obj.resume();
  return obj;
}

function resisePageMobile() {
  const isMobile = window.innerWidth <= 680;

  function setDisplayImportant(selector, value) {
    const element = document.querySelector(selector);
    if (element) {
      element.style.setProperty("display", value, "important");
    }
  }

  if (isMobile) {
    setDisplayImportant("#timerHolder", "contents");
    setDisplayImportant("#sidePanelHolder", "contents");
    $("#spacer").css({ display: "none" });
  } else {
    setDisplayImportant("#timerHolder", "flex");
    setDisplayImportant("#sidePanelHolder", "flex");
    $("#spacer").css({ display: "unset" });
  }
}
resisePageMobile(); //run once on page load
initBoardZoomControls();
enableTouchDragForJqueryUi();

//then attach to the event listener
window.addEventListener("resize", resisePageMobile);
