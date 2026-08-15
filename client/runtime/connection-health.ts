import { deepFreeze } from "../configuration/snapshot";
import type { DarkwindLagStatus } from "../gmcp/contracts/diagnostics.ts";
import { validateCorePing, validateDarkwindLagStatus } from "../gmcp/contracts/validators";
import type { SessionGmcpBus } from "../gmcp/bus.ts";
import type {
  SessionTransport,
  TransportEndpoint,
  TransportHealthSnapshot,
  TransportReconnectStatusPayload,
} from "../transport/types.ts";
// @ts-expect-error Pure legacy-compatible diagnostics core has no declaration file.
import * as lagCore from "../../public/js/lag-core.mjs";
import type { SessionEventBus } from "./event-bus.ts";
import type { Unsubscribe } from "./events.ts";
import type { Disposer, ResourceScope } from "./resource-scope.ts";

const {
  LAG_THRESHOLDS,
  chipStatus,
  diagnose,
  makePingCorrelator,
  makeRing,
  summarizeLocal,
  summarizeRtt,
} = lagCore;

const PING_INTERVAL_MS = 5_000;
const HTTP_INTERVAL_MS = 30_000;
const HTTP_INTERVAL_FAST_MS = 10_000;
const SERVER_POLL_INTERVAL_MS = 15_000;
const LOCAL_TICK_MS = 1_000;
const FULL_CHECK_DURATION_MS = 10_000;
const INTERNET_PROBE_URL = "https://www.gstatic.com/generate_204";

interface RttSample {
  t: number;
  rtt?: number | null;
  gap?: boolean;
}

interface LocalSample {
  t: number;
  driftMs?: number;
  longTaskMs?: number;
  hidden?: boolean;
  gap?: boolean;
}

export interface ConnectionHealthSnapshot {
  readonly t: number;
  readonly enabled: boolean;
  readonly diagnosis: {
    readonly verdict: string;
    readonly headline: string;
    readonly network: { readonly status: string; readonly reasons: readonly string[] };
    readonly server: { readonly status: string; readonly reasons: readonly string[] };
    readonly local: { readonly status: string; readonly reasons: readonly string[] };
  };
  readonly inputs: {
    readonly connected: boolean;
    readonly mud: Record<string, number | null> | null;
    readonly http: Record<string, number | null> | null;
    readonly server: DarkwindLagStatus | null;
    readonly serverSupported: boolean;
    readonly serverPollMisses: number;
    readonly local: Record<string, number> | null;
    readonly reconnectsRecent: number;
  };
  readonly latestRtt: number | null;
  readonly chip: string;
  readonly mudSamples: readonly RttSample[];
  readonly httpSamples: readonly RttSample[];
  readonly fullCheck: {
    readonly running: boolean;
    readonly startedAt: number;
    readonly finishedAt?: number;
    readonly internetRtt: number | null;
    readonly internetError: boolean;
  } | null;
  readonly endpoint: TransportEndpoint;
  readonly transport: TransportHealthSnapshot;
}

export interface SessionConnectionHealth {
  getSnapshot(): ConnectionHealthSnapshot;
  subscribe(listener: (snapshot: ConnectionHealthSnapshot) => void): Unsubscribe;
  runFullCheck(): boolean;
}

