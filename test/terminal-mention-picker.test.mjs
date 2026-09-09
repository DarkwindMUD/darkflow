import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, isRunnableDevEnvironment } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

class FakeElement extends EventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.style = {};
    this.hidden = false;
    this.className = "";
    this.classList = { contains: (name) => this.className.split(/\s+/).includes(name) };
    this.textContent = "";
    this.value = "";
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.isContentEditable = false;
    this.open = false;
    this.scrollTop = 0;
    this.clientHeight = 200;
    this.scrollHeight = 200;
    this.attributes = new Map();
    this.parentNode = null;
  }

  append(...children) {
    for (const child of children) this.appendChild(child);
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...children);
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  closest(selector) {
    if (selector !== 'dialog, [role="dialog"]') return null;
    for (let element = this; element; element = element.parentNode) {
      if (element.tagName === "DIALOG" || element.attributes.get("role") === "dialog") {
        return element;
      }
    }
    return null;
  }

  getBoundingClientRect() {
    return { left: 20, top: 500, width: 360 };
  }

  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  select() {
    this.setSelectionRange(0, this.value.length);
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
  }
}

class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.activeElement = null;
    this.body = new FakeElement("body", this);
    this.keydownListeners = new Set();
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  addEventListener(type, listener, options) {
    if (type === "keydown") this.keydownListeners.add(listener);
    else super.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    if (type === "keydown") this.keydownListeners.delete(listener);
    else super.removeEventListener(type, listener, options);
  }

  dispatchKeydown(target, event) {
    Object.defineProperty(event, "target", { value: target, configurable: true });
    for (const listener of [...this.keydownListeners]) listener(event);
  }
}

class FakeWindow extends EventTarget {
  constructor() {
    super();
    this.innerHeight = 800;
    this.setTimeout = setTimeout;
    this.clearTimeout = clearTimeout;
  }
}

class FakeKeyboardEvent extends Event {
  constructor(key) {
    super("keydown", { bubbles: true, cancelable: true });
    this.key = key;
    this.ctrlKey = false;
    this.altKey = false;
    this.metaKey = false;
  }
}

class FakeNotifications {
  constructor(roster = []) {
    this.snapshot = this.freeze({ roster, rosterRequestPending: false });
    this.listeners = new Set();
    this.requests = 0;
  }

  freeze({ roster, rosterRequestPending }) {
    return Object.freeze({
      playerName: "Acer",
      channelNames: Object.freeze([]),
      roster: Object.freeze(roster),
      rosterRequestPending,
      notifications: Object.freeze([]),
      unreadCount: 0,
    });
  }

