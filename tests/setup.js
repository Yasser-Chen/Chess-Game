// Test setup file for chess engine tests
// Provides jQuery-like DOM mocking for Node.js environment

const { JSDOM } = require('jsdom');

const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
  url: 'http://localhost/',
  runScripts: 'dangerously'
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;

// ============================================================
// jQuery Mock - Complete implementation for chess engine
// ============================================================

function $(selector) {
  // Match real jQuery's behavior for existing jQuery objects and DOM nodes.
  // Production board methods frequently call $(piece.element), so returning
  // null here would prevent integration tests from exercising those methods.
  if (selector && selector._element) {
    return selector;
  }
  if (selector && selector.nodeType) {
    return createjQueryObject(selector);
  }

  // Handle element creation: $('<i class="fg-white"></i>')
  if (typeof selector === 'string' && selector.startsWith('<')) {
    const temp = document.createElement('div');
    temp.innerHTML = selector;
    const element = temp.firstChild;
    return createjQueryObject(element);
  }

  // Handle tag selection: $('td'), $('i'), $('tr'), $('html')
  if (typeof selector === 'string' && !selector.startsWith('<')) {
    if (selector === 'html') {
      const htmlEl = document.documentElement;
      return createjQueryObject(htmlEl);
    }
    const elements = document.querySelectorAll(selector);
    return createjQueryObjectArray(Array.from(elements));
  }

  return null;
}

function createjQueryObject(element) {
  const obj = {
    _element: element,
    _elements: [element],
    _data: {},

    attr(name, value) {
      if (value !== undefined) {
        element.setAttribute(name, value);
        return obj;
      }
      return element.getAttribute(name);
    },

    addClass(className) {
      element.classList.add(className);
      return obj;
    },

    removeClass(className) {
      element.classList.remove(className);
      return obj;
    },

    hasClass(className) {
      return element.classList.contains(className);
    },

    empty() {
      while (element.firstChild) {
        element.removeChild(element.firstChild);
      }
      return obj;
    },

    append(child) {
      if (child && child._elements) {
        for (const el of child._elements) {
          const target = el._element || el;
          element.appendChild(target);
        }
      } else if (child && child._element) {
        element.appendChild(child._element);
      } else if (typeof child === 'object' && child.nodeType) {
        element.appendChild(child);
      }
      return obj;
    },

    html(content) {
      if (content !== undefined) {
        element.innerHTML = content;
        return obj;
      }
      return element.innerHTML;
    },

    data(key, value) {
      if (value !== undefined) {
        this._data[key] = value;
        return obj;
      }
      if (key === 'piece') {
        return this._data['piece'] || null;
      }
      return this._data[key];
    },

    css(properties) {
      if (typeof properties === 'object') {
        for (const [prop, val] of Object.entries(properties)) {
          element.style[prop] = val;
        }
      }
      return obj;
    },

    find(selector) {
      const found = element.querySelectorAll(selector);
      return createjQueryObjectArray(Array.from(found));
    },

    parent() {
      if (element.parentElement) {
        return createjQueryObject(element.parentElement);
      }
      return createjQueryObjectArray([]);
    },

    show() { element.style.display = 'block'; return obj; },
    hide() { element.style.display = 'none'; return obj; },

    clone() {
      const clone = element.cloneNode(true);
      return createjQueryObject(clone);
    },

    detach() {
      if (element.parentElement) {
        element.parentElement.removeChild(element);
      }
      return obj;
    },

    filter(selector) {
      const filtered = [];
      for (const el of this._elements) {
        const target = el._element || el;
        if (target.matches && target.matches(selector)) {
          filtered.push(el);
        }
      }
      return createjQueryObjectArray(filtered);
    },

    draggable(action, options) {
      if (action === 'destroy') {
        element._draggable = false;
        return obj;
      }
      if (action === 'option') {
        element._draggable = true;
        if (options) {
          element._dragCallback = options.drag;
          element._stopCallback = options.stop;
          element._containment = options.containment;
        }
        return obj;
      }
      element._draggable = true;
      return obj;
    },

    popover(action, options) {
      if (action === 'dispose') { element._popoverShown = false; return obj; }
      if (action === 'show') { element._popoverShown = true; return obj; }
      return obj;
    }
  };

  Object.defineProperty(obj, 'length', { get: () => obj._elements.length });
  Object.defineProperty(obj, '0', { get: () => obj._elements[0] });

  return obj;
}

