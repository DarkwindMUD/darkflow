import { deepFreeze } from "../configuration/snapshot";
import type {
  CommChannelEntry,
  CommChannelList,
  CommChannelMessage,
  CommChannelPlayers,
  CommChannelState,
} from "../gmcp/contracts/comm";
import {
  validateCommChannelList,
  validateCommChannelMessage,
  validateCommChannelPlayers,
  validateCommChannelState,
} from "../gmcp/contracts/validators";
import type { SessionGmcpBus } from "../gmcp/bus";
// @ts-expect-error Retained JavaScript helper has no TypeScript declaration.
import * as mentionUtils from "../../public/js/mention-utils.js";
// @ts-expect-error Retained JavaScript helper has no TypeScript declaration.
import * as notificationUtils from "../../public/js/notification-utils.js";
import type { SessionEventBus } from "./event-bus";
import type { Unsubscribe } from "./events";
import type { SessionInformation } from "./information";
import type { ResourceScope } from "./resource-scope";

const MAX_CHANNELS = 128;
const MAX_ROSTER = 512;
const MAX_PLAYER_CHANNELS = 64;
const MAX_NAME_LENGTH = 80;
const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_TEXT_LENGTH = 4096;
const MAX_NOTIFICATIONS = 100;
const MAX_CHANNEL_MESSAGES = 200;
const MAX_OUTPUT_LINES = 250;
const MATCH_WINDOW_MS = 10_000;
const ROSTER_REQUEST_INTERVAL_MS = 1000;
const ROSTER_REQUEST_TIMEOUT_MS = 2500;
const { normalizeChannelList, normalizeChannels, normalizeRoster } = mentionUtils;
const { messageMentionsPlayer, normalizeMentionText } = notificationUtils;

export interface SessionNotificationRosterEntry {
  readonly name: string;
  readonly displayName: string;
  readonly channels: readonly string[];
}

export interface SessionNotification {
  readonly id: number;
  readonly type: "mention";
  readonly channel: string;
  readonly talker: string;
  readonly text: string;
  readonly timestamp: number;
  readonly read: boolean;
  readonly lineId: number | null;
  readonly expired: boolean;
}

export interface SessionChannelMessage {
  readonly id: number;
  readonly channel: string;
  readonly talker: string;
  readonly text: string;
}

export interface SessionChatChannel {
  readonly name: string;
  readonly label: string;
}

export interface SessionNotificationsSnapshot {
  readonly playerName: string;
  readonly channelNames: readonly string[];
  readonly chatChannels: readonly SessionChatChannel[];
  readonly activeChannelNames: readonly string[];
  readonly channelMessages: readonly SessionChannelMessage[];
  readonly onlinePlayerCount: number;
  readonly roster: readonly SessionNotificationRosterEntry[];
  readonly rosterRequestPending: boolean;
  readonly notifications: readonly SessionNotification[];
  readonly unreadCount: number;
}

export interface SessionNotifications {
  getSnapshot(): SessionNotificationsSnapshot;
  subscribe(listener: (snapshot: SessionNotificationsSnapshot) => void): Unsubscribe;
  requestRoster(): boolean;
  recordOutputLine(line: { id: number; text: string }): void;
  resetOutputLines(): void;
  activate(id: number): number | null;
  markExpired(id: number): void;
  clear(): void;
}

interface RecentOutputLine {
  id: number;
  normalizedText: string;
  timestamp: number;
}

interface PendingMention extends SessionNotification {
  normalizedText: string;
  key: string;
}

