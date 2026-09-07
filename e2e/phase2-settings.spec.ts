import { expect, test, type Page } from "@playwright/test";
import { TransportFixtureOwner } from "./fixtures/transport-fixtures";

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

async function installDirectDefinitions(page: Page): Promise<void> {
  await page.goto("/phase2/");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("darkflow-session-core-v1") !== null))
    .toBe(true);
  await page.evaluate(() => {
    const key = "darkflow-session-core-v1";
    const graph = JSON.parse(localStorage.getItem(key)!);
    const character = Object.values(graph.characterProfiles)[0] as {
      configSetRefs: Record<string, string[]>;
      localDefinitions: Record<string, unknown[]>;
    };
    character.localDefinitions.aliases = [
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
        id: "alias-shared-function",
        enabled: true,
        trigger: "sharedfn",
        description: "Shared function",
        group: "",
        isRegex: false,
        ignoreCase: true,
        steps: [
          {
            type: "call_function",
            target: "sharedGreet",
            targetId: "function-shared",
            template: "",
          },
        ],
      },
    ];
    character.localDefinitions.keyMappings = [
      {
        id: "key-local",
        enabled: true,
        code: "F2",
        label: "F2",
        legacyKey: "",
        command: "score",
      },
    ];
    character.localDefinitions.highlights = [
      {
        id: "highlight-local",
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

    const keySetId = crypto.randomUUID();
    const highlightSetId = crypto.randomUUID();
    const functionSetId = crypto.randomUUID();
    character.configSetRefs.keyMappings = [keySetId];
    character.configSetRefs.highlights = [highlightSetId];
    character.configSetRefs.functions = [functionSetId];
    graph.configurationSets[keySetId] = {
      id: keySetId,
      label: "Shared keys",
      kind: "keyMappings",
      revision: 1,
      definitions: [
        {
          id: "key-shared",
          enabled: true,
          code: "F3",
          label: "F3",
          legacyKey: "",
          command: "shared-before",
        },
      ],
    };
    graph.configurationSets[highlightSetId] = {
      id: highlightSetId,
      label: "Shared highlights",
      kind: "highlights",
      revision: 1,
      definitions: [
        {
          id: "highlight-shared",
          enabled: true,
          patternSource: "shimmer",
          description: "Shimmer",
          group: "",
          ignoreCase: false,
          style: { fg: "green", bg: "black", bold: false },
        },
      ],
    };
    graph.configurationSets[functionSetId] = {
      id: functionSetId,
      label: "Shared functions",
      kind: "functions",
      revision: 1,
      definitions: [
        {
          id: "function-shared",
          enabled: true,
          name: "sharedGreet",
          description: "Shared greet",
          group: "",
          script: "send shared-before",
        },
      ],
    };
    localStorage.setItem(key, JSON.stringify(graph));
  });
  await page.reload();
}

async function installAutomationDefinitions(page: Page): Promise<void> {
  await installDirectDefinitions(page);
  await page.evaluate(() => {
    const key = "darkflow-session-core-v1";
    const graph = JSON.parse(localStorage.getItem(key)!);
    const character = Object.values(graph.characterProfiles)[0] as {
      configSetRefs: Record<string, string[]>;
      localDefinitions: Record<string, unknown[]>;
    };
    character.localDefinitions.aliases.push(
      {
        id: "alias-local",
        enabled: true,
        trigger: "quick",
        description: "Quick command",
        group: "",
        isRegex: false,
        ignoreCase: true,
        steps: [{ type: "send_command", template: "look" }],
      },
      {
        id: "alias-all-steps",
        enabled: false,
        trigger: "allsteps",
        description: "All step shapes",
        group: "",
        isRegex: false,
        ignoreCase: true,
        steps: [
          { type: "send_command", template: "look" },
          { type: "set_variable", name: "target", template: "orc" },
          { type: "show_message", template: "hello" },
          { type: "script", script: "send score" },
          { type: "wait", seconds: 0.01 },
          { type: "set_alias_enabled", mode: "toggle", target: "quick", targetId: "alias-local" },
          {
            type: "set_trigger_enabled",
            mode: "enable",
            target: "danger",
            targetId: "trigger-local",
          },
          { type: "set_timer_enabled", mode: "disable", target: "pulse", targetId: "timer-local" },
          { type: "control_timer", mode: "run", target: "pulse", targetId: "timer-local" },
          { type: "play_sound", category: "notification", sound: "bell", volume: 0.5 },
          { type: "run_alias", template: "quick" },
          { type: "call_function", target: "greet", targetId: "function-greet", template: "" },
        ],
      },
    );
    character.localDefinitions.triggers = [
      {
        id: "trigger-local",
        enabled: true,
        pattern: "danger",
        description: "Danger",
        group: "",
        isRegex: false,
        ignoreCase: false,
        gag: true,
        steps: [{ type: "send_command", template: "flee" }],
      },
    ];
    character.localDefinitions.timers = [
      {
        id: "timer-local",
        enabled: true,
        name: "pulse",
        description: "Pulse",
        group: "",
        durationMs: 60000,
        recurring: false,
        autoStart: false,
        steps: [{ type: "send_command", template: "pulse-before" }],
      },
    ];

    for (const [kind, label, definition] of [
      [
        "aliases",
        "Shared aliases",
        {
          id: "alias-shared",
          enabled: true,
          trigger: "sharedalias",
          description: "Shared alias",
          group: "",
          isRegex: false,
          ignoreCase: true,
          steps: [{ type: "send_command", template: "shared-alias-before" }],
        },
      ],
      [
        "triggers",
        "Shared triggers",
        {
          id: "trigger-shared",
          enabled: true,
          pattern: "shared danger",
          description: "Shared trigger",
          group: "",
          isRegex: false,
          ignoreCase: false,
          gag: false,
          steps: [{ type: "send_command", template: "shared-trigger-before" }],
        },
      ],
      [
        "timers",
        "Shared timers",
        {
          id: "timer-shared",
          enabled: true,
          name: "shared pulse",
          description: "Shared timer",
          group: "",
          durationMs: 60000,
          recurring: false,
          autoStart: false,
          steps: [{ type: "send_command", template: "shared-timer-before" }],
        },
      ],
    ] as const) {
      const setId = crypto.randomUUID();
      character.configSetRefs[kind] = [setId];
      graph.configurationSets[setId] = {
        id: setId,
        label,
        kind,
        revision: 1,
        definitions: [definition],
      };
    }
    localStorage.setItem(key, JSON.stringify(graph));
  });
  await page.reload();
}

function settingsDialog(page: Page) {
  return page.getByRole("dialog", { name: "Settings" });
}

async function settingsTab(dialog: ReturnType<typeof settingsDialog>, name: string): Promise<void> {
  await dialog.getByRole("tab", { name, exact: true }).click();
}

async function settingsGroup(dialog: ReturnType<typeof settingsDialog>, tab: string, name: string) {
  await settingsTab(dialog, tab);
  return dialog.getByRole("group", { name });
}

