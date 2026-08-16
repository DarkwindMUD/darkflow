import { resolveEffectiveConfiguration } from "../configuration/resolve.ts";
import { createSessionConfiguration } from "../configuration/editor.ts";
import { subscribe } from "../configuration/service.ts";
import type { Unsubscribe } from "./events.ts";
import { createSessionGmcpBus, type SessionGmcpBus } from "../gmcp/bus.ts";
import type { CoreHello } from "../gmcp/contracts/core.ts";
import type { CharacterProfileId, ServerProfileId, UuidFactory } from "../model/ids.ts";
import { createSessionId } from "../model/ids.ts";
import type { ApplicationStateV1 } from "../model/profiles.ts";
import type { SessionRegistry } from "../model/session-contract.ts";
import { createSessionTransport } from "../transport/connection.ts";
import type { SessionTransport } from "../transport/types.ts";
import type { WebSocketLike } from "../transport/types.ts";
import type { TransportEndpoint } from "../transport/types.ts";
import { SessionDiagnostics } from "./diagnostics.ts";
import { createSessionEventBus } from "./event-bus.ts";
import { createResourceScope } from "./resource-scope.ts";
import { createSessionRuntimeState } from "./runtime-state.ts";
import { createAutomationRuntimeState, type AutomationRuntimeState } from "./automation-runtime.ts";
import { createSession, type Session } from "./session.ts";
import { createSessionInformation } from "./information.ts";
import { createSessionConnectionHealth } from "./connection-health.ts";
import { createSessionInteractions } from "./interactions.ts";
import { createSessionWorld } from "./world.ts";
import { createSessionIde } from "./ide.ts";
import type { SessionEventBus } from "./event-bus.ts";
import type { ResourceScope } from "./resource-scope.ts";
import type { StorageLike } from "../storage/repository.ts";

/** Wiring handles exposed to Phase 1 compatibility facades; not part of the public Session API. */
export interface SessionFacadeHandles {
  gmcp: SessionGmcpBus;
  transport: SessionTransport;
  scope: ResourceScope;
  automationRuntime: AutomationRuntimeState;
  eventBus: SessionEventBus;
  /** Read-only lifecycle counters exposed to compatibility diagnostics. */
  getLifecycleDiagnostics(): ReturnType<SessionDiagnostics["snapshot"]>;
  /** Updates the live transport endpoint read on each connect attempt. */
  setConnectionEndpoint(endpoint: TransportEndpoint): void;
  /** Returns the migrated server profile endpoint before toolbar overrides. */
  getBaselineEndpoint(): TransportEndpoint;
}

/** Injected dependencies required to construct a session from application state. */
export interface SessionFactoryDeps {
  storage: StorageLike;
  uuidFactory: UuidFactory;
  registry: SessionRegistry;
  getAutoReconnect: () => boolean;
  getClientInfo: () => CoreHello;
  appOrigin: string;
  webSocketFactory: (url: string) => WebSocketLike;
  onlineTarget: { addEventListener(type: string, listener: () => void): void };
  now?: () => number;
  onText: (text: string) => void;
  subscribeText?: (listener: (text: string) => void) => Unsubscribe;
  getLagMonitorEnabled?: () => boolean;
}

/** Result of attempting to create a session from validated application state. */
export type SessionFactoryResult =
  | { success: true; data: Session; handles: SessionFacadeHandles }
  | {
      success: false;
      code: "unknown-server-profile" | "unknown-character-profile" | "character-server-mismatch";
      message: string;
    };

