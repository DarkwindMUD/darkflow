import typia from "typia";

import { deepFreeze } from "../configuration/snapshot";
import type {
  DarkwindAnnouncement,
  DarkwindAnnouncementsList,
  DarkwindAnnouncementsNew,
  DarkwindAnnouncementsState,
  DarkwindAnnouncementsUpdate,
  DarkwindBroadcastShow,
  DarkwindFishingArt,
  DarkwindFishingBite,
  DarkwindFishingCaught,
  DarkwindFishingEnd,
  DarkwindFishingEscaped,
  DarkwindFishingFight,
  DarkwindFishingOpen,
  DarkwindFishingResult,
  DarkwindGiphyShow,
  DarkwindLinuxRescueOpen,
  DarkwindSnoopAppend,
  DarkwindSnoopClose,
  DarkwindSnoopOpen,
  DarkwindSnoopStatus,
  InteractionFishing,
  SessionInteractionSnapshot,
} from "../gmcp/contracts/interactions.ts";
import type {
  DarkwindWindowClose,
  DarkwindWindowOpen,
  DarkwindWindowUpdate,
} from "../gmcp/contracts/darkwind-window.ts";
import {
  normalizeDarkwindStreetSamurai,
  type DarkwindStreetSamurai,
} from "../gmcp/contracts/street-samurai.ts";
import {
  validateDarkwindAnnouncementsList,
  validateDarkwindAnnouncementsNew,
  validateDarkwindAnnouncementsState,
  validateDarkwindAnnouncementsUpdate,
  validateDarkwindBroadcastShow,
  validateDarkwindFishingArt,
  validateDarkwindFishingBite,
  validateDarkwindFishingCaught,
  validateDarkwindFishingEnd,
  validateDarkwindFishingEscaped,
  validateDarkwindFishingFight,
  validateDarkwindFishingOpen,
  validateDarkwindGiphyShow,
  validateDarkwindLinuxRescueOpen,
  validateDarkwindSnoopAppend,
  validateDarkwindSnoopClose,
  validateDarkwindSnoopOpen,
  validateDarkwindSnoopStatus,
  validateDarkwindStreetSamurai,
  validateDarkwindWindowClose,
  validateDarkwindWindowOpen,
  validateDarkwindWindowUpdate,
} from "../gmcp/contracts/validators";
import type { SessionGmcpBus } from "../gmcp/bus.ts";
import type { SessionTransport, TransportReconnectStatusPayload } from "../transport/types.ts";
import type { SessionEventBus } from "./event-bus.ts";
import type { Unsubscribe } from "./events.ts";
import type { ResourceScope } from "./resource-scope.ts";

const MAX_SNOOP_ENTRIES = 1000;
const AUTH_RESPONSE_TIMEOUT_MS = 8000;
const AUTH_WINDOW_IDS = new Set(["login", "newchar", "charselect"]);
const STREET_WINDOW_FIELDS = [
  "type",
  "title",
  "closable",
  "width",
  "height",
  "dock",
  "order",
  "defaultFloatW",
  "defaultFloatH",
  "defaultFloatX",
  "defaultFloatY",
  "defaultBelowPanel",
  "defaultSnapLeft",
  "defaultSnapTop",
  "defaultSnapRight",
  "defaultSnapBottom",
] as const;

type AuthWatchdogTransport = Pick<
  SessionTransport,
  "state" | "getHealthSnapshot" | "forceReconnect"
>;

export interface SessionInteractions {
  getSnapshot(): SessionInteractionSnapshot;
  subscribe(listener: (snapshot: SessionInteractionSnapshot) => void): Unsubscribe;
  submitWindow(id: string, button: string, data: Record<string, unknown>): boolean;
  sendWindowAction(id: string, button: string): boolean;
  closeWindow(id: string): boolean;
  dismissWindow(id: string): boolean;
  sendSnoopCommand(id: string, mode: "target" | "self", command: string): boolean;
  stopSnoop(id: string): boolean;
  closeSnoop(id: string): boolean;
  requestAnnouncements(): boolean;
  markAnnouncementRead(id: number): boolean;
  castFishing(session: string, power: number): boolean;
  hookFishing(session: string): boolean;
  reportFishingResult(payload: DarkwindFishingResult): boolean;
  cancelFishing(session: string): boolean;
}

