import typia from "typia";

import { deepFreeze } from "../configuration/snapshot";
import type {
  DarkwindIdeOpen,
  DarkwindIdeOpenChunk,
  DarkwindIdeOpenFinish,
  DarkwindIdeOpenStart,
  DarkwindIdeSaveResult,
} from "../gmcp/contracts/darkwind-ide";
import {
  validateDarkwindIdeOpen,
  validateDarkwindIdeOpenChunk,
  validateDarkwindIdeOpenFinish,
  validateDarkwindIdeOpenStart,
  validateDarkwindIdeSaveResult,
} from "../gmcp/contracts/validators";
import type { SessionGmcpBus } from "../gmcp/bus";
import type { SessionTransport, TransportReconnectStatusPayload } from "../transport/types";
import type { SessionEventBus } from "./event-bus";
import type { Unsubscribe } from "./events";
import type { Disposer, ResourceScope } from "./resource-scope";

const MAX_OPEN_CHUNKS = 512;
const MAX_CONTENT_LENGTH = 4 * 1024 * 1024;
const INLINE_SAVE_LIMIT = 256 * 1024;
const SAVE_CHUNK_SIZE = 32 * 1024;
const SAVE_BUFFERED_LIMIT = 32 * 1024;
const SAVE_BACKPRESSURE_DELAY_MS = 8;
const SAVE_RESULT_TIMEOUT_MS = 60_000;

type IdeTransport = Pick<SessionTransport, "state" | "getHealthSnapshot">;

export interface SessionIdeDiagnostic {
  line: number;
  column?: number;
  message: string;
}

export interface SessionIdeDocumentSnapshot {
  path: string;
  title: string;
  content: string;
  language: string;
  readOnly: boolean;
  stale: boolean;
}

export interface SessionIdeTransferSnapshot {
  session: string;
  receivedChunks: number;
  totalChunks: number;
  receivedLength: number;
  totalLength: number;
}

export interface SessionIdeSaveSnapshot {
  status: "idle" | "saving" | "saved" | "error";
  message: string;
  diagnostics: readonly SessionIdeDiagnostic[];
}

export interface SessionIdeSnapshot {
  connected: boolean;
  document: SessionIdeDocumentSnapshot | null;
  openVersion: number;
  transfer: SessionIdeTransferSnapshot | null;
  transferFailure: string | null;
  save: SessionIdeSaveSnapshot;
}

export interface SessionIde {
  getSnapshot(): SessionIdeSnapshot;
  subscribe(listener: (snapshot: SessionIdeSnapshot) => void): Unsubscribe;
  save(content: string): boolean;
  close(): boolean;
}

interface OpenTransfer {
  data: DarkwindIdeOpenStart;
  chunks: Array<string | undefined>;
  receivedChunks: number;
  receivedLength: number;
}

interface PendingSave {
  documentGeneration: number;
  path: string;
  session: string | null;
  phase: "preparing" | "sending" | "awaiting-result";
  started: boolean;
  aborted: boolean;
  cancelWait: (() => void) | null;
  cancelWatchdog: Disposer | null;
}

type PayloadValidator<T> = (input: unknown) => typia.IValidation<T>;

interface SessionIdeOptions {
  createTransferId?: () => string;
  sha1Hex?: (content: string) => Promise<string>;
}

const emptySave = (): SessionIdeSaveSnapshot => ({
  status: "idle",
  message: "",
  diagnostics: [],
});

