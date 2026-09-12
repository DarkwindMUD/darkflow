import type { SessionVisualEffectPreferences } from "../runtime/visual-effects";
// @ts-expect-error Retained visual-effect settings are JavaScript without declarations.
import * as visualEffectSettings from "../../public/js/visual-effects-settings.mjs";
// @ts-expect-error Retained background data has no declaration file.
import { normalizeBackgroundKey } from "../../public/js/background-manager.js";
// @ts-expect-error Retained theme data has no declaration file.
import { BUILTIN_THEMES, normalizeTheme } from "../../public/js/theme-manager.js";

export const CLIENT_SETTINGS_STORAGE_KEY = "darkwind-client-settings";
export const LAST_LOGIN_HOST_STORAGE_KEY = "darkflow-last-login-host";
const SETTINGS_WINDOW_STATE_KEY = "darkwind-settings-window";
const SETTINGS_WINDOW_STATE_VERSION = 1;
const SETTINGS_WINDOW_MIN_WIDTH = 560;
const SETTINGS_WINDOW_MIN_HEIGHT = 560;

export interface SettingsWindowState {
  version: 1;
  x: number;
  y: number;
  w: number;
  h: number;
  tab: string;
}

export type ScrollbackBehavior = "pause" | "split";
export type OutputScrollbackPreset = "low" | "normal" | "high";

