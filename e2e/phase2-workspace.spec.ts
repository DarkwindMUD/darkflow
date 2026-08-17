import { expect, test, type Locator, type Page } from "@playwright/test";

async function disposeSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      window as unknown as { __darkflowPhase1Runtime: { session: { dispose(): void } } }
    ).__darkflowPhase1Runtime.session.dispose();
  });
}

async function openWorkspace(page: Page): Promise<void> {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  await page.goto("/phase2/");
  await expect(page.getByTestId("phase2-shell")).toHaveCount(1);
  await expect(page.getByTestId("workspace-host")).toBeVisible();
  await expect
    .poll(async () => (await page.getByTestId("workspace-host").boundingBox())?.height ?? 0)
    .toBeGreaterThan(100);
  await expect(page.locator("[data-terminal-identity]")).toHaveCount(1);
  expect(requests).not.toContain("/js/app.js");
}

function panelDragHandle(page: Page, panelId: string): Locator {
  return page.locator(`[data-panel-drag-handle][data-panel-id="${panelId}"]`);
}

/** Open the Panels menu and toggle Avatar (dirties the layout to trigger a save). */
async function toggleAvatar(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await page.getByRole("checkbox", { name: "Avatar", exact: true }).click();
  await page.keyboard.press("Escape");
}

async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

async function terminalState(
  page: Page,
): Promise<{ buffer: string; identity: string; scrollTop: number }> {
  return page.locator("[data-terminal-identity]").evaluate((element) => ({
    buffer: element.textContent ?? "",
    identity: (element as HTMLElement).dataset.terminalIdentity ?? "",
    scrollTop: element.scrollTop,
  }));
}

async function mouseDrag(page: Page, source: Locator, target: Locator): Promise<void> {
  const start = await center(source);
  const end = await center(target);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) {
    const progress = step / 6;
    await page.mouse.move(
      start.x + (end.x - start.x) * progress,
      start.y + (end.y - start.y) * progress,
    );
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
}

test("Phase 2 persists and restores one real-session workspace", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "desktop controls only");
  await openWorkspace(page);

  const terminal = page.locator("[data-terminal-identity]");
  const terminalIdentity = await terminal.getAttribute("data-terminal-identity");
  await terminal.focus();
  await page.locator("[data-terminal-identity]").click();
  await expect(terminal).toBeFocused();

  // One real output island keeps its identity and focus across layout work.
  const seeded = await terminalState(page);
  expect(seeded.buffer).toBe("");

  await mouseDrag(page, panelDragHandle(page, "avatar"), panelDragHandle(page, "terminal"));
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");
  await expect(page.locator("[data-terminal-identity]")).toHaveCount(1);
  expect(await terminalState(page)).toEqual(seeded);

  await toggleAvatar(page);
  await expect(panelDragHandle(page, "avatar")).toHaveCount(0);
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");
  expect(await terminalState(page)).toEqual(seeded);
  expect(await terminal.getAttribute("data-terminal-identity")).toBe(terminalIdentity);

  const saved = await page.evaluate(() => {
    const runtime = (
      window as unknown as { __darkflowPhase1Runtime: { characterProfileId: string } }
    ).__darkflowPhase1Runtime;
    const state = JSON.parse(localStorage.getItem("darkflow-session-core-v1") ?? "{}");
    return state.characterProfiles[runtime.characterProfileId].workspace;
  });
  expect(saved.version).toBe(2);
  expect(saved.payload.dockview.version).toBe(1);

  await page.reload();
  await expect(page.getByTestId("workspace-host")).toBeVisible();
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace restored");
  await expect(page.locator("[data-terminal-identity]")).toHaveCount(1);
  await expect(panelDragHandle(page, "avatar")).toHaveCount(0);

  await disposeSession(page);
  await expect(page.getByTestId("phase2-shell")).toHaveCount(0);
  await expect(page.locator('[data-workspace-owned="true"]')).toHaveCount(0);
});

