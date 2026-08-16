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

async function deferAudioUnlock(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as unknown as {
      __darkflowPhase1Runtime: {
        session: { audio: { unlock(): Promise<boolean> } };
      };
      __resolveDeferredAudioUnlock?: () => void;
    };
    const audio = target.__darkflowPhase1Runtime.session.audio;
    const original = audio.unlock;
    let resolve!: (value: boolean) => void;
    audio.unlock = () => new Promise<boolean>((next) => (resolve = next));
    target.__resolveDeferredAudioUnlock = () => {
      audio.unlock = original;
      resolve(true);
      delete target.__resolveDeferredAudioUnlock;
    };
  });
}

async function resolveAudioUnlock(page: Page): Promise<void> {
  await page.evaluate(() => {
    const resolve = (window as unknown as { __resolveDeferredAudioUnlock?: () => void })
      .__resolveDeferredAudioUnlock;
    if (!resolve) throw new Error("Deferred audio unlock resolver is missing");
    resolve();
  });
}

test("mentions notify only for rendered lines and navigate through the terminal", async ({
  page,
}) => {
  const endpoint = await connect(page);
  const output = page.getByLabel("Terminal output", { exact: true });
  const notifications = page.getByRole("button", { name: "Notifications", exact: true });
  const notificationBadge = page.locator(".notification-toolbar-wrap .toolbar-count-badge");

  endpoint.sendGmcp("Char.Status", { name: "Nacho" });
  endpoint.sendGmcp("Comm.Channel", {
    channel: "gossip",
    talker: "Alice",
    text: "gagged mention @Nacho",
  });
  endpoint.sendText("mention sync marker\n");
  await expect(output).toContainText("mention sync marker");
  await expect(notificationBadge).toHaveCount(0);

  endpoint.sendText(
    Array.from({ length: 70 }, (_, index) => `before mention ${index + 1}\n`).join(""),
  );
  endpoint.sendText("[gossip] Alice: rendered hello @Nacho\n");
  await expect(output).toContainText("rendered hello @Nacho");
  const mention = {
    channel: "gossip",
    talker: "Alice",
    text: "rendered hello @Nacho",
  };
  endpoint.sendGmcp("Comm.Channel", mention);
  endpoint.sendGmcp("Comm.Channel.Text", mention);
  endpoint.sendText(
    Array.from({ length: 35 }, (_, index) => `after mention ${index + 1}\n`).join(""),
  );

  await expect(notificationBadge).toHaveText("1");
  await notifications.click();
  const menu = page.getByRole("dialog", { name: "Notifications" });
  const row = menu.locator(".notification-row");
  await expect(row).toHaveCount(1);
  await expect(row).toHaveClass(/unread/);
  await expect(row).toContainText("[gossip]");
  await expect(row).toContainText("Alice");
  await expect(row).toContainText("rendered hello @Nacho");

  await row.click();
  await expect(notifications).toHaveAttribute("aria-expanded", "false");
  await expect(output).toBeFocused();
  await expect(page.locator('[data-action="pause"]')).toHaveAttribute("aria-pressed", "true");
  const target = output.locator(".output-line-mention-target");
  await expect(target).toContainText("rendered hello @Nacho");
  const targetRatio = await target.evaluate((line) => {
    const output = line.parentElement!;
    return (
      (line.getBoundingClientRect().top - output.getBoundingClientRect().top) / output.clientHeight
    );
  });
  expect(targetRatio).toBeGreaterThan(0.2);
  expect(targetRatio).toBeLessThan(0.5);

  await page.locator('.terminal-output-shell [data-action="clear"]').click();
  await notifications.click();
  await expect(row).toHaveClass(/expired/);
  await expect(row).toContainText("Terminal line no longer in scrollback.");

  await page.evaluate(() => {
    (
      window as unknown as {
        __darkflowPhase1Runtime: {
          session: {
            notifications: {
              recordOutputLine: (line: { id: number; text: string }) => void;
            };
          };
        };
      }
    ).__darkflowPhase1Runtime.session.notifications.recordOutputLine({
      id: 999_999,
      text: "orphan hello @Nacho",
    });
  });
  endpoint.sendGmcp("Comm.Channel.Text", {
    channel: "gossip",
    talker: "Orphan",
    text: "orphan hello @Nacho",
  });
  const orphanRow = menu.locator(".notification-row", { hasText: "orphan hello @Nacho" });
  await expect(orphanRow).not.toHaveClass(/expired/);
  await orphanRow.click();
  await expect(notifications).toHaveAttribute("aria-expanded", "true");
  await expect(orphanRow).toHaveClass(/expired/);

  await menu.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(menu.locator(".notification-row")).toHaveCount(0);

  endpoint.sendText("[gossip] Bob: second hello @Nacho\n");
  await expect(output).toContainText("second hello @Nacho");
  endpoint.sendGmcp("Comm.Channel.Text", {
    channel: "gossip",
    talker: "Bob",
    text: "second hello @Nacho",
  });
  await expect(menu.locator(".notification-row")).toHaveCount(1);
  await expect(notificationBadge).toHaveText("1");
  await menu.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(menu.locator(".notification-row")).toHaveCount(0);
  await expect(notificationBadge).toHaveCount(0);

  await notifications.press("Escape");
  await expect(notifications).toHaveAttribute("aria-expanded", "false");
  await expect(notifications).toBeFocused();
  await notifications.click();
  const host = page.getByLabel("Host");
  await host.focus();
  await host.dispatchEvent("pointerdown");
  await expect(notifications).toHaveAttribute("aria-expanded", "false");
  await expect(host).toBeFocused();

  const commandInput = page.getByRole("textbox", { name: "Command input", exact: true });
  const commandsBeforeMention = endpoint.commands.length;
  const gmcpBeforeMention = endpoint.gmcpMessages.length;
  await commandInput.fill("gossip @A");
  await expect
    .poll(() =>
      endpoint.gmcpMessages
        .slice(gmcpBeforeMention)
        .filter((message) => message.startsWith("Comm.Channel.Players")),
    )
    .toEqual(["Comm.Channel.Players {}"]);
  endpoint.sendGmcp("Comm.Channel.Players", [
    { name: "alice", displayName: "Alice", channels: ["gossip"] },
  ]);
  await expect(page.getByRole("option", { name: /@Alice gossip/ })).toBeVisible();
  await commandInput.press("Tab");
  await expect(commandInput).toHaveValue("gossip @Alice ");
  expect(endpoint.commands.length).toBe(commandsBeforeMention);
});

