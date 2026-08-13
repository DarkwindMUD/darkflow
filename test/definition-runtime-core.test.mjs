import assert from "node:assert/strict";
import test from "node:test";

import {
  applyHighlightDefinitionsToLine,
  evaluateTriggerDefinitions,
  matchAliasDefinitions,
  resolveDefinitionTemplate,
} from "../public/js/definition-runtime-core.mjs";

test("definition runtime matches aliases and resolves variables", () => {
  const alias = {
    id: "alias-1",
    enabled: true,
    trigger: "go",
    isRegex: false,
    steps: [],
  };
  const match = matchAliasDefinitions("go north", [alias]);
  assert.equal(match.alias, alias);
  assert.deepEqual(match.args, ["north"]);
  assert.deepEqual(
    resolveDefinitionTemplate("walk %1 $speed", {
      args: match.args,
      remainder: match.remainder,
      variables: { speed: "fast" },
    }),
    { text: "walk north fast", missingVariables: [], errors: [] },
  );
});

test("definition runtime preserves regex alias order", () => {
  const first = { id: "first", enabled: true, trigger: "^g", isRegex: true };
  const longer = { id: "longer", enabled: true, trigger: "^go.*", isRegex: true };
  assert.equal(matchAliasDefinitions("go north", [first, longer]).alias, first);
});

test("definition runtime evaluates trigger captures and gag", () => {
  const result = evaluateTriggerDefinitions("danger 42", [{
    id: "trigger-1",
    enabled: true,
    pattern: "danger %1",
    isRegex: false,
    ignoreCase: false,
    gag: true,
  }]);
  assert.equal(result.gag, true);
  assert.deepEqual(result.matches[0].captures, ["42"]);
});

test("definition runtime applies the first matching highlight", () => {
  const line = applyHighlightDefinitionsToLine(
    { text: "plain glow", fragments: [{ text: "plain glow", style: {} }] },
    [{
      id: "highlight-1",
      enabled: true,
      patternSource: "glow",
      ignoreCase: false,
      style: { fg: "red", bg: "black", bold: true },
    }],
  );
  assert.equal(line.fragments.at(-1).text, "glow");
  assert.deepEqual(line.fragments.at(-1).style.fg, { type: "standard", index: 1 });
});
