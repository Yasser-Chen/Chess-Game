window.gameState = "notPlaying";

var castel = new Audio(`static/audios/castel.mp3`),
  check = new Audio(`static/audios/check.mp3`),
  checkMate = new Audio(`static/audios/checkmate.mp3`),
  eat = new Audio(`static/audios/eat.mp3`),
  gameStarted = new Audio(`static/audios/game started.mp3`),
  movePlayed = new Audio(`static/audios/move played.mp3`),
  timeWarning = new Audio(`static/audios/time-warning.mp3`),
  stallMate = new Audio(`static/audios/stallmate.mp3`);

const animationTime = 100; // in milliseconds

var dragStart = false;

window.lastPawnMoved = null;

function initHtmlBoard(board, FLIP = false) {
  let iStart = 0,
    jStart = 1,
    Di = 1,
    Dj = 1;

  if (FLIP) {
    iStart = 9;
    jStart = 8;
    Di = -1;
    Dj = -1;
  }

  let i = iStart;
  for (let row of board.board.find(`tr`)) {
    let j = jStart;
    for (let square of $(row).find("td")) {
      $(square).attr("x", i);
      $(square).attr("y", j);

      if (FLIP) {
        for (let n = 1; n <= 8; n++) {
          if ($(square).hasClass(`cords-${n}`)) {
            $(square)
              .removeClass(`cords-${n}`)
              .addClass(`cords-${9 - n}`);
          }
        }
        const letters = ["a", "b", "c", "d", "e", "f", "g", "h"];
        for (let l = 0; l < letters.length; l++) {
          if ($(square).hasClass(`cords-${letters[l]}`)) {
            $(square)
              .removeClass(`cords-${letters[l]}`)
              .addClass(`cords-${letters[7 - l]}`);
          }
        }
      }
      j += Dj;
    }
    i += Di;
  }
}

function onPieceDrag(e, ui) {
  if (!dragStart) {
    dragStart = true;
    var pieceElem = ui.helper[0],
      piece = $(pieceElem).data("piece");
    for (let x = 1; x <= 8; x++) {
      for (let y = 1; y <= 8; y++) {
        if (
          piece.isLegal(board, x, y) &&
          !board.isCheckIfMovePlayed(piece, x, y)
        ) {
          $(`td[x=${x}][y=${y}]`).addClass("possibleMove");
        }
      }
    }
  }
}
function onPieceStopDrag() {
  dragStart = false;
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
  let startTime,
    timer,
    ms = seconds * 1000,
    obj = {};
  obj.resume = function () {
    startTime = new Date().getTime();
    if (timer != undefined) {
      clearInterval(timer);
    }
    timer = setInterval(obj.step, 250);
  };
  obj.pause = function () {
    ms = obj.step();
    var currentIncrement = window.normalMovesCounter > 0 ? window.increment : 0;
    var now = Math.max(0, ms + currentIncrement * 1000),
      m = Math.floor(now / 60000),
      s = Math.floor(now / 1000) % 60;

    s = (s < 10 ? "0" : "") + s;
    m = (m < 10 ? "0" : "") + m;

    display.innerHTML = m + ":" + s;

    clearInterval(timer);
  };

  obj.step = function () {
    var currentIncrement = window.normalMovesCounter > 0 ? window.increment : 0;
    var now = Math.max(
        0,
        ms - (new Date().getTime() - startTime - currentIncrement * 1000)
      ),
      m = Math.floor(now / 60000),
      s = Math.floor(now / 1000) % 60;
    s = (s < 10 ? "0" : "") + s;
    m = (m < 10 ? "0" : "") + m;
    if (window.gameState == "playing") {
      display.innerHTML = m + ":" + s;
      if (now <= 20000) {
        if (!$(display).hasClass("low-on-time")) {
          $(display).addClass("low-on-time");
          timeWarning.play();
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
      obj.resume = function () {};
      obj.step = function () {};
      obj.pause = function () {};
      if (oncomplete) oncomplete();
    }
    return now;
  };
  obj.resume();
  return obj;
}

function resisePageMobile() {
  if (window.innerWidth <= 800) {
    //Detect mobile
    $("#timerHolder").css({ display: "none" });
    $("#spacer").css({ display: "none" });
  } else {
    //Detect other higher resolution screens
    $("#timerHolder").css({ display: "unset" });
    $("#spacer").css({ display: "unset" });
  }
}
resisePageMobile(); //run once on page load

//then attach to the event listener
window.addEventListener("resize", resisePageMobile);