async function skipChangedSettingsBackup(dialog: ReturnType<typeof settingsDialog>): Promise<void> {
  const backup = dialog.getByRole("dialog", { name: "Download changed settings?" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (await backup.count()) await backup.getByRole("button", { name: "Skip", exact: true }).click();
}

test("Phase 2 settings save current preferences without replacing deferred fields", async ({
  page,
}) => {
  const loadedScripts: string[] = [];
  page.on("request", (request) => loadedScripts.push(request.url()));
  await page.goto("/phase2/");
  await expect(page.getByTestId("phase2-shell")).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem(
      "darkwind-client-settings",
      JSON.stringify({
        deferredSetting: { keep: true },
        emojiPickerEnabled: "invalid",
        keyMappings: [{ command: "look" }],
        outputScrollbackPreset: "invalid",
        scrollbackBehavior: "invalid",
        scrollbackSplitRatio: null,
        background: "retired",
        sideRailOpacity: "invalid",
        terminalBackgroundOpacity: "invalid",
        terminalFontFamily: "invalid",
        terminalFontSize: 7,
        terminalWidthColumns: 39,
        customThemes: {
          saved: {
            key: "saved",
            label: "Saved",
            type: "dark",
            bg: "#000000",
            fg: "#ffffff",
            accent: "#123456",
            ansi: Array(16).fill("#123456"),
            ui: {},
          },
          invalid: { key: "invalid", ansi: [] },
        },
      }),
    ),
  );

  const settingsButton = page.getByRole("button", { name: "Settings", exact: true });
  await settingsButton.click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await settingsTab(dialog, "Appearance");
  await expect(dialog.getByLabel("Side panel opacity")).toHaveValue("82");
  await expect(dialog.getByLabel("Terminal background opacity")).toHaveValue("55");
  await dialog.getByLabel("Theme", { exact: true }).selectOption("nord");
  await dialog.getByLabel("Side panel opacity").fill("67");
  await dialog.getByLabel("Terminal background opacity").fill("43");
  await settingsTab(dialog, "Controls");
  await expect(dialog.getByLabel("Show emoji picker")).toBeChecked();
  await dialog.getByLabel("Repeat last command").uncheck();
  await dialog.getByLabel("Complete aliases with Tab").uncheck();
  await dialog.getByLabel("Complete from history with Tab").check();
  await dialog.getByLabel("Show emoji picker").uncheck();
  await settingsTab(dialog, "Terminal");
  await expect(dialog.getByLabel("Terminal font family")).toHaveValue("");
  await expect(dialog.getByLabel("Terminal font size")).toHaveValue("");
  await expect(dialog.getByLabel("Scrollback behavior")).toHaveValue("pause");
  await expect(dialog.getByLabel("Scrollback memory")).toHaveValue("normal");
  await expect(dialog.getByLabel("Split history size")).toHaveValue("60");
  await dialog.getByLabel("Scrollback behavior").selectOption("split");
  await dialog.getByLabel("Scrollback memory").selectOption("high");
  await dialog.getByLabel("Terminal font family").selectOption({ label: "Courier" });
  await dialog.getByLabel("Terminal font size").selectOption("18");
  await settingsTab(dialog, "Variables");
  await dialog.getByRole("button", { name: "Add variable" }).click();
  await dialog.getByLabel("Name").fill("target");
  await dialog.getByLabel("Value").fill("goblin");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await skipChangedSettingsBackup(dialog);

  await expect(dialog).not.toBeVisible();
  await expect(settingsButton).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--df-bg")),
    )
    .not.toBe("");
  const saved = await page.evaluate(() => ({
    graph: JSON.parse(localStorage.getItem("darkflow-session-core-v1")!),
    settings: JSON.parse(localStorage.getItem("darkwind-client-settings")!),
    variables: (
      window as typeof window & {
        __darkflowPhase1Runtime?: {
          session: {
            terminal: {
              automation: { getAutomationVariables(): Record<string, string> };
            };
          };
        };
      }
    ).__darkflowPhase1Runtime?.session.terminal.automation.getAutomationVariables(),
  }));
  expect(saved.graph.defaults.themeKey).toBe("nord");
  expect(saved.settings).toMatchObject({
    aliasTabCompletionEnabled: false,
    deferredSetting: { keep: true },
    emojiPickerEnabled: false,
    historyTabCompletionEnabled: true,
    keyMappings: [{ command: "look" }],
    repeatLastCommand: false,
    scrollbackBehavior: "split",
    outputScrollbackPreset: "high",
    theme: "nord",
    background: "none",
    sideRailOpacity: 67,
    terminalBackgroundOpacity: 43,
    terminalFontFamily: '"Courier New", Courier, monospace',
    terminalFontSize: 18,
    terminalWidthColumns: null,
  });
  const terminalOutput = page.getByLabel("Terminal output", { exact: true });
  await expect(terminalOutput).toHaveCSS("font-family", /Courier New/);
  await expect(terminalOutput).toHaveCSS("font-size", "18px");
  expect(saved.settings.customThemes).toMatchObject({ saved: { key: "saved", label: "Saved" } });
  expect(saved.settings.customThemes.invalid).toBeUndefined();
  expect(saved.variables).toMatchObject({ target: "goblin" });
  expect(loadedScripts.some((url) => url.endsWith("/js/app.js"))).toBe(false);

  await page.reload();
  await settingsButton.click();
  await settingsTab(dialog, "Appearance");
  await expect(dialog.getByLabel("Theme", { exact: true })).toHaveValue("nord");
  await expect(dialog.getByLabel("Side panel opacity")).toHaveValue("67");
  await expect(dialog.getByLabel("Terminal background opacity")).toHaveValue("43");
  await settingsTab(dialog, "Terminal");
  await expect(dialog.getByLabel("Terminal font family")).toHaveValue(
    '"Courier New", Courier, monospace',
  );
  await expect(dialog.getByLabel("Terminal font size")).toHaveValue("18");
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--df-side-rail-opacity"),
      ),
    )
    .toBe("67%");
  await expect
    .poll(() =>
      page.locator("#phase2-left-rail").evaluate((rail) => getComputedStyle(rail).backgroundColor),
    )
    .toContain("0.67");
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue(
          "--df-terminal-background-alpha",
        ),
      ),
    )
    .toBe("0.43");
  await expect
    .poll(() =>
      page
        .locator(".terminal-output-shell")
        .evaluate((terminal) => getComputedStyle(terminal).backgroundColor),
    )
    .toContain("0.43");
  await expect
    .poll(() =>
      page
        .locator(".dv-groupview[data-terminal-active]")
        .evaluate((group) => getComputedStyle(group).backgroundColor),
    )
    .toBe("rgba(0, 0, 0, 0)");
  await expect(
    dialog.getByLabel("Theme", { exact: true }).locator("option", { hasText: "Saved" }),
  ).toHaveCount(1);
  await settingsTab(dialog, "Controls");
  await expect(dialog.getByLabel("Repeat last command")).not.toBeChecked();
  await expect(dialog.getByLabel("Complete aliases with Tab")).not.toBeChecked();
  await expect(dialog.getByLabel("Complete from history with Tab")).toBeChecked();
  await expect(dialog.getByLabel("Show emoji picker")).not.toBeChecked();
  await settingsTab(dialog, "Terminal");
  await expect(dialog.getByLabel("Scrollback behavior")).toHaveValue("split");
  await expect(dialog.getByLabel("Scrollback memory")).toHaveValue("high");
  await settingsTab(dialog, "Variables");
  await expect(dialog.getByText("Variables are saved for this character.")).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveValue("target");
  await expect(dialog.getByLabel("Value")).toHaveValue("goblin");
});

