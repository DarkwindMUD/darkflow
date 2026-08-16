import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer, isRunnableDevEnvironment } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModules(t) {
  const server = await createServer({
    configFile: path.join(repoRoot, "vite.config.ts"),
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
    hmr: false,
    watch: null,
  });
  t.after(async () => server.close());
  const ssr = server.environments.ssr;
  assert.ok(isRunnableDevEnvironment(ssr));
  const [interactions, bus, diagnostics, ids, scope, events] = await Promise.all([
    ssr.runner.import("/runtime/interactions.ts"),
    ssr.runner.import("/gmcp/bus.ts"),
    ssr.runner.import("/runtime/diagnostics.ts"),
    ssr.runner.import("/model/ids.ts"),
    ssr.runner.import("/runtime/resource-scope.ts"),
    ssr.runner.import("/runtime/event-bus.ts"),
  ]);
  return { ...interactions, ...bus, ...diagnostics, ...ids, ...scope, ...events };
}

function createInteractions(modules, t) {
  const sessionId = modules.createSessionId(modules.createSequentialUuidFactory());
  const diagnostics = new modules.SessionDiagnostics(sessionId);
  const scope = modules.createResourceScope(sessionId, diagnostics);
  t.after(() => {
    if (!scope.disposed) scope.dispose();
  });
  const eventBus = modules.createSessionEventBus(sessionId, diagnostics);
  const sent = [];
  const transport = {
    state: "connected",
    lastInboundAt: 0,
    reconnectReasons: [],
    getHealthSnapshot() {
      return { lastInboundAt: this.lastInboundAt };
    },
    forceReconnect(reason) {
      this.reconnectReasons.push(reason);
    },
  };
  const bus = modules.createSessionGmcpBus(
    sessionId,
    (bytes) => {
      sent.push(new TextDecoder().decode(bytes));
      return true;
    },
    diagnostics,
  );
  return {
    bus,
    eventBus,
    interactions: modules.createSessionInteractions(bus, scope, eventBus, transport),
    scope,
    sent,
    transport,
  };
}

const announcement = {
  id: 42,
  status: "active",
  title: "Spring Festival",
  summary: "Now live.",
  author: "Elyndar",
  authorRealName: "elyndar",
  createdAt: 1776834302,
  updatedAt: 0,
  updatedBy: 0,
  archivedAt: 0,
  markdown: "# Spring Festival",
  isRead: 0,
};

const fishingOpen = {
  session: "f-12ab34cd",
  terrain: "lake",
  skill: 250,
  poleTier: 1,
  baitTier: 2,
  baited: 1,
  sceneArtUrl: 0,
};

