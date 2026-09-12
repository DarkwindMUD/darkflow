import typia from "typia";

import { deepFreeze } from "../configuration/snapshot";
import type {
  CharItemsList,
  CharItemsMutation,
  CharDefence,
  CharRealStats,
  CharStats,
  CharStatus,
  CharStatusVars,
  CharVitals,
  CharWorth,
} from "../gmcp/contracts/char";
import type {
  DarkwindAvatar,
  DarkwindAchievements,
  DarkwindAchievementsUpdate,
  DarkwindCyberware,
  DarkwindCyberwareDetails,
  DarkwindCyberwareImage,
  DarkwindDivine,
  DarkwindGuildVitals,
  DarkwindSky,
  DarkwindXpMon,
  DarkwindQuest,
  DarkwindQuestsActive,
  DarkwindQuestsUpdate,
  Game,
  Group,
  SessionInformationSnapshot,
} from "../gmcp/contracts/information";
import {
  validateCharDefence,
  validateCharDefencesList,
  validateCharDefencesRemove,
  validateCharRealStats,
  validateCharStats,
  validateCharStatus,
  validateCharStatusVars,
  validateCharVitals,
  validateCharWorth,
  validateCharItemsList,
  validateCharItemsMutation,
  validateDarkwindAchievements,
  validateDarkwindAchievementsUpdate,
  validateDarkwindAvatar,
  validateDarkwindDivine,
  validateDarkwindGuildVitals,
  validateDarkwindSky,
  validateDarkwindXpMon,
  validateDarkwindCyberware,
  validateDarkwindCyberwareDetails,
  validateDarkwindCyberwareImage,
  validateDarkwindQuestsActive,
  validateDarkwindQuestsComplete,
  validateDarkwindQuestsList,
  validateDarkwindQuestsUpdate,
  validateGame,
  validateGroup,
} from "../gmcp/contracts/validators";
import type { SessionGmcpBus } from "../gmcp/bus";
import type { TransportReconnectStatusPayload } from "../transport/types";
import type { SessionEventBus } from "./event-bus";
import type { Unsubscribe } from "./events";
import type { ResourceScope } from "./resource-scope";

export const INFORMATION_PANEL_IDS = [
  "avatar",
  "status",
  "vitals",
  "guildVitals",
  "xpmon",
  "omens",
  "sky",
  "stats",
  "buffs",
  "worth",
  "group",
  "inventory",
  "quests",
  "achievements",
  "cyberware",
  "connection-health",
  "rfc2549",
] as const;

export type InformationPanelId = (typeof INFORMATION_PANEL_IDS)[number];

/** Public Step 6 read model; it exposes data, never the GMCP bus. */
export interface SessionInformation {
  getSnapshot(): SessionInformationSnapshot;
  subscribe(listener: (snapshot: SessionInformationSnapshot) => void): Unsubscribe;
  setVisiblePanels(ids: readonly InformationPanelId[]): void;
  requestCyberwareDetails(id: string): boolean;
}

type PayloadValidator<T> = (input: unknown) => typia.IValidation<T>;

function emptySnapshot(): SessionInformationSnapshot {
  return {
    game: null,
    avatar: null,
    status: null,
    statusVars: null,
    vitals: null,
    guildVitals: null,
    xpmon: null,
    omens: null,
    sky: null,
    stats: { current: null, base: null },
    worth: null,
    defences: [],
    group: null,
    inventory: [],
    quests: null,
    achievements: null,
    cyberware: null,
    cyberwareDetail: null,
  };
}

