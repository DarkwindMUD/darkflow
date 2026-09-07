import assert from "node:assert/strict";
import test from "node:test";

import { createTerminalOutputCore } from "../public/js/terminal-output-core.mjs";
import { createTerminalOutputModel } from "../public/js/terminal-output-model.mjs";

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }

  toggle(name, force) {
    const enabled = force ?? !this.values.has(name);
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }
}

class FakeTextNode {
  constructor(text) {
    this.textContent = text;
    this.parentElement = null;
  }

  remove() {
    this.parentElement?.removeChild(this);
  }
}

class FakeElement {
  constructor(tagName, fragment = false) {
    this.tagName = tagName;
    this.fragment = fragment;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = new FakeClassList(this);
    this.style = { setProperty() {} };
    this.scrollTop = 0;
    this.clientHeight = 100;
    this.clientWidth = 100;
    this.offsetWidth = 100;
    this.title = "";
  }

  get className() {
    return [...this.classList.values].join(" ");
  }

  set className(value) {
    this.classList.values = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  get textContent() {
    return this.children.map((child) => child.textContent ?? "").join("");
  }

  set textContent(value) {
    this.replaceChildren(value ? new FakeTextNode(String(value)) : undefined);
  }

  get scrollHeight() {
    return this.children.length * 20;
  }

  get offsetTop() {
    return Math.max(0, (this.parentElement?.children.indexOf(this) ?? 0) * 20);
  }

  getBoundingClientRect() {
    return { top: this.offsetTop - (this.parentElement?.scrollTop ?? 0), height: 200, right: 100 };
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node?.fragment) {
        for (const child of node.children.splice(0)) this.append(child);
        continue;
      }
      if (!node) continue;
      node.remove?.();
      node.parentElement = this;
      this.children.push(node);
    }
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...nodes);
  }

  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentElement = null;
  }

  remove() {
    this.parentElement?.removeChild(this);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  dispatch(type, event = {}) {
    this.listeners.get(type)?.({ type, currentTarget: this, target: this, ...event });
  }

  focus() {}
}

function installDom(t) {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  let nextId = 1;
  const frames = new Map();
  const timers = new Map();
  const windowListeners = new Map();

  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    createTextNode: (text) => new FakeTextNode(text),
    createDocumentFragment: () => new FakeElement("fragment", true),
  };
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextId++;
    frames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  globalThis.window = {
    setTimeout(callback) {
      const id = nextId++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    addEventListener(type, listener) {
      windowListeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (windowListeners.get(type) === listener) windowListeners.delete(type);
    },
  };

  t.after(() => {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
  });

  return {
    frames,
    timers,
    windowListeners,
    flushFrames() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
    },
  };
}

function createHarness(t, options = {}) {
  const scheduler = installDom(t);
  const shell = new FakeElement("section");
  const output = new FakeElement("div");
  const pauseButton = new FakeElement("button");
  const liveButton = new FakeElement("button");
  const clearButton = new FakeElement("button");
  const announcer = new FakeElement("div");
  const lines = [];
  let clears = 0;
  const core = createTerminalOutputCore({
    shell,
    output,
    pauseButton,
    liveButton,
    clearButton,
    announcer,
    processLine(text, fragments) {
      if (text === "gag") return { fragments: [], gag: true };
      if (text === "transform") return { fragments: [{ text: "rendered", style: {} }], gag: false };
      return { fragments, gag: false };
    },
    onOutputLine(line) {
      lines.push(line);
      options.onOutputLine?.(line);
    },
    onClear() {
      clears += 1;
      options.onClear?.();
    },
  });
  return {
    announcer,
    clearButton,
    core,
    get clears() {
      return clears;
    },
    lines,
    liveButton,
    output,
    pauseButton,
    scheduler,
    shell,
  };
}

test("completed non-gagged lines receive stable IDs and rendered text", (t) => {
  const harness = createHarness(t);

  harness.core.appendOutput("partial");
  harness.scheduler.flushFrames();
  assert.equal(harness.lines.length, 0);
  assert.equal(harness.output.children[0].dataset.lineId, undefined);

  harness.core.appendOutput("\ntransform\ngag\nlast\n");
  harness.scheduler.flushFrames();
  assert.deepEqual(harness.lines, [
    { id: 1, text: "partial" },
    { id: 2, text: "rendered" },
    { id: 4, text: "last" },
  ]);
  assert.deepEqual(
    harness.output.children.map((line) => line.dataset.lineId).filter(Boolean),
    ["1", "2", "4"],
  );
  assert.equal(harness.output.children[1].textContent, "rendered");
  harness.core.dispose();
});

