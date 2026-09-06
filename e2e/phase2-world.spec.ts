import { Buffer } from "node:buffer";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { TransportFixtureOwner, type TransportEndpoint } from "./fixtures/transport-fixtures";

let fixtures: TransportFixtureOwner;

test.beforeAll(async () => {
  fixtures = await TransportFixtureOwner.start();
});

test.afterAll(async () => {
  await fixtures.close();
});

async function connect(page: Page): Promise<TransportEndpoint> {
  const endpoint = fixtures.endpoints.ws;
  await page.goto("/phase2/");
  await page.getByLabel("Host").fill("127.0.0.1");
  await page.getByLabel("Port").fill(String(endpoint.port));
  await page.getByLabel("Connection protocol").selectOption("ws");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByTestId("connection-status")).toHaveText("Connected");
  return endpoint;
}

async function togglePanel(page: Page, title: string): Promise<void> {
  const onMobile = (page.viewportSize()?.width ?? Infinity) <= 700;
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  if (onMobile) {
    // Mobile sheet uses Open/Close buttons and closes on selection.
    await page
      .getByRole("dialog", { name: "Panels", exact: true })
      .getByRole("button", { name: new RegExp(`^(?:Open|Close) ${title}$`) })
      .click();
  } else {
    // Desktop launcher is a checkbox list that stays open while toggling.
    await page.getByRole("checkbox", { name: title, exact: true }).click();
    await page.keyboard.press("Escape");
  }
}

function panelDragHandle(page: Page, panelId: string): Locator {
  return page.locator(`[data-panel-drag-handle][data-panel-id="${panelId}"]`);
}

async function dockPanelAsTab(page: Page, panelId: string, targetPanelId: string): Promise<void> {
  const source = await panelDragHandle(page, panelId)
    .locator(".dv-default-tab-content")
    .boundingBox();
  const target = await panelDragHandle(page, targetPanelId)
    .locator(".dv-default-tab-content")
    .boundingBox();

  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
}

async function dragPanelToRail(page: Page, panelId: string, side: "left" | "right"): Promise<void> {
  const source = await panelDragHandle(page, panelId)
    .locator(".dv-default-tab-content")
    .boundingBox();
  const rail = await page.locator(`[data-rail="${side}"]`).boundingBox();
  expect(source).not.toBeNull();
  expect(rail).not.toBeNull();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(rail!.x + rail!.width / 2, rail!.y + 40, { steps: 12 });
  await page.mouse.up();
}

function currentRoom(id: number, name: string, x: number, exits: Record<string, number> = {}) {
  return {
    protocol: 2,
    mapEpoch: "fixture-epoch",
    areaGeneration: 1,
    areaVersion: 1,
    id,
    name,
    area: "Fixture Town",
    positioned: 1,
    x,
    y: 0,
    z: 0,
    exits,
    liveExits: exits,
    liveDoors: {},
    walkSafe: Object.fromEntries(Object.keys(exits).map((direction) => [direction, 1])),
  };
}

const playlistState = {
  enabled: 1,
  room_id: 101,
  revision: 7,
  server_time: Math.floor(Date.now() / 1_000),
  name: "Fixture Jukebox",
  playback: {
    status: "playing",
    position: 3,
    start_at: Math.floor(Date.now() / 1_000) - 1,
    current: {
      id: 9,
      video_id: "dQw4w9WgXcQ",
      title: "Current video",
      added_by: "Nacho",
      duration: 212,
      can_remove: 0,
    },
  },
  queue: [
    {
      id: 10,
      video_id: "M7lc1UVf-VE",
      title: "Next video",
      added_by: "Denian",
      duration: 95,
      can_remove: 32,
    },
    {
      id: 12,
      video_id: "aqz-KE-bpKQ",
      title: "Second queued video",
      added_by: "Lydia",
      duration: 596,
      can_remove: 1,
    },
  ],
  skip_votes: 1,
  skip_needed: 2,
  permissions: { add: 1, moderate: 32 },
};