  getSnapshot() {
    return this.snapshot;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  publish(changes) {
    this.snapshot = this.freeze({ ...this.snapshot, ...changes });
    for (const listener of [...this.listeners]) listener(this.snapshot);
  }

  requestRoster() {
    this.requests += 1;
    this.publish({ rosterRequestPending: true });
    return true;
  }

  setRoster(roster) {
    this.publish({ roster, rosterRequestPending: false });
  }
}

function installDom(t) {
  const document = new FakeDocument();
  const window = new FakeWindow();
  const storage = new Map();
  const saved = {
    document: globalThis.document,
    window: globalThis.window,
    HTMLElement: globalThis.HTMLElement,
    localStorage: globalThis.localStorage,
  };
  Object.assign(globalThis, {
    document,
    window,
    HTMLElement: FakeElement,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  });
  t.after(() => Object.assign(globalThis, saved));
  return { document, window };
}

async function loadModules(t) {
  const server = await createServer({
    configFile: path.join(repoRoot, "vite.config.ts"),
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
    hmr: false,
    watch: null,
  });
  t.after(async () => server.close());
  const ssr = server.environments.ssr;
  assert.ok(isRunnableDevEnvironment(ssr));
  const [picker, input] = await Promise.all([
    ssr.runner.import("/terminal/mention-picker.ts"),
    ssr.runner.import("/terminal/input-controller.ts"),
  ]);
  return { ...picker, ...input };
}

function player(index) {
  return {
    name: `acer${index}`,
    displayName: `Acer${index}`,
    channels: Object.freeze(["gossip"]),
  };
}

test("mention picker owns loading, keyboard, pointer, focus, and disposal", async (t) => {
  const { document, window } = installDom(t);
  const { createMentionPicker } = await loadModules(t);
  const input = document.createElement("input");
  const notifications = new FakeNotifications();
  const picker = createMentionPicker({ input, notifications });

  input.value = "gossip hello @a";
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new Event("input"));
  const pickerElement = document.body.children[0];
  assert.equal(notifications.requests, 1);
  assert.equal(pickerElement.hidden, false);
  assert.equal(pickerElement.children[0].textContent, "Loading players...");

  notifications.setRoster(Array.from({ length: 10 }, (_, index) => player(index)));
  assert.equal(pickerElement.children.length, 8);
  assert.equal(picker.handleKeydown(new FakeKeyboardEvent("ArrowUp")), true);
  assert.match(pickerElement.children[7].className, /is-active/);
  assert.equal(picker.handleKeydown(new FakeKeyboardEvent("ArrowDown")), true);
  assert.equal(picker.handleKeydown(new FakeKeyboardEvent("ArrowDown")), true);
  assert.equal(picker.handleKeydown(new FakeKeyboardEvent("Enter")), true);
  assert.equal(input.value, "gossip hello @Acer1 ");
  assert.equal(document.activeElement, input);

  input.value = "gossip @a";
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new Event("input"));
  assert.equal(picker.handleKeydown(new FakeKeyboardEvent("Escape")), true);
  assert.equal(pickerElement.hidden, true);
  input.dispatchEvent(new Event("input"));
  const pointerEvent = new Event("pointerdown", { cancelable: true });
  pickerElement.children[0].dispatchEvent(pointerEvent);
  assert.equal(pointerEvent.defaultPrevented, true);
  assert.equal(input.value, "gossip @Acer0 ");
  assert.equal(document.activeElement, input);

  input.value = "gossip @";
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new Event("input"));
  window.dispatchEvent(new Event("resize"));
  const requestCount = notifications.requests;
  picker.dispose();
  input.dispatchEvent(new Event("input"));
  assert.equal(notifications.requests, requestCount);
  assert.equal(notifications.listeners.size, 0);
  assert.equal(document.body.children.length, 0);
});

