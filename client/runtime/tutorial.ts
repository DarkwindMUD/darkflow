import { deepFreeze } from "../configuration/snapshot";
import type { SessionGmcpBus } from "../gmcp/bus.ts";
import type {
  DarkwindTutorialActionName,
  DarkwindTutorialChapter,
  DarkwindTutorialRoute,
  DarkwindTutorialStatus,
  DarkwindTutorialStep,
} from "../gmcp/contracts/tutorial.ts";
import {
  validateDarkwindTutorialControl,
  validateDarkwindTutorialState,
} from "../gmcp/contracts/validators.ts";
import type { TransportReconnectStatusPayload } from "../transport/types.ts";
// @ts-expect-error Retained tutorial reducer is JavaScript without a declaration file.
import * as tutorialCore from "../../public/js/tutorial-core.mjs";
import type { SessionEventBus } from "./event-bus.ts";
import type { Unsubscribe } from "./events.ts";
import type { Disposer, ResourceScope } from "./resource-scope.ts";

export const TUTORIAL_ACTION_TIMEOUT_MS = 5_000;

export interface SessionTutorialState {
  readonly epoch: string;
  readonly seq: number;
  readonly tutorialVersion: 2;
  readonly status: DarkwindTutorialStatus;
  readonly awaitingContinue: boolean;
  readonly chapter: DarkwindTutorialChapter;
  readonly step: Omit<DarkwindTutorialStep, "example_command"> & {
    readonly exampleCommand: string;
  };
  readonly route: DarkwindTutorialRoute | null;
  readonly actions: readonly DarkwindTutorialActionName[];
  readonly reason: string;
  readonly hintVisible: boolean;
  readonly receivedAt: number;
}

export interface SessionTutorialSnapshot {
  readonly connected: boolean;
  readonly presentationReady: boolean;
  readonly state: SessionTutorialState;
  readonly controlEnabled: boolean;
  readonly pendingAction: DarkwindTutorialActionName | null;
  readonly announcement: string;
  readonly presentationGeneration: number;
}

export interface SessionTutorial {
  getSnapshot(): SessionTutorialSnapshot;
  subscribe(listener: (snapshot: SessionTutorialSnapshot) => void): Unsubscribe;
  setPresentationReady(ready: boolean): void;
  perform(action: DarkwindTutorialActionName): boolean;
}