test("room and chat panels render session-owned GMCP state and clear on disconnect", async ({
  page,
}) => {
  const endpoint = await connect(page);
  const room = page.locator('.room-panel[data-panel-id="room"]');
  const chat = page.locator('.chat-panel[data-panel-id="chat"]');
  if ((await room.count()) === 0) await togglePanel(page, "Room");
  if ((await chat.count()) === 0) await togglePanel(page, "Chat");
  await expect(page.locator('[data-panel-drag-handle][data-panel-id="chat"]')).toBeVisible();
  await expect(chat).toContainText("No messages.");

  endpoint.sendGmcp("Room.Info", {
    num: 101,
    name: "Atrium",
    area: "Fixture Town",
    environment: "Inside",
    exits: { north: 102, east: 103 },
    exit_states: { east: "closed" },
  });
  endpoint.sendGmcp("Room.Players", [{ name: "Alice", fullname: "Alice Example" }]);
  endpoint.sendGmcp("Room.AddPlayer", { name: "Bob" });
  endpoint.sendGmcp("Room.RemovePlayer", "Alice");
  await expect(room).toContainText("Atrium");
  await expect(room).toContainText("Fixture Town");
  await expect(room).toContainText("Players: Bob");
  await expect(room.getByRole("button", { name: "Go east" })).toHaveCount(0);
  await room.getByRole("button", { name: "Go north" }).click();
  await expect.poll(() => endpoint.commands).toContain("north");

  endpoint.sendGmcp("Comm.Channel.List", [
    { name: "gossip", caption: "Gossip" },
    { name: "tell", caption: "Tells" },
  ]);
  endpoint.sendGmcp("Comm.Channel.Players", [{ name: "Alice" }, { name: "Bob" }]);
  endpoint.sendGmcp("Comm.Channel.Start", "gossip");
  const message = { channel: "gossip", talker: "alice", text: "[gossip] Alice: Hello there." };
  endpoint.sendGmcp("Comm.Channel", message);
  endpoint.sendGmcp("Comm.Channel.Text", message);
  endpoint.sendGmcp("Comm.Channel", {
    channel: "tell",
    talker: "bob",
    text: "Bob: A private message.",
  });
  await expect(chat).toContainText("Gossip");
  await expect(chat).toContainText("2 online");
  await expect(chat).toContainText("[gossip] Alice: Hello there.");
  await expect(chat.locator(".chat-entry")).toHaveCount(2);
  await expect(chat).toContainText("A private message.");

  endpoint.dropConnections();
  await expect(room).toContainText("No room data.");
  await expect(chat).toContainText("No messages.");
});

test("main panel close controls remove panels and allow reopening", async ({ page }) => {
  await connect(page);
  for (const [title, id] of [
    ["Map", "map"],
    ["Room Image", "roomImage"],
    ["Jukebox", "roomPlaylist"],
  ]) {
    await togglePanel(page, title!);
    const header = panelDragHandle(page, id!);
    await header.getByRole("button", { name: `Close ${title}`, exact: true }).click();
    await expect(header).toHaveCount(0);
    await togglePanel(page, title!);
    await expect(header).toBeVisible();
    await header.getByRole("button", { name: `Close ${title}`, exact: true }).click();
  }
  await expect(page.getByRole("textbox", { name: "Command input" })).toBeVisible();
});

test("map and room image reset across reconnect and remount after session disposal", async ({
  page,
}) => {
  const endpoint = await connect(page);
  await togglePanel(page, "Map");
  await togglePanel(page, "Room Image");
  endpoint.sendGmcp("Darkwind.MapData2.Current", currentRoom(101, "Atrium", 0));
  endpoint.sendGmcp("Room.Info", { num: 101, name: "Atrium", exits: {} });
  endpoint.sendGmcp("Darkwind.Room.Image", {
    url: "/assets/brand/darkflow-icon-64.png",
    name: "Atrium",
  });

  const map = page.locator('.map-panel[data-panel-id="map"]');
  const roomImage = page.locator('.room-image-panel[data-panel-id="roomImage"]');
  await expect(map.getByRole("button", { name: "Speedwalk to Atrium" })).toBeVisible();
  await expect(roomImage.getByRole("img", { name: "Atrium" })).toBeVisible();
  await map.evaluate((element) =>
    element.closest("[data-workspace-root-id]")?.setAttribute("data-world-instance", "map-old"),
  );
  await roomImage.evaluate((element) =>
    element.closest("[data-workspace-root-id]")?.setAttribute("data-world-instance", "image-old"),
  );

  endpoint.dropConnections();
  await expect(roomImage.getByRole("img")).toHaveCount(0);
  await expect(page.locator('[data-world-instance="map-old"]')).toHaveCount(1);
  await expect(page.locator('[data-world-instance="image-old"]')).toHaveCount(1);

  await expect(page.locator("#connect-btn")).toHaveText(/Retrying in \d+s/);
  await expect(page.getByTestId("connection-status")).toHaveText("Connected");
  await expect
    .poll(() =>
      endpoint.gmcpMessages
        .filter((message) => message.startsWith("Darkwind.Client.Subscriptions "))
        .at(-1),
    )
    .toContain('"map":true');
  expect(
    endpoint.gmcpMessages
      .filter((message) => message.startsWith("Darkwind.Client.Subscriptions "))
      .at(-1),
  ).toContain('"roomImage":true');
  endpoint.sendGmcp("Darkwind.MapData2.Current", currentRoom(101, "Atrium", 0));
  endpoint.sendGmcp("Room.Info", { num: 101, name: "Atrium", exits: {} });
  endpoint.sendGmcp("Darkwind.Room.Image", {
    url: "/assets/brand/darkflow-icon-64.png?reconnected=1",
    name: "Atrium",
  });
  await expect(roomImage.getByRole("img", { name: "Atrium" })).toBeVisible();
  await expect(page.locator('[data-world-instance="map-old"]')).toHaveCount(1);
  await expect(page.locator('[data-world-instance="image-old"]')).toHaveCount(1);

  await page.evaluate(() => {
    (
      window as unknown as { __darkflowPhase1Runtime: { session: { dispose(): void } } }
    ).__darkflowPhase1Runtime.session.dispose();
  });
  await expect(map).toHaveCount(0);
  await expect(roomImage).toHaveCount(0);

  await connect(page);
  if ((await map.count()) === 0) await togglePanel(page, "Map");
  if ((await roomImage.count()) === 0) await togglePanel(page, "Room Image");
  await expect(map).toBeVisible();
  await expect(roomImage).toBeVisible();
  await expect(page.locator("[data-world-instance]")).toHaveCount(0);
});

