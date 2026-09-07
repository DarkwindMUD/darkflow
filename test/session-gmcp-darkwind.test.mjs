import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer, isRunnableDevEnvironment } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Vite SSR fixture shared by every session GMCP Darkwind test. */
async function loadDarkwindModules(t) {
  const server = await createServer({
    configFile: path.join(repoRoot, "vite.config.ts"),
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
    hmr: false,
    watch: null,
  });
  t.after(async () => {
    await server.close();
  });

  const ssr = server.environments.ssr;
  assert.ok(isRunnableDevEnvironment(ssr));

  const [
    validatorsModule,
    diagnosticsModule,
    busModule,
    idsModule,
    darkwindClientModule,
  ] = await Promise.all([
    ssr.runner.import("/gmcp/contracts/validators.ts"),
    ssr.runner.import("/runtime/diagnostics.ts"),
    ssr.runner.import("/gmcp/bus.ts"),
    ssr.runner.import("/model/ids.ts"),
    ssr.runner.import("/gmcp/contracts/darkwind-client.ts"),
  ]);

  const factory = idsModule.createSequentialUuidFactory();
  const sessionId = idsModule.createSessionId(factory);
  const otherSessionId = idsModule.createSessionId(factory);

  return {
    ...validatorsModule,
    SessionDiagnostics: diagnosticsModule.SessionDiagnostics,
    ...busModule,
    ...darkwindClientModule,
    sessionId,
    otherSessionId,
  };
}

test("Darkwind.Window Open/Update/Close validate documented envelopes", async (t) => {
  const { lookupGmcpValidator } = await loadDarkwindModules(t);

  const openValidator = lookupGmcpValidator("Darkwind.Window.Open");
  assert.ok(openValidator);
  assert.equal(
    openValidator({
      id: "login",
      type: "modal",
      title: "Login",
      closable: true,
      width: 420,
      height: "60vh",
      layout: { type: "vertical", children: [] },
    }).success,
    true,
  );
  assert.equal(
    openValidator({
      id: "who",
      layout: {
        type: "vertical",
        children: [{ type: "player_row", id: "row-1", name: "Gandalf" }],
      },
    }).success,
    true,
  );
  assert.equal(openValidator({ id: "missing-layout" }).success, false);

  const updateValidator = lookupGmcpValidator("Darkwind.Window.Update");
  assert.ok(updateValidator);
  assert.equal(
    updateValidator({
      id: "login",
      updates: [{ id: "error", text: "Invalid password", style: { color: "red" } }],
    }).success,
    true,
  );
  assert.equal(updateValidator({ id: "login", updates: "invalid" }).success, false);

  const closeValidator = lookupGmcpValidator("Darkwind.Window.Close");
  assert.ok(closeValidator);
  assert.equal(closeValidator({}).success, false);
});

test("Darkwind.Window.Open accepts numeric closable from MUD payloads", async (t) => {
  const { createSessionGmcpBus, SessionDiagnostics, sessionId } = await loadDarkwindModules(t);
  const diagnostics = new SessionDiagnostics(sessionId);
  const bus = createSessionGmcpBus(sessionId, () => true, diagnostics);
  const seen = [];

  bus.on("Darkwind.Window.Open", (data) => seen.push(data));
  bus.dispatch("Darkwind.Window.Open", {
    id: "login",
    type: "modal",
    title: "Login",
    closable: 0,
    layout: { type: "vertical", children: [] },
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].closable, 0);
  assert.equal(diagnostics.snapshot().suppressedEvents, 0);
});

test("Char.Status accepts MUD lifestyle strings without coercion", async (t) => {
  const { createSessionGmcpBus, SessionDiagnostics, sessionId, lookupGmcpValidator } =
    await loadDarkwindModules(t);
  const validator = lookupGmcpValidator("Char.Status");
  assert.ok(validator);

  const payload = {
    name: "Tamjr",
    level: 42,
    dead: "No",
    drunk: "Sober",
    invis: "No",
    sit: "No",
    viking: "No",
  };
  assert.equal(validator(payload).success, true);

  const diagnostics = new SessionDiagnostics(sessionId);
  const bus = createSessionGmcpBus(sessionId, () => true, diagnostics);
  const seen = [];
  bus.on("Char.Status", (data) => seen.push(data));
  bus.dispatch("Char.Status", payload);

  assert.equal(seen.length, 1);
  assert.equal(seen[0].drunk, "Sober");
  assert.equal(diagnostics.snapshot().suppressedEvents, 0);
});