test("interaction snapshots reduce assigned inbound families and stay frozen", async (t) => {
  const modules = await loadModules(t);
  const { bus, interactions } = createInteractions(modules, t);

  bus.dispatch("Darkwind.Window.Open", {
    id: "login",
    type: "modal",
    layout: { type: "vertical", children: [] },
  });
  bus.dispatch("Darkwind.Window.Update", {
    id: "login",
    updates: [{ id: "error", text: "Try again" }],
  });
  bus.dispatch("Darkwind.Window.Open", {
    id: "dialogue",
    type: "npc_dialogue",
    layout: { type: "npc_dialogue", text: "Hello" },
  });
  for (const title of ["First", "Second"]) {
    bus.dispatch("Darkwind.Window.Open", {
      id: "shared-video",
      type: "panel",
      title,
      layout: { type: "vertical", children: [{ type: "youtube_embed", url: "abc" }] },
    });
  }

  let snapshot = interactions.getSnapshot();
  assert.equal(snapshot.windows.login.revision, 1);
  assert.equal(snapshot.windows.login.updates[0].text, "Try again");
  assert.equal(snapshot.windows.dialogue.type, "npc_dialogue");
  const videos = Object.values(snapshot.windows).filter(
    (window) => window.sourceId === "shared-video",
  );
  assert.equal(videos.length, 2);
  assert.notEqual(videos[0].id, videos[1].id);

  bus.dispatch("Darkwind.Snoop.Open", {
    id: "snoop",
    target: "Denian",
    targetRealName: "denian",
    snooper: "Acer",
    startedAt: 1778582400,
  });
  bus.dispatch("Darkwind.Snoop.Append", {
    id: "snoop",
    type: "output",
    text: "Center of Town!\n",
    timestamp: 1778582401,
  });
  bus.dispatch("Darkwind.Snoop.Status", {
    id: "snoop",
    text: "Connected.",
    timestamp: 1778582402,
  });
  bus.dispatch("Darkwind.Announcements.List", {
    active: [announcement],
    archived: [],
    unreadCount: 1,
  });
  bus.dispatch("Darkwind.Announcements.New", {
    item: { ...announcement, id: 43, title: "Patch Notes" },
    unreadCount: 2,
  });
  bus.dispatch("Darkwind.Announcements.Update", {
    item: { ...announcement, status: "archived", isRead: 1 },
    bucket: "archived",
    unreadCount: 1,
  });
  bus.dispatch("Darkwind.Announcements.State", { unreadCount: 3 });
  bus.dispatch("Darkwind.Giphy.Show", {
    gifUrl: "https://media.giphy.com/a.gif",
    talker: "Elyndar",
  });
  bus.dispatch("Darkwind.Broadcast.Show", {
    message: "The city gates are open.",
    sentAt: 1778582403,
  });
  bus.dispatch("Darkwind.LinuxRescue.Open", { fullscreen: 1 });

  bus.dispatch("Darkwind.Fishing.Open", fishingOpen);
  bus.dispatch("Darkwind.Fishing.Bite", {
    session: fishingOpen.session,
    windowMs: 2500,
    tease: "large",
  });
  bus.dispatch("Darkwind.Fishing.Fight", {
    session: fishingOpen.session,
    seed: 123456,
    params: {
      strength: 7,
      erratic: 6,
      stamina: 110,
      barSize: 20,
      progressRate: 9,
      drainRate: 11,
      tensionRise: 17,
      tensionDecay: 12,
      minFightMs: 6000,
    },
    fish: { tease: "large", rarityHint: "Rare", artUrl: 0 },
  });
  bus.dispatch("Darkwind.Fishing.Caught", {
    session: fishingOpen.session,
    fish: {
      id: "silverfin",
      name: "Silverfin",
      short: "a pristine silverfin",
      rarity: "Rare",
      sizePct: 82,
      sizeCm: 74,
      weightKg: 13,
      quality: 91,
      pristine: 1,
      artUrl: 0,
    },
    rewards: { skillup: 1, newSkill: 251 },
  });
  bus.dispatch("Darkwind.Fishing.Escaped", {
    session: "stale-session",
    reason: "timeout",
  });
  bus.dispatch("Darkwind.Fishing.Art", {
    species: "silverfin",
    artUrl: "https://example.invalid/silverfin.png",
  });

  snapshot = interactions.getSnapshot();
  assert.equal(snapshot.snoop.entries.length, 2);
  assert.equal(snapshot.snoop.entries[1].type, "status");
  assert.deepEqual(snapshot.announcements.active.map(({ id }) => id), [43]);
  assert.deepEqual(snapshot.announcements.archived.map(({ id }) => id), [42]);
  assert.equal(snapshot.announcements.unreadCount, 3);
  assert.equal(snapshot.giphy.talker, "Elyndar");
  assert.equal(snapshot.broadcast.message, "The city gates are open.");
  assert.equal(snapshot.linuxRescue.fullscreen, 1);
  assert.equal(snapshot.fishing.caught.fish.id, "silverfin");
  assert.equal(snapshot.fishing.escaped, null);
  assert.equal(snapshot.fishing.art.silverfin, "https://example.invalid/silverfin.png");
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.windows.login.updates), true);
  assert.equal(Object.isFrozen(snapshot.fishing.caught.fish), true);

  bus.dispatch("Darkwind.Fishing.End", {
    session: fishingOpen.session,
    reason: "done",
    message: "Finished.",
  });
  bus.dispatch("Darkwind.Snoop.Close", { id: "snoop", reason: "stopped" });
  bus.dispatch("Darkwind.Window.Close", { id: "login" });
  snapshot = interactions.getSnapshot();
  assert.equal(snapshot.fishing.open, null);
  assert.equal(snapshot.fishing.end.message, "Finished.");
  assert.equal(snapshot.snoop, null);
  assert.equal(snapshot.windows.login, undefined);
});

