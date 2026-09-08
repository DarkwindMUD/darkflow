<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { Session } from "../runtime/session.ts";
  import { CONFIG_KINDS } from "../model/configuration.ts";
  import type { CharacterConfigurationSnapshot } from "../configuration/editor.ts";
  import DefinitionEditor from "./DefinitionEditor.svelte";
  import SettingsCheckbox from "./SettingsCheckbox.svelte";
  import { AUDIO_CATEGORIES } from "./audio-categories.ts";
  import {
    DEFAULT_PHASE2_CLIENT_SETTINGS,
    TERMINAL_FONT_FAMILIES,
    TERMINAL_FONT_SIZES,
    loadClientSettings,
    loadSettingsWindowState,
    saveClientSettings,
    saveSettingsWindowState,
    validateVsCodeTheme,
    type Phase2ClientSettings,
  } from "./client-settings.ts";
  import {
    MAX_SETTINGS_BUNDLE_BYTES,
    applySettingsImport,
    buildSettingsBundle,
    prepareSettingsImport,
    settingsBundleFilename,
    type PreparedSettingsBundle,
  } from "./settings-bundle.ts";
  import type { SessionVisualEffectKey } from "../runtime/visual-effects.ts";
  // @ts-expect-error Legacy theme data has no declaration file.
  import { BUILTIN_THEMES } from "../../public/js/theme-manager.js";
  // @ts-expect-error Retained background data has no declaration file.
  import { BACKGROUND_PRESETS } from "../../public/js/background-manager.js";
  // @ts-expect-error Retained theme converter has no declaration file.
  import { convertVsCodeTheme } from "../../public/js/theme-manager.js";
  // @ts-expect-error Retained visual-effect settings are JavaScript without declarations.
  import * as visualEffectSettings from "../../public/js/visual-effects-settings.mjs";
  // @ts-expect-error The retained alias helper is plain JavaScript.
  import { aliasManager } from "../../public/js/alias-manager.js";

  let {
    clientVersion,
    open,
    session,
    onclose,
  }: {
    clientVersion: string | null;
    open: boolean;
    session: Session;
    onclose: () => void;
  } = $props();
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
    { id: "debug", group: "Help", label: "Debug" },
    { id: "about", group: "Help", label: "About" },
  ] as const;
  type TabId = (typeof tabs)[number]["id"];
  const groups = ["Client", "Automation", "Help"] as const;
  const builtinThemes = Object.values(BUILTIN_THEMES) as Array<{ key: string; label: string }>;
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
  let gmcpVariables = $state<Array<{ name: string; value: string }>>([]);
  let gmcpSearch = $state("");
  let gmcpPage = $state(1);
  let configuration = $state<CharacterConfigurationSnapshot>(
    untrack(() => session.configuration.getSnapshot()),
  );
  let aliasEditor = $state<DefinitionEditor>();
  let status = $state("");
  let invalidStoredSettings = $state(false);
  let selectedTab = $state<TabId>("connection");
  let search = $state("");
  let mobile = $state(window.innerWidth <= 700);
  let audio = $state(untrack(() => session.audio.getSnapshot()));
  let connection = $state(untrack(() => session.getConnectionSnapshot()));
  let health = $state(untrack(() => session.connectionHealth.getSnapshot()));
  let drag: { x: number; y: number } | null = null;
  let originalAppearance: {
    sideRailOpacity: number;
    terminalBackgroundOpacity: number;
    terminalFontFamily: string | null;
    terminalFontSize: number | null;
  } | null = null;
  let importInput = $state<HTMLInputElement>();
  let preparedImport = $state<PreparedSettingsBundle | null>(null);
  let closeIntent = $state<"discard" | "apply" | null>(null);
  let closePrompt = $state(false);
  let backupButton = $state<HTMLButtonElement>();
  let importAction = $state<HTMLButtonElement>();
  let importConfirm = $state<HTMLButtonElement>();
  let closeReturnFocus: HTMLElement | null = null;
  let importing = $state(false);
  let originalConfiguration: CharacterConfigurationSnapshot | null = null;
  let baseline = "";
  const GMCP_PAGE_SIZE = 200;
  const aliasUsage = $derived.by(() =>
    aliasManager.collectAliasUsageDetails({
      aliases: configuration.effectiveConfiguration.aliases.map(({ definition }) => definition),
    }),
  );
  const filteredGmcpVariables = $derived(
    gmcpVariables.filter(({ name, value }) => {
      const needle = gmcpSearch.trim().toLowerCase();
      return !needle || `${name} ${value}`.toLowerCase().includes(needle);
    }),
  );
  const gmcpPageCount = $derived(
    Math.max(1, Math.ceil(filteredGmcpVariables.length / GMCP_PAGE_SIZE)),
  );
  const effectiveGmcpPage = $derived(Math.min(gmcpPage, gmcpPageCount));
  const visibleGmcpVariables = $derived(
    filteredGmcpVariables.slice(
      (effectiveGmcpPage - 1) * GMCP_PAGE_SIZE,
      effectiveGmcpPage * GMCP_PAGE_SIZE,
    ),
  );
  const gmcpRangeStart = $derived(
    filteredGmcpVariables.length ? (effectiveGmcpPage - 1) * GMCP_PAGE_SIZE + 1 : 0,
  );
  const gmcpRangeEnd = $derived(
    Math.min(effectiveGmcpPage * GMCP_PAGE_SIZE, filteredGmcpVariables.length),
  );

  function loadDraft(): void {
    const result = loadClientSettings(localStorage);
    settings = { ...result.settings };
    originalAppearance = {
      sideRailOpacity: result.settings.sideRailOpacity,
      terminalBackgroundOpacity: result.settings.terminalBackgroundOpacity,
      terminalFontFamily: result.settings.terminalFontFamily,
      terminalFontSize: result.settings.terminalFontSize,
    };
    const snapshot = session.configuration.getSnapshot();
    configuration = snapshot;
    originalConfiguration = structuredClone(snapshot);
    theme = originalConfiguration.themeKey;
    variables = session.terminal.automation
      .listVariableNames()
      .map((name) => ({ name, value: session.terminal.automation.getVariable(name) ?? "" }));
    gmcpSearch = "";
    gmcpPage = 1;
    discoverVariables();
    refreshGmcpVariables();
    invalidStoredSettings = !result.success;
    status = result.success ? "" : result.message;
    baseline = settingsFingerprint();
  }

  function discoverVariables(): void {
    const existingNames = variables.map(({ name }) => name.trim());
    for (const entry of [
      ...configuration.effectiveConfiguration.aliases,
      ...configuration.effectiveConfiguration.triggers,
      ...configuration.effectiveConfiguration.timers,
    ]) {
      for (const step of entry.definition.steps) {
        if (step.type !== "set_variable") continue;
        const name = step.name.trim();
        if (name && !existingNames.includes(name)) {
          existingNames.push(name);
          variables.push({ name, value: "" });
        }
      }
    }
  }

  function soundSettings(): Record<string, unknown> {
    return {
      enabled: audio.enabled,
      volume: audio.volume,
      categoryEnabled: { ...audio.categoryEnabled },
    };
  }
  function settingsFingerprint(): string {
    const configuration = session.configuration.getSnapshot();
    return JSON.stringify({
      settings,
      theme,
      localDefinitions: configuration.localDefinitions,
      attachedConfigurationSets: configuration.attachedConfigurationSets,
      variables,
      sound: soundSettings(),
    });
  }
  function download(text: string, recovery = false): void {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = settingsBundleFilename(recovery);
    try {
      document.body.append(link);
      link.click();
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url));
    }
  }
  function exportSettings(recovery = false): boolean {
    try {
      const result = buildSettingsBundle(localStorage, {
        clientVersion: clientVersion ?? "unknown",
        clientSettings: { ...settings },
        theme,
        sound: soundSettings(),
      });
      if (!result.success) {
        status = result.message;
        return false;
      }
      download(result.data.text, recovery);
      status = recovery ? "Recovery backup downloaded." : "Settings exported.";
      return true;
    } catch {
      status = "Settings backup could not be downloaded.";
      return false;
    }
  }
  function openImport(): void {
    importInput?.click();
  }
  async function selectImport(file: File | undefined): Promise<void> {
    preparedImport = null;
    if (!file) return;
    if (file.size > MAX_SETTINGS_BUNDLE_BYTES) {
      status = "Settings files must be 10 MiB or smaller.";
      return;
    }
    try {
      const endpoint = session.getConnectionSnapshot().endpoint;
      const result = prepareSettingsImport(await file.text(), localStorage, {
        characterProfileId: session.characterProfileId,
        endpoint,
      });
      if (!result.success) {
        status = result.message;
        return;
      }
      preparedImport = result.data;
      status = "Review the import before replacing local settings.";
      queueMicrotask(() => importConfirm?.focus());
    } catch {
      status = "Settings file could not be read.";
    }
  }
  async function confirmImport(): Promise<void> {
    if (!preparedImport || importing) return;
    const nextImport = preparedImport;
    importing = true;
    window.dispatchEvent(new Event("darkflow:settings-import-start"));
    const result = applySettingsImport(localStorage, nextImport, session.characterProfileId);
    if (!result.success) {
      window.dispatchEvent(new Event("darkflow:settings-import-abort"));
      status = result.recoveryFailedOwner
        ? `${result.message} Recovery restoration also failed for ${result.recoveryFailedOwner}.`
        : `${result.message} Original settings were restored.`;
      preparedImport = null;
      importing = false;
      queueMicrotask(() => importAction?.focus());
      return;
    }
    session.configuration.setThemeKey(String(nextImport.clientSettings.theme));
    const runtime = session.terminal.automation;
    const importedNames = new Set(Object.keys(result.data.automationVariables));
    for (const name of runtime.listVariableNames())
      if (!importedNames.has(name)) runtime.removeVariable(name);
    for (const [name, value] of Object.entries(result.data.automationVariables))
      runtime.setVariable(name, value);
    const importedSound = nextImport.sound as {
      enabled: boolean;
      volume: number;
      categoryEnabled: Record<string, boolean>;
    };
    session.audio.setEnabled(importedSound.enabled);
    session.audio.setVolume(importedSound.volume);
    for (const [category, enabled] of Object.entries(importedSound.categoryEnabled))
      session.audio.setCategoryEnabled(category, enabled);
    session.visualEffects.configure(loadClientSettings(localStorage).settings);
    window.dispatchEvent(new Event("darkflow:client-settings-changed"));
    window.dispatchEvent(new Event("darkflow:settings-import-applied"));
    originalAppearance = null;
    originalConfiguration = null;
    preparedImport = null;
    importing = false;
    dialog?.close();
  }
  function dismissImport(): void {
    if (importing) return;
    preparedImport = null;
    queueMicrotask(() => importAction?.focus());
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
    return session.subscribeConnection((next) => {
      connection = next;
      if (next.state !== "connected" && dialog?.open && selectedTab === "variables")
        refreshGmcpVariables();
    });
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
  $effect(() => session.configuration.subscribe((next) => (configuration = next)));
  onMount(() => {
    const refresh = () => {
      if (dialog?.open && selectedTab === "variables") refreshGmcpVariables();
    };
    window.addEventListener("darkwind:gmcp-variables-changed", refresh);
    return () => window.removeEventListener("darkwind:gmcp-variables-changed", refresh);
  });

  function save(close = true): void {
    if (!validateVariables()) return;
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
    if (!settings.autoReconnect && connection.reconnect?.status === "scheduled")
      session.disconnect();
    const runtime = session.terminal.automation;
    const nextNames = new Set(variables.map(({ name }) => name.trim()).filter(Boolean));
    for (const name of runtime.listVariableNames())
      if (!nextNames.has(name)) runtime.removeVariable(name);
    for (const variable of variables) runtime.setVariable(variable.name.trim(), variable.value);
    window.dispatchEvent(new Event("darkflow:client-settings-changed"));
    status = "Settings saved.";
    baseline = settingsFingerprint();
    if (close) {
      originalConfiguration = null;
      originalAppearance = null;
      dialog?.close();
    } else {
      originalConfiguration = structuredClone(session.configuration.getSnapshot());
      originalAppearance = {
        sideRailOpacity: settings.sideRailOpacity,
        terminalBackgroundOpacity: settings.terminalBackgroundOpacity,
        terminalFontFamily: settings.terminalFontFamily,
        terminalFontSize: settings.terminalFontSize,
      };
    }
  }
  async function importTheme(file: File | undefined): Promise<void> {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      status = "Theme files must be 1 MiB or smaller.";
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!validateVsCodeTheme(parsed)) throw new Error();
      if (Object.keys(settings.customThemes).length >= 32) throw new Error("Theme limit reached");
      const label =
        String((parsed as { name?: unknown }).name ?? file.name.replace(/\.json$/i, "")).slice(
          0,
          100,
        ) || "Imported theme";
      const stem =
        label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 72) || "imported-theme";
      const keys = new Set([
        ...builtinThemes.map((item) => item.key),
        ...Object.keys(settings.customThemes),
      ]);
      let key = stem;
      let suffix = 2;
      while (keys.has(key)) key = `${stem.slice(0, 76)}-${suffix++}`.slice(0, 80);
      const imported = convertVsCodeTheme(parsed, { key, label });
      const previousSettings = settings;
      const previousActiveTheme = session.configuration.getSnapshot().themeKey;
      const previousStoredSettings = localStorage.getItem("darkwind-client-settings");
      const nextSettings = {
        ...settings,
        customThemes: { ...settings.customThemes, [imported.key]: imported },
      };
      const saved = saveClientSettings(
        localStorage,
        originalAppearance
          ? {
              ...nextSettings,
              ...originalAppearance,
            }
          : nextSettings,
        key,
      );
      if (!saved.success || !session.configuration.setThemeKey(key).success) {
        if (previousStoredSettings === null) localStorage.removeItem("darkwind-client-settings");
        else localStorage.setItem("darkwind-client-settings", previousStoredSettings);
        session.configuration.setThemeKey(previousActiveTheme);
        settings = previousSettings;
        throw new Error();
      }
      settings = nextSettings;
      theme = key;
      window.dispatchEvent(new Event("darkflow:client-settings-changed"));
      previewSideRailOpacity(String(settings.sideRailOpacity));
      previewTerminalOpacity(String(settings.terminalBackgroundOpacity));
      previewTerminalFontFamily(settings.terminalFontFamily ?? "");
      previewTerminalFontSize(settings.terminalFontSize ? String(settings.terminalFontSize) : "");
      status = "Theme imported.";
    } catch (error) {
      status =
        error instanceof Error && error.message === "Theme limit reached"
          ? error.message
          : "Choose a valid VS Code theme JSON file.";
    }
  }
  function closeNow(): void {
    persistWindow();
    dialog?.close();
  }
  function restoreConfiguration(): boolean {
    if (!originalConfiguration) return true;
    const original = originalConfiguration;
    const current = session.configuration.getSnapshot();
    for (const kind of CONFIG_KINDS) {
      if (
        JSON.stringify(current.localDefinitions[kind]) ===
        JSON.stringify(original.localDefinitions[kind])
      )
        continue;
      const result = session.configuration.replaceLocalDefinitions(
        kind,
        structuredClone(original.localDefinitions[kind]) as never,
      );
      if (!result.success) {
        status = result.message;
        return false;
      }
    }
    for (const originalSet of Object.values(original.attachedConfigurationSets)) {
      const currentSet =
        session.configuration.getSnapshot().attachedConfigurationSets[originalSet.id];
      if (
        !currentSet ||
        JSON.stringify(currentSet.definitions) === JSON.stringify(originalSet.definitions)
      )
        continue;
      const result = session.configuration.publishConfigurationSet({
        configSetId: originalSet.id,
        expectedRevision: currentSet.revision,
        definitions: structuredClone(originalSet.definitions),
      });
      if (!result.success) {
        status = result.message;
        return false;
      }
    }
    if (session.configuration.getSnapshot().themeKey !== original.themeKey) {
      const result = session.configuration.setThemeKey(original.themeKey);
      if (!result.success) {
        status = result.message;
        return false;
      }
    }
    originalConfiguration = null;
    return true;
  }
  export function close(): void {
    requestClose("discard");
  }
  function requestClose(intent: "discard" | "apply"): void {
    if (intent === "apply" && !validateVariables()) return;
    closeIntent = intent;
    closeReturnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (settings.settingsBackupPromptEnabled && baseline !== settingsFingerprint()) {
      closePrompt = true;
      queueMicrotask(() => backupButton?.focus());
      return;
    }
    finishClose();
  }
  function finishClose(): void {
    const intent = closeIntent;
    closeIntent = null;
    closePrompt = false;
    if (intent === "apply") save();
    else if (restoreConfiguration()) closeNow();
  }
  function neverAskAgain(): void {
    const current = loadClientSettings(localStorage).settings;
    const saved = saveClientSettings(
      localStorage,
      { ...current, settingsBackupPromptEnabled: false },
      session.configuration.getSnapshot().themeKey,
    );
    if (!saved.success) {
      status = saved.message;
      return;
    }
    settings.settingsBackupPromptEnabled = false;
    finishClose();
  }
  function handleDialogClose(): void {
    if (originalAppearance) {
      document.documentElement.style.setProperty(
        "--df-side-rail-opacity",
        `${originalAppearance.sideRailOpacity}%`,
      );
      document.documentElement.style.setProperty(
        "--df-terminal-background-alpha",
        String(originalAppearance.terminalBackgroundOpacity / 100),
      );
      previewTerminalFontFamily(originalAppearance.terminalFontFamily ?? "");
      previewTerminalFontSize(
        originalAppearance.terminalFontSize ? String(originalAppearance.terminalFontSize) : "",
      );
      originalAppearance = null;
    }
    onclose();
  }
  function previewSideRailOpacity(value: string): void {
    settings.sideRailOpacity = Number(value);
    document.documentElement.style.setProperty("--df-side-rail-opacity", `${value}%`);
  }
  function previewTerminalOpacity(value: string): void {
    settings.terminalBackgroundOpacity = Number(value);
    document.documentElement.style.setProperty(
      "--df-terminal-background-alpha",
      String(Number(value) / 100),
    );
  }
  function previewTerminalFontFamily(value: string): void {
    settings.terminalFontFamily = value || null;
    if (value) document.documentElement.style.setProperty("--df-terminal-font-family", value);
    else document.documentElement.style.removeProperty("--df-terminal-font-family");
  }
  function previewTerminalFontSize(value: string): void {
    settings.terminalFontSize = value ? Number(value) : null;
    if (value) document.documentElement.style.setProperty("--df-terminal-font-size", `${value}px`);
    else document.documentElement.style.removeProperty("--df-terminal-font-size");
  }
  function resetWorkspace(): void {
    if (!window.confirm("Reset saved pane and terminal layout for this browser?")) return;
    window.dispatchEvent(new Event("darkflow:reset-workspace"));
    status = "Layout reset.";
  }
  function syncGameScreenReader(): void {
    const command = "set screenreader on";
    if (connection.state !== "connected") {
      status = "Connect before syncing the game screen reader setting.";
      return;
    }
    try {
      if (!session.terminal.sendCommand(command)) {
        status = "Unable to sync the game screen reader setting.";
        return;
      }
      session.terminal.appendSystemMessage(`Sent to game: ${command}`);
      status = "Game screen reader setting synced.";
    } catch {
      status = "Unable to sync the game screen reader setting.";
    }
  }
  function selectTab(tab: TabId, focus = false): void {
    selectedTab = tab;
    search = "";
    if (tab === "variables") {
      discoverVariables();
      refreshGmcpVariables();
    }
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
    if (preparedImport) {
      if (importing) return;
      dismissImport();
      return;
    }
    if (closePrompt) {
      closePrompt = false;
      queueMicrotask(() => closeReturnFocus?.focus());
      return;
    }
    requestClose("discard");
  }
  function panelHidden(tab: TabId): boolean {
    return search.trim() ? !matches(tab) : selectedTab !== tab;
  }
  function refreshGmcpVariables(): void {
    gmcpVariables = session.terminal.automation.listGmcpVariables();
    const needle = gmcpSearch.trim().toLowerCase();
    const count = needle
      ? gmcpVariables.filter(({ name, value }) => `${name} ${value}`.toLowerCase().includes(needle))
          .length
      : gmcpVariables.length;
    gmcpPage = Math.min(gmcpPage, Math.max(1, Math.ceil(count / GMCP_PAGE_SIZE)));
  }
  function updateGmcpSearch(value: string): void {
    gmcpSearch = value;
    gmcpPage = 1;
  }
  function addVariable(): void {
    const names = variables.map(({ name }) => name.trim());
    let index = 1;
    while (names.includes(`var${index}`)) index++;
    const row = variables.length;
    variables.push({ name: `var${index}`, value: "" });
    queueMicrotask(() => document.getElementById(`settings-variable-name-${row}`)?.focus());
  }
  function variableReferences(
    name: string,
  ): Array<{ id: string; trigger: string; description: string }> {
    return aliasUsage.get(name.trim()) ?? [];
  }
  function openAlias(id: string): void {
    selectTab("aliases");
    queueMicrotask(() => aliasEditor?.editById(id));
  }
  function duplicateVariableName(): string | null {
    const names: string[] = [];
    for (const variable of variables) {
      const name = variable.name.trim();
      if (name && names.includes(name)) return name;
      names.push(name);
    }
    return null;
  }
  function validateVariables(): boolean {
    const invalidVariable = dialog?.querySelector<HTMLInputElement>(
      "#settings-panel-variables input:invalid",
    );
    if (invalidVariable) {
      selectTab("variables");
      status = "Variable names cannot be empty.";
      queueMicrotask(() => invalidVariable.reportValidity());
      return false;
    }
    const duplicate = duplicateVariableName();
    if (!duplicate) return true;
    selectTab("variables");
    status = `Variable names must be unique. Duplicate: ${duplicate}.`;
    return false;
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
    novalidate
    inert={preparedImport !== null || closePrompt}
    onsubmit={(event) => {
      event.preventDefault();
      requestClose("apply");
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
      </div>
      <button type="button" aria-label="Close settings" onclick={close}>X</button>
    </header>
    <div class="settings-layout">
      <nav aria-label="Settings sections">
        <input
          aria-label="Search settings"
          type="search"
          bind:value={search}
          placeholder="Search settings..."
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
            <h4>Current connection</h4>
            <p>
              {connection.endpoint.protocol}://{connection.endpoint.host}:{connection.endpoint.port}
            </p>
            <p>{health.diagnosis.headline}</p>
          </div>
          <SettingsCheckbox
            bind:checked={settings.lagMonitorEnabled}
            label="Monitor connection health"
            help="Measure latency in the background and show it in the status bar; the Connection panel breaks lag down into network, server, and local causes."
          />
          <SettingsCheckbox
            bind:checked={settings.autoReconnect}
            label="Auto-reconnect"
            help="Reconnect automatically after unexpected connection loss."
          />
          <button
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
            ><span class="settings-copy"
              ><span class="settings-label">Theme</span>
              <span class="settings-help"
                >Recolor the terminal and interface. Import any VS Code theme (.json) to add your
                own. Applies immediately.</span
              ></span
            >
            <select aria-label="Theme" bind:value={theme}
              >{#each [...builtinThemes, ...Object.values(settings.customThemes)] as item (item.key)}<option
                  value={item.key}>{item.label}</option
                >{/each}</select
            ></label
          >
          <label class="settings-row"
            ><span class="settings-copy"
              ><span class="settings-label">Import VS Code theme</span>
              <span class="settings-help">Add a VS Code theme JSON file to the Theme list.</span
              ></span
            ><input
              aria-label="Upload theme JSON"
              type="file"
              accept=".json,application/json"
              onchange={(event) => importTheme(event.currentTarget.files?.[0])}
            /></label
          >
          <fieldset>
            <legend>Background</legend>
            <p class="settings-help">Curated Darkflow artwork.</p>
            <div class="background-gallery" role="radiogroup" aria-label="Background">
              {#each BACKGROUND_PRESETS as preset (preset.key)}
                <label class="background-choice" title={preset.description}>
                  <input
                    class="background-choice-input"
                    type="radio"
                    name="background"
                    value={preset.key}
                    bind:group={settings.background}
                  />
                  <span class="background-preview" aria-hidden="true">
                    {#if preset.thumbnail}<img src={preset.thumbnail} alt="" />{:else}<span
                        class="background-none"
                      ></span>{/if}
                  </span>
                  <span class="background-label">{preset.label}</span>
                </label>
              {/each}
            </div>
          </fieldset>
          <label class="settings-row"
            ><span class="settings-copy"
              ><span class="settings-label">Side panel opacity ({settings.sideRailOpacity}%)</span>
              <span class="settings-help"
                >Adjust the opacity of the left and right side panels.</span
              ></span
            >
            <input
              aria-label="Side panel opacity"
              type="range"
              min="0"
              max="100"
              step="1"
              value={settings.sideRailOpacity}
              oninput={(event) => previewSideRailOpacity(event.currentTarget.value)}
            /></label
          >
          <label class="settings-row"
            ><span class="settings-copy"
              ><span class="settings-label"
                >Terminal background opacity ({settings.terminalBackgroundOpacity}%)</span
              >
              <span class="settings-help"
                >Adjust how much of the selected background shows through the terminal.</span
              ></span
            >
            <input
              aria-label="Terminal background opacity"
              type="range"
              min="0"
              max="100"
              step="1"
              value={settings.terminalBackgroundOpacity}
              oninput={(event) => previewTerminalOpacity(event.currentTarget.value)}
            /></label
          >
          <SettingsCheckbox
            bind:checked={settings.paneGridSnapEnabled}
            label="Snap floating panes to grid"
            help="Align floating pane positions and resized pane dimensions to a 16px grid."
          />
          <fieldset>
            <legend>Visual effects</legend><SettingsCheckbox
              bind:checked={settings.visualEffectsEnabled}
              label="Game visual effects"
              help="Enable visual presentation across the game. Individual effects can be selected below without changing game text, controls, or combatbrief settings."
            />
            <details>
              <summary>Individual effects</summary>
              <p class="settings-help">
                {Object.values(settings.visualEffectPreferences).filter(Boolean).length} of
                {visualEffectOptions.length} enabled
              </p>
              {#each visualEffectOptions as option (option.key)}<SettingsCheckbox
                  bind:checked={settings.visualEffectPreferences[option.key]}
                  label={option.label}
                  help={option.description}
                />{/each}
            </details>
          </fieldset>
          <div class="settings-card">
            <span class="settings-copy"
              ><span class="settings-label">Pane layout</span>
              <span class="settings-help"
                >Reset saved pane, dock, and terminal window positions for the current browser.</span
              ></span
            >
            <button class="settings-action" type="button" onclick={resetWorkspace}
              >Reset layout</button
            >
          </div>
        </div>
        <div
          class="settings-panel"
          id="settings-panel-audio"
          role="tabpanel"
          aria-labelledby="settings-tab-audio"
          hidden={panelHidden("audio")}
        >
          <h3>Audio</h3>
          <SettingsCheckbox
            checked={audio.enabled}
            label="Enable audio"
            help="Allow game-triggered sound effects in this browser."
            onchange={(checked) => session.audio.setEnabled(checked)}
          />
          <label class="settings-row"
            ><span class="settings-copy"
              ><span class="settings-label">Master volume</span>
              <span class="settings-help" id="master-volume-help"
                >Controls the overall level for every audio category.</span
              ></span
            >
            <input
              aria-label="Master volume"
              aria-describedby="master-volume-help"
              type="range"
              min="0"
              max="100"
              value={Math.round(audio.volume * 100)}
              oninput={(event) => session.audio.setVolume(Number(event.currentTarget.value) / 100)}
            /></label
          >
          <div class="sound-widget-categories settings-sound-categories">
            {#each AUDIO_CATEGORIES as category (category.id)}
              {@const CategoryIcon = category.icon}
              <button
                class="sound-widget-category"
                class:enabled={audio.categoryEnabled[category.id]}
                class:disabled={!audio.categoryEnabled[category.id]}
                type="button"
                title={category.label}
                aria-pressed={audio.categoryEnabled[category.id]}
                onclick={() =>
                  session.audio.setCategoryEnabled(
                    category.id,
                    !audio.categoryEnabled[category.id],
                  )}
              >
                <span class="sound-widget-category-icon"><CategoryIcon size={16} /></span>
                <span class="sound-widget-category-label">{category.label}</span>
              </button>
            {/each}
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
          <SettingsCheckbox
            bind:checked={settings.repeatLastCommand}
            label="Keep last command selected after send"
            help="Keep the last command in the input selected so Enter repeats it and typing replaces it."
          />
          <SettingsCheckbox
            bind:checked={settings.aliasTabCompletionEnabled}
            label="Use aliases for Tab completion"
            help="Complete matching client aliases before falling back to command history or server-side Tab completion."
          />
          <SettingsCheckbox
            bind:checked={settings.historyTabCompletionEnabled}
            label="Use command history for Tab completion"
            help="Try recent commands with the same verb before falling back to server-side Tab completion."
          />
          <SettingsCheckbox
            bind:checked={settings.emojiPickerEnabled}
            label="Show emoji picker"
            help="Show emoji suggestions when typing a colon followed by an emoji name."
          />
          <fieldset>
            <legend>Global shortcuts</legend>
            <SettingsCheckbox
              bind:checked={settings.openSettingsShortcutEnabled}
              label="Open Settings (Ctrl/Cmd+,)"
              help="Open Settings from the active terminal."
            />
            <SettingsCheckbox
              bind:checked={settings.clearTerminalShortcutEnabled}
              label="Clear terminal output (Ctrl+L)"
              help="Clear output for the active terminal."
            />
            <SettingsCheckbox
              bind:checked={settings.resyncGamePanelsShortcutEnabled}
              label="Resync game panels (Ctrl+K)"
              help="Refresh transient game panel data."
            />
            <SettingsCheckbox
              bind:checked={settings.escapeShortcutEnabled}
              label="Return to live output / clear command (Escape)"
              help="Return to live output, or clear the command input."
            />
            <SettingsCheckbox
              bind:checked={settings.pageUpShortcutEnabled}
              label="Scroll one page back (PageUp)"
              help="Scroll terminal history back by one page."
            />
            <SettingsCheckbox
              bind:checked={settings.pageDownShortcutEnabled}
              label="Scroll one page forward (PageDown)"
              help="Scroll terminal history forward by one page."
            />
            <SettingsCheckbox
              bind:checked={settings.focusCommandInputShortcutEnabled}
              label="Focus command input when typing in Darkflow"
              help="When the Darkflow window is active and no text field or dialog is open, send ordinary typing to the command input."
            />
          </fieldset>
          <SettingsCheckbox
            bind:checked={settings.keyMapperEnabled}
            label="Enable custom key mappings"
            help="Bind keys like ArrowUp or 1 to send commands immediately without pressing Enter."
          />
          <div hidden={!settings.keyMapperEnabled}>
            {#if open}<DefinitionEditor {session} kind="keyMappings" />{/if}
          </div>
          {#if open}<DefinitionEditor {session} kind="commandButtons" />{/if}
          <SettingsCheckbox
            bind:checked={settings.tabObservabilityEnabled}
            label="Send tab-away / tab-back on tab changes"
            help="Automatically notifies the game when this browser tab becomes inactive or active again."
          />
          <SettingsCheckbox
            bind:checked={settings.settingsBackupPromptEnabled}
            label="Prompt to export changed settings"
            help="Ask to download a backup when settings changed during the session and the settings panel is closed."
          />
        </div>
        <div
          class="settings-panel"
          id="settings-panel-terminal"
          role="tabpanel"
          aria-labelledby="settings-tab-terminal"
          hidden={panelHidden("terminal")}
        >
          <h3>Terminal</h3>
          <div
            class="settings-row"
            role="group"
            aria-labelledby="terminal-font-label"
            aria-describedby="terminal-font-help"
          >
            <span class="settings-copy"
              ><span class="settings-label" id="terminal-font-label">Font</span>
              <span class="settings-help" id="terminal-font-help"
                >Choose the font family and size used for terminal output.</span
              ></span
            >
            <div class="terminal-font-controls">
              <select
                aria-label="Terminal font family"
                aria-describedby="terminal-font-help"
                value={settings.terminalFontFamily ?? ""}
                onchange={(event) => previewTerminalFontFamily(event.currentTarget.value)}
                ><option value="">Default</option
                >{#each TERMINAL_FONT_FAMILIES as family (family.value)}<option value={family.value}
                    >{family.label}</option
                  >{/each}</select
              ><select
                class="terminal-font-size"
                aria-label="Terminal font size"
                aria-describedby="terminal-font-help"
                value={settings.terminalFontSize ?? ""}
                onchange={(event) => previewTerminalFontSize(event.currentTarget.value)}
                ><option value="">Default</option>{#each TERMINAL_FONT_SIZES as size (size)}<option
                    value={size}>{size} px</option
                  >{/each}</select
              >
            </div>
          </div>
          <label class="settings-row"
            ><span class="settings-copy"
              ><span class="settings-label">Scrollback memory</span>
              <span class="settings-help" id="scrollback-memory-help"
                >Choose how much terminal history to retain before the oldest lines are discarded.</span
              ></span
            ><select
              aria-label="Scrollback memory"
              aria-describedby="scrollback-memory-help"
              bind:value={settings.outputScrollbackPreset}
              ><option value="low">Low (5,000 lines)</option><option value="normal"
                >Normal (10,000 lines)</option
              ><option value="high">High (20,000 lines)</option></select
            ></label
          >
          <label class="settings-row"
            ><span class="settings-copy"
              ><span class="settings-label">Scrollback mode</span>
              <span class="settings-help" id="scrollback-mode-help"
                >Choose whether scrolling back pauses the terminal or opens a split view with live
                output below.</span
              ></span
            ><select
              aria-label="Scrollback mode"
              aria-describedby="scrollback-mode-help"
              bind:value={settings.scrollbackBehavior}
              ><option value="pause">Pause terminal</option><option value="split"
                >Split history + live</option
              ></select
            ></label
          >
          <label class="settings-row"
            ><span class="settings-copy"
              ><span class="settings-label">Split history size</span>
              <span class="settings-help" id="split-history-size-help"
                >Choose how much of the split view is reserved for terminal history.</span
              ></span
            ><input
              aria-label="Split history size"
              aria-describedby="split-history-size-help"
              type="range"
              min="20"
              max="80"
              value={settings.scrollbackSplitRatio * 100}
              oninput={(event) =>
                (settings.scrollbackSplitRatio = Number(event.currentTarget.value) / 100)}
            /></label
          >
          <label class="settings-row"
            ><span class="settings-copy"
              ><span class="settings-label">Screen width</span>
              <span class="settings-help" id="screen-width-help"
                >Leave blank for automatic pane width, or enter a fixed column width for server-side
                wrapping.</span
              ></span
            ><input
              aria-label="Screen width"
              aria-describedby="screen-width-help"
              type="number"
              min="40"
              max="240"
              step="1"
              placeholder="Auto"
              value={settings.terminalWidthColumns ?? ""}
              oninput={(event) =>
                (settings.terminalWidthColumns = event.currentTarget.value
                  ? Number(event.currentTarget.value)
                  : null)}
            /></label
          >
          <SettingsCheckbox
            bind:checked={settings.screenReaderMode}
            label="Screen reader announcements"
            help="Mirror new terminal lines into a hidden polite live region for browser screen readers."
          />
          <div class="settings-card">
            <h4>Game screen reader setting</h4>
            <p id="game-screen-reader-help">
              This sends set screenreader on to the game. It changes your saved MUD setting only
              when you press the button.
            </p>
            <button
              class="settings-action"
              type="button"
              aria-describedby="game-screen-reader-help"
              disabled={connection.state !== "connected"}
              onclick={syncGameScreenReader}>Sync now</button
            >
          </div>
        </div>
        <div
          class="settings-panel"
          id="settings-panel-aliases"
          role="tabpanel"
          aria-labelledby="settings-tab-aliases"
          hidden={panelHidden("aliases")}
        >
          <h3>Aliases</h3>
          {#if open}<DefinitionEditor bind:this={aliasEditor} {session} kind="aliases" />{/if}
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
          <div class="settings-card">
            <h4>Persistent variables</h4>
            <p>
              Persistent variables back aliases like $pack. Aliases can also write to them with Set
              variable steps.
            </p>
            {#each variables as variable, index (index)}
              {@const references = variableReferences(variable.name)}
              <div class="variable-row">
                <label
                  >Name <input
                    id={`settings-variable-name-${index}`}
                    bind:value={variable.name}
                    pattern=".*\S.*"
                    required
                  /></label
                >
                <label>Value <input bind:value={variable.value} /></label>
                <button type="button" onclick={() => variables.splice(index, 1)}>Remove</button>
              </div>
              {#if references.length}
                <details class="variable-references">
                  <summary
                    >{references.length} alias reference{references.length === 1
                      ? ""
                      : "s"}</summary
                  >
                  {#each references as reference (reference.id)}
                    <button type="button" onclick={() => openAlias(reference.id)}>
                      {reference.description
                        ? `${reference.description} (${reference.trigger})`
                        : reference.trigger}
                    </button>
                  {/each}
                </details>
              {:else}
                <button type="button" disabled>0 alias references</button>
              {/if}
            {:else}
              <p>No variables yet. Add one here, or open Aliases and write a Set variable step.</p>
              <button type="button" onclick={() => selectTab("aliases")}>Open Aliases</button>
            {/each}
            <button class="settings-action" type="button" onclick={addVariable}>Add variable</button
            >
            <p>Variables are saved for this character.</p>
          </div>
          <div class="settings-card gmcp-variables-card">
            <h4>GMCP variables</h4>
            <p>
              Live runtime variables from GMCP messages. They are available to automations, clear on
              reconnect, and are not saved.
            </p>
            <label
              >Search GMCP variables
              <input
                aria-label="Search GMCP variables"
                type="search"
                value={gmcpSearch}
                oninput={(event) => updateGmcpSearch(event.currentTarget.value)}
              />
            </label>
            <p role="status" aria-live="polite">
              Showing {gmcpRangeStart}-{gmcpRangeEnd} of {filteredGmcpVariables.length} matching {gmcpVariables.length}
              total GMCP variables.
            </p>
            {#if !gmcpVariables.length}
              <p>No GMCP variables have been received yet.</p>
            {:else if !filteredGmcpVariables.length}
              <p>No GMCP variables match your search.</p>
            {:else}
              <div class="gmcp-pagination" role="group" aria-label="Top GMCP pagination">
                <button type="button" disabled={effectiveGmcpPage === 1} onclick={() => gmcpPage--}
                  >Previous</button
                >
                <span>Page {effectiveGmcpPage} of {gmcpPageCount}</span>
                <button
                  type="button"
                  disabled={effectiveGmcpPage === gmcpPageCount}
                  onclick={() => gmcpPage++}>Next</button
                >
              </div>
              {#each visibleGmcpVariables as variable (variable.name)}
                <div class="variable-row gmcp-variable-row">
                  <label
                    >Name <input
                      aria-label={`GMCP Name ${variable.name}`}
                      value={variable.name}
                      readonly
                    /></label
                  >
                  <label
                    >Value <input
                      aria-label={`GMCP Value ${variable.name}`}
                      value={variable.value}
                      readonly
                    /></label
                  >
                </div>
              {/each}
              <div class="gmcp-pagination" role="group" aria-label="Bottom GMCP pagination">
                <button type="button" disabled={effectiveGmcpPage === 1} onclick={() => gmcpPage--}
                  >Previous</button
                >
                <span>Page {effectiveGmcpPage} of {gmcpPageCount}</span>
                <button
                  type="button"
                  disabled={effectiveGmcpPage === gmcpPageCount}
                  onclick={() => gmcpPage++}>Next</button
                >
              </div>
            {/if}
          </div>
        </div>
        <div
          class="settings-panel"
          id="settings-panel-debug"
          role="tabpanel"
          aria-labelledby="settings-tab-debug"
          hidden={panelHidden("debug")}
        >
          <h3>Debug</h3>
          <SettingsCheckbox
            bind:checked={settings.gmcpDebugEnabled}
            label="Enable GMCP Debug"
            help="Show received GMCP messages in the GMCP Debug panel."
          />
        </div>
        <div
          class="settings-panel"
          id="settings-panel-about"
          role="tabpanel"
          aria-labelledby="settings-tab-about"
          hidden={panelHidden("about")}
        >
          <h3>About</h3>
          <div class="settings-card about-card">
            <img src="/assets/brand/darkflow-app-icon.png" alt="Darkflow app icon" />
            <div>
              <h4>
                Darkflow
                <a
                  href="https://darkflow.darkwind.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open Darkflow site">&#8599;</a
                >
              </h4>
              <p>
                Web-based MUD client - built for <a
                  href="https://play.darkwind.ai"
                  target="_blank"
                  rel="noopener noreferrer">Darkwind</a
                >
              </p>
            </div>
          </div>
          <div class="settings-card">
            <h4>Client version</h4>
            <p>{clientVersion || "unknown"}</p>
          </div>
          <div class="settings-card">
            <h4>GMCP packages</h4>
            <a
              href="https://github.com/jasona/darkflow/tree/main/docs"
              target="_blank"
              rel="noopener noreferrer"
              >See custom GMCP extensions <span aria-hidden="true">&#8599;</span></a
            >
          </div>
        </div>
      </div>
    </div>
    <p class:error={invalidStoredSettings} role="status" aria-live="polite">{status}</p>
    <footer>
      <div class="settings-portable-actions">
        <button type="button" onclick={() => exportSettings()}>Export settings</button>
        <button bind:this={importAction} type="button" onclick={openImport}>Import settings</button>
      </div>
      <div>
        <button type="button" onclick={close}>Close</button>
        <button type="button" onclick={() => save(false)}>Apply</button>
        <button class="dw-button dw-button-primary" type="submit">Save & Close</button>
      </div>
    </footer>
  </form>
  <input
    bind:this={importInput}
    class="hidden-file-input"
    type="file"
    accept=".json,application/json"
    onchange={(event) => {
      selectImport(event.currentTarget.files?.[0]);
      event.currentTarget.value = "";
    }}
  />
  {#if preparedImport}
    <div class="settings-overlay" role="dialog" aria-labelledby="import-title">
      <div class="settings-confirmation">
        <h3 id="import-title">Import settings</h3>
        <p>This will replace your current settings.</p>
        {#if preparedImport.preview.legacyLayoutWarning}<p>
            {preparedImport.preview.legacyLayoutWarning}
          </p>{/if}
        <div>
          <button type="button" disabled={importing} onclick={dismissImport}>Cancel</button><button
            bind:this={importConfirm}
            type="button"
            disabled={importing}
            onclick={confirmImport}>Import</button
          >
        </div>
      </div>
    </div>
  {/if}
  {#if closePrompt}
    <div class="settings-overlay" role="dialog" aria-labelledby="backup-title">
      <div class="settings-confirmation">
        <h3 id="backup-title">Download changed settings?</h3>
        <p>Settings changed in this session. Download a backup before closing?</p>
        <div>
          <button
            type="button"
            onclick={() => {
              closePrompt = false;
              queueMicrotask(() => closeReturnFocus?.focus());
            }}>Continue editing</button
          >
          <button type="button" onclick={finishClose}>Skip</button>
          <button type="button" onclick={neverAskAgain}>Never ask again</button>
          <button
            bind:this={backupButton}
            type="button"
            onclick={() => exportSettings() && finishClose()}>Download backup</button
          >
        </div>
      </div>
    </div>
  {/if}
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
  footer > div {
    display: flex;
    gap: 0.5rem;
  }
  .hidden-file-input {
    display: none;
  }
  .settings-overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: var(--df-overlay, rgba(0, 0, 0, 0.6));
  }
  .settings-confirmation {
    display: grid;
    gap: 0.75rem;
    max-width: 34rem;
    padding: 1rem;
    border: 1px solid var(--df-border, #30363d);
    border-radius: 0.5rem;
    background: var(--df-panel, #161b22);
  }
  .settings-confirmation > div {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .settings-layout {
    display: grid;
    grid-template-columns: 176px minmax(0, 1fr);
    min-height: 0;
    gap: 12px;
    padding: 12px;
  }
  .background-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 0.5rem;
  }
  .background-choice {
    position: relative;
    display: grid;
    gap: 0.25rem;
    cursor: pointer;
    font-size: 0.8rem;
  }
  .background-choice-input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  .background-preview {
    position: relative;
    display: grid;
    overflow: hidden;
    aspect-ratio: 16 / 9;
    place-items: center;
    border: 2px solid transparent;
    border-radius: 0.35rem;
    background: var(--df-bg, #0d1117);
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease,
      filter 120ms ease;
  }
  .background-choice:hover .background-preview {
    filter: brightness(1.14);
  }
  .background-choice:has(input:checked) .background-preview,
  .background-choice:has(input:focus-visible) .background-preview {
    border-color: var(--df-accent, #58a6ff);
    box-shadow: 0 0 0 2px var(--df-accent, #58a6ff);
  }
  .background-choice:has(input:checked) .background-label {
    color: var(--df-accent, #58a6ff);
  }
  .background-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .background-none {
    width: 100%;
    height: 100%;
    background: var(--df-bg, #0d1117);
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
  .settings-copy,
  .settings-label,
  .settings-help {
    display: block;
  }
  .settings-help {
    margin-top: 0.2rem;
    color: var(--df-muted, #8b949e);
    font-size: 0.9em;
  }
  .about-card {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
  }
  .about-card img {
    width: 3rem;
    height: 3rem;
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
  .terminal-font-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 6rem;
    gap: 0.5rem;
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
    min-width: 0;
  }
  .variable-row input {
    box-sizing: border-box;
    width: 100%;
  }
  .variable-references {
    gap: 0.25rem;
  }
  .variable-references button {
    justify-self: start;
    overflow-wrap: anywhere;
  }
  .gmcp-variable-row {
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-color, #30363d);
  }
  .gmcp-variables-card {
    margin-top: 0.75rem;
  }
  .gmcp-pagination {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
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
    .variable-row label {
      flex: none;
    }
    .settings-row {
      grid-template-columns: 1fr;
    }
  }
</style>
