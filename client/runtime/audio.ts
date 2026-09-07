import { deepFreeze } from "../configuration/snapshot";
import type { SessionGmcpBus } from "../gmcp/bus";
import {
  DARKWIND_SOUND_CATEGORIES,
  normalizeDarkwindSound,
  type DarkwindSound,
  type DarkwindSoundCategory,
} from "../gmcp/contracts/sound";
import type { TransportReconnectStatusPayload } from "../transport/types";
import type { SessionEventBus } from "./event-bus";
import type { Unsubscribe } from "./events";
import type { SessionInteractions } from "./interactions";
import type { Disposer, ResourceScope } from "./resource-scope";

export const SESSION_AUDIO_CATEGORIES = [
  ...DARKWIND_SOUND_CATEGORIES.slice(0, -1),
  "fishing",
  "ui",
  "music",
] as const;

export type SessionAudioCategory = DarkwindSoundCategory | "fishing" | "music";
export type SessionAudioActivityKind = "play" | "loop" | null;

export interface SessionAudioSnapshot {
  readonly connected: boolean;
  readonly loggedIn: boolean;
  readonly supported: boolean;
  readonly enabled: boolean;
  readonly volume: number;
  readonly audioUnlocked: boolean;
  readonly pendingCount: number;
  readonly currentCategory: SessionAudioCategory | null;
  readonly activityKind: SessionAudioActivityKind;
  readonly categoryEnabled: Readonly<Record<SessionAudioCategory, boolean>>;
}

export interface SessionAudio {
  getSnapshot(): SessionAudioSnapshot;
  subscribe(listener: (snapshot: SessionAudioSnapshot) => void): Unsubscribe;
  unlock(): Promise<boolean>;
  setEnabled(enabled: boolean): void;
  setVolume(volume: number): void;
  setCategoryEnabled(category: string, enabled: boolean): void;
  playLocal(category: string, sound: string, volume?: number): boolean;
  loopLocal(category: string, sound: string, id: string, volume?: number): boolean;
  stopLocal(category: string, id?: string): boolean;
}

interface RetainedSoundSettings {
  enabled: boolean;
  volume: number;
  categoryEnabled: Record<string, boolean>;
  audioUnlocked: boolean;
  pendingCount: number;
}

export interface RetainedSoundManager {
  getSettings(): RetainedSoundSettings;
  onChange(listener: () => void): Unsubscribe;
  unlockFromUserGesture(): Promise<boolean>;
  setEnabled(enabled: boolean): void;
  setVolume(volume: number): void;
  setCategoryEnabled(category: string, enabled: boolean): void;
  play(category: string, sound: string, volume?: number): void;
  loop(category: string, sound: string, id: string, volume?: number): void;
  stop(category: string, id?: string): void;
  handleMessage(message: DarkwindSound): boolean;
  resetSessionPlayback(): void;
}

const SOUND_PACKAGE = "Darkwind.Sound";
const ONE_SHOT_ACTIVITY_MS = 2_000;
const AUTH_TRANSITION_GRACE_MS = 100;
const AUTH_WINDOW_IDS = new Set(["login", "newchar", "charselect"]);
const LOGIN_THEME = {
  category: "music" as const,
  sound: "darkwind-theme",
  id: "darkwind-login-theme",
  volume: 0.5,
};
const categorySet = new Set<string>(SESSION_AUDIO_CATEGORIES);
const tokenPattern = /^[A-Za-z0-9_./-]+$/;

function validToken(value: string): boolean {
  const token = value.trim();
  return (
    token.length >= 1 &&
    token.length <= 120 &&
    !token.startsWith("/") &&
    !token.includes("..") &&
    tokenPattern.test(token)
  );
}

function validVolume(volume: number | undefined): boolean {
  return volume === undefined || (Number.isFinite(volume) && volume >= 0 && volume <= 1);
}

