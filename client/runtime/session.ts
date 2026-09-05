import type { EffectiveConfigurationSnapshot } from "../configuration/snapshot.ts";
import type { SessionConfiguration } from "../configuration/editor.ts";
import type { Unsubscribe as ConfigurationUnsubscribe } from "../configuration/service.ts";
import type { CoreHello } from "../gmcp/contracts/core.ts";
import type { CompletionRequest, CompletionResult } from "../gmcp/contracts/completion.ts";
import type { SessionGmcpBus } from "../gmcp/bus.ts";
import type { CharacterProfileId, ServerProfileId, SessionId } from "../model/ids.ts";
import type { SessionDescriptor, SessionRegistry } from "../model/session-contract.ts";
import type {
  SessionTransport,
  TransportEndpoint,
  TransportHealthSnapshot,
  TransportReconnectStatusPayload,
  TransportState,
} from "../transport/types.ts";
import { LOST_TRANSMISSION_RECOVERY_DELAY_MS } from "../transport/reconnect.ts";
import type { SessionDiagnostics } from "./diagnostics.ts";
import type { SessionEventBus } from "./event-bus.ts";
import type { Unsubscribe } from "./events.ts";
import type { ResourceScope } from "./resource-scope.ts";
import type { AutomationRuntimeState } from "./automation-runtime.ts";
import type { SessionRuntimeState } from "./runtime-state.ts";
import type { SessionInformation } from "./information.ts";
import type { SessionConnectionHealth } from "./connection-health.ts";
import type { SessionInteractions } from "./interactions.ts";
import type { SessionWorld } from "./world.ts";
import type { SessionIde } from "./ide.ts";
import type { SessionNotifications } from "./notifications.ts";
import type { SessionAudio } from "./audio.ts";
import type { SessionCombat } from "./combat.ts";
import type { SessionTutorial } from "./tutorial.ts";
import type { SessionVisualEffects } from "./visual-effects.ts";
import type { TerminalProcessing } from "./terminal-processing.ts";

/** Read model exposing login state and effective configuration for tests and facades. */
export interface SessionRuntimeSnapshot {
  isLoggedIntoCharacter: boolean;
  effectiveConfiguration: EffectiveConfigurationSnapshot;
}

/** Read-only connection state needed by a shell without exposing transport internals. */
export interface SessionConnectionSnapshot {
  endpoint: TransportEndpoint;
  state: TransportState;
  reconnect: TransportReconnectStatusPayload | null;
}

/** Terminal capabilities needed by a mounted session UI. */
export interface TerminalOutputRecord {
  id: number;
  fragments: Array<{
    text: string;
    style: Record<string, unknown>;
    href?: string | null;
  }>;
  cssClass: string;
  complete: boolean;
  text: string;
}

export type TerminalOutputEvent =
  | { type: "reset"; records: TerminalOutputRecord[] }
  | { type: "upsert"; record: TerminalOutputRecord }
  | { type: "remove"; id: number }
  | { type: "clear" }
  | { type: "announce"; text: string };

export interface SessionTerminal {
  readonly automation: AutomationRuntimeState;
  startProcessing(): Promise<void>;
  sendCommand(text: string): boolean;
  executeCommand(text: string): boolean;
  getMappedCommand(event: KeyboardEvent): string | null;
  appendOutput(text: string, cssClass?: string): void;
  appendSystemMessage(text: string): void;
  clearOutput(): void;
  subscribeOutput(listener: (event: TerminalOutputEvent) => void): Unsubscribe;
  subscribeText(listener: (text: string) => void): Unsubscribe;
  requestCompletion(request: CompletionRequest): boolean;
  subscribeCompletion(listener: (result: CompletionResult) => void): Unsubscribe;
  subscribeConfiguration(listener: (snapshot: EffectiveConfigurationSnapshot) => void): Unsubscribe;
}

/** Composed live session owning transport, GMCP, configuration, and runtime state. */
export interface Session {
  readonly sessionId: SessionId;
  readonly serverProfileId: ServerProfileId;
  readonly characterProfileId: CharacterProfileId;
  readonly disposed: boolean;
  readonly terminal: SessionTerminal;
  readonly information: SessionInformation;
  readonly connectionHealth: SessionConnectionHealth;
  readonly interactions: SessionInteractions;
  readonly world: SessionWorld;
  readonly ide: SessionIde;
  readonly notifications: SessionNotifications;
  readonly audio: SessionAudio;
  readonly combat: SessionCombat;
  readonly tutorial: SessionTutorial;
  readonly visualEffects: SessionVisualEffects;
  readonly configuration: SessionConfiguration;
  connect(): void;
  disconnect(): void;
  dispose(): void;
  getEffectiveConfiguration(): EffectiveConfigurationSnapshot;
  getHealthSnapshot(): TransportHealthSnapshot;
  getRuntimeSnapshot(): SessionRuntimeSnapshot;
  getConnectionSnapshot(): SessionConnectionSnapshot;
  setConnectionEndpoint(endpoint: TransportEndpoint): void;
  retryConnection(): void;
  subscribeConnection(listener: (snapshot: SessionConnectionSnapshot) => void): Unsubscribe;
  onDispose(listener: () => void): Unsubscribe;
}