export const TERMINAL_FONT_FAMILIES = [
  {
    label: "Monospace",
    value:
      'ui-monospace, "SFMono-Regular", Menlo, Monaco, "Consolas", "Liberation Mono", monospace',
  },
  {
    label: "System sans-serif",
    value: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  { label: "Serif", value: 'Georgia, "Times New Roman", Times, serif' },
  { label: "Courier", value: '"Courier New", Courier, monospace' },
  { label: "Verdana", value: "Verdana, Geneva, Tahoma, sans-serif" },
  { label: "Comic Sans", value: '"Comic Sans MS", "Comic Sans", cursive' },
] as const;
export const TERMINAL_FONT_SIZES = [
  8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48, 56, 64,
] as const;

export type PanelLayer = "normal" | "above" | "always-on-top";

export interface PanelPreference {
  fontSize?: (typeof TERMINAL_FONT_SIZES)[number];
  layer?: PanelLayer;
}

export interface CustomTheme {
  key: string;
  label: string;
  type: "dark" | "light";
  bg: string;
  fg: string;
  accent: string;
  ansi: string[];
  ui: Record<string, string>;
}

export interface Phase2ClientSettings {
  repeatLastCommand: boolean;
  aliasTabCompletionEnabled: boolean;
  historyTabCompletionEnabled: boolean;
  emojiPickerEnabled: boolean;
  scrollbackBehavior: ScrollbackBehavior;
  scrollbackSplitRatio: number;
  outputScrollbackPreset: OutputScrollbackPreset;
  lagMonitorEnabled: boolean;
  gmcpDebugEnabled: boolean;
  visualEffectsEnabled: boolean;
  visualEffectPreferences: SessionVisualEffectPreferences;
  background: string;
  sideRailOpacity: number;
  terminalBackgroundOpacity: number;
  terminalFontFamily: string | null;
  terminalFontSize: number | null;
  panelPreferences: Record<string, PanelPreference>;
  customThemes: Record<string, CustomTheme>;
  autoReconnect: boolean;
  settingsBackupPromptEnabled: boolean;
  terminalWidthColumns: number | null;
  screenReaderMode: boolean;
  openSettingsShortcutEnabled: boolean;
  clearTerminalShortcutEnabled: boolean;
  resyncGamePanelsShortcutEnabled: boolean;
  escapeShortcutEnabled: boolean;
  pageUpShortcutEnabled: boolean;
  pageDownShortcutEnabled: boolean;
  focusCommandInputShortcutEnabled: boolean;
  keyMapperEnabled: boolean;
  tabObservabilityEnabled: boolean;
}

export const DEFAULT_PHASE2_CLIENT_SETTINGS: Phase2ClientSettings = {
  repeatLastCommand: true,
  aliasTabCompletionEnabled: true,
  historyTabCompletionEnabled: false,
  emojiPickerEnabled: true,
  scrollbackBehavior: "pause",
  scrollbackSplitRatio: 0.6,
  outputScrollbackPreset: "normal",
  lagMonitorEnabled: true,
  gmcpDebugEnabled: false,
  visualEffectsEnabled: false,
  visualEffectPreferences: visualEffectSettings.createDefaultVisualEffectPreferences(),
  background: "none",
  sideRailOpacity: 82,
  terminalBackgroundOpacity: 55,
  terminalFontFamily: null,
  terminalFontSize: null,
  panelPreferences: {},
  customThemes: {},
  autoReconnect: true,
  settingsBackupPromptEnabled: true,
  terminalWidthColumns: null,
  screenReaderMode: false,
  openSettingsShortcutEnabled: true,
  clearTerminalShortcutEnabled: true,
  resyncGamePanelsShortcutEnabled: true,
  escapeShortcutEnabled: true,
  pageUpShortcutEnabled: true,
  pageDownShortcutEnabled: true,
  focusCommandInputShortcutEnabled: true,
  keyMapperEnabled: false,
  tabObservabilityEnabled: false,
};

export type ClientSettingsResult =
  | { success: true; settings: Phase2ClientSettings }
  | { success: false; message: string; settings: Phase2ClientSettings };

export function readLastLoginHost(storage: Pick<Storage, "getItem">): string {
  try {
    return storage.getItem(LAST_LOGIN_HOST_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function saveLastLoginHost(storage: Pick<Storage, "setItem">, host: string): void {
  const value = host.trim();
  if (!value) return;
  try {
    storage.setItem(LAST_LOGIN_HOST_STORAGE_KEY, value);
  } catch {
    // The successful connection remains usable when storage is unavailable.
  }
}

function readObject(storage: Pick<Storage, "getItem">): Record<string, unknown> {
  const raw = storage.getItem(CLIENT_SETTINGS_STORAGE_KEY);
  if (raw === null) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Saved client settings must be an object.");
  }
  return parsed as Record<string, unknown>;
}

function normalize(settings: Record<string, unknown>): Phase2ClientSettings {
  const splitRatio =
    typeof settings.scrollbackSplitRatio === "number" ? settings.scrollbackSplitRatio : Number.NaN;
  return {
    repeatLastCommand: settings.repeatLastCommand !== false,
    aliasTabCompletionEnabled: settings.aliasTabCompletionEnabled !== false,
    historyTabCompletionEnabled: settings.historyTabCompletionEnabled === true,
    emojiPickerEnabled: settings.emojiPickerEnabled !== false,
    scrollbackBehavior: settings.scrollbackBehavior === "split" ? "split" : "pause",
    scrollbackSplitRatio: Number.isFinite(splitRatio)
      ? Math.max(0.2, Math.min(0.8, splitRatio))
      : 0.6,
    outputScrollbackPreset:
      settings.outputScrollbackPreset === "low" ||
      settings.outputScrollbackPreset === "high" ||
      settings.outputScrollbackPreset === "normal"
        ? settings.outputScrollbackPreset
        : "normal",
    lagMonitorEnabled: settings.lagMonitorEnabled !== false,
    gmcpDebugEnabled: settings.gmcpDebugEnabled === true,
    visualEffectsEnabled: settings.visualEffectsEnabled === true,
    visualEffectPreferences: visualEffectSettings.normalizeVisualEffectPreferences(
      settings.visualEffectPreferences,
    ),
    background: normalizeBackgroundKey(settings.background),
    sideRailOpacity:
      typeof settings.sideRailOpacity === "number" && Number.isFinite(settings.sideRailOpacity)
        ? Math.round(Math.max(0, Math.min(100, settings.sideRailOpacity)))
        : 82,
    terminalBackgroundOpacity:
      typeof settings.terminalBackgroundOpacity === "number" &&
      Number.isFinite(settings.terminalBackgroundOpacity)
        ? Math.round(Math.max(0, Math.min(100, settings.terminalBackgroundOpacity)))
        : 55,
    terminalFontFamily:
      typeof settings.terminalFontFamily === "string" &&
      TERMINAL_FONT_FAMILIES.some(({ value }) => value === settings.terminalFontFamily)
        ? settings.terminalFontFamily
        : null,
    terminalFontSize:
      typeof settings.terminalFontSize === "number" &&
      TERMINAL_FONT_SIZES.includes(
        settings.terminalFontSize as (typeof TERMINAL_FONT_SIZES)[number],
      )
        ? settings.terminalFontSize
        : null,
    panelPreferences: normalizePanelPreferences(settings.panelPreferences),
    customThemes: normalizeCustomThemes(settings.customThemes),
    autoReconnect: settings.autoReconnect !== false,
    settingsBackupPromptEnabled: settings.settingsBackupPromptEnabled !== false,
    terminalWidthColumns: normalizeTerminalWidth(settings.terminalWidthColumns),
    screenReaderMode: settings.screenReaderMode === true,
    openSettingsShortcutEnabled: settings.openSettingsShortcutEnabled !== false,
    clearTerminalShortcutEnabled: settings.clearTerminalShortcutEnabled !== false,
    resyncGamePanelsShortcutEnabled: settings.resyncGamePanelsShortcutEnabled !== false,
    escapeShortcutEnabled: settings.escapeShortcutEnabled !== false,
    pageUpShortcutEnabled: settings.pageUpShortcutEnabled !== false,
    pageDownShortcutEnabled: settings.pageDownShortcutEnabled !== false,
    focusCommandInputShortcutEnabled: settings.focusCommandInputShortcutEnabled !== false,
    keyMapperEnabled: settings.keyMapperEnabled === true,
    tabObservabilityEnabled: settings.tabObservabilityEnabled === true,
  };
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const VSCODE_THEME_COLOR_KEYS = new Set([
  "terminal.background",
  "editor.background",
  "editorPane.background",
  "terminal.foreground",
  "editor.foreground",
  "foreground",
  "focusBorder",
  "button.background",
  "textLink.foreground",
  "progressBar.background",
  "activityBarBadge.background",
  "sideBar.background",
  "panel.background",
  "editorGroupHeader.tabsBackground",
  "panel.border",
  "editorGroup.border",
  "sideBar.border",
  "contrastBorder",
  "descriptionForeground",
  "disabledForeground",
  "tab.inactiveForeground",
  "button.foreground",
  "input.background",
  "dropdown.background",
  "editorWidget.background",
  "editor.selectionBackground",
  "selection.background",
  ...[
    "ansiBlack",
    "ansiRed",
    "ansiGreen",
    "ansiYellow",
    "ansiBlue",
    "ansiMagenta",
    "ansiCyan",
    "ansiWhite",
    "ansiBrightBlack",
    "ansiBrightRed",
    "ansiBrightGreen",
    "ansiBrightYellow",
    "ansiBrightBlue",
    "ansiBrightMagenta",
    "ansiBrightCyan",
    "ansiBrightWhite",
  ].map((name) => `terminal.${name}`),
]);

export function validateVsCodeTheme(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const colors = (value as { colors?: unknown }).colors;
  if (typeof colors !== "object" || colors === null || Array.isArray(colors)) return false;
  return Object.entries(colors).every(
    ([key, color]) =>
      !VSCODE_THEME_COLOR_KEYS.has(key) || (typeof color === "string" && HEX_COLOR.test(color)),
  );
}

export function normalizeTerminalWidth(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 40 && (value as number) <= 240
    ? (value as number)
    : null;
}

export function normalizePanelPreferences(value: unknown): Record<string, PanelPreference> {
  if (!isObject(value)) return {};
  const preferences: Record<string, PanelPreference> = {};
  for (const [id, rawPreference] of Object.entries(value)) {
    if (!isObject(rawPreference)) continue;
    const fontSize = TERMINAL_FONT_SIZES.includes(
      rawPreference.fontSize as (typeof TERMINAL_FONT_SIZES)[number],
    )
      ? (rawPreference.fontSize as (typeof TERMINAL_FONT_SIZES)[number])
      : undefined;
    const layer =
      rawPreference.layer === "above" || rawPreference.layer === "always-on-top"
        ? rawPreference.layer
        : undefined;
    if (fontSize !== undefined || layer !== undefined) {
      preferences[id] = {
        ...(fontSize !== undefined ? { fontSize } : {}),
        ...(layer ? { layer } : {}),
      };
    }
  }
  return preferences;
}

export function setPanelPreference(
  settings: Phase2ClientSettings,
  panelId: string,
  preference: PanelPreference,
): Phase2ClientSettings {
  return {
    ...settings,
    panelPreferences: normalizePanelPreferences({
      ...settings.panelPreferences,
      [panelId]: preference,
    }),
  };
}

function normalizeCustomTheme(value: unknown): CustomTheme | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  try {
    const theme = normalizeTheme(value);
    if (
      typeof theme.key !== "string" ||
      !theme.key ||
      theme.key.length > 80 ||
      typeof theme.label !== "string" ||
      theme.label.length > 100 ||
      ![theme.bg, theme.fg, theme.accent, ...theme.ansi].every((color) => HEX_COLOR.test(color)) ||
      typeof theme.ui !== "object" ||
      theme.ui === null ||
      Array.isArray(theme.ui) ||
      !Object.values(theme.ui).every((color) => typeof color === "string" && HEX_COLOR.test(color))
    )
      return null;
    return theme;
  } catch {
    return null;
  }
}

export function normalizeCustomThemes(value: unknown): Record<string, CustomTheme> {
  const entries = Array.isArray(value)
    ? value.map((entry) => [
        typeof entry === "object" && entry !== null ? (entry as { key?: unknown }).key : "",
        entry,
      ])
    : typeof value === "object" && value !== null
      ? Object.entries(value)
      : [];
  const themes: Record<string, CustomTheme> = {};
  for (const [storedKey, entry] of entries) {
    const theme = normalizeCustomTheme(entry);
    if (
      theme &&
      typeof storedKey === "string" &&
      storedKey === theme.key &&
      themes[theme.key] === undefined &&
      Object.keys(themes).length < 32
    )
      themes[theme.key] = theme;
  }
  return themes;
}

export type ClientSettingsDocumentResult =
  { success: true; data: Record<string, unknown> } | { success: false; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates persisted settings strictly for imports while retaining unknown JSON fields. */
export function validateClientSettingsDocument(
  value: unknown,
  theme?: string,
): ClientSettingsDocumentResult {
  if (!isObject(value)) return { success: false, message: "Client settings must be an object." };
  const booleanKeys = [
    "repeatLastCommand",
    "aliasTabCompletionEnabled",
    "historyTabCompletionEnabled",
    "emojiPickerEnabled",
    "lagMonitorEnabled",
    "gmcpDebugEnabled",
    "visualEffectsEnabled",
    "autoReconnect",
    "screenReaderMode",
    "settingsBackupPromptEnabled",
    "openSettingsShortcutEnabled",
    "clearTerminalShortcutEnabled",
    "resyncGamePanelsShortcutEnabled",
    "escapeShortcutEnabled",
    "pageUpShortcutEnabled",
    "pageDownShortcutEnabled",
    "focusCommandInputShortcutEnabled",
    "keyMapperEnabled",
    "tabObservabilityEnabled",
  ] as const;
  for (const key of booleanKeys) {
    if (key in value && typeof value[key] !== "boolean")
      return { success: false, message: `Client setting ${key} must be true or false.` };
  }
  if (
    "scrollbackBehavior" in value &&
    value.scrollbackBehavior !== "pause" &&
    value.scrollbackBehavior !== "split"
  )
    return { success: false, message: "Client setting scrollbackBehavior is invalid." };
  if (
    "scrollbackSplitRatio" in value &&
    (typeof value.scrollbackSplitRatio !== "number" ||
      !Number.isFinite(value.scrollbackSplitRatio) ||
      value.scrollbackSplitRatio < 0.2 ||
      value.scrollbackSplitRatio > 0.8)
  )
    return { success: false, message: "Client setting scrollbackSplitRatio is invalid." };
  if (
    "outputScrollbackPreset" in value &&
    !["low", "normal", "high"].includes(String(value.outputScrollbackPreset))
  )
    return { success: false, message: "Client setting outputScrollbackPreset is invalid." };
  for (const key of ["sideRailOpacity", "terminalBackgroundOpacity"] as const) {
    if (
      key in value &&
      (typeof value[key] !== "number" ||
        !Number.isInteger(value[key]) ||
        value[key] < 0 ||
        value[key] > 100)
    )
      return { success: false, message: `Client setting ${key} is invalid.` };
  }
  if (
    "terminalFontFamily" in value &&
    value.terminalFontFamily !== null &&
    !TERMINAL_FONT_FAMILIES.some(({ value: family }) => family === value.terminalFontFamily)
  )
    return { success: false, message: "Client setting terminalFontFamily is invalid." };
  if (
    "terminalFontSize" in value &&
    value.terminalFontSize !== null &&
    !TERMINAL_FONT_SIZES.includes(value.terminalFontSize as (typeof TERMINAL_FONT_SIZES)[number])
  )
    return { success: false, message: "Client setting terminalFontSize is invalid." };
  if ("panelPreferences" in value) {
    if (!isObject(value.panelPreferences))
      return { success: false, message: "Client setting panelPreferences is invalid." };
    for (const preference of Object.values(value.panelPreferences)) {
      if (
        !isObject(preference) ||
        Object.keys(preference).some((key) => key !== "fontSize" && key !== "layer")
      )
        return { success: false, message: "A panel preference is invalid." };
      if (
        "fontSize" in preference &&
        !TERMINAL_FONT_SIZES.includes(preference.fontSize as (typeof TERMINAL_FONT_SIZES)[number])
      )
        return { success: false, message: "A panel preference font size is invalid." };
      if (
        "layer" in preference &&
        !["normal", "above", "always-on-top"].includes(String(preference.layer))
      )
        return { success: false, message: "A panel preference layer is invalid." };
    }
  }
  if (
    "terminalWidthColumns" in value &&
    value.terminalWidthColumns !== null &&
    normalizeTerminalWidth(value.terminalWidthColumns) !== value.terminalWidthColumns
  )
    return { success: false, message: "Client setting terminalWidthColumns is invalid." };
  if ("background" in value && normalizeBackgroundKey(value.background) !== value.background)
    return { success: false, message: "Client setting background is invalid." };
  if ("theme" in value && (typeof value.theme !== "string" || !value.theme))
    return { success: false, message: "Client setting theme is invalid." };
  if ("visualEffectPreferences" in value) {
    if (!isObject(value.visualEffectPreferences))
      return { success: false, message: "Client setting visualEffectPreferences is invalid." };
    for (const key of visualEffectSettings.VISUAL_EFFECT_KEYS as string[]) {
      if (
        key in value.visualEffectPreferences &&
        typeof value.visualEffectPreferences[key] !== "boolean"
      )
        return { success: false, message: `Client visual effect ${key} is invalid.` };
    }
  }
  if ("customThemes" in value) {
    const customThemes = value.customThemes;
    if (!isObject(customThemes))
      return { success: false, message: "Client setting customThemes is invalid." };
    const normalized = normalizeCustomThemes(customThemes);
    if (
      Object.keys(normalized).length !== Object.keys(customThemes).length ||
      Object.keys(normalized).some((key) => !Object.hasOwn(customThemes, key))
    )
      return { success: false, message: "A custom theme is invalid." };
  }
  const settings = normalize(value);
  const nextTheme = theme ?? (typeof value.theme === "string" ? value.theme : "");
  if (!nextTheme) return { success: false, message: "Client settings must include a theme." };
  if (!Object.hasOwn(BUILTIN_THEMES, nextTheme) && !Object.hasOwn(settings.customThemes, nextTheme))
    return { success: false, message: "Client setting theme is not available." };
  return { success: true, data: { ...value, ...settings, theme: nextTheme } };
}

export function readClientSettingsDocument(
  storage: Pick<Storage, "getItem">,
  theme: string,
): ClientSettingsDocumentResult {
  try {
    return validateClientSettingsDocument(readObject(storage), theme);
  } catch {
    return { success: false, message: "Saved client settings are invalid." };
  }
}

export function loadClientSettings(storage: Pick<Storage, "getItem">): ClientSettingsResult {
  try {
    return { success: true, settings: normalize(readObject(storage)) };
  } catch {
    return {
      success: false,
      message: "Saved client settings are invalid. Fix or replace them before saving.",
      settings: normalize({}),
    };
  }
}

export function saveClientSettings(
  storage: Pick<Storage, "getItem" | "setItem">,
  settings: Phase2ClientSettings,
  theme: string,
): { success: true } | { success: false; message: string } {
  try {
    let current: Record<string, unknown> = {};
    try {
      current = readObject(storage);
    } catch {
      // Applying the visible defaults replaces an unreadable legacy value.
    }
    storage.setItem(
      CLIENT_SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...current, ...settings, theme }),
    );
    return { success: true };
  } catch {
    return { success: false, message: "Client settings could not be saved." };
  }
}

export function loadSettingsWindowState(
  storage: Pick<Storage, "getItem">,
  viewport: { width: number; height: number },
): SettingsWindowState {
  let saved: Record<string, unknown> = {};
  try {
    const raw = storage.getItem(SETTINGS_WINDOW_STATE_KEY);
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      saved = parsed as Record<string, unknown>;
    }
  } catch {
    // Geometry is optional UI state.
  }
  const geometry = saved.version === SETTINGS_WINDOW_STATE_VERSION ? saved : {};
  const number = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const w = Math.min(
    Math.max(0, viewport.width - 16),
    Math.max(
      Math.min(SETTINGS_WINDOW_MIN_WIDTH, viewport.width - 16),
      number(geometry.w, Math.min(1000, viewport.width - 28)),
    ),
  );
  const h = Math.min(
    Math.max(0, viewport.height - 16),
    Math.max(
      Math.min(SETTINGS_WINDOW_MIN_HEIGHT, viewport.height - 16),
      number(geometry.h, Math.max(0, Math.min(700, viewport.height - 130))),
    ),
  );
  const x = Math.max(0, Math.min(number(geometry.x, viewport.width - w - 14), viewport.width - w));
  const y = Math.max(0, Math.min(number(geometry.y, 54), viewport.height - h));
  return {
    version: SETTINGS_WINDOW_STATE_VERSION,
    x,
    y,
    w,
    h,
    tab: typeof saved.tab === "string" ? saved.tab : "connection",
  };
}

export function saveSettingsWindowState(
  storage: Pick<Storage, "getItem" | "setItem">,
  patch: Partial<SettingsWindowState>,
): void {
  try {
    const current = loadSettingsWindowState(storage, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    storage.setItem(
      SETTINGS_WINDOW_STATE_KEY,
      JSON.stringify({ ...current, ...patch, version: SETTINGS_WINDOW_STATE_VERSION }),
    );
  } catch {
    // Geometry is optional UI state.
  }
}
