import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TransportFixtureOwner } from "./fixtures/transport-fixtures";

const packageMetadata = JSON.parse(
  readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
) as { version: string };

declare global {
  interface Window {
    __darkflowTerminalViewTest?: { remove(): Promise<void>; restore(): Promise<void> };
    __darkflowTerminalViewTestEnabled?: boolean;
  }
}

let fixtures: TransportFixtureOwner;

test.beforeAll(async () => {
  fixtures = await TransportFixtureOwner.start();
});

test.afterAll(async () => {
  await fixtures.close();
});

async function connect(page: Page): Promise<void> {
  const endpoint = fixtures.endpoints.ws;
  await page.goto("/phase2/");
  await page.getByLabel("Host").fill("127.0.0.1");
  await page.getByLabel("Port").fill(String(endpoint.port));
  await page.getByLabel("Connection protocol").selectOption("ws");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByTestId("connection-status")).toHaveText("Connected");
}

function gmcpPayload(messages: string[], packageName: string): Record<string, unknown> | null {
  const message = [...messages].reverse().find((entry) => entry.startsWith(`${packageName} `));
  return message
    ? (JSON.parse(message.slice(packageName.length + 1)) as Record<string, unknown>)
    : null;
}

async function skipChangedSettingsBackup(dialog: Locator): Promise<void> {
  await dialog
    .getByRole("dialog", { name: "Download changed settings?", exact: true })
    .getByRole("button", { name: "Skip", exact: true })
    .click();
}

test("Phase 2 reports automatic and fixed terminal geometry through NAWS", async ({ page }) => {
  const endpoint = fixtures.endpoints.ws;
  await connect(page);
  await expect
    .poll(() => gmcpPayload(endpoint.gmcpMessages, "Darkwind.Client.NAWS"))
    .not.toBeNull();
  expect(gmcpPayload(endpoint.gmcpMessages, "Core.Hello")).toMatchObject({
    client: "Darkflow",
    version: packageMetadata.version,
  });
  const automatic = gmcpPayload(endpoint.gmcpMessages, "Darkwind.Client.NAWS")!;
  expect(automatic.width).toBeGreaterThanOrEqual(40);
  expect(automatic.height).toBeGreaterThanOrEqual(8);

  const beforeFixed = endpoint.gmcpMessages.length;
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("tab", { name: "Terminal", exact: true }).click();
  await dialog.getByLabel("Terminal width").fill("75");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await skipChangedSettingsBackup(dialog);
  await expect
    .poll(() => gmcpPayload(endpoint.gmcpMessages.slice(beforeFixed), "Darkwind.Client.NAWS"))
    .toMatchObject({ width: 75, height: automatic.height });
  const unchangedCount = endpoint.gmcpMessages.filter((message) =>
    message.startsWith("Darkwind.Client.NAWS "),
  ).length;
  await page.waitForTimeout(250);
  expect(
    endpoint.gmcpMessages.filter((message) => message.startsWith("Darkwind.Client.NAWS ")),
  ).toHaveLength(unchangedCount);

  endpoint.dropConnections();
  await expect(page.getByTestId("connection-status")).toContainText("Retry scheduled");
  await expect(page.getByTestId("connection-status")).toHaveText("Connected", { timeout: 4_000 });
  expect(gmcpPayload(endpoint.gmcpMessages, "Core.Hello")).toMatchObject({
    width: 75,
    height: automatic.height,
  });
  expect(gmcpPayload(endpoint.gmcpMessages, "Darkwind.Client.NAWS")).toMatchObject({
    width: 75,
    height: automatic.height,
  });
});

