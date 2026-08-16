<script lang="ts">
  import type { Session } from "../runtime/session.ts";
  import DefinitionEditor from "./DefinitionEditor.svelte";
  import {
    DEFAULT_PHASE2_CLIENT_SETTINGS,
    loadClientSettings,
    saveClientSettings,
    type Phase2ClientSettings,
  } from "./client-settings.ts";
  import type { SessionVisualEffectKey } from "../runtime/visual-effects.ts";
  // @ts-expect-error Legacy theme data has no declaration file.
  import { BUILTIN_THEMES } from "../../public/js/theme-manager.js";
  // @ts-expect-error Retained visual-effect settings are JavaScript without declarations.
  import * as visualEffectSettings from "../../public/js/visual-effects-settings.mjs";

  let { open, session, onclose }: { open: boolean; session: Session; onclose: () => void } =
    $props();

  let dialog = $state<HTMLDialogElement>();
  let theme = $state("");
  let settings = $state<Phase2ClientSettings>({ ...DEFAULT_PHASE2_CLIENT_SETTINGS });
  let variables = $state<Array<{ name: string; value: string }>>([]);
  let status = $state("");
  let invalidStoredSettings = $state(false);

  const themes = Object.values(BUILTIN_THEMES) as Array<{ key: string; label: string }>;
  const visualEffectOptions = visualEffectSettings.VISUAL_EFFECT_OPTIONS as readonly {
    key: SessionVisualEffectKey;
    label: string;
    description: string;
  }[];

  function loadDraft(): void {
    const result = loadClientSettings(localStorage);
    settings = { ...result.settings };
    theme = session.configuration.getSnapshot().themeKey;
    variables = session.terminal.automation.listVariableNames().map((name) => ({
      name,
      value: session.terminal.automation.getVariable(name) ?? "",
    }));
    invalidStoredSettings = !result.success;
    status = result.success ? "" : result.message;
  }

  $effect(() => {
    if (open && !dialog?.open) {
      loadDraft();
      dialog?.showModal();
    } else if (!open && dialog?.open) {
      dialog.close();
    }
  });

  $effect(() => session.onDispose(() => dialog?.open && dialog.close()));

  function save(): void {
    const themeResult = session.configuration.setThemeKey(theme);
    if (!themeResult.success) {
      status = themeResult.message;
      return;
    }
    const settingsResult = saveClientSettings(localStorage, settings, theme);
    if (!settingsResult.success) {
      status = settingsResult.message;
      return;
    }
    session.visualEffects.configure(settings);

    const runtime = session.terminal.automation;
    const nextNames = new Set(variables.map(({ name }) => name.trim()).filter(Boolean));
    for (const name of runtime.listVariableNames()) {
      if (!nextNames.has(name)) runtime.removeVariable(name);
    }
    for (const variable of variables) runtime.setVariable(variable.name.trim(), variable.value);

    status = "Settings saved.";
    dialog?.close();
  }

  function close(): void {
    dialog?.close();
  }

  function resetWorkspace(): void {
    window.dispatchEvent(new Event("darkflow:reset-workspace"));
    status = "Workspace reset.";
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="settings-title"
  oncancel={(event) => {
    event.preventDefault();
    close();
  }}
  {onclose}
>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      save();
    }}
  >
    <header>
      <h2 id="settings-title">Settings</h2>
      <button type="button" aria-label="Close settings" onclick={close}>Close</button>
    </header>

    <label>
      Theme
      <select bind:value={theme}>
        {#each themes as item (item.key)}
          <option value={item.key}>{item.label}</option>
        {/each}
      </select>
    </label>

    <fieldset>
      <legend>Command input</legend>
      <label
        ><input type="checkbox" bind:checked={settings.repeatLastCommand} /> Repeat last command</label
      >
      <label
        ><input type="checkbox" bind:checked={settings.aliasTabCompletionEnabled} /> Complete aliases
        with Tab</label
      >
      <label
        ><input type="checkbox" bind:checked={settings.historyTabCompletionEnabled} /> Complete from history
        with Tab</label
      >
    </fieldset>

    <fieldset>
      <legend>Connection diagnostics</legend>
      <label
        ><input type="checkbox" bind:checked={settings.lagMonitorEnabled} /> Measure connection health</label
      >
    </fieldset>

    <fieldset class="settings-visual-effects">
      <legend>Visual effects</legend>
      <label
        ><input type="checkbox" bind:checked={settings.visualEffectsEnabled} /> Enable visual effects</label
      >
      <details class="settings-visual-effects-details">
        <summary class="settings-visual-effects-summary">
          Choose effects
          <span class="settings-visual-effects-count">
            {Object.values(settings.visualEffectPreferences).filter(Boolean).length} of
            {visualEffectOptions.length} enabled
          </span>
        </summary>
        <div class="settings-visual-effects-list">
          {#each visualEffectOptions as option (option.key)}
            <label title={option.description}>
              <input type="checkbox" bind:checked={settings.visualEffectPreferences[option.key]} />
              {option.label}
            </label>
          {/each}
        </div>
      </details>
    </fieldset>

    <fieldset>
      <legend>Variables</legend>
      {#each variables as variable, index (index)}
        <div class="variable-row">
          <label>
            Name
            <input bind:value={variable.name} pattern=".*\S.*" required />
          </label>
          <label>
            Value
            <input bind:value={variable.value} />
          </label>
          <button type="button" onclick={() => variables.splice(index, 1)}>Remove</button>
        </div>
      {/each}
      <button type="button" onclick={() => variables.push({ name: "", value: "" })}
        >Add variable</button
      >
      <p>Variables last for this session only.</p>
    </fieldset>

    {#if open}
      <DefinitionEditor {session} kind="keyMappings" />
      <DefinitionEditor {session} kind="highlights" />
      <DefinitionEditor {session} kind="functions" />
      <DefinitionEditor {session} kind="aliases" />
      <DefinitionEditor {session} kind="triggers" />
      <DefinitionEditor {session} kind="timers" />
    {/if}

    <button type="button" onclick={resetWorkspace}>Reset workspace</button>
    <p class:error={invalidStoredSettings} role="status" aria-live="polite">{status}</p>
    <footer>
      <button type="button" onclick={close}>Cancel</button>
      <button type="submit">Apply</button>
    </footer>
  </form>
</dialog>

<style>
  dialog {
    box-sizing: border-box;
    width: min(42rem, calc(100vw - 2rem));
    max-height: min(46rem, calc(100dvh - 2rem));
    padding: 0;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 0.5rem;
    background: var(--df-panel, #161b22);
    color: var(--df-text, #c9d1d9);
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 65%);
  }

  form {
    display: grid;
    gap: 1rem;
    max-height: inherit;
    padding: 1rem;
    overflow-y: auto;
  }

  header,
  footer,
  .variable-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: end;
  }

  header,
  footer {
    justify-content: space-between;
  }

  h2,
  p {
    margin: 0;
  }

  label {
    display: grid;
    gap: 0.25rem;
  }

  fieldset {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  fieldset > label {
    grid-template-columns: auto 1fr;
    align-items: center;
  }

  input,
  select,
  button {
    min-height: 2.75rem;
  }

  .variable-row label {
    flex: 1 1 10rem;
  }

  .error {
    color: var(--df-err, #ff6b6b);
  }

  @media (max-width: 420px) {
    dialog {
      width: calc(100vw - 1rem);
      max-height: calc(100dvh - 1rem);
    }

    .variable-row,
    footer {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