test("clear invalidates IDs without reusing them and reports clear", (t) => {
  const harness = createHarness(t);
  harness.core.appendOutput("first\n");
  harness.scheduler.flushFrames();
  assert.equal(harness.core.isLineAvailable(1), true);

  harness.core.clear();
  assert.equal(harness.core.isLineAvailable(1), false);
  assert.equal(harness.output.children.length, 0);
  assert.equal(harness.clears, 1);

  harness.core.appendOutput("replacement\n");
  assert.equal(harness.lines.at(-1).id, 2);
  harness.core.dispose();
  assert.equal(harness.clears, 1);
  harness.core.clear();
  assert.equal(harness.clears, 1);
});

test("screen reader announcements are opt-in and clear immediately when disabled", (t) => {
  const harness = createHarness(t);
  harness.core.appendOutput("quiet\n");
  assert.equal(harness.scheduler.timers.size, 0);

  harness.core.configure({ screenReaderMode: true });
  harness.core.appendOutput("spoken\n");
  assert.equal(harness.scheduler.timers.size, 1);
  for (const callback of harness.scheduler.timers.values()) callback();
  assert.equal(harness.announcer.textContent, "spoken\n");

  harness.core.appendOutput("queued\n");
  harness.core.configure({ screenReaderMode: false });
  assert.equal(harness.announcer.textContent, "");
  harness.core.dispose();
});

test("navigation renders pending output, locks near 35 percent, and returns live", (t) => {
  const harness = createHarness(t);
  harness.core.appendOutput(`${Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join("\n")}\n`);
  assert.equal(harness.output.children.length, 0);

  assert.equal(harness.core.navigateToLine(9), true);
  assert.equal(harness.output.children.length, 10);
  assert.equal(harness.output.children[8].classList.contains("output-line-mention-target"), true);
  assert.equal(harness.pauseButton.getAttribute("aria-pressed"), "true");
  assert.equal(harness.output.scrollTop, 125);
  harness.output.dispatch("scroll");
  assert.equal(harness.pauseButton.getAttribute("aria-pressed"), "true");

  assert.equal(harness.core.returnToLive(), true);
  assert.equal(harness.output.children[8].classList.contains("output-line-mention-target"), false);
  assert.equal(harness.pauseButton.getAttribute("aria-pressed"), "false");
  assert.equal(harness.output.scrollTop, harness.output.scrollHeight);
  assert.equal(harness.core.returnToLive(), false);
  assert.equal(harness.core.navigateToLine(999), false);
  harness.core.dispose();
});

test("dispose cancels pending work, clears targets, and removes listeners", (t) => {
  const harness = createHarness(t);
  harness.core.configure({ screenReaderMode: true });
  harness.core.appendOutput("first\n");
  assert.equal(harness.scheduler.frames.size, 1);
  assert.equal(harness.scheduler.timers.size, 1);
  assert.equal(harness.core.navigateToLine(1), true);
  assert.equal(harness.output.children[0].classList.contains("output-line-mention-target"), true);

  harness.core.appendOutput("second\n");
  harness.core.dispose();
  assert.equal(harness.scheduler.frames.size, 0);
  assert.equal(harness.scheduler.timers.size, 0);
  assert.equal(harness.output.children.length, 0);
  assert.equal(harness.core.isLineAvailable(1), false);
  assert.equal(harness.core.navigateToLine(1), false);
  assert.equal(harness.pauseButton.listeners.size, 0);
  assert.equal(harness.liveButton.listeners.size, 0);
  assert.equal(harness.clearButton.listeners.size, 0);
  harness.scheduler.flushFrames();
  assert.equal(harness.output.children.length, 0);
});

