import { expect, test, type Page } from "@playwright/test";
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
  await expect(page.getByTestId("connection-status")).toHaveText("Connected via ws");
  return endpoint;
}

const loginWindow = {
  id: "login",
  type: "modal",
  title: "Welcome to Darkwind",
  closable: 0,
  layout: {
    type: "vertical",
    children: [
      { type: "paragraph", id: "error", text: "" },
      { type: "text", id: "username", label: "Character Name" },
      { type: "password", id: "password", label: "Password" },
      { type: "button", id: "login", text: "Login", action: "submit" },
    ],
  },
};

test("generic windows submit login, preserve reconnect input, update, and close", async ({
  page,
}) => {
  const endpoint = await connect(page);
  endpoint.sendGmcp("Darkwind.Window.Open", loginWindow);

  const dialog = page.getByRole("dialog", { name: "Welcome to Darkwind" });
  const username = dialog.locator('[data-dw-input="username"]');
  const password = dialog.locator('[data-dw-input="password"]');
  await expect(dialog).toBeVisible();
  await expect(username).toBeFocused();
  await username.fill("Nacho");
  await password.fill("secret");
  await password.press("Enter");
  await expect
    .poll(() => endpoint.gmcpMessages)
    .toContain(
      'Darkwind.Window.Submit {"id":"login","button":"login","data":{"username":"Nacho","password":"secret"}}',
    );

  endpoint.sendGmcp("Darkwind.Window.Update", {
    id: "login",
    updates: [{ id: "error", text: "Try again" }],
  });
  await expect(dialog).toContainText("Try again");

  endpoint.sendGmcp("Darkwind.Window.Open", {
    id: "charselect",
    type: "modal",
    title: "Choose a character",
    closable: 0,
    layout: { type: "vertical", children: [{ type: "paragraph", id: "status", text: "Stale" }] },
  });
  const staleAuthDialog = page.getByRole("dialog", { name: "Choose a character" });
  await expect(staleAuthDialog).toBeVisible();
  await username.focus();

  endpoint.dropConnections();
  await expect(dialog.locator(".dw-conn-strip-label")).toContainText(/Reconnecting|Disconnected/);
  await expect(dialog.locator(".dw-button-primary")).toBeDisabled();
  await expect(username).toHaveValue("Nacho");
  await page.getByRole("button", { name: "Retry now", exact: true }).click();
  await expect(page.getByTestId("connection-status")).toHaveText("Connected via ws");
  endpoint.sendGmcp("Darkwind.Window.Update", {
    id: "charselect",
    updates: [{ id: "status", text: "Still stale" }],
  });
  endpoint.sendGmcp("Darkwind.Window.Open", loginWindow);
  await expect(username).toHaveValue("Nacho");
  await expect(password).toHaveValue("secret");
  await expect(dialog.locator(".dw-button-primary")).toBeEnabled();
  await expect(staleAuthDialog).toHaveCount(0, { timeout: 9_000 });

  endpoint.sendGmcp("Darkwind.Window.Close", { id: "login" });
  await expect(dialog).toHaveCount(0);
});

