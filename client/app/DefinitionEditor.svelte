<script lang="ts">
  import { untrack } from "svelte";
  import { identityKeyForDefinition } from "../configuration/identity.ts";
  import type { CharacterConfigurationSnapshot } from "../configuration/editor.ts";
  import type {
    AliasDefinition,
    AutomationStep,
    ConfigKind,
    ConfigSourceMetadata,
    FunctionDefinition,
    HighlightDefinition,
    KeyMappingDefinition,
    TimerControlMode,
    TimerDefinition,
    TriggerDefinition,
  } from "../model/configuration.ts";
  import type { ConfigSetId } from "../model/ids.ts";
  import type { Session } from "../runtime/session.ts";
  import AutomationStepsEditor from "./AutomationStepsEditor.svelte";
  // @ts-expect-error The preview adapter is intentionally shared plain JavaScript.
  import * as previewCore from "../../public/js/alias-preview-core.mjs";
  // @ts-ignore Shared legacy parser provides the persisted script diagnostics.
  import * as scriptCore from "../../public/js/automation-script-core.mjs";
  // @ts-expect-error Shared catalog validation remains in the legacy module.
  import { getSoundCatalog, isKnownSound } from "../../public/js/sound-manager.js";
  // @ts-expect-error Legacy Highlight helpers operate only on explicit rule arrays here.
  import { highlightManager } from "../../public/js/highlight-manager.js";
  // @ts-expect-error Legacy-safe ANSI renderer has no declaration file.
  import { styleToElement } from "../../public/js/ansi.js";

  type Definition =
    | AliasDefinition
    | TriggerDefinition
    | HighlightDefinition
    | FunctionDefinition
    | KeyMappingDefinition
    | TimerDefinition;
  type Draft = {
    id: string;
    enabled: boolean;
    code: string;
    label: string;
    legacyKey: string;
    command: string;
    patternSource: string;
    description: string;
    group: string;
    ignoreCase: boolean;
    fg: string;
    bg: string;
    bold: boolean;
    name: string;
    script: string;
    trigger: string;
    pattern: string;
    isRegex: boolean;
    gag: boolean;
    durationMs: number;
    recurring: boolean;
    autoStart: boolean;
    steps: AutomationStep[];
  };
  type EditSource =
    { kind: "local" } | { kind: "shared-set"; configSetId: ConfigSetId; revision: number };
  const { previewAliasInput, previewFunction, previewTimer, previewTriggerOutput } = previewCore;
  const {
    applyHighlightsToText,
    colorTokenToCss,
    formatRuleStyle,
    getColorSuggestions,
    isValidColorToken,
    normalizeColorToken,
  } = highlightManager;

  let { session, kind }: { session: Session; kind: ConfigKind } = $props();
  let snapshot = $state<CharacterConfigurationSnapshot>(
    untrack(() => session.configuration.getSnapshot()),
  );
  let draft = $state<Draft | null>(null);
  let source = $state<EditSource | null>(null);
  let stale = $state(false);
  let status = $state("");
  let editor = $state<HTMLElement>();
  let keyCapture = $state<HTMLButtonElement>();
  let deleteCancel = $state<HTMLButtonElement>();
  let pendingDelete = $state<{
    definition: Definition;
    metadata: ConfigSourceMetadata;
  } | null>(null);
  let search = $state("");
  let selectedGroups = $state<string[] | null>(null);
  let previousGroupKeys: string[] = [];
  let original = $state<string | null>(null);
  let previewInput = $state(
    untrack(() => (kind === "highlights" ? "You have emptied the keg!" : "")),
  );
  let timerResult = $state("");
  const soundCatalog = getSoundCatalog();
  let previewCollapsed = $state(
    (() => {
      try {
        return (
          JSON.parse(localStorage.getItem("darkwind-settings-automation-ui") ?? "{}")[
            kind === "triggers"
              ? "triggerPreviewCollapsed"
              : kind === "timers"
                ? "timerPreviewCollapsed"
                : kind === "functions"
                  ? "functionPreviewCollapsed"
                  : kind === "highlights"
                    ? "highlightPreviewCollapsed"
                    : "aliasPreviewCollapsed"
          ] === true
        );
      } catch {
        return false;
      }
    })(),
  );

  const title = $derived(
    kind === "keyMappings" ? "Key mappings" : `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`,
  );
  const noun = $derived(
    kind === "keyMappings"
      ? "mapping"
      : kind === "aliases"
        ? "alias"
        : kind === "triggers"
          ? "trigger"
          : kind === "timers"
            ? "timer"
            : kind === "functions"
              ? "function"
              : "highlight",
  );
  const entries = $derived(snapshot.effectiveConfiguration[kind]);
  const groups = $derived.by(() => {
    const seen: Array<{ key: string; label: string; count: number }> = [];
    if (
      kind !== "aliases" &&
      kind !== "triggers" &&
      kind !== "timers" &&
      kind !== "functions" &&
      kind !== "highlights"
    )
      return [];
    for (const { definition } of entries) {
      const label = "group" in definition ? definition.group.trim() : "";
      const key = label.toLowerCase();
      const group = seen.find((item) => item.key === key);
      if (group) group.count++;
      else seen.push({ key, label: label || "Ungrouped", count: 1 });
    }
    return seen.sort((left, right) => left.label.localeCompare(right.label));
  });
  const visibleEntries = $derived(
    entries.filter(({ definition }) => {
      const needle = search.trim().toLowerCase();
      const group = "group" in definition ? definition.group.trim().toLowerCase() : "";
      const matchesSearch =
        !needle ||
        `${labelFor(definition)} ${"description" in definition ? definition.description : ""} ${group} ${"script" in definition ? definition.script : ""}`
          .toLowerCase()
          .includes(needle);
      return (
        matchesSearch &&
        ((kind !== "aliases" &&
          kind !== "triggers" &&
          kind !== "timers" &&
          kind !== "functions" &&
          kind !== "highlights") ||
          selectedGroups === null ||
          selectedGroups.includes(group))
      );
    }),
  );
  const selectedEntry = $derived(entries.find(({ definition }) => definition.id === draft?.id));
  const dirty = $derived(
    draft !== null && original !== null && JSON.stringify(toDefinition(draft)) !== original,
  );
  const targetCatalogs = $derived({
    aliases: entriesFor("aliases", "trigger"),
    triggers: entriesFor("triggers", "pattern"),
    timers: entriesFor("timers", "name"),
    functions: entriesFor("functions", "name"),
  });
  const automationWarnings = $derived(
    (kind !== "aliases" && kind !== "triggers" && kind !== "timers") || !draft
      ? []
      : warningsForAutomation(draft),
  );
  const functionWarnings = $derived(
    kind !== "functions" || !draft ? [] : warningsForFunction(draft),
  );
  const highlightWarnings = $derived(
    kind !== "highlights" || !draft ? [] : warningsForHighlight(draft),
  );
  const preview = $derived(
    (kind !== "aliases" && kind !== "triggers" && kind !== "timers" && kind !== "functions") ||
      !draft
      ? null
      : previewFor(draft),
  );
  const highlightPreview = $derived(
    kind !== "highlights" || !draft ? null : previewHighlights(draft),
  );

  $effect(() =>
    session.configuration.subscribe((next) => {
      if (source?.kind === "shared-set") {
        const revision = next.attachedConfigurationSets[source.configSetId]?.revision;
        if (revision !== source.revision) stale = true;
      }
      snapshot = next;
    }),
  );
  $effect(() => {
    if (
      kind === "aliases" ||
      kind === "triggers" ||
      kind === "timers" ||
      kind === "functions" ||
      kind === "highlights"
    ) {
      const keys = groups.map((group) => group.key);
      const currentGroups = untrack(() => selectedGroups);
      if (currentGroups === null) selectedGroups = keys;
      else {
        const wasAll = currentGroups.length === previousGroupKeys.length;
        selectedGroups = [
          ...currentGroups.filter((group) => keys.includes(group)),
          ...(wasAll ? keys.filter((group) => !currentGroups.includes(group)) : []),
        ];
      }
      previousGroupKeys = keys;
    }
    if (kind === "keyMappings" || draft || !visibleEntries.length) return;
    const first = visibleEntries[0]!;
    untrack(() => edit(first.definition, first.source));
  });

  function blankDraft(): Draft {
    return {
      id: crypto.randomUUID(),
      enabled: true,
      code: "",
      label: "",
      legacyKey: "",
      command: "",
      patternSource: "",
      description: "",
      group: "",
      ignoreCase: kind === "aliases",
      fg: "yellow",
      bg: "black",
      bold: false,
      name: "",
      script: kind === "functions" ? "send look" : "",
      trigger: "",
      pattern: "",
      isRegex: false,
      gag: false,
      durationMs: kind === "timers" ? 60000 : 1000,
      recurring: false,
      autoStart: false,
      steps:
        kind === "aliases" || kind === "triggers" || kind === "timers"
          ? [{ type: "send_command", template: "" }]
          : [],
    };
  }

  function draftFor(definition: Definition): Draft {
    const next = blankDraft();
    Object.assign(next, structuredClone(definition));
    if ("style" in definition) {
      next.fg = definition.style.fg;
      next.bg = definition.style.bg;
      next.bold = definition.style.bold;
    }
    return next;
  }

  function toDefinition(value: Draft): Definition {
    if (kind === "keyMappings") {
      return {
        id: value.id,
        enabled: value.enabled,
        code: value.code.trim(),
        label: value.label.trim(),
        legacyKey: value.legacyKey,
        command: value.command.trim(),
      };
    }
    if (kind === "highlights") {
      return {
        id: value.id,
        enabled: value.enabled,
        patternSource: value.patternSource.trim(),
        description: value.description.trim(),
        group: value.group.trim(),
        ignoreCase: value.ignoreCase,
        style: {
          fg: normalizeColorToken(value.fg) || value.fg.trim(),
          bg: normalizeColorToken(value.bg) || value.bg.trim(),
          bold: value.bold,
        },
      };
    }
    if (kind === "aliases") {
      return {
        id: value.id,
        enabled: value.enabled,
        trigger: value.trigger.trim(),
        description: value.description.trim(),
        group: value.group.trim(),
        isRegex: value.isRegex,
        ignoreCase: value.ignoreCase,
        steps: value.steps.map((step) => ({ ...step })),
      };
    }
    if (kind === "triggers") {
      return {
        id: value.id,
        enabled: value.enabled,
        pattern: value.pattern.trim(),
        description: value.description.trim(),
        group: value.group.trim(),
        isRegex: value.isRegex,
        ignoreCase: value.ignoreCase,
        gag: value.gag,
        steps: value.steps.map((step) => ({ ...step })),
      };
    }
    if (kind === "timers") {
      return {
        id: value.id,
        enabled: value.enabled,
        name: value.name.trim(),
        description: value.description.trim(),
        group: value.group.trim(),
        durationMs: value.durationMs,
        recurring: value.recurring,
        autoStart: value.autoStart,
        steps: value.steps.map((step) => ({ ...step })),
      };
    }
    return {
      id: value.id,
      enabled: value.enabled,
      name: value.name.trim(),
      description: value.description.trim(),
      group: value.group.trim(),
      script: value.script,
    };
  }

  function labelFor(definition: Definition): string {
    if ("code" in definition) return definition.label || definition.code;
    if ("patternSource" in definition) return definition.patternSource;
    if ("trigger" in definition) return definition.trigger;
    if ("pattern" in definition) return definition.pattern;
    return definition.name;
  }

  function keyDefinition(definition: Definition): KeyMappingDefinition {
    return definition as KeyMappingDefinition;
  }

  function keyLabel(label: string, code: string): string {
    const comparable = (value: string) => value.replace(/[^a-z0-9]/gi, "").toLowerCase();
    return label && comparable(label) !== comparable(code) ? label : code;
  }

  function showKeyCode(label: string, code: string): boolean {
    return Boolean(label && keyLabel(label, code) !== code);
  }

  function captureKey(event: KeyboardEvent): void {
    if (!draft || !recordKey(event, draft)) return;
    if (draft.command.trim()) save();
  }

  function recordKey(event: KeyboardEvent, value: Draft): boolean {
    if (event.key === "Tab") return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Backspace" || event.key === "Delete") {
      value.code = "";
      value.label = "";
      value.legacyKey = "";
      return true;
    }
    if (
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      ["Shift", "Control", "Alt", "Meta"].includes(event.key)
    )
      return false;
    value.code = event.code;
    value.label = event.key === " " ? "Space" : event.key;
    value.legacyKey = event.shiftKey && event.key.length === 1 ? event.key : "";
    return true;
  }

  function sourceFor(metadata: ConfigSourceMetadata): EditSource | null {
    if (metadata.kind === "builtin") return null;
    return metadata.kind === "local"
      ? { kind: "local" }
      : {
          kind: "shared-set",
          configSetId: metadata.configSetId!,
          revision: metadata.revision!,
        };
  }

  function updateDefinition(definition: Definition, metadata: ConfigSourceMetadata): void {
    const editSource = sourceFor(metadata);
    if (!editSource) return;
    const definitions = targetDefinitions(editSource);
    const identity = identityKeyForDefinition(kind, definition);
    if (
      definitions.some(
        (item) => item.id !== definition.id && identityKeyForDefinition(kind, item) === identity,
      )
    ) {
      status = `${title} must have unique identities.`;
      return;
    }
    const index = definitions.findIndex((item) => item.id === definition.id);
    if (index === -1) definitions.push(definition);
    else definitions[index] = definition;
    const result = write(definitions, editSource);
    status = result.success ? `${title} saved.` : result.message;
  }

  function selectDefinition(id: string): void {
    snapshot = session.configuration.getSnapshot();
    const entry = snapshot.effectiveConfiguration[kind].find(
      ({ definition }) => definition.id === id,
    );
    if (entry) edit(entry.definition, entry.source);
  }

  function canMove(offset: number): boolean {
    if (dirty) return false;
    if (!selectedEntry) return false;
    const editSource = sourceFor(selectedEntry.source);
    if (!editSource) return false;
    const definitions = targetDefinitions(editSource);
    const index = definitions.findIndex((item) => item.id === selectedEntry.definition.id);
    return index + offset >= 0 && index + offset < definitions.length;
  }

  function moveSelected(offset: number): void {
    if (dirty) {
      status = "Save or Cancel the current edit before reordering definitions.";
      return;
    }
    if (!selectedEntry) return;
    const editSource = sourceFor(selectedEntry.source);
    if (!editSource) return;
    const definitions = targetDefinitions(editSource);
    const index = definitions.findIndex((item) => item.id === selectedEntry.definition.id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= definitions.length) return;
    [definitions[index], definitions[target]] = [definitions[target]!, definitions[index]!];
    const result = write(definitions, editSource);
    status = result.success ? `${title} reordered.` : result.message;
    if (result.success) selectDefinition(selectedEntry.definition.id);
  }

  function duplicateSelected(): void {
    if (dirty) {
      status = "Save or Cancel the current edit before duplicating definitions.";
      return;
    }
    if (!selectedEntry) return;
    const editSource = sourceFor(selectedEntry.source);
    if (!editSource) return;
    const next = draftFor(selectedEntry.definition);
    next.id = crypto.randomUUID();
    if (kind === "aliases") next.trigger += " copy";
    else if (kind === "triggers") next.pattern += " copy";
    else if (kind === "highlights") next.patternSource += " copy";
    else next.name += " copy";
    const definition = toDefinition(next);
    const definitions = targetDefinitions(editSource);
    const index = definitions.findIndex((item) => item.id === selectedEntry.definition.id);
    definitions.splice(index + 1, 0, definition);
    const result = write(definitions, editSource);
    status = result.success ? `${title} duplicated.` : result.message;
    if (result.success) selectDefinition(definition.id);
  }

  function captureExistingKey(
    event: KeyboardEvent,
    definition: Definition,
    metadata: ConfigSourceMetadata,
  ): void {
    const next = draftFor(definition);
    if (recordKey(event, next)) updateDefinition(toDefinition(next), metadata);
  }

  function updateExistingDefinition(
    definition: Definition,
    metadata: ConfigSourceMetadata,
    patch: Partial<Draft>,
  ): void {
    const next = draftFor(definition);
    Object.assign(next, patch);
    updateDefinition(toDefinition(next), metadata);
  }

  function sourceLabel(metadata: ConfigSourceMetadata): string {
    if (metadata.kind === "local") return "Local";
    if (metadata.kind === "builtin") return "Built-in";
    const set = snapshot.attachedConfigurationSets[metadata.configSetId!];
    return `Shared: ${set?.label ?? metadata.configSetId} (revision ${metadata.revision})`;
  }

  function edit(definition: Definition, metadata: ConfigSourceMetadata): void {
    draft = draftFor(definition);
    source =
      metadata.kind === "shared-set"
        ? {
            kind: "shared-set",
            configSetId: metadata.configSetId!,
            revision: metadata.revision!,
          }
        : { kind: "local" };
    stale = false;
    original = JSON.stringify(toDefinition(draft));
    status = "";
    timerResult = "";
    queueMicrotask(() =>
      editor?.querySelector<HTMLInputElement>("input:not([type=checkbox])")?.focus(),
    );
  }

  function add(): void {
    if (dirty) {
      status = "Save or Cancel the current edit before creating another definition.";
      return;
    }
    draft = blankDraft();
    source = { kind: "local" };
    stale = false;
    original = JSON.stringify(toDefinition(draft));
    status = "";
    timerResult = "";
    queueMicrotask(() => {
      if (kind === "keyMappings") keyCapture?.focus();
      else editor?.querySelector<HTMLInputElement>("input:not([type=checkbox])")?.focus();
    });
  }

  function cancel(): void {
    draft = null;
    source = null;
    stale = false;
    original = null;
  }

  function targetDefinitions(editSource: EditSource): Definition[] {
    if (editSource.kind === "local") {
      return structuredClone(snapshot.localDefinitions[kind]);
    }
    return structuredClone(
      snapshot.attachedConfigurationSets[editSource.configSetId]?.definitions ?? [],
    );
  }

  function write(definitions: Definition[], editSource: EditSource) {
    if (editSource.kind === "local") {
      return session.configuration.replaceLocalDefinitions(kind, definitions as never);
    }
    return session.configuration.publishConfigurationSet({
      configSetId: editSource.configSetId,
      expectedRevision: editSource.revision,
      definitions: definitions as never,
    });
  }

  function save(): void {
    if (!draft || !source) return;
    const invalid = editor?.querySelector<HTMLInputElement | HTMLTextAreaElement>(":invalid");
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    if (kind === "functions" && functionWarnings.length) {
      status = "Correct function warnings before saving.";
      return;
    }
    if (kind === "highlights" && highlightWarnings.length) {
      status = "Correct highlight warnings before saving.";
      return;
    }

    const definition = toDefinition(draft);
    const definitions = targetDefinitions(source);
    const identity = identityKeyForDefinition(kind, definition);
    if (
      definitions.some(
        (item) => item.id !== definition.id && identityKeyForDefinition(kind, item) === identity,
      )
    ) {
      status = `${title} must have unique identities.`;
      return;
    }

    const index = definitions.findIndex((item) => item.id === definition.id);
    if (index === -1) definitions.push(definition);
    else definitions[index] = definition;
    const result = write(definitions, source);
    if (!result.success) {
      status = result.message;
      if ("code" in result && result.code === "stale-revision") stale = true;
      return;
    }
    status = `${title} saved.`;
    original = JSON.stringify(definition);
    if (kind === "keyMappings") cancel();
    else selectDefinition(definition.id);
  }

  function requestRemove(definition: Definition, metadata: ConfigSourceMetadata): void {
    if (dirty) {
      status = "Save or Cancel the current edit before deleting definitions.";
      return;
    }
    pendingDelete = { definition, metadata };
    queueMicrotask(() => deleteCancel?.focus());
  }

  function openModal(node: HTMLDialogElement): { destroy(): void } {
    node.showModal();
    return {
      destroy(): void {
        if (node.open) node.close();
      },
    };
  }

  function remove(): void {
    if (!pendingDelete) return;
    const { definition, metadata } = pendingDelete;
    pendingDelete = null;
    const editSource = sourceFor(metadata);
    if (!editSource) return;
    const result = write(
      targetDefinitions(editSource).filter((item) => item.id !== definition.id),
      editSource,
    );
    status = result.success ? `${title} entry deleted.` : result.message;
    if (result.success && draft?.id === definition.id) {
      cancel();
      if (kind !== "keyMappings") {
        snapshot = session.configuration.getSnapshot();
        const next = snapshot.effectiveConfiguration[kind][0];
        if (next) edit(next.definition, next.source);
      }
    }
  }

  function reload(): void {
    if (!draft || source?.kind !== "shared-set") return;
    snapshot = session.configuration.getSnapshot();
    const entry = snapshot.effectiveConfiguration[kind].find(
      ({ definition }) => definition.id === draft?.id,
    );
    if (entry) edit(entry.definition, entry.source);
    else cancel();
  }

  function entriesFor(targetKind: ConfigKind, field: "trigger" | "pattern" | "name") {
    return snapshot.effectiveConfiguration[targetKind].map(({ definition }) => ({
      id: definition.id,
      label: String((definition as unknown as Record<string, unknown>)[field] || definition.id),
    }));
  }

  function formatTimerDuration(durationMs: number): string {
    const seconds = Math.round(durationMs / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m${seconds % 60 ? ` ${seconds % 60}s` : ""}`;
  }

  function previewFor(value: Draft) {
    const aliases = snapshot.effectiveConfiguration.aliases.map(({ definition }) =>
      kind === "aliases" && definition.id === value.id
        ? toDefinition(value)
        : structuredClone(definition),
    );
    const triggers = snapshot.effectiveConfiguration.triggers.map(({ definition }) =>
      kind === "triggers" && definition.id === value.id
        ? toDefinition(value)
        : structuredClone(definition),
    );
    const functions = snapshot.effectiveConfiguration.functions.map(({ definition }) =>
      kind === "functions" && definition.id === value.id
        ? toDefinition(value)
        : structuredClone(definition),
    );
    const catalogs = {
      aliases:
        kind === "aliases" && aliases.some((definition) => definition.id === value.id)
          ? aliases
          : kind === "aliases"
            ? [...aliases, toDefinition(value)]
            : aliases,
      triggers:
        kind === "triggers" && triggers.some((definition) => definition.id === value.id)
          ? triggers
          : kind === "triggers"
            ? [...triggers, toDefinition(value)]
            : triggers,
      timers: snapshot.effectiveConfiguration.timers.map(({ definition }) =>
        structuredClone(definition),
      ),
      functions:
        kind === "functions" && functions.some((definition) => definition.id === value.id)
          ? functions
          : kind === "functions"
            ? [...functions, toDefinition(value)]
            : functions,
      sounds: soundCatalog,
      variables: session.terminal.automation.getAutomationVariables(),
      sample: previewInput,
    };
    if (kind === "aliases") return previewAliasInput(catalogs);
    if (kind === "triggers") return previewTriggerOutput(catalogs);
    if (kind === "functions")
      return previewFunction({
        ...catalogs,
        definition: toDefinition(value) as FunctionDefinition,
      });
    const timerDefinition = toDefinition(value) as TimerDefinition;
    const timers = catalogs.timers.map((definition) =>
      definition.id === value.id ? timerDefinition : definition,
    );
    return previewTimer({ ...catalogs, timers, timer: timerDefinition });
  }

  function warningsForHighlight(value: Draft): string[] {
    const warnings: string[] = [];
    const pattern = value.patternSource.trim();
    if (!pattern) warnings.push("Pattern is required.");
    else {
      try {
        new RegExp(pattern, value.ignoreCase ? "i" : "");
      } catch {
        warnings.push("Invalid regular expression.");
      }
      if (
        source &&
        targetDefinitions(source).some(
          (definition) =>
            definition.id !== value.id &&
            "patternSource" in definition &&
            identityKeyForDefinition("highlights", definition as HighlightDefinition) ===
              identityKeyForDefinition("highlights", toDefinition(value) as HighlightDefinition),
        )
      )
        warnings.push("Pattern duplicates an existing highlight rule in this owner.");
    }
    if (!isValidColorToken(value.fg)) warnings.push("Foreground color is invalid.");
    if (!isValidColorToken(value.bg)) warnings.push("Background color is invalid.");
    return warnings;
  }

  function previewHighlights(value: Draft) {
    const definition = toDefinition(value) as HighlightDefinition;
    const rules = snapshot.effectiveConfiguration.highlights.map(({ definition: current }) =>
      current.id === definition.id ? definition : structuredClone(current),
    );
    if (!rules.some((rule) => rule.id === definition.id)) rules.push(definition);
    const fragments = applyHighlightsToText(previewInput, rules);
    return {
      fragments,
      summary: fragments.some(
        (fragment: { style: { bold?: boolean; fg?: unknown; bg?: unknown } }) =>
          fragment.style.bold || fragment.style.fg || fragment.style.bg,
      )
        ? "styled"
        : "no match",
    };
  }

  function renderHighlightPreview(
    node: HTMLElement,
    fragments: Array<{ text: string; style: Record<string, unknown> }>,
  ) {
    const render = (next: Array<{ text: string; style: Record<string, unknown> }>) => {
      node.replaceChildren();
      for (const fragment of next) {
        const child = styleToElement(fragment.text, fragment.style);
        if (child) node.appendChild(child);
      }
    };
    render(fragments);
    return { update: render };
  }

  function warningsForAutomation(value: Draft): string[] {
    const warnings: string[] = [];
    if (kind !== "timers" && !value.description.trim())
      warnings.push(`Name is recommended so this ${noun} is easy to find.`);
    const pattern = kind === "triggers" ? value.pattern : value.trigger;
    if (kind === "timers") {
      if (!value.name.trim()) warnings.push("Timer name needs content.");
      const identity = identityKeyForDefinition("timers", toDefinition(value) as TimerDefinition);
      if (
        value.name.trim() &&
        source &&
        targetDefinitions(source).some(
          (definition) =>
            definition.id !== value.id &&
            "name" in definition &&
            identityKeyForDefinition("timers", definition as TimerDefinition) === identity,
        )
      )
        warnings.push("Timer name duplicates an existing timer.");
      if (
        !Number.isInteger(value.durationMs / 1000) ||
        value.durationMs < 1000 ||
        value.durationMs > 86400000
      )
        warnings.push("Timer duration needs whole seconds from 1 to 86400.");
      if (!value.steps.length) warnings.push("Timer needs at least one step.");
    } else if (!pattern.trim()) warnings.push("Pattern needs content.");
    if (value.isRegex)
      try {
        new RegExp(pattern, value.ignoreCase ? "i" : "");
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : "Invalid regular expression.");
      }
    for (const [index, step] of value.steps.entries()) {
      if ((step.type === "send_command" || step.type === "show_message") && !step.template.trim())
        warnings.push(`Step ${index + 1} needs content.`);
      if (step.type === "set_variable" && (!step.name.trim() || !step.template.trim()))
        warnings.push(`Step ${index + 1} needs a variable name and content.`);
      if (
        step.type === "wait" &&
        (!Number.isFinite(step.seconds) || step.seconds < 0 || step.seconds > 86400)
      )
        warnings.push(`Step ${index + 1} needs a wait from 0 to 86400 seconds.`);
      if (step.type === "run_alias" && !step.template.trim())
        warnings.push(`Step ${index + 1} needs an alias command.`);
      if (
        step.type === "play_sound" &&
        (!step.category.trim() ||
          !step.sound.trim() ||
          !isKnownSound(step.category, step.sound) ||
          !Number.isFinite(step.volume) ||
          step.volume < 0 ||
          step.volume > 1)
      )
        warnings.push(`Step ${index + 1} needs a sound and volume from 0 to 1.`);
      if (
        (step.type === "set_alias_enabled" ||
          step.type === "set_trigger_enabled" ||
          step.type === "set_timer_enabled" ||
          step.type === "control_timer" ||
          step.type === "call_function") &&
        !step.targetId &&
        !step.target.trim()
      )
        warnings.push(`Step ${index + 1} needs a target.`);
      if (
        (step.type === "set_alias_enabled" ||
          step.type === "set_trigger_enabled" ||
          step.type === "set_timer_enabled" ||
          step.type === "control_timer" ||
          step.type === "call_function") &&
        (step.targetId || step.target.trim())
      ) {
        const targets =
          step.type === "set_alias_enabled"
            ? targetCatalogs.aliases
            : step.type === "set_trigger_enabled"
              ? targetCatalogs.triggers
              : step.type === "set_timer_enabled" || step.type === "control_timer"
                ? targetCatalogs.timers
                : targetCatalogs.functions;
        if (
          !targets.some(
            (target) =>
              target.id === step.targetId ||
              target.label.trim().toLowerCase() === step.target.trim().toLowerCase(),
          )
        )
          warnings.push(`Step ${index + 1} target was not found.`);
      }
      if (step.type === "script")
        warnings.push(
          ...scriptCore
            .getAutomationScriptDiagnostics(step.script)
            .map((message: string) => `Step ${index + 1}: ${message}`),
        );
    }
    return warnings;
  }

  function warningsForFunction(value: Draft): string[] {
    const warnings: string[] = [];
    const name = value.name.trim();
    if (!name) warnings.push("Function name needs content.");
    else if (!/^[a-z_][a-z0-9_-]*$/.test(name))
      warnings.push(
        "Function names must start with a letter or underscore and use only lowercase letters, numbers, underscores, and dashes.",
      );
    else if (
      source &&
      targetDefinitions(source).some(
        (definition) =>
          definition.id !== value.id &&
          "name" in definition &&
          identityKeyForDefinition("functions", definition as FunctionDefinition) ===
            identityKeyForDefinition("functions", toDefinition(value) as FunctionDefinition),
      )
    )
      warnings.push("Function name duplicates an existing function.");
    warnings.push(...scriptCore.getAutomationScriptDiagnostics(value.script));
    return warnings;
  }

  type ScriptNode = {
    type: string;
    steps?: ScriptNode[];
    branches?: Array<{ steps: ScriptNode[] }>;
    elseSteps?: ScriptNode[];
  };

  function functionScriptSummary(definition: FunctionDefinition): string {
    const parsed = scriptCore.parseAutomationScript(definition.script) as {
      ast: ScriptNode[];
      diagnostics: string[];
    };
    if (parsed.diagnostics.length)
      return `${parsed.diagnostics.length} script issue${parsed.diagnostics.length === 1 ? "" : "s"}`;
    const count = (nodes: ScriptNode[]): number =>
      nodes.reduce(
        (total, node) =>
          total +
          (node.type === "action" || node.type === "break" || node.type === "continue"
            ? 1
            : node.type === "if"
              ? (node.branches?.reduce((sum, branch) => sum + count(branch.steps), 0) ?? 0) +
                count(node.elseSteps ?? [])
              : node.type === "while"
                ? count(node.steps ?? [])
                : 0),
        0,
      );
    const actions = count(parsed.ast);
    return `${actions} action${actions === 1 ? "" : "s"}`;
  }

  function timerControlsAvailable(): boolean {
    return Boolean(
      kind === "timers" && draft && selectedEntry?.definition.id === draft.id && !dirty,
    );
  }

  function controlTimer(mode: TimerControlMode): void {
    if (!timerControlsAvailable() || !draft) {
      timerResult = "Save this timer before using controls.";
      return;
    }
    timerResult = session.terminal.controlTimer(draft.id, mode).message;
  }

  function requestEdit(definition: Definition, metadata: ConfigSourceMetadata): void {
    if (dirty) {
      status = "Save or Cancel the current edit before selecting another definition.";
      return;
    }
    edit(definition, metadata);
  }

  export function editById(id: string): void {
    if (kind !== "aliases") return;
    snapshot = session.configuration.getSnapshot();
    const entry = snapshot.effectiveConfiguration.aliases.find(
      ({ definition }) => definition.id === id,
    );
    if (entry) requestEdit(entry.definition, entry.source);
  }

  function moveListFocus(event: KeyboardEvent, index: number): void {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const target = visibleEntries[index + (event.key === "ArrowUp" ? -1 : 1)];
    if (!target) return;
    requestEdit(target.definition, target.source);
    queueMicrotask(() =>
      editor
        ?.closest("fieldset")
        ?.querySelector<HTMLButtonElement>(`[aria-label="Edit ${labelFor(target.definition)}"]`)
        ?.focus(),
    );
  }

  function togglePreview(): void {
    previewCollapsed = !previewCollapsed;
    const current = (() => {
      try {
        return JSON.parse(localStorage.getItem("darkwind-settings-automation-ui") ?? "{}");
      } catch {
        return {};
      }
    })();
    localStorage.setItem(
      "darkwind-settings-automation-ui",
      JSON.stringify({
        ...current,
        [kind === "triggers"
          ? "triggerPreviewCollapsed"
          : kind === "timers"
            ? "timerPreviewCollapsed"
            : kind === "functions"
              ? "functionPreviewCollapsed"
              : kind === "highlights"
                ? "highlightPreviewCollapsed"
                : "aliasPreviewCollapsed"]: previewCollapsed,
      }),
    );
  }
</script>

<fieldset class:automation-editor={kind !== "keyMappings"}>
  <legend>{title}</legend>
  {#if kind === "keyMappings"}
    <p class="helper-text">
      Press a key in the Key field to capture it. Top-row numbers and numpad numbers are different
      keys.
    </p>
    <div class="mapping-list">
      {#each entries as entry (entry.definition.id)}
        {@const mapping = keyDefinition(entry.definition)}
        <div class="mapping-row" title={sourceLabel(entry.source)}>
          <button
            aria-label={`Key for ${labelFor(mapping)}`}
            class="key-input"
            type="button"
            onkeydown={(event) => captureExistingKey(event, mapping, entry.source)}
          >
            <span>{keyLabel(mapping.label, mapping.code)}</span>
            {#if showKeyCode(mapping.label, mapping.code)}<small>({mapping.code})</small>{/if}
          </button>
          <input
            aria-label={`Command for ${labelFor(mapping)}`}
            value={mapping.command}
            onchange={(event) =>
              updateExistingDefinition(mapping, entry.source, {
                command: event.currentTarget.value,
              })}
          />
          <input
            aria-label={`Enable ${labelFor(mapping)}`}
            type="checkbox"
            checked={mapping.enabled}
            disabled={entry.source.kind === "builtin"}
            onchange={(event) =>
              updateExistingDefinition(mapping, entry.source, {
                enabled: event.currentTarget.checked,
              })}
          />
          <button
            type="button"
            disabled={entry.source.kind === "builtin"}
            onclick={() => requestRemove(mapping, entry.source)}>Remove</button
          >
        </div>
      {/each}
      {#if draft}
        <div class="mapping-row new-mapping">
          <button
            bind:this={keyCapture}
            aria-label="Key for new mapping"
            class="key-input"
            type="button"
            onkeydown={captureKey}
          >
            <span>{draft.code ? keyLabel(draft.label, draft.code) : "Press a key"}</span>
            {#if showKeyCode(draft.label, draft.code)}<small>({draft.code})</small>{/if}
          </button>
          <input
            aria-label="Command for new mapping"
            bind:value={draft.command}
            placeholder="Command to send"
            onchange={() => draft?.code && save()}
          />
          <input aria-label="Enable new mapping" type="checkbox" bind:checked={draft.enabled} />
          <button type="button" onclick={cancel}>Remove</button>
        </div>
      {/if}
    </div>
    <div class="inline-actions">
      <button type="button" disabled={Boolean(draft)} onclick={add}>Add mapping</button>
    </div>
  {:else}
    <div class="automation-toolbar">
      <input
        aria-label={`Search ${title}`}
        bind:value={search}
        placeholder={`Search ${title.toLowerCase()}`}
      />
      <button type="button" onclick={add}>New {noun}</button>
    </div>
    {#if (kind === "aliases" || kind === "triggers" || kind === "timers" || kind === "functions" || kind === "highlights") && groups.length}
      <div
        class="group-filters"
        aria-label={`${noun.charAt(0).toUpperCase()}${noun.slice(1)} groups`}
      >
        {#if groups.length >= 3}
          <div class="group-filter-actions">
            <button
              type="button"
              onclick={() => (selectedGroups = groups.map((group) => group.key))}>Select all</button
            >
            <button type="button" onclick={() => (selectedGroups = [])}>Unselect all</button>
          </div>
        {/if}
        <div class="group-chips">
          {#each groups as group (group)}
            <label class="group-chip" class:selected={selectedGroups?.includes(group.key) ?? false}
              ><input
                type="checkbox"
                checked={selectedGroups?.includes(group.key) ?? false}
                onchange={(event) =>
                  (selectedGroups = event.currentTarget.checked
                    ? [...(selectedGroups ?? []), group.key]
                    : (selectedGroups ?? []).filter((value) => value !== group.key))}
              />
              {group.label} ({group.count})</label
            >
          {/each}
        </div>
      </div>
    {/if}
    <div class="automation-layout">
      <div class="automation-list-pane">
        <div class="automation-list" aria-label={title}>
          {#each visibleEntries as entry, index (entry.definition.id)}
            <div
              class:active={selectedEntry?.definition.id === entry.definition.id}
              class="list-row"
            >
              <button
                class="list-select"
                type="button"
                aria-label={`Edit ${labelFor(entry.definition)}`}
                onclick={() => requestEdit(entry.definition, entry.source)}
                onkeydown={(event) => moveListFocus(event, index)}
              >
                <strong
                  >{(kind === "aliases" ||
                    kind === "triggers" ||
                    kind === "functions" ||
                    kind === "highlights") &&
                  "description" in entry.definition
                    ? entry.definition.description.trim() || labelFor(entry.definition)
                    : labelFor(entry.definition)}</strong
                >
                {#if kind === "highlights" && "patternSource" in entry.definition}
                  <small>{entry.definition.patternSource}</small>
                  {#if entry.definition.group}<small>{entry.definition.group}</small>{/if}
                  <small>{formatRuleStyle(entry.definition)}</small>
                  {#if entry.definition.ignoreCase}<small>Ignore case</small>{/if}
                {/if}
                {#if kind === "aliases" || kind === "triggers"}
                  <small
                    >{"trigger" in entry.definition
                      ? entry.definition.trigger
                      : "pattern" in entry.definition
                        ? entry.definition.pattern
                        : ""}
                    {"isRegex" in entry.definition && entry.definition.isRegex
                      ? "(regex)"
                      : ""}{"gag" in entry.definition && entry.definition.gag
                      ? " (gag)"
                      : ""}</small
                  >
                  {#if "group" in entry.definition && entry.definition.group}<small
                      >{entry.definition.group}</small
                    >{/if}
                  {#if kind === "triggers" && "steps" in entry.definition}<small
                      >{entry.definition.steps[0]?.type?.replaceAll("_", " ") ??
                        "No actions"}</small
                    >{/if}
                {/if}
                {#if kind === "timers" && "durationMs" in entry.definition}
                  <small>{entry.definition.group || "Ungrouped"}</small>
                  <small
                    >{formatTimerDuration(entry.definition.durationMs)}, {entry.definition.recurring
                      ? "recurring"
                      : "once"}{entry.definition.autoStart && entry.definition.enabled
                      ? ", auto-start"
                      : ""}, {entry.definition.steps.length} step{entry.definition.steps.length ===
                    1
                      ? ""
                      : "s"}</small
                  >
                {/if}
                {#if kind === "functions" && "script" in entry.definition}
                  <small>{entry.definition.name}</small>
                  <small>{entry.definition.group || "Ungrouped"}</small>
                  <small>{functionScriptSummary(entry.definition)}</small>
                {/if}
                <span>{sourceLabel(entry.source)}</span>
              </button>
              <input
                aria-label={`Enable ${labelFor(entry.definition)}`}
                type="checkbox"
                checked={entry.definition.enabled}
                disabled={entry.source.kind === "builtin"}
                onchange={(event) =>
                  updateExistingDefinition(entry.definition, entry.source, {
                    enabled: event.currentTarget.checked,
                  })}
              />
            </div>
          {:else}
            <p>
              {entries.length
                ? `No ${title.toLowerCase()} match.`
                : `No ${title.toLowerCase()} configured.`}
            </p>
          {/each}
        </div>
        <div class="list-actions">
          <button type="button" disabled={!canMove(-1)} onclick={() => moveSelected(-1)}>Up</button>
          <button type="button" disabled={!canMove(1)} onclick={() => moveSelected(1)}>Down</button>
          <button
            type="button"
            disabled={!selectedEntry || selectedEntry.source.kind === "builtin"}
            onclick={duplicateSelected}>Duplicate</button
          >
          <button
            type="button"
            disabled={!selectedEntry || selectedEntry.source.kind === "builtin"}
            aria-label={selectedEntry
              ? `Delete ${labelFor(selectedEntry.definition)}`
              : `Delete ${noun}`}
            onclick={() =>
              selectedEntry && requestRemove(selectedEntry.definition, selectedEntry.source)}
            >Delete</button
          >
        </div>
      </div>
      <div class="automation-detail">
        {#if draft}
          <section bind:this={editor} class="editor" aria-label={`Edit ${title.toLowerCase()}`}>
            <label><input type="checkbox" bind:checked={draft.enabled} /> Enabled</label>
            {#if kind === "highlights"}
              <label
                >Pattern (regular expression) <input
                  aria-label="Pattern"
                  bind:value={draft.patternSource}
                  required
                /></label
              >
              <label>Description <input bind:value={draft.description} /></label>
              <label>Group <input bind:value={draft.group} /></label>
              <label><input type="checkbox" bind:checked={draft.ignoreCase} /> Ignore case</label>
              <label
                >Foreground
                <span class="color-input-row"
                  ><input
                    aria-label="Foreground"
                    bind:value={draft.fg}
                    list="highlight-colors"
                    placeholder="yellow, bright-cyan, ansi-214, #38bdf8"
                    class:invalid-color={Boolean(draft.fg.trim()) && !isValidColorToken(draft.fg)}
                    onblur={() => {
                      if (draft)
                        draft.fg = normalizeColorToken(draft.fg) || draft.fg.trim().toLowerCase();
                    }}
                    required
                  />
                  <span
                    class="color-swatch"
                    style:background-color={colorTokenToCss(draft.fg) || "transparent"}
                    title={normalizeColorToken(draft.fg) || "Invalid color"}
                  ></span></span
                ></label
              >
              <label
                >Background
                <span class="color-input-row"
                  ><input
                    aria-label="Background"
                    bind:value={draft.bg}
                    list="highlight-colors"
                    placeholder="yellow, bright-cyan, ansi-214, #38bdf8"
                    class:invalid-color={Boolean(draft.bg.trim()) && !isValidColorToken(draft.bg)}
                    onblur={() => {
                      if (draft)
                        draft.bg = normalizeColorToken(draft.bg) || draft.bg.trim().toLowerCase();
                    }}
                    required
                  />
                  <span
                    class="color-swatch"
                    style:background-color={colorTokenToCss(draft.bg) || "transparent"}
                    title={normalizeColorToken(draft.bg) || "Invalid color"}
                  ></span></span
                ></label
              >
              <datalist id="highlight-colors">
                {#each getColorSuggestions() as color (color)}<option value={color}></option>{/each}
              </datalist>
              <label><input type="checkbox" bind:checked={draft.bold} /> Bold</label>
              {#if highlightWarnings.length}
                <ul class="warnings" aria-live="polite">
                  {#each highlightWarnings as warning (warning)}<li>{warning}</li>{/each}
                </ul>
              {/if}
              <section class="alias-preview">
                <button type="button" aria-expanded={!previewCollapsed} onclick={togglePreview}
                  >Test output</button
                >
                {#if !previewCollapsed}
                  <label
                    >Test output <textarea
                      aria-label="Test output"
                      bind:value={previewInput}
                      placeholder="Example: danger"></textarea></label
                  >
                  <p>{highlightPreview?.summary}</p>
                  <output
                    aria-label="Highlight test output"
                    class="highlight-preview-output"
                    use:renderHighlightPreview={highlightPreview?.fragments ?? []}
                  ></output>
                {/if}
              </section>
            {:else if kind === "functions"}
              <label
                >Name <input
                  bind:value={draft.name}
                  pattern="[a-z_][a-z0-9_-]*"
                  oninput={(event) => {
                    if (draft) draft.name = event.currentTarget.value.trim().toLowerCase();
                  }}
                  required
                /></label
              >
              <label>Description <input bind:value={draft.description} /></label>
              <label>Group <input bind:value={draft.group} /></label>
              <label>Script <textarea bind:value={draft.script} required></textarea></label>
              {#if functionWarnings.length}
                <ul class="warnings" aria-live="polite">
                  {#each functionWarnings as warning (warning)}<li>{warning}</li>{/each}
                </ul>
              {/if}
              <details>
                <summary>Function script syntax</summary>
                <p>
                  Functions receive positional arguments as %1-%9 and all arguments as %0. Use
                  variables like $name; if/elseif/else/while/end; break and continue; send, show,
                  set, wait, run_alias, call, play_sound, and alias, trigger, and timer controls.
                </p>
              </details>
              <section class="alias-preview">
                <button type="button" aria-expanded={!previewCollapsed} onclick={togglePreview}
                  >Function preview</button
                >
                {#if !previewCollapsed}
                  <label
                    >Sample arguments <input
                      bind:value={previewInput}
                      placeholder="Example: orc shield"
                    /></label
                  >
                  <p>{preview?.summary}</p>
                  {#each preview?.rows ?? [] as row, index (`${row.label}-${index}`)}<p>
                      {row.label}: {row.text}{#if row.warnings.length}
                        - {row.warnings.join(" ")}{/if}
                    </p>{/each}
                {/if}
              </section>
            {:else}
              {#if kind === "aliases"}
                <label>Trigger <input bind:value={draft.trigger} required /></label>
              {:else if kind === "triggers"}
                <label>Pattern <input bind:value={draft.pattern} required /></label>
                <label><input type="checkbox" bind:checked={draft.gag} /> Gag matching output</label
                >
              {:else}
                <label>Name <input bind:value={draft.name} required /></label>
                <label
                  >Duration (seconds) <input
                    type="number"
                    min="1"
                    max="86400"
                    step="1"
                    value={draft.durationMs / 1000}
                    oninput={(event) => {
                      if (draft) draft.durationMs = Number(event.currentTarget.value) * 1000;
                    }}
                    required
                  /></label
                >
                <label><input type="checkbox" bind:checked={draft.recurring} /> Recurring</label>
                <label
                  ><input type="checkbox" bind:checked={draft.autoStart} /> Start automatically</label
                >
              {/if}
              <label
                >{kind === "aliases" || kind === "triggers" ? "Name" : "Description"}
                <input bind:value={draft.description} /></label
              >
              <label>Group <input bind:value={draft.group} /></label>
              {#if kind !== "timers"}
                <label
                  ><input type="checkbox" bind:checked={draft.isRegex} /> Regular expression</label
                >
                {#if kind !== "aliases" || draft.isRegex}<label
                    ><input type="checkbox" bind:checked={draft.ignoreCase} /> Ignore case</label
                  >{/if}
              {/if}
              {#if automationWarnings.length}
                <ul class="warnings" aria-live="polite">
                  {#each automationWarnings as warning (warning)}<li>{warning}</li>{/each}
                </ul>
              {/if}
              <AutomationStepsEditor
                bind:steps={draft.steps}
                {...targetCatalogs}
                sounds={soundCatalog}
                triggerMode={kind === "triggers"}
                timerMode={kind === "timers"}
                testSound={(category, sound, volume) =>
                  session.audio.playLocal(category, sound, volume)}
              />
              {#if kind === "timers"}
                <div class="timer-controls">
                  {#if timerControlsAvailable()}
                    <button type="button" onclick={() => controlTimer("start")}>Start</button>
                    <button type="button" onclick={() => controlTimer("stop")}>Stop</button>
                    <button type="button" onclick={() => controlTimer("reset")}>Reset</button>
                    <button type="button" onclick={() => controlTimer("run")}>Run now</button>
                  {:else}
                    <p>Save this timer before using controls.</p>
                  {/if}
                  <p aria-live="polite">{timerResult}</p>
                </div>
              {/if}
              {#if kind === "aliases" || kind === "triggers" || kind === "timers"}
                <section class="alias-preview">
                  <button type="button" aria-expanded={!previewCollapsed} onclick={togglePreview}
                    >{kind === "timers"
                      ? "Timer preview"
                      : `Test ${kind === "aliases" ? "input" : "output"}`}</button
                  >
                  {#if !previewCollapsed}
                    {#if kind !== "timers"}<label
                        >Test {kind === "aliases" ? "input" : "output"}
                        {#if kind === "triggers"}<textarea
                            bind:value={previewInput}
                            placeholder="Example: danger"></textarea>{:else}<input
                            bind:value={previewInput}
                            placeholder="Example: gi sword"
                          />{/if}</label
                      >{/if}
                    {#if kind === "timers" || previewInput.trim()}
                      {#if kind === "timers"}<p>
                          {preview?.schedule?.label}: {formatTimerDuration(
                            preview?.schedule?.durationMs ?? 0,
                          )}. {preview?.schedule?.start}
                        </p>{/if}
                      {#if kind === "aliases" && preview?.match}<p>
                          Matches: {preview.match.trigger}
                        </p>{/if}
                      {#if kind === "triggers" && preview?.matches?.length}<p>
                          Matches: {preview.matches
                            .map((match: { pattern: string }) => match.pattern)
                            .join(", ")}
                        </p>{/if}
                      {#if kind === "triggers" && preview?.matches?.length}<p>
                          Gag: {preview.gag ? "yes" : "no"}
                        </p>{/if}
                      {#each preview?.rows ?? [] as row, index (`${row.label}-${index}`)}<p>
                          {row.label}: {row.text}{#if row.warnings.length}
                            - {row.warnings.join(" ")}{/if}
                        </p>{/each}
                      {#each preview?.warnings ?? [] as warning (warning)}<p class="error">
                          {warning}
                        </p>{/each}
                    {/if}
                  {/if}
                </section>
              {/if}
            {/if}
            {#if stale}
              <p class="error">This shared definition changed while you were editing it.</p>
              <button type="button" onclick={reload}>Reload shared definition</button>
            {/if}
            <div class="actions">
              <button type="button" onclick={cancel}>Cancel edit</button>
              <button type="button" onclick={save}>Save {title.toLowerCase()}</button>
            </div>
          </section>
        {:else}
          <p>Select {noun === "alias" ? "an" : "a"} {noun} to edit, or create a new one.</p>
        {/if}
      </div>
    </div>
  {/if}
  {#if pendingDelete}
    <dialog
      use:openModal
      class="definition-modal"
      aria-label={`Delete ${labelFor(pendingDelete.definition)}`}
      oncancel={(event) => {
        event.preventDefault();
        pendingDelete = null;
      }}
    >
      <section class="delete-confirmation">
        <h3>Delete {labelFor(pendingDelete.definition)}?</h3>
        <p>This change is not permanent until you apply Settings.</p>
        <div class="actions">
          <button bind:this={deleteCancel} type="button" onclick={() => (pendingDelete = null)}
            >Keep it</button
          >
          <button type="button" onclick={remove}>Delete</button>
        </div>
      </section>
    </dialog>
  {/if}
  <p class:error={stale} aria-live="polite">{status}</p>
</fieldset>

<style>
  fieldset {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  .helper-text,
  p {
    margin: 0;
  }

  .mapping-list {
    display: grid;
    gap: 0.5rem;
  }

  .mapping-row {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr) auto auto;
    gap: 0.5rem;
    align-items: center;
  }

  .key-input {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    text-align: center;
    cursor: pointer;
  }

  .key-input small {
    color: var(--df-muted, #8b949e);
    font-size: 0.72rem;
    white-space: nowrap;
  }

  .inline-actions,
  .automation-toolbar,
  .list-actions,
  .actions,
  .timer-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .warnings,
  .alias-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .warnings {
    display: block;
    color: var(--df-warning, #d29922);
  }

  .alias-preview {
    display: grid;
  }

  .color-input-row {
    display: flex;
    gap: 0.5rem;
    min-width: 0;
  }

  .color-input-row input {
    flex: 1;
  }

  .color-swatch {
    width: 2.75rem;
    min-width: 2.75rem;
    min-height: 2.75rem;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 0.25rem;
  }

  .invalid-color {
    border-color: var(--df-err, #ff6b6b);
  }

  .highlight-preview-output {
    display: block;
    min-height: 2.75rem;
    padding: 0.5rem;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 0.25rem;
    white-space: pre-wrap;
  }

  .group-filters,
  .group-filter-actions,
  .group-chips {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
  }

  .group-filters,
  .group-chips {
    min-width: 0;
  }

  .group-filter-actions {
    flex: none;
  }

  .group-chips {
    flex: 1;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .group-filters label.group-chip {
    position: relative;
    display: inline-flex;
    min-height: 1.5rem;
    padding: 0.05rem 0.5rem;
    border: 1px solid var(--df-btn-bg, #238636);
    border-radius: 999px;
    background: transparent;
    font-size: 0.75rem;
    line-height: 1.2;
    cursor: pointer;
    user-select: none;
  }

  .group-filters label.group-chip.selected {
    background: var(--df-btn-bg, #238636);
    color: var(--df-btn-fg, white);
  }

  .group-filters .group-chip input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    min-height: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .group-filters label.group-chip:focus-within {
    outline: 2px solid var(--df-btn-bg, #238636);
    outline-offset: 2px;
  }

  .automation-toolbar input {
    flex: 1;
  }

  .automation-layout {
    display: flex;
    gap: 0.75rem;
    min-height: 320px;
  }

  .automation-list-pane {
    display: flex;
    flex: 0 1 230px;
    min-width: 150px;
    min-height: 0;
    flex-direction: column;
    gap: 0.5rem;
  }

  .automation-list {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    flex-direction: column;
    gap: 0.375rem;
    padding-right: 0.25rem;
  }

  .list-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.375rem;
    align-items: center;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 0.35rem;
    background: var(--df-bg, #0d1117);
  }

  .list-row.active {
    border-color: var(--df-accent, #58a6ff);
    background: rgb(88 166 255 / 12%);
  }

  .list-select {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
    padding: 0.5rem;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
  }

  .list-select strong,
  .list-select span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .list-select span {
    color: var(--df-muted, #8b949e);
    font-size: 0.75rem;
  }

  .list-row > input {
    margin-right: 0.5rem;
  }

  .automation-detail {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
  }

  .editor {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.75rem;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 0.35rem;
  }

  .definition-modal {
    max-width: none;
    max-height: none;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
  }

  .definition-modal::backdrop {
    background: var(--df-overlay, rgb(0 0 0 / 60%));
  }

  .delete-confirmation {
    box-sizing: border-box;
    width: min(34rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    overflow: auto;
    background: var(--df-panel, #161b22);
  }

  .delete-confirmation {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 0.35rem;
  }

  .delete-confirmation h3 {
    margin: 0;
  }

  label {
    display: grid;
    gap: 0.25rem;
  }

  label:has(input[type="checkbox"]) {
    grid-template-columns: auto 1fr;
    align-items: center;
  }

  input,
  textarea,
  button {
    box-sizing: border-box;
    min-height: 2.75rem;
    min-width: 0;
  }

  textarea {
    min-height: 6rem;
    resize: vertical;
  }

  .error {
    color: var(--df-err, #ff6b6b);
  }

  @media (max-width: 700px) {
    .mapping-row {
      grid-template-columns: 100px minmax(0, 1fr) auto;
    }

    .mapping-row > button {
      grid-column: 1 / -1;
    }

    .automation-layout {
      flex-direction: column;
    }

    .automation-list-pane {
      flex-basis: auto;
      min-height: 220px;
    }
  }
</style>