test("malformed frames remain advisory but cannot mutate interaction state", async (t) => {
  const modules = await loadModules(t);
  const { bus, interactions } = createInteractions(modules, t);
  const legacy = [];
  const errorSpy = t.mock.method(console, "error", () => {});
  bus.on("*", (packageName, data) => legacy.push([packageName, data]));
  const malformed = [
    ["Darkwind.Window.Open", { id: "missing-layout" }],
    ["Darkwind.Snoop.Open", { id: "snoop", startedAt: "now" }],
    ["Darkwind.Announcements.List", { active: {}, archived: [], unreadCount: 0 }],
    ["Darkwind.Giphy.Show", { gifUrl: 1 }],
    ["Darkwind.Broadcast.Show", { message: 1 }],
    ["Darkwind.LinuxRescue.Open", { fullscreen: "yes" }],
    ["Darkwind.Fishing.Open", { session: "fish", skill: "high" }],
  ];

  for (const [packageName, payload] of malformed) bus.dispatch(packageName, payload);

  assert.equal(legacy.length, malformed.length);
  assert.equal(errorSpy.mock.callCount(), malformed.length);
  assert.deepEqual(interactions.getSnapshot(), {
    windows: {},
    snoop: null,
    announcements: { active: [], archived: [], unreadCount: 0 },
    giphy: null,
    broadcast: null,
    linuxRescue: null,
    fishing: {
      open: null,
      bite: null,
      fight: null,
      caught: null,
      escaped: null,
      end: null,
      art: {},
    },
  });
});

test("Street Samurai replacements stay correlated to an open session window", async (t) => {
  const modules = await loadModules(t);
  const first = createInteractions(modules, t);
  const second = createInteractions(modules, t);

  first.bus.dispatch("Darkwind.Window.Open", {
    id: "street-dashboard",
    type: "panel",
    layout: {
      type: "street_samurai_dashboard",
      id: "street-samurai-dashboard-root",
      active_tab: "diagnostics",
      state: { protocol_version: 1, firmware_version: "Ronin" },
    },
  });
  second.bus.dispatch("Darkwind.Window.Open", {
    id: "street-dashboard",
    type: "panel",
    layout: {
      type: "street_samurai_dashboard",
      state: { protocol_version: 1, firmware_version: "Ghost" },
    },
  });
  const unknown = { text: "x".repeat(10_000) };
  let cursor = unknown;
  for (let depth = 0; depth < 64; depth += 1) {
    cursor.next = {};
    cursor = cursor.next;
  }
  first.bus.dispatch("Darkwind.Window.Open", {
    id: "invalid-dashboard",
    layout: {
      type: "street_samurai_dashboard",
      state: { protocol_version: 2 },
    },
  });
  first.bus.dispatch("Darkwind.Window.Open", {
    id: "bounded-dashboard",
    type: "panel",
    unknown,
    layout: {
      type: "street_samurai_dashboard",
      state: { protocol_version: 1, firmware_version: "Bounded" },
      unknown,
    },
  });

  let firstWindow = first.interactions.getSnapshot().windows["street-dashboard"];
  const secondWindow = second.interactions.getSnapshot().windows["street-dashboard"];
  const boundedWindow = first.interactions.getSnapshot().windows["bounded-dashboard"];
  assert.equal(first.interactions.getSnapshot().windows["invalid-dashboard"], undefined);
  assert.equal("unknown" in boundedWindow, false);
  assert.equal("unknown" in boundedWindow.layout, false);
  assert.equal(firstWindow.streetSamurai.firmware_version, "Ronin");
  assert.equal(firstWindow.streetSamuraiRevision, 0);
  assert.equal(firstWindow.layout.state, firstWindow.streetSamurai);
  assert.equal(secondWindow.streetSamurai.firmware_version, "Ghost");
  assert.equal(Object.isFrozen(firstWindow.streetSamurai), true);
  first.bus.dispatch("Darkwind.Window.Close", { id: "bounded-dashboard" });

  first.bus.dispatch("Darkwind.StreetSamurai", {
    protocol_version: 1,
    firmware_version: "Ronin II",
  });
  firstWindow = first.interactions.getSnapshot().windows["street-dashboard"];
  assert.equal(firstWindow.streetSamurai.firmware_version, "Ronin II");
  assert.equal(firstWindow.streetSamuraiRevision, 1);
  assert.equal(
    second.interactions.getSnapshot().windows["street-dashboard"].streetSamurai.firmware_version,
    "Ghost",
  );

  first.bus.dispatch("Darkwind.Window.Close", { id: "street-dashboard" });
  first.bus.dispatch("Darkwind.StreetSamurai", {
    protocol_version: 1,
    firmware_version: "Late",
  });
  assert.equal(first.interactions.getSnapshot().windows["street-dashboard"], undefined);
});