async function installAutomationDefinitions(page: Page): Promise<void> {
  await page.goto("/phase2/");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("darkflow-session-core-v1") !== null))
    .toBe(true);
  await page.evaluate(() => {
    const key = "darkflow-session-core-v1";
    const graph = JSON.parse(localStorage.getItem(key)!);
    const character = Object.values(graph.characterProfiles)[0] as {
      localDefinitions: Record<string, unknown[]>;
    };
    character.localDefinitions.aliases = [
      {
        id: "alias-look",
        enabled: true,
        trigger: "l",
        description: "Look",
        group: "",
        isRegex: false,
        ignoreCase: true,
        steps: [{ type: "send_command", template: "look" }],
      },
      {
        id: "alias-regex",
        enabled: true,
        trigger: "loom.*",
        description: "Regex look",
        group: "",
        isRegex: true,
        ignoreCase: true,
        steps: [{ type: "send_command", template: "look" }],
      },
      {
        id: "alias-function",
        enabled: true,
        trigger: "fn",
        description: "Function",
        group: "",
        isRegex: false,
        ignoreCase: true,
        steps: [
          { type: "call_function", target: "greet", targetId: "function-greet", template: "" },
        ],
      },
      {
        id: "alias-variable",
        enabled: true,
        trigger: "vars",
        description: "Variables",
        group: "",
        isRegex: false,
        ignoreCase: true,
        steps: [{ type: "send_command", template: "say $gmcp_fixture_ping_ok" }],
      },
      {
        id: "alias-pending-wait",
        enabled: true,
        trigger: "pendingwait",
        description: "Pending wait",
        group: "",
        isRegex: false,
        ignoreCase: true,
        steps: [
          { type: "send_command", template: "wait-started" },
          { type: "wait", seconds: 0.25 },
          { type: "send_command", template: "late-wait" },
        ],
      },
      {
        id: "alias-pending-timer",
        enabled: true,
        trigger: "pendingtimer",
        description: "Pending timer",
        group: "",
        isRegex: false,
        ignoreCase: true,
        steps: [
          {
            type: "set_timer_enabled",
            mode: "enable",
            target: "",
            targetId: "timer-pending",
          },
          {
            type: "control_timer",
            mode: "start",
            target: "",
            targetId: "timer-pending",
          },
        ],
      },
    ];
    character.localDefinitions.triggers = [
      {
        id: "trigger-danger",
        enabled: true,
        pattern: "danger",
        description: "Danger",
        group: "",
        isRegex: false,
        ignoreCase: false,
        gag: true,
        steps: [{ type: "show_message", template: "trigger fired" }],
      },
      {
        id: "trigger-zero-view",
        enabled: true,
        pattern: "zero view trigger",
        description: "Zero-view execution",
        group: "",
        isRegex: false,
        ignoreCase: false,
        gag: false,
        steps: [{ type: "send_command", template: "zero-view-command" }],
      },
    ];
    character.localDefinitions.highlights = [
      {
        id: "highlight-glow",
        enabled: true,
        patternSource: "glow",
        description: "Glow",
        group: "",
        ignoreCase: false,
        style: { fg: "red", bg: "black", bold: true },
      },
    ];
    character.localDefinitions.functions = [
      {
        id: "function-greet",
        enabled: true,
        name: "greet",
        description: "Greet",
        group: "",
        script: "send wave",
      },
    ];
    character.localDefinitions.keyMappings = [
      {
        id: "key-score",
        enabled: true,
        code: "F2",
        label: "F2",
        legacyKey: "",
        command: "score",
      },
      {
        id: "key-east",
        enabled: true,
        code: "ArrowRight",
        label: "Right",
        legacyKey: "",
        command: "east",
      },
    ];
    character.localDefinitions.timers = [
      {
        id: "timer-auto",
        enabled: true,
        name: "auto",
        description: "Auto",
        group: "",
        durationMs: 1000,
        recurring: false,
        autoStart: true,
        steps: [{ type: "send_command", template: "tick" }],
      },
      {
        id: "timer-pending",
        enabled: false,
        name: "pending",
        description: "Pending",
        group: "",
        durationMs: 250,
        recurring: false,
        autoStart: false,
        steps: [{ type: "send_command", template: "late-timer" }],
      },
    ];
    localStorage.setItem(key, JSON.stringify(graph));
  });
  await page.reload();
}

async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

async function dragBy(page: Page, source: Locator, x: number, y: number): Promise<void> {
  const start = await center(source);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + x, start.y + y, { steps: 6 });
  await page.mouse.up();
}