const defaultSha1Hex = async (content: string): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest("SHA-1", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** Owns the validated IDE document and transfer lifecycle for one session. */
export function createSessionIde(
  gmcp: SessionGmcpBus,
  scope: ResourceScope,
  eventBus: SessionEventBus,
  transport: IdeTransport,
  options: SessionIdeOptions = {},
): SessionIde {
  const createTransferId = options.createTransferId ?? (() => globalThis.crypto.randomUUID());
  const sha1Hex = options.sha1Hex ?? defaultSha1Hex;
  const listeners = new Set<(snapshot: SessionIdeSnapshot) => void>();
  let openTransfer: OpenTransfer | null = null;
  let documentGeneration = 0;
  let pendingSave: PendingSave | null = null;
  let snapshot = deepFreeze<SessionIdeSnapshot>({
    connected: transport.state === "connected",
    document: null,
    openVersion: 0,
    transfer: null,
    transferFailure: null,
    save: emptySave(),
  });

  const publish = (next: SessionIdeSnapshot): void => {
    if (scope.disposed) return;
    snapshot = deepFreeze(next);
    for (const listener of [...listeners]) {
      if (listeners.has(listener)) listener(snapshot);
    }
  };

  const update = (partial: Partial<SessionIdeSnapshot>): void => {
    publish({ ...snapshot, ...partial });
  };

  const clearPending = (): PendingSave | null => {
    const pending = pendingSave;
    if (!pending) return null;
    pending.cancelWait?.();
    pending.cancelWait = null;
    pending.cancelWatchdog?.();
    pending.cancelWatchdog = null;
    pendingSave = null;
    return pending;
  };

  const abortStarted = (pending: PendingSave | null, reason: string): void => {
    if (
      !pending ||
      !pending.started ||
      pending.aborted ||
      !pending.session ||
      transport.state !== "connected"
    ) {
      return;
    }
    pending.aborted = true;
    gmcp.sendIdeSaveAbort({ session: pending.session, reason });
  };

  const invalidateSave = (reason: string, abort: boolean): void => {
    const pending = clearPending();
    if (abort) abortStarted(pending, reason);
  };

  const startResultWatchdog = (pending: PendingSave): void => {
    pending.cancelWatchdog?.();
    pending.cancelWatchdog = scope.setTimeout(() => {
      if (pendingSave !== pending) return;
      pending.cancelWatchdog = null;
      pendingSave = null;
      update({
        save: { status: "error", message: "No save response was received.", diagnostics: [] },
      });
    }, SAVE_RESULT_TIMEOUT_MS);
  };

  const wait = (pending: PendingSave, delayMs: number): Promise<boolean> =>
    new Promise((resolve) => {
      let settled = false;
      const finish = (value: boolean): void => {
        if (settled) return;
        settled = true;
        pending.cancelWait = null;
        resolve(value);
      };
      const cancelTimer = scope.setTimeout(() => finish(true), delayMs);
      pending.cancelWait = () => {
        cancelTimer();
        finish(false);
      };
    });

  const current = (pending: PendingSave): boolean =>
    pendingSave === pending &&
    pending.documentGeneration === documentGeneration &&
    transport.state === "connected" &&
    !scope.disposed;

  const failSave = (pending: PendingSave, message: string, abortReason?: string): void => {
    if (pendingSave !== pending) return;
    clearPending();
    if (abortReason) abortStarted(pending, abortReason);
    update({ save: { status: "error", message, diagnostics: [] } });
  };

  const sendChunkedSave = async (pending: PendingSave, content: string): Promise<void> => {
    let hash: string;
    try {
      hash = await sha1Hex(content);
    } catch {
      failSave(pending, "Could not hash the document.");
      return;
    }
    if (!current(pending) || !pending.session) return;

    const chunks = Math.ceil(content.length / SAVE_CHUNK_SIZE);
    pending.phase = "sending";
    if (
      !gmcp.sendIdeSaveStart({
        session: pending.session,
        path: pending.path,
        chunks,
        totalLength: content.length,
        hash,
      })
    ) {
      failSave(pending, "Socket is not connected.");
      return;
    }
    pending.started = true;

    for (let index = 0; index < chunks; index += 1) {
      if (!current(pending)) return;
      if (
        !gmcp.sendIdeSaveChunk({
          session: pending.session,
          index,
          content: content.slice(index * SAVE_CHUNK_SIZE, (index + 1) * SAVE_CHUNK_SIZE),
        })
      ) {
        failSave(pending, "Socket disconnected before save completed.", "send-failed");
        return;
      }
      while (transport.getHealthSnapshot().bufferedAmount > SAVE_BUFFERED_LIMIT) {
        if (!(await wait(pending, SAVE_BACKPRESSURE_DELAY_MS)) || !current(pending)) return;
      }
      if (!(await wait(pending, 0)) || !current(pending)) return;
    }

    if (!gmcp.sendIdeSaveFinish({ session: pending.session })) {
      failSave(pending, "Socket disconnected before save completed.", "finish-failed");
      return;
    }
    pending.phase = "awaiting-result";
    startResultWatchdog(pending);
  };

  const replaceDocument = (data: DarkwindIdeOpen): void => {
    openTransfer = null;
    invalidateSave("replaced", true);
    documentGeneration += 1;
    const editable = data.editable === true || data.editable === 1;
    const readOnly = editable ? false : data.readOnly === true || data.readOnly === 1;
    publish({
      connected: transport.state === "connected",
      document: {
        path: data.path,
        title: data.title ?? data.path,
        content: data.content,
        language: data.language ?? "text",
        readOnly,
        stale: transport.state !== "connected",
      },
      openVersion: snapshot.openVersion + 1,
      transfer: null,
      transferFailure: null,
      save: emptySave(),
    });
  };

  const failTransfer = (session: string, message: string): void => {
    if (openTransfer?.data.session !== session) return;
    openTransfer = null;
    update({ transfer: null, transferFailure: message });
  };

  const listen = <T>(
    packageName: string,
    validate: PayloadValidator<T>,
    handler: (data: T) => void,
  ): void => {
    const inbound = (data: unknown): void => {
      const result = validate(data);
      if (result.success) handler(structuredClone(result.data));
    };
    gmcp.on(packageName, inbound);
    scope.own("listener", () => gmcp.off(packageName, inbound));
  };

  listen<DarkwindIdeOpen>("Darkwind.IDE.Open", validateDarkwindIdeOpen, (data) => {
    if (data.content.length > MAX_CONTENT_LENGTH) return;
    replaceDocument(data);
  });

  listen<DarkwindIdeOpenStart>("Darkwind.IDE.OpenStart", validateDarkwindIdeOpenStart, (data) => {
    if (
      !Number.isInteger(data.chunks) ||
      data.chunks < 1 ||
      data.chunks > MAX_OPEN_CHUNKS ||
      !Number.isInteger(data.totalLength) ||
      data.totalLength < 0 ||
      data.totalLength > MAX_CONTENT_LENGTH
    ) {
      return;
    }
    const transfer: OpenTransfer = {
      data: { ...data, content: "" },
      chunks: new Array<string | undefined>(data.chunks),
      receivedChunks: 0,
      receivedLength: 0,
    };
    openTransfer = transfer;
    update({
      transfer: {
        session: data.session,
        receivedChunks: 0,
        totalChunks: data.chunks,
        receivedLength: 0,
        totalLength: data.totalLength,
      },
      transferFailure: null,
    });
  });

  listen<DarkwindIdeOpenChunk>("Darkwind.IDE.OpenChunk", validateDarkwindIdeOpenChunk, (data) => {
    const transfer = openTransfer;
    if (!transfer || transfer.data.session !== data.session) return;
    if (!Number.isInteger(data.index) || data.index < 0 || data.index >= transfer.chunks.length) {
      failTransfer(data.session, "Open transfer contained an invalid chunk index.");
      return;
    }
    const previous = transfer.chunks[data.index];
    const nextLength = transfer.receivedLength - (previous?.length ?? 0) + data.content.length;
    if (nextLength > MAX_CONTENT_LENGTH) {
      failTransfer(data.session, "Open transfer exceeded the content limit.");
      return;
    }
    transfer.chunks[data.index] = data.content;
    if (previous === undefined) transfer.receivedChunks += 1;
    transfer.receivedLength = nextLength;
    update({
      transfer: {
        session: data.session,
        receivedChunks: transfer.receivedChunks,
        totalChunks: transfer.chunks.length,
        receivedLength: transfer.receivedLength,
        totalLength: transfer.data.totalLength,
      },
    });
  });

  listen<DarkwindIdeOpenFinish>(
    "Darkwind.IDE.OpenFinish",
    validateDarkwindIdeOpenFinish,
    (data) => {
      const transfer = openTransfer;
      if (!transfer || transfer.data.session !== data.session) return;
      openTransfer = null;
      if (transfer.receivedChunks !== transfer.chunks.length) {
        update({ transfer: null, transferFailure: "Open transfer was missing chunks." });
        return;
      }
      if (transfer.receivedLength !== transfer.data.totalLength) {
        update({ transfer: null, transferFailure: "Open transfer length did not match." });
        return;
      }
      replaceDocument({ ...transfer.data, content: transfer.chunks.join("") });
    },
  );

  listen<DarkwindIdeSaveResult>(
    "Darkwind.IDE.SaveResult",
    validateDarkwindIdeSaveResult,
    (data) => {
      const pending = pendingSave;
      if (
        !pending ||
        pending.phase !== "awaiting-result" ||
        pending.documentGeneration !== documentGeneration ||
        (data.path !== undefined && data.path !== pending.path) ||
        data.errors?.some(
          (error) =>
            !Number.isInteger(error.line) ||
            error.line < 1 ||
            (error.column !== undefined && (!Number.isInteger(error.column) || error.column < 0)),
        )
      ) {
        return;
      }
      clearPending();
      const success = data.success === true || data.success === 1;
      update({
        save: {
          status: success ? "saved" : "error",
          message: data.message ?? (success ? "Saved." : "Save failed."),
          diagnostics: (data.errors ?? []).map((error) => ({ ...error })),
        },
      });
    },
  );

  scope.own(
    "subscription",
    eventBus.subscribe("transport:reconnect-status", (event) => {
      const payload = event.payload as TransportReconnectStatusPayload;
      if (payload.status === "connected") {
        update({ connected: true });
        return;
      }
      openTransfer = null;
      invalidateSave("disconnected", false);
      update({
        connected: false,
        document: snapshot.document ? { ...snapshot.document, stale: true } : null,
        transfer: null,
        transferFailure: null,
        save:
          snapshot.save.status === "saving"
            ? {
                status: "error",
                message: "Connection lost before save completed.",
                diagnostics: [],
              }
            : snapshot.save,
      });
    }),
  );

  scope.own("teardown", () => {
    openTransfer = null;
    clearPending();
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

    save(content) {
      const document = snapshot.document;
      if (
        scope.disposed ||
        pendingSave ||
        !snapshot.connected ||
        !document ||
        document.stale ||
        document.readOnly ||
        typeof content !== "string" ||
        content.length > MAX_CONTENT_LENGTH
      ) {
        return false;
      }

      const pending: PendingSave = {
        documentGeneration,
        path: document.path,
        session: content.length > INLINE_SAVE_LIMIT ? createTransferId() : null,
        phase: "preparing",
        started: false,
        aborted: false,
        cancelWait: null,
        cancelWatchdog: null,
      };
      pendingSave = pending;
      update({ save: { status: "saving", message: "Saving...", diagnostics: [] } });

      if (content.length <= INLINE_SAVE_LIMIT) {
        if (!gmcp.sendIdeSave({ path: pending.path, content })) {
          failSave(pending, "Socket is not connected.");
          return false;
        }
        pending.phase = "awaiting-result";
        startResultWatchdog(pending);
        return true;
      }

      void sendChunkedSave(pending, content);
      return true;
    },

    close() {
      const document = snapshot.document;
      if (scope.disposed || !document) return false;
      const pending = clearPending();
      abortStarted(pending, "closed");
      if (transport.state === "connected") gmcp.sendIdeClose({ path: document.path });
      openTransfer = null;
      documentGeneration += 1;
      publish({
        connected: transport.state === "connected",
        document: null,
        openVersion: snapshot.openVersion,
        transfer: null,
        transferFailure: null,
        save: emptySave(),
      });
      return true;
    },
  };
}