test("audio controls follow support, settings, activity, disposal, and remount", async ({
  page,
}) => {
  await page.route("**/assets/sounds/**", (route) => route.abort());
  const endpoint = await connect(page);
  const audioRoot = page.locator("#audio-widget-root");
  await expect(audioRoot).toBeHidden();

  endpoint.sendGmcp("Core.Supports.Add", ["Darkwind.Sound 1"]);
  await expect(audioRoot).toBeVisible();

  endpoint.sendGmcp("Char.Status", { name: "Nacho" });
  const output = page.getByLabel("Terminal output", { exact: true });
  endpoint.sendText("[gossip] Alice: audio focus @Nacho\n");
  await expect(output).toContainText("audio focus @Nacho");
  endpoint.sendGmcp("Comm.Channel.Text", {
    channel: "gossip",
    talker: "Alice",
    text: "audio focus @Nacho",
  });
  const notifications = page.getByRole("button", { name: "Notifications", exact: true });
  await expect(page.locator(".notification-toolbar-wrap .toolbar-count-badge")).toHaveText("1");
  await notifications.click();
  await page.locator(".notification-row").click();
  const pause = page.locator('[data-action="pause"]');
  const mentionTarget = output.locator(".output-line-mention-target");
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  await expect(mentionTarget).toContainText("audio focus @Nacho");

  const indicator = page.getByTitle("Audio controls");
  const controls = page.locator(".sound-widget-expanded");

  await deferAudioUnlock(page);
  await indicator.click();
  await page.getByLabel("Host").click();
  await resolveAudioUnlock(page);
  await expect(controls).toBeHidden();

  await deferAudioUnlock(page);
  await indicator.click();
  await indicator.press("Escape");
  await resolveAudioUnlock(page);
  await expect(controls).toBeHidden();
  await expect(indicator).toBeFocused();

  await indicator.click();
  await expect(controls).toBeVisible();
  await expect(page.locator(".sound-widget")).not.toHaveClass(/locked/);

  const volume = controls.locator('input[type="range"]');
  await volume.focus();
  await volume.press("Escape");
  await expect(controls).toBeHidden();
  await expect(indicator).toBeFocused();
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  await expect(mentionTarget).toContainText("audio focus @Nacho");
  await indicator.click();
  await expect(controls).toBeVisible();

  if (page.viewportSize()?.width === 390) {
    const box = await controls.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  }

  const mute = page.getByRole("button", { name: "Toggle audio" });
  await mute.click();
  await expect(page.locator(".sound-widget")).toHaveClass(/muted/);
  await expect(indicator).toContainText("Muted");
  await mute.click();

  await volume.fill("35");
  await expect(controls.locator(".sound-widget-volume-value")).toHaveText("35%");
  const categoryButtons = controls.locator(".sound-widget-category");
  await expect(categoryButtons).toHaveCount(11);
  const alertCategory = controls.getByRole("button", { name: "Alert" });
  await alertCategory.click();
  await expect(alertCategory).toHaveAttribute("aria-pressed", "false");
  await alertCategory.click();
  await expect(alertCategory).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const value = localStorage.getItem("darkwind-sound-settings");
        return value ? JSON.parse(value) : null;
      }),
    )
    .toMatchObject({ enabled: true, volume: 0.35, categoryEnabled: { alert: true } });

  endpoint.sendGmcp("Darkwind.Sound", {
    type: "play",
    category: "alert",
    sound: "ping",
  });
  await expect(page.locator(".sound-widget")).toHaveClass(/active/);
  await expect(indicator).toContainText("Alert");
  endpoint.sendGmcp("Darkwind.Sound", {
    type: "loop",
    category: "ambient",
    sound: "rain",
    id: "fixture-rain",
  });
  await expect(indicator).toContainText("Ambient");
  endpoint.sendGmcp("Darkwind.Sound", {
    type: "stop",
    category: "ambient",
    id: "fixture-rain",
  });
  await expect(page.locator(".sound-widget")).not.toHaveClass(/active/);
  await expect(indicator).toContainText("Ready");

  endpoint.sendGmcp("Core.Supports.Remove", ["Darkwind.Sound 1"]);
  await expect(audioRoot).toBeHidden();
  await expect(controls).toBeHidden();

  await page.evaluate(() => {
    (
      window as unknown as { __darkflowPhase1Runtime: { session: { dispose(): void } } }
    ).__darkflowPhase1Runtime.session.dispose();
  });
  await expect(page.locator("#audio-widget-root")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toHaveCount(0);

  const remountedEndpoint = await connect(page);
  await expect(page.locator("#audio-widget-root")).toHaveCount(1);
  await expect(page.locator("#audio-widget-root")).toBeHidden();
  remountedEndpoint.sendGmcp("Core.Supports.Add", ["Darkwind.Sound 1"]);
  await expect(page.locator("#audio-widget-root")).toBeVisible();
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toHaveCount(1);
});

