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
  return page.getByRole("dialog", { name: "Settings", exact: true });
}

async function settingsTab(dialog: ReturnType<typeof settingsDialog>, name: string): Promise<void> {
  await dialog.getByRole("tab", { name, exact: true }).click();
}

async function settingsGroup(dialog: ReturnType<typeof settingsDialog>, tab: string, name: string) {
  await settingsTab(dialog, tab);
  return dialog.getByRole("group", { name });
}

async function confirmDefinitionDelete(page: Page, label: string): Promise<void> {
  const confirmation = page.getByRole("dialog", { name: `Delete ${label}`, exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
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
  await dialog.getByRole("button", { name: "Save" }).click();
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
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
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

test("Phase 2 Settings Apply stays open and Save closes", async ({ page }) => {
  await page.goto("/phase2/");
  const dialog = settingsDialog(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await settingsTab(dialog, "Variables");
  await dialog.getByRole("button", { name: "Add variable", exact: true }).click();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog.getByText("Variable names cannot be empty.", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await settingsTab(dialog, "Functions");
  await dialog.getByRole("button", { name: "New function", exact: true }).click();
  await settingsTab(dialog, "Appearance");
  await dialog.getByLabel("Terminal background opacity").fill("41");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("darkwind-client-settings")!).terminalBackgroundOpacity,
      ),
    )
    .toBe(41);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
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
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
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

test("Phase 3 imports settings without replacing the active session or profile state", async ({
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
  await connect(page);
  await expect(page.getByTestId("phase2-shell")).toBeVisible();
  const preserved = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
    const character = state.characterProfiles[state.defaults.defaultCharacterProfileId];
    const server = state.serverProfiles[character.serverProfileId];
    return {
      characterIds: Object.keys(state.characterProfiles),
      serverIds: Object.keys(state.serverProfiles),
      history: character.commandHistory,
      label: character.label,
      serverHost: server.host,
    };
  });
  await page.getByRole("button", { name: "Toggle left sidebar" }).click();
  await expect(page.locator("#phase2-left-rail")).toBeHidden();
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");
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
    const server = applicationState.serverProfiles[character.serverProfileId];
    character.label = "Imported character";
    character.commandHistory = ["imported-history"];
    character.automationVariables = { imported: "yes" };
    character.localDefinitions.aliases = [
      {
        id: "imported-alias",
        enabled: true,
        trigger: "zz",
        description: "Imported alias",
        group: "",
        isRegex: false,
        ignoreCase: true,
        steps: [{ type: "send_command", template: "look" }],
      },
    ];
    character.workspace.payload.importedPanelSizeMarker = { terminal: 731, map: 213 };
    character.workspace.payload.dockview.layout.railVisibility = { left: false, right: true };
    server.host = "imported.example.com";
    return {
      format: "darkwind-client-settings-export",
      formatVersion: 2,
      exportedAt: new Date().toISOString(),
      clientVersion: "test",
      data: {
        applicationState,
        clientSettings: { theme: applicationState.defaults.themeKey },
        sound: { enabled: false, volume: 0.25, categoryEnabled: { combat: false } },
      },
    };
  });
  await page.getByRole("button", { name: "Toggle left sidebar" }).click();
  await expect(page.locator("#phase2-left-rail")).toBeVisible();
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");

  await dialog.locator(".hidden-file-input").setInputFiles({
    name: "settings.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  const confirmation = dialog.getByRole("dialog", { name: "Import settings" });
  await expect(confirmation).toContainText("replace your current settings");
  await expect(confirmation.getByRole("button", { name: "Import", exact: true })).toBeFocused();
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
  await page.evaluate(() => {
    (window as typeof window & { __settingsImportSentinel?: boolean }).__settingsImportSentinel =
      true;
  });
  const initialSessionId = await page.evaluate(
    () =>
      (window as typeof window & { __darkflowPhase1Session?: { sessionId: string } })
        .__darkflowPhase1Session?.sessionId,
  );
  const importDownloads: string[] = [];
  page.on("download", (item) => importDownloads.push(item.suggestedFilename()));
  await dialog
    .getByRole("dialog", { name: "Import settings" })
    .getByRole("button", { name: "Import", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __darkflowPhase1Session?: { sessionId: string } })
          .__darkflowPhase1Session?.sessionId,
    ),
  ).toBe(initialSessionId);
  await expect(page.getByTestId("connection-status")).toHaveText("Connected");
  await expect(page.locator("#phase2-left-rail")).toBeHidden();
  expect(importDownloads).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __settingsImportSentinel?: boolean }).__settingsImportSentinel,
    ),
  ).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
        const character = state.characterProfiles[state.defaults.defaultCharacterProfileId];
        const server = state.serverProfiles[character.serverProfileId];
        return {
          characterIds: Object.keys(state.characterProfiles),
          serverIds: Object.keys(state.serverProfiles),
          history: character.commandHistory,
          label: character.label,
          serverHost: server.host,
          marker: character.workspace.payload.importedPanelSizeMarker,
          variables: character.automationVariables,
          alias: character.localDefinitions.aliases[0]?.trigger,
          repeatLastCommand: JSON.parse(localStorage.getItem("darkwind-client-settings")!)
            .repeatLastCommand,
        };
      }),
    )
    .toEqual({
      ...preserved,
      marker: { terminal: 731, map: 213 },
      variables: { imported: "yes" },
      alias: "zz",
      repeatLastCommand: false,
    });
  const lookCount = fixtures.endpoints.ws.commands.filter((command) => command === "look").length;
  const commandInput = page.getByRole("textbox", { name: "Command input", exact: true });
  await commandInput.fill("zz");
  await commandInput.press("Enter");
  await expect
    .poll(() => fixtures.endpoints.ws.commands.filter((command) => command === "look").length)
    .toBe(lookCount + 1);

  await settingsButton.click();
  await settingsTab(dialog, "Audio");
  await expect(dialog.getByLabel("Enable audio")).not.toBeChecked();
  await expect(dialog.getByLabel("Volume")).toHaveValue("25");
  await expect(dialog.getByLabel("Combat")).not.toBeChecked();
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
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
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
  await dialog.getByRole("button", { name: "New alias" }).click();
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

  await dialog.getByRole("button", { name: "Save" }).click();
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
  await dialog.getByRole("button", { name: "Save" }).click();
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
  await keys.getByLabel("Command for F2").fill("inventory");
  await keys.getByLabel("Command for F2").press("Tab");
  await keys.getByRole("button", { name: "Add mapping" }).click();
  await expect(keys.getByLabel("Key for new mapping")).toBeFocused();
  await page.keyboard.press("F2");
  await keys.getByLabel("Command for new mapping").fill("duplicate");
  await keys.getByLabel("Command for new mapping").press("Tab");
  await expect(keys.getByText("Key mappings must have unique identities.")).toBeVisible();
  await keys
    .getByLabel("Command for new mapping")
    .locator("..")
    .getByRole("button", { name: "Remove" })
    .click();
  await keys.getByRole("button", { name: "Add mapping" }).click();
  await keys.getByLabel("Key for new mapping").press("F4");
  await keys.getByLabel("Command for new mapping").fill("north");
  await keys.getByLabel("Command for new mapping").press("Tab");
  await keys.getByLabel("Enable F4").uncheck();
  await keys
    .getByLabel("Command for F4")
    .locator("..")
    .getByRole("button", { name: "Remove" })
    .click();
  await confirmDefinitionDelete(page, "F4");
  await keys.getByRole("button", { name: "Add mapping" }).click();
  const keyInput = keys.getByLabel("Key for new mapping");
  await keyInput.dispatchEvent("keydown", {
    key: "%",
    code: "Digit5",
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  await expect(keyInput).toContainText("%");
  await expect(keyInput.locator("..").getByText("(Digit5)", { exact: true })).toBeVisible();
  await keys.getByLabel("Command for new mapping").fill("percent-command");
  await keys.getByLabel("Command for new mapping").press("Tab");
  await keys.getByRole("button", { name: "Add mapping" }).click();
  const intlBackslash = keys.getByLabel("Key for new mapping");
  await intlBackslash.dispatchEvent("keydown", {
    key: "Intl Backslash",
    code: "IntlBackslash",
    bubbles: true,
    cancelable: true,
  });
  await expect(intlBackslash).toHaveText("IntlBackslash");
  await expect(intlBackslash.getByText("(IntlBackslash)", { exact: true })).toHaveCount(0);
  await keys
    .getByLabel("Command for new mapping")
    .locator("..")
    .getByRole("button", { name: "Remove" })
    .click();

  const highlights = await settingsGroup(dialog, "Highlights", "Highlights");
  await highlights.getByRole("button", { name: "Edit glow" }).click();
  let editor = highlights.getByRole("region", { name: "Edit highlights" });
  await editor.getByLabel("Foreground").fill("blue");
  await editor.getByRole("button", { name: "Save highlights" }).click();
  await highlights.getByRole("button", { name: "New highlight" }).click();
  editor = highlights.getByRole("region", { name: "Edit highlights" });
  await editor.getByLabel("Pattern").fill("spark");
  await editor.getByRole("button", { name: "Save highlights" }).click();
  await highlights.getByRole("button", { name: "Edit spark" }).click();
  editor = highlights.getByRole("region", { name: "Edit highlights" });
  await editor.getByLabel("Enabled", { exact: true }).uncheck();
  await editor.getByRole("button", { name: "Save highlights" }).click();
  await highlights.getByRole("button", { name: "Delete spark" }).click();
  await confirmDefinitionDelete(page, "spark");

  const functions = await settingsGroup(dialog, "Functions", "Functions");
  await functions.getByRole("button", { name: "Edit greet" }).click();
  editor = functions.getByRole("region", { name: "Edit functions" });
  await editor.getByLabel("Script", { exact: true }).fill("send salute");
  await editor.getByRole("button", { name: "Save functions" }).click();
  await functions.getByRole("button", { name: "New function" }).click();
  editor = functions.getByRole("region", { name: "Edit functions" });
  await editor.getByLabel("Name").fill("temporary");
  await editor.getByLabel("Script", { exact: true }).fill("send temporary");
  await editor.getByRole("button", { name: "Save functions" }).click();
  await functions.getByRole("button", { name: "Edit temporary" }).click();
  editor = functions.getByRole("region", { name: "Edit functions" });
  await editor.getByLabel("Enabled", { exact: true }).uncheck();
  await editor.getByRole("button", { name: "Save functions" }).click();
  await functions.getByRole("button", { name: "Delete temporary" }).click();
  await confirmDefinitionDelete(page, "temporary");

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
    { code: "Digit5", legacyKey: "%", command: "percent-command", enabled: true },
  ]);
  expect(persisted.highlights).toMatchObject([
    { id: "highlight-local", patternSource: "glow", style: { fg: "blue" }, enabled: true },
  ]);
  expect(persisted.functions).toMatchObject([
    { id: "function-greet", name: "greet", script: "send salute", enabled: true },
  ]);

  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await skipChangedSettingsBackup(dialog);
  const input = page.getByLabel("Command input", { exact: true });
  await page.getByTestId("phase2-shell").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("F2");
  await page.keyboard.press("5");
  expect(endpoint.commands).not.toContain("percent-command");
  await input.fill("");
  await page.evaluate(() =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "%",
        code: "Digit5",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await input.fill("fn");
  await input.press("Enter");
  await expect
    .poll(() => endpoint.commands)
    .toEqual(expect.arrayContaining(["inventory", "percent-command", "salute"]));
  endpoint.sendText("glow\n");
  await expect(page.getByLabel("Terminal output").locator(".ansi-fg-blue")).toContainText("glow");

  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const reloadedKeys = await settingsGroup(settingsDialog(page), "Controls", "Key mappings");
  await expect(reloadedKeys.getByLabel("Command for F2")).toHaveValue("inventory");
});

