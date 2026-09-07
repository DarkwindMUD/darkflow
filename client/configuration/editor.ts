import type { ConfigKind, ConfigurationSet, LocalDefinitions } from "../model/configuration";
import type { CharacterProfileId, ConfigSetId } from "../model/ids";
import type { StorageLike } from "../storage/repository";
import { readState } from "../storage/repository";

import { resolveEffectiveConfiguration } from "./resolve";
import {
  publishConfigurationSet,
  replaceLocalDefinitions,
  setThemeKey,
  subscribe,
  type ConfigurationWriteResult,
  type PublishConfigurationSetInput,
  type PublishConfigurationSetResult,
  type Unsubscribe,
} from "./service";
import { deepFreeze, freezeSnapshot, type EffectiveConfigurationSnapshot } from "./snapshot";

/** Editable configuration visible to one active character session. */
export interface CharacterConfigurationSnapshot {
  characterProfileId: CharacterProfileId;
  themeKey: string;
  localDefinitions: LocalDefinitions;
  attachedConfigurationSets: Record<ConfigSetId, ConfigurationSet>;
  effectiveConfiguration: EffectiveConfigurationSnapshot;
}

/** Public configuration capability for one active character. */
export interface SessionConfiguration {
  getSnapshot(): CharacterConfigurationSnapshot;
  subscribe(listener: (snapshot: CharacterConfigurationSnapshot) => void): Unsubscribe;
  replaceLocalDefinitions<K extends ConfigKind>(
    kind: K,
    definitions: LocalDefinitions[K],
  ): ConfigurationWriteResult;
  publishConfigurationSet(input: PublishConfigurationSetInput): PublishConfigurationSetResult;
  setThemeKey(themeKey: string): ConfigurationWriteResult;
}

/** Creates the storage-backed public configuration capability for one character. */
export function createSessionConfiguration(
  storage: StorageLike,
  characterProfileId: CharacterProfileId,
): SessionConfiguration {
  function getSnapshot(): CharacterConfigurationSnapshot {
    const stateResult = readState(storage);
    if (!stateResult.success || stateResult.data === undefined) {
      throw new Error("Phase 1 session graph is not present in storage.");
    }

    const character = stateResult.data.characterProfiles[characterProfileId];
    const effective = resolveEffectiveConfiguration(stateResult.data, characterProfileId);
    if (character === undefined || !effective.success || effective.data === undefined) {
      throw new Error("Active character configuration is not present in storage.");
    }

    const attachedConfigurationSets = {} as Record<ConfigSetId, ConfigurationSet>;
    for (const configSetIds of Object.values(character.configSetRefs)) {
      for (const configSetId of configSetIds) {
        attachedConfigurationSets[configSetId] = stateResult.data.configurationSets[configSetId]!;
      }
    }

    return deepFreeze({
      characterProfileId,
      themeKey: stateResult.data.defaults.themeKey,
      localDefinitions: structuredClone(character.localDefinitions),
      attachedConfigurationSets: structuredClone(attachedConfigurationSets),
      effectiveConfiguration: freezeSnapshot(structuredClone(effective.data)),
    });
  }

  return {
    getSnapshot,
    subscribe(listener) {
      listener(getSnapshot());
      return subscribe(characterProfileId, () => listener(getSnapshot()));
    },
    replaceLocalDefinitions(kind, definitions) {
      return replaceLocalDefinitions(storage, characterProfileId, kind, definitions);
    },
    publishConfigurationSet(input) {
      const stateResult = readState(storage);
      if (!stateResult.success || stateResult.data === undefined) {
        return {
          success: false,
          code: "missing-state",
          message: "Phase 1 session graph is not present in storage.",
        };
      }

      const character = stateResult.data.characterProfiles[characterProfileId];
      if (
        character === undefined ||
        !Object.values(character.configSetRefs).some((configSetIds) =>
          configSetIds.includes(input.configSetId),
        )
      ) {
        return {
          success: false,
          code: "unknown-config-set",
          message: "Configuration set is not attached to the active character.",
        };
      }
      return publishConfigurationSet(storage, input);
    },
    setThemeKey(themeKey) {
      return setThemeKey(storage, themeKey);
    },
  };
}