/** Already-constructed parts wired together by createSession. */
export interface SessionParts {
  descriptor: SessionDescriptor;
  registry: SessionRegistry;
  scope: ResourceScope;
  eventBus: SessionEventBus;
  diagnostics: SessionDiagnostics;
  transport: SessionTransport;
  gmcp: SessionGmcpBus;
  runtimeState: SessionRuntimeState;
  getClientInfo: () => CoreHello;
  unsubscribeConfiguration: ConfigurationUnsubscribe;
  getConnectionEndpoint: () => TransportEndpoint;
  setConnectionEndpoint: (endpoint: TransportEndpoint) => void;
  automationRuntime: AutomationRuntimeState;
  configuration: SessionConfiguration;
  subscribeText: (listener: (text: string) => void) => Unsubscribe;
  subscribeConfiguration: (
    listener: (snapshot: EffectiveConfigurationSnapshot) => void,
  ) => ConfigurationUnsubscribe;
  information: SessionInformation;
  connectionHealth: SessionConnectionHealth;
  interactions: SessionInteractions;
  world: SessionWorld;
  ide: SessionIde;
  notifications: SessionNotifications;
  audio: SessionAudio;
  combat: SessionCombat;
  tutorial: SessionTutorial;
  visualEffects: SessionVisualEffects;
}