test("map navigation and room imagery survive layout persistence without stale media", async ({
  page,
}, testInfo) => {
  test.skip(
    (page.viewportSize()?.width ?? Infinity) <= 700,
    "layout persistence is desktop-only; mobile suppresses geometry writes",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  const endpoint = await connect(page);
  await togglePanel(page, "Status");
  await togglePanel(page, "Map");
  await togglePanel(page, "Room Image");

  await expect
    .poll(() =>
      endpoint.gmcpMessages
        .filter((message) => message.startsWith("Darkwind.Client.Subscriptions "))
        .at(-1),
    )
    .toContain('"status":true');
  expect(endpoint.gmcpMessages.at(-1)).toContain('"map":true');
  expect(endpoint.gmcpMessages.at(-1)).toContain('"roomImage":true');

  endpoint.sendGmcp("Darkwind.MapData2.Current", currentRoom(102, "East Hall", 1, { west: 101 }));
  endpoint.sendGmcp("Darkwind.MapData2.Current", currentRoom(101, "Atrium", 0, { east: 102 }));
  const map = page.locator('.map-panel[data-panel-id="map"]');
  const eastHall = map.getByRole("button", { name: "Speedwalk to East Hall" });
  await expect(eastHall).toBeVisible();
  await eastHall.press("Enter");
  await expect.poll(() => endpoint.commands).toContain("east");
  endpoint.sendGmcp("Darkwind.MapData2.Current", currentRoom(303, "Wrong Turn", 2));
  await expect(map.getByRole("status")).toContainText("Speedwalk stopped: route changed");

  const mapBody = map.locator(".map-body");
  const mapBox = await mapBody.boundingBox();
  expect(mapBox).not.toBeNull();
  await page.mouse.move(mapBox!.x + 80, mapBox!.y + 80);
  await page.mouse.down();
  await page.mouse.move(mapBox!.x + 130, mapBox!.y + 110);
  await page.mouse.up();
  await expect(mapBody).not.toHaveAttribute("data-map-pan-x", "0");

  await map.getByRole("button", { name: "Resync" }).click();
  await expect
    .poll(() =>
      endpoint.gmcpMessages.filter((message) => message.startsWith("Darkwind.MapData2.Sync ")),
    )
    .toContainEqual(expect.stringContaining('"area":"Fixture Town"'));

  endpoint.sendGmcp("Room.Info", { num: 101, name: "Atrium", exits: { east: 102 } });
  endpoint.sendGmcp("Darkwind.Room.Image", {
    url: "/assets/brand/darkflow-icon-64.png",
    name: "Atrium",
  });
  const roomImage = page.locator('.room-image-panel[data-panel-id="roomImage"]');
  await expect(roomImage.getByRole("img", { name: "Atrium" })).toBeVisible();

  let releaseSlowImage: (() => void) | undefined;
  const slowImageReleased = new Promise<void>((resolve) => {
    releaseSlowImage = resolve;
  });
  await page.route("**/slow-room.png", async (route) => {
    await slowImageReleased;
    await route.fulfill({
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=",
        "base64",
      ),
      contentType: "image/png",
    });
  });
  endpoint.sendGmcp("Darkwind.Room.Image", { url: "/slow-room.png", name: "Slow Atrium" });
  await expect(roomImage.getByRole("status")).toContainText("Loading");
  await expect(roomImage.getByRole("img", { name: "Atrium" })).toBeVisible();
  endpoint.sendGmcp("Room.Info", { num: 202, name: "Courtyard", exits: {} });
  await expect(roomImage.getByRole("img")).toHaveCount(0);
  releaseSlowImage?.();
  await page.waitForTimeout(100);
  await expect(roomImage.getByRole("img")).toHaveCount(0);
  endpoint.sendGmcp("Darkwind.Room.Image", {
    url: "/assets/brand/darkflow-icon-64.png?courtyard=1",
    name: "Courtyard",
  });
  await expect(roomImage.getByRole("img", { name: "Courtyard" })).toBeVisible();

  await dragPanelToRail(page, "roomImage", "right");
  const roomImageRailBody = page.locator(
    '[data-rail="right"] > [data-panel-id="roomImage"] .df-rail-card-body',
  );
  await expect(roomImageRailBody).toBeVisible();
  expect((await roomImageRailBody.boundingBox())?.height).toBeGreaterThanOrEqual(200);
  expect(
    await roomImageRailBody.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await dragPanelToRail(page, "map", "left");
  await page.screenshot({ path: testInfo.outputPath("map-room-image-rails-1440x900.png") });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: testInfo.outputPath("map-room-image-rails-1024x768.png") });
  await page.setViewportSize({ width: 1440, height: 900 });

  let releaseBrokenImage: (() => void) | undefined;
  const brokenImageReleased = new Promise<void>((resolve) => {
    releaseBrokenImage = resolve;
  });
  await page.route("**/broken-room.png", async (route) => {
    await brokenImageReleased;
    await route.abort().catch(() => {});
  });
  endpoint.sendGmcp("Darkwind.Room.Image", {
    url: "/broken-room.png",
    name: "Broken Courtyard",
  });
  await expect(roomImage.getByRole("status")).toContainText("Loading");
  await expect(roomImage.getByRole("img", { name: "Courtyard" })).toBeVisible();
  releaseBrokenImage?.();
  await expect(roomImage.getByRole("status")).toHaveCount(0);
  await expect(roomImage.getByRole("img", { name: "Courtyard" })).toBeVisible();

  const zoomTrigger = roomImage.getByRole("button", { name: "View larger image of Courtyard" });
  await zoomTrigger.click();
  const zoomDialog = page.getByRole("dialog", { name: "Courtyard" });
  await expect(zoomDialog.getByRole("button", { name: "Close room image" })).toBeFocused();
  await zoomDialog.evaluate((dialog) =>
    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  await expect(zoomDialog).not.toBeVisible();
  await expect(zoomTrigger).toBeFocused();

  let releaseDestroyImage: (() => void) | undefined;
  const destroyImageReleased = new Promise<void>((resolve) => {
    releaseDestroyImage = resolve;
  });
  await page.route("**/destroy-room.png", async (route) => {
    await destroyImageReleased;
    await route.abort().catch(() => {});
  });
  endpoint.sendGmcp("Darkwind.Room.Image", {
    url: "/destroy-room.png",
    name: "Destroy Courtyard",
  });
  await expect(roomImage.getByRole("status")).toContainText("Loading");
  await togglePanel(page, "Room Image");
  await expect(roomImage).toHaveCount(0);
  releaseDestroyImage?.();
  await page.waitForTimeout(100);
  await expect(roomImage).toHaveCount(0);

  const mapRailBody = page.locator('[data-rail="left"] > [data-panel-id="map"] .map-body');
  await expect(mapRailBody).toBeVisible();
  const mapRailBox = await mapRailBody.boundingBox();
  expect(mapRailBox?.width).toBeGreaterThanOrEqual(200);
  expect(mapRailBox?.height).toBeGreaterThanOrEqual(180);
  await map.getByRole("button", { name: "Zoom map out" }).click();
  await expect(map.locator(".map-zoom-level")).toHaveText("90%");
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");
  await page.reload();
  await expect(page.locator('.map-panel[data-panel-id="map"] .map-zoom-level')).toHaveText("90%");
  await expect(page.locator('[data-rail="left"] > [data-panel-id="map"]')).toBeVisible();
  await page.evaluate(() => {
    const runtime = (
      window as unknown as { __darkflowPhase1Runtime: { characterProfileId: string } }
    ).__darkflowPhase1Runtime;
    const state = JSON.parse(localStorage.getItem("darkflow-session-core-v1") ?? "{}");
    state.characterProfiles[runtime.characterProfileId].workspace.payload.dockview.layout.mapZoom =
      "invalid";
    localStorage.setItem("darkflow-session-core-v1", JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator('[data-rail="left"] > [data-panel-id="map"]')).toBeVisible();
  await expect(page.locator('.map-panel[data-panel-id="map"] .map-zoom-level')).toHaveText("100%");
});

test("BrowseArea opens only a transient area map and continues pagination", async ({ page }) => {
  const endpoint = await connect(page);
  endpoint.sendGmcp("Darkwind.MapData2.BrowseArea", {
    catalog: "fixture-town",
    name: "Fixture Town",
    center: 501,
    replace: 1,
    rooms: [currentRoom(501, "Market", 0)],
    more: 1,
    offset: 25,
  });

  const areaMap = page.locator('.map-panel[data-panel-id="areaMap"]');
  await expect(areaMap).toBeVisible();
  await expect(page.getByRole("button", { name: "Close Area Map", exact: true })).toBeVisible();
  await expect(areaMap.getByRole("button", { name: "Market" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect
    .poll(() => endpoint.gmcpMessages)
    .toContain('Darkwind.MapData2.Browse {"catalog":"fixture-town","offset":25}');
  expect(
    await page.evaluate(() => localStorage.getItem("darkflow-session-core-v1") ?? ""),
  ).not.toContain("areaMap");

  endpoint.sendGmcp("Darkwind.MapData2.Reset", { scope: "all", mapEpoch: "fixture-reset" });
  await expect(areaMap).toHaveCount(0);
});

test("playlist State stays closed while Open owns focus and player lifecycle", async ({
  page,
}, testInfo) => {
  if ((page.viewportSize()?.width ?? 0) > 700) {
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await page.addInitScript(() => {
    const calls: string[] = [];
    const players: Player[] = [];
    const eventHistory: NonNullable<typeof latestEvents>[] = [];
    let latestEvents:
      | {
          onReady(event: { target: unknown }): void;
          onStateChange(event: { data: number }): void;
          onError(event: { data: number }): void;
          onAutoplayBlocked(): void;
        }
      | undefined;
    class Player {
      time = 3;
      events;
      iframe = document.createElement("iframe");
      constructor(hostId: string, options: { events: NonNullable<typeof latestEvents> }) {
        this.events = options.events;
        this.iframe.title = "Fixture YouTube player";
        document.getElementById(hostId)?.replaceWith(this.iframe);
        latestEvents = options.events;
        eventHistory.push(options.events);
        players.push(this);
        queueMicrotask(() => this.events.onReady({ target: this }));
      }
      cueVideoById(): void {
        calls.push("cue");
      }
      destroy(): void {
        calls.push("destroy");
        this.iframe.remove();
      }
      getCurrentTime(): number {
        return this.time;
      }
      getDuration(): number {
        return 212;
      }
      getPlayerState(): number {
        return 1;
      }
      getVideoData(): { title: string } {
        return { title: "Resolved fixture title" };
      }
      pauseVideo(): void {
        calls.push("pause");
      }
      playVideo(): void {
        calls.push("play");
        this.events.onStateChange({ data: 1 });
      }
      seekTo(seconds: number): void {
        this.time = seconds;
        calls.push("seek");
      }
      setVolume(next: number): void {
        calls.push(`volume:${next}`);
      }
      stopVideo(): void {
        calls.push("stop");
      }
    }
    Object.assign(window, {
      YT: { Player, PlayerState: { PLAYING: 1, ENDED: 0 } },
      __darkflowPlaylistCalls: calls,
      __darkflowPlaylistEvents: () => latestEvents,
      __darkflowPlaylistEventHistory: eventHistory,
      __darkflowPlaylistPlayers: players,
    });
  });
  const endpoint = await connect(page);
  endpoint.sendGmcp("Room.Info", { num: 101, name: "Atrium", exits: {} });
  endpoint.sendGmcp("Darkwind.Room.Playlist.State", playlistState);
  await expect(page.locator('.room-playlist-panel[data-panel-id="roomPlaylist"]')).toHaveCount(0);

  endpoint.sendGmcp("Darkwind.Room.Playlist.Open", playlistState);
  const jukebox = page.locator('.room-playlist-panel[data-panel-id="roomPlaylist"]');
  await expect(jukebox).toContainText("Fixture Jukebox");
  await jukebox.getByRole("button", { name: "Listen in sync" }).click();
  await expect
    .poll(() => endpoint.gmcpMessages)
    .toContain(
      'Darkwind.Room.Playlist.Report {"room_id":101,"revision":7,"entry_id":9,"report":"ready","title":"Resolved fixture title","duration":212}',
    );

  if ((page.viewportSize()?.width ?? 0) > 700) {
    const playerCountBeforeRail = await page.evaluate(
      () =>
        (window as unknown as { __darkflowPlaylistPlayers: unknown[] }).__darkflowPlaylistPlayers
          .length,
    );
    const destroyCountBeforeRail = await page.evaluate(
      () =>
        (window as unknown as { __darkflowPlaylistCalls: string[] }).__darkflowPlaylistCalls.filter(
          (call) => call === "destroy",
        ).length,
    );
    await dragPanelToRail(page, "roomPlaylist", "right");
    const railCard = page.locator('[data-rail="right"] > [data-panel-id="roomPlaylist"]');
    await expect(railCard).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __darkflowPlaylistPlayers: unknown[] })
              .__darkflowPlaylistPlayers.length,
        ),
      )
      .toBe(playerCountBeforeRail + 1);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as { __darkflowPlaylistCalls: string[] }
            ).__darkflowPlaylistCalls.filter((call) => call === "destroy").length,
        ),
      )
      .toBe(destroyCountBeforeRail + 1);
    const playerBox = await railCard
      .locator('iframe[title="Fixture YouTube player"]')
      .boundingBox();
    expect(playerBox?.width).toBeGreaterThanOrEqual(200);
    expect(playerBox?.height).toBeGreaterThanOrEqual(200);
    expect(await railCard.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath("jukebox-rail-1440x900.png") });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.screenshot({ path: testInfo.outputPath("jukebox-rail-1024x768.png") });
    await page.setViewportSize({ width: 1440, height: 900 });

    await railCard.getByRole("button", { name: "Collapse Jukebox", exact: true }).click();
    endpoint.sendGmcp("Darkwind.Room.Playlist.Open", playlistState);
    await expect(
      railCard.getByRole("button", { name: "Collapse Jukebox", exact: true }),
    ).toBeVisible();
    await expect(page.locator('[data-panel-id="roomPlaylist"]')).toHaveCount(3);

    await jukebox.getByRole("button", { name: "Stop listening" }).click();
    const playerCountAfterStop = await page.evaluate(
      () =>
        (window as unknown as { __darkflowPlaylistPlayers: unknown[] }).__darkflowPlaylistPlayers
          .length,
    );
    await panelDragHandle(page, "roomPlaylist").dragTo(panelDragHandle(page, "avatar"));
    const leftRailCard = page.locator('[data-rail="left"] > [data-panel-id="roomPlaylist"]');
    await expect(leftRailCard).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __darkflowPlaylistPlayers: unknown[] }).__darkflowPlaylistPlayers
            .length,
      ),
    ).toBe(playerCountAfterStop);
    await jukebox.getByRole("button", { name: "Listen in sync" }).click();
    await leftRailCard.getByRole("button", { name: "Float Jukebox", exact: true }).click();
    await expect(page.getByTestId("workspace-host").locator(".room-playlist-panel")).toBeVisible();
    await page.getByRole("button", { name: "Dock Jukebox", exact: true }).click();

    const destroyCountBeforeHide = await page.evaluate(
      () =>
        (window as unknown as { __darkflowPlaylistCalls: string[] }).__darkflowPlaylistCalls.filter(
          (call) => call === "destroy",
        ).length,
    );
    await dockPanelAsTab(page, "roomPlaylist", "terminal");
    await panelDragHandle(page, "terminal").click();
    if (await jukebox.isVisible()) {
      await dockPanelAsTab(page, "roomPlaylist", "terminal");
      await panelDragHandle(page, "terminal").click();
    }
    await expect(jukebox).not.toBeVisible();
    await expect(jukebox).toHaveCount(1);
    endpoint.sendGmcp("Darkwind.Room.Playlist.State", {
      ...playlistState,
      playback: { ...playlistState.playback, status: "paused" },
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __darkflowPlaylistCalls: string[] }).__darkflowPlaylistCalls,
        ),
      )
      .toContain("pause");
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as { __darkflowPlaylistCalls: string[] }
          ).__darkflowPlaylistCalls.filter((call) => call === "destroy").length,
      ),
    ).toBe(destroyCountBeforeHide);
    await panelDragHandle(page, "roomPlaylist").locator(".dv-default-tab-content").click();
    await expect(jukebox.getByRole("button", { name: "Stop listening" })).toBeVisible();
    endpoint.sendGmcp("Darkwind.Room.Playlist.State", playlistState);
    await expect(jukebox.getByRole("button", { name: "Pause all" })).toBeVisible();
  }

  await jukebox.getByLabel("YouTube video URL").fill("https://youtu.be/dQw4w9WgXcQ");
  await jukebox.getByRole("button", { name: "Add", exact: true }).click();
  await jukebox.getByRole("button", { name: /Vote to skip/ }).click();
  await jukebox.getByRole("button", { name: "Pause all" }).click();
  await expect
    .poll(() => endpoint.gmcpMessages)
    .toContain(
      'Darkwind.Room.Playlist.Action {"room_id":101,"revision":7,"action":"add","url":"https://youtu.be/dQw4w9WgXcQ"}',
    );
  expect(endpoint.gmcpMessages).toContain(
    'Darkwind.Room.Playlist.Action {"room_id":101,"revision":7,"action":"vote_skip"}',
  );
  expect(endpoint.gmcpMessages).toContain(
    'Darkwind.Room.Playlist.Action {"room_id":101,"revision":7,"action":"pause"}',
  );
  endpoint.sendGmcp("Darkwind.Room.Playlist.State", {
    ...playlistState,
    playback: { ...playlistState.playback, status: "paused" },
  });
  await jukebox.getByRole("button", { name: "Resume all" }).click();
  await jukebox.getByRole("button", { name: "Skip now" }).click();
  expect(endpoint.gmcpMessages).toContain(
    'Darkwind.Room.Playlist.Action {"room_id":101,"revision":7,"action":"resume"}',
  );
  expect(endpoint.gmcpMessages).toContain(
    'Darkwind.Room.Playlist.Action {"room_id":101,"revision":7,"action":"skip"}',
  );
  endpoint.sendGmcp("Darkwind.Room.Playlist.State", playlistState);
  await jukebox.getByRole("button", { name: "Remove", exact: true }).first().click();
  await jukebox.getByRole("button", { name: "Move Second queued video up" }).click();
  expect(endpoint.gmcpMessages).toContain(
    'Darkwind.Room.Playlist.Action {"room_id":101,"revision":7,"action":"remove","number":1}',
  );
  expect(endpoint.gmcpMessages).toContain(
    'Darkwind.Room.Playlist.Action {"room_id":101,"revision":7,"action":"move","from":2,"to":1}',
  );

  endpoint.sendGmcp("Darkwind.Room.Playlist.State", {
    ...playlistState,
    playback: { ...playlistState.playback, status: "paused" },
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __darkflowPlaylistCalls: string[] }).__darkflowPlaylistCalls,
      ),
    )
    .toContain("pause");

  const now = Math.floor(Date.now() / 1_000);
  const playCountBeforeFutureStart = await page.evaluate(
    () =>
      (window as unknown as { __darkflowPlaylistCalls: string[] }).__darkflowPlaylistCalls.filter(
        (call) => call === "play",
      ).length,
  );
  endpoint.sendGmcp("Darkwind.Room.Playlist.State", {
    ...playlistState,
    server_time: now,
    playback: { ...playlistState.playback, position: 0, start_at: now + 1 },
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as unknown as { __darkflowPlaylistCalls: string[] }
            ).__darkflowPlaylistCalls.filter((call) => call === "play").length,
        ),
      { timeout: 3_000 },
    )
    .toBeGreaterThan(playCountBeforeFutureStart);

  const seekCountBeforeDrift = await page.evaluate(() => {
    const target = window as unknown as {
      __darkflowPlaylistCalls: string[];
      __darkflowPlaylistPlayers: Array<{ time: number }>;
    };
    target.__darkflowPlaylistPlayers.at(-1)!.time = -20;
    return target.__darkflowPlaylistCalls.filter((call) => call === "seek").length;
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as unknown as { __darkflowPlaylistCalls: string[] }
            ).__darkflowPlaylistCalls.filter((call) => call === "seek").length,
        ),
      { timeout: 6_000 },
    )
    .toBeGreaterThan(seekCountBeforeDrift);

  await page.evaluate(() => {
    (
      window as unknown as {
        __darkflowPlaylistEvents(): { onError(event: { data: number }): void } | undefined;
      }
    )
      .__darkflowPlaylistEvents()
      ?.onError({ data: 150 });
  });
  await expect
    .poll(() => endpoint.gmcpMessages)
    .toContain(
      'Darkwind.Room.Playlist.Report {"room_id":101,"revision":7,"entry_id":9,"report":"error","code":150}',
    );
  await page.evaluate(() => {
    (
      window as unknown as {
        __darkflowPlaylistEvents(): { onAutoplayBlocked(): void } | undefined;
      }
    )
      .__darkflowPlaylistEvents()
      ?.onAutoplayBlocked();
  });
  await expect(jukebox).toContainText("Your browser blocked autoplay");
  await jukebox.getByRole("button", { name: "Listen in sync" }).click();

  const readyReport =
    'Darkwind.Room.Playlist.Report {"room_id":101,"revision":7,"entry_id":9,"report":"ready","title":"Resolved fixture title","duration":212}';
  const readyReportsBeforeReconnect = endpoint.gmcpMessages.filter(
    (message) => message === readyReport,
  ).length;
  endpoint.dropConnections();
  await expect(jukebox).toContainText("Shared playback is unavailable while disconnected.");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __darkflowPlaylistCalls: string[] }).__darkflowPlaylistCalls,
      ),
    )
    .toContain("destroy");
  const reportsBeforeLateCallback = endpoint.gmcpMessages.length;
  await page.evaluate(() => {
    (
      window as unknown as {
        __darkflowPlaylistEvents(): { onStateChange(event: { data: number }): void } | undefined;
      }
    )
      .__darkflowPlaylistEvents()
      ?.onStateChange({ data: 0 });
  });
  expect(endpoint.gmcpMessages).toHaveLength(reportsBeforeLateCallback);

  await expect(page.locator("#connect-btn")).toHaveText(/Retrying in \d+s/);
  await expect(page.getByTestId("connection-status")).toHaveText("Connected");
  await expect(jukebox.getByRole("button", { name: /Vote to skip/ })).toBeDisabled();
  endpoint.sendGmcp("Room.Info", { num: 101, name: "Atrium", exits: {} });
  await expect(jukebox.getByRole("button", { name: /Vote to skip/ })).toBeDisabled();
  endpoint.sendGmcp("Darkwind.Room.Playlist.State", playlistState);
  await expect(jukebox.getByRole("button", { name: "Stop listening" })).toBeVisible();
  await expect
    .poll(() => endpoint.gmcpMessages.filter((message) => message === readyReport).length)
    .toBe(readyReportsBeforeReconnect + 1);

  const staleEntryEventIndex = await page.evaluate(
    () =>
      (window as unknown as { __darkflowPlaylistEventHistory: unknown[] })
        .__darkflowPlaylistEventHistory.length - 1,
  );
  endpoint.sendGmcp("Darkwind.Room.Playlist.State", {
    ...playlistState,
    revision: 8,
    playback: {
      ...playlistState.playback,
      current: {
        ...playlistState.playback.current,
        id: 11,
        video_id: "M7lc1UVf-VE",
        title: "Replacement video",
      },
    },
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __darkflowPlaylistEventHistory: unknown[];
            }
          ).__darkflowPlaylistEventHistory.length,
      ),
    )
    .toBeGreaterThan(staleEntryEventIndex + 1);
  const reportsBeforeStaleEntryCallback = endpoint.gmcpMessages.length;
  await page.evaluate((staleIndex) => {
    const history = (
      window as unknown as {
        __darkflowPlaylistEventHistory: Array<{
          onStateChange(event: { data: number }): void;
        }>;
      }
    ).__darkflowPlaylistEventHistory;
    history[staleIndex]?.onStateChange({ data: 0 });
  }, staleEntryEventIndex);
  expect(endpoint.gmcpMessages).toHaveLength(reportsBeforeStaleEntryCallback);
  await page.evaluate(() => {
    const history = (
      window as unknown as {
        __darkflowPlaylistEventHistory: Array<{
          onStateChange(event: { data: number }): void;
        }>;
      }
    ).__darkflowPlaylistEventHistory;
    history.at(-1)?.onStateChange({ data: 0 });
  });
  await expect
    .poll(() => endpoint.gmcpMessages)
    .toContain(
      'Darkwind.Room.Playlist.Report {"room_id":101,"revision":8,"entry_id":11,"report":"ended"}',
    );

  endpoint.sendGmcp("Room.Info", { num: 202, name: "Elsewhere", exits: {} });
  await expect(jukebox).toContainText("You left the jukebox room.");
  await expect(jukebox.getByRole("button", { name: /Vote to skip/ })).toBeDisabled();
  await togglePanel(page, "Jukebox");
  await expect(jukebox).toHaveCount(0);
  endpoint.sendGmcp("Darkwind.Room.Playlist.State", playlistState);
  await expect(jukebox).toHaveCount(0);
  endpoint.sendGmcp("Room.Info", { num: 101, name: "Atrium", exits: {} });
  endpoint.sendGmcp("Darkwind.Room.Playlist.Open", playlistState);
  await expect(jukebox).toBeVisible();
  await expect(jukebox.getByRole("button", { name: "Stop listening" })).toBeVisible();

  const activeDestroyCount = await page.evaluate(
    () =>
      (window as unknown as { __darkflowPlaylistCalls: string[] }).__darkflowPlaylistCalls.filter(
        (call) => call === "destroy",
      ).length,
  );
  await page.getByRole("button", { name: "Close Jukebox", exact: true }).click();
  await expect(jukebox).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { __darkflowPlaylistCalls: string[] }
          ).__darkflowPlaylistCalls.filter((call) => call === "destroy").length,
      ),
    )
    .toBe(activeDestroyCount + 1);
  const messagesBeforeClosedCallback = endpoint.gmcpMessages.length;
  await page.evaluate(() => {
    const history = (
      window as unknown as {
        __darkflowPlaylistEventHistory: Array<{
          onStateChange(event: { data: number }): void;
        }>;
      }
    ).__darkflowPlaylistEventHistory;
    history.at(-1)?.onStateChange({ data: 0 });
  });
  expect(endpoint.gmcpMessages).toHaveLength(messagesBeforeClosedCallback);

  const messagesBeforeDispose = endpoint.gmcpMessages.length;
  await page.evaluate(() => {
    (
      window as unknown as { __darkflowPhase1Runtime: { session: { dispose(): void } } }
    ).__darkflowPhase1Runtime.session.dispose();
  });
  await expect(jukebox).toHaveCount(0);
  await page.evaluate(() => {
    const history = (
      window as unknown as {
        __darkflowPlaylistEventHistory: Array<{
          onStateChange(event: { data: number }): void;
        }>;
      }
    ).__darkflowPlaylistEventHistory;
    history.at(-1)?.onStateChange({ data: 0 });
  });
  expect(endpoint.gmcpMessages).toHaveLength(messagesBeforeDispose);
});

