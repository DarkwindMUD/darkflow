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
  await expect(page.getByTestId("connection-status")).toHaveText("Connected via ws");
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
      JSON.stringify({ deferredSetting: { keep: true }, keyMappings: [{ command: "look" }] }),
    ),
  );

  const settingsButton = page.getByRole("button", { name: "Settings", exact: true });
  await settingsButton.click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Theme").selectOption("nord");
  await dialog.getByLabel("Repeat last command").uncheck();
  await dialog.getByLabel("Complete aliases with Tab").uncheck();
  await dialog.getByLabel("Complete from history with Tab").check();
  await dialog.getByRole("button", { name: "Add variable" }).click();
  await dialog.getByLabel("Name").fill("target");
  await dialog.getByLabel("Value").fill("goblin");
  await dialog.getByRole("button", { name: "Apply" }).click();

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
    historyTabCompletionEnabled: true,
    keyMappings: [{ command: "look" }],
    repeatLastCommand: false,
    theme: "nord",
  });
  expect(saved.variables).toMatchObject({ target: "goblin" });
  expect(loadedScripts.some((url) => url.endsWith("/js/app.js"))).toBe(false);

  await page.reload();
  await settingsButton.click();
  await expect(dialog.getByLabel("Theme")).toHaveValue("nord");
  await expect(dialog.getByLabel("Repeat last command")).not.toBeChecked();
  await expect(dialog.getByLabel("Complete aliases with Tab")).not.toBeChecked();
  await expect(dialog.getByLabel("Complete from history with Tab")).toBeChecked();
  await expect(dialog.getByText("Variables last for this session only.")).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveCount(0);
});

test("Phase 2 settings remain usable on a mobile viewport", async ({ page }) => {
  await page.goto("/phase2/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await dialog.getByRole("button", { name: "Close settings" }).click();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeFocused();
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
  await expect(dialog.getByLabel("Repeat last command")).toBeChecked();

  await dialog.getByRole("button", { name: "Apply" }).click();
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
  await dialog.getByLabel("Repeat last command").uncheck();
  await dialog.getByRole("button", { name: "Apply" }).click();
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
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await page.getByRole("checkbox", { name: "Avatar", exact: true }).uncheck();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("button", { name: "Reset workspace", exact: true }).click();

  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace reset");
  await expect(page.locator('.information-panel[data-panel-id="avatar"]')).toHaveCount(1);
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

  const keys = dialog.getByRole("group", { name: "Key mappings" });
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

  const highlights = dialog.getByRole("group", { name: "Highlights" });
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

  const functions = dialog.getByRole("group", { name: "Functions" });
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
  await page.keyboard.press("F2");
  const input = page.getByLabel("Command input", { exact: true });
  await input.fill("fn");
  await input.press("Enter");
  await expect
    .poll(() => endpoint.commands)
    .toEqual(expect.arrayContaining(["inventory", "salute"]));
  endpoint.sendText("glow\n");
  await expect(page.getByLabel("Terminal output").locator(".ansi-fg-blue")).toContainText("glow");

  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const reloadedKeys = settingsDialog(page).getByRole("group", { name: "Key mappings" });
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
  const keys = dialog.getByRole("group", { name: "Key mappings" });
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

  const highlights = dialog.getByRole("group", { name: "Highlights" });
  await highlights.getByRole("button", { name: "Edit shimmer" }).click();
  editor = highlights.getByRole("region", { name: "Edit highlights" });
  await editor.getByLabel("Pattern").fill("");
  await editor.getByRole("button", { name: "Save highlights" }).click();
  await expect(editor.getByLabel("Pattern")).toBeFocused();
  await editor.getByLabel("Pattern").fill("shimmer");
  await editor.getByLabel("Foreground").fill("blue");
  await editor.getByRole("button", { name: "Save highlights" }).click();

  const functions = dialog.getByRole("group", { name: "Functions" });
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
  await connect(page);
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
    const group = settingsDialog(page).getByRole("group", { name: groupName });
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

  const aliases = dialog.getByRole("group", { name: "Aliases" });
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

  const triggers = dialog.getByRole("group", { name: "Triggers" });
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

  const timers = dialog.getByRole("group", { name: "Timers" });
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
  const reloadedAliases = settingsDialog(page).getByRole("group", { name: "Aliases" });
  await reloadedAliases.getByRole("button", { name: "Edit quick" }).click();
  await expect(reloadedAliases.getByLabel("Template")).toHaveValue("inventory");
});

test("Phase 2 publishes shared automation definitions with stale protection", async ({ page }) => {
  const endpoint = fixtures.endpoints.ws;
  await installAutomationDefinitions(page);
  await connect(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = settingsDialog(page);
  const aliases = dialog.getByRole("group", { name: "Aliases" });
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

  const triggers = dialog.getByRole("group", { name: "Triggers" });
  await triggers.getByRole("button", { name: "Edit shared danger" }).click();
  editor = triggers.getByRole("region", { name: "Edit triggers" });
  await editor.getByLabel("Template").fill("shared-trigger-after");
  await editor.getByRole("button", { name: "Save triggers" }).click();

  const timers = dialog.getByRole("group", { name: "Timers" });
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
    const group = settingsDialog(page).getByRole("group", { name: groupName });
    await group.getByRole("button", { name: `Edit ${label}` }).click();
    const activeEditor = group.getByRole("region", {
      name: `Edit ${groupName.toLowerCase()}`,
    });
    await activeEditor.getByLabel("Enabled", { exact: true }).uncheck();
    await activeEditor.getByRole("button", { name: `Save ${groupName.toLowerCase()}` }).click();
    await group.getByRole("button", { name: `Delete ${label}` }).click();
  }
});