function emptySnapshot(playerName = ""): SessionNotificationsSnapshot {
  return {
    playerName,
    channelNames: [],
    chatChannels: [],
    activeChannelNames: [],
    channelMessages: [],
    onlinePlayerCount: 0,
    roster: [],
    rosterRequestPending: false,
    notifications: [],
    unreadCount: 0,
  };
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function withinStringBound(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length <= maxLength;
}

function normalizeMessage(data: CommChannelMessage): {
  channel: string;
  talker: string;
  text: string;
} | null {
  const channelValue = data.channel ?? data.chan;
  const talkerValue = data.talker ?? data.player;
  const channel =
    channelValue === undefined
      ? ""
      : withinStringBound(channelValue, MAX_NAME_LENGTH)
        ? channelValue.trim()
        : null;
  const talker =
    talkerValue === undefined
      ? ""
      : withinStringBound(talkerValue, MAX_NAME_LENGTH)
        ? talkerValue.trim()
        : null;
  const text = boundedString(data.text ?? data.msg, MAX_TEXT_LENGTH);
  return channel !== null && talker !== null && text
    ? { channel: channel.toLowerCase(), talker, text }
    : null;
}

function normalizeList(data: CommChannelList): string[] | null {
  if (Array.isArray(data)) {
    for (const entry of data.slice(0, MAX_CHANNELS)) {
      const name = entry.name ?? entry.caption ?? entry.command;
      if (name !== undefined && !withinStringBound(name, MAX_NAME_LENGTH)) return null;
    }
  } else {
    for (const name of Object.keys(data).slice(0, MAX_CHANNELS)) {
      if (!withinStringBound(name, MAX_NAME_LENGTH)) return null;
    }
  }

  const limited = Array.isArray(data)
    ? data.slice(0, MAX_CHANNELS)
    : Object.fromEntries(Object.entries(data).slice(0, MAX_CHANNELS));
  return [...new Set<string>(normalizeChannelList(limited) as string[])].slice(0, MAX_CHANNELS);
}

function chatChannel(entry: CommChannelEntry): SessionChatChannel | null {
  const name = boundedString(entry.name ?? entry.command, MAX_NAME_LENGTH);
  if (!name) return null;
  const label = boundedString(
    entry.caption ?? entry.name ?? entry.command,
    MAX_DISPLAY_NAME_LENGTH,
  );
  return label ? { name: name.toLowerCase(), label } : null;
}

function normalizeChatChannels(data: CommChannelList): SessionChatChannel[] {
  if (!Array.isArray(data)) {
    return Object.keys(data)
      .slice(0, MAX_CHANNELS)
      .map((name) => ({ name: name.toLowerCase(), label: name }));
  }
  return data
    .slice(0, MAX_CHANNELS)
    .map(chatChannel)
    .filter((channel): channel is SessionChatChannel => channel !== null);
}

function normalizeChannelState(data: CommChannelState): string | null {
  return boundedString(
    typeof data === "string" ? data : (data.channel ?? data.name),
    MAX_NAME_LENGTH,
  );
}

function normalizePlayers(data: CommChannelPlayers): SessionNotificationRosterEntry[] | null {
  const roster: SessionNotificationRosterEntry[] = [];
  for (const raw of data.slice(0, MAX_ROSTER)) {
    const name = boundedString(raw.name, MAX_NAME_LENGTH);
    if (!name) return null;
    if (
      (raw.displayName !== undefined &&
        !withinStringBound(raw.displayName, MAX_DISPLAY_NAME_LENGTH)) ||
      (raw.caption !== undefined && !withinStringBound(raw.caption, MAX_DISPLAY_NAME_LENGTH))
    ) {
      return null;
    }
    const displayName =
      (typeof raw.displayName === "string" && raw.displayName.trim()) ||
      (typeof raw.caption === "string" && raw.caption.trim()) ||
      name;
    if (raw.channels !== undefined && !Array.isArray(raw.channels)) return null;

    const channelValues = Array.isArray(raw.channels)
      ? raw.channels.slice(0, MAX_PLAYER_CHANNELS)
      : [];
    if (channelValues.some((channel) => !withinStringBound(channel, MAX_NAME_LENGTH))) {
      return null;
    }
    const channels = normalizeChannels(channelValues).slice(0, MAX_PLAYER_CHANNELS);
    const normalized = normalizeRoster([{ name, displayName, channels }])[0];
    if (normalized) roster.push(normalized);
  }
  return roster;
}

function notificationKey(channel: string, talker: string, text: string): string {
  return `${channel.toLowerCase()}\n${talker.toLowerCase()}\n${normalizeMentionText(text)}`;
}

function publishableNotification(pending: PendingMention): SessionNotification {
  return {
    id: pending.id,
    type: pending.type,
    channel: pending.channel,
    talker: pending.talker,
    text: pending.text,
    timestamp: pending.timestamp,
    read: pending.read,
    lineId: pending.lineId,
    expired: pending.expired,
  };
}

/** Creates the session-owned mention, roster, and output-navigation capability. */
export function createSessionNotifications(
  gmcp: SessionGmcpBus,
  scope: ResourceScope,
  eventBus: SessionEventBus,
  information: SessionInformation,
  options: { now?: () => number } = {},
): SessionNotifications {
  const now = options.now ?? Date.now;
  let snapshot = deepFreeze(emptySnapshot());
  let nextNotificationId = 1;
  let nextChannelMessageId = 1;
  let lastRosterRequestAt = -Infinity;
  let cancelRosterTimeout: Unsubscribe | null = null;
  let recentLines: RecentOutputLine[] = [];
  let pendingMentions: PendingMention[] = [];
  let disposed = false;
  const listeners = new Set<(snapshot: SessionNotificationsSnapshot) => void>();

  const publish = (next: SessionNotificationsSnapshot): void => {
    if (disposed) return;
    snapshot = deepFreeze(next);
    for (const listener of [...listeners]) {
      if (listeners.has(listener)) listener(snapshot);
    }
  };

  const update = (changes: Partial<SessionNotificationsSnapshot>): void => {
    publish({ ...snapshot, ...changes });
  };

  const stopRosterTimeout = (): void => {
    cancelRosterTimeout?.();
    cancelRosterTimeout = null;
  };

  const resetVolatile = (playerName: string): void => {
    stopRosterTimeout();
    recentLines = [];
    pendingMentions = [];
    nextNotificationId = 1;
    nextChannelMessageId = 1;
    lastRosterRequestAt = -Infinity;
    publish(emptySnapshot(playerName));
  };

  const addNotification = (notification: SessionNotification): void => {
    const notifications = [notification, ...snapshot.notifications].slice(0, MAX_NOTIFICATIONS);
    update({
      notifications,
      unreadCount: notifications.filter((item) => !item.read).length,
    });
  };

  const pruneCorrelationState = (timestamp: number): void => {
    const cutoff = timestamp - MATCH_WINDOW_MS;
    recentLines = recentLines.filter((line) => line.timestamp >= cutoff);
    pendingMentions = pendingMentions.filter((notification) => notification.timestamp >= cutoff);
  };

  const findLine = (normalizedText: string, timestamp: number): RecentOutputLine | null => {
    const cutoff = timestamp - MATCH_WINDOW_MS;
    for (let index = recentLines.length - 1; index >= 0; index -= 1) {
      const line = recentLines[index];
      if (
        line &&
        line.timestamp >= cutoff &&
        (line.normalizedText.includes(normalizedText) ||
          normalizedText.includes(line.normalizedText))
      ) {
        return line;
      }
    }
    return null;
  };

  const handleMessage = (data: unknown): void => {
    const result = validateCommChannelMessage(data);
    if (!result.success) return;
    const message = normalizeMessage(result.data);
    if (!message) return;
    const lastMessage = snapshot.channelMessages.at(-1);
    if (
      !lastMessage ||
      notificationKey(lastMessage.channel, lastMessage.talker, lastMessage.text) !==
        notificationKey(message.channel, message.talker, message.text)
    ) {
      update({
        channelMessages: [
          ...snapshot.channelMessages,
          { id: nextChannelMessageId++, ...message },
        ].slice(-MAX_CHANNEL_MESSAGES),
      });
    }
    if (!snapshot.playerName || !messageMentionsPlayer(message.text, snapshot.playerName)) {
      return;
    }

    const timestamp = now();
    pruneCorrelationState(timestamp);
    const key = notificationKey(message.channel, message.talker, message.text);
    const duplicate =
      snapshot.notifications.some(
        (item) =>
          notificationKey(item.channel, item.talker, item.text) === key &&
          timestamp - item.timestamp <= MATCH_WINDOW_MS,
      ) || pendingMentions.some((item) => item.key === key);
    if (duplicate) return;

    const normalizedText = normalizeMentionText(message.text);
    const line = findLine(normalizedText, timestamp);
    const notification: PendingMention = {
      id: nextNotificationId++,
      type: "mention",
      channel: message.channel,
      talker: message.talker,
      text: message.text,
      timestamp,
      read: false,
      lineId: line?.id ?? null,
      expired: false,
      normalizedText,
      key,
    };
    if (line) {
      addNotification(publishableNotification(notification));
    } else {
      pendingMentions.push(notification);
    }
  };

  const listen = (packageName: string, handler: (data: unknown) => void): void => {
    gmcp.on(packageName, handler);
    scope.own("listener", () => gmcp.off(packageName, handler));
  };

  listen("Comm.Channel", handleMessage);
  listen("Comm.Channel.Text", handleMessage);
  listen("Comm.Channel.List", (data) => {
    const boundedData = Array.isArray(data)
      ? data.slice(0, MAX_CHANNELS)
      : data !== null && typeof data === "object"
        ? Object.fromEntries(Object.entries(data).slice(0, MAX_CHANNELS))
        : data;
    const result = validateCommChannelList(boundedData);
    if (!result.success) return;
    const channelNames = normalizeList(result.data);
    if (channelNames) update({ channelNames, chatChannels: normalizeChatChannels(result.data) });
  });
  listen("Comm.Channel.Players", (data) => {
    const result = validateCommChannelPlayers(
      Array.isArray(data) ? data.slice(0, MAX_ROSTER) : data,
    );
    if (!result.success) return;
    const roster = normalizePlayers(result.data);
    if (!roster) return;
    stopRosterTimeout();
    update({ roster, onlinePlayerCount: result.data.length, rosterRequestPending: false });
  });
  listen("Comm.Channel.Start", (data) => {
    const result = validateCommChannelState(data);
    if (!result.success) return;
    const channel = normalizeChannelState(result.data);
    if (!channel || snapshot.activeChannelNames.includes(channel)) return;
    update({ activeChannelNames: [...snapshot.activeChannelNames, channel] });
  });
  listen("Comm.Channel.End", (data) => {
    const result = validateCommChannelState(data);
    if (!result.success) return;
    const channel = normalizeChannelState(result.data);
    if (!channel) return;
    update({ activeChannelNames: snapshot.activeChannelNames.filter((name) => name !== channel) });
  });

  const unsubscribeInformation = information.subscribe((informationSnapshot) => {
    const playerName = boundedString(informationSnapshot.status?.name, MAX_NAME_LENGTH) ?? "";
    if (playerName !== snapshot.playerName) resetVolatile(playerName);
  });
  scope.own("subscription", unsubscribeInformation);

  const unsubscribeReconnect = eventBus.subscribe("transport:reconnect-status", (event) => {
    const payload = event.payload as { status?: unknown };
    if (payload.status !== "connected") resetVolatile("");
  });
  scope.own("subscription", unsubscribeReconnect);

  scope.own("teardown", () => {
    disposed = true;
    stopRosterTimeout();
    recentLines = [];
    pendingMentions = [];
    snapshot = deepFreeze(emptySnapshot());
    listeners.clear();
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      listener(snapshot);
      return scope.own("subscription", () => listeners.delete(listener));
    },
    requestRoster() {
      if (disposed) return false;
      const timestamp = now();
      if (timestamp - lastRosterRequestAt < ROSTER_REQUEST_INTERVAL_MS) return false;
      lastRosterRequestAt = timestamp;
      if (!gmcp.requestChannelPlayers()) return false;
      stopRosterTimeout();
      update({ rosterRequestPending: true });
      cancelRosterTimeout = scope.setTimeout(() => {
        cancelRosterTimeout = null;
        if (snapshot.rosterRequestPending) update({ rosterRequestPending: false });
      }, ROSTER_REQUEST_TIMEOUT_MS);
      return true;
    },
    recordOutputLine(line) {
      if (
        disposed ||
        !Number.isSafeInteger(line.id) ||
        line.id <= 0 ||
        typeof line.text !== "string" ||
        line.text.length > MAX_TEXT_LENGTH
      ) {
        return;
      }
      const normalizedText = normalizeMentionText(line.text);
      if (!normalizedText) return;
      const timestamp = now();
      pruneCorrelationState(timestamp);
      recentLines = recentLines.filter((item) => item.id !== line.id);
      recentLines.push({ id: line.id, normalizedText, timestamp });
      recentLines = recentLines.slice(-MAX_OUTPUT_LINES);

      const remaining: PendingMention[] = [];
      for (const pending of pendingMentions) {
        if (
          normalizedText.includes(pending.normalizedText) ||
          pending.normalizedText.includes(normalizedText)
        ) {
          addNotification({ ...publishableNotification(pending), lineId: line.id });
        } else {
          remaining.push(pending);
        }
      }
      pendingMentions = remaining;
    },
    resetOutputLines() {
      if (disposed) return;
      recentLines = [];
      pendingMentions = [];
      const notifications = snapshot.notifications.map((notification) =>
        notification.lineId === null
          ? notification
          : { ...notification, lineId: null, expired: true },
      );
      if (notifications.some((item, index) => item !== snapshot.notifications[index])) {
        update({ notifications });
      }
    },
    activate(id) {
      if (disposed) return null;
      const index = snapshot.notifications.findIndex((notification) => notification.id === id);
      if (index < 0) return null;
      const current = snapshot.notifications[index];
      if (!current) return null;
      if (!current.read) {
        const notifications = [...snapshot.notifications];
        notifications[index] = { ...current, read: true };
        update({ notifications, unreadCount: Math.max(0, snapshot.unreadCount - 1) });
      }
      return current.expired ? null : current.lineId;
    },
    markExpired(id) {
      if (disposed) return;
      const index = snapshot.notifications.findIndex((notification) => notification.id === id);
      if (index < 0 || snapshot.notifications[index]?.expired) return;
      const notifications = [...snapshot.notifications];
      notifications[index] = { ...notifications[index]!, expired: true };
      update({ notifications });
    },
    clear() {
      if (disposed || snapshot.notifications.length === 0) return;
      update({ notifications: [], unreadCount: 0 });
    },
  };
}