function createjQueryObjectArray(elements) {
  const obj = {
    _elements: elements.map(el => {
      if (el._element !== undefined) return el;
      if (el.nodeType) return createjQueryObject(el);
      return el;
    }),
    get length() { return this._elements.length; },
    get(index) {
      if (typeof index === 'string') return this._elements[0];
      return this._elements[index] ? createjQueryObject(this._elements[index]._element || this._elements[index]) : null;
    },
    each(callback) {
      for (let i = 0; i < this._elements.length; i++) {
        callback.call(this._elements[i], i, this._elements[i]._element || this._elements[i]);
      }
      return obj;
    },
    attr(name, value) {
      for (const el of this._elements) {
        if (el._element && el._element.setAttribute) {
          if (value !== undefined) el._element.setAttribute(name, value);
        }
      }
      return obj;
    },
    addClass(className) {
      for (const el of this._elements) {
        if (el._element && el._element.classList) el._element.classList.add(className);
      }
      return obj;
    },
    removeClass(className) {
      for (const el of this._elements) {
        if (el._element && el._element.classList) el._element.classList.remove(className);
      }
      return obj;
    },
    empty() {
      for (const el of this._elements) {
        if (el._element) while (el._element.firstChild) el._element.removeChild(el._element.firstChild);
      }
      return obj;
    },
    append(child) {
      for (const el of this._elements) {
        if (el._element && child) {
          const target = child._element || child;
          el._element.appendChild(target);
        }
      }
      return obj;
    },
    css(properties) {
      for (const el of this._elements) {
        if (el._element && typeof properties === 'object') {
          for (const [prop, val] of Object.entries(properties)) el._element.style[prop] = val;
        }
      }
      return obj;
    },
    find(selector) {
      if (this._elements[0] && this._elements[0]._element) {
        const found = this._elements[0]._element.querySelectorAll(selector);
        return createjQueryObjectArray(Array.from(found));
      }
      return createjQueryObjectArray([]);
    },
    data(key, value) {
      if (value !== undefined) {
        for (const el of this._elements) {
          if (el._element) el._element[`_data_${key}`] = value;
        }
        return obj;
      }
      if (this._elements[0] && this._elements[0]._element) {
        return this._elements[0]._element[`_data_${key}`];
      }
      return undefined;
    },
    html(content) {
      if (content !== undefined && this._elements[0] && this._elements[0]._element) {
        this._elements[0]._element.innerHTML = content;
      }
      return obj;
    },
    parent() {
      const results = [];
      for (const el of this._elements) {
        if (el._element && el._element.parentElement) results.push(el._element.parentElement);
      }
      return createjQueryObjectArray(results);
    },
    is(selector) { return this._elements.length > 0; },
    show() {
      for (const el of this._elements) { if (el._element) el._element.style.display = 'block'; }
      return obj;
    },
    hide() {
      for (const el of this._elements) { if (el._element) el._element.style.display = 'none'; }
      return obj;
    },
    clone() {
      const clones = [];
      for (const el of this._elements) {
        if (el._element) clones.push(el._element.cloneNode(true));
      }
      return createjQueryObjectArray(clones);
    },
    filter(selector) {
      const filtered = [];
      for (const el of this._elements) {
        if (el._element && el._element.matches && el._element.matches(selector)) filtered.push(el);
      }
      return createjQueryObjectArray(filtered);
    },
    detach() {
      for (const el of this._elements) {
        if (el._element && el._element.parentElement) el._element.parentElement.removeChild(el._element);
      }
      return obj;
    },
    popover(action, options) {
      for (const el of this._elements) {
        if (el._element) {
          if (action === 'dispose') el._element._popoverShown = false;
          if (action === 'show') el._element._popoverShown = true;
        }
      }
      return obj;
    }
  };
  return obj;
}

// Attach to window
global.$ = $;

// ============================================================
// Helper Functions
// ============================================================

function diff(num1, num2) {
  return num1 > num2 ? Math.abs(num1 - num2) : Math.abs(num2 - num1);
}
global.diff = diff;

function comparingObjs(obj) {
  for (const elem of this) {
    if (typeof elem === 'object' && elem.x == obj.x && elem.y == obj.y) return true;
  }
  return false;
}
global.comparingObjs = comparingObjs;

function pushItem(item) {
  if (1 <= item.x && item.x <= 8 && 1 <= item.y && item.y <= 8) this.push(item);
}
global.pushItem = pushItem;

// Audio mock
class MockAudio {
  constructor(src) { this.src = src; this.played = false; }
  play() { this.played = true; }
}
global.Audio = MockAudio;
global.castel = new MockAudio('castel');
global.check = new MockAudio('check');
global.checkMate = new MockAudio('checkmate');
global.eat = new MockAudio('eat');
global.gameStarted = new MockAudio('game started');
global.movePlayed = new MockAudio('move played');
global.timeWarning = new MockAudio('time-warning');
global.stallMate = new MockAudio('stallmate');

// Timer mock
global.startTimer = function(seconds, onComplete, display) {
  return { resume: () => {}, pause: () => {}, _running: true, _timeLeft: seconds };
};

// Game state
global.window.isGameOnline = false;
global.window.isGameVsBot = false;
global.window.lastPawnMoved = null;
global.window.lastUpgradedPiece = null;
global.window.humainIsUpgrading = false;
global.window.increment = 0;
global.window.normalMovesCounter = 0;
global.window.timeSetted = 10;
global.window.gameState = 'notPlaying';
global.window.playAs = null;

// Move class mock
global.Move = class Move {
  constructor(board) { this.boardDescription = 'mock'; }
};

// Bot move mock
global.botMove = function(board, color) {};

// Drag event mocks
global.onPieceDrag = function() {};
global.onPieceStopDrag = function() {};
