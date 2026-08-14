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
    TimerDefinition,
    TriggerDefinition,
  } from "../model/configuration.ts";
  import type { ConfigSetId } from "../model/ids.ts";
  import type { Session } from "../runtime/session.ts";
  import AutomationStepsEditor from "./AutomationStepsEditor.svelte";

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

  let { session, kind }: { session: Session; kind: ConfigKind } = $props();
  let snapshot = $state<CharacterConfigurationSnapshot>(
    untrack(() => session.configuration.getSnapshot()),
  );
  let draft = $state<Draft | null>(null);
  let source = $state<EditSource | null>(null);
  let stale = $state(false);
  let status = $state("");
  let editor = $state<HTMLElement>();

  const title = $derived(
    kind === "keyMappings" ? "Key mappings" : `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`,
  );
  const entries = $derived(snapshot.effectiveConfiguration[kind]);

  $effect(() =>
    session.configuration.subscribe((next) => {
      if (source?.kind === "shared-set") {
        const revision = next.attachedConfigurationSets[source.configSetId]?.revision;
        if (revision !== source.revision) stale = true;
      }
      snapshot = next;
    }),
  );

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
      ignoreCase: false,
      fg: "yellow",
      bg: "black",
      bold: false,
      name: "",
      script: "",
      trigger: "",
      pattern: "",
      isRegex: false,
      gag: false,
      durationMs: 1000,
      recurring: false,
      autoStart: false,
      steps: [],
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
        style: { fg: value.fg.trim(), bg: value.bg.trim(), bold: value.bold },
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
    status = "";
  }

  function add(): void {
    draft = blankDraft();
    source = { kind: "local" };
    stale = false;
    status = "";
  }

  function cancel(): void {
    draft = null;
    source = null;
    stale = false;
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
    cancel();
  }

  function remove(definition: Definition, metadata: ConfigSourceMetadata): void {
    if (metadata.kind === "builtin") return;
    const editSource: EditSource =
      metadata.kind === "local"
        ? { kind: "local" }
        : {
            kind: "shared-set",
            configSetId: metadata.configSetId!,
            revision: metadata.revision!,
          };
    const result = write(
      targetDefinitions(editSource).filter((item) => item.id !== definition.id),
      editSource,
    );
    status = result.success ? `${title} entry deleted.` : result.message;
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
</script>

<fieldset>
  <legend>{title}</legend>
  {#each entries as entry (entry.definition.id)}
    <article aria-label={`${title}: ${labelFor(entry.definition)}`}>
      <div>
        <strong>{labelFor(entry.definition)}</strong>
        <span>{sourceLabel(entry.source)}</span>
        {#if !entry.definition.enabled}<span>Disabled</span>{/if}
      </div>
      {#if entry.source.kind !== "builtin"}
        <div class="actions">
          <button type="button" onclick={() => edit(entry.definition, entry.source)}
            >Edit {labelFor(entry.definition)}</button
          >
          <button type="button" onclick={() => remove(entry.definition, entry.source)}
            >Delete {labelFor(entry.definition)}</button
          >
        </div>
      {/if}
    </article>
  {:else}
    <p>No {title.toLowerCase()} configured.</p>
  {/each}

  <button type="button" onclick={add}>Add {title.toLowerCase()}</button>

  {#if draft}
    <section bind:this={editor} class="editor" aria-label={`Edit ${title.toLowerCase()}`}>
      <label><input type="checkbox" bind:checked={draft.enabled} /> Enabled</label>
      {#if kind === "keyMappings"}
        <label>Key code <input bind:value={draft.code} required /></label>
        <label>Label <input bind:value={draft.label} required /></label>
        <label>Legacy key <input bind:value={draft.legacyKey} /></label>
        <label>Command <input bind:value={draft.command} required /></label>
      {:else if kind === "highlights"}
        <label>Pattern <input bind:value={draft.patternSource} required /></label>
        <label>Description <input bind:value={draft.description} /></label>
        <label>Group <input bind:value={draft.group} /></label>
        <label><input type="checkbox" bind:checked={draft.ignoreCase} /> Ignore case</label>
        <label>Foreground <input bind:value={draft.fg} required /></label>
        <label>Background <input bind:value={draft.bg} required /></label>
        <label><input type="checkbox" bind:checked={draft.bold} /> Bold</label>
      {:else if kind === "functions"}
        <label>Name <input bind:value={draft.name} required /></label>
        <label>Description <input bind:value={draft.description} /></label>
        <label>Group <input bind:value={draft.group} /></label>
        <label>Script <textarea bind:value={draft.script} required></textarea></label>
      {:else}
        {#if kind === "aliases"}
          <label>Trigger <input bind:value={draft.trigger} required /></label>
        {:else if kind === "triggers"}
          <label>Pattern <input bind:value={draft.pattern} required /></label>
          <label><input type="checkbox" bind:checked={draft.gag} /> Gag matching output</label>
        {:else}
          <label>Name <input bind:value={draft.name} required /></label>
          <label
            >Duration (milliseconds) <input
              type="number"
              min="0"
              bind:value={draft.durationMs}
              required
            /></label
          >
          <label><input type="checkbox" bind:checked={draft.recurring} /> Recurring</label>
          <label><input type="checkbox" bind:checked={draft.autoStart} /> Start automatically</label
          >
        {/if}
        <label>Description <input bind:value={draft.description} /></label>
        <label>Group <input bind:value={draft.group} /></label>
        {#if kind !== "timers"}
          <label><input type="checkbox" bind:checked={draft.isRegex} /> Regular expression</label>
          <label><input type="checkbox" bind:checked={draft.ignoreCase} /> Ignore case</label>
        {/if}
        <AutomationStepsEditor bind:steps={draft.steps} />
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
  {/if}
  <p class:error={stale} aria-live="polite">{status}</p>
</fieldset>

<style>
  fieldset,
  .editor {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  article,
  .editor {
    padding: 0.75rem;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 0.35rem;
  }

  article,
  article > div,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
  }

  article span {
    font-size: 0.875rem;
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

  p {
    margin: 0;
  }

  .error {
    color: var(--df-err, #ff6b6b);
  }

  @media (max-width: 420px) {
    article,
    .actions {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
