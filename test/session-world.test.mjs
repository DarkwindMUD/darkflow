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
  const [world, bus, diagnostics, ids, scope, events] = await Promise.all([
    ssr.runner.import("/runtime/world.ts"),
    ssr.runner.import("/gmcp/bus.ts"),
    ssr.runner.import("/runtime/diagnostics.ts"),
    ssr.runner.import("/model/ids.ts"),
    ssr.runner.import("/runtime/resource-scope.ts"),
    ssr.runner.import("/runtime/event-bus.ts"),
  ]);
  return { ...world, ...bus, ...diagnostics, ...ids, ...scope, ...events };
}

let worldSequence = 0;

function createWorld(modules, worldKey = `world-${++worldSequence}`) {
  const sessionId = modules.createSessionId(modules.createSequentialUuidFactory());
  const diagnostics = new modules.SessionDiagnostics(sessionId);
  const scope = modules.createResourceScope(sessionId, diagnostics);
  const eventBus = modules.createSessionEventBus(sessionId, diagnostics);
  const sent = [];
  const commands = [];
  const bus = modules.createSessionGmcpBus(
    sessionId,
    (bytes) => {
      sent.push(new TextDecoder().decode(bytes));
      return true;
    },
    diagnostics,
  );
  const world = modules.createSessionWorld(
    bus,
    scope,
    eventBus,
    { worldKey, host: "mud.example", port: 4000 },
    (command) => {
      commands.push(command);
      return true;
    },
  );
  return { bus, commands, diagnostics, eventBus, scope, sent, world };
}

const current = (id, name = `Room ${id}`, area = "Test Area") => ({
  protocol: 2,
  mapEpoch: "epoch-1",
  id,
  name,
  area,
  positioned: 1,
  x: Number(id),
  y: 0,
  z: 0,
  exits: {},
  liveExits: {},
});

const playlistState = {
  enabled: 1,
  room_id: 101,
  revision: 7,
  server_time: 50,
  name: "Room Jukebox",
  playback: {
    status: "playing",
    position: 3,
    start_at: 47,
    current: {
      id: 9,
      video_id: "dQw4w9WgXcQ",
      title: "Current",
      added_by: "Nacho",
      duration: 212,
      can_remove: 0,
    },
  },
  queue: [],
  skip_votes: 0,
  skip_needed: 2,
  permissions: { add: 1, moderate: 0 },
};

test("world accepts validated map frames through frozen renderer sources", async (t) => {
  const modules = await loadModules(t);
  const { bus, scope, world } = createWorld(modules);
  await new Promise((resolve) => setTimeout(resolve, 0));

  bus.dispatch("Darkwind.MapData2.Current", current(101, "Atrium"));
  const snapshot = world.getSnapshot();
  const room = snapshot.source.getRoom(101);

  assert.equal(snapshot.source.getAuthority(), "authoritative");
  assert.equal(snapshot.source.getCurrentRoomId(), "101");
  assert.equal(room?.name, "Atrium");
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.source), true);
  assert.equal(Object.isFrozen(room), true);
  assert.equal(snapshot.sourceVersion > 0, true);
  scope.dispose();
});

test("world ignores malformed modeled frames while compatibility delivery remains advisory", async (t) => {
  const modules = await loadModules(t);
  const { bus, scope, world } = createWorld(modules);
  const legacy = [];
  const errorSpy = t.mock.method(console, "error", () => {});
  bus.on("Darkwind.MapData2.Current", (data) => legacy.push(data));

  bus.dispatch("Darkwind.MapData2.Current", { id: { invalid: true } });
  assert.equal(legacy.length, 1);
  assert.equal(world.getSnapshot().source.getCurrentRoomId(), null);
  assert.equal(errorSpy.mock.callCount(), 1);

  bus.dispatch("Darkwind.MapData2.Current", current("101"));
  assert.equal(world.getSnapshot().source.getCurrentRoomId(), "101");
  scope.dispose();
});

test("world skips listeners removed during the same publication", async (t) => {
  const modules = await loadModules(t);
  const { bus, scope, world } = createWorld(modules);
  let armed = false;
  let secondCalls = 0;
  let unsubscribeSecond = () => {};
  world.subscribe(() => {
    if (armed) unsubscribeSecond();
  });
  unsubscribeSecond = world.subscribe(() => {
    secondCalls += 1;
  });

  armed = true;
  bus.dispatch("Darkwind.MapData2.Current", current(101));
  assert.equal(secondCalls, 1);
  scope.dispose();
});