test("Phase 2 recovers from a malformed layout and reports a storage failure", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "desktop controls only");
  await openWorkspace(page);
  await toggleAvatar(page);
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");
  await page.evaluate(() => {
    const runtime = (
      window as unknown as { __darkflowPhase1Runtime: { characterProfileId: string } }
    ).__darkflowPhase1Runtime;
    const state = JSON.parse(localStorage.getItem("darkflow-session-core-v1") ?? "{}");
    state.characterProfiles[runtime.characterProfileId].workspace.payload.dockview.layout = {
      malformed: true,
    };
    localStorage.setItem("darkflow-session-core-v1", JSON.stringify(state));
  });

  await page.reload();
  await expect(page.getByTestId("workspace-host")).toBeVisible();
  await expect(page.getByTestId("workspace-status")).toContainText("using the default layout");
  await expect(page.locator("[data-terminal-identity]")).toHaveCount(1);

  await toggleAvatar(page);
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");
  await page.evaluate(() => {
    const runtime = (
      window as unknown as { __darkflowPhase1Runtime: { characterProfileId: string } }
    ).__darkflowPhase1Runtime;
    const state = JSON.parse(localStorage.getItem("darkflow-session-core-v1") ?? "{}");
    state.characterProfiles[runtime.characterProfileId].workspace.payload.dockview.layout = {};
    localStorage.setItem("darkflow-session-core-v1", JSON.stringify(state));
  });
  await page.reload();
  await expect(page.getByTestId("workspace-host")).toBeVisible();
  await expect(page.getByTestId("workspace-status")).toContainText("using the default layout");
  await expect(page.locator("[data-terminal-identity]")).toHaveCount(1);

  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "darkflow-session-core-v1") throw new Error("storage fixture failure");
      return original.call(this, key, value);
    };
  });
  await toggleAvatar(page);
  await expect(page.getByTestId("workspace-status")).toContainText("storage fixture failure");
});

test("Phase 2 mobile presents one panel and restores the desktop rails", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile project only");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkspace(page);

  const trigger = page.getByRole("button", { name: "Panels", exact: true });
  const overlay = page.locator(".mobile-sheet-overlay");
  const sheet = page.getByRole("dialog", { name: "Panels" });
  const terminal = page.locator("[data-terminal-identity]");
  const identity = await terminal.getAttribute("data-terminal-identity");

  // Mobile collapses the fixed rails to a terminal-centric view; the sheet selects.
  await expect(page.getByTestId("workspace-host")).toBeVisible();
  await expect(panelDragHandle(page, "terminal")).toBeVisible();
  await expect(panelDragHandle(page, "avatar")).toHaveCount(0);
  await expect(sheet).toBeHidden();

  // Selecting a panel from the sheet presents it; the terminal island survives.
  await trigger.click();
  await expect(sheet.getByRole("button", { name: "Close panels" })).toBeFocused();
  await sheet.getByRole("button", { name: "Open Avatar", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(panelDragHandle(page, "avatar")).toBeVisible();
  expect(await terminal.getAttribute("data-terminal-identity")).toBe(identity);

  await trigger.click();
  await sheet.getByRole("button", { name: "Terminal", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(terminal).toBeFocused();

  // Every sheet dismissal path returns focus to the trigger.
  await trigger.click();
  await sheet.getByRole("button", { name: "Close panels" }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await overlay.click({ position: { x: 4, y: 4 } });
  await expect(trigger).toBeFocused();
  expect(await terminal.getAttribute("data-terminal-identity")).toBe(identity);

  await trigger.click();
  expect(await overlay.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
    "0s",
  );

  // Returning to desktop restores the captured rail layout and the terminal island.
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByTestId("workspace-host")).toBeVisible();
  await expect(panelDragHandle(page, "status")).toBeVisible();
  expect(await terminal.getAttribute("data-terminal-identity")).toBe(identity);

  await disposeSession(page);
  await expect(page.locator('[data-workspace-owned="true"]')).toHaveCount(0);
});
