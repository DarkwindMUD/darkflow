import type { JsonValue } from "../model/configuration";
import type { CharacterProfileId } from "../model/ids";
import type {
  ApplicationStateV1,
  WorkspaceSnapshot as CharacterWorkspaceSnapshot,
} from "../model/profiles";
import { commit, readState, type StorageLike } from "../storage/repository";

import type { PersistedWorkspaceSnapshot as DockviewWorkspaceSnapshot } from "./workspace";

export type LoadCharacterWorkspaceResult =
  | { success: true; snapshot: DockviewWorkspaceSnapshot; recovered: false }
  | { success: true; snapshot: null; recovered: true; message: string }
  | {
      success: false;
      code: "missing-state" | "unknown-character";
      message: string;
    };

export type SaveCharacterWorkspaceResult =
  | { success: true }
  | {
      success: false;
      code: "missing-state" | "unknown-character" | "validation-failed" | "storage-failed";
      message: string;
    };

type JsonObject = Record<string, JsonValue>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDockviewSnapshot(
  value: unknown,
): value is DockviewWorkspaceSnapshot & { layout: JsonObject } {
  // Version 1 is a bare Dockview tree; version 2 wraps that tree alongside the
  // ordered ids of each rail root. Both stay readable so a rollback degrades to
  // the default layout rather than losing the character profile.
  if (!isObject(value) || !isObject(value.layout)) return false;
  if (value.version === 1) return true;
  if (value.version !== 2) return false;

  const { collapsed, dockview, scrollviews } = value.layout;
  if (!isObject(collapsed) || !isObject(dockview) || !isObject(scrollviews)) return false;
  if (!["left", "right"].every((side) => Array.isArray(scrollviews[side]))) return false;
  if (!["left", "right"].every((side) => Array.isArray(collapsed[side]))) return false;

  const orders = Object.values(scrollviews);
  const collapsedIds = Object.values(collapsed);
  if (
    ![...orders, ...collapsedIds].every(
      (ids) => Array.isArray(ids) && ids.every((id) => typeof id === "string"),
    )
  ) {
    return false;
  }

  const panelIds = orders.flat();
  return (
    new Set(panelIds).size === panelIds.length &&
    collapsedIds.flat().every((id) => panelIds.includes(id))
  );
}

function isCharacterWorkspaceSnapshot(value: unknown): value is CharacterWorkspaceSnapshot {
  return (
    isObject(value) &&
    typeof value.version === "number" &&
    Number.isInteger(value.version) &&
    value.version >= 1 &&
    isObject(value.payload)
  );
}

function readPersistedDockviewWorkspace(workspace: CharacterWorkspaceSnapshot): {
  dockview: DockviewWorkspaceSnapshot;
  legacy: CharacterWorkspaceSnapshot;
} | null {
  if (workspace.version !== 2) {
    return null;
  }

  const { dockview, legacy } = workspace.payload;
  if (!isDockviewSnapshot(dockview) || !isCharacterWorkspaceSnapshot(legacy)) {
    return null;
  }

  return { dockview, legacy };
}

/** Loads one character's valid Dockview layout or requests a recoverable default. */
export function loadCharacterWorkspace(
  storage: StorageLike,
  characterProfileId: CharacterProfileId,
): LoadCharacterWorkspaceResult {
  const readResult = readState(storage);
  if (!readResult.success || readResult.data === undefined) {
    return {
      success: false,
      code: "missing-state",
      message: "Phase 1 session graph is not present in storage.",
    };
  }

  const character = readResult.data.characterProfiles[characterProfileId];
  if (character === undefined) {
    return {
      success: false,
      code: "unknown-character",
      message: "Character profile is not present in the application graph.",
    };
  }

  const persisted = readPersistedDockviewWorkspace(character.workspace);
  if (persisted === null) {
    return {
      success: true,
      snapshot: null,
      recovered: true,
      message: "Saved workspace is incompatible; using the default layout.",
    };
  }

  return { success: true, snapshot: persisted.dockview, recovered: false };
}

/** Commits one character's Dockview layout while retaining one reversible fallback. */
export function saveCharacterWorkspace(
  storage: StorageLike,
  characterProfileId: CharacterProfileId,
  snapshot: DockviewWorkspaceSnapshot,
): SaveCharacterWorkspaceResult {
  const readResult = readState(storage);
  if (!readResult.success || readResult.data === undefined) {
    return {
      success: false,
      code: "missing-state",
      message: "Phase 1 session graph is not present in storage.",
    };
  }

  const state: ApplicationStateV1 = readResult.data;
  const character = state.characterProfiles[characterProfileId];
  if (character === undefined) {
    return {
      success: false,
      code: "unknown-character",
      message: "Character profile is not present in the application graph.",
    };
  }

  if (!isDockviewSnapshot(snapshot)) {
    return {
      success: false,
      code: "validation-failed",
      message: "Refusing to commit an invalid Dockview workspace snapshot.",
    };
  }

  const persisted = readPersistedDockviewWorkspace(character.workspace);
  const legacy = persisted?.legacy ?? character.workspace;
  const workspace: CharacterWorkspaceSnapshot = {
    version: 2,
    payload: {
      dockview: { version: snapshot.version, layout: snapshot.layout },
      legacy: { version: legacy.version, payload: legacy.payload },
    },
  };
  const nextState: ApplicationStateV1 = {
    ...state,
    characterProfiles: {
      ...state.characterProfiles,
      [characterProfileId]: { ...character, workspace },
    },
  };

  const commitResult = commit(storage, nextState);
  return commitResult.success
    ? commitResult
    : { success: false, code: commitResult.code, message: commitResult.message };
}