test("fishing routes retained local audio through the public session capability", async ({
  page,
}) => {
  let endpoint = await connect(page);
  const installRecorder = () =>
    page.evaluate(() => {
      type AudioCall = [string, ...unknown[]];
      const target = window as unknown as {
        __darkflowPhase1Runtime: {
          session: {
            audio: {
              playLocal(category: string, sound: string, volume?: number): boolean;
              loopLocal(category: string, sound: string, id: string, volume?: number): boolean;
              stopLocal(category: string, id?: string): boolean;
            };
          };
        };
        __fishingAudioCalls?: AudioCall[];
      };
      const calls: AudioCall[] = [];
      const audio = target.__darkflowPhase1Runtime.session.audio;
      audio.playLocal = (...args) => {
        calls.push(["playLocal", ...args]);
        return true;
      };
      audio.loopLocal = (...args) => {
        calls.push(["loopLocal", ...args]);
        return true;
      };
      audio.stopLocal = (...args) => {
        calls.push(["stopLocal", ...args]);
        return true;
      };
      target.__fishingAudioCalls = calls;
    });
  const readCalls = () =>
    page.evaluate(
      () =>
        (window as unknown as { __fishingAudioCalls?: Array<[string, ...unknown[]]> })
          .__fishingAudioCalls ?? [],
    );
  let expected: Array<[string, ...unknown[]]> = [];
  const expectAudio = async (...calls: Array<[string, ...unknown[]]>) => {
    expected.push(...calls);
    await expect.poll(readCalls).toEqual(expected);
  };
  const open = (session: string) => ({
    session,
    terrain: "lake",
    skill: 250,
    poleTier: 1,
    baitTier: 2,
    baited: 1,
    sceneArtUrl: 0,
  });
  const fight = (session: string) => ({
    session,
    seed: 1,
    params: {
      strength: 0,
      erratic: 0,
      stamina: 1000,
      barSize: 100,
      progressRate: 0,
      drainRate: 0,
      tensionRise: 100,
      tensionDecay: 200,
      minFightMs: 60_000,
    },
    fish: { tease: "large", rarityHint: "Rare", artUrl: 0 },
  });

  await installRecorder();
  endpoint.sendGmcp("Darkwind.Fishing.Open", open("fish-audio"));
  let panel = page.locator('.fishing-body[data-panel-id="fishing"]');
  const cast = panel.getByRole("button", { name: "Hold to Cast" });
  await expect(cast).toBeVisible();
  await cast.press("Space");
  await expectAudio(["playLocal", "fishing", "cast"]);

  endpoint.sendGmcp("Darkwind.Fishing.Bite", {
    session: "fish-audio",
    windowMs: 10_000,
    tease: "large",
  });
  await expectAudio(["playLocal", "fishing", "splash"]);
  await panel.getByRole("button", { name: "Hook fish" }).click();
  await expectAudio(["playLocal", "fishing", "hook"]);

  endpoint.sendGmcp("Darkwind.Fishing.Fight", fight("fish-audio"));
  await expectAudio(["loopLocal", "fishing", "reel", "fishing-reel", 0.6]);
  const gameControl = panel.getByRole("button", { name: /Hold to reel/ });
  const tension = panel.getByRole("progressbar", { name: "Line tension" });
  await gameControl.focus();
  await page.keyboard.down("Space");
  await expect
    .poll(async () => Number(await tension.getAttribute("aria-valuenow")))
    .toBeGreaterThan(85);
  await expectAudio(["playLocal", "fishing", "tension"]);
  await page.keyboard.up("Space");
  await expect
    .poll(async () => Number(await tension.getAttribute("aria-valuenow")))
    .toBeLessThan(70);
  await page.keyboard.down("Space");
  await expect
    .poll(async () => Number(await tension.getAttribute("aria-valuenow")))
    .toBeGreaterThan(85);
  await expectAudio(["playLocal", "fishing", "tension"]);
  await page.keyboard.up("Space");

  endpoint.sendGmcp("Darkwind.Fishing.Caught", {
    session: "fish-audio",
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
    rewards: { skillup: 0, newSkill: 250 },
  });
  await expectAudio(
    ["stopLocal", "fishing", "fishing-reel"],
    ["playLocal", "fishing", "catch"],
    ["playLocal", "fishing", "pristine"],
  );

  endpoint.sendGmcp("Darkwind.Fishing.Open", open("fish-replaced"));
  endpoint.sendGmcp("Darkwind.Fishing.Fight", fight("fish-replaced"));
  await expectAudio(["loopLocal", "fishing", "reel", "fishing-reel", 0.6]);
  endpoint.sendGmcp("Darkwind.Fishing.Open", open("fish-snap"));
  await expectAudio(["stopLocal", "fishing", "fishing-reel"]);
  endpoint.sendGmcp("Darkwind.Fishing.Fight", fight("fish-snap"));
  await expectAudio(["loopLocal", "fishing", "reel", "fishing-reel", 0.6]);
  endpoint.sendGmcp("Darkwind.Fishing.Escaped", { session: "fish-snap", reason: "snap" });
  await expectAudio(["stopLocal", "fishing", "fishing-reel"], ["playLocal", "fishing", "snap"]);

  endpoint.sendGmcp("Darkwind.Fishing.Open", open("fish-slack"));
  endpoint.sendGmcp("Darkwind.Fishing.Fight", fight("fish-slack"));
  await expectAudio(["loopLocal", "fishing", "reel", "fishing-reel", 0.6]);
  endpoint.sendGmcp("Darkwind.Fishing.Escaped", { session: "fish-slack", reason: "timeout" });
  await expectAudio(["stopLocal", "fishing", "fishing-reel"], ["playLocal", "fishing", "slack"]);

  endpoint.sendGmcp("Darkwind.Fishing.Open", open("fish-end"));
  endpoint.sendGmcp("Darkwind.Fishing.Fight", fight("fish-end"));
  await expectAudio(["loopLocal", "fishing", "reel", "fishing-reel", 0.6]);
  endpoint.sendGmcp("Darkwind.Fishing.End", {
    session: "fish-end",
    reason: "done",
    message: "Finished.",
  });
  await expectAudio(["stopLocal", "fishing", "fishing-reel"]);

  endpoint.sendGmcp("Darkwind.Fishing.Open", open("fish-reset"));
  endpoint.sendGmcp("Darkwind.Fishing.Fight", fight("fish-reset"));
  await expectAudio(["loopLocal", "fishing", "reel", "fishing-reel", 0.6]);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Reset workspace", exact: true }).click();
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expectAudio(["stopLocal", "fishing", "fishing-reel"]);

  endpoint.sendGmcp("Darkwind.Fishing.Open", open("fish-disconnect-audio"));
  panel = page.locator('.fishing-body[data-panel-id="fishing"]');
  await expect(panel).toBeVisible();
  endpoint.sendGmcp("Darkwind.Fishing.Fight", fight("fish-disconnect-audio"));
  await expectAudio(["loopLocal", "fishing", "reel", "fishing-reel", 0.6]);
  await page
    .getByRole("button", { name: "Disconnect", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expectAudio(["stopLocal", "fishing", "fishing-reel"]);
  const disconnectedCalls = await readCalls();
  await page.waitForTimeout(250);
  expect(await readCalls()).toEqual(disconnectedCalls);
  expect(
    endpoint.gmcpMessages.filter(
      (message) =>
        message.startsWith("Darkwind.Fishing.Result") &&
        message.includes('"session":"fish-disconnect-audio"'),
    ),
  ).toHaveLength(0);

  endpoint = await connect(page);
  expected = [];
  await installRecorder();
  endpoint.sendGmcp("Darkwind.Fishing.Open", open("fish-dispose-audio"));
  await expect(page.locator('.fishing-body[data-panel-id="fishing"]')).toBeVisible();
  endpoint.sendGmcp("Darkwind.Fishing.Fight", fight("fish-dispose-audio"));
  await expectAudio(["loopLocal", "fishing", "reel", "fishing-reel", 0.6]);
  await page.evaluate(() => {
    (
      window as unknown as { __darkflowPhase1Runtime: { session: { dispose(): void } } }
    ).__darkflowPhase1Runtime.session.dispose();
  });
  await expectAudio(["stopLocal", "fishing", "fishing-reel"]);
  const disposedCalls = await readCalls();
  await page.waitForTimeout(250);
  expect(await readCalls()).toEqual(disposedCalls);
  expect(
    endpoint.gmcpMessages.filter(
      (message) =>
        message.startsWith("Darkwind.Fishing.Result") &&
        message.includes('"session":"fish-dispose-audio"'),
    ),
  ).toHaveLength(0);
});