test("Phase 2 settings remain usable on a mobile viewport", async ({ page }) => {
  await page.goto("/phase2/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeFocused();
});

test("Phase 2 appearance controls preview live, revert on Cancel, and persist on Apply", async ({
  page,
}) => {
  await page.goto("/phase2/");
  await page.evaluate(() =>
    localStorage.setItem(
      "darkwind-client-settings",
      JSON.stringify({
        background: "moonlit-forest",
        sideRailOpacity: 67,
        terminalBackgroundOpacity: 43,
        terminalFontFamily: '"Courier New", Courier, monospace',
        terminalFontSize: 18,
      }),
    ),
  );
  await page.reload();

  const settingsButton = page.getByRole("button", { name: "Settings", exact: true });
  const dialog = settingsDialog(page);
  await settingsButton.click();
  await settingsTab(dialog, "Appearance");
  await dialog.getByLabel("Side panel opacity").fill("20");
  await dialog.getByLabel("Terminal background opacity").fill("10");
  await settingsTab(dialog, "Terminal");
  await dialog.getByLabel("Terminal font family").selectOption({ label: "Serif" });
  await dialog.getByLabel("Terminal font size").selectOption("24");
  await expect
    .poll(() =>
      page.locator("#phase2-left-rail").evaluate((rail) => getComputedStyle(rail).backgroundColor),
    )
    .toContain("0.2");
  await expect
    .poll(() =>
      page
        .locator(".terminal-output-shell")
        .evaluate((terminal) => getComputedStyle(terminal).backgroundColor),
    )
    .toContain("0.1");
  const terminalOutput = page.getByLabel("Terminal output", { exact: true });
  await expect(terminalOutput).toHaveCSS("font-family", /Georgia/);
  await expect(terminalOutput).toHaveCSS("font-size", "24px");

  const storedBeforeCancel = await page.evaluate(() =>
    localStorage.getItem("darkwind-client-settings"),
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await skipChangedSettingsBackup(dialog);
  await expect
    .poll(() =>
      page.evaluate(() => ({
        sideRail: getComputedStyle(document.documentElement).getPropertyValue(
          "--df-side-rail-opacity",
        ),
        terminal: getComputedStyle(document.documentElement).getPropertyValue(
          "--df-terminal-background-alpha",
        ),
        terminalFontFamily: getComputedStyle(document.documentElement).getPropertyValue(
          "--df-terminal-font-family",
        ),
        terminalFontSize: getComputedStyle(document.documentElement).getPropertyValue(
          "--df-terminal-font-size",
        ),
      })),
    )
    .toEqual({
      sideRail: "67%",
      terminal: "0.43",
      terminalFontFamily: '"Courier New", Courier, monospace',
      terminalFontSize: "18px",
    });
  expect(await page.evaluate(() => localStorage.getItem("darkwind-client-settings"))).toBe(
    storedBeforeCancel,
  );

  await settingsButton.click();
  await settingsTab(dialog, "Appearance");
  await dialog.getByLabel("Side panel opacity").fill("60");
  await dialog.getByLabel("Terminal background opacity").fill("30");
  await settingsTab(dialog, "Terminal");
  await dialog.getByLabel("Terminal font family").selectOption({ label: "Verdana" });
  await dialog.getByLabel("Terminal font size").selectOption("20");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await skipChangedSettingsBackup(dialog);
  await expect
    .poll(() =>
      page.evaluate(() => ({
        sideRail: getComputedStyle(document.documentElement).getPropertyValue(
          "--df-side-rail-opacity",
        ),
        terminal: getComputedStyle(document.documentElement).getPropertyValue(
          "--df-terminal-background-alpha",
        ),
        settings: JSON.parse(localStorage.getItem("darkwind-client-settings")!),
      })),
    )
    .toMatchObject({
      sideRail: "60%",
      terminal: "0.3",
      settings: {
        sideRailOpacity: 60,
        terminalBackgroundOpacity: 30,
        terminalFontFamily: "Verdana, Geneva, Tahoma, sans-serif",
        terminalFontSize: 20,
      },
    });
});

test("Phase 2 appearance persists trusted backgrounds and rejects invalid theme imports without writes", async ({
  page,
}, testInfo) => {
  await page.goto("/phase2/");
  const settingsButton = page.getByRole("button", { name: "Settings", exact: true });
  await settingsButton.click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await settingsTab(dialog, "Appearance");
  const background = dialog.getByRole("radio", { name: "Moonlit Forest" });
  const backgroundChoice = dialog.locator('.background-choice:has(input[value="moonlit-forest"])');
  await expect(background).toHaveCSS("opacity", "0");
  await expect(backgroundChoice.locator("img")).toBeVisible();
  const backgroundPreview = backgroundChoice.locator(".background-preview");
  await backgroundPreview.click();
  await expect(background).toBeChecked();
  expect(
    await backgroundPreview.evaluate((element) => getComputedStyle(element).borderColor),
  ).not.toBe("rgba(0, 0, 0, 0)");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await skipChangedSettingsBackup(dialog);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.background))
    .toBe("moonlit-forest");
  if (testInfo.project.name === "mobile-chromium") {
    await expect(page.getByLabel("Terminal output", { exact: true })).toBeVisible();
  } else {
    await expect(page.getByText("Avatar", { exact: true })).toBeVisible();
    await expect(page.getByText("No guild vitals", { exact: true })).toBeVisible();
  }
  if (testInfo.project.name === "chromium")
    await page.screenshot({ path: "test-results/phase2-appearance-background-active.png" });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.background))
    .toBe("moonlit-forest");

  await page.evaluate(() =>
    localStorage.setItem("darkwind-client-settings", JSON.stringify({ background: "retired" })),
  );
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.background))
    .toBe("none");

  await settingsButton.click();
  await settingsTab(dialog, "Appearance");
  const input = dialog.getByLabel("Upload theme JSON");
  const beforeInvalid = await page.evaluate(() => localStorage.getItem("darkwind-client-settings"));
  await input.setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"colors":{"editor.background":"#12345"}}'),
  });
  await expect(dialog.getByRole("status")).toContainText("Choose a valid");
  expect(await page.evaluate(() => localStorage.getItem("darkwind-client-settings"))).toBe(
    beforeInvalid,
  );
  await input.setInputFiles({
    name: "large.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(1024 * 1024 + 1),
  });
  await expect(dialog.getByRole("status")).toContainText("1 MiB");
  expect(await page.evaluate(() => localStorage.getItem("darkwind-client-settings"))).toBe(
    beforeInvalid,
  );

  await input.setInputFiles({
    name: "fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        name: "Fixture",
        colors: { "editor.background": "#112233", "editor.foreground": "#ddeeff" },
      }),
    ),
  });
  await expect(dialog.getByRole("status")).toContainText("Theme imported.");
  await page.reload();
  await settingsButton.click();
  await settingsTab(dialog, "Appearance");
  await expect(dialog.getByLabel("Theme", { exact: true })).toHaveValue("fixture");
});

