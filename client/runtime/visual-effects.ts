import { deepFreeze } from "../configuration/snapshot";
import type { DarkwindVisualEffect, DarkwindVisualPreview } from "../gmcp/contracts/visual-effects";
import {
  normalizeDarkwindVisualEvent,
  normalizeDarkwindVisualEvents,
  normalizeDarkwindVisualPreview,
  normalizeDarkwindVisualState,
} from "../gmcp/contracts/visual-effects";
import type { SessionGmcpBus } from "../gmcp/bus";
import type { TransportReconnectStatusPayload } from "../transport/types";
// @ts-expect-error Retained visual-effects helpers are JavaScript without declaration files.
import * as visualCore from "../../public/js/visual-effects-core.mjs";
// @ts-expect-error Retained visual-effects settings are JavaScript without declaration files.
import * as visualSettings from "../../public/js/visual-effects-settings.mjs";
import type { SessionEventBus } from "./event-bus";
import type { Unsubscribe } from "./events";
import type { ResourceScope } from "./resource-scope";

const VISUAL_PACKAGE = "Darkwind.Visual";
const PREVIEW_TTL_MS = 5_000;
const WORLD_TRANSITION_MS = 1_250;

export const SESSION_VISUAL_EFFECT_KEYS = [
  "planetAmbience",
  "terrainAmbience",
  "worldTransitions",
  "lowHealth",
  "incomingDamage",
  "outgoingDamage",
  "spellCasts",
] as const;

export type SessionVisualEffectKey = (typeof SESSION_VISUAL_EFFECT_KEYS)[number];
export type SessionVisualEffectPreferences = Readonly<Record<SessionVisualEffectKey, boolean>>;

export interface SessionVisualEffectsSettings {
  readonly visualEffectsEnabled?: boolean;
  readonly visualEffectPreferences?: Partial<Record<SessionVisualEffectKey, boolean>>;
}

export interface SessionVisualWorldSnapshot {
  readonly authoritative: boolean;
  readonly epoch: string;
  readonly lastSeq: number;
  readonly planet: string;
  readonly terrains: readonly string[];
  readonly roomId: string;
  readonly area: string;
  readonly reason: "snapshot" | "move" | "wayshard" | "refresh";
  readonly transitionActive: boolean;
  readonly transitionGeneration: number;
}

export interface SessionVisualHealthSnapshot {
  readonly hp: number | null;
  readonly maxHp: number | null;
  readonly ratio: number | null;
  readonly alive: boolean;
  readonly lowHealth: boolean;
}

export type SessionVisualCue =
  | {
      readonly slot: "incoming" | "outgoing";
      readonly seq: number;
      readonly intensity: number;
      readonly generation: number;
    }
  | {
      readonly slot: "spell";
      readonly seq: number;
      readonly intensity: number;
      readonly palette: string;
      readonly generation: number;
    };

export interface SessionVisualEffectsSnapshot {
  readonly connected: boolean;
  readonly supported: boolean;
  readonly enabled: boolean;
  readonly subscriptionEnabled: boolean;
  readonly preferences: SessionVisualEffectPreferences;
  readonly world: SessionVisualWorldSnapshot;
  readonly health: SessionVisualHealthSnapshot;
  readonly activeCues: readonly SessionVisualCue[];
  readonly preview: DarkwindVisualPreview | null;
  readonly previewGeneration: number;
  readonly reducedMotion: boolean;
  readonly presentationVisible: boolean;
}

export interface SessionVisualEffects {
  getSnapshot(): SessionVisualEffectsSnapshot;
  subscribe(listener: (snapshot: SessionVisualEffectsSnapshot) => void): Unsubscribe;
  configure(settings: SessionVisualEffectsSettings): void;
  setReducedMotion(reduced: boolean): void;
  setPresentationVisible(visible: boolean): void;
}

interface RetainedVisualWorld {
  epoch: string;
  lastSeq: number;
  planet: string;
  terrains: string[];
  roomId: string;
  area: string;
  reason: "snapshot" | "move" | "wayshard" | "refresh";
}

interface RetainedHealth {
  hp: number | null;
  maxHp: number | null;
  ratio: number | null;
  alive: boolean;
  lowHealth: boolean;
}

