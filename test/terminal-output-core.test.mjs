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
    this.style = { height: "", setProperty() {} };
    this.scrollTop = 0;
    this.clientHeight = 100;
    this.clientWidth = 100;
    this.offsetWidth = 100;
    this.title = "";
    this.measureCount = 0;
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

  get firstChild() {
    return this.children[0] ?? null;
  }

  set textContent(value) {
    this.replaceChildren(value ? new FakeTextNode(String(value)) : undefined);
  }

  get scrollHeight() {
    return this.children.reduce((height, child) => {
      const explicitHeight = Number.parseFloat(child.style?.height);
      if (Number.isFinite(explicitHeight)) return height + explicitHeight;
      return height + (child.classList?.contains("terminal-output-viewport") ? child.scrollHeight : 20);
    }, 0);
  }

  get offsetTop() {
    const siblings = this.parentElement?.children ?? [];
    return siblings.slice(0, siblings.indexOf(this)).reduce((height, child) => {
      const explicitHeight = Number.parseFloat(child.style?.height);
      if (Number.isFinite(explicitHeight)) return height + explicitHeight;
      return height + (child.classList?.contains("terminal-output-viewport") ? child.scrollHeight : 20);
    }, 0);
  }

  getBoundingClientRect() {
    if (this.classList.contains("output-line")) this.measureCount += 1;
    let top = this.offsetTop;
    let parent = this.parentElement;
    while (parent) {
      top += parent.offsetTop;
      if (!parent.parentElement) top -= parent.scrollTop;
      parent = parent.parentElement;
    }
    return {
      top,
      height: this.classList.contains("output-line") ? 20 : 200,
      right: 100,
    };
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

  insertBefore(node, reference) {
    if (!reference) return this.appendChild(node);
    const index = this.children.indexOf(reference);
    node.remove?.();
    node.parentElement = this;
    this.children.splice(index, 0, node);
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

function outputLines(element) {
  return element.children.flatMap((child) =>
    child.classList?.contains("output-line") ? [child] : outputLines(child),
  );
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
  assert.equal(outputLines(harness.output)[0].dataset.lineId, undefined);

  harness.core.appendOutput("\ntransform\ngag\nlast\n");
  harness.scheduler.flushFrames();
  assert.deepEqual(harness.lines, [
    { id: 1, text: "partial" },
    { id: 2, text: "rendered" },
    { id: 4, text: "last" },
  ]);
  assert.deepEqual(
    outputLines(harness.output).map((line) => line.dataset.lineId).filter(Boolean),
    ["1", "2", "4"],
  );
  assert.equal(outputLines(harness.output)[1].textContent, "rendered");
  harness.core.dispose();
});

test("clear invalidates IDs without reusing them and reports clear", (t) => {
  const harness = createHarness(t);
  harness.core.appendOutput("first\n");
  harness.scheduler.flushFrames();
  assert.equal(harness.core.isLineAvailable(1), true);

  harness.core.clear();
  assert.equal(harness.core.isLineAvailable(1), false);
  assert.equal(outputLines(harness.output).length, 0);
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
  assert.equal(outputLines(harness.output).length, 0);

  assert.equal(harness.core.navigateToLine(9), true);
  assert.equal(outputLines(harness.output).length, 10);
  assert.equal(outputLines(harness.output)[8].classList.contains("output-line-mention-target"), true);
  assert.equal(harness.pauseButton.getAttribute("aria-pressed"), "true");
  assert.equal(harness.output.scrollTop, 125);
  harness.output.dispatch("scroll");
  assert.equal(harness.pauseButton.getAttribute("aria-pressed"), "true");

  assert.equal(harness.core.returnToLive(), true);
  assert.equal(outputLines(harness.output)[8].classList.contains("output-line-mention-target"), false);
  assert.equal(harness.pauseButton.getAttribute("aria-pressed"), "false");
  assert.equal(harness.output.scrollTop, harness.output.scrollHeight - harness.output.clientHeight);
  assert.equal(harness.core.returnToLive(), false);
  assert.equal(harness.core.navigateToLine(999), false);
  harness.core.dispose();
});

test("pause scrollback detaches only for user scrolling", (t) => {
  const harness = createHarness(t);
  harness.core.appendOutput("one\ntwo\nthree\nfour\nfive\nsix\n");
  harness.scheduler.flushFrames();

  harness.output.scrollTop = 0;
  harness.output.dispatch("scroll");
  assert.equal(harness.pauseButton.getAttribute("aria-pressed"), "false");

  harness.output.dispatch("wheel");
  harness.output.dispatch("scroll");
  assert.equal(harness.pauseButton.getAttribute("aria-pressed"), "true");
  const pausedScrollTop = harness.output.scrollTop;
  harness.output.clientHeight = 80;
  harness.core.refreshLayout();
  assert.equal(harness.output.scrollTop, pausedScrollTop);

  harness.core.returnToLive();
  harness.output.scrollTop = 0;
  harness.output.dispatch("scroll");
  harness.core.appendOutput("seven\n");
  harness.scheduler.flushFrames();
  assert.equal(harness.pauseButton.getAttribute("aria-pressed"), "false");
  assert.equal(harness.output.scrollTop, harness.output.scrollHeight - harness.output.clientHeight);
  harness.core.dispose();
});

test("coalesces repeated record updates and keeps unchanged visible nodes", (t) => {
  const harness = createHarness(t);
  harness.core.appendOutput("partial");
  harness.core.appendOutput(" output\nsecond\n");
  assert.equal(harness.scheduler.frames.size, 1);
  harness.scheduler.flushFrames();
  const first = outputLines(harness.output)[0];
  assert.equal(first.textContent, "partial output");
  const firstMeasurements = first.measureCount;

  harness.core.appendOutput("third\n");
  harness.scheduler.flushFrames();
  assert.equal(outputLines(harness.output)[0], first);
  assert.equal(first.measureCount, firstMeasurements);
  assert.deepEqual(outputLines(harness.output).map((line) => line.textContent), [
    "partial output",
    "second",
    "third",
  ]);
  harness.core.dispose();
});

test("refreshLayout remeasures visible rows and restores a reading anchor", (t) => {
  const harness = createHarness(t);
  harness.core.appendOutput("one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n");
  harness.scheduler.flushFrames();
  harness.output.scrollTop = 20;
  harness.output.dispatch("wheel");
  harness.output.dispatch("scroll");
  const rows = outputLines(harness.output);
  const measurements = rows.map((line) => line.measureCount);

  harness.core.refreshLayout();
  harness.scheduler.flushFrames();
  assert.equal(harness.output.scrollTop, 20);
  assert.deepEqual(
    outputLines(harness.output).map((line) => line.measureCount),
    measurements.map((count) => count + 1),
  );
  harness.core.dispose();
});

test("dispose cancels pending work, clears targets, and removes listeners", (t) => {
  const harness = createHarness(t);
  harness.core.configure({ screenReaderMode: true });
  harness.core.appendOutput("first\n");
  assert.equal(harness.scheduler.frames.size, 1);
  assert.equal(harness.scheduler.timers.size, 1);
  assert.equal(harness.core.navigateToLine(1), true);
  assert.equal(outputLines(harness.output)[0].classList.contains("output-line-mention-target"), true);

  harness.core.appendOutput("second\n");
  harness.core.dispose();
  assert.equal(harness.scheduler.frames.size, 0);
  assert.equal(harness.scheduler.timers.size, 0);
  assert.equal(outputLines(harness.output).length, 0);
  assert.equal(harness.core.isLineAvailable(1), false);
  assert.equal(harness.core.navigateToLine(1), false);
  assert.equal(harness.pauseButton.listeners.size, 0);
  assert.equal(harness.liveButton.listeners.size, 0);
  assert.equal(harness.clearButton.listeners.size, 0);
  harness.scheduler.flushFrames();
  assert.equal(outputLines(harness.output).length, 0);
});

test("split scrollback keeps main mounted and mounts bounded history", (t) => {
  const scheduler = installDom(t);
  const shell = new FakeElement("section");
  const output = new FakeElement("div");
  const historyOutput = new FakeElement("div");
  const core = createTerminalOutputCore({
    shell,
    output,
    historyOutput,
    pauseButton: new FakeElement("button"),
    liveButton: new FakeElement("button"),
    clearButton: new FakeElement("button"),
    announcer: new FakeElement("div"),
  });

  core.configure({ scrollbackBehavior: "split", scrollbackSplitRatio: 2 });
  core.appendOutput("one\ntwo\nthree\nfour\nfive\nsix\n");
  scheduler.flushFrames();
  output.clientHeight = 100;
  historyOutput.clientHeight = 50;
  output.scrollTop = 10;
  output.dispatch("wheel");
  output.dispatch("scroll");

  assert.equal(shell.classList.contains("split-active"), true);
  assert.equal(outputLines(output).length, 6);
  assert.equal(outputLines(historyOutput).length, 6);
  assert.equal(historyOutput.scrollTop, 10);

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

test("keyboard paging marks split-scroll intent and targets active history", (t) => {
  const scheduler = installDom(t);
  const shell = new FakeElement("section");
  const output = new FakeElement("div");
  const historyOutput = new FakeElement("div");
  const core = createTerminalOutputCore({
    shell,
    output,
    historyOutput,
    pauseButton: new FakeElement("button"),
    liveButton: new FakeElement("button"),
    clearButton: new FakeElement("button"),
    announcer: new FakeElement("div"),
  });

  core.configure({ scrollbackBehavior: "split" });
  core.appendOutput("one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n");
  scheduler.flushFrames();
  output.scrollTop = output.scrollHeight - output.clientHeight;
  core.scrollByPage(-0.8);
  output.dispatch("scroll");
  assert.equal(shell.classList.contains("split-active"), true);
  const historyBefore = historyOutput.scrollTop;
  core.scrollByPage(0.8);
  assert.ok(historyOutput.scrollTop > historyBefore);
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

test("bounds mounted rows for large retained histories", (t) => {
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
  assert.ok(outputLines(output).length <= 90);
  assert.equal(core.isLineAvailable(150_000), true);
  assert.equal(core.navigateToLine(150_000), true);
  assert.equal(outputLines(output).at(-1).textContent, "line 149999");
  core.dispose();
});