test("Phase 2 renders one session terminal output island", async ({ page }) => {
  const endpoint = fixtures.endpoints.ws;
  await connect(page);
  expect(await page.evaluate(() => typeof window.__darkflowTerminalViewTest)).toBe("undefined");

  // This exercises desktop dock/float/redock; the mobile terminal island is
  // covered by phase2-workspace.
  test.skip(
    (page.viewportSize()?.width ?? Infinity) <= 700,
    "desktop layout-island test; mobile is terminal-centric",
  );
  const output = page.getByLabel("Terminal output", { exact: true });
  const input = page.getByLabel("Command input", { exact: true });
  const identity = await output.getAttribute("data-terminal-identity");
  await expect(output).toContainText(endpoint.prompt);

  endpoint.sendText(
    Array.from({ length: 80 }, (_, index) => `scroll line ${index + 1}\n`).join(""),
  );
  await expect(output).toContainText("scroll line 80");
  await expect
    .poll(() =>
      output.evaluate((element) => ({
        atBottom: element.scrollTop + element.clientHeight >= element.scrollHeight - 5,
        scrollable: element.scrollHeight > element.clientHeight,
      })),
    )
    .toEqual({ atBottom: true, scrollable: true });

  const pause = page.getByRole("button", { name: "Paused", exact: true });
  await pause.click();
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  const pausedScrollTop = await output.evaluate((element) => element.scrollTop);
  endpoint.sendText("received while paused\n");
  await expect(output).toContainText("received while paused");
  await expect.poll(() => output.evaluate((element) => element.scrollTop)).toBe(pausedScrollTop);

  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(pause).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(() =>
      output.evaluate(
        (element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 5,
      ),
    )
    .toBe(true);

  await output.evaluate((element) => (element.scrollTop = 0));
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Live", exact: true }).click();

  endpoint.sendText("\x1b[31mphase two ANSI\x1b[0m\n");
  await expect(output).toContainText("phase two ANSI");
  await expect(output.locator(".ansi-fg-red")).toContainText("phase two ANSI");
  await expect(page.getByTestId("terminal-announcer")).toBeEmpty();

  const beforeLayout = await output.textContent();
  // A rail-local reorder is the layout edit here. Rails are their own root now,
  // so dragging Avatar onto the terminal tab is a separate transfer feature; the
  // point of this step is that a persisted layout edit leaves the island intact.
  await page
    .locator('[data-panel-drag-handle][data-panel-id="status"]')
    .dragTo(page.locator('[data-panel-drag-handle][data-panel-id="avatar"]'));
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");
  await page.setViewportSize({ width: 1_100, height: 720 });
  expect(await output.getAttribute("data-terminal-identity")).toBe(identity);
  expect(await output.textContent()).toBe(beforeLayout);
  await page.locator('[data-panel-drag-handle][data-panel-id="terminal"]').first().click();
  await output.click();
  await expect(input).toBeFocused();

  const selectionBox = await output.locator(".ansi-fg-red").boundingBox();
  expect(selectionBox).not.toBeNull();
  await input.evaluate((element) => element.blur());
  await page.mouse.move(selectionBox!.x + 1, selectionBox!.y + selectionBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    selectionBox!.x + selectionBox!.width - 1,
    selectionBox!.y + selectionBox!.height / 2,
  );
  await page.mouse.up();
  await expect(input).not.toBeFocused();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toContain("phase two ANSI");
  await page.evaluate(() => window.getSelection()?.removeAllRanges());

  const terminalHandle = page.locator('[data-panel-drag-handle][data-panel-id="terminal"]');
  await terminalHandle.locator(".dv-default-tab-content").selectText();
  await output.dispatchEvent("click");
  await expect(input).toBeFocused();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.keyboard.down("Shift");
  await dragBy(page, terminalHandle, 80, 60);
  await page.keyboard.up("Shift");
  const floatingHandle = page.locator('[data-floating-drag-handle][data-panel-id="terminal"]');
  await expect(floatingHandle).toBeVisible();
  expect(await output.getAttribute("data-terminal-identity")).toBe(identity);
  expect(await output.textContent()).toBe(beforeLayout);

  const floatingFrame = floatingHandle.locator("..");
  const beforeResize = await floatingFrame.boundingBox();
  expect(beforeResize).not.toBeNull();
  const resizeHandle = floatingFrame.locator(".dv-resize-handle-bottomright");
  const resizePoint = await center(resizeHandle);
  await resizeHandle.dispatchEvent("pointerdown", {
    clientX: resizePoint.x,
    clientY: resizePoint.y,
    pointerId: 1,
  });
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, pointerId: 1 }));
    window.dispatchEvent(
      new PointerEvent("pointermove", { clientX: x - 40, clientY: y - 30, pointerId: 1 }),
    );
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: x - 40, clientY: y - 30 }));
  }, resizePoint);
  await expect
    .poll(async () => (await floatingFrame.boundingBox())?.width ?? 0)
    .toBeLessThan(beforeResize!.width);
  expect(await output.getAttribute("data-terminal-identity")).toBe(identity);
  expect(await output.textContent()).toBe(beforeLayout);

  // Dock back through the pane control. This used to drag onto the Avatar tab,
  // which is a rail card now rather than a Dockview drop target -- and the
  // control is the affordance a keyboard user actually has.
  await page.getByRole("button", { name: "Dock Terminal", exact: true }).click();
  await expect(floatingHandle).toHaveCount(0);
  await page.locator('[data-panel-drag-handle][data-panel-id="terminal"]').first().click();
  await output.click();
  await expect(input).toBeFocused();
  expect(await output.getAttribute("data-terminal-identity")).toBe(identity);
  expect(await output.textContent()).toBe(beforeLayout);

  endpoint.dropConnections();
  await expect(page.locator("#connect-btn")).toHaveText(/Retrying in \d+s/);
  await expect(page.getByTestId("connection-status")).toHaveText("Connected");
  endpoint.sendText("delivered after reconnect\n");
  await expect(output).toContainText("delivered after reconnect");
  expect(await output.getAttribute("data-terminal-identity")).toBe(identity);

  await page.getByRole("button", { name: "Clear", exact: true }).click({ force: true });
  await expect(output).toBeEmpty();
  await page.locator('[data-panel-drag-handle][data-panel-id="terminal"]').first().click();
  await output.click();
  await expect(input).toBeFocused();
  expect(await output.getAttribute("data-terminal-identity")).toBe(identity);

  await page.evaluate(() => {
    (
      window as unknown as { __darkflowPhase1Runtime: { session: { dispose(): void } } }
    ).__darkflowPhase1Runtime.session.dispose();
  });
  await expect(page.locator('[data-workspace-owned="true"]')).toHaveCount(0);
  endpoint.sendText("late output after disposal\n");
  await expect(page.locator("[data-terminal-identity]")).toHaveCount(0);
});