test("named interaction actions send exact outbound packages and payloads", async (t) => {
  const modules = await loadModules(t);
  const { bus, interactions, sent } = createInteractions(modules, t);
  bus.dispatch("Darkwind.Window.Open", {
    id: "login",
    layout: { type: "vertical", children: [] },
  });
  bus.dispatch("Darkwind.Window.Open", {
    id: "shared-video",
    layout: { type: "youtube_embed", url: "abc" },
  });
  const videoId = Object.keys(interactions.getSnapshot().windows).find((id) => id !== "login");
  assert.ok(videoId);
  bus.dispatch("Darkwind.Snoop.Open", {
    id: "snoop",
    target: "Denian",
    targetRealName: "denian",
    snooper: "Acer",
    startedAt: 1,
  });
  bus.dispatch("Darkwind.Announcements.List", {
    active: [announcement],
    archived: [],
    unreadCount: 1,
  });
  bus.dispatch("Darkwind.Fishing.Open", fishingOpen);

  assert.equal(interactions.submitWindow("login", "login", { name: "Nacho" }), true);
  assert.equal(interactions.sendWindowAction("login", "help"), true);
  assert.equal(interactions.sendWindowAction(videoId, "play"), true);
  assert.equal(interactions.closeWindow(videoId), true);
  assert.equal(interactions.closeWindow("login"), true);
  assert.equal(interactions.sendSnoopCommand("snoop", "target", " look "), true);
  assert.equal(interactions.stopSnoop("snoop"), true);
  assert.equal(interactions.closeSnoop("snoop"), true);
  assert.equal(interactions.requestAnnouncements(), true);
  assert.equal(interactions.markAnnouncementRead(42), true);
  assert.equal(interactions.castFishing(fishingOpen.session, 72), true);
  assert.equal(interactions.hookFishing(fishingOpen.session), true);
  assert.equal(
    interactions.reportFishingResult({
      session: fishingOpen.session,
      outcome: "caught",
      fightMs: 8450,
      accuracy: 0.873,
      tensionPeak: 71,
    }),
    true,
  );
  assert.equal(interactions.cancelFishing(fishingOpen.session), true);

  assert.deepEqual(sent, [
    'Darkwind.Window.Submit {"id":"login","button":"login","data":{"name":"Nacho"}}',
    'Darkwind.Window.Action {"id":"login","button":"help"}',
    'Darkwind.Window.Action {"id":"shared-video","button":"play"}',
    'Darkwind.Window.Closed {"id":"shared-video"}',
    'Darkwind.Window.Closed {"id":"login"}',
    'Darkwind.Snoop.Command {"id":"snoop","mode":"target","command":"look"}',
    'Darkwind.Snoop.Stop {"id":"snoop"}',
    'Darkwind.Snoop.Closed {"id":"snoop"}',
    'Darkwind.Client.Subscriptions {"reason":"modal-open","full":false,"panels":{},"features":{"announcementsBadge":true,"enemyAutoOpen":true,"combatPane":false,"visualEffects":false,"tutorialPane":false,"windows":true,"ide":true,"completion":true,"giphy":true,"broadcast":true,"announcementsList":true}}',
    'Darkwind.Announcements.MarkRead {"id":42}',
    'Darkwind.Fishing.Cast {"session":"f-12ab34cd","power":72}',
    'Darkwind.Fishing.Hook {"session":"f-12ab34cd"}',
    'Darkwind.Fishing.Result {"session":"f-12ab34cd","outcome":"caught","fightMs":8450,"accuracy":0.873,"tensionPeak":71}',
    'Darkwind.Fishing.Cancel {"session":"f-12ab34cd"}',
  ]);
  assert.equal(interactions.getSnapshot().announcements.active[0].isRead, 1);
  assert.equal(interactions.getSnapshot().announcements.unreadCount, 0);
});