/** Validates profiles, claims the registry, and composes a live session. */
export function createSessionFromState(
  state: ApplicationStateV1,
  serverProfileId: ServerProfileId,
  characterProfileId: CharacterProfileId,
  deps: SessionFactoryDeps,
): SessionFactoryResult {
  const serverProfile = state.serverProfiles[serverProfileId];
  if (serverProfile === undefined) {
    return {
      success: false,
      code: "unknown-server-profile",
      message: `Server profile ${serverProfileId} is not present in the application graph.`,
    };
  }

  const characterProfile = state.characterProfiles[characterProfileId];
  if (characterProfile === undefined) {
    return {
      success: false,
      code: "unknown-character-profile",
      message: `Character profile ${characterProfileId} is not present in the application graph.`,
    };
  }

  if (characterProfile.serverProfileId !== serverProfileId) {
    return {
      success: false,
      code: "character-server-mismatch",
      message: `Character profile ${characterProfileId} does not belong to server profile ${serverProfileId}.`,
    };
  }

  const resolved = resolveEffectiveConfiguration(state, characterProfileId);
  if (!resolved.success || resolved.data === undefined) {
    return {
      success: false,
      code: "unknown-character-profile",
      message: `Character profile ${characterProfileId} could not resolve effective configuration.`,
    };
  }

  const sessionId = createSessionId(deps.uuidFactory);
  const descriptor = {
    sessionId,
    serverProfileId,
    characterProfileId,
  };

  deps.registry.claim(descriptor);

  const diagnostics = new SessionDiagnostics(sessionId);
  const scope = createResourceScope(sessionId, diagnostics);
  const eventBus = createSessionEventBus(sessionId, diagnostics);

  const compositionRefs: {
    transport: SessionTransport | null;
    runtimeState: ReturnType<typeof createSessionRuntimeState> | null;
  } = {
    transport: null,
    runtimeState: null,
  };

  const gmcp = createSessionGmcpBus(
    sessionId,
    (bytes) => compositionRefs.transport!.send(bytes),
    diagnostics,
  );

  const baselineEndpoint: TransportEndpoint = {
    host: serverProfile.host,
    port: String(serverProfile.port),
    protocol: serverProfile.protocol,
  };
  const connectionEndpoint: TransportEndpoint = { ...baselineEndpoint };
  const setConnectionEndpoint = (endpoint: TransportEndpoint): void => {
    connectionEndpoint.host = endpoint.host;
    connectionEndpoint.port = endpoint.port;
    connectionEndpoint.protocol = endpoint.protocol;
  };

  const textListeners = new Set<(text: string) => void>();
  const subscribeText =
    deps.subscribeText ??
    ((listener: (text: string) => void): Unsubscribe => {
      textListeners.add(listener);
      return () => textListeners.delete(listener);
    });

  const transport = createSessionTransport(
    sessionId,
    scope,
    eventBus,
    diagnostics,
    {
      getEndpoint: () => ({ ...connectionEndpoint }),
      getAutoReconnect: deps.getAutoReconnect,
      isLoggedIntoCharacter: () => compositionRefs.runtimeState!.isLoggedIntoCharacter(),
      onText: (text) => {
        deps.onText(text);
        if (deps.subscribeText === undefined) {
          for (const listener of [...textListeners]) {
            listener(text);
          }
        }
      },
      onGmcpFrame: (packageName, data) => {
        gmcp.dispatch(packageName, data);
      },
    },
    {
      appOrigin: deps.appOrigin,
      webSocketFactory: deps.webSocketFactory,
      onlineTarget: deps.onlineTarget,
      ...(deps.now !== undefined ? { now: deps.now } : {}),
    },
  );
  compositionRefs.transport = transport;

  const runtimeState = createSessionRuntimeState(resolved.data);
  compositionRefs.runtimeState = runtimeState;

  const automationRuntime = createAutomationRuntimeState(scope);
  const configuration = createSessionConfiguration(deps.storage, characterProfileId);
  const information = createSessionInformation(gmcp, scope, eventBus);
  const interactions = createSessionInteractions(gmcp, scope, eventBus, transport);
  const world = createSessionWorld(
    gmcp,
    scope,
    eventBus,
    {
      worldKey: serverProfile.worldKey,
      host: serverProfile.host,
      port: serverProfile.port,
    },
    (command) =>
      transport.send(command, { kind: "command", size: command.length, preview: command }),
  );
  const ide = createSessionIde(gmcp, scope, eventBus, transport, {
    createTransferId: deps.uuidFactory,
  });
  const connectionHealth = createSessionConnectionHealth(
    gmcp,
    transport,
    scope,
    eventBus,
    () => ({ ...connectionEndpoint }),
    { ...(deps.getLagMonitorEnabled ? { getEnabled: deps.getLagMonitorEnabled } : {}) },
  );

  const configurationListeners = new Set<
    (snapshot: ReturnType<typeof runtimeState.getEffectiveConfiguration>) => void
  >();

  const unsubscribeConfiguration = subscribe(characterProfileId, (snapshot) => {
    runtimeState.setEffectiveConfiguration(snapshot);
    for (const listener of [...configurationListeners]) {
      listener(snapshot);
    }
  });

  const session = createSession({
    descriptor,
    registry: deps.registry,
    scope,
    eventBus,
    diagnostics,
    transport,
    gmcp,
    runtimeState,
    getClientInfo: deps.getClientInfo,
    unsubscribeConfiguration,
    getConnectionEndpoint: () => ({ ...connectionEndpoint }),
    setConnectionEndpoint,
    automationRuntime,
    configuration,
    subscribeText,
    subscribeConfiguration(listener) {
      configurationListeners.add(listener);
      return () => configurationListeners.delete(listener);
    },
    information,
    connectionHealth,
    interactions,
    world,
    ide,
  });

  return {
    success: true,
    data: session,
    handles: {
      gmcp,
      transport,
      scope,
      automationRuntime,
      eventBus,
      getLifecycleDiagnostics() {
        return diagnostics.snapshot();
      },
      setConnectionEndpoint,
      getBaselineEndpoint() {
        return { ...baselineEndpoint };
      },
    },
  };
}