test("split scrollback renders one record stream into history and live panes", (t) => {
  const scheduler = installDom(t);
  const shell = new FakeElement("section");
  const output = new FakeElement("div");
  const historyOutput = new FakeElement("div");
  const liveOutput = new FakeElement("div");
  const core = createTerminalOutputCore({
    shell,
    output,
    historyOutput,
    liveOutput,
    pauseButton: new FakeElement("button"),
    liveButton: new FakeElement("button"),
    clearButton: new FakeElement("button"),
    announcer: new FakeElement("div"),
  });

  core.configure({ scrollbackBehavior: "split", scrollbackSplitRatio: 2 });
  core.appendOutput("one\ntwo\nthree\nfour\nfive\nsix\n");
  scheduler.flushFrames();
  output.scrollTop = 0;
  output.dispatch("wheel");
  output.dispatch("scroll");

  assert.equal(shell.classList.contains("split-active"), true);
  assert.equal(historyOutput.children.length, 6);
  assert.equal(liveOutput.children.length, 6);
  assert.equal(liveOutput.scrollTop, liveOutput.scrollHeight);

  historyOutput.scrollTop = historyOutput.scrollHeight;
  historyOutput.dispatch("scroll");
  assert.equal(shell.classList.contains("split-active"), false);
  core.dispose();
});

test("split scrollback requires current wheel or scrollbar intent", (t) => {
  const scheduler = installDom(t);
  const previousNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  t.after(() => (Date.now = previousNow));
  const shell = new FakeElement("section");
  const output = new FakeElement("div");
  const core = createTerminalOutputCore({
    shell,
    output,
    historyOutput: new FakeElement("div"),
    liveOutput: new FakeElement("div"),
    pauseButton: new FakeElement("button"),
    liveButton: new FakeElement("button"),
    clearButton: new FakeElement("button"),
    announcer: new FakeElement("div"),
  });

  core.configure({ scrollbackBehavior: "split" });
  core.appendOutput("one\ntwo\nthree\nfour\nfive\nsix\n");
  scheduler.flushFrames();
  output.dispatch("wheel");
  now += 901;
  output.scrollTop = 0;
  output.dispatch("scroll");
  assert.equal(shell.classList.contains("split-active"), false);

  output.scrollTop = output.scrollHeight;
  output.dispatch("pointerdown", { clientX: 4 });
  output.scrollTop = 0;
  output.dispatch("scroll");
  assert.equal(shell.classList.contains("split-active"), false);

  output.dispatch("wheel");
  output.dispatch("scroll");
  assert.equal(shell.classList.contains("split-active"), true);
  core.dispose();
});

test("split divider clamps and persists its ratio", (t) => {
  const scheduler = installDom(t);
  const shell = new FakeElement("section");
  const divider = new FakeElement("div");
  let savedRatio;
  const core = createTerminalOutputCore({
    shell,
    output: new FakeElement("div"),
    historyOutput: new FakeElement("div"),
    liveOutput: new FakeElement("div"),
    divider,
    pauseButton: new FakeElement("button"),
    liveButton: new FakeElement("button"),
    clearButton: new FakeElement("button"),
    announcer: new FakeElement("div"),
    onSplitRatioChange: (ratio) => (savedRatio = ratio),
  });

  divider.dispatch("pointerdown", { pointerId: 1, preventDefault() {} });
  scheduler.windowListeners.get("pointermove")({ pointerId: 1, clientY: 500 });
  scheduler.windowListeners.get("pointerup")({ pointerId: 1 });
  assert.equal(savedRatio, 0.8);
  core.dispose();
  assert.equal(scheduler.windowListeners.size, 0);
});

test("hydrates large retained histories without spreading the line collection", (t) => {
  const scheduler = installDom(t);
  const model = createTerminalOutputModel({ recordLimit: 200_000 });
  model.appendOutput(`${Array.from({ length: 150_000 }, (_, index) => `line ${index}`).join("\n")}\n`);
  const shell = new FakeElement("section");
  const output = new FakeElement("div");
  const core = createTerminalOutputCore({
    shell,
    output,
    pauseButton: new FakeElement("button"),
    liveButton: new FakeElement("button"),
    clearButton: new FakeElement("button"),
    announcer: new FakeElement("div"),
    subscribeOutput: model.subscribe,
    clearOutput: model.clear,
  });

  scheduler.flushFrames();
  assert.equal(output.children.length, 150_000);
  assert.equal(output.children.at(-1).textContent, "line 149999");
  core.dispose();
});