test("reconnect retains auth modals until replacement while explicit disconnect clears all", async (t) => {
  const modules = await loadModules(t);
  const { bus, eventBus, interactions, scope, sent } = createInteractions(modules, t);
  const snapshots = [];
  interactions.subscribe((snapshot) => snapshots.push(snapshot));
  bus.dispatch("Darkwind.Window.Open", {
    id: "login",
    type: "modal",
    title: "Login",
    layout: { type: "vertical", children: [] },
  });
  bus.dispatch("Darkwind.Window.Open", {
    id: "newchar",
    type: "modal",
    layout: { type: "vertical", children: [] },
  });
  bus.dispatch("Darkwind.Window.Open", {
    id: "charselect",
    type: "modal",
    layout: { type: "vertical", children: [] },
  });
  bus.dispatch("Darkwind.Window.Open", {
    id: "temporary",
    type: "modal",
    layout: { type: "vertical", children: [] },
  });
  bus.dispatch("Darkwind.Broadcast.Show", { message: "Before reconnect" });

  eventBus.publish("transport:reconnect-status", {
    status: "scheduled",
    attempt: 1,
    transport: "wss",
  });
  let snapshot = interactions.getSnapshot();
  const retainedLogin = snapshot.windows.login;
  assert.equal(retainedLogin.title, "Login");
  assert.ok(snapshot.windows.newchar);
  assert.ok(snapshot.windows.charselect);
  assert.equal(snapshot.windows.temporary, undefined);
  assert.equal(snapshot.broadcast, null);

  bus.dispatch("Darkwind.Window.Open", {
    id: "login",
    type: "modal",
    title: "Login again",
    layout: { type: "vertical", children: [{ type: "input", id: "name" }] },
  });
  snapshot = interactions.getSnapshot();
  assert.notEqual(snapshot.windows.login, retainedLogin);
  assert.equal(snapshot.windows.login.title, "Login again");
  assert.equal(snapshot.windows.login.revision, 0);
  assert.equal(interactions.dismissWindow("newchar"), true);
  assert.equal(interactions.getSnapshot().windows.newchar, undefined);
  assert.equal(sent.length, 0);

  eventBus.publish("transport:reconnect-status", {
    status: "idle",
    attempt: 0,
    transport: null,
    userDisconnected: true,
  });
  assert.deepEqual(interactions.getSnapshot().windows, {});

  bus.dispatch("Darkwind.Broadcast.Show", { message: "Before disposal" });
  scope.dispose();
  assert.equal(interactions.getSnapshot().broadcast, null);
  const beforeLateFrame = snapshots.length;
  bus.dispatch("Darkwind.Broadcast.Show", { message: "Late" });
  assert.equal(interactions.getSnapshot().broadcast, null);
  assert.equal(snapshots.length, beforeLateFrame);
  assert.equal(interactions.requestAnnouncements(), false);
});

test("auth actions force reconnect only when no newer inbound arrives", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const modules = await loadModules(t);
  const { bus, eventBus, interactions, scope, transport } = createInteractions(modules, t);
  bus.dispatch("Darkwind.Window.Open", {
    id: "login",
    type: "modal",
    layout: { type: "vertical", children: [] },
  });

  transport.lastInboundAt = 10;
  assert.equal(interactions.submitWindow("login", "login", { name: "Nacho" }), true);
  t.mock.timers.tick(8000);
  assert.deepEqual(transport.reconnectReasons, ["auth window got no response"]);

  transport.reconnectReasons.length = 0;
  assert.equal(interactions.sendWindowAction("login", "first"), true);
  t.mock.timers.tick(4000);
  assert.equal(interactions.sendWindowAction("login", "replacement"), true);
  t.mock.timers.tick(4000);
  assert.deepEqual(transport.reconnectReasons, []);
  t.mock.timers.tick(4000);
  assert.deepEqual(transport.reconnectReasons, ["auth window got no response"]);

  transport.reconnectReasons.length = 0;
  assert.equal(interactions.submitWindow("login", "login", {}), true);
  transport.lastInboundAt = 11;
  t.mock.timers.tick(8000);
  assert.deepEqual(transport.reconnectReasons, []);

  assert.equal(interactions.submitWindow("login", "login", {}), true);
  eventBus.publish("transport:reconnect-status", {
    status: "scheduled",
    attempt: 1,
    transport: "wss",
  });
  t.mock.timers.tick(8000);
  assert.deepEqual(transport.reconnectReasons, []);

  assert.equal(interactions.sendWindowAction("login", "again"), true);
  scope.dispose();
  t.mock.timers.tick(8000);
  assert.deepEqual(transport.reconnectReasons, []);
});
