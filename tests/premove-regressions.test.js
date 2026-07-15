require("./setup");

const {
  Board,
  getAuthoritativeMoveTarget,
  getAutomaticPromotionChoice,
} = require("../static/classes/board.js");
const { shouldAnimateMove } = require("../static/classes/action/move.js");

describe("premove regressions", () => {
  beforeEach(() => {
    window.shouldAnimateProgrammaticMove = false;
  });

  test("a bot-game premove consumes its saved promotion choice without asking twice", () => {
    expect(getAutomaticPromotionChoice(false, true, "Knight", false)).toBe("Knight");
    expect(getAutomaticPromotionChoice(false, true, false, true)).toBe("Queen");
    expect(getAutomaticPromotionChoice(false, true, false, false)).toBeNull();
  });

  test("a captured piece whose drag helper survives is never available for a move or premove", () => {
    const board = Object.create(Board.prototype);
    const capturedPiece = { x: 4, y: 4, color: "white" };
    const replacement = { x: 4, y: 4, color: "black" };
    board.pieces = [replacement];
    board.premoveStack = [];

    expect(board.isAuthoritativePieceLive(capturedPiece)).toBe(false);
    expect(board.isPremovePieceAvailable(capturedPiece)).toBe(false);
  });

  test("piece identity, not merely its old coordinates, is authoritative during races", () => {
    const board = Object.create(Board.prototype);
    const livePiece = { x: 6, y: 3, color: "white" };
    board.pieces = [livePiece];
    board.premoveStack = [];

    expect(board.isAuthoritativePieceLive(livePiece)).toBe(true);
    board.pieces = [];
    expect(board.isAuthoritativePieceLive(livePiece)).toBe(false);
  });

  test("a future DOM occupant is not treated as a captured model piece", () => {
    const movingPawn = { x: 4, y: 4, color: "black" };
    const visuallyPremovedKnight = { x: 6, y: 5, color: "white" };

    expect(
      getAuthoritativeMoveTarget(
        [movingPawn, visuallyPremovedKnight],
        movingPawn,
        { capturedPiece: null }
      )
    ).toBeNull();
  });

  test("the authoritative target is captured even if its element is elsewhere", () => {
    const movingPiece = { x: 4, y: 4, color: "black" };
    const capturedPiece = { x: 4, y: 4, color: "white" };

    expect(
      getAuthoritativeMoveTarget(
        [movingPiece, capturedPiece],
        movingPiece,
        { capturedPiece }
      )
    ).toBe(capturedPiece);
  });

  test("explicitly disabling animation wins during online play", () => {
    window.isGameOnline = true;
    window.BotPlaying = false;

    expect(shouldAnimateMove({ animate: false })).toBe(false);
    expect(shouldAnimateMove({ animate: true })).toBe(true);
  });

  test("a quiet move does not treat an old null capture slot as a piece", () => {
    const origin = $("<div></div>");
    const destination = $("<div></div>");
    const element = $("<i></i>");
    const movingPiece = {
      x: 4,
      y: 4,
      color: "black",
      element,
      recalculateAttackingSquares: jest.fn(),
    };
    origin.append(element);

    const board = Object.create(Board.prototype);
    board.pieces = [movingPiece, null];
    board.moves = [];
    board.movesCounter = 0;
    board.highlightMoveSquares = jest.fn();

    expect(() => board.moveTo(movingPiece, destination, {
      fromX: 3,
      fromY: 4,
      capturedPiece: null,
      isCapture: false,
      deferMoveSound: true,
      animate: false,
    })).not.toThrow();

    expect(board.pieces).toEqual([movingPiece, null]);
    expect(destination[0].contains(movingPiece.element)).toBe(true);
  });

  test("a queued promoted piece can queue another premove using its new move shape", () => {
    window.gameState = "playing";
    window.isGameOnline = true;
    window.playAs = "white";

    const pawn = {
      x: 2,
      y: 1,
      color: "white",
      firstMoveDone: true,
      premoveId: "promoting-pawn",
      element: $("<i></i>"),
      constructor: { name: "Pawn" },
    };
    const board = Object.create(Board.prototype);
    board.playAs = "white";
    board.turn = "black";
    board.pieces = [pawn];
    board.premoveStack = [{
      key: "promoting-pawn",
      fromX: 2,
      fromY: 1,
      toX: 1,
      toY: 1,
      visualToX: 1,
      visualToY: 1,
      promotion: "Knight",
    }];
    board.premoveVisualPositions = new Map([
      ["promoting-pawn", { x: 1, y: 1 }],
    ]);
    board.resetPiecePosition = jest.fn();
    board.renderPremoveVisuals = jest.fn();

    expect(board.queuePremove(pawn, 3, 2)).toBe(true);
    expect(board.premoveStack).toHaveLength(2);
    expect(board.premoveStack[1]).toMatchObject({
      key: "promoting-pawn",
      fromX: 1,
      fromY: 1,
      toX: 3,
      toY: 2,
    });
    // A drag/drop premove has already followed the cursor to its destination,
    // so rendering it again with an origin-to-target animation would snap back.
    expect(board.renderPremoveVisuals).toHaveBeenLastCalledWith();

    board.renderPremoveVisuals.mockClear();
    window.shouldAnimateProgrammaticMove = true;
    expect(board.queuePremove(pawn, 5, 3)).toBe(true);
    expect(board.renderPremoveVisuals).toHaveBeenLastCalledWith();
  });

  test("a premoved piece's authoritative origin is vacant in the future position", () => {
    window.gameState = "playing";
    window.isGameOnline = true;
    window.playAs = "white";

    const movedRook = {
      x: 7,
      y: 1,
      color: "white",
      firstMoveDone: true,
      premoveId: "moved-rook",
      element: $("<i></i>"),
      constructor: { name: "Rook" },
    };
    const followingRook = {
      x: 7,
      y: 2,
      color: "white",
      firstMoveDone: true,
      premoveId: "following-rook",
      element: $("<i></i>"),
      constructor: { name: "Rook" },
    };
    const board = Object.create(Board.prototype);
    board.playAs = "white";
    board.turn = "black";
    board.pieces = [movedRook, followingRook];
    board.premoveStack = [{
      key: "moved-rook",
      fromX: 7,
      fromY: 1,
      toX: 5,
      toY: 1,
      visualToX: 5,
      visualToY: 1,
    }];
    board.premoveVisualPositions = new Map([
      ["moved-rook", { x: 5, y: 1 }],
    ]);
    board.resetPiecePosition = jest.fn();
    board.renderPremoveVisuals = jest.fn();

    expect(board.getPremoveVisualOccupant(7, 1, followingRook)).toBeNull();
    expect(board.getPremoveVisualOccupant(5, 1, followingRook)).toBe(movedRook);
    expect(board.queuePremove(followingRook, 7, 1)).toBe(true);
    expect(board.premoveStack[1]).toMatchObject({
      key: "following-rook",
      fromX: 7,
      fromY: 2,
      toX: 7,
      toY: 1,
    });
  });

  test("any piece can premove a conditional capture onto a friendly piece", () => {
    window.gameState = "playing";
    window.isGameOnline = true;
    window.playAs = "white";

    const knight = {
      x: 6,
      y: 3,
      color: "white",
      premoveId: "conditional-knight",
      element: $("<i></i>"),
      constructor: { name: "Knight" },
    };
    const friendlyPawn = {
      x: 4,
      y: 4,
      color: "white",
      premoveId: "friendly-pawn",
      element: $("<i></i>"),
      constructor: { name: "Pawn" },
    };
    const board = Object.create(Board.prototype);
    board.playAs = "white";
    board.turn = "black";
    board.pieces = [knight, friendlyPawn];
    board.premoveStack = [];
    board.premoveVisualPositions = new Map();
    board.resetPiecePosition = jest.fn();
    board.renderPremoveVisuals = jest.fn();

    expect(board.queuePremove(knight, 4, 4)).toBe(true);
    expect(board.premoveStack[0]).toMatchObject({
      key: "conditional-knight",
      fromX: 6,
      fromY: 3,
      toX: 4,
      toY: 4,
    });
    expect(board.getPremoveVisualOccupant(4, 4, null)).toBe(knight);
    expect(board.buildPremoveVirtualState().positions.has(friendlyPawn)).toBe(false);
  });

  test("a castle premove previews both final squares and chains from the rook square", () => {
    window.gameState = "playing";
    window.isGameOnline = true;
    window.playAs = "white";

    const king = {
      x: 8,
      y: 5,
      color: "white",
      firstMoveDone: false,
      premoveId: "castle-king",
      element: $("<i></i>"),
      constructor: { name: "King" },
    };
    const rook = {
      x: 8,
      y: 8,
      color: "white",
      firstMoveDone: false,
      premoveId: "castle-rook",
      element: $("<i></i>"),
      constructor: { name: "Rook" },
    };
    const board = Object.create(Board.prototype);
    board.playAs = "white";
    board.turn = "black";
    board.pieces = [king, rook];
    board.premoveStack = [];
    board.premoveVisualPositions = new Map();
    board.resetPiecePosition = jest.fn();
    board.renderPremoveVisuals = jest.fn();

    // Dropping the king on the rook is accepted, but the preview is normalized
    // to the real post-castle squares instead of stacking both pieces on h1.
    expect(board.queuePremove(king, 8, 8)).toBe(true);
    expect(board.premoveStack[0]).toMatchObject({
      key: "castle-king",
      fromX: 8,
      fromY: 5,
      toX: 8,
      toY: 8,
      visualToX: 8,
      visualToY: 7,
      isCastling: true,
      rookKey: "castle-rook",
      rookFromX: 8,
      rookFromY: 8,
      rookToX: 8,
      rookToY: 6,
    });
    expect(board.premoveVisualPositions.get("castle-king")).toEqual({ x: 8, y: 7 });
    expect(board.premoveVisualPositions.get("castle-rook")).toEqual({ x: 8, y: 6 });
    expect(board.getPremoveVisualOccupant(8, 7, null)).toBe(king);
    expect(board.getPremoveVisualOccupant(8, 6, null)).toBe(rook);
    expect(board.getPremoveVisualOccupant(8, 8, null)).toBeNull();

    expect(board.queuePremove(rook, 7, 6)).toBe(true);
    expect(board.premoveStack[1]).toMatchObject({
      key: "castle-rook",
      fromX: 8,
      fromY: 6,
      toX: 7,
      toY: 6,
    });
  });

  test("a speculative castle ghosts every corridor blocker and makes it unavailable", () => {
    window.gameState = "playing";
    window.isGameOnline = true;
    window.playAs = "white";

    const makePiece = (name, y, id, color = "white") => ({
      x: 8,
      y,
      color,
      firstMoveDone: false,
      premoveId: id,
      element: $("<i></i>"),
      constructor: { name },
    });
    const king = makePiece("King", 5, "blocked-castle-king");
    const rook = makePiece("Rook", 8, "blocked-castle-rook");
    const bishop = makePiece("Bishop", 6, "blocked-castle-bishop");
    const knight = makePiece("Knight", 7, "blocked-castle-knight");
    const board = Object.create(Board.prototype);
    board.playAs = "white";
    board.turn = "black";
    board.pieces = [king, rook, bishop, knight];
    board.premoveStack = [];
    board.premoveVisualPositions = new Map();
    board.resetPiecePosition = jest.fn();
    board.renderPremoveVisuals = jest.fn();
    board.updateDraggables = jest.fn();

    expect(board.queuePremove(king, 8, 8)).toBe(true);
    expect(board.premoveStack[0].castlingClearedKeys).toEqual([
      "blocked-castle-bishop",
      "blocked-castle-knight",
    ]);

    const future = board.buildPremoveVirtualState();
    expect(future.positions.get(king)).toEqual({ x: 8, y: 7 });
    expect(future.positions.get(rook)).toEqual({ x: 8, y: 6 });
    expect(future.positions.has(bishop)).toBe(false);
    expect(future.positions.has(knight)).toBe(false);
    expect(board.canQueuePremoveForPiece(bishop)).toBe(false);
    expect(board.canQueuePremoveForPiece(knight)).toBe(false);
    expect(board.updateDraggables).toHaveBeenCalledWith(true);
  });

  test("a captured piece is not resurrected by a later premove", () => {
    const rook = {
      x: 4,
      y: 1,
      color: "white",
      premoveId: "capture-rook",
      constructor: { name: "Rook" },
    };
    const capturedKnight = {
      x: 4,
      y: 3,
      color: "black",
      constructor: { name: "Knight" },
    };
    const board = Object.create(Board.prototype);
    board.pieces = [rook, capturedKnight];
    board.premoveStack = [
      {
        key: "capture-rook",
        fromX: 4,
        fromY: 1,
        toX: 4,
        toY: 3,
        visualToX: 4,
        visualToY: 3,
      },
      {
        key: "capture-rook",
        fromX: 4,
        fromY: 3,
        toX: 4,
        toY: 4,
        visualToX: 4,
        visualToY: 4,
      },
    ];
    board.premoveVisualPositions = new Map([
      ["capture-rook", { x: 4, y: 4 }],
    ]);

    expect(board.getPremoveOccupantBeforeItem(0, 4, 3, rook)).toBe(capturedKnight);
    expect(board.getPremoveOccupantBeforeItem(1, 4, 3, null)).toBe(rook);
    expect(board.getPremoveVisualOccupant(4, 3, null)).toBeNull();
    expect(board.getPremoveVisualOccupant(4, 4, null)).toBe(rook);
  });

  test("draggable refreshes preserve a piece that is currently held", () => {
    window.gameState = "playing";
    window.isGameOnline = true;
    window.playAs = "white";

    const heldElement = $("<i class=\"fg-white ui-draggable ui-draggable-dragging\"></i>");
    heldElement.css({ left: "42px", top: "17px" });
    const heldPiece = { x: 2, y: 1, color: "white", element: heldElement[0] };
    const board = Object.create(Board.prototype);
    board.pieces = [heldPiece];
    board.playAs = "white";
    board.turn = "black";
    board.isHistoryPreview = false;
    board.draggableUpdateTimer = null;

    board.updateDraggables(true);

    expect(heldElement.hasClass("ui-draggable-dragging")).toBe(true);
    expect(heldElement[0].style.left).toBe("42px");
    expect(heldElement[0].style.top).toBe("17px");
  });

  test("premove rendering does not snap a held piece back", () => {
    document.body.innerHTML = '<div id="game"><div id="board"><div id="held-square"></div></div></div>';
    window.playAs = "white";
    const heldElement = $("<i class=\"fg-white ui-draggable-dragging\"></i>");
    heldElement.css({ left: "31px", top: "26px" });
    $("#held-square").append(heldElement);
    const heldPiece = {
      x: 7,
      y: 1,
      color: "white",
      premoveId: "held-pawn",
      element: heldElement[0],
      constructor: { name: "Pawn" },
    };
    heldElement.data("piece", heldPiece);

    const board = Object.create(Board.prototype);
    board.playAs = "white";
    board.pieces = [heldPiece];
    board.premoveStack = [{
      key: "held-pawn",
      fromX: 7,
      fromY: 1,
      toX: 6,
      toY: 1,
      visualToX: 6,
      visualToY: 1,
    }];
    board.premoveVisualPositions = new Map([
      ["held-pawn", { x: 6, y: 1 }],
    ]);
    board.getSquare = jest.fn(() => $("#held-square"));

    board.renderPremoveVisuals();

    expect(heldElement.hasClass("ui-draggable-dragging")).toBe(true);
    expect(heldElement[0].style.left).toBe("31px");
    expect(heldElement[0].style.top).toBe("26px");
  });

  test("executing a premove preserves the live helper when that piece is still held", () => {
    window.gameState = "playing";
    window.isGameOnline = true;
    window.playAs = "white";

    const heldElement = $("<i class=\"ui-draggable-dragging\"></i>");
    const heldPiece = {
      x: 7,
      y: 1,
      color: "white",
      premoveId: "held-chain-piece",
      element: heldElement[0],
      constructor: { name: "Rook" },
    };
    const board = Object.create(Board.prototype);
    board.pieces = [heldPiece];
    board.premoveStack = [{
      key: heldPiece.premoveId,
      fromX: 7,
      fromY: 1,
      toX: 5,
      toY: 1,
      visualToX: 5,
      visualToY: 1,
    }];
    board.premoveVisualPositions = new Map([
      [heldPiece.premoveId, { x: 5, y: 1 }],
    ]);
    board.isExecutingPremoveStack = false;
    board.canExecutePremove = jest.fn(() => true);
    board.resetPremovePiecePreview = jest.fn();
    board.updateDraggables = jest.fn();
    board.clearPremoveStack = jest.fn();

    const previousMakeMove = global.makeMove;
    global.makeMove = jest.fn(() => true);
    try {
      expect(board.tryExecutePremoveStack()).toBe(true);
      expect(global.makeMove).toHaveBeenCalledWith(
        board,
        7,
        1,
        5,
        1,
        expect.objectContaining({
          animate: false,
          preserveDraggedElement: true,
        })
      );
    } finally {
      global.makeMove = previousMakeMove;
    }
  });

  test("a queued promotion stays visually promoted while its premove executes", () => {
    window.gameState = "playing";
    window.isGameOnline = true;
    window.playAs = "white";

    const pawnElement = $("<i class=\"fa-chess-queen premove-ghost-piece\"></i>");
    const pawn = {
      x: 2,
      y: 4,
      color: "white",
      premoveId: "executing-promotion",
      element: pawnElement[0],
      constructor: { name: "Pawn" },
    };
    const board = Object.create(Board.prototype);
    board.pieces = [pawn];
    board.premoveStack = [{
      key: pawn.premoveId,
      fromX: 2,
      fromY: 4,
      toX: 1,
      toY: 4,
      visualToX: 1,
      visualToY: 4,
      promotion: "Queen",
    }];
    board.premoveVisualPositions = new Map([
      [pawn.premoveId, { x: 1, y: 4 }],
    ]);
    board.isExecutingPremoveStack = false;
    board.canExecutePremove = jest.fn(() => true);
    board.resetPremovePiecePreview = jest.fn();
    board.updateDraggables = jest.fn();
    board.clearPremoveStack = jest.fn();

    let wasQueenDuringMove = false;
    const previousMakeMove = global.makeMove;
    global.makeMove = jest.fn(() => {
      wasQueenDuringMove = pawnElement.hasClass("fa-chess-queen") &&
        !pawnElement.hasClass("fa-chess-pawn");
      board.pieces[0] = {
        x: 1,
        y: 4,
        color: "white",
        premoveId: pawn.premoveId,
        element: $("<i class=\"fa-chess-queen\"></i>")[0],
        constructor: { name: "Queen" },
      };
      return true;
    });
    try {
      expect(board.tryExecutePremoveStack()).toBe(true);
    } finally {
      global.makeMove = previousMakeMove;
    }

    expect(wasQueenDuringMove).toBe(true);
    expect(board.resetPremovePiecePreview).not.toHaveBeenCalled();
  });

  test("a preserved held piece is not reset or reparented by its authoritative move", () => {
    const visualSquare = $("<div></div>");
    const authoritativeSquare = $("<div></div>");
    const heldElement = $("<i class=\"ui-draggable-dragging\"></i>");
    heldElement.css({ left: "47px", top: "29px" });
    visualSquare.append(heldElement);

    const heldPiece = {
      x: 5,
      y: 1,
      color: "white",
      element: heldElement[0],
      constructor: { name: "Rook" },
      recalculateAttackingSquares: jest.fn(),
    };
    const board = Object.create(Board.prototype);
    board.pieces = [heldPiece];
    board.moves = [];
    board.movesCounter = 0;
    board.highlightMoveSquares = jest.fn();
    board.isInsideBoard = jest.fn(() => true);

    board.moveTo(heldPiece, authoritativeSquare, {
      fromX: 7,
      fromY: 1,
      capturedPiece: null,
      deferMoveSound: true,
      animate: false,
      preserveDraggedElement: true,
    });

    expect(visualSquare[0].contains(heldPiece.element)).toBe(true);
    expect(authoritativeSquare[0].contains(heldPiece.element)).toBe(false);
    expect(heldElement[0].style.left).toBe("47px");
    expect(heldElement[0].style.top).toBe("29px");
  });

  test("promotion transfers the premove identity to the replacement piece", () => {
    const square = $("<div></div>");
    const pawn = {
      x: 1,
      y: 4,
      color: "white",
      premoveId: "promotion-chain-id",
      element: $("<i></i>"),
    };
    function PromotedPiece(x, y, color) {
      this.x = x;
      this.y = y;
      this.color = color;
      this.element = $("<i></i>");
    }

    const board = Object.create(Board.prototype);
    board.pieces = [pawn];
    board.isInsideBoard = () => true;
    board.add = jest.fn((piece) => board.pieces.push(piece));

    const promoted = board.promotePawn(pawn, square, PromotedPiece);

    expect(promoted.premoveId).toBe("promotion-chain-id");
    expect(board.pieces).toContain(promoted);
  });

  test("an illegal next premove abandons the future position and restores the present", () => {
    const actualSquare = $("<div></div>");
    const futureSquare = $("<div></div>");
    function Pawn() {}
    const pawn = new Pawn();
    pawn.x = 2;
    pawn.y = 1;
    pawn.color = "white";
    pawn.premoveId = "invalid-future-pawn";
    pawn.element = $("<i class=\"fa-chess-queen premove-ghost-piece\"></i>")[0];
    futureSquare.append(pawn.element);

    const board = Object.create(Board.prototype);
    board.pieces = [pawn];
    board.premoveStack = [{
      key: pawn.premoveId,
      fromX: 2,
      fromY: 1,
      toX: 1,
      toY: 1,
      promotion: "Queen",
    }];
    board.premoveVisualPositions = new Map([
      [pawn.premoveId, { x: 1, y: 1 }],
    ]);
    board.isExecutingPremoveStack = false;
    board.canExecutePremove = jest.fn(() => false);
    board.getSquare = jest.fn(() => actualSquare);
    board.updateDraggables = jest.fn();
    board.resetPiecePosition = jest.fn();

    const originalContains = $.contains;
    $.contains = (parent, child) => parent.contains(child);
    try {
      expect(board.tryExecutePremoveStack()).toBe(false);
    } finally {
      $.contains = originalContains;
    }

    expect(board.premoveStack).toEqual([]);
    expect(board.premoveVisualPositions.size).toBe(0);
    expect(actualSquare[0].contains(pawn.element)).toBe(true);
    expect($(pawn.element).hasClass("fa-chess-pawn")).toBe(true);
    expect($(pawn.element).hasClass("fa-chess-queen")).toBe(false);
    expect(board.updateDraggables).toHaveBeenCalledWith(true);
  });
});