interface VisibilityTarget {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface ConnectionHealthOptions {
  now?: () => number;
  wallNow?: () => number;
  fetch?: typeof fetch;
  visibilityTarget?: VisibilityTarget;
  isOnline?: () => boolean;
  webHostname?: string;
  getEnabled?: () => boolean;
}

/** Creates the session-owned lag monitor without exposing transport or GMCP handles. */
export function createSessionConnectionHealth(
  gmcp: SessionGmcpBus,
  transport: SessionTransport,
  scope: ResourceScope,
  eventBus: SessionEventBus,
  getEndpoint: () => TransportEndpoint,
  options: ConnectionHealthOptions = {},
): SessionConnectionHealth {
  const now = options.now ?? (() => globalThis.performance?.now() ?? Date.now());
  const wallNow = options.wallNow ?? Date.now;
  const fetcher = options.fetch ?? globalThis.fetch;
  const visibility = options.visibilityTarget ?? globalThis.document;
  const isOnline = options.isOnline ?? (() => globalThis.navigator?.onLine !== false);
  const getEnabled = options.getEnabled ?? (() => true);
  const webHostname = options.webHostname ?? globalThis.location?.hostname ?? "";
  const mudRing = makeRing(120) as ReturnType<typeof makeRing>;
  const httpRing = makeRing(60) as ReturnType<typeof makeRing>;
  const localRing = makeRing(120) as ReturnType<typeof makeRing>;
  const correlator = makePingCorrelator({ timeoutMs: LAG_THRESHOLDS.pingTimeoutMs });
  const listeners = new Set<(snapshot: ConnectionHealthSnapshot) => void>();
  let connected = false;
  let serverStatus: DarkwindLagStatus | null = null;
  let serverPollMisses = 0;
  let lastLocalTick = now();
  let longTaskMs = 0;
  let lastHttpAt = 0;
  let httpFirstSampleDropped = false;
  let reconnectTimes: number[] = [];
  let probeTimers: Disposer[] = [];
  let fullCheck: ConnectionHealthSnapshot["fullCheck"] = null;
  let lastDiagnosis: ConnectionHealthSnapshot["diagnosis"] | null = null;
  let disposed = false;

  const isHidden = (): boolean => visibility?.hidden === true;

  const getSnapshot = (): ConnectionHealthSnapshot => {
    const t = now();
    const transportSnapshot = transport.getHealthSnapshot();
    const reconnectsRecent =
      reconnectTimes.filter((at) => t - at <= LAG_THRESHOLDS.windowMs).length -
      (reconnectTimes.length > 0 && t - reconnectTimes[0]! <= LAG_THRESHOLDS.windowMs ? 1 : 0);
    const mudSamples = mudRing.items() as RttSample[];
    const mud = summarizeRtt(mudSamples, t);
    const httpSamples = httpRing.items() as RttSample[];
    const http = summarizeRtt(httpSamples, t);
    const local = summarizeLocal(localRing.items() as LocalSample[], t);
    const endpoint = getEndpoint();
    const inputs = {
      connected,
      online: isOnline(),
      mud,
      http,
      server: serverStatus,
      serverSupported: gmcp.serverSupportsPackage("Darkwind.Lag"),
      serverPollMisses: Math.max(0, serverPollMisses - 1),
      local,
      wsStalled: !!transportSnapshot.stalledAt,
      reconnectsRecent: Math.max(0, reconnectsRecent),
      bufferedBytes: transportSnapshot.lastBufferedAmount,
      sameHost: !endpoint.host || endpoint.host === webHostname,
    };
    const diagnosis = diagnose(inputs) as ConnectionHealthSnapshot["diagnosis"];
    lastDiagnosis = diagnosis;
    const latest = [...mudSamples].reverse().find(({ rtt }) => typeof rtt === "number");
    const latestRtt = latest?.rtt ?? null;
    return deepFreeze({
      t,
      enabled: getEnabled(),
      diagnosis,
      inputs,
      latestRtt,
      chip: chipStatus(connected && latest ? latestRtt : null, diagnosis.verdict),
      mudSamples,
      httpSamples,
      fullCheck,
      endpoint: { ...endpoint },
      transport: transportSnapshot,
    }) as ConnectionHealthSnapshot;
  };

  let snapshot = getSnapshot();
  const publish = (): void => {
    if (disposed) return;
    snapshot = getSnapshot();
    for (const listener of [...listeners]) listener(snapshot);
  };

  const stopProbes = (): void => {
    for (const release of probeTimers) release();
    probeTimers = [];
  };

  const ownedFetch = async (input: RequestInfo | URL, init: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const releaseAbort = scope.own("teardown", () => controller.abort());
    const releaseTimeout = scope.setTimeout(() => controller.abort(), LAG_THRESHOLDS.pingTimeoutMs);
    try {
      return await fetcher(input, { ...init, signal: controller.signal });
    } finally {
      releaseTimeout();
      releaseAbort();
    }
  };

  const sendPing = (): void => {
    if (!connected || !getEnabled() || isHidden() || !gmcp.enabled || !correlator.canSend()) return;
    if (gmcp.sendPing()) correlator.onSend(now());
  };

  const httpProbe = async (): Promise<void> => {
    if (!fetcher || disposed) return;
    lastHttpAt = now();
    const startedAt = now();
    try {
      await ownedFetch(`/ping?t=${wallNow()}`, { cache: "no-store" });
      const rtt = Math.round(now() - startedAt);
      if (!httpFirstSampleDropped) httpFirstSampleDropped = true;
      else httpRing.push({ t: now(), rtt });
    } catch {
      httpRing.push({ t: now(), rtt: null });
    }
    publish();
  };

  const maybeHttpProbe = (force = false): void => {
    if (!getEnabled() || isHidden()) return;
    const degraded = ["warn", "bad"].includes(lastDiagnosis?.network.status ?? "");
    const interval = degraded ? HTTP_INTERVAL_FAST_MS : HTTP_INTERVAL_MS;
    if (!force && now() - lastHttpAt < interval - 500) return;
    void httpProbe();
  };

  const pollServer = (): void => {
    if (
      connected &&
      getEnabled() &&
      !isHidden() &&
      gmcp.enabled &&
      gmcp.serverSupportsPackage("Darkwind.Lag") &&
      gmcp.requestLagStatus()
    ) {
      serverPollMisses += 1;
    }
  };

  const startProbes = (): void => {
    stopProbes();
    probeTimers = [
      scope.setTimeout(() => {
        sendPing();
        maybeHttpProbe(true);
        pollServer();
      }, 0),
      scope.setInterval(sendPing, PING_INTERVAL_MS),
      scope.setInterval(maybeHttpProbe, HTTP_INTERVAL_FAST_MS),
      scope.setInterval(pollServer, SERVER_POLL_INTERVAL_MS),
    ];
  };

  const pingHandler = (data: unknown): void => {
    if (!validateCorePing(data).success) return;
    const rtt = correlator.onEcho(now());
    if (rtt !== null) {
      mudRing.push({ t: now(), rtt: Math.round(rtt) });
      publish();
    }
  };
  gmcp.on("Core.Ping", pingHandler);
  scope.own("listener", () => gmcp.off("Core.Ping", pingHandler));

  const lagHandler = (data: unknown): void => {
    const result = validateDarkwindLagStatus(data);
    if (!result.success) return;
    serverStatus = structuredClone(result.data);
    serverPollMisses = 0;
    publish();
  };
  gmcp.on("Darkwind.Lag.Status", lagHandler);
  scope.own("listener", () => gmcp.off("Darkwind.Lag.Status", lagHandler));

  scope.own(
    "subscription",
    eventBus.subscribe("transport:reconnect-status", (event) => {
      const payload = event.payload as TransportReconnectStatusPayload;
      const wasConnected = connected;
      connected = payload.status === "connected";
      if (connected && !wasConnected) {
        if (mudRing.size()) mudRing.push({ t: now(), gap: true });
        reconnectTimes = [...reconnectTimes, now()].slice(-10);
        startProbes();
      } else if (!connected && wasConnected) {
        correlator.abort();
        stopProbes();
      }
      if (!connected) serverStatus = null;
      publish();
    }),
  );

  if (visibility) {
    const visibilityHandler = (): void => {
      if (isHidden()) {
        correlator.abort();
        stopProbes();
        mudRing.push({ t: now(), gap: true });
        localRing.push({ t: now(), gap: true });
      } else if (connected) {
        startProbes();
      }
      publish();
    };
    visibility.addEventListener("visibilitychange", visibilityHandler);
    scope.own("listener", () =>
      visibility.removeEventListener("visibilitychange", visibilityHandler),
    );
  }

  if (typeof PerformanceObserver !== "undefined") {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTaskMs += entry.duration;
      });
      observer.observe({ entryTypes: ["longtask"] });
      scope.own("observer", () => observer.disconnect());
    } catch {
      // Event-loop drift remains available where long-task observation is unsupported.
    }
  }

  scope.setInterval(() => {
    const t = now();
    const drift = Math.max(0, t - lastLocalTick - LOCAL_TICK_MS);
    lastLocalTick = t;
    localRing.push({
      t,
      driftMs: Math.round(drift),
      longTaskMs: Math.round(longTaskMs),
      hidden: isHidden(),
    });
    longTaskMs = 0;
    if (correlator.checkTimeout(t)) mudRing.push({ t, rtt: null });
    publish();
  }, LOCAL_TICK_MS);

  const delay = (delayMs: number): Promise<void> =>
    new Promise((resolve) => scope.setTimeout(resolve, delayMs));

  const runFullCheck = (): boolean => {
    if (disposed || fullCheck?.running) return false;
    fullCheck = {
      running: true,
      startedAt: now(),
      internetRtt: null,
      internetError: false,
    };
    publish();
    void (async () => {
      const burstTimers = [
        scope.setInterval(sendPing, 1_000),
        scope.setInterval(() => void httpProbe(), 2_000),
      ];
      pollServer();
      const internetSamples: number[] = [];
      for (let index = 0; index < 3 && !disposed; index += 1) {
        const startedAt = now();
        try {
          await ownedFetch(`${INTERNET_PROBE_URL}?t=${wallNow()}${index}`, {
            mode: "no-cors",
            cache: "no-store",
          });
          if (index > 0) internetSamples.push(now() - startedAt);
        } catch {
          fullCheck = fullCheck ? { ...fullCheck, internetError: true } : null;
          break;
        }
      }
      await delay(FULL_CHECK_DURATION_MS);
      for (const release of burstTimers) release();
      if (disposed || !fullCheck) return;
      internetSamples.sort((a, b) => a - b);
      fullCheck = {
        ...fullCheck,
        running: false,
        finishedAt: now(),
        internetRtt: internetSamples.length
          ? Math.round(internetSamples[Math.floor(internetSamples.length / 2)]!)
          : null,
      };
      publish();
    })();
    return true;
  };

  scope.own("teardown", () => {
    disposed = true;
    listeners.clear();
    stopProbes();
    correlator.abort();
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listener(snapshot);
      listeners.add(listener);
      return scope.own("subscription", () => listeners.delete(listener));
    },
    runFullCheck,
  };
}
