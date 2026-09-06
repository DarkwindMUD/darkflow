import type { SessionVisualEffectPreferences } from "../runtime/visual-effects.ts";
// @ts-expect-error Retained visual-effect settings are JavaScript without declarations.
import * as visualEffectSettings from "../../public/js/visual-effects-settings.mjs";

const STORAGE_KEY = "darkwind-client-settings";
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

export interface Phase2ClientSettings {
  repeatLastCommand: boolean;
  aliasTabCompletionEnabled: boolean;
  historyTabCompletionEnabled: boolean;
  lagMonitorEnabled: boolean;
  visualEffectsEnabled: boolean;
  visualEffectPreferences: SessionVisualEffectPreferences;
}

export const DEFAULT_PHASE2_CLIENT_SETTINGS: Phase2ClientSettings = {
  repeatLastCommand: true,
  aliasTabCompletionEnabled: true,
  historyTabCompletionEnabled: false,
  lagMonitorEnabled: true,
  visualEffectsEnabled: false,
  visualEffectPreferences: visualEffectSettings.createDefaultVisualEffectPreferences(),
};

export type ClientSettingsResult =
  | { success: true; settings: Phase2ClientSettings }
  | { success: false; message: string; settings: Phase2ClientSettings };

function readObject(storage: Pick<Storage, "getItem">): Record<string, unknown> {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Saved client settings must be an object.");
  }
  return parsed as Record<string, unknown>;
}

function normalize(settings: Record<string, unknown>): Phase2ClientSettings {
  return {
    repeatLastCommand: settings.repeatLastCommand !== false,
    aliasTabCompletionEnabled: settings.aliasTabCompletionEnabled !== false,
    historyTabCompletionEnabled: settings.historyTabCompletionEnabled === true,
    lagMonitorEnabled: settings.lagMonitorEnabled !== false,
    visualEffectsEnabled: settings.visualEffectsEnabled === true,
    visualEffectPreferences: visualEffectSettings.normalizeVisualEffectPreferences(
      settings.visualEffectPreferences,
    ),
  };
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
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...settings, theme }));
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