/** Creates the session-owned sound read model over the application-owned retained manager. */
export function createSessionAudio(
  gmcp: SessionGmcpBus,
  scope: ResourceScope,
  eventBus: SessionEventBus,
  interactions: SessionInteractions,
  manager: RetainedSoundManager,
): SessionAudio {
  let connected = false;
  let loggedIn = false;
  let supported = false;
  let currentCategory: SessionAudioCategory | null = null;
  let activityKind: SessionAudioActivityKind = null;
  let cancelActivityTimer: Disposer | null = null;
  let cancelAuthStop: Disposer | null = null;
  let authActive = false;
  let loginThemeRequested = false;
  let resetForDisconnect = false;
  let suppressManagerPublish = false;
  let disposed = false;
  const activeLoops = new Map<string, SessionAudioCategory>();
  const listeners = new Set<(snapshot: SessionAudioSnapshot) => void>();

  const createSnapshot = (): SessionAudioSnapshot => {
    const settings = manager.getSettings();
    const categoryEnabled = Object.fromEntries(
      SESSION_AUDIO_CATEGORIES.map((category) => [
        category,
        settings.categoryEnabled[category] !== false,
      ]),
    ) as Record<SessionAudioCategory, boolean>;
    return deepFreeze({
      connected,
      loggedIn,
      supported,
      enabled: settings.enabled,
      volume: settings.volume,
      audioUnlocked: settings.audioUnlocked,
      pendingCount: settings.pendingCount,
      currentCategory,
      activityKind,
      categoryEnabled,
    });
  };

  let snapshot = createSnapshot();

  const publish = (): void => {
    if (disposed) return;
    snapshot = createSnapshot();
    for (const listener of [...listeners]) listener(snapshot);
  };

  const cancelActivity = (): void => {
    cancelActivityTimer?.();
    cancelActivityTimer = null;
  };

  const restoreLoopActivity = (): void => {
    const category = [...activeLoops.values()].at(-1) ?? null;
    currentCategory = category;
    activityKind = category === null ? null : "loop";
  };

  const showPlayActivity = (category: SessionAudioCategory): void => {
    cancelActivity();
    currentCategory = category;
    activityKind = "play";
    cancelActivityTimer = scope.setTimeout(() => {
      cancelActivityTimer = null;
      restoreLoopActivity();
      publish();
    }, ONE_SHOT_ACTIVITY_MS);
  };

  const showLoopActivity = (category: SessionAudioCategory, id: string): void => {
    cancelActivity();
    activeLoops.set(id, category);
    currentCategory = category;
    activityKind = "loop";
  };

  const clearStoppedActivity = (category: SessionAudioCategory, id?: string): void => {
    cancelActivity();
    if (id) activeLoops.delete(id);
    else {
      for (const [loopId, loopCategory] of activeLoops) {
        if (loopCategory === category) activeLoops.delete(loopId);
      }
    }
    restoreLoopActivity();
  };

  const clearActivity = (): void => {
    cancelActivity();
    activeLoops.clear();
    currentCategory = null;
    activityKind = null;
  };

  const runManagerAction = <T>(action: () => T): T => {
    suppressManagerPublish = true;
    try {
      return action();
    } finally {
      suppressManagerPublish = false;
    }
  };

  const play = (category: SessionAudioCategory, sound: string, volume?: number): boolean => {
    if (disposed || !connected) return false;
    runManagerAction(() => manager.play(category, sound, volume));
    showPlayActivity(category);
    publish();
    return true;
  };

  const loop = (
    category: SessionAudioCategory,
    sound: string,
    id: string,
    volume?: number,
  ): boolean => {
    if (disposed || !connected) return false;
    runManagerAction(() => manager.loop(category, sound, id, volume));
    showLoopActivity(category, id);
    publish();
    return true;
  };

  const stop = (category: SessionAudioCategory, id?: string): boolean => {
    if (disposed) return false;
    runManagerAction(() => manager.stop(category, id));
    clearStoppedActivity(category, id);
    publish();
    return true;
  };

  const cancelAuthGrace = (): void => {
    cancelAuthStop?.();
    cancelAuthStop = null;
  };

  const stopLoginTheme = (): void => {
    cancelAuthGrace();
    if (!loginThemeRequested) return;
    loginThemeRequested = false;
    stop(LOGIN_THEME.category, LOGIN_THEME.id);
  };

  const reconcileAuthWindows = (): void => {
    const active = Object.values(interactions.getSnapshot().windows).some(
      (window) => window.type === "modal" && AUTH_WINDOW_IDS.has(window.sourceId),
    );
    const changed = active !== authActive;
    authActive = active;
    if (manager.getSettings().categoryEnabled.music === false) {
      cancelAuthGrace();
      stopLoginTheme();
      return;
    }
    if (!changed) {
      if (active && !loginThemeRequested && connected) {
        loginThemeRequested = loop(
          LOGIN_THEME.category,
          LOGIN_THEME.sound,
          LOGIN_THEME.id,
          LOGIN_THEME.volume,
        );
      }
      return;
    }
    cancelAuthGrace();
    if (authActive) {
      if (connected && !loginThemeRequested) {
        loginThemeRequested = loop(
          LOGIN_THEME.category,
          LOGIN_THEME.sound,
          LOGIN_THEME.id,
          LOGIN_THEME.volume,
        );
      }
      return;
    }
    if (!loginThemeRequested) return;
    cancelAuthStop = scope.setTimeout(() => {
      cancelAuthStop = null;
      if (!authActive) stopLoginTheme();
    }, AUTH_TRANSITION_GRACE_MS);
  };

  const soundHandler = (data: unknown): void => {
    const sound = normalizeDarkwindSound(data);
    if (!sound || disposed || !connected) return;
    if (!runManagerAction(() => manager.handleMessage(sound))) return;
    if (sound.type === "play") showPlayActivity(sound.category);
    else if (sound.type === "loop") showLoopActivity(sound.category, sound.id);
    else clearStoppedActivity(sound.category, sound.id);
    publish();
  };
  gmcp.on(SOUND_PACKAGE, soundHandler);
  scope.own("listener", () => gmcp.off(SOUND_PACKAGE, soundHandler));

  const characterAttachedHandler = (): void => {
    loggedIn = true;
    authActive = false;
    stopLoginTheme();
    publish();
  };
  for (const packageName of ["Char.Vitals", "Char.Status", "Darkwind.Session.Recovered"]) {
    gmcp.on(packageName, characterAttachedHandler);
    scope.own("listener", () => gmcp.off(packageName, characterAttachedHandler));
  }

  const supportsHandler = (): void => {
    if (disposed) return;
    supported = connected && gmcp.serverSupportsPackage(SOUND_PACKAGE);
    publish();
  };
  for (const packageName of ["Core.Supports.Set", "Core.Supports.Add", "Core.Supports.Remove"]) {
    gmcp.on(packageName, supportsHandler);
    scope.own("listener", () => gmcp.off(packageName, supportsHandler));
  }

  scope.own(
    "subscription",
    manager.onChange(() => {
      if (!disposed && !suppressManagerPublish) {
        reconcileAuthWindows();
        publish();
      }
    }),
  );

  scope.own(
    "subscription",
    interactions.subscribe(() => reconcileAuthWindows()),
  );

  scope.own(
    "subscription",
    eventBus.subscribe("transport:reconnect-status", (event) => {
      const payload = event.payload as TransportReconnectStatusPayload;
      if (payload.status === "connected") {
        connected = true;
        resetForDisconnect = false;
        supported = gmcp.serverSupportsPackage(SOUND_PACKAGE);
        reconcileAuthWindows();
        publish();
        return;
      }
      connected = false;
      loggedIn = false;
      supported = false;
      cancelAuthGrace();
      loginThemeRequested = false;
      clearActivity();
      if (!resetForDisconnect) {
        resetForDisconnect = true;
        runManagerAction(() => manager.resetSessionPlayback());
      }
      publish();
    }),
  );

  scope.own("teardown", () => {
    cancelAuthGrace();
    loginThemeRequested = false;
    disposed = true;
    clearActivity();
    runManagerAction(() => manager.resetSessionPlayback());
    listeners.clear();
  });

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      if (scope.disposed) return () => {};
      listener(snapshot);
      listeners.add(listener);
      return scope.own("subscription", () => listeners.delete(listener));
    },

    unlock() {
      return disposed ? Promise.resolve(false) : manager.unlockFromUserGesture();
    },

    setEnabled(enabled) {
      if (!disposed) manager.setEnabled(enabled);
    },

    setVolume(volume) {
      if (!disposed) manager.setVolume(volume);
    },

    setCategoryEnabled(category, enabled) {
      if (!disposed && categorySet.has(category)) manager.setCategoryEnabled(category, enabled);
    },

    playLocal(category, sound, volume) {
      const normalizedCategory = category.trim();
      const normalizedSound = sound.trim();
      if (
        !categorySet.has(normalizedCategory) ||
        !validToken(normalizedSound) ||
        !validVolume(volume)
      )
        return false;
      return play(normalizedCategory as SessionAudioCategory, normalizedSound, volume);
    },

    loopLocal(category, sound, id, volume) {
      const normalizedCategory = category.trim();
      const normalizedSound = sound.trim();
      const normalizedId = id.trim();
      if (
        !categorySet.has(normalizedCategory) ||
        !validToken(normalizedSound) ||
        !validToken(normalizedId) ||
        !validVolume(volume)
      )
        return false;
      return loop(
        normalizedCategory as SessionAudioCategory,
        normalizedSound,
        normalizedId,
        volume,
      );
    },

    stopLocal(category, id) {
      const normalizedCategory = category.trim();
      const normalizedId = id?.trim();
      if (
        !categorySet.has(normalizedCategory) ||
        (normalizedId !== undefined && !validToken(normalizedId))
      )
        return false;
      return stop(normalizedCategory as SessionAudioCategory, normalizedId);
    },
  };
}