test("server panels and NPC dialogue render and send actions", async ({ page }) => {
  const endpoint = await connect(page);
  endpoint.sendGmcp("Darkwind.Window.Open", {
    id: "tools",
    type: "panel",
    title: "Server Tools",
    dock: "right",
    layout: {
      type: "vertical",
      children: [
        { type: "heading", id: "status", text: "Ready" },
        { type: "button", id: "run", text: "Run", action: "action" },
      ],
    },
  });

  const panel = page.locator('.server-window-panel[data-panel-id="server-window-tools"]');
  await expect(panel).toContainText("Ready");
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(() => localStorage.getItem("darkflow-session-core-v1") ?? ""),
  ).not.toContain("server-window-tools");
  await panel.getByRole("button", { name: "Run" }).click();
  await expect
    .poll(() => endpoint.gmcpMessages)
    .toContain('Darkwind.Window.Action {"id":"tools","button":"run"}');
  endpoint.sendGmcp("Darkwind.Window.Update", {
    id: "tools",
    updates: [{ id: "status", text: "Finished" }],
  });
  await expect(panel).toContainText("Finished");

  const settingsButton = page.getByRole("button", { name: "Settings" });
  await settingsButton.focus();
  endpoint.sendGmcp("Darkwind.Window.Open", {
    id: "guard",
    type: "npc_dialogue",
    title: "Gate guard",
    layout: { type: "npc_dialogue", npc: "Guard", text: "State your business.", choices: [] },
  });
  await expect(page.getByRole("dialog", { name: "Gate guard" })).toContainText(
    "State your business.",
  );
  await expect(page.getByRole("button", { name: "Close dialogue" })).toBeFocused();
  endpoint.sendGmcp("Darkwind.Window.Close", { id: "guard" });
  await expect(settingsButton).toBeFocused();

  endpoint.sendGmcp("Darkwind.Window.Open", {
    id: "finger",
    type: "modal",
    title: "Player profile",
    layout: {
      type: "finger_profile",
      name: "Denian",
      avatar: "/assets/brand/darkflow-icon-64.png",
      tagline: "A wary traveler",
      lines: [],
    },
  });
  const avatarButton = page.getByRole("button", { name: "View avatar for Denian" });
  await avatarButton.click();
  const avatarDialog = page.getByRole("dialog", { name: "Denian avatar" });
  await expect(avatarDialog).toBeVisible();
  await expect(avatarDialog.getByRole("button", { name: "Close avatar" })).toBeFocused();
  await avatarDialog.press("Escape");
  await expect(avatarDialog).toHaveCount(0);
  await expect(avatarButton).toBeFocused();
  endpoint.sendGmcp("Darkwind.Window.Close", { id: "finger" });

  for (const [id, title] of [
    ["background", "Background window"],
    ["foreground", "Foreground window"],
  ]) {
    endpoint.sendGmcp("Darkwind.Window.Open", {
      id,
      type: "modal",
      title,
      layout: { type: "paragraph", text: title },
    });
  }
  const foreground = page.getByRole("dialog", { name: "Foreground window" });
  const foregroundClose = foreground.getByRole("button", { name: "Close Foreground window" });
  await expect(foregroundClose).toBeFocused();
  endpoint.sendGmcp("Darkwind.Window.Close", { id: "background" });
  await expect(foregroundClose).toBeFocused();

  endpoint.sendGmcp("Darkwind.Snoop.Open", {
    id: "snoop-stacked",
    target: "Denian",
    targetRealName: "denian",
    snooper: "Acer",
    startedAt: 1,
  });
  const stackedSnoop = page.getByRole("dialog", { name: "Snooping: Denian" });
  await stackedSnoop.getByLabel("Execute command as Denian").press("Escape");
  await expect(stackedSnoop).toHaveCount(0);
  await expect(foreground).toBeVisible();
  endpoint.sendGmcp("Darkwind.Window.Close", { id: "foreground" });

  for (const title of ["Video one", "Video two"]) {
    endpoint.sendGmcp("Darkwind.Window.Open", {
      id: "shared-video",
      type: "panel",
      title,
      layout: {
        type: "vertical",
        children: [
          { type: "youtube_embed", src: "about:blank", title },
          { type: "button", id: "close-video", text: "Close video", action: "close" },
        ],
      },
    });
  }
  const firstVideo = page.locator(".server-window-panel", { has: page.getByTitle("Video one") });
  const secondVideo = page.locator(".server-window-panel", { has: page.getByTitle("Video two") });
  await expect(firstVideo).toBeVisible();
  await expect(secondVideo).toBeVisible();
  await firstVideo.getByRole("button", { name: "Close video" }).click();
  await expect(firstVideo).toHaveCount(0);
  await expect(secondVideo).toBeVisible();
  await expect
    .poll(
      () =>
        endpoint.gmcpMessages.filter(
          (message) => message === 'Darkwind.Window.Closed {"id":"shared-video"}',
        ).length,
    )
    .toBe(1);
  await secondVideo.getByRole("button", { name: "Close video" }).click();
  const capturedGeometry = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("darkwind-shared-video-window-geometry") ?? "null"),
  );
  expect(capturedGeometry).toEqual({
    x: expect.any(Number),
    y: expect.any(Number),
    w: expect.any(Number),
    h: expect.any(Number),
  });
  await page.evaluate(() => {
    localStorage.setItem(
      "darkwind-shared-video-window-geometry",
      JSON.stringify({ x: 55, y: 65, w: 320, h: 240 }),
    );
  });
  endpoint.sendGmcp("Darkwind.Window.Open", {
    id: "shared-video",
    type: "panel",
    title: "Video three",
    layout: {
      type: "vertical",
      children: [
        { type: "youtube_embed", src: "about:blank", title: "Video three" },
        { type: "button", id: "close-video", text: "Close video", action: "close" },
      ],
    },
  });
  const thirdVideo = page.locator(".server-window-panel", { has: page.getByTitle("Video three") });
  await expect(thirdVideo).toBeVisible();
  const restoredGeometry = await thirdVideo.evaluate((panel) => {
    const rect = (panel.closest(".dv-resize-container") ?? panel).getBoundingClientRect();
    const workspace = panel.closest('[data-testid="workspace-host"]')?.getBoundingClientRect();
    return {
      x: Math.round(rect.left - (workspace?.left ?? 0)),
      y: Math.round(rect.top - (workspace?.top ?? 0)),
      w: Math.round(rect.width),
    };
  });
  expect(restoredGeometry.x).toBeGreaterThanOrEqual(50);
  expect(restoredGeometry.x).toBeLessThanOrEqual(60);
  expect(restoredGeometry.y).toBeGreaterThanOrEqual(60);
  expect(restoredGeometry.y).toBeLessThanOrEqual(70);
  expect(restoredGeometry.w).toBeGreaterThanOrEqual(315);
  expect(restoredGeometry.w).toBeLessThanOrEqual(325);
  await thirdVideo.getByRole("button", { name: "Close video" }).click();

  endpoint.sendGmcp("Darkwind.Fishing.Open", {
    session: "fish-reset",
    terrain: "lake",
    skill: 1,
    poleTier: 1,
    baitTier: 1,
    baited: 1,
    sceneArtUrl: 0,
  });
  const fishingPanel = page.locator('.fishing-body[data-panel-id="fishing"]');
  await expect(fishingPanel).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Reset workspace", exact: true }).click();
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(fishingPanel).toHaveCount(0);
  await expect.poll(() => endpoint.gmcpMessages).toContain('Darkwind.Window.Closed {"id":"tools"}');
  await expect
    .poll(() => endpoint.gmcpMessages)
    .toContain('Darkwind.Fishing.Cancel {"session":"fish-reset"}');
  const savedWorkspace = await page.evaluate(
    () => localStorage.getItem("darkflow-session-core-v1") ?? "",
  );
  expect(savedWorkspace).not.toContain("server-window-tools");
  expect(savedWorkspace).not.toContain('"fishing"');
});