test("Step 6 information package validators accept representative server payloads", async (t) => {
  const { lookupGmcpValidator } = await loadDarkwindModules(t);
  const fixtures = {
    Group: { groupname: "Expedition", members: [{ name: "Nacho", info: { hp: 10, maxhp: 20 } }] },
    "Darkwind.Char.Avatar": { url: "/assets/avatar.png", name: "Nacho" },
    "Darkwind.Divine": { patron: "mitra", pressure_scale: { mitra: 100 } },
    "Darkwind.Sky": { server_time: 1, game_now: 2, scale: { second: 1 }, time: { hour: 1 } },
    "Darkwind.GuildVitals": {
      items: [
        { id: "focus", label: "Focus", kind: "boolean", on: 1 },
        { id: "stances", label: "Stances", kind: "flags", flags: [{ label: "Crane", on: 0 }] },
      ],
    },
    "Darkwind.XPMon": { active: 1, xp: 25 },
    "Darkwind.Quests.List": [{ id: "herbs", name: "Gather herbs", status: "Started" }],
    "Darkwind.Quests.Active": [],
    "Darkwind.Quests.Update": { questId: "herbs", objective: "Herbs", current: 1, required: 2 },
    "Darkwind.Quests.Complete": { name: "Gather herbs" },
    "Darkwind.Achievements.List": {
      summary: { unlockedTierCount: 1, totalTierCount: 2, completedFamilyCount: 0, totalFamilyCount: 1 },
      families: [{ id: "explorer", name: "Explorer", currentValue: 1 }],
    },
    "Darkwind.Achievements.Update": { families: [{ id: "explorer", name: "Explorer", currentValue: 2 }] },
    "Darkwind.Cyberware.List": { installed: [{ id: "eyes", name: "Targeting suite" }], strain: { used: 1, total: 4 } },
    "Darkwind.Cyberware.Details": { id: "eyes", description: "Sharp." },
    "Darkwind.Cyberware.Image": { id: "eyes", url: "/eyes.png" },
  };

  for (const [packageName, payload] of Object.entries(fixtures)) {
    const validator = lookupGmcpValidator(packageName);
    assert.ok(validator, `expected validator for ${packageName}`);
    assert.equal(validator(payload).success, true, `${packageName} rejected valid payload`);
  }

  assert.equal(lookupGmcpValidator("Group")({ members: [{ name: 1 }] }).success, false);
  assert.equal(lookupGmcpValidator("Darkwind.Char.Avatar")({ url: 1 }).success, false);
  assert.equal(lookupGmcpValidator("Darkwind.Divine")({ pressure_scale: { mitra: "high" } }).success, false);
  assert.equal(lookupGmcpValidator("Darkwind.Sky")({ game_now: "late" }).success, false);
  assert.equal(lookupGmcpValidator("Darkwind.GuildVitals")({ items: [{ id: 1 }] }).success, false);
  assert.equal(lookupGmcpValidator("Darkwind.XPMon")({ active: "yes" }).success, false);
  assert.equal(lookupGmcpValidator("Darkwind.Quests.List")([{ name: 1 }]).success, false);
  assert.equal(lookupGmcpValidator("Darkwind.Quests.Update")({ questId: "herbs", objective: "Herbs", current: "wrong", required: 2 }).success, false);
  assert.equal(lookupGmcpValidator("Darkwind.Achievements.List")({ summary: {}, families: [] }).success, false);
  assert.equal(lookupGmcpValidator("Darkwind.Cyberware.List")({ installed: [{ id: 1 }], strain: {} }).success, false);
  assert.equal(lookupGmcpValidator("Darkwind.Cyberware.Details")({ id: 1 }).success, false);
  assert.equal(lookupGmcpValidator("Darkwind.Cyberware.Image")({ id: "eyes", url: 1 }).success, false);
});