/** Wires transport and GMCP event subscriptions into one session lifecycle. */
export function createSession(parts: SessionParts): Session {
  const {
    descriptor,
    registry,
    scope,
    eventBus,
    transport,
    gmcp,
    runtimeState,
    getClientInfo,
    unsubscribeConfiguration,
    getConnectionEndpoint,
    setConnectionEndpoint,
    automationRuntime,
    configuration: configurationCapability,
    subscribeText,
    subscribeConfiguration,
    information,
    connectionHealth,
    interactions,
    world,
    ide,
    notifications,
    audio,
    combat,
    tutorial,
    visualEffects,
  } = parts;

  let disposed = false;
  let reconnect: TransportReconnectStatusPayload | null = null;
  let terminalProcessing: TerminalProcessing | null = null;
  let terminalProcessingPromise: Promise<void> | null = null;
  const completionListeners = new Set<(result: CompletionResult) => void>();

  const completionHandler = (result: CompletionResult): void => {
    for (const listener of [...completionListeners]) {
      listener(result);
    }
  };
  gmcp.onCompletionResult(completionHandler);
  scope.own("listener", () => {
    gmcp.offCompletionResult(completionHandler);
  });

  function getConnectionSnapshot(): SessionConnectionSnapshot {
    return {
      endpoint: { ...getConnectionEndpoint() },
      state:
        reconnect?.status === "connecting"
          ? "connecting"
          : reconnect?.status === "connected"
            ? "connected"
            : "disconnected",
      reconnect: reconnect ? { ...reconnect } : null,
    };
  }

  const vitalsHandler = () => {
    runtimeState.markCharacterVitalsReceived();
  };
  gmcp.on("Char.Vitals", vitalsHandler);
  scope.own("listener", () => {
    gmcp.off("Char.Vitals", vitalsHandler);
  });

  const automationGmcpHandler = (packageName: string, data: unknown): void => {
    automationRuntime.setGmcpVariable(packageName, data);
  };
  gmcp.on("*", automationGmcpHandler);
  scope.own("listener", () => {
    gmcp.off("*", automationGmcpHandler);
  });

  function sendConnectHandshake(reason: "login" | "reconnect"): void {
    gmcp.sendHandshake(getClientInfo());
    gmcp.sendSubscriptions({ reason, full: true });
  }

  function sendHandshakeGuardResend(): void {
    gmcp.sendHandshake(getClientInfo());
    gmcp.sendSubscriptions({ full: true });
  }

  scope.own(
    "subscription",
    eventBus.subscribe("transport:reconnect-status", (event) => {
      const payload = event.payload as TransportReconnectStatusPayload;
      reconnect = { ...payload };
      if (payload.status !== "connected") {
        automationRuntime.resetGmcpVariables();
        return;
      }

      runtimeState.resetCharacterVitals();
      const { reason } = runtimeState.markConnected();
      sendConnectHandshake(reason);
    }),
  );

  scope.own(
    "subscription",
    eventBus.subscribe("transport:handshake-guard-elapsed", () => {
      sendHandshakeGuardResend();
    }),
  );

  scope.own(
    "subscription",
    eventBus.subscribe("transport:lost-transmission-detected", () => {
      scope.setTimeout(() => {
        if (transport.state === "connected") {
          gmcp.restartHandshake({ reason: "lost-transmission" });
        }
      }, LOST_TRANSMISSION_RECOVERY_DELAY_MS);
    }),
  );

  const terminal: SessionTerminal = {
    automation: automationRuntime,
    async startProcessing() {
      if (disposed || terminalProcessing !== null) return;
      terminalProcessingPromise ??= import("./terminal-processing.ts").then(
        ({ createTerminalProcessing }) => {
          if (!disposed && terminalProcessing === null) {
            terminalProcessing = createTerminalProcessing(session, subscribeText);
          }
        },
      );
      await terminalProcessingPromise;
    },
    sendCommand(text) {
      return transport.send(text, { kind: "command", size: text.length, preview: text });
    },
    executeCommand(text) {
      return terminalProcessing?.executeCommand(text) ?? false;
    },
    getMappedCommand(event) {
      return terminalProcessing?.getMappedCommand(event) ?? null;
    },
    appendOutput(text, cssClass) {
      terminalProcessing?.appendOutput(text, cssClass);
    },
    appendSystemMessage(text) {
      terminalProcessing?.appendSystemMessage(text);
    },
    clearOutput() {
      terminalProcessing?.clear();
    },
    subscribeOutput(listener) {
      return terminalProcessing?.subscribe(listener) ?? (() => {});
    },
    subscribeText(listener) {
      if (disposed) {
        return () => {};
      }
      return scope.own("subscription", subscribeText(listener));
    },
    requestCompletion(request) {
      return !disposed && gmcp.requestCompletion(request);
    },
    subscribeCompletion(listener) {
      if (disposed) {
        return () => {};
      }
      completionListeners.add(listener);
      return scope.own("subscription", () => completionListeners.delete(listener));
    },
    subscribeConfiguration(listener) {
      if (disposed) {
        return () => {};
      }
      listener(runtimeState.getEffectiveConfiguration());
      return scope.own("subscription", subscribeConfiguration(listener));
    },
  };

  const configuration: SessionConfiguration = {
    getSnapshot: configurationCapability.getSnapshot,
    replaceLocalDefinitions: configurationCapability.replaceLocalDefinitions,
    publishConfigurationSet: configurationCapability.publishConfigurationSet,
    setThemeKey: configurationCapability.setThemeKey,
    subscribe(listener) {
      if (disposed) {
        return () => {};
      }
      return scope.own("subscription", configurationCapability.subscribe(listener));
    },
  };

  const session: Session = {
    get sessionId() {
      return descriptor.sessionId;
    },

    get serverProfileId() {
      return descriptor.serverProfileId;
    },

    get characterProfileId() {
      return descriptor.characterProfileId;
    },

    get disposed() {
      return disposed;
    },

    terminal,

    information,

    connectionHealth,

    interactions,

    world,

    ide,

    notifications,

    audio,

    combat,

    tutorial,

    visualEffects,

    configuration,

    connect() {
      transport.connect();
    },

    disconnect() {
      transport.disconnect();
    },

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      terminalProcessing?.dispose();
      terminalProcessing = null;
      terminalProcessingPromise = null;
      unsubscribeConfiguration();
      registry.release(descriptor.sessionId, descriptor.characterProfileId);
      transport.dispose();
    },

    getEffectiveConfiguration() {
      return runtimeState.getEffectiveConfiguration();
    },

    getHealthSnapshot() {
      return transport.getHealthSnapshot();
    },

    getRuntimeSnapshot() {
      return {
        isLoggedIntoCharacter: runtimeState.isLoggedIntoCharacter(),
        effectiveConfiguration: runtimeState.getEffectiveConfiguration(),
      };
    },

    getConnectionSnapshot,

    setConnectionEndpoint,

    retryConnection() {
      transport.retryNow();
    },

    subscribeConnection(listener) {
      listener(getConnectionSnapshot());
      return scope.own(
        "subscription",
        eventBus.subscribe("transport:reconnect-status", () => {
          listener(getConnectionSnapshot());
        }),
      );
    },

    onDispose(listener) {
      return scope.own("listener", listener);
    },
  };

  return session;
}