test("snoop, announcements, attention overlays, and Linux rescue use live GMCP", async ({
  page,
}) => {
  const endpoint = await connect(page);
  endpoint.sendGmcp("Darkwind.Snoop.Open", {
    id: "snoop-1",
    target: "Denian",
    targetRealName: "denian",
    snooper: "Acer",
    startedAt: 1,
  });
  endpoint.sendGmcp("Darkwind.Snoop.Append", {
    id: "snoop-1",
    type: "output",
    text: "\u001b[32mCenter of Town\u001b[0m",
    timestamp: 2,
  });
  const snoop = page.getByRole("dialog", { name: "Snooping: Denian" });
  await expect(snoop).toContainText("Center of Town");
  const targetCommand = snoop.getByLabel("Execute command as Denian");
  await targetCommand.fill("look");
  await targetCommand.press("Enter");
  await expect
    .poll(() => endpoint.gmcpMessages)
    .toContain('Darkwind.Snoop.Command {"id":"snoop-1","mode":"target","command":"look"}');
  await snoop.getByRole("button", { name: "Stop Snooping" }).click();
  await expect.poll(() => endpoint.gmcpMessages).toContain('Darkwind.Snoop.Stop {"id":"snoop-1"}');
  await targetCommand.focus();
  await targetCommand.press("Escape");
  await expect
    .poll(() => endpoint.gmcpMessages)
    .toContain('Darkwind.Snoop.Closed {"id":"snoop-1"}');

  endpoint.sendGmcp("Darkwind.Announcements.State", { unreadCount: 1 });
  const announcementButton = page.getByRole("button", { name: /Announcements/ });
  await expect(announcementButton).toContainText("1");
  await announcementButton.click();
  await expect
    .poll(() =>
      endpoint.gmcpMessages.some((message) => message.includes('"announcementsList":true')),
    )
    .toBe(true);
  endpoint.sendGmcp("Darkwind.Announcements.List", {
    active: [
      {
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
        markdown: "# Welcome\n[unsafe](javascript:alert(1))",
        isRead: 0,
      },
    ],
    archived: [],
    unreadCount: 1,
  });
  const announcements = page.getByRole("dialog", { name: "Announcements" });
  await expect(announcements).toContainText("Spring Festival");
  expect(
    endpoint.gmcpMessages.filter((message) =>
      message.startsWith("Darkwind.Announcements.MarkRead"),
    ),
  ).toHaveLength(0);
  await announcements.getByRole("button", { name: /Spring Festival/ }).click();
  await expect
    .poll(() => endpoint.gmcpMessages)
    .toContain('Darkwind.Announcements.MarkRead {"id":42}');
  await expect(announcements.locator('a[href^="javascript:"]')).toHaveCount(0);

  endpoint.sendGmcp("Darkwind.Snoop.Open", {
    id: "snoop-over-announcements",
    target: "Denian",
    targetRealName: "denian",
    snooper: "Acer",
    startedAt: 3,
  });
  const stackedSnoop = page.getByRole("dialog", { name: "Snooping: Denian" });
  await stackedSnoop.getByLabel("Execute command as Denian").press("Escape");
  await expect(stackedSnoop).toHaveCount(0);
  await expect(announcements).toBeVisible();
  await announcements.getByRole("button", { name: "Close announcements" }).press("Escape");
  await expect(announcementButton).toBeFocused();

  endpoint.sendGmcp("Darkwind.Giphy.Show", {
    gifUrl: "/assets/brand/darkflow-icon-64.png",
    talker: "Elyndar",
    phrase: "hello",
    durationMs: 10_000,
  });
  await expect(page.locator(".giphy-overlay.open")).toContainText("Elyndar");
  endpoint.sendGmcp("Darkwind.Giphy.Show", {
    gifUrl: "/assets/brand/darkflow-icon-64.png",
    talker: "Denian",
    phrase: "again",
  });
  await expect(page.locator(".giphy-overlay.open")).toContainText("Denian");
  await expect(page.locator(".giphy-overlay.open")).not.toContainText("Elyndar");
  await page.getByRole("button", { name: "Close GIF" }).click();
  await expect(page.locator(".giphy-overlay")).toBeHidden();

  endpoint.sendGmcp("Darkwind.Broadcast.Show", {
    message: "The city gates are open.",
    sender: "Darkwind",
    sentAt: 1778582403,
  });
  await expect(page.locator(".broadcast-overlay.open")).toContainText("The city gates are open.");
  endpoint.sendGmcp("Darkwind.Broadcast.Show", {
    message: "The city gates are closed.",
    sender: "Watch",
    sentAt: 1778582404,
  });
  await expect(page.locator(".broadcast-overlay.open")).toContainText("The city gates are closed.");
  await page.getByRole("button", { name: "Close broadcast" }).click();

  endpoint.sendGmcp("Darkwind.LinuxRescue.Open", { fullscreen: 0 });
  const rescue = page.locator(".linux-rescue-overlay.open");
  const rescueInput = rescue.getByLabel("Linux rescue command");
  await expect(rescueInput).toBeFocused();
  await rescueInput.fill("help");
  await rescueInput.press("Enter");
  await expect(rescue).toContainText("Available commands");
  await rescueInput.fill("exit");
  await rescueInput.press("Enter");
  await expect(rescue).toHaveCount(0);
});

