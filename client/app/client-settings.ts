import type { SessionVisualEffectPreferences } from "../runtime/visual-effects.ts";
// @ts-expect-error Retained visual-effect settings are JavaScript without declarations.
import * as visualEffectSettings from "../../public/js/visual-effects-settings.mjs";

const STORAGE_KEY = "darkwind-client-settings";

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