test("world shares durable graphs by world key but keeps current views session-local", async (t) => {
  const modules = await loadModules(t);
  const key = `shared-${++worldSequence}`;
  const first = createWorld(modules, key);
  const second = createWorld(modules, key);
  await new Promise((resolve) => setTimeout(resolve, 0));

  first.bus.dispatch("Darkwind.MapData2.Current", current(101, "First"));
  second.bus.dispatch("Darkwind.MapData2.Current", current("202", "Second"));

  assert.equal(first.world.getSnapshot().source.getCurrentRoomId(), "101");
  assert.equal(second.world.getSnapshot().source.getCurrentRoomId(), "202");
  assert.equal(second.world.getSnapshot().source.getRoom(101)?.name, "First");
  assert.equal(first.world.getSnapshot().source.getRoom(202)?.name, "Second");
  first.scope.dispose();
  second.scope.dispose();
});

test("room image tokens follow merged Room.Info identity and playlist Open alone focuses", async (t) => {
  const modules = await loadModules(t);
  const { bus, scope, world } = createWorld(modules);
  const errorSpy = t.mock.method(console, "error", () => {});

  bus.dispatch("Room.Info", { num: 101, name: "Atrium", exits: {} });
  bus.dispatch("Room.Info", { area: "Keep", environment: "Inside" });
  bus.dispatch("Darkwind.Room.Image", { url: "/rooms/atrium.webp", name: "Atrium" });
  let snapshot = world.getSnapshot();
  assert.equal(snapshot.room?.name, "Atrium");
  assert.equal(snapshot.room?.area, "Keep");
  assert.equal(snapshot.roomImage?.roomId, "101");
  assert.equal(snapshot.roomImage?.generation, snapshot.roomGeneration);
  assert.equal(Object.isFrozen(snapshot.roomImage), true);

  bus.dispatch("Darkwind.Room.Image", { url: "   ", name: "Ignored" });
  assert.equal(world.getSnapshot().roomImage?.url, "/rooms/atrium.webp");

  bus.dispatch("Darkwind.Room.Image", { url: 0 });
  assert.equal(world.getSnapshot().roomImage?.url, "/rooms/atrium.webp");

  bus.dispatch("Darkwind.Room.Playlist.State", playlistState);
  snapshot = world.getSnapshot();
  assert.equal(snapshot.playlist.enabled, true);
  assert.equal(snapshot.playlist.playback.current?.can_remove, false);
  assert.equal(snapshot.playlist.permissions.add, true);
  assert.equal(snapshot.playlistOpenVersion, 0);
  assert.equal(Object.isFrozen(snapshot.playlist), true);

  bus.dispatch("Darkwind.Room.Playlist.State", { ...playlistState, enabled: 2 });
  assert.equal(world.getSnapshot().playlist.enabled, true);
  assert.equal(errorSpy.mock.callCount(), 2);

  bus.dispatch("Darkwind.Room.Playlist.Open", {
    enabled: 0,
    room_id: "101",
    server_time: 60,
  });
  assert.equal(world.getSnapshot().playlistOpenVersion, 1);

  const generation = world.getSnapshot().roomGeneration;
  bus.dispatch("Room.Info", { num: "202", name: "Elsewhere", exits: {} });
  assert.equal(world.getSnapshot().roomGeneration, generation + 1);
  assert.equal(world.getSnapshot().roomImage, null);
  scope.dispose();
});

