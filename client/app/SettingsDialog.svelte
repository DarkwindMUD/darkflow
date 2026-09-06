<script lang="ts">
  import { untrack } from "svelte";
  import type { Session } from "../runtime/session.ts";
  import DefinitionEditor from "./DefinitionEditor.svelte";
  import {
    DEFAULT_PHASE2_CLIENT_SETTINGS,
    loadClientSettings,
    loadSettingsWindowState,
    saveClientSettings,
    saveSettingsWindowState,
    type Phase2ClientSettings,
  } from "./client-settings.ts";
  import type { SessionVisualEffectKey } from "../runtime/visual-effects.ts";
  // @ts-expect-error Legacy theme data has no declaration file.
  import { BUILTIN_THEMES } from "../../public/js/theme-manager.js";
  // @ts-expect-error Retained visual-effect settings are JavaScript without declarations.
  import * as visualEffectSettings from "../../public/js/visual-effects-settings.mjs";

  let { open, session, onclose }: { open: boolean; session: Session; onclose: () => void } =
    $props();
  const tabs = [
    { id: "connection", group: "Client", label: "Connection" },
    { id: "appearance", group: "Client", label: "Appearance" },
    { id: "terminal", group: "Client", label: "Terminal" },
    { id: "audio", group: "Client", label: "Audio" },
    { id: "controls", group: "Client", label: "Controls" },
    { id: "aliases", group: "Automation", label: "Aliases" },
    { id: "triggers", group: "Automation", label: "Triggers" },
    { id: "timers", group: "Automation", label: "Timers" },
    { id: "functions", group: "Automation", label: "Functions" },
    { id: "highlights", group: "Automation", label: "Highlights" },
    { id: "variables", group: "Automation", label: "Variables" },
    { id: "about", group: "Help", label: "About" },
  ] as const;
  type TabId = (typeof tabs)[number]["id"];
  const groups = ["Client", "Automation", "Help"] as const;
  const themes = Object.values(BUILTIN_THEMES) as Array<{ key: string; label: string }>;
  const visualEffectOptions = visualEffectSettings.VISUAL_EFFECT_OPTIONS as readonly {
    key: SessionVisualEffectKey;
    label: string;
    description: string;
  }[];

  let dialog = $state<HTMLDialogElement>();
  let header = $state<HTMLElement>();
  let theme = $state("");
  let settings = $state<Phase2ClientSettings>({ ...DEFAULT_PHASE2_CLIENT_SETTINGS });
  let variables = $state<Array<{ name: string; value: string }>>([]);
  let gmcpVariables = $state<Record<string, string>>({});
  let status = $state("");
  let invalidStoredSettings = $state(false);
  let selectedTab = $state<TabId>("connection");
  let search = $state("");
  let mobile = $state(window.innerWidth <= 700);
  let audio = $state(untrack(() => session.audio.getSnapshot()));
  let connection = $state(untrack(() => session.getConnectionSnapshot()));
  let health = $state(untrack(() => session.connectionHealth.getSnapshot()));
  let drag: { x: number; y: number } | null = null;
  const audioCategories = $derived(Object.entries(audio.categoryEnabled));

  function loadDraft(): void {
    const result = loadClientSettings(localStorage);
    settings = { ...result.settings };
    theme = session.configuration.getSnapshot().themeKey;
    variables = session.terminal.automation
      .listVariableNames()
      .map((name) => ({ name, value: session.terminal.automation.getVariable(name) ?? "" }));
    gmcpVariables = session.terminal.automation.getGmcpVariables();
    invalidStoredSettings = !result.success;
    status = result.success ? "" : result.message;
  }

  function windowState(): void {
    const state = loadSettingsWindowState(localStorage, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    if (tabs.some((tab) => tab.id === state.tab)) selectedTab = state.tab as TabId;
    mobile = window.innerWidth <= 700;
    if (mobile) {
      dialog?.style.removeProperty("left");
      dialog?.style.removeProperty("top");
      dialog?.style.removeProperty("width");
      dialog?.style.removeProperty("height");
      return;
    }
    dialog?.style.setProperty("left", `${state.x}px`);
    dialog?.style.setProperty("top", `${state.y}px`);
    dialog?.style.setProperty("width", `${state.w}px`);
    dialog?.style.setProperty("height", `${state.h}px`);
  }
  function persistWindow(): void {
    if (!dialog?.open || window.innerWidth <= 700) return;
    saveSettingsWindowState(localStorage, {
      x: dialog.offsetLeft,
      y: dialog.offsetTop,
      w: dialog.offsetWidth,
      h: dialog.offsetHeight,
      tab: selectedTab,
    });
  }
  function clampWindow(): void {
    if (dialog?.open) windowState();
  }

  $effect(() => {
    if (open && !dialog?.open) {
      loadDraft();
      dialog?.show();
      windowState();
    } else if (!open && dialog?.open) dialog.close();
  });
  $effect(() => session.onDispose(() => dialog?.open && dialog.close()));
  $effect(() => {
    audio = session.audio.getSnapshot();
    return session.audio.subscribe((next) => (audio = next));
  });
  $effect(() => {
    connection = session.getConnectionSnapshot();
    return session.subscribeConnection((next) => (connection = next));
  });
  $effect(() => {
    health = session.connectionHealth.getSnapshot();
    return session.connectionHealth.subscribe((next) => (health = next));
  });
  $effect(() => {
    if (!dialog) return;
    const observer = new ResizeObserver(persistWindow);
    observer.observe(dialog);
    return () => observer.disconnect();
  });

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
    for (const name of runtime.listVariableNames())
      if (!nextNames.has(name)) runtime.removeVariable(name);
    for (const variable of variables) runtime.setVariable(variable.name.trim(), variable.value);
    window.dispatchEvent(new Event("darkflow:client-settings-changed"));
    status = "Settings saved.";
    dialog?.close();
  }
  function close(): void {
    persistWindow();
    dialog?.close();
  }
  function handleDialogClose(): void {
    onclose();
  }
  function resetWorkspace(): void {
    window.dispatchEvent(new Event("darkflow:reset-workspace"));
    status = "Workspace reset.";
  }
  function selectTab(tab: TabId, focus = false): void {
    selectedTab = tab;
    search = "";
    if (tab === "variables") gmcpVariables = session.terminal.automation.getGmcpVariables();
    saveSettingsWindowState(localStorage, { tab });
    if (focus) queueMicrotask(() => document.getElementById(`settings-tab-${tab}`)?.focus());
  }
  function tabKeydown(event: KeyboardEvent, tab: TabId): void {
    const index = tabs.findIndex((item) => item.id === tab);
    let next = index;
    if (["ArrowDown", "ArrowRight"].includes(event.key)) next = (index + 1) % tabs.length;
    else if (["ArrowUp", "ArrowLeft"].includes(event.key))
      next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectTab(tab);
      return;
    } else return;
    event.preventDefault();
    selectTab(tabs[next]!.id, true);
  }
  function startDrag(event: PointerEvent): void {
    if (
      window.innerWidth <= 700 ||
      (event.target instanceof HTMLElement && event.target.closest("button"))
    )
      return;
    drag = {
      x: event.clientX - (dialog?.offsetLeft ?? 0),
      y: event.clientY - (dialog?.offsetTop ?? 0),
    };
    header?.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function moveDrag(event: PointerEvent): void {
    if (!drag || !dialog) return;
    dialog.style.left = `${Math.max(0, Math.min(event.clientX - drag.x, window.innerWidth - dialog.offsetWidth))}px`;
    dialog.style.top = `${Math.max(0, Math.min(event.clientY - drag.y, window.innerHeight - dialog.offsetHeight))}px`;
  }
  function endDrag(): void {
    if (drag) {
      drag = null;
      persistWindow();
    }
  }
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !dialog?.open) return;
    event.preventDefault();
    close();
  }
  function panelHidden(tab: TabId): boolean {
    return search.trim() ? !matches(tab) : selectedTab !== tab;
  }
  function matches(tab: TabId): boolean {
    const query = search.trim().toLowerCase();
    return (
      !query ||
      (document
        .getElementById(`settings-panel-${tab}`)
        ?.textContent?.toLowerCase()
        .includes(query) ??
        false)
    );
  }
  function audioCategoryLabel(category: string): string {
    if (category === "ui") return "Interface";
    return category.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
</script>

<svelte:window onresize={clampWindow} onkeydown={handleKeydown} />

<dialog
  bind:this={dialog}
  aria-labelledby="settings-title"
  oncancel={(event) => {
    event.preventDefault();
    close();
  }}
  onclose={handleDialogClose}
>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      save();
    }}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <header
      data-testid="settings-drag-handle"
      bind:this={header}
      onpointerdown={startDrag}
      onpointermove={moveDrag}
      onpointerup={endDrag}
      onpointercancel={endDrag}
    >
      <div>
        <h2 id="settings-title">Settings</h2>
        <span>Drag to move · resize from the corner</span>
      </div>
      <button type="button" aria-label="Close settings" onclick={close}>Close</button>
    </header>
    <div class="settings-layout">
      <nav aria-label="Settings sections">
        <input
          aria-label="Search settings"
          type="search"
          bind:value={search}
          placeholder="Search settings"
        />
        <div class="tablist" role="tablist" aria-orientation={mobile ? "horizontal" : "vertical"}>
          {#each groups as group (group)}
            <h3>{group}</h3>
            {#each tabs.filter((tab) => tab.group === group) as tab (tab.id)}
              <button
                id={`settings-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-controls={`settings-panel-${tab.id}`}
                aria-selected={!search.trim() && selectedTab === tab.id}
                tabindex={!search.trim() && selectedTab === tab.id ? 0 : -1}
                onclick={() => selectTab(tab.id)}
                onkeydown={(event) => tabKeydown(event, tab.id)}>{tab.label}</button
              >
            {/each}
          {/each}
        </div>
      </nav>
      <div class="settings-content">
        <div
          class="settings-panel"
          id="settings-panel-connection"
          role="tabpanel"
          aria-labelledby="settings-tab-connection"
          hidden={panelHidden("connection")}
        >
          <h3>Connection</h3>
          <div class="settings-card">
            <p>
              {connection.endpoint.protocol}://{connection.endpoint.host}:{connection.endpoint.port}
            </p>
            <p>{health.diagnosis.headline}</p>
          </div>
          <label class="settings-check"
            ><input type="checkbox" bind:checked={settings.lagMonitorEnabled} /> Measure connection health</label
          ><button
            class="settings-action"
            type="button"
            disabled={connection.state !== "connected"}
            onclick={() => session.disconnect()}>Disconnect</button
          >
        </div>
        <div
          class="settings-panel"
          id="settings-panel-appearance"
          role="tabpanel"
          aria-labelledby="settings-tab-appearance"
          hidden={panelHidden("appearance")}
        >
          <h3>Appearance</h3>
          <label class="settings-row"
            ><span>Theme</span>
            <select bind:value={theme}
              >{#each themes as item (item.key)}<option value={item.key}>{item.label}</option
                >{/each}</select
            ></label
          >
          <fieldset>
            <legend>Visual effects</legend><label class="settings-check"
              ><input type="checkbox" bind:checked={settings.visualEffectsEnabled} /> Enable visual effects</label
            >
            <details>
              <summary
                >Choose effects ({Object.values(settings.visualEffectPreferences).filter(Boolean)
                  .length} of {visualEffectOptions.length} enabled)</summary
              >{#each visualEffectOptions as option (option.key)}<label
                  class="settings-check"
                  title={option.description}
                  ><input
                    type="checkbox"
                    bind:checked={settings.visualEffectPreferences[option.key]}
                  />
                  {option.label}</label
                >{/each}
            </details>
          </fieldset>
          <button class="settings-action" type="button" onclick={resetWorkspace}
            >Reset workspace</button
          >
        </div>
        <div
          class="settings-panel"
          id="settings-panel-audio"
          role="tabpanel"
          aria-labelledby="settings-tab-audio"
          hidden={panelHidden("audio")}
        >
          <h3>Audio</h3>
          <label class="settings-check"
            ><input
              type="checkbox"
              checked={audio.enabled}
              onchange={(event) => session.audio.setEnabled(event.currentTarget.checked)}
            /> Enable audio</label
          ><label class="settings-row"
            ><span>Volume</span>
            <input
              aria-label="Volume"
              type="range"
              min="0"
              max="100"
              value={Math.round(audio.volume * 100)}
              oninput={(event) => session.audio.setVolume(Number(event.currentTarget.value) / 100)}
            /></label
          >
          <div class="audio-categories">
            {#each audioCategories as [category, enabled] (category)}<label class="settings-check"
                ><input
                  type="checkbox"
                  checked={enabled}
                  onchange={(event) =>
                    session.audio.setCategoryEnabled(category, event.currentTarget.checked)}
                />
                {audioCategoryLabel(category)}</label
              >{/each}
          </div>
        </div>
        <div
          class="settings-panel"
          id="settings-panel-controls"
          role="tabpanel"
          aria-labelledby="settings-tab-controls"
          hidden={panelHidden("controls")}
        >
          <h3>Controls</h3>
          <label class="settings-check"
            ><input type="checkbox" bind:checked={settings.repeatLastCommand} /> Repeat last command</label
          ><label class="settings-check"
            ><input type="checkbox" bind:checked={settings.aliasTabCompletionEnabled} /> Complete aliases
            with Tab</label
          ><label class="settings-check"
            ><input type="checkbox" bind:checked={settings.historyTabCompletionEnabled} /> Complete from
            history with Tab</label
          ><label class="settings-check"
            ><input type="checkbox" bind:checked={settings.emojiPickerEnabled} /> Show emoji picker</label
          >{#if open}<DefinitionEditor {session} kind="keyMappings" />{/if}
        </div>
        <div
          class="settings-panel"
          id="settings-panel-terminal"
          role="tabpanel"
          aria-labelledby="settings-tab-terminal"
          hidden={panelHidden("terminal")}
        >
          <h3>Terminal</h3>
          <label class="settings-row"
            >Scrollback behavior<select bind:value={settings.scrollbackBehavior}
              ><option value="pause">Pause</option><option value="split"
                >Split history and live</option
              ></select
            ></label
          ><label class="settings-row"
            >Scrollback memory<select bind:value={settings.outputScrollbackPreset}
              ><option value="low">5,000 lines</option><option value="normal">10,000 lines</option
              ><option value="high">20,000 lines</option></select
            ></label
          ><label class="settings-row"
            >Split history size<input
              aria-label="Split history size"
              type="range"
              min="20"
              max="80"
              value={settings.scrollbackSplitRatio * 100}
              oninput={(event) =>
                (settings.scrollbackSplitRatio = Number(event.currentTarget.value) / 100)}
            /></label
          >
        </div>
        <div
          class="settings-panel"
          id="settings-panel-aliases"
          role="tabpanel"
          aria-labelledby="settings-tab-aliases"
          hidden={panelHidden("aliases")}
        >
          <h3>Aliases</h3>
          {#if open}<DefinitionEditor {session} kind="aliases" />{/if}
        </div>
        <div
          class="settings-panel"
          id="settings-panel-triggers"
          role="tabpanel"
          aria-labelledby="settings-tab-triggers"
          hidden={panelHidden("triggers")}
        >
          <h3>Triggers</h3>
          {#if open}<DefinitionEditor {session} kind="triggers" />{/if}
        </div>
        <div
          class="settings-panel"
          id="settings-panel-timers"
          role="tabpanel"
          aria-labelledby="settings-tab-timers"
          hidden={panelHidden("timers")}
        >
          <h3>Timers</h3>
          {#if open}<DefinitionEditor {session} kind="timers" />{/if}
        </div>
        <div
          class="settings-panel"
          id="settings-panel-functions"
          role="tabpanel"
          aria-labelledby="settings-tab-functions"
          hidden={panelHidden("functions")}
        >
          <h3>Functions</h3>
          {#if open}<DefinitionEditor {session} kind="functions" />{/if}
        </div>
        <div
          class="settings-panel"
          id="settings-panel-highlights"
          role="tabpanel"
          aria-labelledby="settings-tab-highlights"
          hidden={panelHidden("highlights")}
        >
          <h3>Highlights</h3>
          {#if open}<DefinitionEditor {session} kind="highlights" />{/if}
        </div>
        <div
          class="settings-panel"
          id="settings-panel-variables"
          role="tabpanel"
          aria-labelledby="settings-tab-variables"
          hidden={panelHidden("variables")}
        >
          <h3>Variables</h3>
          {#each variables as variable, index (index)}<div class="variable-row">
              <label>Name <input bind:value={variable.name} pattern=".*\S.*" required /></label
              ><label>Value <input bind:value={variable.value} /></label><button
                type="button"
                onclick={() => variables.splice(index, 1)}>Remove</button
              >
            </div>{/each}<button
            class="settings-action"
            type="button"
            onclick={() => variables.push({ name: "", value: "" })}>Add variable</button
          >
          <p>Variables last for this session only.</p>
          <h4>GMCP variables</h4>
          {#each Object.entries(gmcpVariables) as [name, value] (name)}<p>
              {name}: {value}
            </p>{:else}<p>No GMCP variables received.</p>{/each}
        </div>
        <div
          class="settings-panel"
          id="settings-panel-about"
          role="tabpanel"
          aria-labelledby="settings-tab-about"
          hidden={panelHidden("about")}
        >
          <h3>About</h3>
          <p>Darkflow Phase 2 client.</p>
        </div>
      </div>
    </div>
    <p class:error={invalidStoredSettings} role="status" aria-live="polite">{status}</p>
    <footer>
      <button type="button" onclick={close}>Cancel</button><button type="submit">Apply</button>
    </footer>
  </form>
</dialog>

<style>
  dialog {
    position: fixed;
    z-index: 4000;
    box-sizing: border-box;
    min-width: min(560px, calc(100vw - 16px));
    min-height: min(560px, calc(100dvh - 16px));
    max-width: calc(100vw - 16px);
    max-height: calc(100dvh - 16px);
    margin: 0;
    padding: 0;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 0.5rem;
    resize: both;
    overflow: hidden;
    background: var(--df-panel, #161b22);
    color: var(--df-text, #c9d1d9);
  }
  form {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    height: 100%;
  }
  header,
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-color, #30363d);
  }
  header {
    cursor: move;
    user-select: none;
  }
  header h2,
  header span,
  p,
  h3,
  h4 {
    margin: 0;
  }
  header span {
    color: var(--df-muted, #8b949e);
    font-size: 0.75rem;
  }
  footer {
    border-top: 1px solid var(--border-color, #30363d);
    border-bottom: 0;
  }
  .settings-layout {
    display: grid;
    grid-template-columns: 176px minmax(0, 1fr);
    min-height: 0;
    gap: 12px;
    padding: 12px;
  }
  nav {
    min-width: 0;
    overflow-y: auto;
  }
  nav input {
    box-sizing: border-box;
    width: 100%;
    margin-bottom: 0.5rem;
  }
  .tablist {
    display: grid;
    gap: 2px;
  }
  .tablist h3 {
    margin: 0.75rem 0 0.2rem;
    color: var(--df-muted, #8b949e);
    font-size: 0.75rem;
    text-transform: uppercase;
  }
  .tablist h3:first-child {
    margin-top: 0;
  }
  .tablist button {
    border: 0;
    border-left: 3px solid transparent;
    border-radius: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    font-size: 12.5px;
  }
  .tablist button:hover {
    background: rgb(255 255 255 / 6%);
  }
  .tablist button[aria-selected="true"] {
    border-left-color: var(--df-accent, #58a6ff);
    background: rgb(88 166 255 / 12%);
  }
  .settings-content {
    min-width: 0;
    overflow: auto;
  }
  .settings-panel {
    display: grid;
    gap: 0.75rem;
    padding: 0 4px 1rem;
  }
  .settings-panel[hidden] {
    display: none;
  }
  label,
  fieldset,
  details {
    display: grid;
    gap: 0.4rem;
  }
  label {
    align-items: center;
  }
  .settings-check {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .settings-check input[type="checkbox"] {
    flex: none;
    margin-top: 0.2rem;
  }
  .settings-action {
    align-self: start;
    width: fit-content;
  }
  .settings-card {
    display: grid;
    gap: 0.35rem;
    padding: 0.75rem;
    border: 1px solid var(--border-color, #30363d);
    border-radius: 0.375rem;
    background: var(--df-bg, #0d1117);
  }
  .settings-row {
    display: grid;
    grid-template-columns: minmax(7rem, 1fr) minmax(10rem, 18rem);
    align-items: center;
    gap: 0.75rem;
  }
  .settings-row select,
  .settings-row input {
    width: 100%;
  }
  fieldset {
    min-width: 0;
  }
  .variable-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .variable-row label {
    flex: 1 1 10rem;
  }
  .audio-categories {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: 0.4rem;
  }
  .error {
    min-height: 1.2em;
    padding: 0 1rem;
    color: var(--df-err, #ff6b6b);
  }
  @media (max-width: 700px) {
    dialog {
      inset: 8px;
      width: calc(100vw - 16px) !important;
      height: calc(100dvh - 16px) !important;
      min-width: 0;
      min-height: 0;
      resize: none;
    }
    header {
      cursor: default;
    }
    header span {
      display: none;
    }
    .settings-layout {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
    }
    .tablist {
      display: flex;
      overflow-x: auto;
    }
    .tablist h3 {
      display: none;
    }
    .tablist button {
      flex: 0 0 auto;
      border-left: 0;
      border-bottom: 3px solid transparent;
    }
    .tablist button[aria-selected="true"] {
      border-left-color: transparent;
      border-bottom-color: var(--df-accent, #58a6ff);
    }
    nav {
      overflow: visible;
    }
    .variable-row,
    footer {
      align-items: stretch;
      flex-direction: column;
    }
    .settings-row {
      grid-template-columns: 1fr;
    }
  }
</style>