test("Phase 2 confirms definition deletion and restores it when Settings is canceled", async ({
  page,
}) => {
  await installDirectDefinitions(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = settingsDialog(page);
  const keys = await settingsGroup(dialog, "Controls", "Key mappings");

  await keys.getByRole("button", { name: "Add mapping" }).click();
  await expect(keys.getByLabel("Key for new mapping")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Edit key mappings", exact: true })).toHaveCount(0);
  await keys
    .getByLabel("Command for new mapping")
    .locator("..")
    .getByRole("button", { name: "Remove" })
    .click();

  await keys
    .getByLabel("Command for F2")
    .locator("..")
    .getByRole("button", { name: "Remove" })
    .click();
  const confirmation = page.getByRole("dialog", { name: "Delete F2", exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Keep it" }).click();
  await expect(keys.getByLabel("Command for F2")).toBeVisible();

  await keys
    .getByLabel("Command for F2")
    .locator("..")
    .getByRole("button", { name: "Remove" })
    .click();
  await confirmDefinitionDelete(page, "F2");
  await expect(keys.getByLabel("Command for F2")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await skipChangedSettingsBackup(dialog);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const reopened = settingsDialog(page);
  const restored = await settingsGroup(reopened, "Controls", "Key mappings");
  await expect(restored.getByLabel("Command for F2")).toBeVisible();
  const aliases = await settingsGroup(reopened, "Aliases", "Aliases");
  await expect(aliases.getByLabel("Search Aliases")).toBeVisible();
  await expect(aliases.getByRole("button", { name: "New alias" })).toBeVisible();
  await expect(aliases.getByRole("region", { name: "Edit aliases" })).toBeVisible();
  for (const action of ["Up", "Down", "Duplicate", "Delete fn"])
    await expect(aliases.getByRole("button", { name: action, exact: true })).toBeVisible();
});

test("Phase 2 routes shared direct definitions through stale-safe publication", async ({
  page,
}) => {
  const endpoint = fixtures.endpoints.ws;
  await installDirectDefinitions(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = settingsDialog(page);
  const keys = await settingsGroup(dialog, "Controls", "Key mappings");
  await expect(keys.getByLabel("Command for F3")).toHaveValue("shared-before");

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
  await expect(keys.getByLabel("Command for F3")).toHaveValue("external-command");
  await keys.getByLabel("Command for F3").fill("shared-after");
  await keys.getByLabel("Command for F3").press("Tab");

  const highlights = await settingsGroup(dialog, "Highlights", "Highlights");
  await highlights.getByRole("button", { name: "Edit shimmer" }).click();
  let editor = highlights.getByRole("region", { name: "Edit highlights" });
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

  await dialog.getByRole("button", { name: "Save", exact: true }).click();
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
    if (groupName === "Key mappings") {
      await group.getByLabel(`Enable ${label}`).uncheck();
      await group
        .getByLabel(`Command for ${label}`)
        .locator("..")
        .getByRole("button", { name: "Remove" })
        .click();
      await confirmDefinitionDelete(page, label);
      continue;
    }
    await group.getByRole("button", { name: `Edit ${label}` }).click();
    const activeEditor = group.getByRole("region", { name: `Edit ${groupName.toLowerCase()}` });
    await activeEditor.getByLabel("Enabled", { exact: true }).uncheck();
    await activeEditor.getByRole("button", { name: `Save ${groupName.toLowerCase()}` }).click();
    await group.getByRole("button", { name: `Delete ${label}` }).click();
    await confirmDefinitionDelete(page, label);
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
      .getByRole("region", { name: /^Automation step \d+$/ })
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
  await aliases.getByRole("button", { name: "New alias" }).click();
  editor = aliases.getByRole("region", { name: "Edit aliases" });
  await editor.getByLabel("Trigger", { exact: true }).fill("temporary alias");
  await editor.getByLabel("Template").fill("temporary");
  await editor.getByRole("button", { name: "Save aliases" }).click();
  await aliases.getByRole("button", { name: "Edit temporary alias" }).click();
  editor = aliases.getByRole("region", { name: "Edit aliases" });
  await editor.getByLabel("Enabled", { exact: true }).uncheck();
  await editor.getByRole("button", { name: "Save aliases" }).click();
  await aliases.getByRole("button", { name: "Delete temporary alias" }).click();
  await confirmDefinitionDelete(page, "temporary alias");

  const triggers = await settingsGroup(dialog, "Triggers", "Triggers");
  await triggers.getByRole("button", { name: "Edit danger" }).click();
  editor = triggers.getByRole("region", { name: "Edit triggers" });
  await editor.getByLabel("Template").fill("retreat");
  await editor.getByRole("button", { name: "Save triggers" }).click();
  await triggers.getByRole("button", { name: "New trigger" }).click();
  editor = triggers.getByRole("region", { name: "Edit triggers" });
  await expect(editor.getByLabel("Enabled", { exact: true })).toBeChecked();
  await expect(
    editor.getByRole("region", { name: "Automation step 1" }).getByLabel("Step type"),
  ).toHaveValue("send_command");
  await editor.getByLabel("Pattern").fill("temporary trigger");
  await editor.getByLabel("Template").fill("temporary");
  await editor.getByRole("button", { name: "Save triggers" }).click();
  await triggers.getByRole("button", { name: "Edit temporary trigger" }).click();
  editor = triggers.getByRole("region", { name: "Edit triggers" });
  await editor.getByLabel("Enabled", { exact: true }).uncheck();
  await editor.getByRole("button", { name: "Save triggers" }).click();
  await triggers.getByRole("button", { name: "Delete temporary trigger" }).click();
  await confirmDefinitionDelete(page, "temporary trigger");

  const timers = await settingsGroup(dialog, "Timers", "Timers");
  await timers.getByRole("button", { name: "Edit pulse" }).click();
  editor = timers.getByRole("region", { name: "Edit timers" });
  await editor.getByLabel("Duration (seconds)").fill("1");
  await editor.getByLabel("Start automatically").check();
  await editor.getByLabel("Template").fill("timer-after");
  await editor.getByRole("button", { name: "Save timers" }).click();
  await timers.getByRole("button", { name: "New timer" }).click();
  editor = timers.getByRole("region", { name: "Edit timers" });
  await editor.getByLabel("Name").fill("temporary timer");
  await editor.getByLabel("Template").fill("temporary");
  await editor.getByRole("button", { name: "Save timers" }).click();
  await timers.getByRole("button", { name: "Edit temporary timer" }).click();
  editor = timers.getByRole("region", { name: "Edit timers" });
  await editor.getByLabel("Enabled", { exact: true }).uncheck();
  await editor.getByRole("button", { name: "Save timers" }).click();
  await timers.getByRole("button", { name: "Delete temporary timer" }).click();
  await confirmDefinitionDelete(page, "temporary timer");

  const persistedDefinitions = await page.evaluate(() => {
    const graph = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
    return (Object.values(graph.characterProfiles)[0] as { localDefinitions: unknown })
      .localDefinitions;
  });
  expect(JSON.stringify(persistedDefinitions)).not.toContain("timerHandles");
  expect(JSON.stringify(persistedDefinitions)).not.toContain("automationVariables");

  await dialog.getByRole("button", { name: "Save", exact: true }).click();
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

test("Phase 2 aliases restore legacy discovery, authoring, and safe preview", async ({ page }) => {
  const endpoint = fixtures.endpoints.ws;
  await installAutomationDefinitions(page);
  await page.evaluate(() => {
    const key = "darkflow-session-core-v1";
    const graph = JSON.parse(localStorage.getItem(key)!);
    const character = Object.values(graph.characterProfiles)[0] as {
      localDefinitions: { aliases: Array<Record<string, unknown>> };
    };
    const localAliases = character.localDefinitions.aliases;
    localAliases.find(({ id }) => id === "alias-local")!.group = "travel";
    localAliases.find(({ id }) => id === "alias-local")!.description = "Quick route";
    localAliases.find(({ id }) => id === "alias-all-steps")!.group = "Combat";
    localAliases.find(({ id }) => id === "alias-function")!.group = "Utility";
    const sharedAliases = Object.values(graph.configurationSets).find(
      (set) => (set as { kind: string }).kind === "aliases",
    ) as { definitions: Array<Record<string, unknown>> };
    sharedAliases.definitions[0]!.group = "Travel";
    localStorage.setItem(key, JSON.stringify(graph));
    localStorage.setItem("darkwind-settings-automation-ui", JSON.stringify({ future: "keep" }));
  });
  await page.reload();
  await connect(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  let aliases = await settingsGroup(settingsDialog(page), "Aliases", "Aliases");
  const filters = aliases.getByLabel("Alias groups");

  await expect(filters.getByLabel("Travel (2)")).toBeChecked();
  await expect(filters.getByLabel("Combat (1)")).toBeChecked();
  await expect(filters.getByLabel("Utility (1)")).toBeChecked();
  await expect(filters.getByLabel(/Ungrouped \(\d+\)/)).toBeChecked();
  await filters.getByRole("button", { name: "Unselect all", exact: true }).click();
  await expect(aliases.getByText("No aliases match.")).toBeVisible();
  await filters.getByLabel("Travel (2)").check();

  const search = aliases.getByLabel("Search Aliases");
  await search.fill("Quick route");
  const quick = aliases.getByRole("button", { name: "Edit quick" });
  await expect(quick.locator("strong")).toHaveText("Quick route");
  await expect(quick.locator("small").first()).toContainText("quick");
  await search.fill("travel");
  await expect(quick).toBeVisible();
  const sharedAlias = aliases.getByRole("button", { name: "Edit sharedalias" });
  await expect(sharedAlias).toBeVisible();
  await quick.focus();
  await quick.press("ArrowUp");
  await expect(sharedAlias).toBeFocused();
  await expect(
    aliases.getByRole("region", { name: "Edit aliases" }).getByLabel("Trigger", { exact: true }),
  ).toHaveValue("sharedalias");
  await search.fill("");

  await aliases.getByRole("button", { name: "New alias" }).click();
  let editor = aliases.getByRole("region", { name: "Edit aliases" });
  await expect(editor.getByLabel("Enabled", { exact: true })).toBeChecked();
  await expect(
    editor.getByRole("region", { name: "Automation step 1" }).getByLabel("Step type"),
  ).toHaveValue("send_command");
  await expect(editor.getByLabel("Ignore case")).toHaveCount(0);
  await expect(
    editor.getByText("Name is recommended so this alias is easy to find."),
  ).toBeVisible();
  await expect(editor.getByText("Step 1 needs content.")).toBeVisible();
  await editor.getByLabel("Regular expression").check();
  await expect(editor.getByLabel("Ignore case")).toBeChecked();
  await editor.getByLabel("Trigger", { exact: true }).fill("[");
  await expect(editor.getByRole("list")).toContainText(/regular expression|unterminated/i);
  await editor.getByLabel("Regular expression").uncheck();
  await editor.getByLabel("Trigger", { exact: true }).fill("travel draft");
  await editor.getByLabel("Name", { exact: true }).fill("Draft route");
  await editor.getByLabel("Template", { exact: true }).fill("score");

  await quick.click();
  await expect(
    aliases.getByText("Save or Cancel the current edit before selecting another definition."),
  ).toBeVisible();
  await expect(editor.getByLabel("Trigger", { exact: true })).toHaveValue("travel draft");

  await editor.getByLabel("Add step type").selectOption("set_alias_enabled");
  await editor.getByRole("button", { name: "Add automation step" }).click();
  const secondStep = editor.getByRole("region", { name: "Automation step 2" });
  await secondStep.getByLabel("Target").selectOption("alias-local");
  await expect(secondStep.getByLabel("Target")).toHaveValue("alias-local");
  await secondStep.getByRole("button", { name: "Move step up" }).click();
  await expect(
    editor.getByRole("region", { name: "Automation step 1" }).getByLabel("Step type"),
  ).toHaveValue("set_alias_enabled");
  await editor
    .getByRole("region", { name: "Automation step 1" })
    .getByRole("button", { name: "Remove step" })
    .click();
  await editor
    .getByRole("region", { name: "Automation step 1" })
    .getByRole("button", { name: "Remove step" })
    .click();
  await expect(
    editor.getByRole("region", { name: "Automation step 1" }).getByLabel("Step type"),
  ).toHaveValue("send_command");
  await editor.getByLabel("Template", { exact: true }).fill("score");

  const commandsBeforePreview = endpoint.commands.length;
  await editor.getByLabel("Test input", { exact: true }).fill("travel draft");
  await expect(editor.getByText("Matches: travel draft")).toBeVisible();
  await expect(editor.getByText("Send: score")).toBeVisible();
  await editor.getByLabel("Add step type").selectOption("script");
  await editor.getByRole("button", { name: "Add automation step" }).click();
  await editor.getByLabel("Script", { exact: true }).fill("while 1 == 1\n  send ping\nend");
  await expect(editor.getByText("Send: ping")).toHaveCount(10);
  await expect(editor.getByText(/Loop preview stopped after 10 iterations/)).toBeVisible();
  expect(endpoint.commands).toHaveLength(commandsBeforePreview);

  await editor.getByRole("button", { name: "Test input", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Test input", exact: true })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("darkwind-settings-automation-ui")!)),
  ).toEqual({ future: "keep", aliasPreviewCollapsed: true });

  await page.reload();
  await connect(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  aliases = await settingsGroup(settingsDialog(page), "Aliases", "Aliases");
  editor = aliases.getByRole("region", { name: "Edit aliases" });
  await expect(editor.getByRole("button", { name: "Test input", exact: true })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("Phase 2 triggers restore legacy discovery, authoring, and safe preview", async ({ page }) => {
  const endpoint = fixtures.endpoints.ws;
  await installAutomationDefinitions(page);
  await page.evaluate(() => {
    const key = "darkflow-session-core-v1";
    const graph = JSON.parse(localStorage.getItem(key)!);
    const character = Object.values(graph.characterProfiles)[0] as {
      localDefinitions: { triggers: Array<Record<string, unknown>> };
    };
    character.localDefinitions.triggers = [
      {
        id: "trigger-first",
        enabled: true,
        pattern: "danger *",
        description: "First warning",
        group: "Travel",
        isRegex: false,
        ignoreCase: false,
        gag: false,
        steps: [{ type: "send_command", template: "mark %1" }],
      },
      {
        id: "trigger-second",
        enabled: true,
        pattern: "danger %1",
        description: "Second warning",
        group: "Combat",
        isRegex: false,
        ignoreCase: false,
        gag: true,
        steps: [{ type: "send_command", template: "flee %1" }],
      },
      {
        id: "trigger-run",
        enabled: true,
        pattern: "legacy",
        description: "Legacy run",
        group: "combat",
        isRegex: false,
        ignoreCase: false,
        gag: false,
        steps: [{ type: "run_alias", template: "missing legacy arguments" }],
      },
      {
        id: "trigger-ungrouped",
        enabled: true,
        pattern: "plain",
        description: "Plain warning",
        group: "",
        isRegex: false,
        ignoreCase: false,
        gag: false,
        steps: [{ type: "send_command", template: "plain" }],
      },
    ];
    localStorage.setItem(key, JSON.stringify(graph));
    localStorage.setItem("darkwind-settings-automation-ui", JSON.stringify({ future: "keep" }));
  });
  await page.reload();
  await connect(page);
  await page.evaluate(() => {
    const target = window as unknown as {
      __darkflowPhase1Runtime: { session: { audio: { playLocal(...args: unknown[]): boolean } } };
      __triggerSoundCalls: unknown[][];
    };
    target.__triggerSoundCalls = [];
    target.__darkflowPhase1Runtime.session.audio.playLocal = (...args) => {
      target.__triggerSoundCalls.push(args);
      return true;
    };
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  let triggers = await settingsGroup(settingsDialog(page), "Triggers", "Triggers");
  const filters = triggers.getByLabel("Trigger groups");
  await expect(filters.getByLabel("Combat (2)")).toBeChecked();
  await expect(filters.getByLabel("Travel (1)")).toBeChecked();
  await expect(filters.getByLabel(/Ungrouped \(\d+\)/)).toBeChecked();
  await filters.getByRole("button", { name: "Unselect all", exact: true }).click();
  await expect(triggers.getByText("No triggers match.")).toBeVisible();
  await filters.getByRole("button", { name: "Select all", exact: true }).click();
  await triggers.getByLabel("Search Triggers").fill("First warning");
  const first = triggers.getByRole("button", { name: "Edit danger *" });
  await expect(first.locator("strong")).toHaveText("First warning");
  await expect(first).toContainText("danger *");
  await triggers.getByLabel("Search Triggers").fill("");

  await triggers.getByRole("button", { name: "New trigger" }).click();
  let editor = triggers.getByRole("region", { name: "Edit triggers" });
  await expect(
    editor.getByRole("region", { name: "Automation step 1" }).getByLabel("Step type"),
  ).toHaveValue("send_command");
  await expect(editor.getByLabel("Enabled", { exact: true })).toBeChecked();
  await expect(editor.getByLabel("Regular expression")).not.toBeChecked();
  await expect(editor.getByLabel("Ignore case")).not.toBeChecked();
  await expect(editor.getByLabel("Gag matching output")).not.toBeChecked();
  await expect(
    editor.getByText("Name is recommended so this trigger is easy to find."),
  ).toBeVisible();
  await expect(editor.getByText("Pattern needs content.")).toBeVisible();
  await editor.getByLabel("Regular expression").check();
  await editor.getByLabel("Pattern").fill("[");
  await expect(editor.getByRole("list")).toContainText(/regular expression|unterminated/i);
  await editor.getByLabel("Pattern").fill("draft");
  await first.click();
  await expect(
    triggers.getByText("Save or Cancel the current edit before selecting another definition."),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Cancel edit" }).click();

  await triggers.getByRole("button", { name: "Edit legacy" }).click();
  editor = triggers.getByRole("region", { name: "Edit triggers" });
  const legacyStep = editor.getByRole("region", { name: "Automation step 1" });
  await expect(legacyStep.getByRole("combobox").nth(1)).toContainText(
    "Unresolved: missing legacy arguments",
  );
  await triggers.getByRole("button", { name: "Edit danger *" }).click();
  editor = triggers.getByRole("region", { name: "Edit triggers" });
  await editor.getByLabel("Add step type").selectOption("run_alias");
  await editor.getByRole("button", { name: "Add automation step" }).click();
  const runStep = editor.getByRole("region", { name: "Automation step 2" });
  await runStep.getByRole("combobox").nth(1).selectOption("alias-local");
  await runStep.getByLabel("Arguments").fill("north");
  await expect(runStep.getByLabel("Arguments")).toHaveValue("north");
  await editor.getByLabel("Add step type").selectOption("play_sound");
  await editor.getByRole("button", { name: "Add automation step" }).click();
  const soundStep = editor.getByRole("region", { name: "Automation step 3" });
  await expect(soundStep.getByLabel("Category")).toBeVisible();
  await expect(soundStep.getByLabel("Volume (100%)")).toHaveAttribute("type", "range");
  await soundStep.getByLabel("Category").selectOption("alert");
  await expect(soundStep.getByRole("combobox").nth(2)).not.toHaveValue("");
  await soundStep.getByLabel("Volume (100%)").fill("0.5");
  await soundStep.getByRole("button", { name: "Test Sound" }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { __triggerSoundCalls: unknown[][] }).__triggerSoundCalls,
    ),
  ).toHaveLength(1);
  await editor.getByRole("button", { name: "Save triggers" }).click();

  await triggers.getByRole("button", { name: "Edit danger *" }).click();
  editor = triggers.getByRole("region", { name: "Edit triggers" });
  await expect(
    editor.getByRole("region", { name: "Automation step 2" }).getByLabel("Arguments"),
  ).toHaveValue("north");
  const savedSound = editor.getByRole("region", { name: "Automation step 3" });
  await expect(savedSound.getByLabel("Category")).toHaveValue("alert");
  await expect(savedSound.getByRole("combobox").nth(2)).not.toHaveValue("");
  await expect(savedSound.getByLabel("Volume (50%)")).toHaveValue("0.5");
  await editor
    .getByRole("region", { name: "Automation step 1" })
    .getByLabel("Template")
    .fill("unsaved %1");
  const commandsBefore = endpoint.commands.length;
  await editor.getByLabel("Test output", { exact: true }).fill("danger orc");
  await expect(editor.getByText("Matches: danger *, danger %1")).toBeVisible();
  await expect(editor.getByText("Captures: %1=orc")).toHaveCount(2);
  await expect(editor.getByText("Gag: yes")).toBeVisible();
  await expect(editor.getByText("Send: unsaved orc")).toBeVisible();
  expect(endpoint.commands).toHaveLength(commandsBefore);
  expect(
    await page.evaluate(
      () => (window as unknown as { __triggerSoundCalls: unknown[][] }).__triggerSoundCalls,
    ),
  ).toHaveLength(1);
  await editor.getByRole("button", { name: "Test output", exact: true }).click();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("darkwind-settings-automation-ui")!)),
  ).toEqual({ future: "keep", triggerPreviewCollapsed: true });
  await page.reload();
  await connect(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  triggers = await settingsGroup(settingsDialog(page), "Triggers", "Triggers");
  editor = triggers.getByRole("region", { name: "Edit triggers" });
  await expect(editor.getByRole("button", { name: "Test output", exact: true })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
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
  await editor.getByLabel("Duration (seconds)").fill("1");
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

  await dialog.getByRole("button", { name: "Save", exact: true }).click();
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
    await confirmDefinitionDelete(page, label);
  }
});

test("Phase 2 timers restore legacy discovery, authoring, controls, and safe preview", async ({
  page,
}) => {
  const endpoint = fixtures.endpoints.ws;
  await installAutomationDefinitions(page);
  await page.evaluate(() => {
    const key = "darkflow-session-core-v1";
    const graph = JSON.parse(localStorage.getItem(key)!);
    const character = Object.values(graph.characterProfiles)[0] as {
      localDefinitions: { timers: Array<Record<string, unknown>> };
    };
    character.localDefinitions.timers.push(
      {
        id: "timer-combat",
        enabled: true,
        name: "combat pulse",
        description: "Combat pulse",
        group: "Combat",
        durationMs: 30000,
        recurring: true,
        autoStart: true,
        steps: [{ type: "send_command", template: "combat-pulse" }],
      },
      {
        id: "timer-ungrouped",
        enabled: true,
        name: "plain pulse",
        description: "Plain pulse",
        group: "",
        durationMs: 1000,
        recurring: false,
        autoStart: false,
        steps: [{ type: "run_alias", template: "missing legacy arguments" }],
      },
      {
        id: "timer-travel",
        enabled: true,
        name: "travel pulse",
        description: "Travel pulse",
        group: "Travel",
        durationMs: 1000,
        recurring: false,
        autoStart: false,
        steps: [{ type: "send_command", template: "travel-pulse" }],
      },
    );
    character.localDefinitions.timers[0]!.group = "combat";
    localStorage.setItem(key, JSON.stringify(graph));
    localStorage.setItem("darkwind-settings-automation-ui", JSON.stringify({ future: "keep" }));
  });
  await page.reload();
  await connect(page);
  await page.evaluate(() => {
    const target = window as unknown as {
      __darkflowPhase1Runtime: { session: { audio: { playLocal(...args: unknown[]): boolean } } };
      __timerPreviewAudioCalls: unknown[][];
    };
    target.__timerPreviewAudioCalls = [];
    target.__darkflowPhase1Runtime.session.audio.playLocal = (...args) => {
      target.__timerPreviewAudioCalls.push(args);
      return true;
    };
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const timers = await settingsGroup(settingsDialog(page), "Timers", "Timers");
  const filters = timers.getByLabel("Timer groups");
  await expect(filters.getByLabel(/combat \(2\)/i)).toBeChecked();
  await expect(filters.getByLabel(/Ungrouped \(\d+\)/)).toBeChecked();
  await filters.getByRole("button", { name: "Unselect all", exact: true }).click();
  await expect(timers.getByText("No timers match.")).toBeVisible();
  await filters.getByLabel(/combat \(2\)/i).check();
  await timers.getByLabel("Search Timers").fill("pulse");
  await expect(timers.getByRole("button", { name: "Edit pulse" })).toBeVisible();
  await expect(timers.getByRole("button", { name: "Edit travel pulse" })).not.toBeVisible();
  await filters.getByRole("button", { name: "Select all", exact: true }).click();
  await timers.getByLabel("Search Timers").fill("");
  const pulse = timers.getByRole("button", { name: "Edit pulse" });
  await expect(pulse).toContainText("1m, once, 1 step");
  await pulse.click();
  let editor = timers.getByRole("region", { name: "Edit timers" });
  await expect(editor.getByLabel("Duration (seconds)")).toHaveValue("60");
  await expect(editor.getByRole("button", { name: "Start" })).toBeVisible();
  await editor.getByRole("button", { name: "Start" }).click();
  await expect(editor.getByText("Timer started.")).toBeVisible();
  const started = await page.evaluate(() =>
    (
      window as unknown as {
        __darkflowPhase1Runtime: {
          session: { terminal: { automation: { getTimerRuntimeState(id: string): unknown } } };
        };
      }
    ).__darkflowPhase1Runtime.session.terminal.automation.getTimerRuntimeState("timer-local"),
  );
  expect(started).not.toBeNull();
  await page.waitForTimeout(2);
  await editor.getByRole("button", { name: "Reset" }).click();
  await expect(editor.getByText("Timer reset.")).toBeVisible();
  expect(
    await page.evaluate(() =>
      (
        window as unknown as {
          __darkflowPhase1Runtime: {
            session: { terminal: { automation: { getTimerRuntimeState(id: string): unknown } } };
          };
        }
      ).__darkflowPhase1Runtime.session.terminal.automation.getTimerRuntimeState("timer-local"),
    ),
  ).not.toEqual(started);
  await editor.getByRole("button", { name: "Stop" }).click();
  await expect(editor.getByText("Timer stopped.")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as {
            __darkflowPhase1Runtime: {
              session: {
                terminal: { automation: { getTimerRuntimeState(id: string): unknown } };
              };
            };
          }
        ).__darkflowPhase1Runtime.session.terminal.automation.getTimerRuntimeState("timer-local"),
      ),
    )
    .toBeNull();
  await editor.getByRole("button", { name: "Run now" }).click();
  await expect(editor.getByText("Timer ran once.")).toBeVisible();
  await expect.poll(() => endpoint.commands).toContain("pulse-before");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as {
            __darkflowPhase1Runtime: {
              session: {
                terminal: { automation: { getTimerRuntimeState(id: string): unknown } };
              };
            };
          }
        ).__darkflowPhase1Runtime.session.terminal.automation.getTimerRuntimeState("timer-local"),
      ),
    )
    .toBeNull();
  await editor.getByLabel("Duration (seconds)").fill("125");
  await editor.getByLabel("Add step type").selectOption("run_alias");
  await editor.getByRole("button", { name: "Add automation step" }).click();
  const runStep = editor.getByRole("region", { name: "Automation step 2" });
  await runStep.getByRole("combobox").nth(1).selectOption("alias-local");
  await runStep.getByLabel("Arguments").fill("north");
  await editor.getByRole("button", { name: "Save timers" }).click();
  expect(
    await page.evaluate(() => {
      const graph = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
      const character = Object.values(graph.characterProfiles)[0] as {
        localDefinitions: { timers: Array<{ id: string; durationMs: number }> };
      };
      return character.localDefinitions.timers.find(({ id }) => id === "timer-local")!.durationMs;
    }),
  ).toBe(125000);
  await expect(pulse).toContainText("2m 5s, once, 2 steps");
  await pulse.click();
  editor = timers.getByRole("region", { name: "Edit timers" });
  await expect(
    editor.getByRole("region", { name: "Automation step 2" }).getByLabel("Arguments"),
  ).toHaveValue("north");
  await editor.getByLabel("Add step type").selectOption("set_variable");
  await editor.getByRole("button", { name: "Add automation step" }).click();
  const variableStep = editor.getByRole("region", { name: "Automation step 3" });
  await variableStep.getByLabel("Variable name").fill("preview_only");
  await variableStep.getByLabel("Template").fill("value");
  await editor.getByLabel("Add step type").selectOption("play_sound");
  await editor.getByRole("button", { name: "Add automation step" }).click();
  const effectsBeforePreview = await page.evaluate(() => ({
    timer: (
      window as unknown as {
        __darkflowPhase1Runtime: {
          session: {
            terminal: {
              automation: {
                getAutomationVariables(): Record<string, string>;
                getTimerRuntimeState(id: string): unknown;
              };
            };
          };
        };
      }
    ).__darkflowPhase1Runtime.session.terminal.automation.getTimerRuntimeState("timer-local"),
    variables: (
      window as unknown as {
        __darkflowPhase1Runtime: {
          session: {
            terminal: { automation: { getAutomationVariables(): Record<string, string> } };
          };
        };
      }
    ).__darkflowPhase1Runtime.session.terminal.automation.getAutomationVariables(),
    audio: (window as unknown as { __timerPreviewAudioCalls: unknown[][] })
      .__timerPreviewAudioCalls,
  }));
  const commandsBeforePreview = endpoint.commands.length;
  await editor
    .getByRole("region", { name: "Automation step 1" })
    .getByLabel("Template")
    .fill("preview-only");
  await expect(editor.getByText("Runs after: 2m 5s. Starts manually.")).toBeVisible();
  await expect(editor.getByText("Send: preview-only")).toBeVisible();
  expect(endpoint.commands).toHaveLength(commandsBeforePreview);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as {
          __darkflowPhase1Runtime: {
            session: { terminal: { automation: { getTimerRuntimeState(id: string): unknown } } };
          };
        }
      ).__darkflowPhase1Runtime.session.terminal.automation.getTimerRuntimeState("timer-local"),
    ),
  ).toEqual(effectsBeforePreview.timer);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as {
          __darkflowPhase1Runtime: {
            session: {
              terminal: { automation: { getAutomationVariables(): Record<string, string> } };
            };
          };
        }
      ).__darkflowPhase1Runtime.session.terminal.automation.getAutomationVariables(),
    ),
  ).toEqual(effectsBeforePreview.variables);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __timerPreviewAudioCalls: unknown[][] }).__timerPreviewAudioCalls,
    ),
  ).toEqual(effectsBeforePreview.audio);
  await editor.getByRole("button", { name: "Cancel edit" }).click();
  const legacy = timers.getByRole("button", { name: "Edit plain pulse" });
  await legacy.click();
  editor = timers.getByRole("region", { name: "Edit timers" });
  const legacyStep = editor.getByRole("region", { name: "Automation step 1" });
  await expect(legacyStep.getByRole("combobox").nth(1)).toContainText(
    "Unresolved: missing legacy arguments",
  );
  await editor.getByText("Template syntax", { exact: true }).click();
  await expect(editor.getByText(/%0 is the timer name/)).toBeVisible();
  await expect(editor.getByText("Runs after: 1s. Starts manually.")).toBeVisible();
  await editor.getByRole("button", { name: "Timer preview" }).click();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("darkwind-settings-automation-ui")!)),
  ).toEqual({ future: "keep", timerPreviewCollapsed: true });
  await page.reload();
  await connect(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const reloadedTimers = await settingsGroup(settingsDialog(page), "Timers", "Timers");
  await reloadedTimers.getByRole("button", { name: "Edit pulse" }).click();
  await expect(
    reloadedTimers.getByRole("region", { name: "Edit timers" }).getByRole("button", {
      name: "Timer preview",
    }),
  ).toHaveAttribute("aria-expanded", "false");
  await reloadedTimers.getByRole("button", { name: "New timer" }).click();
  editor = reloadedTimers.getByRole("region", { name: "Edit timers" });
  await expect(editor.getByLabel("Enabled", { exact: true })).toBeChecked();
  await expect(editor.getByLabel("Duration (seconds)")).toHaveValue("60");
  await expect(
    editor.getByRole("region", { name: "Automation step 1" }).getByLabel("Step type"),
  ).toHaveValue("send_command");
  await expect(editor.getByText("Save this timer before using controls.")).toBeVisible();
  await expect(editor.getByText("Timer name needs content.")).toBeVisible();
  await expect(editor.getByText("Step 1 needs content.")).toBeVisible();
  await editor.getByLabel("Name").fill("invalid duration");
  await editor.getByLabel("Template").fill("look");
  await editor.getByLabel("Duration (seconds)").fill("0");
  await expect(
    editor.getByText("Timer duration needs whole seconds from 1 to 86400."),
  ).toBeVisible();
  const timerCount = await page.evaluate(() => {
    const graph = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
    return (
      Object.values(graph.characterProfiles)[0] as { localDefinitions: { timers: unknown[] } }
    ).localDefinitions.timers.length;
  });
  await editor.getByRole("button", { name: "Save timers" }).click();
  expect(
    await page.evaluate(() => {
      const graph = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
      return (
        Object.values(graph.characterProfiles)[0] as {
          localDefinitions: { timers: unknown[] };
        }
      ).localDefinitions.timers.length;
    }),
  ).toBe(timerCount);
});