test("playlist retries the YouTube loader after a failed attempt", async ({ page }) => {
  await page.route("https://www.youtube.com/iframe_api", (route) => route.abort());
  const endpoint = await connect(page);
  endpoint.sendGmcp("Room.Info", { num: 101, name: "Atrium", exits: {} });
  endpoint.sendGmcp("Darkwind.Room.Playlist.Open", playlistState);
  const jukebox = page.locator('.room-playlist-panel[data-panel-id="roomPlaylist"]');
  await jukebox.getByRole("button", { name: "Listen in sync" }).click();
  await expect(jukebox).toContainText("Playback could not start");

  await page.unroute("https://www.youtube.com/iframe_api");
  await page.evaluate(() => {
    class Player {
      events;
      constructor(
        _hostId: string,
        options: {
          events: {
            onReady(event: { target: Player }): void;
            onStateChange(event: { data: number }): void;
          };
        },
      ) {
        this.events = options.events;
        queueMicrotask(() => this.events.onReady({ target: this }));
      }
      cueVideoById(): void {}
      destroy(): void {}
      getCurrentTime(): number {
        return 0;
      }
      getDuration(): number {
        return 212;
      }
      getPlayerState(): number {
        return 1;
      }
      getVideoData(): { title: string } {
        return { title: "Retry fixture" };
      }
      pauseVideo(): void {}
      playVideo(): void {
        this.events.onStateChange({ data: 1 });
      }
      seekTo(): void {}
      setVolume(): void {}
      stopVideo(): void {}
    }
    Object.assign(window, { YT: { Player, PlayerState: { PLAYING: 1, ENDED: 0 } } });
  });
  await jukebox.getByRole("button", { name: "Listen in sync" }).click();
  await expect(jukebox.getByRole("button", { name: "Stop listening" })).toBeVisible();
  await expect
    .poll(() => endpoint.gmcpMessages)
    .toContain(
      'Darkwind.Room.Playlist.Report {"room_id":101,"revision":7,"entry_id":9,"report":"ready","title":"Retry fixture","duration":212}',
    );
});
