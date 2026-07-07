$(".overlay").css("display", "flex");

$("html").droppable({
  drop: function (event, ui) {
    event.preventDefault();
    $(ui.draggable).css({
      top: "0px",
      left: "0px",
    });
  },
});

let searchingLoop = -1;

var createNewGame = (playAs) => {
  window.board = new Board($("#board"), playAs);

  initHtmlBoard(board, playAs == "black");

  for (let i = 1; i <= 8; i++) {
    board.add(new Pawn(2, i, "black"));
    board.add(new Pawn(7, i, "white"));
  }

  board.add(new King(8, 5, "white"));
  board.add(new King(1, 5, "black"));

  board.add(new Queen(8, 4, "white"));
  board.add(new Queen(1, 4, "black"));

  board.add(new Bishop(8, 6, "white"));
  board.add(new Bishop(8, 3, "white"));
  board.add(new Bishop(1, 3, "black"));
  board.add(new Bishop(1, 6, "black"));

  board.add(new Rook(8, 8, "white"));
  board.add(new Rook(8, 1, "white"));
  board.add(new Rook(1, 8, "black"));
  board.add(new Rook(1, 1, "black"));

  board.add(new Knight(8, 2, "white"));
  board.add(new Knight(8, 7, "white"));
  board.add(new Knight(1, 7, "black"));
  board.add(new Knight(1, 2, "black"));

  board.resetAttacks();

  if ($('input[name="mode_of_play"]:checked').val() == "vs_bot") {
    window.isGameVsBot = true;
  } else if ($('input[name="mode_of_play"]:checked').val() == "online") {
    window.isGameOnline = true;
  }
  $(".overlay").css("display", "none");

  if (playAs) {
    $(`i`).draggable({
      drag: onPieceDrag,
      accept: "td",
      containment: "#game",
      stop: onPieceStopDrag,
      scroll: false,
    });
    $(`i`).draggable("destroy");
    if (window.isGameOnline) {
      $(`.fg-${playAs}`).draggable({
        drag: onPieceDrag,
        accept: "td",
        containment: "#game",
        stop: onPieceStopDrag,
        scroll: false,
      });
    }
  }
};

$("#playerIncrementInput , #playerTimeInput").on("input", function (e) {
  $(".is-invalid").removeClass("is-invalid");
  window.timeSetted = +$("#playerTimeInput").val();
  window.increment = +$("#playerIncrementInput").val();

  if (
    isNaN(window.timeSetted) ||
    !(20 < window.timeSetted && window.timeSetted <= 60 * 60)
  ) {
    $("#playerTimeInput").addClass("is-invalid");
  }

  if (
    isNaN(window.increment) ||
    !(0 <= window.increment && window.increment <= 10)
  ) {
    $("#playerIncrementInput").addClass("is-invalid");
  }
});

var syncDone = false;

function initGame() {
  $(".is-invalid").removeClass("is-invalid");
  let isValid = true;
  window.normalMovesCounter = 0;
  window.timeSetted = +$("#playerTimeInput").val();
  window.increment = +$("#playerIncrementInput").val();

  if (
    isNaN(window.timeSetted) ||
    !(20 < window.timeSetted && window.timeSetted <= 24 * 60 * 60)
  ) {
    $("#playerTimeInput").addClass("is-invalid");
    isValid = false;
  }

  if (
    isNaN(window.increment) ||
    !(0 <= window.increment && window.increment <= 10)
  ) {
    $("#playerIncrementInput").addClass("is-invalid");
    isValid = false;
  }

  if (isValid) {
    if ($('input[name="mode_of_play"]:checked').val() == "online") {
      $("#loadding_pannnel").css({ display: "flex" });
      $("#main_pannnel").css({ display: "none" });

      let url = `ws://${window.location.host}/ws/socket-server/`;

      window.gameSocket = new WebSocket(url);

       window.gameSocket.onmessage = function (e) {
        let rawData = JSON.parse(e.data);
        let data = rawData.chess_event ? JSON.parse(rawData.chess_event) : rawData;

        // Handle clock sync responses
        if (data.type === 'clock_sync_response') {
          if (window.ClockSync) {
            window.ClockSync.handleClockSyncResponse(data.server_time, data.client_send_time);
          }
          return;
        }

        if (
          !syncDone &&
          ((data.type == "sync" && data.priority != priority) ||
            data.type == "sync_accepted")
        ) {
          syncDone = true;
          clearInterval(searchingLoop);

          window.gameSocket.send(
            JSON.stringify({
              chess_event: JSON.stringify({
                type: "sync_accepted",
                priority: priority,
                date_start: data.date_start,
              }),
            })
          );

          // Perform initial clock sync using the server-stamped sync message
          const t1 = Date.now();
          const t2 = data.server_time || data.date_start;
          const t3 = t2;
          const t4 = Date.now();
          if (t1 > 0 && t2 > 0) {
            const offset = ((t2 - t1) + (t3 - t4)) / 2;
            window.setServerTimeOffset(offset);
            window.lastSyncOffset = offset;
            window.lastSyncRTT = t4 - t1;
            window.lastSyncTime = Date.now();
            console.log('[Clock Sync] Initial offset:', offset.toFixed(2), 'ms');
          }

          const nowServerTime = window.estimatedServerTime ? window.estimatedServerTime() : Date.now();
          const date1 = new Date(nowServerTime);
          const date2 = new Date();
          date2.setTime(data.date_start);

          const diffTime = Math.max(0, date2 - date1);
          console.log(diffTime);

          $("#loading_chess_event").html("Match Found");

          if (data.type == "sync_accepted") {
            //must play as black
            setTimeout(function () {
              createNewGame("black");

              window.playAs = "black";
              // Start periodic clock sync after game starts
              if (window.isGameOnline) {
                window.startClockSync();
              }
            }, diffTime);
          } else {
            setTimeout(function () {
              createNewGame("white");

              window.playAs = "white";
              // Start periodic clock sync after game starts
              if (window.isGameOnline) {
                window.startClockSync();
              }
            }, diffTime);
          }
        } else if (data.type == "upgrade") {
          window.lastUpgradedPiece = data.piece;
          makeMove(board, data.x, data.y, data.newX, data.newY);
        } else if (
          data.type != "upgrade" &&
          data.type != "sync" &&
          data.type != "sync_accepted"
        ) {
          makeMove(board, data.x, data.y, data.newX, data.newY);
        }
      };

      setTimeout(function () {
        clearInterval(searchingLoop);
        searchingLoop = setInterval(function () {
          window.gameSocket.send(
            JSON.stringify({
              chess_event: JSON.stringify({
                type: "sync",
                priority: priority,
              }),
            })
          );
        }, 1000);
      }, 100);
    } else {
      createNewGame();
    }
  }
}

function showSquaresQueen() {
  var arr = {};
  for (var a of board.pieces) {
    ((a ?? {}).attackingSquares ?? []).forEach(function (e) {
      if (a.constructor.name == "Queen" && a.color == "white") {
        arr[`${e.x}_${e.y}`] = $(`td[x=${e.x}][y=${e.y}]`)[0];
      }
    });
  }
  console.log(arr);
}