test("world sends exact browse, subscriptions, media, and named playlist actions", async (t) => {
  const modules = await loadModules(t);
  const { bus, eventBus, scope, sent, world } = createWorld(modules);
  await new Promise((resolve) => setTimeout(resolve, 0));
  eventBus.publish("transport:reconnect-status", {
    status: "connected",
    attempt: 0,
    transport: "wss",
  });
  bus.dispatch("Darkwind.MapData2.Current", current(101));
  bus.dispatch("Darkwind.Room.Playlist.State", playlistState);

  world.setVisiblePanels(["map", "roomImage", "roomPlaylist"]);
  const subscription = JSON.parse(sent.at(-1).slice("Darkwind.Client.Subscriptions ".length));
  assert.equal(subscription.panels.map, true);
  assert.equal(subscription.panels.room, true);
  assert.equal(subscription.panels.roomImage, true);
  assert.equal(subscription.panels.roomPlaylist, true);

  assert.equal(world.resyncCurrentArea(), true);
  const sync = JSON.parse(sent.at(-1).slice("Darkwind.MapData2.Sync ".length));
  assert.equal(sync.protocol, 2);
  assert.equal(sync.area, "Test Area");
  assert.equal(sync.cursor, 0);
  assert.equal(sync.fromCursor, 0);

  assert.equal(world.browseArea(" guild-hall "), true);
  assert.equal(sent.at(-1), 'Darkwind.MapData2.Browse {"catalog":"guild-hall"}');
  bus.dispatch("Darkwind.MapData2.BrowseArea", {
    catalog: "guild-hall",
    name: "Guild Hall",
    center: 501,
    replace: 1,
    rooms: [{ id: 501, name: "Guild Hall", area: "guild-hall", positioned: 1, x: 0, y: 0, z: 0 }],
    more: 1,
    offset: 25,
  });
  assert.equal(world.getSnapshot().browseOpenVersion, 1);
  assert.equal(world.getSnapshot().browseSource.getRoom(501)?.name, "Guild Hall");
  assert.equal(sent.at(-1), 'Darkwind.MapData2.Browse {"catalog":"guild-hall","offset":25}');
  assert.equal(world.refreshMedia(), true);
  assert.equal(sent.at(-1), "Darkwind.Client.RefreshMedia");
  assert.equal(world.addPlaylistUrl(" https://youtu.be/dQw4w9WgXcQ "), true);
  assert.equal(
    sent.at(-1),
    'Darkwind.Room.Playlist.Action {"room_id":101,"revision":7,"action":"add","url":"https://youtu.be/dQw4w9WgXcQ"}',
  );
  assert.equal(world.movePlaylistEntry(1, 2), true);
  assert.equal(
    sent.at(-1),
    'Darkwind.Room.Playlist.Action {"room_id":101,"revision":7,"action":"move","from":1,"to":2}',
  );
  assert.equal(world.reportPlaylistReady(" Resolved ", 212), true);
  assert.equal(
    sent.at(-1),
    'Darkwind.Room.Playlist.Report {"room_id":101,"revision":7,"entry_id":9,"report":"ready","title":"Resolved","duration":212}',
  );
  scope.dispose();
});

test("disconnect clears live view state, retains playlist data, and disposal releases ownership", async (t) => {
  const modules = await loadModules(t);
  const { bus, commands, diagnostics, eventBus, scope, sent, world } = createWorld(modules);
  await new Promise((resolve) => setTimeout(resolve, 0));
  eventBus.publish("transport:reconnect-status", {
    status: "connected",
    attempt: 0,
    transport: "wss",
  });
  bus.dispatch("Darkwind.MapData2.Current", {
    ...current(101),
    exits: { north: 102 },
    liveExits: { north: 102 },
    walkSafe: { north: 1 },
  });
  bus.dispatch("Darkwind.MapData2.Area", {
    area: "Test Area",
    rooms: [current(102)],
    replace: 0,
  });
  assert.equal(world.speedwalkTo(102), true);
  assert.deepEqual(commands, ["north"]);
  bus.dispatch("Room.Info", { num: 101, name: "Atrium", exits: {} });
  bus.dispatch("Darkwind.Room.Image", { url: "/rooms/atrium.webp" });
  bus.dispatch("Darkwind.Room.Playlist.State", playlistState);

  eventBus.publish("transport:reconnect-status", {
    status: "scheduled",
    attempt: 1,
    transport: "wss",
  });
  const disconnected = world.getSnapshot();
  assert.equal(disconnected.connected, false);
  assert.equal(disconnected.room, null);
  assert.equal(disconnected.roomImage, null);
  assert.equal(disconnected.playlist.enabled, true);
  assert.equal(disconnected.playlistFresh, false);
  const commandsBeforeOfflineActions = commands.length;
  const framesBeforeOfflineActions = sent.length;
  assert.equal(world.speedwalkTo(102), false);
  assert.equal(world.votePlaylistSkip(), false);
  assert.equal(world.reportPlaylistEnded(), false);
  assert.equal(commands.length, commandsBeforeOfflineActions);
  assert.equal(sent.length, framesBeforeOfflineActions);

  eventBus.publish("transport:reconnect-status", {
    status: "connected",
    attempt: 0,
    transport: "wss",
  });
  assert.equal(world.getSnapshot().connected, true);
  assert.equal(world.getSnapshot().playlistFresh, false);
  assert.equal(world.votePlaylistSkip(), false);
  bus.dispatch("Darkwind.Room.Playlist.State", playlistState);
  assert.equal(world.getSnapshot().playlistFresh, true);
  assert.equal(world.votePlaylistSkip(), true);

  scope.dispose();
  assert.equal(world.refreshMedia(), false);
  bus.dispatch("Room.Info", { num: 202, name: "Late", exits: {} });
  assert.equal(world.getSnapshot().room, null);
  const lifecycle = diagnostics.snapshot();
  assert.equal(lifecycle.liveListeners, 0);
  assert.equal(lifecycle.liveSubscriptions, 0);
  assert.equal(lifecycle.liveTimers, 0);
  assert.equal(lifecycle.liveAnimationFrames, 0);
  assert.equal(lifecycle.liveChildScopes, 0);
});