/** Creates the session-owned tutorial reducer and exact outbound action boundary. */
export function createSessionTutorial(
  gmcp: SessionGmcpBus,
  scope: ResourceScope,
  eventBus: SessionEventBus,
): SessionTutorial {
  let connected = false;
  let rendererHealthy = false;
  let advertisedReady = false;
  let wasReady = false;
  let state = tutorialCore.createTutorialState() as SessionTutorialState;
  let controlEnabled = true;
  let pendingAction: DarkwindTutorialActionName | null = null;
  let announcement = "";
  let presentationGeneration = 0;
  let connectionGeneration = 0;
  let cancelActionTimeout: Disposer | null = null;
  let disposed = false;
  const listeners = new Set<(snapshot: SessionTutorialSnapshot) => void>();

  const createSnapshot = (): SessionTutorialSnapshot =>
    deepFreeze({
      connected,
      presentationReady: connected && rendererHealthy,
      state,
      controlEnabled,
      pendingAction,
      announcement,
      presentationGeneration,
    });

  let snapshot = createSnapshot();

  const publish = (): void => {
    if (disposed) return;
    snapshot = createSnapshot();
    for (const listener of [...listeners]) listener(snapshot);
  };

  const cancelPending = (): void => {
    cancelActionTimeout?.();
    cancelActionTimeout = null;
    pendingAction = null;
  };

  const sendResync = (
    reason:
      | "action-timeout"
      | "reconnect"
      | "tutorial-connected"
      | "tutorial-render-recovered"
      | "tutorial-session-recovered",
  ): boolean =>
    gmcp.sendTutorialResync({
      epoch: state.epoch,
      seq: state.seq,
      reason,
    });

  const syncReadiness = (
    reason:
      | "reconnect"
      | "tutorial-connected"
      | "tutorial-render-recovered"
      | "tutorial-session-recovered",
    force = false,
  ): void => {
    const ready = connected && rendererHealthy;
    if (!force && ready === advertisedReady) return;
    const sent = gmcp.sendSubscriptions({
      reason,
      features: { tutorialPane: ready },
    });
    if (!ready || sent) advertisedReady = ready;
    if (ready && sent) {
      wasReady = true;
      sendResync(reason);
    }
  };

  const perform = (action: DarkwindTutorialActionName): boolean => {
    if (disposed || !connected || pendingAction) return false;
    const payload = tutorialCore.buildTutorialAction(state, action);
    if (!payload || !gmcp.sendTutorialAction(payload)) return false;
    pendingAction = action;
    publish();
    cancelActionTimeout = scope.setTimeout(() => {
      cancelActionTimeout = null;
      if (disposed || pendingAction !== action) return;
      pendingAction = null;
      publish();
      if (connected && rendererHealthy) sendResync("action-timeout");
    }, TUTORIAL_ACTION_TIMEOUT_MS);
    return true;
  };

  const stateHandler = (input: unknown): void => {
    if (disposed || !connected) return;
    const validated = validateDarkwindTutorialState(input);
    if (!validated.success) return;
    const next = tutorialCore.reduceTutorialState(state, validated.data) as SessionTutorialState;
    if (next === state) return;
    cancelPending();
    state = next;
    controlEnabled = true;
    presentationGeneration += 1;
    const autoContinue = state.awaitingContinue && state.actions.includes("continue");
    announcement = autoContinue ? "" : tutorialCore.tutorialAnnouncement(state);
    publish();
    if (autoContinue && !perform("continue")) {
      announcement = tutorialCore.tutorialAnnouncement(state);
      publish();
    }
  };
  gmcp.on("Darkwind.Tutorial.State", stateHandler);
  scope.own("listener", () => gmcp.off("Darkwind.Tutorial.State", stateHandler));

  const controlHandler = (input: unknown): void => {
    if (disposed || !connected) return;
    const validated = validateDarkwindTutorialControl(input);
    if (!validated.success) return;
    const clearedPending = !validated.data.visible && pendingAction !== null;
    if (clearedPending) cancelPending();
    if (validated.data.visible === controlEnabled) {
      if (clearedPending) publish();
      return;
    }
    controlEnabled = validated.data.visible;
    presentationGeneration += 1;
    publish();
  };
  gmcp.on("Darkwind.Tutorial.Control", controlHandler);
  scope.own("listener", () => gmcp.off("Darkwind.Tutorial.Control", controlHandler));

  const recoveredHandler = (): void => {
    if (!disposed && connected) syncReadiness("tutorial-session-recovered", true);
  };
  gmcp.on("Darkwind.Session.Recovered", recoveredHandler);
  scope.own("listener", () => gmcp.off("Darkwind.Session.Recovered", recoveredHandler));

  scope.own(
    "subscription",
    eventBus.subscribe("transport:reconnect-status", (event) => {
      const payload = event.payload as TransportReconnectStatusPayload;
      if (payload.status === "connected") {
        if (connected) return;
        connected = true;
        connectionGeneration += 1;
        const generation = connectionGeneration;
        presentationGeneration += 1;
        publish();
        const reason = wasReady ? "reconnect" : "tutorial-connected";
        queueMicrotask(() => {
          if (!disposed && connected && generation === connectionGeneration) {
            syncReadiness(reason);
          }
        });
        return;
      }
      if (!connected) return;
      connected = false;
      connectionGeneration += 1;
      advertisedReady = false;
      cancelPending();
      state = tutorialCore.createTutorialState() as SessionTutorialState;
      controlEnabled = true;
      announcement = "";
      presentationGeneration += 1;
      gmcp.sendSubscriptions({
        reason: "reconnect",
        features: { tutorialPane: false },
      });
      publish();
    }),
  );

  scope.own("teardown", () => {
    cancelPending();
    if (advertisedReady) {
      gmcp.sendSubscriptions({ features: { tutorialPane: false } });
    }
    connected = false;
    connectionGeneration += 1;
    rendererHealthy = false;
    advertisedReady = false;
    disposed = true;
    presentationGeneration += 1;
    snapshot = createSnapshot();
    listeners.clear();
  });

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      if (disposed) return () => {};
      listener(snapshot);
      listeners.add(listener);
      return scope.own("subscription", () => listeners.delete(listener));
    },

    setPresentationReady(ready) {
      if (disposed || rendererHealthy === ready) return;
      rendererHealthy = ready;
      presentationGeneration += 1;
      publish();
      syncReadiness(ready && wasReady ? "tutorial-render-recovered" : "tutorial-connected");
    },

    perform,
  };
}
