import { deepFreeze } from "../configuration/snapshot";
import type { SessionGmcpBus } from "../gmcp/bus.ts";
import type { Unsubscribe } from "./events.ts";
import type { ResourceScope } from "./resource-scope.ts";
import type { SessionWorldDiagnostics } from "./world.ts";

export const GMCP_DIAGNOSTIC_LIMIT = 200;
export const GMCP_DIAGNOSTIC_PAYLOAD_LIMIT = 16 * 1024;

const SENSITIVE_KEY = /^(password|passwd|passphrase|token|secret|authorization|cookie)$/i;
const TRUNCATED_MARKER = "… [truncated]";

export interface GmcpDiagnosticEntry {
  readonly id: number;
  readonly packageName: string;
  readonly timestamp: string;
  readonly payload: string;
}

export interface GmcpDiagnosticsSnapshot {
  readonly entries: readonly GmcpDiagnosticEntry[];
}

/** Public developer diagnostic read model; it deliberately exposes inert strings only. */
export interface SessionGmcpDiagnostics {
  getSnapshot(): GmcpDiagnosticsSnapshot;
  subscribe(listener: (snapshot: GmcpDiagnosticsSnapshot) => void): Unsubscribe;
  appendMapSummary(): boolean;
  copyMapExport(): string | null;
  clearMap(): boolean;
}

function formatPayload(value: unknown): string {
  let payload: string;
  try {
    payload = JSON.stringify(value, (key, nested) =>
      SENSITIVE_KEY.test(key) ? "[redacted]" : nested,
    );
  } catch {
    payload = "[unserializable payload]";
  }
  payload ??= "undefined";
  return payload.length > GMCP_DIAGNOSTIC_PAYLOAD_LIMIT
    ? `${payload.slice(0, GMCP_DIAGNOSTIC_PAYLOAD_LIMIT - TRUNCATED_MARKER.length)}${TRUNCATED_MARKER}`
    : payload;
}

/** Observes canonical GMCP frames for the life of one Session. */
export function createSessionGmcpDiagnostics(
  gmcp: SessionGmcpBus,
  scope: ResourceScope,
  world: SessionWorldDiagnostics,
  options: { now?: () => number } = {},
): SessionGmcpDiagnostics {
  const now = options.now ?? Date.now;
  let disposed = false;
  let nextEntryId = 0;
  let snapshot = deepFreeze({ entries: [] }) as GmcpDiagnosticsSnapshot;
  const listeners = new Set<(snapshot: GmcpDiagnosticsSnapshot) => void>();

  const publish = (entry: GmcpDiagnosticEntry): void => {
    if (disposed) return;
    snapshot = deepFreeze({ entries: [...snapshot.entries, entry].slice(-GMCP_DIAGNOSTIC_LIMIT) });
    for (const listener of [...listeners]) {
      if (listeners.has(listener)) listener(snapshot);
    }
  };
  const append = (packageName: string, payload: string): void =>
    publish(
      deepFreeze({
        id: ++nextEntryId,
        packageName,
        timestamp: new Date(now()).toISOString(),
        payload,
      }),
    );
  const handler = (packageName: string, data: unknown): void =>
    append(packageName, formatPayload(data));
  gmcp.on("*", handler);
  scope.own("listener", () => gmcp.off("*", handler));
  scope.own("listener", () => {
    disposed = true;
    listeners.clear();
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listener(snapshot);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    appendMapSummary() {
      if (disposed) return false;
      append("Map Summary", world.mapSummary());
      return true;
    },
    copyMapExport: () => (disposed ? null : world.mapExport()),
    clearMap() {
      if (disposed || !world.clearMap()) return false;
      append("Map Clear", "Authoritative map cache cleared; recover by resyncing or relearning.");
      return true;
    },
  };
}