test("Phase 3 exports portable settings, previews imports, and backs up changed drafts", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "darkflowDesktop", {
      configurable: true,
      value: {
        checkForUpdates: () => undefined,
        getInfo: () => Promise.resolve({ version: "9.8.7" }),
        installUpdate: () => undefined,
        onUpdateStatus: () => () => undefined,
      },
    });
  });
  await page.goto("/phase2/");
  await expect(page.getByTestId("phase2-shell")).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem(
      "darkwind-client-settings",
      JSON.stringify({ deferredExportField: { keep: true } }),
    ),
  );
  const settingsButton = page.getByRole("button", { name: "Settings", exact: true });
  await settingsButton.click();
  const dialog = settingsDialog(page);
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export settings", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^darkflow-settings-.*\.json$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const downloadedBundle = JSON.parse(Buffer.concat(chunks).toString());
  expect(downloadedBundle.clientVersion).toBe("9.8.7");
  expect(downloadedBundle.data.clientSettings.deferredExportField).toEqual({
    keep: true,
  });
  const exported = await page.evaluate(() => {
    const applicationState = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
    const character =
      applicationState.characterProfiles[applicationState.defaults.defaultCharacterProfileId];
    character.commandHistory = ["imported-history"];
    character.workspace.payload.importedPanelSizeMarker = { terminal: 731, map: 213 };
    return {
      format: "darkwind-client-settings-export",
      formatVersion: 2,
      exportedAt: new Date().toISOString(),
      clientVersion: "test",
      data: {
        applicationState,
        clientSettings: { theme: applicationState.defaults.themeKey },
        sound: {},
      },
    };
  });

  await dialog.locator(".hidden-file-input").setInputFiles({
    name: "settings.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  const confirmation = dialog.getByRole("dialog", { name: "Import settings" });
  await expect(confirmation).toContainText("profiles");
  await expect(
    confirmation.getByRole("button", { name: "Import and reload", exact: true }),
  ).toBeFocused();
  if (testInfo.project.name === "chromium")
    await page.screenshot({ path: testInfo.outputPath("phase3-import-preview.png") });
  await page.keyboard.press("Escape");
  await expect(confirmation).not.toBeVisible();
  await expect(dialog.getByRole("button", { name: "Import settings", exact: true })).toBeFocused();
  const beforeInvalid = await page.evaluate(() => localStorage.getItem("darkwind-client-settings"));
  await dialog.locator(".hidden-file-input").setInputFiles({
    name: "unsupported.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...exported, formatVersion: 99 })),
  });
  await expect(dialog.getByRole("status")).toContainText("not supported");
  expect(await page.evaluate(() => localStorage.getItem("darkwind-client-settings"))).toBe(
    beforeInvalid,
  );

  (exported.data.clientSettings as Record<string, unknown>).repeatLastCommand = false;
  await dialog.locator(".hidden-file-input").setInputFiles({
    name: "settings.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  const recoveryDownload = page.waitForEvent("download");
  const reload = page.waitForEvent("load");
  await dialog
    .getByRole("dialog", { name: "Import settings" })
    .getByRole("button", { name: "Import and reload", exact: true })
    .click();
  expect((await recoveryDownload).suggestedFilename()).toMatch(/-recovery\.json$/);
  await reload;
  await expect(page.getByTestId("phase2-shell")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
        const character = state.characterProfiles[state.defaults.defaultCharacterProfileId];
        return {
          history: character.commandHistory,
          marker: character.workspace.payload.importedPanelSizeMarker,
          repeatLastCommand: JSON.parse(localStorage.getItem("darkwind-client-settings")!)
            .repeatLastCommand,
        };
      }),
    )
    .toEqual({
      history: ["imported-history"],
      marker: { terminal: 731, map: 213 },
      repeatLastCommand: false,
    });

  await settingsButton.click();
  await settingsTab(dialog, "Appearance");
  await dialog.getByLabel("Theme", { exact: true }).selectOption("nord");
  await settingsTab(dialog, "Controls");
  await dialog.getByLabel("Repeat last command").check();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const backup = dialog.getByRole("dialog", { name: "Download changed settings?" });
  await expect(backup.getByRole("button", { name: "Download backup", exact: true })).toBeFocused();
  if (testInfo.project.name === "chromium")
    await page.screenshot({ path: testInfo.outputPath("phase3-backup-prompt.png") });
  await backup.getByRole("button", { name: "Never ask again", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("darkwind-client-settings")!)))
    .toMatchObject({
      theme: "darkflow-default",
      repeatLastCommand: false,
      settingsBackupPromptEnabled: false,
    });
});

test("Phase 2 auto-reconnect follows the saved setting and cancellation is immediate", async ({
  page,
}) => {
  const endpoint = fixtures.endpoints.ws;
  await connect(page);
  endpoint.dropConnections();
  await expect(page.getByTestId("connection-status")).toContainText("Retry scheduled");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await settingsTab(dialog, "Connection");
  await dialog.getByLabel("Auto-reconnect").uncheck();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await skipChangedSettingsBackup(dialog);
  await expect.poll(() => endpoint.activeSocketCount()).toBe(0);
  await page.waitForTimeout(1_200);
  await expect.poll(() => endpoint.activeSocketCount()).toBe(0);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("darkwind-client-settings")!).autoReconnect,
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByTestId("connection-status")).toHaveText("Connected");
  endpoint.dropConnections();
  await page.waitForTimeout(1_200);
  await expect.poll(() => endpoint.activeSocketCount()).toBe(0);
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await settingsTab(page.getByRole("dialog", { name: "Settings" }), "Connection");
  await expect(page.getByLabel("Auto-reconnect")).not.toBeChecked();
});

test("Phase 2 settings replaces legacy geometry with a tall right-anchored window", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "desktop window only");
  await page.goto("/phase2/");
  await page.evaluate(() =>
    localStorage.setItem(
      "darkwind-settings-window",
      JSON.stringify({ x: 0, y: 0, w: 560, h: 380, tab: "audio" }),
    ),
  );
  await page.reload();
  const settingsButton = page.getByRole("button", { name: "Settings", exact: true });
  const buttonBounds = await settingsButton.boundingBox();
  await settingsButton.click();
  const dialog = settingsDialog(page);
  const dialogBounds = await dialog.boundingBox();
  expect(buttonBounds).not.toBeNull();
  expect(dialogBounds).not.toBeNull();
  expect(
    Math.abs(dialogBounds!.x + dialogBounds!.width - (buttonBounds!.x + buttonBounds!.width)),
  ).toBeLessThanOrEqual(8);
  expect(dialogBounds!.y).toBeGreaterThan(buttonBounds!.y + buttonBounds!.height);
  expect(dialogBounds!.height).toBeGreaterThanOrEqual(560);
  expect(
    await dialog
      .getByRole("navigation", { name: "Settings sections" })
      .evaluate((nav) => nav.scrollHeight <= nav.clientHeight),
  ).toBe(true);
  await expect(dialog.getByRole("tab", { name: "Audio", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("darkwind-settings-window") ?? "{}")),
    )
    .toMatchObject({ version: 1 });
});