type RetainedVisualEffect =
  | {
      readonly seq: number;
      readonly kind: "damage";
      readonly perspective: "incoming" | "outgoing";
      readonly cue: "impact";
      readonly intensity: number;
    }
  | {
      readonly seq: number;
      readonly kind: "spell-cast";
      readonly perspective: "self";
      readonly cue: "cast";
      readonly palette: string;
      readonly intensity: number;
    };

type CueSlot = "incoming" | "outgoing" | "spell";

const cueConfig: Readonly<
  Record<CueSlot, { readonly duration: number; readonly cooldown: number }>
> = {
  incoming: { duration: 420, cooldown: 600 },
  outgoing: { duration: 360, cooldown: 420 },
  spell: { duration: 620, cooldown: 320 },
};

const spellDurations: Readonly<Record<string, number>> = {
  fire: 1_150,
  cold: 1_450,
  lightning: 980,
};

function emptyWorld(): RetainedVisualWorld {
  return visualCore.createVisualWorldState() as RetainedVisualWorld;
}

function emptyHealth(): RetainedHealth {
  return visualCore.reduceHealthState() as RetainedHealth;
}

function defaultPreferences(): Record<SessionVisualEffectKey, boolean> {
  return visualSettings.createDefaultVisualEffectPreferences() as Record<
    SessionVisualEffectKey,
    boolean
  >;
}

function normalizedPreferences(
  preferences: SessionVisualEffectsSettings["visualEffectPreferences"],
): Record<SessionVisualEffectKey, boolean> {
  return visualSettings.normalizeVisualEffectPreferences(preferences) as Record<
    SessionVisualEffectKey,
    boolean
  >;
}

function safeRoomText(value: unknown, maxLength: number): string | number | undefined {
  if (typeof value === "string" && value.length <= maxLength) return value;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function safeRoomTerrain(value: unknown): string | string[] | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value.length <= 320 ? value : null;
  if (!Array.isArray(value)) return null;
  const entries = value.slice(0, 16);
  return entries.every((entry) => typeof entry === "string" && entry.length <= 320)
    ? entries
    : null;
}

function newestStrongest(effects: readonly RetainedVisualEffect[]): RetainedVisualEffect | null {
  let selected: RetainedVisualEffect | null = null;
  for (const effect of effects) {
    if (
      !selected ||
      effect.intensity > selected.intensity ||
      (effect.intensity === selected.intensity && effect.seq > selected.seq)
    ) {
      selected = effect;
    }
  }
  return selected;
}

