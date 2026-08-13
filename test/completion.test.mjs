import test from 'node:test';
import assert from 'node:assert/strict';

class CustomEventMock {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

function createLocalStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  };
}

function createCommandInput(value) {
  return {
    value,
    selectionStart: value.length,
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    addEventListener() {},
    removeEventListener() {},
  };
}

globalThis.CustomEvent = CustomEventMock;
globalThis.window = {
  dispatchEvent() {},
};
globalThis.localStorage = createLocalStorage();
globalThis.document = {
  hidden: false,
  addEventListener() {},
  removeEventListener() {},
  createElement(tagName) {
    return {
      tagName: String(tagName || '').toUpperCase(),
      className: '',
      style: {},
      dataset: {},
      appendChild() {},
      setAttribute() {},
      addEventListener() {},
    };
  },
  createTextNode(text) {
    return { textContent: String(text || '') };
  },
};

const { dom } = await import('../public/js/state.js');
const { aliasManager } = await import('../public/js/alias-manager.js');
const { settingsManager } = await import('../public/js/settings-manager.js');
const { requestCompletion, resetCompletionState } = await import('../public/js/completion.js');
const { createCompletionController } = await import('../public/js/completion-core.mjs');

const SCOPE_KEY = 'ws://test:4242';

function resetCompletionTest(inputValue) {
  localStorage.clear();
  dom.host = { value: 'test' };
  dom.port = { value: '4242' };
  dom.protocolSelect = { value: 'ws' };
  dom.commandInput = createCommandInput(inputValue);
  aliasManager._data = { scopes: {} };
  settingsManager._settings = { ...settingsManager._defaults };
  resetCompletionState();
}

test('Tab completion completes a unique client alias trigger', () => {
  resetCompletionTest('hea');
  aliasManager.saveScope(SCOPE_KEY, {
    aliases: [{
      id: 'alias-heal',
      enabled: true,
      trigger: 'healme',
      description: '',
      group: '',
      steps: [{ type: 'send_command', template: 'cast heal me' }],
    }],
    variables: {},
  });

  requestCompletion([]);

  assert.equal(dom.commandInput.value, 'healme');
  assert.equal(dom.commandInput.selectionStart, 'healme'.length);
});

test('Tab completion uses the common prefix for ambiguous client aliases', () => {
  resetCompletionTest('hea');
  aliasManager.saveScope(SCOPE_KEY, {
    aliases: [{
      id: 'alias-heal',
      enabled: true,
      trigger: 'heal',
      description: '',
      group: '',
      steps: [{ type: 'send_command', template: 'cast heal' }],
    }, {
      id: 'alias-healme',
      enabled: true,
      trigger: 'healme',
      description: '',
      group: '',
      steps: [{ type: 'send_command', template: 'cast heal me' }],
    }],
    variables: {},
  });

  requestCompletion([]);

  assert.equal(dom.commandInput.value, 'heal');
  assert.equal(dom.commandInput.selectionStart, 'heal'.length);
});

test('disabled alias Tab completion falls through without changing input', () => {
  resetCompletionTest('hea');
  settingsManager._settings = {
    ...settingsManager._defaults,
    aliasTabCompletionEnabled: false,
  };
  aliasManager.saveScope(SCOPE_KEY, {
    aliases: [{
      id: 'alias-heal',
      enabled: true,
      trigger: 'healme',
      description: '',
      group: '',
      steps: [{ type: 'send_command', template: 'cast heal me' }],
    }],
    variables: {},
  });

  requestCompletion([]);

  assert.equal(dom.commandInput.value, 'hea');
  assert.equal(dom.commandInput.selectionStart, 'hea'.length);
});

test('completion ignores stale and malformed server results', () => {
  const listeners = new Map();
  const input = {
    value: 'look sw',
    selectionStart: 7,
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  const requests = [];
  let resultListener;
  const completion = createCompletionController({
    input,
    getHistory: () => [],
    getAliases: () => [],
    request: (request) => requests.push(request),
    subscribe: (listener) => {
      resultListener = listener;
      return () => {};
    },
    appendSystemMessage() {},
  });

  completion.request();
  assert.deepEqual(requests, [{ line: 'look sw', cursor: 7 }]);
  input.value = 'look sword';
  listeners.get('input')();
  resultListener({ line: 'look sword ', cursor: 11, matches: [], ambiguous: false });
  assert.equal(input.value, 'look sword');

  input.value = 'look sw';
  input.selectionStart = 7;
  completion.request();
  resultListener({ line: 1, cursor: 0, matches: [], ambiguous: false });
  assert.equal(input.value, 'look sw');
  resultListener({ line: 'look sword ', cursor: 11, matches: ['sword'], ambiguous: false });
  assert.equal(input.value, 'look sword ');
  completion.dispose();
});