test("input ownership gives mentions and return-to-live precedence", async (t) => {
  const { document } = installDom(t);
  const { createTerminalInputController } = await loadModules(t);
  const notifications = new FakeNotifications([player(0)]);
  const input = document.createElement("input");
  const sendButton = document.createElement("button");
  const output = document.createElement("div");
  const batchDialog = document.createElement("dialog");
  const batchInput = document.createElement("textarea");
  const batchForm = document.createElement("form");
  let sends = 0;
  const executed = [];
  let completions = 0;
  let returnToLive = false;
  let returnCalls = 0;
  const session = {
    characterProfileId: "character-1",
    disposed: false,
    notifications,
    terminal: {
      sendCommand: () => true,
      requestCompletion: () => {
        completions += 1;
        return true;
      },
      subscribeCompletion: () => () => {},
      subscribeConfiguration: (listener) => {
        listener({ aliases: [] });
        return () => {};
      },
    },
    subscribeConnection: (listener) => {
      listener({ state: "connected" });
      return () => {};
    },
  };
  const controller = createTerminalInputController({
    session,
    input,
    sendButton,
    output,
    batchDialog,
    batchInput,
    batchForm,
    appendEcho: () => {},
    appendSystemMessage: () => {},
    executeCommand: (command) => {
      sends += 1;
      executed.push(command);
      return true;
    },
    getMappedCommand: (event) => (event.key === "F1" ? "score" : null),
    returnOutputToLive: () => {
      returnCalls += 1;
      return returnToLive;
    },
  });

  input.value = "gossip @a";
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new Event("input"));
  input.dispatchEvent(new FakeKeyboardEvent("Enter"));
  assert.equal(input.value, "gossip @Acer0 ");
  assert.equal(sends, 0);

  input.value = "gossip @a";
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new Event("input"));
  input.dispatchEvent(new FakeKeyboardEvent("Tab"));
  assert.equal(completions, 0);
  assert.equal(sends, 0);

  input.value = "look";
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new Event("input"));
  const prevented = new FakeKeyboardEvent("Enter");
  prevented.preventDefault();
  input.dispatchEvent(prevented);
  assert.equal(sends, 0);

  input.dispatchEvent(new FakeKeyboardEvent("Enter"));
  assert.equal(sends, 1);

  input.value = "keep me";
  returnToLive = true;
  const escape = new FakeKeyboardEvent("Escape");
  document.dispatchKeydown(document.body, escape);
  assert.equal(returnCalls, 1);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(input.value, "keep me");
  assert.equal(sends, 1);
  assert.equal(document.activeElement, input);

  input.dispatchEvent(new FakeKeyboardEvent("F1"));
  assert.equal(executed.at(-1), "score");
  assert.equal(input.value, "keep me");
  assert.equal(document.activeElement, input);

  const otherInput = document.createElement("input");
  otherInput.focus();
  const sendsBeforeOtherInput = sends;
  document.dispatchKeydown(otherInput, new FakeKeyboardEvent("F1"));
  assert.equal(sends, sendsBeforeOtherInput);
  const editorEscape = new FakeKeyboardEvent("Escape");
  document.dispatchKeydown(otherInput, editorEscape);
  assert.equal(returnCalls, 1);
  assert.equal(editorEscape.defaultPrevented, false);
  assert.equal(document.activeElement, otherInput);

  const dialog = document.createElement("section");
  const dialogButton = document.createElement("button");
  dialog.setAttribute("role", "dialog");
  dialog.appendChild(dialogButton);
  dialogButton.focus();
  const dialogEscape = new FakeKeyboardEvent("Escape");
  document.dispatchKeydown(dialogButton, dialogEscape);
  assert.equal(returnCalls, 1);
  assert.equal(dialogEscape.defaultPrevented, false);
  assert.equal(document.activeElement, dialogButton);

  const floatingPanel = document.createElement("section");
  const floatingTab = document.createElement("div");
  floatingPanel.className = "dv-resize-container";
  floatingPanel.setAttribute("role", "dialog");
  floatingPanel.appendChild(floatingTab);
  floatingTab.focus();
  document.dispatchKeydown(floatingTab, new FakeKeyboardEvent("F1"));
  assert.equal(executed.at(-1), "score");
  assert.equal(document.activeElement, floatingTab);

  const toolbarButton = document.createElement("button");
  toolbarButton.focus();
  document.dispatchKeydown(toolbarButton, new FakeKeyboardEvent(" "));
  assert.equal(document.activeElement, toolbarButton);
  document.dispatchKeydown(toolbarButton, new FakeKeyboardEvent("F1"));
  assert.equal(executed.at(-1), "score");
  assert.equal(document.activeElement, toolbarButton);

  document.body.focus();
  document.dispatchKeydown(document.body, new FakeKeyboardEvent("x"));
  assert.equal(document.activeElement, input);

  document.body.focus();
  document.dispatchKeydown(document.body, new FakeKeyboardEvent("F1"));
  assert.equal(document.activeElement, document.body);
  document.dispatchKeydown(document.body, new FakeKeyboardEvent("F1"));
  assert.deepEqual(executed.slice(-2), ["score", "score"]);

  controller.dispose();
  assert.equal(notifications.listeners.size, 0);
});
