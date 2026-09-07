import type { CharacterProfileId } from "../model/ids";
import { commit, readState, type StorageLike } from "../storage/repository";

const MAX_COMMAND_HISTORY = 200;
const MAX_COMMAND_LENGTH = 4096;

function normalizeHistory(history: readonly string[]): string[] {
  return history
    .filter((entry) => typeof entry === "string" && entry.length <= MAX_COMMAND_LENGTH)
    .slice(-MAX_COMMAND_HISTORY);
}

/** Reads the active character's validated command history without touching legacy storage. */
export function loadCommandHistory(
  storage: StorageLike,
  characterProfileId: CharacterProfileId,
): string[] {
  const result = readState(storage);
  return result.success && result.data?.characterProfiles[characterProfileId]
    ? [...result.data.characterProfiles[characterProfileId].commandHistory]
    : [];
}

/** Re-reads then replaces only one character's bounded command history. */
export function saveCommandHistory(
  storage: StorageLike,
  characterProfileId: CharacterProfileId,
  history: readonly string[],
): boolean {
  const result = readState(storage);
  const character = result.success ? result.data?.characterProfiles[characterProfileId] : undefined;
  if (!result.success || !result.data || !character) return false;
  return commit(storage, {
    ...result.data,
    characterProfiles: {
      ...result.data.characterProfiles,
      [characterProfileId]: { ...character, commandHistory: normalizeHistory(history) },
    },
  }).success;
}