test("Phase 2 terminal input sends once and recalls character history", async ({
  page,
}, testInfo) => {
  const endpoint = fixtures.endpoints.ws;
  await connect(page);

  const input = page.getByLabel("Command input", { exact: true });
  if (testInfo.project.name === "mobile-chromium") {
    await input.tap();
    await expect(input).toBeFocused();
  }
  await input.fill("look");
  if (testInfo.project.name === "mobile-chromium") {
    await page.getByRole("button", { name: "Send", exact: true }).tap();
  } else {
    await input.press("Enter");
  }
  await expect.poll(() => endpoint.commands.filter((command) => command === "look").length).toBe(1);
  await expect(page.getByLabel("Terminal output", { exact: true })).toContainText("> look");

  await input.press("ArrowUp");
  await expect(input).toHaveValue("look");

  await page.getByTestId("phase2-shell").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("x");
  await expect(input).toBeFocused();
  await input.evaluate((element) => element.blur());
  await page.keyboard.press("Escape");
  await expect(input).toHaveValue("");
});

test("Phase 2 alias completion excludes regex aliases", async ({ page }) => {
  const endpoint = fixtures.endpoints.ws;
  await installAutomationDefinitions(page);
  await connect(page);
  const input = page.getByLabel("Command input", { exact: true });
  const request = 'Darkwind.Completion.Request {"line":"loo","cursor":3}';
  const requestsBefore = endpoint.gmcpMessages.filter((message) => message === request).length;

  await input.fill("loo");
  await input.press("Tab");

  await expect(input).toHaveValue("loo");
  await expect
    .poll(() => endpoint.gmcpMessages.filter((message) => message === request).length)
    .toBe(requestsBefore + 1);
});

test("Phase 2 executes effective definitions and session variables", async ({ page }) => {
  const endpoint = fixtures.endpoints.ws;
  await installAutomationDefinitions(page);
  await page.getByLabel("Host").fill("127.0.0.1");
  await page.getByLabel("Port").fill(String(endpoint.port));
  await page.getByLabel("Connection protocol").selectOption("ws");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByTestId("connection-status")).toHaveText("Connected");

  const input = page.getByLabel("Command input", { exact: true });
  for (const command of ["l", "fn", "vars"]) {
    await input.fill(command);
    await input.press("Enter");
  }
  await input.press("F2");
  await expect
    .poll(() => endpoint.commands.filter((command) => command === "score"))
    .toHaveLength(1);
  await input.evaluate((element) => element.blur());
  await page.keyboard.press("F2");
  await page.keyboard.press("F2");
  await expect
    .poll(() => endpoint.commands)
    .toEqual(expect.arrayContaining(["look", "wave", "say true", "tick"]));
  expect(endpoint.commands.filter((command) => command === "score")).toHaveLength(3);

  await page.getByRole("button", { name: "Float Avatar", exact: true }).click();
  const floatingAvatarTab = page.locator('.dv-tab:has([data-panel-id="avatar"])');
  await floatingAvatarTab.click();
  await expect(floatingAvatarTab).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => endpoint.commands.filter((command) => command === "east"))
    .toHaveLength(2);
  await expect(floatingAvatarTab).toBeFocused();

  await input.fill("look sw");
  await input.press("Tab");
  await expect
    .poll(() => endpoint.gmcpMessages)
    .toContain('Darkwind.Completion.Request {"line":"look sw","cursor":7}');
  endpoint.sendGmcp("Darkwind.Completion.Result", {
    line: "look sword ",
    cursor: 11,
    matches: ["sword"],
    ambiguous: 0,
  });
  await expect(input).toHaveValue("look sword ");

  endpoint.sendText("dan");
  endpoint.sendText("ger\nplain gl");
  endpoint.sendText("ow\n");
  const output = page.getByLabel("Terminal output", { exact: true });
  await expect(output).toContainText("trigger fired");
  await expect(output).not.toContainText("danger");
  await expect(output.locator(".ansi-fg-red")).toContainText("glow");
});