test("Phase 2 settings use non-blocking grouped tabs with keyboard search and saved tab state", async ({
  page,
}, testInfo) => {
  await page.goto("/phase2/");
  const host = page.getByLabel("Host");
  const settingsButton = page.getByRole("button", { name: "Settings", exact: true });
  await settingsButton.click();
  const dialog = settingsDialog(page);
  await settingsButton.click();
  await expect(dialog).not.toBeVisible();
  await expect(settingsButton).toBeFocused();
  await settingsButton.click();
  if (["chromium", "mobile-chromium"].includes(testInfo.project.name)) {
    await expect(dialog).toHaveScreenshot(
      `phase2-settings-${testInfo.project.name === "mobile-chromium" ? "mobile" : "desktop"}.png`,
      { maxDiffPixels: 1 },
    );
  }
  if (testInfo.project.name === "mobile-chromium") {
    await expect(dialog.getByRole("tablist")).toHaveAttribute("aria-orientation", "horizontal");
  } else {
    await expect(dialog.getByRole("heading", { name: "Client", exact: true })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Automation", exact: true })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Help", exact: true })).toBeVisible();
  }
  await dialog.getByRole("tab", { name: "Connection", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByRole("tab", { name: "Appearance", exact: true })).toBeFocused();
  await expect(dialog.getByLabel("Theme", { exact: true })).toBeVisible();
  await host.fill("example.test");
  await dialog.getByLabel("Search settings").fill("Add variable");
  await expect(dialog.getByRole("tab", { name: "Appearance", exact: true })).toHaveAttribute(
    "aria-selected",
    "false",
  );
  await expect(dialog.getByRole("button", { name: "Add variable" })).toBeVisible();
  await dialog.getByLabel("Search settings").fill("");
  await expect(dialog.getByLabel("Theme", { exact: true })).toBeVisible();
  await settingsTab(dialog, "Aliases");
  await dialog.getByRole("button", { name: "Add aliases" }).click();
  await dialog.getByRole("textbox", { name: "Trigger", exact: true }).fill("draft-alias");
  await dialog.getByLabel("Search settings").fill("Connection");
  await dialog.getByLabel("Search settings").fill("");
  await settingsTab(dialog, "Aliases");
  await expect(dialog.getByRole("textbox", { name: "Trigger", exact: true })).toHaveValue(
    "draft-alias",
  );
  await settingsTab(dialog, "Connection");
  await dialog.getByLabel("Auto-reconnect").uncheck();
  await settingsTab(dialog, "Variables");
  await settingsButton.click();
  const backup = dialog.getByRole("dialog", { name: "Download changed settings?" });
  await expect(backup).toBeVisible();
  await backup.getByRole("button", { name: "Continue editing", exact: true }).click();
  await expect(dialog.getByRole("tab", { name: "Variables", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await settingsTab(dialog, "Aliases");
  await expect(dialog.getByRole("textbox", { name: "Trigger", exact: true })).toHaveValue(
    "draft-alias",
  );
  await settingsTab(dialog, "Connection");
  await expect(dialog.getByLabel("Auto-reconnect")).not.toBeChecked();
  await settingsTab(dialog, "Variables");
  await settingsButton.click();
  await backup.getByRole("button", { name: "Skip", exact: true }).click();
  await settingsButton.click();
  await expect(dialog.getByRole("tab", { name: "Variables", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("Phase 2 settings restores moved, resized geometry and the active tab after reload", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "desktop geometry only");
  await page.goto("/phase2/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = settingsDialog(page);
  await dialog.evaluate((element) => {
    const dialog = element as HTMLDialogElement;
    dialog.style.width = "720px";
    dialog.style.height = "580px";
  });
  const beforeMove = await dialog.boundingBox();
  const handle = page.getByTestId("settings-drag-handle");
  const handleBounds = await handle.boundingBox();
  expect(beforeMove).not.toBeNull();
  expect(handleBounds).not.toBeNull();
  await page.mouse.move(handleBounds!.x + 120, handleBounds!.y + 12);
  await page.mouse.down();
  await page.mouse.move(handleBounds!.x + 160, handleBounds!.y + 36);
  await page.mouse.up();
  await settingsTab(dialog, "Aliases");
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("darkwind-settings-window") ?? "{}")),
    )
    .toMatchObject({ w: 720, h: 580, tab: "aliases" });
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("darkwind-settings-window") ?? "{}").x as number,
      ),
    )
    .toBeGreaterThan(Math.round(beforeMove!.x));
  const persisted = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("darkwind-settings-window") ?? "{}") as Record<
        string,
        number | string
      >,
  );
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const restored = await dialog.boundingBox();
  expect(restored).not.toBeNull();
  expect(Math.round(restored!.x)).toBe(Math.round(persisted.x as number));
  expect(Math.round(restored!.y)).toBe(Math.round(persisted.y as number));
  expect(Math.round(restored!.width)).toBe(Math.round(persisted.w as number));
  expect(Math.round(restored!.height)).toBe(Math.round(persisted.h as number));
  await expect(dialog.getByRole("tab", { name: "Aliases", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("Phase 2 settings recovers from corrupted stored settings", async ({ page }) => {
  await page.goto("/phase2/");
  await expect(page.getByTestId("phase2-shell")).toBeVisible();
  await page.evaluate(() => localStorage.setItem("darkwind-client-settings", "not-json"));

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog.getByRole("status")).toHaveText(
    "Saved client settings are invalid. Fix or replace them before saving.",
  );
  await settingsTab(dialog, "Controls");
  await expect(dialog.getByLabel("Repeat last command")).toBeChecked();

  await dialog.getByRole("button", { name: "Apply" }).click();
  await skipChangedSettingsBackup(dialog);
  await expect(dialog).not.toBeVisible();

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("darkwind-client-settings")!),
  );
  expect(saved).toMatchObject({
    repeatLastCommand: true,
    aliasTabCompletionEnabled: true,
    historyTabCompletionEnabled: false,
  });
});

test("Phase 2 settings apply to terminal input immediately without reload", async ({ page }) => {
  await connect(page);
  const input = page.getByLabel("Command input", { exact: true });

  await input.fill("look");
  await input.press("Enter");
  await expect.poll(() => fixtures.endpoints.ws.commands).toContain("look");
  await expect(input).toHaveValue("look");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await settingsTab(dialog, "Controls");
  await dialog.getByLabel("Repeat last command").uncheck();
  await dialog.getByRole("button", { name: "Apply" }).click();
  await skipChangedSettingsBackup(dialog);
  await expect(dialog).not.toBeVisible();

  await input.fill("score");
  await input.press("Enter");
  await expect.poll(() => fixtures.endpoints.ws.commands).toContain("score");
  await expect(input).toHaveValue("");
});

test("Phase 2 settings reset the workspace immediately", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "desktop controls only");
  await page.goto("/phase2/");
  await expect(page.getByTestId("workspace-host")).toBeVisible();
  await page
    .locator('[data-panel-drag-handle][data-panel-id="status"]')
    .dragTo(page.locator('[data-panel-drag-handle][data-panel-id="avatar"]'));
  await page.getByRole("button", { name: "Collapse Status", exact: true }).click();
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await page.getByRole("checkbox", { name: "Avatar", exact: true }).uncheck();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await settingsTab(dialog, "Appearance");
  await dialog.getByRole("button", { name: "Reset workspace", exact: true }).click();

  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace reset");
  await expect(page.locator('.information-panel[data-panel-id="avatar"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Collapse Status", exact: true })).toBeVisible();
  expect(
    await page
      .locator('[data-rail="left"] .df-rail-card')
      .evaluateAll((cards) => cards.map((card) => (card as HTMLElement).dataset.panelId)),
  ).toEqual([
    "avatar",
    "status",
    "vitals",
    "guildVitals",
    "sky",
    "omens",
    "buffs",
    "worth",
    "xpmon",
    "stats",
  ]);
  expect(
    await page.evaluate(() => {
      const runtime = (
        window as unknown as { __darkflowPhase1Runtime: { characterProfileId: string } }
      ).__darkflowPhase1Runtime;
      const state = JSON.parse(localStorage.getItem("darkflow-session-core-v1") ?? "{}");
      return state.characterProfiles[runtime.characterProfileId].workspace.payload.dockview.version;
    }),
  ).toBe(2);
});