test("fishing casts, hooks, renders catches and late art, cancels, and keeps End text", async ({
  page,
}) => {
  const endpoint = await connect(page);
  const open = {
    session: "fish-1",
    terrain: "lake",
    skill: 250,
    poleTier: 1,
    baitTier: 2,
    baited: 1,
    sceneArtUrl: 0,
  };
  endpoint.sendGmcp("Darkwind.Fishing.Open", open);
  const panel = page.locator('.fishing-body[data-panel-id="fishing"]');
  const cast = panel.getByRole("button", { name: "Hold to Cast" });
  await expect(cast).toBeVisible();
  await cast.press("Space");
  await expect
    .poll(() =>
      endpoint.gmcpMessages.some((message) =>
        message.startsWith('Darkwind.Fishing.Cast {"session":"fish-1","power":'),
      ),
    )
    .toBe(true);

  endpoint.sendGmcp("Darkwind.Fishing.Bite", {
    session: open.session,
    windowMs: 2500,
    tease: "large",
  });
  await panel.getByRole("button", { name: "Hook fish" }).click();
  await expect
    .poll(() => endpoint.gmcpMessages)
    .toContain('Darkwind.Fishing.Hook {"session":"fish-1"}');

  endpoint.sendGmcp("Darkwind.Fishing.Fight", {
    session: open.session,
    seed: 1,
    params: {
      strength: 0,
      erratic: 0,
      stamina: 1,
      barSize: 100,
      progressRate: 1000,
      drainRate: 1,
      tensionRise: 1,
      tensionDecay: 1,
      minFightMs: 0,
    },
    fish: { tease: "small", rarityHint: "Common", artUrl: 0 },
  });
  await expect
    .poll(() =>
      endpoint.gmcpMessages.find((message) => message.startsWith("Darkwind.Fishing.Result")),
    )
    .toContain('"session":"fish-1"');
  endpoint.sendGmcp("Darkwind.Fishing.Escaped", {
    session: open.session,
    reason: "timeout",
  });
  await expect(panel).toContainText("Too slow");

  endpoint.sendGmcp("Darkwind.Fishing.Caught", {
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
  });
  await expect(panel).toContainText("Silverfin");
  await expect(panel).toContainText("PRISTINE");
  endpoint.sendGmcp("Darkwind.Fishing.Art", {
    species: "silverfin",
    artUrl: "/assets/brand/darkflow-icon-64.png",
  });
  await expect(panel.getByRole("img", { name: "Silverfin" })).toHaveAttribute(
    "src",
    "/assets/brand/darkflow-icon-64.png",
  );
  await panel.getByRole("button", { name: "Stop fishing" }).click();
  await expect
    .poll(() => endpoint.gmcpMessages)
    .toContain('Darkwind.Fishing.Cancel {"session":"fish-1"}');
  await expect(panel).toHaveCount(0);

  endpoint.sendGmcp("Darkwind.Fishing.Open", { ...open, session: "fish-2" });
  endpoint.sendGmcp("Darkwind.Fishing.End", {
    session: "fish-2",
    reason: "done",
    message: "Fishing finished.",
  });
  await expect(panel).toContainText("Fishing finished.");
});

