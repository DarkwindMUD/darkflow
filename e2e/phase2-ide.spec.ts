import { createHash } from "node:crypto";
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

function ide(page: Page): Locator {
  return page.getByRole("region", { name: "IDE editor" });
}

function editor(page: Page): Locator {
  return ide(page).locator(".cm-content");
}

function panelDragHandle(page: Page, panelId: string): Locator {
  return page.locator(`[data-panel-drag-handle][data-panel-id="${panelId}"]`);
}

async function dockPanelAsTab(page: Page, panelId: string, targetPanelId: string): Promise<void> {
  // Use the visible label rect, not the drag handle rect. Vendor CSS gives
  // `.dv-tab .dv-default-tab { width: 100% }` inside a `.dv-tab` that has
  // `flex-shrink: 0` but no explicit width -- both resolve to 0. The label
  // stays visible via `overflow: visible`, so it is the only reliable
  // click target across browsers; Firefox and WebKit dispatch pointerdown to
  // whatever their hit-test returns, and a 0-width parent is not it.
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

async function replaceEditorText(page: Page, content: string): Promise<void> {
  const target = editor(page);
  await target.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(content);
  if (content.length < 10_000) {
    await expect
      .poll(() => target.locator(".cm-line").allTextContents())
      .toEqual(content.split("\n"));
  } else await expect(ide(page).getByLabel("Modified")).toBeVisible();
}

async function expectEditorText(page: Page, content: string): Promise<void> {
  await expect
    .poll(() => editor(page).locator(".cm-line").allTextContents())
    .toEqual(content.split("\n"));
}

async function confirmAction(
  page: Page,
  action: () => Promise<void>,
  accept: boolean,
): Promise<void> {
  const dialogPromise = page.waitForEvent("dialog");
  const actionPromise = action();
  const dialog = await dialogPromise;
  expect(dialog.message()).toBe("You have unsaved changes. Close anyway?");
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await actionPromise;
}

async function expectMessage(
  endpoint: TransportEndpoint,
  from: number,
  message: string,
): Promise<void> {
  await expect.poll(() => endpoint.gmcpMessages.slice(from)).toContain(message);
}

test("IDE edits, saves, diagnoses, replaces, reconnects, and preserves its hidden editor", async ({
  page,
}) => {
  const externalEditorRequests: string[] = [];
  await page.route("https://esm.sh/**", async (route) => {
    externalEditorRequests.push(route.request().url());
    await route.abort();
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.hostname === "esm.sh" ||
      (url.hostname !== "127.0.0.1" && /codemirror/i.test(url.href))
    ) {
      externalEditorRequests.push(url.href);
    }
  });

  const endpoint = await connect(page);
  const outboundStart = endpoint.gmcpMessages.length;
  const commandInput = page.getByRole("textbox", { name: "Command input", exact: true });
  await commandInput.focus();
  endpoint.sendGmcp("Darkwind.IDE.Open", {
    path: "/domains/fixture/editable.c",
    title: "Writable fixture",
    content: "int value = 1;\n",
    language: "c",
    readOnly: 0,
    editable: 1,
  });

  await expect(ide(page).locator(".cm-editor")).toHaveCount(1);
  await expect(editor(page)).toHaveText("int value = 1;");
  await expect(editor(page)).toBeFocused();
  await expect(ide(page).getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(ide(page).getByRole("button", { name: "Close", exact: true })).toBeVisible();
  const panelBounds = await ide(page).boundingBox();
  const viewport = page.viewportSize();
  expect(panelBounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(panelBounds!.x).toBeGreaterThanOrEqual(0);
  expect(panelBounds!.y).toBeGreaterThanOrEqual(0);
  expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(panelBounds!.y + panelBounds!.height).toBeLessThanOrEqual(viewport!.height + 1);
  expect(externalEditorRequests).toEqual([]);

  const savedByButton = "int value = 2;\n";
  await replaceEditorText(page, savedByButton);
  await expect(ide(page).getByLabel("Modified")).toBeVisible();
  await ide(page).getByRole("button", { name: "Save", exact: true }).click();
  await expectMessage(
    endpoint,
    outboundStart,
    `Darkwind.IDE.Save ${JSON.stringify({ path: "/domains/fixture/editable.c", content: savedByButton })}`,
  );
  endpoint.sendGmcp("Darkwind.IDE.SaveResult", {
    path: "/domains/fixture/editable.c",
    success: 1,
    message: "Compiled and saved.",
  });
  await expect(ide(page).getByLabel("Modified")).toHaveCount(0);
  await expect(ide(page).locator(".ide-status-text")).toHaveText("Compiled and saved.");

  const failedSave = "int value = broken;\nreturn 0;\n";
  await replaceEditorText(page, failedSave);
  await page.keyboard.press("ControlOrMeta+s");
  await expectMessage(
    endpoint,
    outboundStart,
    `Darkwind.IDE.Save ${JSON.stringify({ path: "/domains/fixture/editable.c", content: failedSave })}`,
  );
  endpoint.sendGmcp("Darkwind.IDE.SaveResult", {
    path: "/domains/fixture/editable.c",
    success: 0,
    message: "Compile failed.",
    errors: [{ line: 2, column: 3, message: "Expected expression." }],
  });
  await expectEditorText(page, failedSave);
  await expect(ide(page).getByLabel("Modified")).toBeVisible();
  const diagnostic = ide(page).getByRole("button", { name: /Line 2:3.*Expected expression/ });
  await expect(diagnostic).toBeVisible();
  await diagnostic.click();
  await expect(editor(page)).toBeFocused();

  endpoint.sendGmcp("Darkwind.IDE.Open", {
    path: "/domains/fixture/replacement.json",
    title: "Server replacement",
    content: '{"server":true}\n',
    language: "json",
    readOnly: 0,
    editable: 1,
  });
  await expect(editor(page)).toHaveText('{"server":true}');
  await expect(ide(page).getByLabel("Modified")).toHaveCount(0);

  endpoint.sendGmcp("Darkwind.IDE.Open", {
    path: "/domains/fixture/readme.md",
    title: "Read-only fixture",
    content: "# Server copy\n",
    language: "markdown",
    readOnly: 1,
    editable: 0,
  });
  await expect(ide(page).getByText("READ ONLY", { exact: true })).toBeVisible();
  await expect(ide(page).getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await editor(page).pressSequentially("ignored");
  await expect(editor(page)).toHaveText("# Server copy");

  endpoint.sendGmcp("Darkwind.IDE.Open", {
    path: "/domains/fixture/reconnect.c",
    title: "Reconnect fixture",
    content: "before reconnect\n",
    language: "c",
    readOnly: 0,
    editable: 1,
  });
  await replaceEditorText(page, "local dirty reconnect\n");

  if ((page.viewportSize()?.width ?? 0) > 700) {
    await ide(page)
      .locator(".cm-editor")
      .evaluate((element) => {
        (element as HTMLElement).dataset.testIdentity = "preserved-editor";
      });
    await dockPanelAsTab(page, "ide", "terminal");
    await panelDragHandle(page, "terminal").click();
    await expect(ide(page)).not.toBeVisible();
    await expect(page.locator('.ide-pane[data-panel-id="ide"]')).toHaveCount(1);
    await expect(
      page.locator(
        '.ide-pane[data-panel-id="ide"] .cm-editor[data-test-identity="preserved-editor"]',
      ),
    ).toHaveCount(1);
    await expect(page.locator('.ide-pane[data-panel-id="ide"] .cm-content')).toHaveText(
      "local dirty reconnect",
    );
    await panelDragHandle(page, "ide").click();
    await expect(ide(page)).toBeVisible();
    await expect(editor(page)).toHaveText("local dirty reconnect");
  }

  endpoint.dropConnections();
  await expect(ide(page).locator(".ide-status-text")).toHaveText(
    "Disconnected — local changes are preserved.",
  );
  await expect(editor(page)).toHaveText("local dirty reconnect");
  await expect(ide(page).getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await expect(page.locator("#connect-btn")).toHaveText(/Retrying in \d+s/);
  await expect(page.getByTestId("connection-status")).toHaveText("Connected");
  await expect(ide(page).locator(".ide-status-text")).toHaveText(
    "Waiting for a fresh server document.",
  );
  await expect(ide(page).getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  endpoint.sendGmcp("Darkwind.IDE.Open", {
    path: "/domains/fixture/reconnect.c",
    title: "Reconnect fixture",
    content: "fresh server reconnect\n",
    language: "c",
    readOnly: 0,
    editable: 1,
  });
  await expect(editor(page)).toHaveText("fresh server reconnect");
  await expect(ide(page).getByLabel("Modified")).toHaveCount(0);

  endpoint.sendGmcp("Darkwind.IDE.OpenStart", {
    session: "broken-replacement",
    path: "/domains/fixture/broken.c",
    content: "",
    chunks: 2,
    totalLength: 4,
  });
  endpoint.sendGmcp("Darkwind.IDE.OpenChunk", {
    session: "broken-replacement",
    index: 0,
    content: "no",
  });
  endpoint.sendGmcp("Darkwind.IDE.OpenFinish", { session: "broken-replacement" });
  await expect(ide(page).locator(".ide-status-text")).toHaveText(
    "Open transfer was missing chunks.",
  );
  await expect(editor(page)).toHaveText("fresh server reconnect");
});

test("IDE close guards, native tab, reset, repeated lifecycle, and remount stay exact", async ({
  page,
}, testInfo) => {
  const endpoint = await connect(page);
  const outboundStart = endpoint.gmcpMessages.length;
  const commandInput = page.getByRole("textbox", { name: "Command input", exact: true });
  const terminalOutput = page.locator("[data-terminal-identity]");
  const open = (path: string, title: string, content = "clean\n") =>
    endpoint.sendGmcp("Darkwind.IDE.Open", {
      path,
      title,
      content,
      language: "c",
      readOnly: 0,
      editable: 1,
    });

  await commandInput.focus();
  open("/domains/fixture/close.c", "Exact close");
  await expect(editor(page)).toBeFocused();
  await ide(page).getByRole("button", { name: "Close", exact: true }).click();
  await expectMessage(
    endpoint,
    outboundStart,
    'Darkwind.IDE.Close {"path":"/domains/fixture/close.c"}',
  );
  await expect(ide(page)).toHaveCount(0);
  await expect(commandInput).toBeFocused();

  await page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    document.body.tabIndex = -1;
    document.body.focus();
  });
  await expect(page.locator("body")).toBeFocused();
  open("/domains/fixture/body-focus.c", "Body focus");
  await expect(ide(page)).toBeVisible();
  await page.waitForTimeout(100);
  await expect(editor(page)).toBeFocused();
  await ide(page).getByRole("button", { name: "Close", exact: true }).click();
  await expect(ide(page)).toHaveCount(0);
  await expect(terminalOutput).toBeFocused();

  open("/domains/fixture/dirty-close.c", "Dirty close");
  await replaceEditorText(page, "dirty close\n");
  const beforeDirtyClose = endpoint.gmcpMessages.length;
  await confirmAction(
    page,
    () => ide(page).getByRole("button", { name: "Close", exact: true }).click(),
    false,
  );
  await expect(ide(page)).toBeVisible();
  expect(endpoint.gmcpMessages.slice(beforeDirtyClose)).not.toContain(
    'Darkwind.IDE.Close {"path":"/domains/fixture/dirty-close.c"}',
  );
  await confirmAction(
    page,
    () => ide(page).getByRole("button", { name: "Close", exact: true }).click(),
    true,
  );
  await expectMessage(
    endpoint,
    beforeDirtyClose,
    'Darkwind.IDE.Close {"path":"/domains/fixture/dirty-close.c"}',
  );
  await expect(ide(page)).toHaveCount(0);

  open("/domains/fixture/native.c", "Native dirty tab");
  await replaceEditorText(page, "native dirty\n");
  if (testInfo.project.name !== "mobile-chromium") {
    await page
      .locator('[data-panel-drag-handle][data-panel-id="status"]')
      .dragTo(page.locator('[data-panel-drag-handle][data-panel-id="avatar"]'));
    await page.waitForTimeout(150);
  }
  await expect
    .poll(() =>
      page.evaluate(() => {
        const runtime = (
          window as unknown as { __darkflowPhase1Runtime: { characterProfileId: string } }
        ).__darkflowPhase1Runtime;
        const state = JSON.parse(localStorage.getItem("darkflow-session-core-v1") ?? "{}");
        return JSON.stringify(
          state.characterProfiles[runtime.characterProfileId].workspace?.payload?.dockview
            ?.layout ?? null,
        );
      }),
    )
    .not.toContain('"ide"');
  const nativeClose = page.getByRole("button", { name: "Close Native dirty tab", exact: true });
  await expect(nativeClose).toBeVisible();
  await confirmAction(page, () => nativeClose.click(), false);
  await expect(ide(page)).toBeVisible();
  await confirmAction(page, () => nativeClose.click(), true);
  await expectMessage(
    endpoint,
    outboundStart,
    'Darkwind.IDE.Close {"path":"/domains/fixture/native.c"}',
  );
  await expect(ide(page)).toHaveCount(0);

  open("/domains/fixture/reset.c", "Reset guard");
  await replaceEditorText(page, "dirty reset\n");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await confirmAction(
    page,
    () => settings.getByRole("button", { name: "Reset workspace", exact: true }).click(),
    false,
  );
  await expect(ide(page)).toBeVisible();
  await expect(editor(page)).toHaveText("dirty reset");
  await confirmAction(
    page,
    () => settings.getByRole("button", { name: "Reset workspace", exact: true }).click(),
    true,
  );
  await expectMessage(
    endpoint,
    outboundStart,
    'Darkwind.IDE.Close {"path":"/domains/fixture/reset.c"}',
  );
  await expect(ide(page)).toHaveCount(0);
  await settings.getByRole("button", { name: "Close settings" }).click();

  for (let index = 0; index < 2; index += 1) {
    const path = `/domains/fixture/repeat-${index}.c`;
    open(path, `Repeated ${index}`);
    await expect(ide(page).locator(".cm-editor")).toHaveCount(1);
    await ide(page).getByRole("button", { name: "Close", exact: true }).click();
    await expectMessage(endpoint, outboundStart, `Darkwind.IDE.Close ${JSON.stringify({ path })}`);
    await expect(ide(page)).toHaveCount(0);
  }

  open("/domains/fixture/dispose.c", "Dispose fixture");
  await expect(ide(page).locator(".cm-editor")).toHaveCount(1);
  await page.evaluate(() => {
    (
      window as unknown as { __darkflowPhase1Runtime: { session: { dispose(): void } } }
    ).__darkflowPhase1Runtime.session.dispose();
  });
  await expect(page.getByTestId("phase2-shell")).toHaveCount(0);
  await expect(ide(page)).toHaveCount(0);

  await connect(page);
  endpoint.sendGmcp("Darkwind.IDE.Open", {
    path: "/domains/fixture/remount.c",
    title: "Remounted fixture",
    content: "remounted\n",
    language: "c",
    readOnly: 0,
    editable: 1,
  });
  await expect(ide(page).locator(".cm-editor")).toHaveCount(1);
  await expect(editor(page)).toHaveText("remounted");
  await expect(editor(page)).toBeFocused();
});

test("IDE reconstructs chunked opens and sends an exact large save transfer", async ({ page }) => {
  const endpoint = await connect(page);
  const openSession = "fixture-open-transfer";
  const chunkedContent = "ONEtwothree";
  endpoint.sendGmcp("Darkwind.IDE.OpenStart", {
    session: openSession,
    path: "/domains/fixture/chunked.c",
    title: "Chunked fixture",
    content: "",
    language: "c",
    readOnly: 0,
    editable: 1,
    chunks: 3,
    totalLength: chunkedContent.length,
  });
  endpoint.sendGmcp("Darkwind.IDE.OpenChunk", {
    session: openSession,
    index: 2,
    content: "three",
  });
  endpoint.sendGmcp("Darkwind.IDE.OpenChunk", {
    session: openSession,
    index: 0,
    content: "one",
  });
  endpoint.sendGmcp("Darkwind.IDE.OpenChunk", {
    session: openSession,
    index: 0,
    content: "ONE",
  });
  endpoint.sendGmcp("Darkwind.IDE.OpenChunk", {
    session: openSession,
    index: 1,
    content: "two",
  });
  endpoint.sendGmcp("Darkwind.IDE.OpenFinish", { session: openSession });
  await expect(editor(page)).toHaveText(chunkedContent);

  const largeContent = `${"x".repeat(256 * 1024)}!`;
  await replaceEditorText(page, largeContent);
  const outboundStart = endpoint.gmcpMessages.length;
  await ide(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() =>
      endpoint.gmcpMessages
        .slice(outboundStart)
        .some((message) => message.startsWith("Darkwind.IDE.SaveFinish ")),
    )
    .toBe(true);

  const outbound = endpoint.gmcpMessages
    .slice(outboundStart)
    .filter((message) => message.startsWith("Darkwind.IDE.Save"));
  const startMessage = outbound.find((message) => message.startsWith("Darkwind.IDE.SaveStart "));
  expect(startMessage).toBeDefined();
  const start = JSON.parse(startMessage!.slice("Darkwind.IDE.SaveStart ".length)) as {
    session: string;
    path: string;
    chunks: number;
    totalLength: number;
    hash: string;
  };
  expect(start).toEqual({
    session: expect.any(String),
    path: "/domains/fixture/chunked.c",
    chunks: 9,
    totalLength: largeContent.length,
    hash: createHash("sha1").update(largeContent).digest("hex"),
  });

  const chunks = outbound
    .filter((message) => message.startsWith("Darkwind.IDE.SaveChunk "))
    .map(
      (message) =>
        JSON.parse(message.slice("Darkwind.IDE.SaveChunk ".length)) as {
          session: string;
          index: number;
          content: string;
        },
    );
  expect(chunks).toHaveLength(9);
  for (const [index, chunk] of chunks.entries()) {
    expect(chunk).toEqual({
      session: start.session,
      index,
      content: largeContent.slice(index * 32 * 1024, (index + 1) * 32 * 1024),
    });
  }
  expect(outbound.at(-1)).toBe(
    `Darkwind.IDE.SaveFinish ${JSON.stringify({ session: start.session })}`,
  );
  expect(outbound.some((message) => message.startsWith("Darkwind.IDE.Save "))).toBe(false);

  await confirmAction(
    page,
    () => ide(page).getByRole("button", { name: "Close", exact: true }).click(),
    true,
  );
  await expectMessage(
    endpoint,
    outboundStart,
    `Darkwind.IDE.SaveAbort ${JSON.stringify({ session: start.session, reason: "closed" })}`,
  );
  await expectMessage(
    endpoint,
    outboundStart,
    'Darkwind.IDE.Close {"path":"/domains/fixture/chunked.c"}',
  );
  expect(
    endpoint.gmcpMessages
      .slice(outboundStart)
      .filter(
        (message) =>
          message.startsWith("Darkwind.IDE.SaveAbort ") ||
          message.startsWith("Darkwind.IDE.Close "),
      ),
  ).toEqual([
    `Darkwind.IDE.SaveAbort ${JSON.stringify({ session: start.session, reason: "closed" })}`,
    'Darkwind.IDE.Close {"path":"/domains/fixture/chunked.c"}',
  ]);
  await expect(ide(page)).toHaveCount(0);
});