test("Phase 2 settings dialog closes when the session is disposed", async ({ page }) => {
  await page.goto("/phase2/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();

  await page.evaluate(() => {
    (
      window as unknown as { __darkflowPhase1Runtime: { session: { dispose(): void } } }
    ).__darkflowPhase1Runtime.session.dispose();
  });
  await expect(dialog).not.toBeVisible();
});

test("Phase 2 edits local direct definitions and updates live consumers", async ({ page }) => {
  const endpoint = fixtures.endpoints.ws;
  await installDirectDefinitions(page);
  await connect(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = settingsDialog(page);

  const keys = await settingsGroup(dialog, "Controls", "Key mappings");
  await keys.getByRole("button", { name: "Edit F2" }).click();
  let editor = keys.getByRole("region", { name: "Edit key mappings" });
  await editor.getByLabel("Command").fill("inventory");
  await editor.getByRole("button", { name: "Save key mappings" }).click();
  await keys.getByRole("button", { name: "Add key mappings" }).click();
  editor = keys.getByRole("region", { name: "Edit key mappings" });
  await editor.getByLabel("Key code").fill("F2");
  await editor.getByLabel("Label").fill("Duplicate F2");
  await editor.getByLabel("Command").fill("duplicate");
  await editor.getByRole("button", { name: "Save key mappings" }).click();
  await expect(keys.getByText("Key mappings must have unique identities.")).toBeVisible();
  await editor.getByRole("button", { name: "Cancel edit" }).click();
  await keys.getByRole("button", { name: "Add key mappings" }).click();
  editor = keys.getByRole("region", { name: "Edit key mappings" });
  await editor.getByLabel("Key code").fill("F4");
  await editor.getByLabel("Label").fill("F4");
  await editor.getByLabel("Command").fill("north");
  await editor.getByRole("button", { name: "Save key mappings" }).click();
  await keys.getByRole("button", { name: "Edit F4" }).click();
  editor = keys.getByRole("region", { name: "Edit key mappings" });
  await editor.getByLabel("Enabled", { exact: true }).uncheck();
  await editor.getByRole("button", { name: "Save key mappings" }).click();
  await keys.getByRole("button", { name: "Delete F4" }).click();

  const highlights = await settingsGroup(dialog, "Highlights", "Highlights");
  await highlights.getByRole("button", { name: "Edit glow" }).click();
  editor = highlights.getByRole("region", { name: "Edit highlights" });
  await editor.getByLabel("Foreground").fill("blue");
  await editor.getByRole("button", { name: "Save highlights" }).click();
  await highlights.getByRole("button", { name: "Add highlights" }).click();
  editor = highlights.getByRole("region", { name: "Edit highlights" });
  await editor.getByLabel("Pattern").fill("spark");
  await editor.getByRole("button", { name: "Save highlights" }).click();
  await highlights.getByRole("button", { name: "Edit spark" }).click();
  editor = highlights.getByRole("region", { name: "Edit highlights" });
  await editor.getByLabel("Enabled", { exact: true }).uncheck();
  await editor.getByRole("button", { name: "Save highlights" }).click();
  await highlights.getByRole("button", { name: "Delete spark" }).click();

  const functions = await settingsGroup(dialog, "Functions", "Functions");
  await functions.getByRole("button", { name: "Edit greet" }).click();
  editor = functions.getByRole("region", { name: "Edit functions" });
  await editor.getByLabel("Script", { exact: true }).fill("send salute");
  await editor.getByRole("button", { name: "Save functions" }).click();
  await functions.getByRole("button", { name: "Add functions" }).click();
  editor = functions.getByRole("region", { name: "Edit functions" });
  await editor.getByLabel("Name").fill("temporary");
  await editor.getByLabel("Script", { exact: true }).fill("send temporary");
  await editor.getByRole("button", { name: "Save functions" }).click();
  await functions.getByRole("button", { name: "Edit temporary" }).click();
  editor = functions.getByRole("region", { name: "Edit functions" });
  await editor.getByLabel("Enabled", { exact: true }).uncheck();
  await editor.getByRole("button", { name: "Save functions" }).click();
  await functions.getByRole("button", { name: "Delete temporary" }).click();

  const persisted = await page.evaluate(() => {
    const graph = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
    const definitions = (
      Object.values(graph.characterProfiles)[0] as {
        localDefinitions: Record<string, Array<{ id: string; [key: string]: unknown }>>;
      }
    ).localDefinitions;
    return definitions;
  });
  expect(persisted.keyMappings).toMatchObject([
    { id: "key-local", code: "F2", command: "inventory", enabled: true },
  ]);
  expect(persisted.highlights).toMatchObject([
    { id: "highlight-local", patternSource: "glow", style: { fg: "blue" }, enabled: true },
  ]);
  expect(persisted.functions).toMatchObject([
    { id: "function-greet", name: "greet", script: "send salute", enabled: true },
  ]);

  await dialog.getByRole("button", { name: "Close settings" }).click();
  await skipChangedSettingsBackup(dialog);
  const input = page.getByLabel("Command input", { exact: true });
  await page.getByTestId("phase2-shell").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("F2");
  await input.fill("fn");
  await input.press("Enter");
  await expect
    .poll(() => endpoint.commands)
    .toEqual(expect.arrayContaining(["inventory", "salute"]));
  endpoint.sendText("glow\n");
  await expect(page.getByLabel("Terminal output").locator(".ansi-fg-blue")).toContainText("glow");

  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const reloadedKeys = await settingsGroup(settingsDialog(page), "Controls", "Key mappings");
  await reloadedKeys.getByRole("button", { name: "Edit F2" }).click();
  await expect(reloadedKeys.getByLabel("Command")).toHaveValue("inventory");
});

test("Phase 2 routes shared direct definitions through stale-safe publication", async ({
  page,
}) => {
  const endpoint = fixtures.endpoints.ws;
  await installDirectDefinitions(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = settingsDialog(page);
  const keys = await settingsGroup(dialog, "Controls", "Key mappings");
  await expect(keys.getByText("Shared: Shared keys (revision 1)")).toBeVisible();
  await keys.getByRole("button", { name: "Edit F3" }).click();
  let editor = keys.getByRole("region", { name: "Edit key mappings" });
  await editor.getByLabel("Command").fill("draft-command");

  const externalResult = await page.evaluate(() => {
    const graph = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
    const set = Object.values(graph.configurationSets).find(
      (candidate) => (candidate as { kind: string }).kind === "keyMappings",
    ) as { id: string; revision: number; definitions: Array<Record<string, unknown>> };
    const runtime = (
      window as unknown as {
        __darkflowPhase1Runtime: {
          session: {
            configuration: {
              publishConfigurationSet(input: {
                configSetId: string;
                expectedRevision: number;
                definitions: Array<Record<string, unknown>>;
              }): { success: boolean };
            };
          };
        };
      }
    ).__darkflowPhase1Runtime;
    return runtime.session.configuration.publishConfigurationSet({
      configSetId: set.id,
      expectedRevision: set.revision,
      definitions: set.definitions.map((definition) => ({
        ...definition,
        command: "external-command",
      })),
    });
  });
  expect(externalResult.success).toBe(true);
  await expect(
    editor.getByText("This shared definition changed while you were editing it."),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Save key mappings" }).click();
  await expect(
    keys.getByText("Configuration set revision no longer matches the expected value."),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Reload shared definition" }).click();
  editor = keys.getByRole("region", { name: "Edit key mappings" });
  await expect(editor.getByLabel("Command")).toHaveValue("external-command");
  await editor.getByLabel("Command").fill("shared-after");
  await editor.getByRole("button", { name: "Save key mappings" }).click();

  const highlights = await settingsGroup(dialog, "Highlights", "Highlights");
  await highlights.getByRole("button", { name: "Edit shimmer" }).click();
  editor = highlights.getByRole("region", { name: "Edit highlights" });
  await editor.getByLabel("Pattern").fill("");
  await editor.getByRole("button", { name: "Save highlights" }).click();
  await expect(editor.getByLabel("Pattern")).toBeFocused();
  await editor.getByLabel("Pattern").fill("shimmer");
  await editor.getByLabel("Foreground").fill("blue");
  await editor.getByRole("button", { name: "Save highlights" }).click();

  const functions = await settingsGroup(dialog, "Functions", "Functions");
  await functions.getByRole("button", { name: "Edit sharedGreet" }).click();
  editor = functions.getByRole("region", { name: "Edit functions" });
  await editor.getByLabel("Script", { exact: true }).fill("send shared-function-after");
  await editor.getByRole("button", { name: "Save functions" }).click();

  const shared = await page.evaluate(() => {
    const graph = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
    return Object.values(graph.configurationSets) as Array<{
      kind: string;
      revision: number;
      definitions: Array<Record<string, unknown>>;
    }>;
  });
  expect(shared.find(({ kind }) => kind === "keyMappings")).toMatchObject({
    revision: 3,
    definitions: [{ id: "key-shared", command: "shared-after" }],
  });
  expect(shared.find(({ kind }) => kind === "highlights")).toMatchObject({
    revision: 2,
    definitions: [{ id: "highlight-shared", style: { fg: "blue" } }],
  });
  expect(shared.find(({ kind }) => kind === "functions")).toMatchObject({
    revision: 2,
    definitions: [{ id: "function-shared", script: "send shared-function-after" }],
  });

  await dialog.getByRole("button", { name: "Close settings" }).click();
  await skipChangedSettingsBackup(dialog);
  await connect(page);
  await page.getByTestId("phase2-shell").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("F3");
  const input = page.getByLabel("Command input", { exact: true });
  await input.fill("sharedfn");
  await input.press("Enter");
  await expect
    .poll(() => endpoint.commands)
    .toEqual(expect.arrayContaining(["shared-after", "shared-function-after"]));
  endpoint.sendText("shimmer\n");
  await expect(page.getByLabel("Terminal output").locator(".ansi-fg-blue")).toContainText(
    "shimmer",
  );

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  for (const [groupName, label] of [
    ["Key mappings", "F3"],
    ["Highlights", "shimmer"],
    ["Functions", "sharedGreet"],
  ] as const) {
    const group = await settingsGroup(
      settingsDialog(page),
      groupName === "Key mappings" ? "Controls" : groupName,
      groupName,
    );
    await group.getByRole("button", { name: `Edit ${label}` }).click();
    const activeEditor = group.getByRole("region", { name: `Edit ${groupName.toLowerCase()}` });
    await activeEditor.getByLabel("Enabled", { exact: true }).uncheck();
    await activeEditor.getByRole("button", { name: `Save ${groupName.toLowerCase()}` }).click();
    await group.getByRole("button", { name: `Delete ${label}` }).click();
  }
  const emptied = await page.evaluate(() => {
    const graph = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
    return Object.values(graph.configurationSets).map(
      (set) => (set as { definitions: unknown[] }).definitions.length,
    );
  });
  expect(emptied).toEqual([0, 0, 0]);
});

test("Phase 2 edits automation definitions and updates live consumers", async ({ page }) => {
  const endpoint = fixtures.endpoints.ws;
  await installAutomationDefinitions(page);
  await connect(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = settingsDialog(page);

  const aliases = await settingsGroup(dialog, "Aliases", "Aliases");
  await expect(aliases.getByText("Shared: Shared aliases (revision 1)")).toBeVisible();
  await aliases.getByRole("button", { name: "Edit allsteps" }).click();
  let editor = aliases.getByRole("region", { name: "Edit aliases" });
  expect(
    await editor
      .getByLabel("Step type")
      .evaluateAll((selects) => selects.map((select) => (select as HTMLSelectElement).value)),
  ).toEqual([
    "send_command",
    "set_variable",
    "show_message",
    "script",
    "wait",
    "set_alias_enabled",
    "set_trigger_enabled",
    "set_timer_enabled",
    "control_timer",
    "play_sound",
    "run_alias",
    "call_function",
  ]);
  await editor.getByRole("button", { name: "Cancel edit" }).click();
  await aliases.getByRole("button", { name: "Edit quick" }).click();
  editor = aliases.getByRole("region", { name: "Edit aliases" });
  await editor.getByLabel("Template").fill("inventory");
  await editor.getByRole("button", { name: "Save aliases" }).click();
  await aliases.getByRole("button", { name: "Add aliases" }).click();
  editor = aliases.getByRole("region", { name: "Edit aliases" });
  await editor.getByLabel("Trigger").fill("temporary alias");
  await editor.getByRole("button", { name: "Add automation step" }).click();
  await editor.getByLabel("Template").fill("temporary");
  await editor.getByRole("button", { name: "Save aliases" }).click();
  await aliases.getByRole("button", { name: "Edit temporary alias" }).click();
  editor = aliases.getByRole("region", { name: "Edit aliases" });
  await editor.getByLabel("Enabled", { exact: true }).uncheck();
  await editor.getByRole("button", { name: "Save aliases" }).click();
  await aliases.getByRole("button", { name: "Delete temporary alias" }).click();

  const triggers = await settingsGroup(dialog, "Triggers", "Triggers");
  await triggers.getByRole("button", { name: "Edit danger" }).click();
  editor = triggers.getByRole("region", { name: "Edit triggers" });
  await editor.getByLabel("Template").fill("retreat");
  await editor.getByRole("button", { name: "Save triggers" }).click();
  await triggers.getByRole("button", { name: "Add triggers" }).click();
  editor = triggers.getByRole("region", { name: "Edit triggers" });
  await editor.getByLabel("Pattern").fill("temporary trigger");
  await editor.getByRole("button", { name: "Add automation step" }).click();
  await editor.getByLabel("Template").fill("temporary");
  await editor.getByRole("button", { name: "Save triggers" }).click();
  await triggers.getByRole("button", { name: "Edit temporary trigger" }).click();
  editor = triggers.getByRole("region", { name: "Edit triggers" });
  await editor.getByLabel("Enabled", { exact: true }).uncheck();
  await editor.getByRole("button", { name: "Save triggers" }).click();
  await triggers.getByRole("button", { name: "Delete temporary trigger" }).click();

  const timers = await settingsGroup(dialog, "Timers", "Timers");
  await timers.getByRole("button", { name: "Edit pulse" }).click();
  editor = timers.getByRole("region", { name: "Edit timers" });
  await editor.getByLabel("Duration (milliseconds)").fill("50");
  await editor.getByLabel("Start automatically").check();
  await editor.getByLabel("Template").fill("timer-after");
  await editor.getByRole("button", { name: "Save timers" }).click();
  await timers.getByRole("button", { name: "Add timers" }).click();
  editor = timers.getByRole("region", { name: "Edit timers" });
  await editor.getByLabel("Name").fill("temporary timer");
  await editor.getByRole("button", { name: "Add automation step" }).click();
  await editor.getByLabel("Template").fill("temporary");
  await editor.getByRole("button", { name: "Save timers" }).click();
  await timers.getByRole("button", { name: "Edit temporary timer" }).click();
  editor = timers.getByRole("region", { name: "Edit timers" });
  await editor.getByLabel("Enabled", { exact: true }).uncheck();
  await editor.getByRole("button", { name: "Save timers" }).click();
  await timers.getByRole("button", { name: "Delete temporary timer" }).click();

  const persisted = await page.evaluate(() => localStorage.getItem("darkflow-session-core-v1")!);
  expect(persisted).not.toContain("timerHandles");
  expect(persisted).not.toContain("automationVariables");

  await dialog.getByRole("button", { name: "Close settings" }).click();
  await skipChangedSettingsBackup(dialog);
  const input = page.getByLabel("Command input", { exact: true });
  await input.fill("quick");
  await input.press("Enter");
  endpoint.sendText("danger\n");
  await expect
    .poll(() => endpoint.commands)
    .toEqual(expect.arrayContaining(["inventory", "retreat", "timer-after"]));
  await expect(page.getByLabel("Terminal output")).not.toContainText("danger");

  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const reloadedAliases = await settingsGroup(settingsDialog(page), "Aliases", "Aliases");
  await reloadedAliases.getByRole("button", { name: "Edit quick" }).click();
  await expect(reloadedAliases.getByLabel("Template")).toHaveValue("inventory");
});

test("Phase 2 publishes shared automation definitions with stale protection", async ({ page }) => {
  const endpoint = fixtures.endpoints.ws;
  await installAutomationDefinitions(page);
  await connect(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = settingsDialog(page);
  const aliases = await settingsGroup(dialog, "Aliases", "Aliases");
  await aliases.getByRole("button", { name: "Edit sharedalias" }).click();
  let editor = aliases.getByRole("region", { name: "Edit aliases" });
  await editor.getByLabel("Template").fill("draft-shared-alias");

  const externalResult = await page.evaluate(() => {
    const graph = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
    const set = Object.values(graph.configurationSets).find(
      (candidate) => (candidate as { kind: string }).kind === "aliases",
    ) as { id: string; revision: number; definitions: Array<Record<string, unknown>> };
    return (
      window as unknown as {
        __darkflowPhase1Runtime: {
          session: {
            configuration: {
              publishConfigurationSet(input: {
                configSetId: string;
                expectedRevision: number;
                definitions: Array<Record<string, unknown>>;
              }): { success: boolean };
            };
          };
        };
      }
    ).__darkflowPhase1Runtime.session.configuration.publishConfigurationSet({
      configSetId: set.id,
      expectedRevision: set.revision,
      definitions: set.definitions.map((definition) => ({
        ...definition,
        steps: [{ type: "send_command", template: "external-shared-alias" }],
      })),
    });
  });
  expect(externalResult.success).toBe(true);
  await expect(
    editor.getByText("This shared definition changed while you were editing it."),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Save aliases" }).click();
  await expect(
    aliases.getByText("Configuration set revision no longer matches the expected value."),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Reload shared definition" }).click();
  editor = aliases.getByRole("region", { name: "Edit aliases" });
  await expect(editor.getByLabel("Template")).toHaveValue("external-shared-alias");
  await editor.getByLabel("Template").fill("shared-alias-after");
  await editor.getByRole("button", { name: "Save aliases" }).click();

  const triggers = await settingsGroup(dialog, "Triggers", "Triggers");
  await triggers.getByRole("button", { name: "Edit shared danger" }).click();
  editor = triggers.getByRole("region", { name: "Edit triggers" });
  await editor.getByLabel("Template").fill("shared-trigger-after");
  await editor.getByRole("button", { name: "Save triggers" }).click();

  const timers = await settingsGroup(dialog, "Timers", "Timers");
  await timers.getByRole("button", { name: "Edit shared pulse" }).click();
  editor = timers.getByRole("region", { name: "Edit timers" });
  await editor.getByLabel("Duration (milliseconds)").fill("50");
  await editor.getByLabel("Start automatically").check();
  await editor.getByLabel("Template").fill("shared-timer-after");
  await editor.getByRole("button", { name: "Save timers" }).click();

  const shared = await page.evaluate(() => {
    const graph = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
    return (Object.values(graph.configurationSets) as Array<{ kind: string }>).filter(({ kind }) =>
      ["aliases", "triggers", "timers"].includes(kind),
    );
  });
  expect(shared).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "aliases", revision: 3 }),
      expect.objectContaining({ kind: "triggers", revision: 2 }),
      expect.objectContaining({ kind: "timers", revision: 2 }),
    ]),
  );

  await dialog.getByRole("button", { name: "Close settings" }).click();
  await skipChangedSettingsBackup(dialog);
  const input = page.getByLabel("Command input", { exact: true });
  await input.fill("sharedalias");
  await input.press("Enter");
  endpoint.sendText("shared danger\n");
  await expect
    .poll(() => endpoint.commands)
    .toEqual(
      expect.arrayContaining(["shared-alias-after", "shared-trigger-after", "shared-timer-after"]),
    );

  await page.reload();
  await connect(page);
  const reconnectedInput = page.getByLabel("Command input", { exact: true });
  await reconnectedInput.fill("sharedalias");
  await reconnectedInput.press("Enter");
  await expect.poll(() => endpoint.commands).toContain("shared-alias-after");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  for (const [groupName, label] of [
    ["Aliases", "sharedalias"],
    ["Triggers", "shared danger"],
    ["Timers", "shared pulse"],
  ] as const) {
    const group = await settingsGroup(settingsDialog(page), groupName, groupName);
    await group.getByRole("button", { name: `Edit ${label}` }).click();
    const activeEditor = group.getByRole("region", {
      name: `Edit ${groupName.toLowerCase()}`,
    });
    await activeEditor.getByLabel("Enabled", { exact: true }).uncheck();
    await activeEditor.getByRole("button", { name: `Save ${groupName.toLowerCase()}` }).click();
    await group.getByRole("button", { name: `Delete ${label}` }).click();
  }
});