/** Creates one session-owned, presentation-agnostic visual-effects capability. */
export function createSessionVisualEffects(
  gmcp: SessionGmcpBus,
  scope: ResourceScope,
  eventBus: SessionEventBus,
  options: { now?: () => number } = {},
): SessionVisualEffects {
  const now =
    options.now ??
    (() =>
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now());
  let connected = false;
  let supported = false;
  let enabled = false;
  let preferences = defaultPreferences();
  let reducedMotion = false;
  let presentationVisible = true;
  let authoritativeWorld = false;
  let worldModel = emptyWorld();
  let fallbackWorld = emptyWorld();
  let health = emptyHealth();
  let eventModel = visualCore.createVisualEffectsState() as { epoch: string; lastSeq: number };
  let activeCues = new Map<CueSlot, SessionVisualCue>();
  const cueGenerations: Record<CueSlot, number> = { incoming: 0, outgoing: 0, spell: 0 };
  const cueTimers: Partial<Record<CueSlot, Unsubscribe>> = {};
  let lastCueAt: Record<CueSlot, number> = {
    incoming: Number.NEGATIVE_INFINITY,
    outgoing: Number.NEGATIVE_INFINITY,
    spell: Number.NEGATIVE_INFINITY,
  };
  let transitionActive = false;
  let transitionGeneration = 0;
  let cancelTransition: Unsubscribe | null = null;
  let preview: DarkwindVisualPreview | null = null;
  let previewGeneration = 0;
  let cancelPreview: Unsubscribe | null = null;
  let resetForDisconnect = false;
  let hasConnected = false;
  let connectionGeneration = 0;
  let disposed = false;
  const listeners = new Set<(snapshot: SessionVisualEffectsSnapshot) => void>();

  const subscriptionEnabled = (): boolean =>
    visualSettings.visualEffectsSubscriptionEnabled({
      visualEffectsEnabled: enabled,
      visualEffectPreferences: preferences,
    }) as boolean;

  const currentWorld = (): RetainedVisualWorld => (authoritativeWorld ? worldModel : fallbackWorld);

  const createSnapshot = (): SessionVisualEffectsSnapshot => {
    const world = currentWorld();
    return deepFreeze({
      connected,
      supported,
      enabled,
      subscriptionEnabled: subscriptionEnabled(),
      preferences: { ...preferences },
      world: {
        authoritative: authoritativeWorld,
        epoch: world.epoch,
        lastSeq: world.lastSeq,
        planet: world.planet,
        terrains: [...world.terrains],
        roomId: world.roomId,
        area: world.area,
        reason: world.reason,
        transitionActive,
        transitionGeneration,
      },
      health: { ...health },
      activeCues: [...activeCues.values()],
      preview,
      previewGeneration,
      reducedMotion,
      presentationVisible,
    });
  };

  let snapshot = createSnapshot();

  const publish = (): void => {
    if (disposed) return;
    snapshot = createSnapshot();
    for (const listener of [...listeners]) {
      if (listeners.has(listener)) listener(snapshot);
    }
  };

  const effectEnabled = (key: SessionVisualEffectKey): boolean => enabled && preferences[key];

  const clearCue = (slot: CueSlot, shouldPublish = true): void => {
    cueTimers[slot]?.();
    delete cueTimers[slot];
    const changed = activeCues.delete(slot);
    if (changed && shouldPublish) publish();
  };

  const clearCues = (): void => {
    for (const slot of ["incoming", "outgoing", "spell"] as const) clearCue(slot, false);
    activeCues = new Map();
  };

  const clearTransition = (): void => {
    cancelTransition?.();
    cancelTransition = null;
    transitionActive = false;
  };

  const clearPreview = (): void => {
    cancelPreview?.();
    cancelPreview = null;
    if (preview !== null) previewGeneration += 1;
    preview = null;
  };

  const clearTransientPresentation = (): void => {
    clearCues();
    clearTransition();
    clearPreview();
  };

  const resetCooldowns = (): void => {
    lastCueAt = {
      incoming: Number.NEGATIVE_INFINITY,
      outgoing: Number.NEGATIVE_INFINITY,
      spell: Number.NEGATIVE_INFINITY,
    };
  };

  const resetSessionState = (): void => {
    clearTransientPresentation();
    authoritativeWorld = false;
    worldModel = emptyWorld();
    fallbackWorld = emptyWorld();
    health = emptyHealth();
    eventModel = visualCore.createVisualEffectsState() as { epoch: string; lastSeq: number };
    resetCooldowns();
  };

  const syncSubscription = (reason: string): void => {
    gmcp.sendSubscriptions({
      reason,
      features: { visualEffects: subscriptionEnabled() },
    });
  };

  const startTransition = (): void => {
    clearTransition();
    transitionActive = true;
    transitionGeneration += 1;
    cancelTransition = scope.setTimeout(() => {
      cancelTransition = null;
      if (disposed || !transitionActive) return;
      transitionActive = false;
      publish();
    }, WORLD_TRANSITION_MS);
  };

  const startCue = (slot: CueSlot, effect: RetainedVisualEffect): void => {
    const timestamp = now();
    if (timestamp - lastCueAt[slot] < cueConfig[slot].cooldown) return;
    lastCueAt[slot] = timestamp;
    clearCue(slot, false);
    cueGenerations[slot] += 1;
    const generation = cueGenerations[slot];
    const cue: SessionVisualCue =
      slot === "spell" && effect.kind === "spell-cast"
        ? {
            slot,
            seq: effect.seq,
            intensity: effect.intensity,
            palette: effect.palette,
            generation,
          }
        : {
            slot: slot === "incoming" ? "incoming" : "outgoing",
            seq: effect.seq,
            intensity: effect.intensity,
            generation,
          };
    activeCues.set(slot, cue);
    const duration =
      slot === "spell" && effect.kind === "spell-cast"
        ? (spellDurations[effect.palette] ?? cueConfig.spell.duration)
        : cueConfig[slot].duration;
    cueTimers[slot] = scope.setTimeout(() => {
      delete cueTimers[slot];
      if (disposed || activeCues.get(slot)?.generation !== generation) return;
      activeCues.delete(slot);
      publish();
    }, duration);
  };

  const handleEffects = (epoch: string, events: readonly DarkwindVisualEffect[]): void => {
    if (!enabled) return;
    const reduced = visualCore.reduceVisualEffectEvents(eventModel, {
      epoch,
      events,
    }) as { state: { epoch: string; lastSeq: number }; effects: RetainedVisualEffect[] };
    eventModel = reduced.state;
    if (!presentationVisible || reduced.effects.length === 0) return;

    const incoming = newestStrongest(
      reduced.effects.filter(
        (effect) => effect.kind === "damage" && effect.perspective === "incoming",
      ),
    );
    const outgoing = newestStrongest(
      reduced.effects.filter(
        (effect) => effect.kind === "damage" && effect.perspective === "outgoing",
      ),
    );
    const spells = reduced.effects.filter((effect) => effect.kind === "spell-cast");
    const spell = spells.at(-1) ?? null;
    if (incoming && effectEnabled("incomingDamage")) startCue("incoming", incoming);
    if (outgoing && effectEnabled("outgoingDamage")) startCue("outgoing", outgoing);
    if (spell && effectEnabled("spellCasts")) startCue("spell", spell);
    publish();
  };

  const listen = (packageName: string, handler: (data: unknown) => void): void => {
    gmcp.on(packageName, handler);
    scope.own("listener", () => gmcp.off(packageName, handler));
  };

  listen("Darkwind.Visual.State", (data) => {
    const normalized = normalizeDarkwindVisualState(data);
    if (!normalized || disposed || !connected) return;
    const reduced = visualCore.reduceVisualWorldState(worldModel, normalized) as {
      state: RetainedVisualWorld;
      accepted: boolean;
    };
    if (!reduced.accepted) return;
    worldModel = reduced.state;
    authoritativeWorld = true;
    const hasWorldPreview = preview?.kind === "planet" || preview?.kind === "terrain";
    if (
      enabled &&
      presentationVisible &&
      !hasWorldPreview &&
      worldModel.reason === "wayshard" &&
      effectEnabled("worldTransitions")
    ) {
      startTransition();
    }
    publish();
  });

  listen("Room.Info", (data) => {
    if (disposed || !connected || data === null || typeof data !== "object" || Array.isArray(data))
      return;
    const room = data as Record<string, unknown>;
    const terrain = safeRoomTerrain(room.terrain ?? room.environment ?? room.env);
    if (terrain === null) return;
    const fallback = visualCore.deriveRoomVisualContext({
      planet: safeRoomText(room.planet ?? room.world, 320),
      terrain,
      num: safeRoomText(room.num ?? room.id, 160),
      area: safeRoomText(room.area ?? room.zone, 120),
    }) as RetainedVisualWorld;
    fallbackWorld = fallback;
    if (!authoritativeWorld) publish();
  });

  listen("Char.Vitals", (data) => {
    if (disposed || !connected || data === null || typeof data !== "object" || Array.isArray(data))
      return;
    const vitals = data as Record<string, unknown>;
    const hp = typeof vitals.hp === "number" && Number.isFinite(vitals.hp) ? vitals.hp : undefined;
    const maxhp =
      typeof vitals.maxhp === "number" && Number.isFinite(vitals.maxhp) ? vitals.maxhp : undefined;
    const mhp =
      typeof vitals.mhp === "number" && Number.isFinite(vitals.mhp) ? vitals.mhp : undefined;
    health = visualCore.reduceHealthState(health, { hp, maxhp, mhp }) as RetainedHealth;
    publish();
  });

  listen("Darkwind.Visual.Events", (data) => {
    const normalized = normalizeDarkwindVisualEvents(data);
    if (normalized && !disposed && connected) handleEffects(normalized.epoch, normalized.events);
  });

  listen("Darkwind.Visual.Event", (data) => {
    const normalized = normalizeDarkwindVisualEvent(data);
    if (normalized && !disposed && connected) handleEffects(normalized.epoch, [normalized]);
  });

  listen("Darkwind.Visual.Preview", (data) => {
    const normalized = normalizeDarkwindVisualPreview(data);
    if (!normalized || disposed || !connected) return;
    if (normalized.kind === "clear") {
      const changed = preview !== null;
      clearPreview();
      if (changed) publish();
      return;
    }
    const preferenceKey: Record<
      Exclude<DarkwindVisualPreview["kind"], "clear">,
      SessionVisualEffectKey
    > = {
      planet: "planetAmbience",
      terrain: "terrainAmbience",
      "low-health": "lowHealth",
      transition: "worldTransitions",
    };
    if (!presentationVisible || !effectEnabled(preferenceKey[normalized.kind])) return;
    clearPreview();
    preview = normalized;
    previewGeneration += 1;
    const generation = previewGeneration;
    cancelPreview = scope.setTimeout(() => {
      cancelPreview = null;
      if (disposed || preview === null || previewGeneration !== generation) return;
      preview = null;
      previewGeneration += 1;
      publish();
    }, PREVIEW_TTL_MS);
    publish();
  });

  listen("Darkwind.Session.Recovered", () => {
    if (disposed || !connected) return;
    resetSessionState();
    syncSubscription("session-recovered");
    publish();
  });

  const supportsHandler = (): void => {
    if (disposed) return;
    supported = connected && gmcp.serverSupportsPackage(VISUAL_PACKAGE);
    publish();
  };
  for (const packageName of ["Core.Supports.Set", "Core.Supports.Add", "Core.Supports.Remove"]) {
    listen(packageName, supportsHandler);
  }

  scope.own(
    "subscription",
    eventBus.subscribe("transport:reconnect-status", (event) => {
      const payload = event.payload as TransportReconnectStatusPayload;
      if (payload.status === "connected") {
        if (connected) return;
        const reconnecting = hasConnected;
        connected = true;
        hasConnected = true;
        connectionGeneration += 1;
        const generation = connectionGeneration;
        resetForDisconnect = false;
        supported = gmcp.serverSupportsPackage(VISUAL_PACKAGE);
        if (reconnecting) {
          queueMicrotask(() => {
            if (disposed || !connected || generation !== connectionGeneration) return;
            syncSubscription("reconnect");
          });
        }
        publish();
        return;
      }
      connected = false;
      connectionGeneration += 1;
      supported = false;
      if (!resetForDisconnect) {
        resetForDisconnect = true;
        resetSessionState();
      }
      publish();
    }),
  );

  scope.own("teardown", () => {
    disposed = true;
    connectionGeneration += 1;
    clearTransientPresentation();
    listeners.clear();
  });

  syncSubscription("visual-effects-init");

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      listener(snapshot);
      return scope.own("subscription", () => listeners.delete(listener));
    },
    configure(settings) {
      if (disposed) return;
      const previousEnabled = enabled;
      const previousSubscription = subscriptionEnabled();
      const nextPreferences = normalizedPreferences(settings.visualEffectPreferences);
      const preferencesChanged = SESSION_VISUAL_EFFECT_KEYS.some(
        (key) => nextPreferences[key] !== preferences[key],
      );
      enabled = settings.visualEffectsEnabled === true;
      preferences = nextPreferences;

      if (!enabled) {
        eventModel = visualCore.createVisualEffectsState() as { epoch: string; lastSeq: number };
        resetCooldowns();
        clearTransientPresentation();
      } else if (preferencesChanged) {
        clearTransientPresentation();
      }
      if (previousEnabled !== enabled || previousSubscription !== subscriptionEnabled()) {
        syncSubscription("visual-effects-setting");
      }
      publish();
    },
    setReducedMotion(reduced) {
      if (disposed || reducedMotion === reduced) return;
      reducedMotion = reduced;
      publish();
    },
    setPresentationVisible(visible) {
      if (disposed || presentationVisible === visible) return;
      presentationVisible = visible;
      if (!visible) clearTransientPresentation();
      publish();
    },
  };
}
