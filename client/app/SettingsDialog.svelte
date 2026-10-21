<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Download from "@lucide/svelte/icons/download";
  import FileUp from "@lucide/svelte/icons/file-up";
  import Plus from "@lucide/svelte/icons/plus";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import Search from "@lucide/svelte/icons/search";
  import Trash from "@lucide/svelte/icons/trash";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import Upload from "@lucide/svelte/icons/upload";
  import X from "@lucide/svelte/icons/x";
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
  let keyMappingEditor = $state<DefinitionEditor>();
  let aliasEditor = $state<DefinitionEditor>();
  let triggerEditor = $state<DefinitionEditor>();
  let timerEditor = $state<DefinitionEditor>();
  let functionEditor = $state<DefinitionEditor>();
  let highlightEditor = $state<DefinitionEditor>();
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
  let themeInput = $state<HTMLInputElement>();
  let preparedImport = $state<PreparedSettingsBundle | null>(null);
  let closeIntent = $state<"discard" | "apply" | null>(null);
  let closePrompt = $state(false);
  let backupButton = $state<HTMLButtonElement>();
  let importAction = $state<HTMLButtonElement>();
  let importConfirm = $state<HTMLButtonElement>();
  let closeReturnFocus: HTMLElement | null = null;
  let importing = $state(false);
  let originalConfiguration: CharacterConfigurationSnapshot | null = null;
  let baseline = $state("");
  let channelTerminalSuppression = $state(untrack(() => session.getChannelTerminalSuppression()));
  let savedChannelTerminalSuppression = untrack(() => session.getChannelTerminalSuppression());
  const GMCP_PAGE_SIZE = 200;
  const definitionEditors = $derived([
    keyMappingEditor,
    aliasEditor,
    triggerEditor,
    timerEditor,
    functionEditor,
    highlightEditor,
  ]);
  /** True while the draft differs from what was last loaded or saved; drives the header badge. */
  const unsaved = $derived(
    baseline !== "" &&
      (baseline !== settingsFingerprint() ||
        definitionEditors.some((editor) => editor?.hasRuntimeChanges())),
  );
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
    channelTerminalSuppression = session.getChannelTerminalSuppression();
    savedChannelTerminalSuppression = channelTerminalSuppression;
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
      categoryVolume: { ...audio.categoryVolume },
    };
  }
  function settingsFingerprint(): string {
    return JSON.stringify({
      settings,
      channelTerminalSuppression,
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
  function openThemeImport(): void {
    themeInput?.click();
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
      categoryVolume: Record<string, number>;
    };
    session.audio.setEnabled(importedSound.enabled);
    session.audio.setVolume(importedSound.volume);
    for (const [category, enabled] of Object.entries(importedSound.categoryEnabled))
      session.audio.setCategoryEnabled(category, enabled);
    for (const [category, volume] of Object.entries(importedSound.categoryVolume))
      session.audio.setCategoryVolume(category, volume);
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
  $effect(() =>
    session.subscribeChannelTerminalSuppression((enabled) => {
      channelTerminalSuppression = enabled;
      savedChannelTerminalSuppression = enabled;
    }),
  );
  onMount(() => {
    const refresh = () => {
      if (dialog?.open && selectedTab === "variables") refreshGmcpVariables();
    };
    window.addEventListener("darkwind:gmcp-variables-changed", refresh);
    return () => window.removeEventListener("darkwind:gmcp-variables-changed", refresh);
  });

  function save(close = true): void {
    if (!validateVariables() || !saveDefinitionDrafts()) return;
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
    if (channelTerminalSuppression !== savedChannelTerminalSuppression) {
      if (!session.setChannelTerminalSuppression(channelTerminalSuppression)) {
        status = "Terminal channel preference could not be saved while disconnected.";
        return;
      }
      savedChannelTerminalSuppression = channelTerminalSuppression;
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
    for (const editor of definitionEditors) editor?.commitRuntimeChanges();
    configuration = session.configuration.getSnapshot();
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
    for (const editor of definitionEditors) editor?.discardRuntimeChanges();
    originalConfiguration = null;
    return true;
  }
  export function close(): void {
    requestClose("discard");
  }
  function requestClose(intent: "discard" | "apply"): void {
    if (intent === "apply" && (!saveDefinitionDrafts() || !validateVariables())) return;
    closeIntent = intent;
    closeReturnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (settings.settingsBackupPromptEnabled && unsaved) {
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
    queueMicrotask(() => {
      const button = document.getElementById(`settings-tab-${tab}`);
      if (focus) button?.focus();
      // The mobile tab strip scrolls horizontally; keep the active tab in view.
      button?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
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
      (event.target instanceof Element && event.target.closest("button"))
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
  function saveDefinitionDrafts(): boolean {
    for (const [tab, editor] of [
      ["controls", keyMappingEditor],
      ["aliases", aliasEditor],
      ["triggers", triggerEditor],
      ["timers", timerEditor],
      ["functions", functionEditor],
      ["highlights", highlightEditor],
    ] as const) {
      if (!editor?.hasPendingChanges()) continue;
      selectTab(tab);
      if (!editor.savePending()) return false;
    }
    return true;
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
      <div class="header-copy">
        <h2 id="settings-title">Settings</h2>
        {#if unsaved}<span class="unsaved-badge">Unsaved changes</span>{/if}
      </div>
      <button
        class="toolbar-icon-btn header-close"
        type="button"
        aria-label="Close settings"
        onclick={close}><X size={16} /></button
      >
    </header>
    <div class="settings-layout">
      <nav aria-label="Settings sections">
        <div class="search-field">
          <span class="search-icon" aria-hidden="true"><Search size={14} /></span>
          <input
            aria-label="Search settings"
            type="search"
            bind:value={search}
            placeholder="Search settings"
          />
        </div>
        <div class="tablist" role="tablist" aria-orientation={mobile ? "horizontal" : "vertical"}>
          {#each groups as group (group)}
            <div class="tab-group">
              <h3>{group}</h3>
              <div class="tab-group-items">
                {#each tabs.filter((tab) => tab.group === group) as tab (tab.id)}
                  <button
                    id={`settings-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    class:dimmed={search.trim() !== "" && !matches(tab.id)}
                    aria-controls={`settings-panel-${tab.id}`}
                    aria-selected={!search.trim() && selectedTab === tab.id}
                    tabindex={!search.trim() && selectedTab === tab.id ? 0 : -1}
                    onclick={() => selectTab(tab.id)}
                    onkeydown={(event) => tabKeydown(event, tab.id)}>{tab.label}</button
                  >
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </nav>
      <div class="settings-content">
        {#if search.trim()}
          {@const matching = tabs.filter((tab) => matches(tab.id))}
          <p class="search-summary" aria-live="polite">
            {#if matching.length}
              Showing {matching.length}
              {matching.length === 1 ? "section" : "sections"} matching "{search.trim()}".
            {:else}
              Nothing matches "{search.trim()}". Try a different word.
            {/if}
          </p>
        {/if}
        <div
          class="settings-panel"
          id="settings-panel-connection"
          role="tabpanel"
          aria-labelledby="settings-tab-connection"
          hidden={panelHidden("connection")}
        >
          <div class="panel-heading">
            <h3>Connection</h3>
            <p>How Darkflow reaches the game and recovers when the link drops.</p>
          </div>
          <div class="settings-card connection-card">
            <div class="connection-card-copy">
              <h4>Current connection</h4>
              <code
                >{connection.endpoint.protocol}://{connection.endpoint.host}:{connection.endpoint
                  .port}</code
              >
              <p class="settings-help">{health.diagnosis.headline}</p>
            </div>
            <button
              class="dw-button settings-action"
              type="button"
              disabled={connection.state !== "connected"}
              onclick={() => session.disconnect()}>Disconnect</button
            >
          </div>
          <div class="settings-group">
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
          </div>
        </div>
        <div
          class="settings-panel"
          id="settings-panel-appearance"
          role="tabpanel"
          aria-labelledby="settings-tab-appearance"
          hidden={panelHidden("appearance")}
        >
          <div class="panel-heading">
            <h3>Appearance</h3>
            <p>Theme, background artwork, and how much of it shows through.</p>
          </div>
          <div class="settings-group">
            <label class="settings-row"
              ><span class="settings-copy"
                ><span class="settings-label">Theme</span>
                <span class="settings-help"
                  >Recolor the terminal and interface. Applies when you save or apply.</span
                ></span
              >
              <select aria-label="Theme" bind:value={theme}
                >{#each [...builtinThemes, ...Object.values(settings.customThemes)] as item (item.key)}<option
                    value={item.key}>{item.label}</option
                  >{/each}</select
              ></label
            >
            <div class="settings-row">
              <span class="settings-copy"
                ><span class="settings-label">Custom themes</span>
                <span class="settings-help"
                  >Add any VS Code color theme (.json) to the Theme list.</span
                ></span
              >
              <button class="dw-button settings-action" type="button" onclick={openThemeImport}
                ><FileUp size={14} aria-hidden="true" />Import VS Code theme</button
              >
              <input
                bind:this={themeInput}
                class="hidden-input"
                aria-label="Upload theme JSON"
                type="file"
                accept=".json,application/json"
                onchange={(event) => {
                  importTheme(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </div>
          </div>
          <fieldset>
            <legend>Background</legend>
            <p class="settings-help">Curated Darkflow artwork behind the workspace.</p>
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
                        class="background-none">No artwork</span
                      >{/if}
                  </span>
                  <span class="background-label">{preset.label}</span>
                </label>
              {/each}
            </div>
          </fieldset>
          <div class="settings-group">
            <label class="settings-row"
              ><span class="settings-copy"
                ><span class="settings-label">Side panel opacity</span><span class="settings-value"
                  >{settings.sideRailOpacity}%</span
                >
                <span class="settings-help">How solid the left and right panels appear.</span></span
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
                ><span class="settings-label">Terminal background opacity</span><span
                  class="settings-value">{settings.terminalBackgroundOpacity}%</span
                >
                <span class="settings-help"
                  >How much of the background shows through the terminal.</span
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
          </div>
          <fieldset>
            <legend>Visual effects</legend>
            <div class="settings-group">
              <SettingsCheckbox
                bind:checked={settings.visualEffectsEnabled}
                label="Game visual effects"
                help="Enable visual presentation across the game. Individual effects can be selected below without changing game text, controls, or combatbrief settings."
              />
              <details class="settings-disclosure">
                <summary
                  ><ChevronDown size={14} aria-hidden="true" /><span>Individual effects</span>
                  <span class="settings-count"
                    >{Object.values(settings.visualEffectPreferences).filter(Boolean).length} of
                    {visualEffectOptions.length} enabled</span
                  ></summary
                >
                <div class="settings-disclosure-body">
                  {#each visualEffectOptions as option (option.key)}<SettingsCheckbox
                      bind:checked={settings.visualEffectPreferences[option.key]}
                      label={option.label}
                      help={option.description}
                    />{/each}
                </div>
              </details>
            </div>
          </fieldset>
          <div class="settings-card action-card">
            <span class="settings-copy"
              ><span class="settings-label">Pane layout</span>
              <span class="settings-help"
                >Put every pane, dock, and the terminal window back where they started in this
                browser.</span
              ></span
            >
            <button class="dw-button settings-action" type="button" onclick={resetWorkspace}
              ><RotateCcw size={14} aria-hidden="true" />Reset layout</button
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
          <div class="panel-heading">
            <h3>Audio</h3>
            <p>Sound changes take effect right away.</p>
          </div>
          <div class="settings-group">
            <SettingsCheckbox
              checked={audio.enabled}
              label="Enable audio"
              help="Allow game-triggered sound effects in this browser."
              onchange={(checked) => session.audio.setEnabled(checked)}
            />
            <label class="settings-row"
              ><span class="settings-copy"
                ><span class="settings-label">Master volume</span><span class="settings-value"
                  >{Math.round(audio.volume * 100)}%</span
                >
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
                oninput={(event) =>
                  session.audio.setVolume(Number(event.currentTarget.value) / 100)}
              /></label
            >
          </div>
          <fieldset>
            <legend>Categories</legend>
            <p class="settings-help">Click a category to mute it; drag to set its level.</p>
            <div class="sound-widget-categories settings-sound-categories">
              {#each AUDIO_CATEGORIES as category (category.id)}
                {@const CategoryIcon = category.icon}
                {@const categoryPercent = Math.round(audio.categoryVolume[category.id] * 100)}
                <div
                  class="sound-widget-category"
                  class:enabled={audio.categoryEnabled[category.id]}
                  class:disabled={!audio.categoryEnabled[category.id]}
                  style:--sound-category-fill={`${categoryPercent}%`}
                  role="group"
                  aria-label={`${category.label} audio`}
                >
                  <button
                    class="sound-widget-category-toggle"
                    type="button"
                    title={`${audio.categoryEnabled[category.id] ? "Mute" : "Unmute"} ${category.label}`}
                    aria-label={category.label}
                    aria-pressed={audio.categoryEnabled[category.id]}
                    onclick={() =>
                      session.audio.setCategoryEnabled(
                        category.id,
                        !audio.categoryEnabled[category.id],
                      )}
                  >
                    <span class="sound-widget-category-icon"><CategoryIcon size={16} /></span>
                    <span class="sound-widget-category-label">{category.label}</span>
                    <span class="sound-widget-category-percent">{categoryPercent}%</span>
                  </button>
                  <input
                    class="sound-widget-category-volume"
                    type="range"
                    min="0"
                    max="100"
                    value={categoryPercent}
                    disabled={!audio.categoryEnabled[category.id]}
                    aria-label={`${category.label} volume`}
                    title={`${category.label} volume: ${categoryPercent}%`}
                    oninput={(event) =>
                      session.audio.setCategoryVolume(
                        category.id,
                        Number(event.currentTarget.value) / 100,
                      )}
                  />
                </div>
              {/each}
            </div>
          </fieldset>
        </div>
        <div
          class="settings-panel"
          id="settings-panel-controls"
          role="tabpanel"
          aria-labelledby="settings-tab-controls"
          hidden={panelHidden("controls")}
        >
          <div class="panel-heading">
            <h3>Controls</h3>
            <p>Command input, completion, and keyboard shortcuts.</p>
          </div>
          <div class="settings-group">
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
          </div>
          <fieldset>
            <legend>Global shortcuts</legend>
            <div class="settings-group">
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
            </div>
          </fieldset>
          <div class="settings-section">
            <h4 class="section-title">Key mappings</h4>
            <div class="settings-group">
              <SettingsCheckbox
                bind:checked={settings.keyMapperEnabled}
                label="Enable custom key mappings"
                help="Bind keys like ArrowUp or 1 to send commands immediately without pressing Enter."
              />
            </div>
            <div class="key-mapping-editor" hidden={!settings.keyMapperEnabled}>
              {#if open}<DefinitionEditor
                  bind:this={keyMappingEditor}
                  {session}
                  kind="keyMappings"
                />{/if}
            </div>
          </div>
          <fieldset>
            <legend>Session</legend>
            <div class="settings-group">
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
          </fieldset>
        </div>
        <div
          class="settings-panel"
          id="settings-panel-terminal"
          role="tabpanel"
          aria-labelledby="settings-tab-terminal"
          hidden={panelHidden("terminal")}
        >
          <div class="panel-heading">
            <h3>Terminal</h3>
            <p>Font, history, and how game output is presented.</p>
          </div>
          <div class="settings-group">
            <div
              class="settings-row"
              role="group"
              aria-labelledby="terminal-font-label"
              aria-describedby="terminal-font-help"
            >
              <span class="settings-copy"
                ><span class="settings-label" id="terminal-font-label">Font</span>
                <span class="settings-help" id="terminal-font-help"
                  >Choose the font family and size used for terminal output. Previews as you change
                  it.</span
                ></span
              >
              <div class="terminal-font-controls">
                <select
                  aria-label="Terminal font family"
                  aria-describedby="terminal-font-help"
                  value={settings.terminalFontFamily ?? ""}
                  onchange={(event) => previewTerminalFontFamily(event.currentTarget.value)}
                  ><option value="">Default</option
                  >{#each TERMINAL_FONT_FAMILIES as family (family.value)}<option
                      value={family.value}>{family.label}</option
                    >{/each}</select
                ><select
                  class="terminal-font-size"
                  aria-label="Terminal font size"
                  aria-describedby="terminal-font-help"
                  value={settings.terminalFontSize ?? ""}
                  onchange={(event) => previewTerminalFontSize(event.currentTarget.value)}
                  ><option value="">Default</option
                  >{#each TERMINAL_FONT_SIZES as size (size)}<option value={size}>{size} px</option
                    >{/each}</select
                >
              </div>
            </div>
            <label class="settings-row"
              ><span class="settings-copy"
                ><span class="settings-label">Screen width</span>
                <span class="settings-help" id="screen-width-help"
                  >Leave blank for automatic pane width, or enter a fixed column width for
                  server-side wrapping.</span
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
          </div>
          <fieldset>
            <legend>Scrollback</legend>
            <div class="settings-group">
              <label class="settings-row"
                ><span class="settings-copy"
                  ><span class="settings-label">Scrollback memory</span>
                  <span class="settings-help" id="scrollback-memory-help"
                    >Choose how much terminal history to retain before the oldest lines are
                    discarded.</span
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
                    >Choose whether scrolling back pauses the terminal or opens a split view with
                    live output below.</span
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
              <label
                class="settings-row"
                class:settings-row-muted={settings.scrollbackBehavior !== "split"}
                ><span class="settings-copy"
                  ><span class="settings-label">Split history size</span><span
                    class="settings-value">{Math.round(settings.scrollbackSplitRatio * 100)}%</span
                  >
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
            </div>
          </fieldset>
          <fieldset>
            <legend>Output</legend>
            <div class="settings-group">
              <SettingsCheckbox
                bind:checked={channelTerminalSuppression}
                label="Mute channel messages in the terminal"
                help="Store this character preference in the game and show eligible channel messages only in Darkflow Chat. Unsupported clients and screen-reader mode keep terminal text."
              />
              <SettingsCheckbox
                bind:checked={settings.screenReaderMode}
                label="Screen reader announcements"
                help="Mirror new terminal lines into a hidden polite live region for browser screen readers."
              />
            </div>
          </fieldset>
          <div class="settings-card action-card">
            <span class="settings-copy"
              ><span class="settings-label">Game screen reader setting</span>
              <span class="settings-help" id="game-screen-reader-help"
                >This sends <code>set screenreader on</code> to the game. It changes your saved MUD setting
                only when you press the button.</span
              ></span
            >
            <button
              class="dw-button settings-action"
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
          <div class="panel-heading">
            <h3>Aliases</h3>
            <p>Short commands that expand into one or more steps when you send them.</p>
          </div>
          {#if open}<DefinitionEditor bind:this={aliasEditor} {session} kind="aliases" />{/if}
        </div>
        <div
          class="settings-panel"
          id="settings-panel-triggers"
          role="tabpanel"
          aria-labelledby="settings-tab-triggers"
          hidden={panelHidden("triggers")}
        >
          <div class="panel-heading">
            <h3>Triggers</h3>
            <p>Watch game output for a pattern and react automatically.</p>
          </div>
          {#if open}<DefinitionEditor bind:this={triggerEditor} {session} kind="triggers" />{/if}
        </div>
        <div
          class="settings-panel"
          id="settings-panel-timers"
          role="tabpanel"
          aria-labelledby="settings-tab-timers"
          hidden={panelHidden("timers")}
        >
          <div class="panel-heading">
            <h3>Timers</h3>
            <p>Run steps once or on a schedule, started by hand, on connect, or from a step.</p>
          </div>
          {#if open}<DefinitionEditor bind:this={timerEditor} {session} kind="timers" />{/if}
        </div>
        <div
          class="settings-panel"
          id="settings-panel-functions"
          role="tabpanel"
          aria-labelledby="settings-tab-functions"
          hidden={panelHidden("functions")}
        >
          <div class="panel-heading">
            <h3>Functions</h3>
            <p>Reusable scripts that aliases, triggers, and timers can call with arguments.</p>
          </div>
          {#if open}<DefinitionEditor bind:this={functionEditor} {session} kind="functions" />{/if}
        </div>
        <div
          class="settings-panel"
          id="settings-panel-highlights"
          role="tabpanel"
          aria-labelledby="settings-tab-highlights"
          hidden={panelHidden("highlights")}
        >
          <div class="panel-heading">
            <h3>Highlights</h3>
            <p>Recolor matching text in the terminal so it stands out.</p>
          </div>
          {#if open}<DefinitionEditor
              bind:this={highlightEditor}
              {session}
              kind="highlights"
            />{/if}
        </div>
        <div
          class="settings-panel"
          id="settings-panel-variables"
          role="tabpanel"
          aria-labelledby="settings-tab-variables"
          hidden={panelHidden("variables")}
        >
          <div class="panel-heading">
            <h3>Variables</h3>
            <p>Values your automations can read with $name.</p>
          </div>
          <div class="settings-card">
            <div class="card-heading">
              <h4>Persistent variables</h4>
              <p class="settings-help">
                Persistent variables back aliases like $pack. Aliases can also write to them with
                Set variable steps.
              </p>
            </div>
            {#if variables.length}
              <div class="variable-table">
                <div class="variable-table-head" aria-hidden="true">
                  <span>Name</span><span>Value</span><span></span>
                </div>
                {#each variables as variable, index (index)}
                  {@const references = variableReferences(variable.name)}
                  <div class="variable-row">
                    <label
                      ><span class="sr-only">Name</span><input
                        id={`settings-variable-name-${index}`}
                        bind:value={variable.name}
                        pattern=".*\S.*"
                        placeholder="name"
                        required
                      /></label
                    >
                    <label
                      ><span class="sr-only">Value</span><input
                        bind:value={variable.value}
                        placeholder="value"
                      /></label
                    >
                    <button
                      class="toolbar-icon-btn danger"
                      type="button"
                      aria-label="Remove"
                      title={`Remove ${variable.name.trim() || "variable"}`}
                      onclick={() => variables.splice(index, 1)}><Trash size={14} /></button
                    >
                    <div class="variable-references">
                      {#if references.length}
                        <details class="settings-disclosure">
                          <summary
                            ><ChevronDown size={12} aria-hidden="true" /><span
                              >{references.length} alias reference{references.length === 1
                                ? ""
                                : "s"}</span
                            ></summary
                          >
                          <div class="variable-reference-list">
                            {#each references as reference (reference.id)}
                              <button
                                class="dw-button dw-button-ghost"
                                type="button"
                                onclick={() => openAlias(reference.id)}
                              >
                                {reference.description
                                  ? `${reference.description} (${reference.trigger})`
                                  : reference.trigger}
                              </button>
                            {/each}
                          </div>
                        </details>
                      {:else}
                        <span class="settings-help">0 alias references</span>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="empty-state">
                <p>
                  No variables yet. Add one here, or open Aliases and write a Set variable step.
                </p>
                <button
                  class="dw-button dw-button-ghost"
                  type="button"
                  onclick={() => selectTab("aliases")}>Open Aliases</button
                >
              </div>
            {/if}
            <div class="card-actions">
              <button class="dw-button" type="button" onclick={addVariable}
                ><Plus size={14} aria-hidden="true" />Add variable</button
              >
              <p class="settings-help">Variables are saved for this character.</p>
            </div>
          </div>
          <div class="settings-card gmcp-variables-card">
            <div class="card-heading">
              <h4>GMCP variables</h4>
              <p class="settings-help">
                Live runtime variables from GMCP messages. They are available to automations, clear
                on reconnect, and are not saved.
              </p>
            </div>
            <div class="search-field">
              <span class="search-icon" aria-hidden="true"><Search size={14} /></span>
              <input
                aria-label="Search GMCP variables"
                type="search"
                placeholder="Filter by name or value"
                value={gmcpSearch}
                oninput={(event) => updateGmcpSearch(event.currentTarget.value)}
              />
            </div>
            <p class="settings-help" role="status" aria-live="polite">
              Showing {gmcpRangeStart}-{gmcpRangeEnd} of {filteredGmcpVariables.length} matching {gmcpVariables.length}
              total GMCP variables.
            </p>
            {#if !gmcpVariables.length}
              <div class="empty-state">
                <p>No GMCP variables have been received yet.</p>
              </div>
            {:else if !filteredGmcpVariables.length}
              <div class="empty-state">
                <p>No GMCP variables match your search.</p>
              </div>
            {:else}
              <div class="gmcp-pagination" role="group" aria-label="Top GMCP pagination">
                <button
                  class="dw-button"
                  type="button"
                  disabled={effectiveGmcpPage === 1}
                  onclick={() => gmcpPage--}>Previous</button
                >
                <span>Page {effectiveGmcpPage} of {gmcpPageCount}</span>
                <button
                  class="dw-button"
                  type="button"
                  disabled={effectiveGmcpPage === gmcpPageCount}
                  onclick={() => gmcpPage++}>Next</button
                >
              </div>
              <div class="variable-table gmcp-variable-table">
                <div class="variable-table-head" aria-hidden="true">
                  <span>Name</span><span>Value</span>
                </div>
                {#each visibleGmcpVariables as variable (variable.name)}
                  <div class="variable-row gmcp-variable-row">
                    <label
                      ><span class="sr-only">Name</span><input
                        aria-label={`GMCP Name ${variable.name}`}
                        value={variable.name}
                        readonly
                      /></label
                    >
                    <label
                      ><span class="sr-only">Value</span><input
                        aria-label={`GMCP Value ${variable.name}`}
                        value={variable.value}
                        readonly
                      /></label
                    >
                  </div>
                {/each}
              </div>
              <div class="gmcp-pagination" role="group" aria-label="Bottom GMCP pagination">
                <button
                  class="dw-button"
                  type="button"
                  disabled={effectiveGmcpPage === 1}
                  onclick={() => gmcpPage--}>Previous</button
                >
                <span>Page {effectiveGmcpPage} of {gmcpPageCount}</span>
                <button
                  class="dw-button"
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
          <div class="panel-heading">
            <h3>Debug</h3>
            <p>Tools for inspecting what the game sends to the client.</p>
          </div>
          <div class="settings-group">
            <SettingsCheckbox
              bind:checked={settings.gmcpDebugEnabled}
              label="Enable GMCP Debug"
              help="Show received GMCP messages in the GMCP Debug panel."
            />
          </div>
        </div>
        <div
          class="settings-panel"
          id="settings-panel-about"
          role="tabpanel"
          aria-labelledby="settings-tab-about"
          hidden={panelHidden("about")}
        >
          <div class="panel-heading">
            <h3>About</h3>
          </div>
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
              <p class="settings-help">
                Web-based MUD client - built for <a
                  href="https://play.darkwind.ai"
                  target="_blank"
                  rel="noopener noreferrer">Darkwind</a
                >
              </p>
            </div>
          </div>
          <div class="settings-card">
            <div class="card-heading">
              <h4>Client version</h4>
              <p class="settings-help">{clientVersion || "unknown"}</p>
            </div>
          </div>
          <div class="settings-card">
            <div class="card-heading">
              <h4>GMCP packages</h4>
              <p class="settings-help">
                Darkflow extends GMCP with Darkwind-specific packages for panels, mapping, and the
                in-browser IDE.
              </p>
            </div>
            <a
              class="settings-link"
              href="https://github.com/jasona/darkflow/tree/main/docs"
              target="_blank"
              rel="noopener noreferrer"
              >See custom GMCP extensions <span aria-hidden="true">&#8599;</span></a
            >
          </div>
        </div>
      </div>
    </div>
    <footer>
      <div class="footer-secondary">
        <button class="dw-button dw-button-ghost" type="button" onclick={() => exportSettings()}
          ><Download size={14} aria-hidden="true" />Export settings</button
        >
        <button
          bind:this={importAction}
          class="dw-button dw-button-ghost"
          type="button"
          onclick={openImport}><Upload size={14} aria-hidden="true" />Import settings</button
        >
      </div>
      <p class="footer-status" class:error={invalidStoredSettings} role="status" aria-live="polite">
        {status}
      </p>
      <div class="footer-primary">
        <button class="dw-button" type="button" onclick={close}>Close</button>
        <button class="dw-button" type="button" onclick={() => save(false)}>Apply</button>
        <button class="dw-button dw-button-primary" type="submit">Save & Close</button>
      </div>
    </footer>
  </form>
  <input
    bind:this={importInput}
    class="hidden-file-input hidden-input"
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
        <ul class="confirmation-summary">
          <li>
            {preparedImport.preview.profiles} character profile{preparedImport.preview.profiles ===
            1
              ? ""
              : "s"}
            and {preparedImport.preview.configurationSets} shared configuration set{preparedImport
              .preview.configurationSets === 1
              ? ""
              : "s"}
          </li>
          <li>Replaces {preparedImport.preview.owners.join(", ")}</li>
        </ul>
        {#if preparedImport.preview.legacyLayoutWarning}<p class="confirmation-warning">
            <TriangleAlert size={14} aria-hidden="true" />{preparedImport.preview
              .legacyLayoutWarning}
          </p>{/if}
        <div class="confirmation-actions">
          <button class="dw-button" type="button" disabled={importing} onclick={dismissImport}
            >Cancel</button
          ><button
            bind:this={importConfirm}
            class="dw-button dw-button-primary"
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
        <div class="confirmation-actions">
          <button
            bind:this={backupButton}
            class="dw-button dw-button-primary"
            type="button"
            onclick={() => exportSettings() && finishClose()}
            ><Download size={14} aria-hidden="true" />Download backup</button
          >
          <button class="dw-button" type="button" onclick={finishClose}>Skip</button>
          <span class="confirmation-spacer"></span>
          <button class="dw-button dw-button-ghost" type="button" onclick={neverAskAgain}
            >Never ask again</button
          >
          <button
            class="dw-button dw-button-ghost"
            type="button"
            onclick={() => {
              closePrompt = false;
              queueMicrotask(() => closeReturnFocus?.focus());
            }}>Continue editing</button
          >
        </div>
      </div>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    --sd-control-h: 2.25rem;
    --sd-radius: 6px;
    --sd-gap: 0.75rem;
    --sd-border-soft: color-mix(in srgb, var(--df-border, #30363d) 70%, transparent);
    --sd-group-bg: color-mix(in srgb, var(--df-panel, #161b22) 55%, var(--df-bg, #0d1117));
    position: fixed;
    z-index: 4000;
    box-sizing: border-box;
    min-width: min(560px, calc(100vw - 16px));
    min-height: min(560px, calc(100dvh - 16px));
    max-width: calc(100vw - 16px);
    max-height: calc(100dvh - 16px);
    margin: 0;
    padding: 0;
    border: 1px solid var(--df-border, #30363d);
    border-radius: 10px;
    resize: both;
    overflow: hidden;
    background: var(--df-panel, #161b22);
    color: var(--df-text, #c9d1d9);
    box-shadow: 0 24px 64px rgb(0 0 0 / 45%);
  }
  @media (pointer: coarse) {
    dialog {
      --sd-control-h: 2.75rem;
    }
  }

  /* Shared control styling for every input, select, textarea, and button inside the
     dialog, including the automation editors rendered as child components. */
  dialog
    :global(
      :is(
        input:not([type="checkbox"], [type="radio"], [type="range"], [type="file"]),
        select,
        textarea
      )
    ) {
    box-sizing: border-box;
    min-height: var(--sd-control-h);
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--df-border, #30363d);
    border-radius: var(--sd-radius);
    background: var(--df-bg, #0d1117);
    color: var(--df-text, #c9d1d9);
    font: inherit;
    font-size: 13px;
    transition: border-color 120ms ease;
  }
  dialog :global(:is(input, select, textarea):hover:not(:disabled, [readonly])) {
    border-color: var(--df-border-muted, #484f58);
  }
  dialog :global(:is(input, select, textarea)[readonly]) {
    color: var(--df-muted, #8b949e);
    cursor: default;
  }
  dialog :global(select) {
    padding-right: 1.75rem;
    appearance: none;
    background-image:
      linear-gradient(45deg, transparent 50%, var(--df-muted, #8b949e) 50%),
      linear-gradient(135deg, var(--df-muted, #8b949e) 50%, transparent 50%);
    background-position:
      calc(100% - 0.95rem) 50%,
      calc(100% - 0.65rem) 50%;
    background-size:
      0.3rem 0.3rem,
      0.3rem 0.3rem;
    background-repeat: no-repeat;
    cursor: pointer;
  }
  dialog :global(textarea) {
    min-height: 5rem;
    line-height: 1.4;
    resize: vertical;
    font-family: var(--df-font-mono, monospace);
    font-size: 12.5px;
  }
  dialog :global(:is(input[type="checkbox"], input[type="radio"], input[type="range"])) {
    accent-color: var(--df-accent, #42d6c9);
  }
  dialog :global(input[type="range"]) {
    width: 100%;
    margin: 0;
    cursor: pointer;
  }
  dialog :global(:is(input, select, textarea, button, a, summary, [tabindex]):focus-visible) {
    outline: 2px solid var(--df-accent-blue, #58a6ff);
    outline-offset: 2px;
  }
  dialog :global(.dw-button) {
    display: inline-flex;
    min-height: var(--sd-control-h);
    padding: 0 0.85rem;
    gap: 0.4rem;
    align-items: center;
    justify-content: center;
    border-radius: var(--sd-radius);
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    transition:
      background-color 120ms ease,
      border-color 120ms ease,
      color 120ms ease;
  }
  dialog :global(.dw-button:disabled) {
    cursor: not-allowed;
    opacity: 0.5;
  }
  dialog :global(.dw-button:disabled:hover) {
    background: var(--df-btn-secondary, #21262d);
  }
  dialog :global(.dw-button-primary:disabled:hover) {
    background: var(--df-btn-bg, #238636);
  }
  dialog :global(.dw-button-ghost) {
    border-color: transparent;
    background: transparent;
    color: var(--df-muted, #8b949e);
  }
  dialog :global(.dw-button-ghost:hover:not(:disabled)) {
    border-color: var(--df-border, #30363d);
    background: var(--df-btn-secondary, #21262d);
    color: var(--df-text, #c9d1d9);
  }
  dialog :global(.dw-button-danger) {
    border-color: color-mix(in srgb, var(--df-err, #f85149) 45%, transparent);
    color: var(--df-err, #f85149);
  }
  dialog :global(.dw-button-danger:hover:not(:disabled)) {
    border-color: var(--df-err, #f85149);
    background: color-mix(in srgb, var(--df-err, #f85149) 14%, transparent);
  }
  dialog :global(.toolbar-icon-btn) {
    width: 28px;
    height: 28px;
    flex: none;
  }
  dialog :global(.toolbar-icon-btn:disabled) {
    cursor: not-allowed;
    opacity: 0.4;
  }
  dialog :global(.toolbar-icon-btn.danger),
  dialog :global(.toolbar-icon-btn.danger:hover) {
    border-color: color-mix(in srgb, var(--df-err, #f85149) 45%, transparent);
    color: var(--df-err, #f85149);
  }
  dialog :global(.toolbar-icon-btn.danger:hover:not(:disabled)) {
    background: color-mix(in srgb, var(--df-err, #f85149) 14%, transparent);
  }
  dialog :global(code) {
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    background: var(--df-elevated, #21262d);
    font-family: var(--df-font-mono, monospace);
    font-size: 0.9em;
  }
  dialog :global(.sr-only) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  form {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: 100%;
  }
  header,
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sd-gap);
    padding: 0.6rem 0.9rem;
  }
  header {
    border-bottom: 1px solid var(--df-border, #30363d);
    cursor: move;
    user-select: none;
    background: linear-gradient(90deg, rgb(66 214 201 / 7%), transparent 40%);
  }
  .header-copy {
    display: flex;
    min-width: 0;
    gap: 0.6rem;
    align-items: baseline;
  }
  header h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .unsaved-badge {
    padding: 0.1rem 0.5rem;
    border: 1px solid color-mix(in srgb, var(--df-warn, #d29922) 45%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--df-warn, #d29922) 12%, transparent);
    color: var(--df-warn, #d29922);
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
  }
  .header-close {
    cursor: pointer;
  }
  footer {
    border-top: 1px solid var(--df-border, #30363d);
    background: var(--sd-group-bg);
  }
  .footer-secondary,
  .footer-primary {
    display: flex;
    flex: none;
    gap: 0.5rem;
  }
  .footer-status {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--df-muted, #8b949e);
    font-size: 12.5px;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .footer-status.error {
    color: var(--df-err, #ff6b6b);
  }
  .hidden-input {
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
    backdrop-filter: blur(2px);
  }
  .settings-confirmation {
    display: grid;
    gap: 0.75rem;
    width: min(34rem, 100%);
    padding: 1.1rem 1.2rem;
    border: 1px solid var(--df-border, #30363d);
    border-radius: 10px;
    background: var(--df-panel, #161b22);
    box-shadow: 0 16px 48px rgb(0 0 0 / 50%);
  }
  .settings-confirmation h3 {
    margin: 0;
    font-size: 1rem;
  }
  .settings-confirmation p {
    margin: 0;
  }
  .confirmation-summary {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding-left: 1.1rem;
    color: var(--df-muted, #8b949e);
    font-size: 12.5px;
  }
  .confirmation-warning {
    display: flex;
    gap: 0.4rem;
    align-items: flex-start;
    padding: 0.5rem 0.65rem;
    border: 1px solid color-mix(in srgb, var(--df-warn, #d29922) 45%, transparent);
    border-radius: var(--sd-radius);
    background: color-mix(in srgb, var(--df-warn, #d29922) 10%, transparent);
    color: var(--df-warn, #d29922);
    font-size: 12.5px;
  }
  .confirmation-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin-top: 0.25rem;
  }
  .confirmation-spacer {
    flex: 1 1 auto;
  }

  .settings-layout {
    display: grid;
    grid-template-columns: 184px minmax(0, 1fr);
    min-height: 0;
  }
  nav {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 0.6rem 0.75rem 0.75rem;
    border-right: 1px solid var(--df-border, #30363d);
    overflow-y: auto;
    background: var(--sd-group-bg);
  }
  .search-field {
    position: relative;
    display: flex;
    min-width: 0;
    align-items: center;
  }
  .search-field .search-icon {
    position: absolute;
    left: 0.6rem;
    display: flex;
    color: var(--df-muted, #8b949e);
    pointer-events: none;
  }
  dialog .search-field :global(input) {
    width: 100%;
    padding-left: 1.9rem;
  }
  .tablist {
    display: grid;
    gap: 0.5rem;
  }
  .tab-group {
    display: grid;
    gap: 0.2rem;
  }
  .tablist h3 {
    margin: 0;
    padding: 0 0 0.25rem 0.25rem;
    border-bottom: 1px solid var(--sd-border-soft);
    color: var(--df-text-strong, #f0f6fc);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .tab-group-items {
    display: grid;
    gap: 1px;
    margin-left: 0.4rem;
    padding-left: 0.35rem;
    border-left: 1px solid var(--sd-border-soft);
  }
  .tablist button {
    position: relative;
    min-height: 1.75rem;
    padding: 0.2rem 0.6rem;
    border: 0;
    border-radius: var(--sd-radius);
    background: transparent;
    color: var(--df-text, #c9d1d9);
    text-align: left;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      color 120ms ease,
      opacity 120ms ease;
  }
  .tablist button:hover {
    background: rgb(255 255 255 / 6%);
  }
  .tablist button[aria-selected="true"] {
    background: color-mix(in srgb, var(--df-accent, #42d6c9) 14%, transparent);
    color: var(--df-text-strong, #f0f6fc);
    font-weight: 500;
  }
  .tablist button[aria-selected="true"]::before {
    content: "";
    position: absolute;
    top: 0.35rem;
    bottom: 0.35rem;
    left: 0;
    width: 3px;
    border-radius: 999px;
    background: var(--df-accent, #42d6c9);
  }
  .tablist button.dimmed {
    opacity: 0.4;
  }

  .settings-content {
    min-width: 0;
    padding: 1rem 1.25rem 1.25rem;
    overflow: auto;
    scroll-padding-top: 1rem;
  }
  .search-summary {
    margin: 0 0 1rem;
    padding: 0.5rem 0.75rem;
    border: 1px dashed var(--df-border, #30363d);
    border-radius: var(--sd-radius);
    color: var(--df-muted, #8b949e);
    font-size: 12.5px;
  }
  .settings-panel {
    display: grid;
    gap: 1rem;
  }
  .settings-panel:not([hidden]) ~ .settings-panel:not([hidden]) {
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--df-border, #30363d);
  }
  .settings-panel[hidden] {
    display: none;
  }
  .panel-heading {
    display: grid;
    gap: 0.2rem;
  }
  .panel-heading h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
  }
  .panel-heading p {
    margin: 0;
    color: var(--df-muted, #8b949e);
    font-size: 12.5px;
  }
  h4 {
    margin: 0;
    font-size: 13.5px;
    font-weight: 600;
  }

  fieldset,
  .settings-section {
    display: grid;
    min-width: 0;
    margin: 0;
    padding: 0;
    gap: 0.5rem;
    border: 0;
  }
  legend,
  .section-title {
    padding: 0;
    margin: 0 0 0.15rem;
    color: var(--df-text-strong, #f0f6fc);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  fieldset > .settings-help {
    margin-top: -0.3rem;
  }

  .settings-group {
    display: grid;
    overflow: hidden;
    border: 1px solid var(--df-border, #30363d);
    border-radius: 8px;
    background: var(--sd-group-bg);
  }
  .settings-group > :global(*) {
    padding: 0.65rem 0.85rem;
  }
  .settings-group > :global(* + *) {
    border-top: 1px solid var(--sd-border-soft);
  }
  .settings-group > :global(.settings-checkbox-row:hover),
  .settings-group > :global(.settings-row:hover) {
    background: rgb(255 255 255 / 2.5%);
  }

  .settings-card {
    display: grid;
    gap: 0.6rem;
    padding: 0.85rem;
    border: 1px solid var(--df-border, #30363d);
    border-radius: 8px;
    background: var(--sd-group-bg);
  }
  .card-heading {
    display: grid;
    gap: 0.2rem;
  }
  .card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }
  .action-card,
  .connection-card {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }
  .connection-card-copy {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
  }
  .connection-card code {
    justify-self: start;
    overflow-wrap: anywhere;
  }
  .settings-copy,
  .settings-label,
  .settings-help {
    display: block;
    min-width: 0;
  }
  .settings-label {
    display: inline;
    font-weight: 500;
  }
  .settings-help {
    margin: 0;
    color: var(--df-muted, #8b949e);
    font-size: 12.5px;
    line-height: 1.4;
  }
  .settings-label ~ .settings-help {
    margin-top: 0.15rem;
  }
  .settings-help code {
    font-size: 11.5px;
  }
  .settings-value {
    margin-left: 0.35rem;
    color: var(--df-accent, #42d6c9);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    font-size: 12px;
  }
  .settings-action {
    align-self: center;
    width: fit-content;
  }
  .settings-link {
    justify-self: start;
    color: var(--df-accent-blue, #58a6ff);
  }
  .about-card {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.9rem;
  }
  .about-card img {
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 10px;
  }
  .about-card h4 {
    font-size: 15px;
  }
  .about-card a {
    color: var(--df-accent-blue, #58a6ff);
  }

  .settings-row {
    display: grid;
    grid-template-columns: minmax(10rem, 1fr) minmax(10rem, 17rem);
    align-items: center;
    gap: 1rem;
  }
  .settings-row-muted {
    opacity: 0.6;
  }
  .settings-row :global(select),
  .settings-row :global(input:not([type="file"])) {
    width: 100%;
  }
  .settings-row .settings-action {
    justify-self: end;
    width: auto;
  }
  .terminal-font-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 6rem;
    gap: 0.5rem;
  }

  .settings-disclosure {
    display: grid;
    gap: 0.5rem;
  }
  .settings-disclosure summary {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    width: fit-content;
    border-radius: 4px;
    color: var(--df-text, #c9d1d9);
    font-size: 13px;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  .settings-disclosure summary::-webkit-details-marker {
    display: none;
  }
  .settings-disclosure summary :global(svg) {
    color: var(--df-muted, #8b949e);
    transition: transform 150ms ease;
  }
  .settings-disclosure[open] > summary :global(svg) {
    transform: rotate(180deg);
  }
  .settings-count {
    margin-left: 0.25rem;
    color: var(--df-muted, #8b949e);
    font-size: 12px;
  }
  .settings-disclosure-body {
    display: grid;
    gap: 0.6rem;
    padding: 0.25rem 0 0.25rem 1.1rem;
    border-left: 2px solid var(--sd-border-soft);
  }
  .key-mapping-editor[hidden] {
    display: none;
  }

  .background-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
    gap: 0.6rem;
  }
  .background-choice {
    position: relative;
    display: grid;
    gap: 0.3rem;
    cursor: pointer;
    font-size: 12px;
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
    border-radius: 6px;
    background: var(--df-bg, #0d1117);
    box-shadow: inset 0 0 0 1px var(--df-border, #30363d);
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease,
      filter 120ms ease,
      transform 120ms ease;
  }
  .background-choice:hover .background-preview {
    filter: brightness(1.14);
    transform: translateY(-1px);
  }
  .background-choice:has(input:checked) .background-preview,
  .background-choice:has(input:focus-visible) .background-preview {
    border-color: var(--df-accent, #42d6c9);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--df-accent, #42d6c9) 35%, transparent);
  }
  .background-choice:has(input:checked) .background-label {
    color: var(--df-accent, #42d6c9);
    font-weight: 500;
  }
  .background-label {
    color: var(--df-muted, #8b949e);
  }
  .background-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .background-none {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    background: var(--df-bg, #0d1117);
    color: var(--df-faint, #6e7681);
    font-size: 11px;
  }

  .settings-sound-categories {
    margin-top: 0.25rem;
  }

  .variable-table {
    display: grid;
    gap: 0.4rem;
  }
  .variable-table-head,
  .variable-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) 28px;
    gap: 0.5rem;
    align-items: center;
  }
  .gmcp-variable-table .variable-table-head,
  .gmcp-variable-row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  }
  .variable-table-head {
    padding: 0 0.6rem;
    color: var(--df-muted, #8b949e);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .variable-row label {
    display: block;
    min-width: 0;
  }
  .variable-row :global(input) {
    width: 100%;
  }
  .gmcp-variable-row :global(input) {
    font-family: var(--df-font-mono, monospace);
    font-size: 12px;
  }
  .variable-references {
    grid-column: 1 / -1;
    padding-left: 0.6rem;
  }
  .variable-references .settings-help {
    font-size: 11.5px;
  }
  .variable-references summary {
    font-size: 12px;
  }
  .variable-reference-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    padding-left: 1rem;
  }
  .variable-reference-list .dw-button {
    overflow-wrap: anywhere;
    white-space: normal;
  }
  .empty-state {
    display: grid;
    gap: 0.6rem;
    justify-items: start;
    padding: 0.85rem;
    border: 1px dashed var(--df-border, #30363d);
    border-radius: var(--sd-radius);
  }
  .empty-state p {
    margin: 0;
    color: var(--df-muted, #8b949e);
    font-size: 12.5px;
  }
  .gmcp-variables-card {
    margin-top: 0.25rem;
  }
  .gmcp-pagination {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    color: var(--df-muted, #8b949e);
    font-size: 12.5px;
  }
  .gmcp-pagination span {
    padding: 0 0.25rem;
    font-variant-numeric: tabular-nums;
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
    .settings-layout {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
    }
    nav {
      gap: 0.4rem;
      padding: 0.6rem 0.75rem 0;
      border-right: 0;
      border-bottom: 1px solid var(--df-border, #30363d);
      overflow: visible;
    }
    .tablist {
      display: flex;
      gap: 0.15rem;
      margin: 0 -0.75rem;
      padding: 0 0.75rem;
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      mask-image: linear-gradient(
        90deg,
        transparent,
        #000 0.75rem,
        #000 calc(100% - 1.5rem),
        transparent
      );
    }
    .tablist::-webkit-scrollbar {
      display: none;
    }
    .tab-group,
    .tab-group-items {
      display: contents;
    }
    .tablist h3 {
      display: none;
    }
    .tablist button {
      flex: 0 0 auto;
      min-height: 2.25rem;
      padding: 0.4rem 0.6rem;
      border-radius: 0;
      scroll-margin-inline: 1.5rem;
    }
    .tablist button[aria-selected="true"] {
      background: transparent;
      box-shadow: inset 0 -2px 0 var(--df-accent, #42d6c9);
    }
    .tablist button[aria-selected="true"]::before {
      display: none;
    }
    .settings-content {
      padding: 0.9rem 0.85rem 1rem;
    }
    .settings-row,
    .action-card,
    .connection-card {
      grid-template-columns: 1fr;
      gap: 0.5rem;
    }
    .settings-row .settings-action {
      justify-self: start;
    }
    .variable-table-head {
      display: none;
    }
    .variable-row {
      grid-template-columns: minmax(0, 1fr) 28px;
    }
    .variable-row label:nth-of-type(2) {
      grid-column: 1 / -1;
    }
    .gmcp-variable-row {
      grid-template-columns: 1fr;
      gap: 0.3rem;
      padding-top: 0.4rem;
      border-top: 1px solid var(--sd-border-soft);
    }
    footer {
      flex-wrap: wrap;
    }
    .footer-status {
      flex-basis: 100%;
      order: -1;
      text-align: left;
      white-space: normal;
    }
    .footer-status:empty {
      display: none;
    }
    .footer-secondary {
      flex: 1 1 auto;
    }
    .footer-primary {
      flex: 1 1 100%;
    }
    .footer-primary .dw-button-primary {
      flex: 1 1 auto;
    }
  }
</style>