type PayloadValidator<T> = (input: unknown) => typia.IValidation<T>;

function emptyFishing(): InteractionFishing {
  return {
    open: null,
    bite: null,
    fight: null,
    caught: null,
    escaped: null,
    end: null,
    art: {},
  };
}

function emptySnapshot(): SessionInteractionSnapshot {
  return {
    windows: {},
    snoop: null,
    announcements: { active: [], archived: [], unreadCount: 0 },
    giphy: null,
    broadcast: null,
    linuxRescue: null,
    fishing: emptyFishing(),
  };
}

function hasYoutubeEmbed(node: unknown): boolean {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  const candidate = node as Record<string, unknown>;
  return (
    candidate.type === "youtube_embed" ||
    (Array.isArray(candidate.children) && candidate.children.some(hasYoutubeEmbed))
  );
}

function prepareWindowOpen(input: unknown): DarkwindWindowOpen | null {
  const result = validateDarkwindWindowOpen(input);
  if (!result.success) return null;
  const open = result.data;
  if (open.layout.type !== "street_samurai_dashboard") return structuredClone(open);

  const state = normalizeDarkwindStreetSamurai(open.layout.state);
  if (!state) return null;
  const id =
    typeof open.layout.id === "string" && open.layout.id.length <= 96 ? open.layout.id : undefined;
  const activeTab =
    open.layout.active_tab === "overview" ||
    open.layout.active_tab === "implants" ||
    open.layout.active_tab === "diagnostics"
      ? open.layout.active_tab
      : undefined;
  const prepared: Record<string, unknown> = {
    id: open.id,
    layout: {
      type: "street_samurai_dashboard",
      ...(id ? { id } : {}),
      ...(activeTab ? { active_tab: activeTab } : {}),
      state,
    },
  };
  for (const field of STREET_WINDOW_FIELDS) {
    if (open[field] !== undefined) prepared[field] = open[field];
  }
  return prepared as DarkwindWindowOpen;
}

function removeAnnouncement(items: readonly DarkwindAnnouncement[], id: number) {
  return items.filter((item) => item.id !== id);
}

function upsertAnnouncement(items: readonly DarkwindAnnouncement[], item: DarkwindAnnouncement) {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index < 0) return [item, ...items];
  const next = [...items];
  next[index] = item;
  return next;
}