test("Step 7 interaction validators accept live shapes and reject malformed payloads", async (t) => {
  const { lookupGmcpValidator } = await loadDarkwindModules(t);
  const item = {
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
  const open = {
    session: "f-12ab34cd",
    terrain: "lake",
    skill: 250,
    poleTier: 1,
    baitTier: 2,
    baited: 1,
    sceneArtUrl: 0,
  };
  const valid = {
    "Darkwind.Snoop.Open": {
      id: "snoop",
      target: "Denian",
      targetRealName: "denian",
      snooper: "Acer",
      startedAt: 1778582400,
    },
    "Darkwind.Snoop.Append": {
      id: "snoop",
      type: "output",
      text: "Center of Town!\n",
      timestamp: 1778582401,
    },
    "Darkwind.Snoop.Status": { id: "snoop", text: "Connected.", timestamp: 1778582402 },
    "Darkwind.Snoop.Close": { id: "snoop", reason: "stopped" },
    "Darkwind.Announcements.List": { active: [item], archived: [], unreadCount: 1 },
    "Darkwind.Announcements.New": { item, unreadCount: 1 },
    "Darkwind.Announcements.Update": { item, bucket: "active", unreadCount: 0 },
    "Darkwind.Announcements.State": { unreadCount: 1 },
    "Darkwind.Giphy.Show": { gifUrl: "https://media.giphy.com/a.gif", durationMs: 10000 },
    "Darkwind.Broadcast.Show": { message: "The city gates are open.", sentAt: 1778582403 },
    "Darkwind.LinuxRescue.Open": { fullscreen: 1 },
    "Darkwind.Fishing.Open": open,
    "Darkwind.Fishing.Bite": { session: open.session, windowMs: 2500, tease: "large" },
    "Darkwind.Fishing.Fight": {
      session: open.session,
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
    },
    "Darkwind.Fishing.Caught": {
      session: open.session,
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
    },
    "Darkwind.Fishing.Escaped": { session: open.session, reason: "timeout" },
    "Darkwind.Fishing.Art": {
      species: "silverfin",
      artUrl: "https://example.invalid/silverfin.png",
    },
    "Darkwind.Fishing.End": { session: open.session, reason: "done", message: "Finished." },
  };
  const malformed = {
    "Darkwind.Snoop.Open": { ...valid["Darkwind.Snoop.Open"], startedAt: "now" },
    "Darkwind.Snoop.Append": { ...valid["Darkwind.Snoop.Append"], type: "other" },
    "Darkwind.Snoop.Status": { ...valid["Darkwind.Snoop.Status"], text: 1 },
    "Darkwind.Snoop.Close": { id: 1 },
    "Darkwind.Announcements.List": { active: {}, archived: [], unreadCount: 1 },
    "Darkwind.Announcements.New": { item: { ...item, id: "42" }, unreadCount: 1 },
    "Darkwind.Announcements.Update": { item, bucket: "deleted", unreadCount: 0 },
    "Darkwind.Announcements.State": { unreadCount: "one" },
    "Darkwind.Giphy.Show": { gifUrl: 1 },
    "Darkwind.Broadcast.Show": { message: "Valid", sentAt: "now" },
    "Darkwind.LinuxRescue.Open": { fullscreen: "yes" },
    "Darkwind.Fishing.Open": { ...open, skill: "high" },
    "Darkwind.Fishing.Bite": { session: open.session, windowMs: "soon", tease: "large" },
    "Darkwind.Fishing.Fight": { ...valid["Darkwind.Fishing.Fight"], seed: "random" },
    "Darkwind.Fishing.Caught": {
      ...valid["Darkwind.Fishing.Caught"],
      fish: { ...valid["Darkwind.Fishing.Caught"].fish, quality: "high" },
    },
    "Darkwind.Fishing.Escaped": { session: open.session, reason: 1 },
    "Darkwind.Fishing.Art": { species: "silverfin", artUrl: 1 },
    "Darkwind.Fishing.End": { session: open.session, reason: 1 },
  };

  for (const [packageName, payload] of Object.entries(valid)) {
    const validator = lookupGmcpValidator(packageName);
    assert.ok(validator, `expected validator for ${packageName}`);
    assert.equal(validator(payload).success, true, `${packageName} rejected live payload`);
    assert.equal(
      validator(malformed[packageName]).success,
      false,
      `${packageName} accepted malformed payload`,
    );
  }
});

test("server-native room and MapData2 wire values validate without coercion", async (t) => {
  const { createSessionGmcpBus, SessionDiagnostics, sessionId, lookupGmcpValidator } =
    await loadDarkwindModules(t);
  const roomId = 2599838393621098;
  const room = {
    id: roomId,
    name: "Temple Yard",
    area: "Darkwind",
    observed: 1,
    positioned: 1,
    x: 0,
    y: 0,
    z: 0,
    layoutState: "verified",
    version: 25,
    exits: { north: roomId + 1 },
  };
  const payloads = [
    ["Darkwind.MapData2.Current", { ...room, liveExits: { north: roomId + 1 } }],
    [
      "Room.Info",
      {
        num: roomId,
        name: "Temple Yard",
        environment: "inside",
        terrain: "inside",
        coords: "",
        exits: "",
        details: "",
      },
    ],
    ["Room.Players", ""],
    [
      "Darkwind.MapData2.Update",
      {
        area: "Darkwind",
        rooms: [room],
        complete: 1,
        replace: 0,
        cursor: roomId,
        snapshotVersion: 25,
      },
    ],
  ];

  const diagnostics = new SessionDiagnostics(sessionId);
  const bus = createSessionGmcpBus(sessionId, () => true, diagnostics);
  const errorSpy = t.mock.method(console, "error", () => {});
  const seen = [];
  bus.on("*", (packageName, data) => seen.push([packageName, data]));

  for (const [packageName, payload] of payloads) {
    const validator = lookupGmcpValidator(packageName);
    assert.ok(validator);
    assert.equal(validator(payload).success, true, `${packageName} rejected server payload`);
    bus.dispatch(packageName, payload);
  }

  assert.equal(errorSpy.mock.callCount(), 0);
  assert.equal(seen.length, payloads.length);
  assert.equal(seen[0][1].id, roomId);
  assert.equal(seen[0][1].observed, 1);
  assert.equal(seen[1][1].coords, "");
  assert.equal(seen[2][1], "");
  assert.equal(seen[3][1].replace, 0);

  assert.equal(
    lookupGmcpValidator("Darkwind.MapData2.Current")({ ...room, observed: 2 }).success,
    false,
  );
  assert.equal(lookupGmcpValidator("Room.Players")({}).success, false);
});

test("Darkwind.Window layout accepts unrecognized node types", async (t) => {
  const { lookupGmcpValidator } = await loadDarkwindModules(t);
  const validator = lookupGmcpValidator("Darkwind.Window.Open");
  assert.ok(validator);
  assert.equal(
    validator({
      id: "future",
      layout: {
        type: "vertical",
        children: [{ type: "future_node_type", id: "n1", customField: true }],
      },
    }).success,
    true,
  );
});

test("Darkwind.IDE inbound messages validate documented examples", async (t) => {
  const { lookupGmcpValidator } = await loadDarkwindModules(t);

  assert.equal(
    lookupGmcpValidator("Darkwind.IDE.Open")({
      path: "/domains/darkwind/rooms/tavern.c",
      content: "// file content here...",
      title: "The Tavern",
      language: "lpc",
      readOnly: 1,
      editable: 0,
    }).success,
    true,
  );

  assert.equal(
    lookupGmcpValidator("Darkwind.IDE.OpenStart")({
      session: "transfer-id",
      path: "/domains/darkwind/rooms/tavern.c",
      content: "",
      title: "The Tavern",
      language: "c",
      readOnly: 0,
      editable: 1,
      chunks: 12,
      totalLength: 384000,
      hash: "sha1...",
    }).success,
    true,
  );
  assert.equal(
    lookupGmcpValidator("Darkwind.IDE.OpenStart")({
      session: "transfer-id",
      path: "/path",
      content: "",
      chunks: "12",
      totalLength: 384000,
    }).success,
    false,
  );

  assert.equal(
    lookupGmcpValidator("Darkwind.IDE.OpenChunk")({
      session: "transfer-id",
      index: 0,
      content: "chunk content...",
    }).success,
    true,
  );

  assert.equal(
    lookupGmcpValidator("Darkwind.IDE.OpenFinish")({
      session: "transfer-id",
    }).success,
    true,
  );

  assert.equal(
    lookupGmcpValidator("Darkwind.IDE.SaveResult")({
      path: "/domains/darkwind/rooms/tavern.c",
      success: 0,
      message: "Compilation failed.",
      errors: [{ line: 15, column: 0, message: "Missing ';' before end of line" }],
    }).success,
    true,
  );
  assert.equal(
    lookupGmcpValidator("Darkwind.IDE.SaveResult")({ success: 1, message: "Saved." }).success,
    true,
  );
  assert.equal(lookupGmcpValidator("Darkwind.IDE.SaveResult")({ success: 2 }).success, false);
  assert.equal(
    lookupGmcpValidator("Darkwind.IDE.SaveResult")({
      success: false,
      errors: [{ line: "15", message: "bad" }],
    }).success,
    false,
  );
});

test("Darkwind.MapData2 accepts v1 and v2 wire shapes", async (t) => {
  const { lookupGmcpValidator } = await loadDarkwindModules(t);

  const room = { id: "450359962737049", name: "Temple Yard", area: "Darkwind" };

  assert.equal(
    lookupGmcpValidator("Darkwind.MapData2.Current")({
      ...room,
      protocol: 2,
      mapEpoch: "1783612800-123456",
      areaGeneration: 3,
      liveExits: { north: "450359962737050" },
    }).success,
    true,
  );
  assert.equal(lookupGmcpValidator("Darkwind.MapData2.Current")({ name: "no-id" }).success, false);

  assert.equal(
    lookupGmcpValidator("Darkwind.MapData2.Area")({
      area: "Darkwind",
      rooms: [room],
      version: 40,
      more: true,
    }).success,
    true,
  );
  assert.equal(
    lookupGmcpValidator("Darkwind.MapData2.Area")({
      area: "Darkwind",
      rooms: [room],
      mapEpoch: "1783612800-123456",
      areaGeneration: 3,
      replace: false,
    }).success,
    true,
  );
  assert.equal(lookupGmcpValidator("Darkwind.MapData2.Area")({ rooms: [room] }).success, false);

  assert.equal(
    lookupGmcpValidator("Darkwind.MapData2.Update")({
      area: "Darkwind",
      version: 40,
      offset: 100,
      more: true,
      rooms: [room],
    }).success,
    true,
  );
  assert.equal(
    lookupGmcpValidator("Darkwind.MapData2.Update")({
      protocol: 2,
      mapEpoch: "1783612800-123456",
      area: "Darkwind",
      areaGeneration: 3,
      since: 40,
      snapshotVersion: 91,
      latestVersion: 93,
      cursor: "450359962737099",
      complete: false,
      replace: false,
      rooms: [],
    }).success,
    true,
  );
  assert.equal(
    lookupGmcpValidator("Darkwind.MapData2.Update")({
      protocol: 2,
      mapEpoch: "1783612800-123456",
      rooms: [],
    }).success,
    false,
  );

  assert.equal(
    lookupGmcpValidator("Darkwind.MapData2.Error")({
      protocol: 2,
      code: "current_unavailable",
      reason: "refresh_failed",
      area: "Darkwind",
      restart: true,
      current: 1,
      unavailable: 1,
      mapEpoch: "1783612800-123456",
      areaGeneration: 3,
      retryAfterMs: 500,
      syncId: 0,
      fromCursor: 0,
    }).success,
    true,
  );

  assert.equal(
    lookupGmcpValidator("Darkwind.MapData2.BrowseArea")({
      catalog: "darkwind-overview",
      name: "Darkwind",
      center: 2599838393621098,
      rooms: [room],
      more: 0,
      replace: 1,
    }).success,
    true,
  );

  assert.equal(
    lookupGmcpValidator("Darkwind.MapData2.Reset")({
      scope: "area",
      area: "Darkwind",
      areaGeneration: 4,
      mapEpoch: "1783612800-999999",
    }).success,
    true,
  );
  assert.equal(
    lookupGmcpValidator("Darkwind.MapData2.Reset")({
      scope: "area",
      areaGeneration: 4,
    }).success,
    true,
  );
});

test("Step 8 world contracts accept live mudlib shapes and reject malformed frames", async (t) => {
  const {
    lookupGmcpValidator,
    unmodeledGmcpPackageNames,
    validateMapData2Browse,
    validateMapData2Sync,
    validateDarkwindRoomPlaylistAction,
    validateDarkwindRoomPlaylistReport,
  } = await loadDarkwindModules(t);
  const roomId = 2599838393621098;
  const entry = {
    id: 7,
    video_id: "dQw4w9WgXcQ",
    title: "Current song",
    added_by: "Nacho",
    duration: 212,
  };
  const state = {
    enabled: 1,
    room_id: roomId,
    revision: 12,
    server_time: 1784700000,
    name: "Temple Jukebox",
    playback: {
      status: "playing",
      position: 35,
      start_at: 1784699990,
      current: 0,
    },
    queue: [{ ...entry, can_remove: 0 }],
    skip_votes: 1,
    skip_needed: 2,
    permissions: { add: 1, moderate: 0 },
  };

  assert.equal(
    lookupGmcpValidator("Darkwind.Room.Image")({
      url: "https://media.darkwind.org/rooms/temple.jpg",
      name: "Temple Yard",
    }).success,
    true,
  );
  assert.equal(lookupGmcpValidator("Darkwind.Room.Image")({ name: "No URL" }).success, false);

  for (const packageName of [
    "Darkwind.Room.Playlist.State",
    "Darkwind.Room.Playlist.Open",
  ]) {
    const validator = lookupGmcpValidator(packageName);
    assert.ok(validator);
    assert.equal(validator(state).success, true);
    assert.equal(
      validator({ enabled: 0, room_id: String(roomId), server_time: 1784700000 }).success,
      true,
    );
    assert.equal(validator({ ...state, enabled: 2 }).success, false);
    assert.equal(
      validator({
        ...state,
        playback: { ...state.playback, current: null },
      }).success,
      false,
    );
  }

  assert.equal(
    validateMapData2Sync({
      protocol: 2,
      state: 1,
      mapEpoch: "1783612800-123456",
      syncId: "context-1",
      fromCursor: 0,
    }).success,
    true,
  );
  assert.equal(validateMapData2Sync({ protocol: 2 }).success, false);
  assert.equal(
    validateMapData2Sync({
      protocol: 2,
      area: "Darkwind",
      generation: 3,
      since: 40,
      snapshotVersion: 91,
      cursor: roomId,
      fromCursor: roomId,
      syncId: "sync-1",
    }).success,
    true,
  );
  assert.equal(validateMapData2Sync({ area: "Darkwind", version: 40, offset: 100 }).success, true);
  assert.equal(validateMapData2Browse({ catalog: "darkwind.overview", offset: 100 }).success, true);
  assert.equal(validateMapData2Browse({ catalog: "darkwind.overview", offset: "100" }).success, false);

  assert.equal(
    validateDarkwindRoomPlaylistAction({
      room_id: roomId,
      revision: 12,
      action: "move",
      from: 2,
      to: 1,
    }).success,
    true,
  );
  assert.equal(
    validateDarkwindRoomPlaylistAction({ room_id: roomId, revision: 12, action: "clear" })
      .success,
    false,
  );
  assert.equal(
    validateDarkwindRoomPlaylistReport({
      room_id: String(roomId),
      revision: 12,
      entry_id: entry.id,
      report: "ended",
    }).success,
    true,
  );
  assert.equal(
    validateDarkwindRoomPlaylistReport({
      room_id: roomId,
      revision: 12,
      entry_id: entry.id,
      report: "ready",
    }).success,
    false,
  );

  for (const packageName of [
    "Darkwind.Room.Image",
    "Darkwind.Room.Playlist.State",
    "Darkwind.Room.Playlist.Open",
    "Darkwind.Room.Playlist.Action",
    "Darkwind.Room.Playlist.Report",
  ]) {
    assert.equal(unmodeledGmcpPackageNames.includes(packageName), false);
  }
});

test("Darkwind.Client.NAWS and Session.Recovered contracts", async (t) => {
  const { lookupGmcpValidator, validateDarkwindClientNaws, validateDarkwindSessionRecovered } =
    await loadDarkwindModules(t);

  assert.equal(validateDarkwindClientNaws({ width: 120, height: 34 }).success, true);
  assert.equal(validateDarkwindClientNaws({ width: "120", height: 34 }).success, false);
  assert.equal(lookupGmcpValidator("Darkwind.Client.NAWS"), undefined);

  assert.equal(
    validateDarkwindSessionRecovered({
      mode: "switch",
      playerName: "Gandalf",
      recoveredAt: 1783612800,
      previousCharacter: "Bilbo",
    }).success,
    true,
  );
  assert.equal(
    validateDarkwindSessionRecovered({
      mode: "linkdead",
      playerName: "Gandalf",
      recoveredAt: 1783612800,
    }).success,
    true,
  );
  assert.equal(
    validateDarkwindSessionRecovered({
      mode: "takeover",
      playerName: "Gandalf",
      recoveredAt: 1783612800,
    }).success,
    true,
  );
  assert.equal(
    validateDarkwindSessionRecovered({
      mode: "linkdead",
      recoveredAt: "not-a-number",
    }).success,
    false,
  );
  assert.equal(lookupGmcpValidator("Darkwind.Session.Recovered"), validateDarkwindSessionRecovered);
});

test("Step 11 inbound packages are modeled through bounded normalizers", async (t) => {
  const { lookupGmcpValidator, unmodeledGmcpPackageNames } = await loadDarkwindModules(t);
  const fixtures = {
    "Darkwind.Combat.State": {
      epoch: "combat-1",
      encounter_id: "encounter-1",
      seq: 1,
      visual_enabled: 1,
      effective: 0,
      active: 1,
      current_actor_id: "self",
      current_target_id: "enemy-1",
      actors: [{ id: "self", name: "Nacho", role: "player" }],
      outcome: "",
      summary: "Combat begins.",
    },
    "Darkwind.Combat.Events": {
      epoch: "combat-1",
      encounter_id: "encounter-1",
      first_seq: 2,
      last_seq: 2,
      events: [
        {
          seq: 2,
          kind: "attack",
          perspective: "outgoing",
          actor_id: "self",
          target_id: "enemy-1",
          result: "hit",
          damage: 4,
          summary: "You hit.",
        },
      ],
      overflow: { omitted: 0, hits: 0, damage: 0 },
    },
    "Darkwind.Combat.Event": {
      epoch: "combat-1",
      encounter_id: "encounter-1",
      seq: 2,
      kind: "attack",
      perspective: "outgoing",
      actor_id: "self",
      target_id: "enemy-1",
      result: "hit",
      summary: "You hit.",
    },
    "Darkwind.Tutorial.State": {
      epoch: "tutorial-1",
      seq: 1,
      tutorial_version: 2,
      status: "active",
      awaiting_continue: 0,
      chapter: { id: "orientation", index: 1, total: 5, title: "Orientation" },
      step: {
        id: "look",
        index: 1,
        total: 21,
        title: "Look around",
        task: "Read the room.",
        hint: "Type look.",
        help: "help look",
        example_command: "look",
        target: "command-input",
      },
      route: null,
      actions: ["hint", "skip"],
      reason: "snapshot",
    },
    "Darkwind.Tutorial.Control": { visible: 0, reason: "screenreader" },
    "Darkwind.Visual.State": {
      epoch: "visual-1",
      seq: 1,
      reason: "move",
      planet: "markas",
      terrain: ["desert", "outside"],
    },
    "Darkwind.Visual.Events": {
      epoch: "visual-1",
      events: [
        {
          seq: 2,
          kind: "damage",
          perspective: "incoming",
          cue: "impact",
          intensity: 2,
        },
      ],
    },
    "Darkwind.Visual.Event": {
      epoch: "visual-1",
      seq: 2,
      kind: "damage",
      perspective: "incoming",
      cue: "impact",
      intensity: 2,
    },
    "Darkwind.Visual.Preview": { kind: "terrain", value: "desert" },
    "Darkwind.StreetSamurai": { protocol_version: 1 },
  };

  for (const [packageName, payload] of Object.entries(fixtures)) {
    const validator = lookupGmcpValidator(packageName);
    assert.ok(validator, `${packageName} validator`);
    assert.equal(validator(payload).success, true, `${packageName} live shape`);
    assert.equal(unmodeledGmcpPackageNames.includes(packageName), false);
  }

  assert.equal(
    lookupGmcpValidator("Darkwind.StreetSamurai")({ protocol_version: 2 }).success,
    false,
  );
  assert.equal(
    lookupGmcpValidator("Darkwind.Visual.Events")({
      epoch: "visual-1",
      events: [{ seq: 1, kind: "damage", perspective: "incoming", cue: "impact", intensity: NaN }],
    }).success,
    false,
  );
});

test("unmodeled packages never overlap modeled validators", async (t) => {
  const { lookupGmcpValidator, modeledGmcpPackageNames, unmodeledGmcpPackageNames } =
    await loadDarkwindModules(t);

  const modeledSet = new Set(modeledGmcpPackageNames);
  for (const packageName of unmodeledGmcpPackageNames) {
    assert.equal(lookupGmcpValidator(packageName), undefined, `${packageName} should be unmodeled`);
    assert.equal(modeledSet.has(packageName), false, `${packageName} must not appear in modeled set`);
  }
});

test("two SessionGmcpBus instances isolate IDE OpenChunk by session bus", async (t) => {
  const { createSessionGmcpBus, SessionDiagnostics, sessionId, otherSessionId } =
    await loadDarkwindModules(t);
  const diagnosticsA = new SessionDiagnostics(sessionId);
  const diagnosticsB = new SessionDiagnostics(otherSessionId);
  const busA = createSessionGmcpBus(sessionId, () => true, diagnosticsA);
  const busB = createSessionGmcpBus(otherSessionId, () => true, diagnosticsB);

  const seenA = [];
  const seenB = [];

  busA.on("Darkwind.IDE.OpenChunk", (data) => seenA.push(data));
  busB.on("Darkwind.IDE.OpenChunk", (data) => seenB.push(data));

  const chunk = { session: "shared-transfer-id", index: 0, content: "chunk" };
  busA.dispatch("Darkwind.IDE.OpenChunk", chunk);
  assert.equal(seenA.length, 1);
  assert.equal(seenB.length, 0);

  busB.dispatch("Darkwind.IDE.OpenChunk", {
    session: "shared-transfer-id",
    index: 1,
    content: "other-chunk",
  });
  assert.equal(seenA.length, 1);
  assert.equal(seenB.length, 1);
  assert.equal(seenA[0].index, 0);
  assert.equal(seenB[0].index, 1);
});

test("malformed modeled Darkwind frames still reach typed handlers", async (t) => {
  const { createSessionGmcpBus, SessionDiagnostics, sessionId } = await loadDarkwindModules(t);
  const diagnostics = new SessionDiagnostics(sessionId);
  const bus = createSessionGmcpBus(sessionId, () => true, diagnostics);
  const errorSpy = t.mock.method(console, "error", () => {});
  const seen = [];
  const sounds = [];

  bus.on("Darkwind.Window.Open", (data) => seen.push(data));
  bus.on("Darkwind.Sound", (data) => sounds.push(data));
  bus.dispatch("Darkwind.Window.Open", { id: "bad", layout: "not-an-object" });
  bus.dispatch("Darkwind.Sound", {
    type: "play",
    category: "ambient",
    sound: "../outside",
  });
  assert.equal(seen.length, 1);
  assert.equal(sounds.length, 1);
  assert.equal(diagnostics.snapshot().suppressedEvents, 0);
  assert.equal(errorSpy.mock.callCount(), 2);
  assert.match(String(errorSpy.mock.calls[0].arguments[0]), /GMCP validation failed for Darkwind\.Window\.Open/);
  assert.match(String(errorSpy.mock.calls[1].arguments[0]), /GMCP validation failed for Darkwind\.Sound/);
});