test("Phase 2 applies emoji and split scrollback settings to the mounted terminal", async ({
  page,
}) => {
  const endpoint = fixtures.endpoints.ws;
  await connect(page);
  const input = page.getByLabel("Command input", { exact: true });
  await input.fill("say :smi");
  const picker = page.locator("#emoji-picker");
  await expect(picker).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Tab");
  await expect(input).toHaveValue("say \u{1f603} ");
  await input.fill("say :smile:");
  await expect(input).toHaveValue("say \u{1f604}");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("tab", { name: "Terminal", exact: true }).click();
  await dialog.getByLabel("Scrollback behavior").selectOption("split");
  await dialog.getByRole("button", { name: "Save" }).click();
  await skipChangedSettingsBackup(dialog);

  const output = page.getByLabel("Terminal output", { exact: true });
  endpoint.sendText(Array.from({ length: 80 }, (_, index) => `split line ${index}\n`).join(""));
  await expect(output).toContainText("split line 79");
  await output.hover();
  await page.mouse.wheel(0, -300);
  await expect(page.getByLabel("Scrollback history", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Live output", { exact: true })).toBeVisible();
  await expect(output).toBeHidden();
  const historyOutput = page.getByLabel("Scrollback history", { exact: true });
  const liveOutput = page.getByLabel("Live output", { exact: true });
  await expect
    .poll(() => historyOutput.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await input.evaluate((element) => element.blur());
  await historyOutput.click();
  await expect(input).toBeFocused();
  await input.evaluate((element) => element.blur());
  await liveOutput.click();
  await expect(input).toBeFocused();
  const divider = page.getByRole("separator", { name: "Resize terminal history" });
  await input.evaluate((element) => element.blur());
  await divider.click();
  await expect(input).not.toBeFocused();
  await expect
    .poll(() => divider.evaluate((element) => getComputedStyle(element).backgroundImage))
    .not.toBe("none");
  const shellBox = await page.locator(".terminal-output-shell").boundingBox();
  const dividerBox = await divider.boundingBox();
  expect(shellBox).not.toBeNull();
  expect(dividerBox).not.toBeNull();
  const targetY = shellBox!.y + shellBox!.height * 0.72;
  const expectedRatio = Math.max(
    0.2,
    Math.min(0.8, (targetY - shellBox!.y) / (shellBox!.height - 10)),
  );
  await page.mouse.move(
    dividerBox!.x + dividerBox!.width / 2,
    dividerBox!.y + dividerBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(dividerBox!.x + dividerBox!.width / 2, targetY);
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("darkwind-client-settings")!).scrollbackSplitRatio,
      ),
    )
    .toBeCloseTo(expectedRatio, 2);
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(input).not.toBeFocused();
  await expect(output).toBeVisible();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await dialog.getByRole("tab", { name: "Controls", exact: true }).click();
  await dialog.getByLabel("Show emoji picker").uncheck();
  await dialog.getByRole("button", { name: "Save" }).click();
  await skipChangedSettingsBackup(dialog);
  await input.fill("say :smile:");
  await expect(picker).toBeHidden();
  await expect(input).toHaveValue("say :smile:");
});

test("Phase 2 processes output without Terminal and hydrates remount silently", async ({
  page,
}, testInfo) => {
  const endpoint = fixtures.endpoints.ws;
  await page.addInitScript(() => {
    window.__darkflowTerminalViewTestEnabled = true;
  });
  await installAutomationDefinitions(page);
  await page.getByLabel("Host").fill("127.0.0.1");
  await page.getByLabel("Port").fill(String(endpoint.port));
  await page.getByLabel("Connection protocol").selectOption("ws");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByTestId("connection-status")).toHaveText("Connected");
  await page.waitForTimeout(100);
  const persistedWorkspaceBefore = await page.evaluate(() =>
    localStorage.getItem("darkflow-session-core-v1"),
  );

  await page.evaluate(() => window.__darkflowTerminalViewTest!.remove());
  await expect(page.getByLabel("Terminal output", { exact: true })).toHaveCount(0);
  endpoint.sendText("\n\x1b[31mzero view trigger\x1b[0m\npending prompt");
  await expect
    .poll(() => endpoint.commands.filter((command) => command === "zero-view-command").length)
    .toBe(1);
  await expect.poll(() => endpoint.commands.filter((command) => command === "tick").length).toBe(1);

  await page.evaluate(() => window.__darkflowTerminalViewTest!.restore());
  const output = page.getByLabel("Terminal output", { exact: true });
  await expect(output).toContainText("zero view trigger");
  await expect(output).toContainText("pending prompt");
  await expect(output.locator(".ansi-fg-red")).toContainText("zero view trigger");
  await expect(page.getByTestId("terminal-announcer")).toBeEmpty();

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("tab", { name: "Terminal", exact: true }).click();
  await page.getByLabel("Screen reader announcements").check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await skipChangedSettingsBackup(page.getByRole("dialog", { name: "Settings" }));

  endpoint.sendText(" announced live\n");
  await expect(output).toContainText("pending prompt announced live");
  await expect(page.getByTestId("terminal-announcer")).toContainText("announced live");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("tab", { name: "Terminal", exact: true }).click();
  await page.getByLabel("Screen reader announcements").uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await skipChangedSettingsBackup(page.getByRole("dialog", { name: "Settings" }));
  await expect(page.getByTestId("terminal-announcer")).toBeEmpty();
  endpoint.sendText(" silent live\n");
  await expect(output).toContainText("silent live");
  await expect(page.getByTestId("terminal-announcer")).toBeEmpty();
  expect(endpoint.commands.filter((command) => command === "zero-view-command")).toHaveLength(1);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => localStorage.getItem("darkflow-session-core-v1"))).toBe(
    persistedWorkspaceBefore,
  );
  if (["chromium", "mobile-chromium"].includes(testInfo.project.name)) {
    await page.screenshot({
      path: `/private/tmp/darkflow-terminal-remount-${testInfo.project.name}.png`,
      fullPage: true,
    });
  }
});