test("disconnect clears transient interaction surfaces", async ({ page }) => {
  const endpoint = await connect(page);
  endpoint.sendGmcp("Darkwind.Snoop.Open", {
    id: "snoop-disconnect",
    target: "Denian",
    targetRealName: "denian",
    snooper: "Acer",
    startedAt: 1,
  });
  endpoint.sendGmcp("Darkwind.Announcements.State", { unreadCount: 2 });
  endpoint.sendGmcp("Darkwind.Giphy.Show", {
    gifUrl: "/assets/brand/darkflow-icon-64.png",
    talker: "Elyndar",
  });
  endpoint.sendGmcp("Darkwind.Broadcast.Show", { message: "Disconnect test" });
  endpoint.sendGmcp("Darkwind.LinuxRescue.Open", { fullscreen: 0 });
  endpoint.sendGmcp("Darkwind.Fishing.Open", {
    session: "fish-disconnect",
    terrain: "lake",
    skill: 1,
    poleTier: 1,
    baitTier: 1,
    baited: 1,
    sceneArtUrl: 0,
  });
  endpoint.sendGmcp("Darkwind.Fishing.Fight", {
    session: "fish-disconnect",
    seed: 7,
    params: {
      strength: 5,
      erratic: 5,
      stamina: 100,
      barSize: 20,
      progressRate: 1,
      drainRate: 1,
      tensionRise: 1,
      tensionDecay: 1,
      minFightMs: 60_000,
    },
    fish: { tease: "large", rarityHint: "Rare", artUrl: 0 },
  });

  await expect(page.getByRole("dialog", { name: "Snooping: Denian" })).toBeVisible();
  await expect(page.locator(".giphy-overlay.open")).toBeVisible();
  await expect(page.locator(".broadcast-overlay.open")).toBeVisible();
  await expect(page.locator(".linux-rescue-overlay.open")).toBeVisible();
  await expect(page.locator('.fishing-body[data-panel-id="fishing"]')).toBeVisible();
  await expect(page.locator(".toolbar-count-badge")).toContainText("2");

  await page
    .getByRole("button", { name: "Disconnect", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole("dialog", { name: "Snooping: Denian" })).toHaveCount(0);
  await expect(page.locator(".giphy-overlay")).toHaveCount(0);
  await expect(page.locator(".broadcast-overlay")).toHaveCount(0);
  await expect(page.locator(".linux-rescue-overlay")).toHaveCount(0);
  await expect(page.locator('.fishing-body[data-panel-id="fishing"]')).toHaveCount(0);
  await expect(page.locator(".toolbar-count-badge")).toHaveCount(0);
  await page.waitForTimeout(250);
  expect(
    endpoint.gmcpMessages.filter(
      (message) =>
        message.startsWith("Darkwind.Fishing.Result") &&
        message.includes('"session":"fish-disconnect"'),
    ),
  ).toHaveLength(0);
});