/** Creates the session-owned, validated-only Step 7 interaction capability. */
export function createSessionInteractions(
  gmcp: SessionGmcpBus,
  scope: ResourceScope,
  eventBus: SessionEventBus,
  transport: AuthWatchdogTransport,
): SessionInteractions {
  let snapshot = deepFreeze(emptySnapshot());
  let videoWindowCounter = 0;
  let cancelAuthWatchdog: Unsubscribe | null = null;
  const listeners = new Set<(snapshot: SessionInteractionSnapshot) => void>();

  const publish = (next: SessionInteractionSnapshot): void => {
    snapshot = deepFreeze(next);
    for (const listener of [...listeners]) listener(snapshot);
  };

  const update = (changes: Partial<SessionInteractionSnapshot>): void => {
    publish({ ...snapshot, ...changes });
  };

  const stopAuthWatchdog = (): void => {
    cancelAuthWatchdog?.();
    cancelAuthWatchdog = null;
  };

  const startAuthWatchdog = (windowId: string): void => {
    if (!AUTH_WINDOW_IDS.has(windowId)) return;
    stopAuthWatchdog();
    const lastInboundAt = transport.getHealthSnapshot().lastInboundAt ?? 0;
    cancelAuthWatchdog = scope.setTimeout(() => {
      cancelAuthWatchdog = null;
      if (
        transport.state === "connected" &&
        (transport.getHealthSnapshot().lastInboundAt ?? 0) <= lastInboundAt
      ) {
        transport.forceReconnect("auth window got no response");
      }
    }, AUTH_RESPONSE_TIMEOUT_MS);
  };

  const listen = <T>(
    packageName: string,
    validate: PayloadValidator<T>,
    apply: (data: T) => void,
  ): void => {
    const handler = (data: unknown): void => {
      const result = validate(data);
      if (result.success) apply(structuredClone(result.data));
    };
    gmcp.on(packageName, handler);
    scope.own("listener", () => gmcp.off(packageName, handler));
  };

  const applyWindowOpen = (open: DarkwindWindowOpen): void => {
    const sourceId = open.id;
    const id = hasYoutubeEmbed(open.layout)
      ? `${sourceId.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "video"}-video-${Date.now()}-${++videoWindowCounter}`
      : sourceId;
    const streetSamurai =
      open.layout.type === "street_samurai_dashboard"
        ? (open.layout.state as DarkwindStreetSamurai)
        : null;
    update({
      windows: {
        ...snapshot.windows,
        [id]: {
          ...open,
          id,
          sourceId,
          updates: [],
          revision: 0,
          ...(streetSamurai ? { streetSamurai, streetSamuraiRevision: 0 } : {}),
        },
      },
    });
  };
  const windowOpenHandler = (data: unknown): void => {
    const open = prepareWindowOpen(data);
    if (open) applyWindowOpen(open);
  };
  gmcp.on("Darkwind.Window.Open", windowOpenHandler);
  scope.own("listener", () => gmcp.off("Darkwind.Window.Open", windowOpenHandler));
  listen<DarkwindWindowUpdate>(
    "Darkwind.Window.Update",
    validateDarkwindWindowUpdate,
    ({ id, updates }) => {
      const current = Object.hasOwn(snapshot.windows, id) ? snapshot.windows[id] : undefined;
      if (!current) return;
      update({
        windows: {
          ...snapshot.windows,
          [id]: {
            ...current,
            updates: [...current.updates, ...updates],
            revision: current.revision + 1,
          },
        },
      });
    },
  );
  listen<DarkwindWindowClose>("Darkwind.Window.Close", validateDarkwindWindowClose, ({ id }) => {
    if (!Object.hasOwn(snapshot.windows, id)) return;
    const windows = { ...snapshot.windows };
    delete windows[id];
    update({ windows });
  });
  listen<DarkwindStreetSamurai>(
    "Darkwind.StreetSamurai",
    validateDarkwindStreetSamurai,
    (streetSamurai) => {
      const windows = { ...snapshot.windows };
      let changed = false;
      for (const [id, window] of Object.entries(windows)) {
        if (!window.streetSamurai) continue;
        windows[id] = {
          ...window,
          streetSamurai,
          streetSamuraiRevision: (window.streetSamuraiRevision ?? 0) + 1,
        };
        changed = true;
      }
      if (changed) update({ windows });
    },
  );

  listen<DarkwindSnoopOpen>("Darkwind.Snoop.Open", validateDarkwindSnoopOpen, (open) =>
    update({ snoop: { ...open, entries: [] } }),
  );
  listen<DarkwindSnoopAppend>("Darkwind.Snoop.Append", validateDarkwindSnoopAppend, (entry) => {
    if (entry.id !== snapshot.snoop?.id) return;
    update({
      snoop: {
        ...snapshot.snoop,
        entries: [...snapshot.snoop.entries, entry].slice(-MAX_SNOOP_ENTRIES),
      },
    });
  });
  listen<DarkwindSnoopStatus>("Darkwind.Snoop.Status", validateDarkwindSnoopStatus, (status) => {
    if (status.id !== snapshot.snoop?.id) return;
    const entry: DarkwindSnoopAppend = { ...status, type: "status" };
    update({
      snoop: {
        ...snapshot.snoop,
        entries: [...snapshot.snoop.entries, entry].slice(-MAX_SNOOP_ENTRIES),
      },
    });
  });
  listen<DarkwindSnoopClose>("Darkwind.Snoop.Close", validateDarkwindSnoopClose, ({ id }) => {
    if (id === snapshot.snoop?.id) update({ snoop: null });
  });

  listen<DarkwindAnnouncementsList>(
    "Darkwind.Announcements.List",
    validateDarkwindAnnouncementsList,
    (announcements) => update({ announcements }),
  );
  listen<DarkwindAnnouncementsNew>(
    "Darkwind.Announcements.New",
    validateDarkwindAnnouncementsNew,
    ({ item, unreadCount }) =>
      update({
        announcements: {
          active: upsertAnnouncement(snapshot.announcements.active, item),
          archived: removeAnnouncement(snapshot.announcements.archived, item.id),
          unreadCount,
        },
      }),
  );
  listen<DarkwindAnnouncementsUpdate>(
    "Darkwind.Announcements.Update",
    validateDarkwindAnnouncementsUpdate,
    ({ item, bucket, unreadCount }) =>
      update({
        announcements: {
          active:
            bucket === "active"
              ? upsertAnnouncement(snapshot.announcements.active, item)
              : removeAnnouncement(snapshot.announcements.active, item.id),
          archived:
            bucket === "archived"
              ? upsertAnnouncement(snapshot.announcements.archived, item)
              : removeAnnouncement(snapshot.announcements.archived, item.id),
          unreadCount,
        },
      }),
  );
  listen<DarkwindAnnouncementsState>(
    "Darkwind.Announcements.State",
    validateDarkwindAnnouncementsState,
    ({ unreadCount }) => update({ announcements: { ...snapshot.announcements, unreadCount } }),
  );

  listen<DarkwindGiphyShow>("Darkwind.Giphy.Show", validateDarkwindGiphyShow, (giphy) => {
    update({ giphy: giphy.gifUrl.trim() ? giphy : null });
  });
  listen<DarkwindBroadcastShow>(
    "Darkwind.Broadcast.Show",
    validateDarkwindBroadcastShow,
    (broadcast) => update({ broadcast: broadcast.message.trim() ? broadcast : null }),
  );
  listen<DarkwindLinuxRescueOpen>(
    "Darkwind.LinuxRescue.Open",
    validateDarkwindLinuxRescueOpen,
    (linuxRescue) => update({ linuxRescue }),
  );

  listen<DarkwindFishingOpen>("Darkwind.Fishing.Open", validateDarkwindFishingOpen, (open) =>
    update({ fishing: { ...emptyFishing(), open, art: snapshot.fishing.art } }),
  );
  listen<DarkwindFishingBite>("Darkwind.Fishing.Bite", validateDarkwindFishingBite, (bite) => {
    if (bite.session !== snapshot.fishing.open?.session) return;
    update({ fishing: { ...snapshot.fishing, bite, fight: null, caught: null, escaped: null } });
  });
  listen<DarkwindFishingFight>("Darkwind.Fishing.Fight", validateDarkwindFishingFight, (fight) => {
    if (fight.session !== snapshot.fishing.open?.session) return;
    update({ fishing: { ...snapshot.fishing, bite: null, fight, caught: null, escaped: null } });
  });
  listen<DarkwindFishingCaught>(
    "Darkwind.Fishing.Caught",
    validateDarkwindFishingCaught,
    (caught) => {
      if (caught.session !== snapshot.fishing.open?.session) return;
      update({ fishing: { ...snapshot.fishing, bite: null, fight: null, caught, escaped: null } });
    },
  );
  listen<DarkwindFishingEscaped>(
    "Darkwind.Fishing.Escaped",
    validateDarkwindFishingEscaped,
    (escaped) => {
      if (escaped.session !== snapshot.fishing.open?.session) return;
      update({ fishing: { ...snapshot.fishing, bite: null, fight: null, caught: null, escaped } });
    },
  );
  listen<DarkwindFishingArt>("Darkwind.Fishing.Art", validateDarkwindFishingArt, (art) =>
    update({
      fishing: { ...snapshot.fishing, art: { ...snapshot.fishing.art, [art.species]: art.artUrl } },
    }),
  );
  listen<DarkwindFishingEnd>("Darkwind.Fishing.End", validateDarkwindFishingEnd, (end) => {
    if (end.session !== snapshot.fishing.open?.session) return;
    update({ fishing: { ...emptyFishing(), end, art: snapshot.fishing.art } });
  });

  scope.own(
    "subscription",
    eventBus.subscribe("transport:reconnect-status", (event) => {
      const payload = event.payload as TransportReconnectStatusPayload;
      if (payload.status === "connected") return;
      stopAuthWatchdog();
      const windows = payload.userDisconnected
        ? {}
        : Object.fromEntries(
            Object.entries(snapshot.windows).filter(
              ([, window]) => window.type === "modal" && AUTH_WINDOW_IDS.has(window.sourceId),
            ),
          );
      publish({ ...emptySnapshot(), windows });
    }),
  );
  scope.own("teardown", () => {
    cancelAuthWatchdog = null;
    publish(emptySnapshot());
  });

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      if (scope.disposed) return () => {};
      listener(snapshot);
      listeners.add(listener);
      return scope.own("subscription", () => listeners.delete(listener));
    },

    submitWindow(id, button, data) {
      const window = snapshot.windows[id];
      if (scope.disposed || !window || !button.trim()) return false;
      const sent = gmcp.sendWindowSubmit({ id: window.sourceId, button, data });
      if (sent) startAuthWatchdog(window.sourceId);
      return sent;
    },

    sendWindowAction(id, button) {
      const window = snapshot.windows[id];
      if (scope.disposed || !window || !button.trim()) return false;
      const sent = gmcp.sendWindowAction({ id: window.sourceId, button });
      if (sent) startAuthWatchdog(window.sourceId);
      return sent;
    },

    closeWindow(id) {
      const window = snapshot.windows[id];
      if (scope.disposed || !window) return false;
      const sent = gmcp.sendWindowClosed({ id: window.sourceId });
      if (!sent && AUTH_WINDOW_IDS.has(window.sourceId)) return false;
      const windows = { ...snapshot.windows };
      delete windows[id];
      update({ windows });
      return sent;
    },

    dismissWindow(id) {
      if (scope.disposed || !Object.hasOwn(snapshot.windows, id)) return false;
      const windows = { ...snapshot.windows };
      delete windows[id];
      update({ windows });
      return true;
    },

    sendSnoopCommand(id, mode, command) {
      const value = command.trim();
      if (scope.disposed || id !== snapshot.snoop?.id || !value) return false;
      return gmcp.sendSnoopCommand({ id, mode, command: value });
    },

    stopSnoop(id) {
      return !scope.disposed && id === snapshot.snoop?.id && gmcp.sendSnoopStop({ id });
    },

    closeSnoop(id) {
      if (scope.disposed || id !== snapshot.snoop?.id) return false;
      const sent = gmcp.sendSnoopClosed({ id });
      update({ snoop: null });
      return sent;
    },

    requestAnnouncements() {
      return !scope.disposed && gmcp.requestAnnouncements();
    },

    markAnnouncementRead(id) {
      if (scope.disposed || !Number.isInteger(id) || id <= 0) return false;
      const sent = gmcp.markAnnouncementRead({ id });
      if (!sent) return false;
      const read = (item: DarkwindAnnouncement): DarkwindAnnouncement =>
        item.id === id ? { ...item, isRead: 1 } : item;
      const activeItem = snapshot.announcements.active.find((item) => item.id === id);
      update({
        announcements: {
          active: snapshot.announcements.active.map(read),
          archived: snapshot.announcements.archived.map(read),
          unreadCount:
            activeItem?.isRead === 0
              ? Math.max(0, snapshot.announcements.unreadCount - 1)
              : snapshot.announcements.unreadCount,
        },
      });
      return true;
    },

    castFishing(session, power) {
      return (
        !scope.disposed &&
        session === snapshot.fishing.open?.session &&
        Number.isFinite(power) &&
        power >= 0 &&
        power <= 100 &&
        gmcp.sendFishingCast({ session, power })
      );
    },

    hookFishing(session) {
      return (
        !scope.disposed &&
        session === snapshot.fishing.open?.session &&
        gmcp.sendFishingHook({ session })
      );
    },

    reportFishingResult(payload) {
      return (
        !scope.disposed &&
        payload.session === snapshot.fishing.open?.session &&
        Number.isFinite(payload.fightMs) &&
        payload.fightMs >= 0 &&
        Number.isFinite(payload.accuracy) &&
        payload.accuracy >= 0 &&
        payload.accuracy <= 1 &&
        Number.isFinite(payload.tensionPeak) &&
        payload.tensionPeak >= 0 &&
        payload.tensionPeak <= 100 &&
        gmcp.sendFishingResult(payload)
      );
    },

    cancelFishing(session) {
      if (scope.disposed || session !== snapshot.fishing.open?.session) return false;
      const sent = gmcp.sendFishingCancel({ session });
      update({ fishing: { ...emptyFishing(), art: snapshot.fishing.art } });
      return sent;
    },
  };
}