test("Phase 2 disposal cancels pending terminal work and rejects late events", async ({ page }) => {
  const endpoint = fixtures.endpoints.ws;
  await installAutomationDefinitions(page);
  await page.getByLabel("Host").fill("127.0.0.1");
  await page.getByLabel("Port").fill(String(endpoint.port));
  await page.getByLabel("Connection protocol").selectOption("ws");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByTestId("connection-status")).toHaveText("Connected");

  const input = page.getByLabel("Command input", { exact: true });
  for (const command of ["pendingwait", "pendingtimer"]) {
    await input.fill(command);
    await input.press("Enter");
  }
  await expect.poll(() => endpoint.commands).toContain("wait-started");

  await input.fill("completion-with-no-match");
  await input.press("Tab");
  await input.fill("");
  await input.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.setData("text", "batch-first\nlate-batch");
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: transfer });
    element.dispatchEvent(paste);
  });
  const batch = page.getByRole("dialog", { name: "Multiline command input" });
  await expect(batch).toBeVisible();
  await batch.getByRole("button", { name: "Send batch", exact: true }).click();
  await expect.poll(() => endpoint.commands).toContain("batch-first");

  endpoint.sendText("queued render before disposal\n");
  await page.evaluate(() => {
    const session = (
      window as unknown as { __darkflowPhase1Runtime: { session: { dispose(): void } } }
    ).__darkflowPhase1Runtime.session;
    session.dispose();
    session.dispose();
  });
  await expect(page.locator('[data-workspace-owned="true"]')).toHaveCount(0);

  endpoint.sendText("late output after disposal\n");
  await page.waitForTimeout(350);
  expect(endpoint.commands).not.toContain("late-batch");
  expect(endpoint.commands).not.toContain("late-wait");
  expect(endpoint.commands).not.toContain("late-timer");
  await expect(page.locator("[data-terminal-identity]")).toHaveCount(0);
});
