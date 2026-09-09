import assert from "node:assert/strict";
import test from "node:test";

import { createTerminalOutputModel } from "../public/js/terminal-output-model.mjs";

test("assembles partial ANSI output with isolated persistent parser state", () => {
  const first = createTerminalOutputModel();
  const second = createTerminalOutputModel();

  first.appendOutput("\x1b[31");
  first.appendOutput("mred");
  second.appendOutput("plain\n");

  assert.equal(first.snapshot()[0].complete, false);
  assert.deepEqual(first.snapshot()[0].fragments[0].style.fg, { type: "standard", index: 1 });
  assert.equal(second.snapshot()[0].fragments[0].style.fg, null);
});

test("processes complete lines once and preserves reentrant output order", () => {
  const processed = [];
  const completed = [];
  let model;
  model = createTerminalOutputModel({
    processLine(text, fragments) {
      processed.push(text);
      if (text === "incoming") model.appendSystemMessage("nested");
      if (text === "gag") return { fragments: [], gag: true };
      if (text === "highlight") {
        return { fragments: [{ text: "bright", style: { bold: true } }], gag: false };
      }
      return { fragments, gag: false };
    },
    onOutputLine: (line) => completed.push(line),
  });

  model.appendOutput("incoming\ntrailing");
  model.appendOutput("\nhighlight\ngag\n");

  assert.deepEqual(processed, ["incoming", "nested", "trailing", "highlight", "gag"]);
  assert.deepEqual(
    model.snapshot().map(({ id, text, complete, cssClass }) => ({ id, text, complete, cssClass })),
    [
      { id: 1, text: "incoming", complete: true, cssClass: "" },
      { id: 2, text: "nested", complete: true, cssClass: "system-line" },
      { id: 3, text: "trailing", complete: true, cssClass: "" },
      { id: 4, text: "bright", complete: true, cssClass: "" },
    ],
  );
  assert.deepEqual(completed.map(({ id }) => id), [2, 1, 3, 4]);
});

test("hydrates remounted subscribers silently and never reuses IDs after clear", () => {
  const model = createTerminalOutputModel();
  const firstEvents = [];
  const unsubscribe = model.subscribe((event) => firstEvents.push(event));
  model.appendOutput("complete\nprompt");
  unsubscribe();

  const remountedEvents = [];
  model.subscribe((event) => remountedEvents.push(event));
  assert.equal(remountedEvents.length, 1);
  assert.equal(remountedEvents[0].type, "reset");
  assert.deepEqual(remountedEvents[0].records.map(({ id }) => id), [1, 2]);

  model.clear();
  model.appendOutput("replacement\n");
  assert.equal(model.snapshot()[0].id, 3);
  assert.ok(firstEvents.some((event) => event.type === "announce"));
});

test("stream reset drops only partial state and preserves completed history", () => {
  const model = createTerminalOutputModel();
  model.appendOutput("kept\n\x1b[31mpartial");
  model.resetStream();
  model.appendOutput("new\n");

  assert.deepEqual(model.snapshot().map(({ id, text }) => ({ id, text })), [
    { id: 1, text: "kept" },
    { id: 3, text: "new" },
  ]);
  assert.equal(model.snapshot()[1].fragments[0].style.fg, null);
});

test("prunes the oldest completed records with ordinary remove events", () => {
  const model = createTerminalOutputModel({ recordLimit: 3 });
  const events = [];
  model.subscribe((event) => events.push(event));

  model.appendOutput("one\ntwo\nthree\nfour\n");
  assert.deepEqual(model.snapshot().map(({ id, text }) => ({ id, text })), [
    { id: 2, text: "two" },
    { id: 3, text: "three" },
    { id: 4, text: "four" },
  ]);
  assert.deepEqual(events.filter((event) => event.type === "remove").map((event) => event.id), [1]);

  model.setRecordLimit(2);
  assert.deepEqual(model.snapshot().map(({ id, text }) => ({ id, text })), [
    { id: 3, text: "three" },
    { id: 4, text: "four" },
  ]);
  assert.deepEqual(events.filter((event) => event.type === "remove").map((event) => event.id), [1, 2]);
});

test("keeps the active partial record within the selected limit", () => {
  const model = createTerminalOutputModel({ recordLimit: 2 });
  model.appendOutput("one\ntwo\nprompt");

  assert.deepEqual(model.snapshot().map(({ id, text, complete }) => ({ id, text, complete })), [
    { id: 2, text: "two", complete: true },
    { id: 3, text: "", complete: false },
  ]);
  assert.equal(model.snapshot()[1].fragments[0].text, "prompt");
  model.appendOutput(" done\n");
  assert.deepEqual(model.snapshot().map(({ id, text }) => ({ id, text })), [
    { id: 2, text: "two" },
    { id: 3, text: "prompt done" },
  ]);
});

test("completes a protected source record after nested output prunes earlier history", () => {
  let model;
  model = createTerminalOutputModel({
    recordLimit: 2,
    processLine(text, fragments) {
      if (text === "outer") model.appendSystemMessage("nested");
      return { fragments, gag: false };
    },
  });

  model.appendOutput("before\nouter\n");
  assert.deepEqual(model.snapshot().map(({ id, text, cssClass }) => ({ id, text, cssClass })), [
    { id: 2, text: "outer", cssClass: "" },
    { id: 3, text: "nested", cssClass: "system-line" },
  ]);
});