/** Creates the session-owned, validated-only information read model. */
export function createSessionInformation(
  gmcp: SessionGmcpBus,
  scope: ResourceScope,
  eventBus: SessionEventBus,
): SessionInformation {
  let snapshot = deepFreeze(emptySnapshot());
  let visiblePanels: readonly InformationPanelId[] = [];
  let requestedCyberwareId: string | null = null;
  const listeners = new Set<(snapshot: SessionInformationSnapshot) => void>();

  const publish = (next: SessionInformationSnapshot): void => {
    snapshot = deepFreeze(next);
    for (const listener of [...listeners]) {
      listener(snapshot);
    }
  };

  const update = (changes: Partial<SessionInformationSnapshot>): void => {
    publish({ ...snapshot, ...changes });
  };

  const sendVisiblePanels = (ids: readonly InformationPanelId[]): void => {
    const visible = new Set(ids);
    const panels = Object.fromEntries(
      INFORMATION_PANEL_IDS.map((id) => [id, visible.has(id)]),
    ) as Record<string, boolean>;
    panels.vitals = true;
    if (panels.buffs) panels.status = true;
    gmcp.sendSubscriptions({ panels });
  };

  const listen = <T>(
    packageName: string,
    validate: PayloadValidator<T>,
    apply: (data: T) => void,
  ): void => {
    const handler = (data: unknown): void => {
      const result = validate(data);
      if (result.success) {
        apply(structuredClone(result.data));
      }
    };
    gmcp.on(packageName, handler);
    scope.own("listener", () => gmcp.off(packageName, handler));
  };

  const withPatron = (vitals: CharVitals, omens: DarkwindDivine | null): CharVitals =>
    omens ? { ...vitals, divine_patron: omens.patron ?? "" } : vitals;

  listen<CharVitals>("Char.Vitals", validateCharVitals, (vitals) =>
    update({ vitals: { ...withPatron(vitals, snapshot.omens), receivedAt: Date.now() } }),
  );
  listen<CharStatus>("Char.Status", validateCharStatus, (status) =>
    update({ status: { ...snapshot.status, ...status } }),
  );
  listen<CharStatusVars>("Char.StatusVars", validateCharStatusVars, (statusVars) =>
    update({ statusVars }),
  );
  listen<CharStats>("Char.Stats", validateCharStats, (current) =>
    update({ stats: { ...snapshot.stats, current } }),
  );
  listen<CharRealStats>("Char.RealStats", validateCharRealStats, (base) =>
    update({ stats: { ...snapshot.stats, base } }),
  );
  listen<CharWorth>("Char.Worth", validateCharWorth, (worth) => update({ worth }));
  listen<CharItemsList>("Char.Items.List", validateCharItemsList, ({ location, items }) => {
    if (location === "inv") update({ inventory: items });
  });
  listen<CharItemsMutation>("Char.Items.Add", validateCharItemsMutation, ({ location, item }) => {
    if (location === "inv") update({ inventory: [...snapshot.inventory, item] });
  });
  listen<CharItemsMutation>(
    "Char.Items.Remove",
    validateCharItemsMutation,
    ({ location, item }) => {
      if (location === "inv")
        update({ inventory: snapshot.inventory.filter(({ id }) => id !== item.id) });
    },
  );
  listen<CharItemsMutation>(
    "Char.Items.Update",
    validateCharItemsMutation,
    ({ location, item }) => {
      if (location !== "inv") return;
      const index = snapshot.inventory.findIndex(({ id }) => id === item.id);
      if (index < 0) return;
      const inventory = [...snapshot.inventory];
      inventory[index] = item;
      update({ inventory });
    },
  );
  listen<CharDefence[]>("Char.Defences.List", validateCharDefencesList, (defences) =>
    update({ defences }),
  );
  listen<CharDefence>("Char.Defences.Add", validateCharDefence, (defence) => {
    const index = snapshot.defences.findIndex((item) => item.name === defence.name);
    const defences = [...snapshot.defences];
    if (index < 0) {
      defences.push(defence);
    } else {
      defences[index] = defence;
    }
    update({ defences });
  });
  listen<string | { name: string }>(
    "Char.Defences.Remove",
    validateCharDefencesRemove,
    (removed) => {
      const name = typeof removed === "string" ? removed : removed.name;
      update({
        defences: snapshot.defences.filter((item) => item.name !== name && item.desc !== name),
      });
    },
  );
  listen<Group>("Group", validateGroup, (group) => update({ group }));
  listen<Game>("Game", validateGame, (game) => update({ game: { ...snapshot.game, ...game } }));
  listen<DarkwindAvatar>("Darkwind.Char.Avatar", validateDarkwindAvatar, (avatar) => {
    if (avatar.url) {
      update({ avatar });
    }
  });
  listen<DarkwindDivine>("Darkwind.Divine", validateDarkwindDivine, (omens) =>
    update({
      omens,
      ...(snapshot.vitals ? { vitals: withPatron(snapshot.vitals, omens) } : {}),
    }),
  );
  listen<DarkwindSky>("Darkwind.Sky", validateDarkwindSky, (sky) =>
    update({ sky: { ...sky, receivedAt: Date.now() } }),
  );
  listen<DarkwindGuildVitals>("Darkwind.GuildVitals", validateDarkwindGuildVitals, (guildVitals) =>
    update({ guildVitals }),
  );
  listen<DarkwindXpMon>("Darkwind.XPMon", validateDarkwindXpMon, (xpmon) => update({ xpmon }));
  listen<DarkwindQuest[]>("Darkwind.Quests.List", validateDarkwindQuestsList, (list) =>
    update({
      quests: {
        list,
        active: snapshot.quests?.active ?? null,
        lastUpdate: snapshot.quests?.lastUpdate ?? null,
        lastComplete: snapshot.quests?.lastComplete ?? null,
      },
    }),
  );
  listen<DarkwindQuestsActive>("Darkwind.Quests.Active", validateDarkwindQuestsActive, (active) =>
    update({
      quests: {
        list: snapshot.quests?.list ?? [],
        active,
        lastUpdate: snapshot.quests?.lastUpdate ?? null,
        lastComplete: snapshot.quests?.lastComplete ?? null,
      },
    }),
  );
  listen<DarkwindQuestsUpdate>(
    "Darkwind.Quests.Update",
    validateDarkwindQuestsUpdate,
    (lastUpdate) => {
      const quests = snapshot.quests ?? {
        list: [],
        active: null,
        lastUpdate: null,
        lastComplete: null,
      };
      const list = quests.list.map((quest) => updateQuest(quest, lastUpdate));
      update({ quests: { ...quests, list, lastUpdate } });
    },
  );
  listen<Record<string, unknown>>(
    "Darkwind.Quests.Complete",
    validateDarkwindQuestsComplete,
    (lastComplete) =>
      update({
        quests: {
          list: snapshot.quests?.list ?? [],
          active: snapshot.quests?.active ?? null,
          lastUpdate: snapshot.quests?.lastUpdate ?? null,
          lastComplete,
        },
      }),
  );
  listen<DarkwindAchievements>(
    "Darkwind.Achievements.List",
    validateDarkwindAchievements,
    (achievements) => update({ achievements }),
  );
  listen<DarkwindAchievementsUpdate>(
    "Darkwind.Achievements.Update",
    validateDarkwindAchievementsUpdate,
    (changes) => {
      const current = snapshot.achievements ?? {
        summary: {
          unlockedTierCount: 0,
          totalTierCount: 0,
          completedFamilyCount: 0,
          totalFamilyCount: 0,
        },
        families: [],
      };
      const families = changes.families
        ? [
            ...current.families.filter(
              (existing) => !changes.families!.some(({ id }) => id === existing.id),
            ),
            ...changes.families,
          ].sort((a, b) => a.name.localeCompare(b.name))
        : current.families;
      update({
        achievements: {
          summary: changes.summary ?? current.summary,
          families,
          ...(changes.newlyUnlocked ? { newlyUnlocked: changes.newlyUnlocked } : {}),
        },
      });
    },
  );
  listen<DarkwindCyberware>("Darkwind.Cyberware.List", validateDarkwindCyberware, (cyberware) =>
    update({ cyberware, cyberwareDetail: null }),
  );
  listen<DarkwindCyberwareDetails>(
    "Darkwind.Cyberware.Details",
    validateDarkwindCyberwareDetails,
    (detail) => {
      if (detail.id === requestedCyberwareId) update({ cyberwareDetail: detail });
    },
  );
  listen<DarkwindCyberwareImage>(
    "Darkwind.Cyberware.Image",
    validateDarkwindCyberwareImage,
    (image) => {
      if (image.id === requestedCyberwareId && snapshot.cyberwareDetail?.id === image.id) {
        update({ cyberwareDetail: { ...snapshot.cyberwareDetail, image: image.url } });
      }
    },
  );

  scope.own(
    "subscription",
    eventBus.subscribe("transport:reconnect-status", (event) => {
      const payload = event.payload as TransportReconnectStatusPayload;
      if (payload.status !== "connected") {
        requestedCyberwareId = null;
        publish(emptySnapshot());
      }
    }),
  );

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      if (scope.disposed) {
        return () => {};
      }
      listener(snapshot);
      listeners.add(listener);
      return scope.own("subscription", () => listeners.delete(listener));
    },

    setVisiblePanels(ids) {
      if (scope.disposed) {
        return;
      }
      visiblePanels = [...ids];
      sendVisiblePanels(visiblePanels);
    },

    requestCyberwareDetails(id) {
      const value = typeof id === "string" ? id.trim() : "";
      if (scope.disposed || !value) return false;
      requestedCyberwareId = value;
      update({ cyberwareDetail: null });
      return gmcp.requestCyberwareDetails(value);
    },
  };
}

function updateQuest(quest: DarkwindQuest, update: DarkwindQuestsUpdate): DarkwindQuest {
  if (quest.id !== update.questId && quest.questPath !== update.questId) return quest;
  const objectives = quest.objectives?.map((objective) =>
    objective.name === update.objective
      ? {
          ...objective,
          current: update.current,
          required: update.required,
          status: update.current >= update.required ? "finished" : "started",
        }
      : objective,
  );
  const current = objectives
    ? objectives.reduce((total, objective) => total + objective.current, 0)
    : quest.current;
  return {
    ...quest,
    ...(objectives ? { objectives, current } : {}),
    ...(update.status ? { status: update.status } : {}),
    ...(update.readyToTurnIn === undefined
      ? {}
      : {
          readyToTurnIn: update.readyToTurnIn,
          status: update.readyToTurnIn ? "Ready to Turn In" : (update.status ?? quest.status),
        }),
    ...(update.giverArea ? { giverArea: update.giverArea } : {}),
  };
}
