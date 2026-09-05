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
    steps: 12,
  });
  await page.mouse.up();
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

  // Dirty the layout with a rail-local reorder. This used to drag Avatar onto
  // the terminal tab; rails are their own root now, so a rail-to-grid transfer
  // is a separate feature. Reordering exercises the same thing this test is
  // about: a layout edit is persisted and the terminal island survives it.
  await panelDragHandle(page, "status").dragTo(panelDragHandle(page, "avatar"));
  await page.getByRole("button", { name: "Collapse Status", exact: true }).click();
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
  // Version 2 carries the Dockview tree plus each rail's ordered panel ids.
  expect(saved.payload.dockview.version).toBe(2);
  expect(saved.payload.dockview.layout.scrollviews.left).toContain("status");
  expect(saved.payload.dockview.layout.collapsed.left).toContain("status");

  await page.reload();
  await expect(page.getByTestId("workspace-host")).toBeVisible();
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace restored");
  await expect(page.locator("[data-terminal-identity]")).toHaveCount(1);
  await expect(panelDragHandle(page, "avatar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Expand Status", exact: true })).toBeVisible();

  await disposeSession(page);
  await expect(page.getByTestId("phase2-shell")).toHaveCount(0);
  await expect(page.locator('[data-workspace-owned="true"]')).toHaveCount(0);
});

test("eligible docked tabs move directly into either rail", async ({ page }, testInfo) => {
  test.slow();
  test.skip(testInfo.project.name === "mobile-chromium", "desktop rails only");
  await openWorkspace(page);
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await page.getByRole("checkbox", { name: "Map", exact: true }).click();
  await page.keyboard.press("Escape");

  const source = await panelDragHandle(page, "map")
    .locator(".dv-default-tab-content")
    .boundingBox();
  const leftRail = await page.locator('[data-rail="left"]').boundingBox();
  expect(source).not.toBeNull();
  expect(leftRail).not.toBeNull();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(leftRail!.x + leftRail!.width / 2, leftRail!.y + 40, { steps: 8 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(
    page.getByTestId("workspace-host").locator('.map-panel[data-panel-id="map"]'),
  ).toBeVisible();
  await expect(page.locator('[data-rail="left"] > [data-panel-id="map"]')).toHaveCount(0);

  await page.evaluate(() => {
    window.addEventListener(
      "pointerdown",
      (event) => {
        (window as unknown as { __railTestPointerId: number }).__railTestPointerId =
          event.pointerId;
      },
      { once: true },
    );
  });
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(leftRail!.x + leftRail!.width / 2, leftRail!.y + 40, { steps: 8 });
  await page.evaluate(() =>
    window.dispatchEvent(
      new PointerEvent("pointercancel", {
        pointerId: (window as unknown as { __railTestPointerId: number }).__railTestPointerId,
      }),
    ),
  );
  await page.mouse.up();
  await expect(
    page.getByTestId("workspace-host").locator('.map-panel[data-panel-id="map"]'),
  ).toBeVisible();
  await expect(page.locator('[data-rail="left"] > [data-panel-id="map"]')).toHaveCount(0);

  await dragPanelToRail(page, "map", "left");
  await expect(page.locator('[data-rail="left"] > [data-panel-id="map"]')).toBeVisible();
  await expect(page.locator('[data-rail="right"] > [data-panel-id="map"]')).toHaveCount(0);
  await expect(page.getByTestId("workspace-host").locator('[data-panel-id="map"]')).toHaveCount(0);

  const scrolledLeftRail = page.locator('[data-rail="left"]');
  await scrolledLeftRail.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect
    .poll(() => scrolledLeftRail.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await expect(page.getByRole("button", { name: /Move .* to (left|right) rail/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await panelDragHandle(page, "map").dragTo(panelDragHandle(page, "group"));
  await expect(page.locator('[data-rail="right"] > [data-panel-id="map"]')).toBeVisible();
  await expect(page.locator('[data-rail="left"] > [data-panel-id="map"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Collapse Map", exact: true })).toBeFocused();

  await panelDragHandle(page, "map").dragTo(panelDragHandle(page, "stats"));
  await expect(page.locator('[data-rail="left"] > [data-panel-id="map"]')).toBeVisible();
  await expect
    .poll(() => scrolledLeftRail.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await panelDragHandle(page, "map").dragTo(panelDragHandle(page, "xpmon"));
  const leftOrder = await scrolledLeftRail
    .locator(".df-rail-card")
    .evaluateAll((cards) => cards.map((card) => (card as HTMLElement).dataset.panelId));
  expect(leftOrder.indexOf("map")).toBeLessThan(leftOrder.indexOf("xpmon"));
  // The cross-root transfer publishes its settled owner before another move
  // may begin; production runs can otherwise outrun the transfer's finalizer.
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");
  await panelDragHandle(page, "map").dragTo(panelDragHandle(page, "group"));
  await expect(page.locator('[data-rail="right"] > [data-panel-id="map"]')).toBeVisible();
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");
  const desktopBytes = await page.evaluate(() => localStorage.getItem("darkflow-session-core-v1"));
  await page.setViewportSize({ width: 800, height: 700 });
  await expect(page.locator('[data-rail="right"]')).toBeHidden();
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await page.getByRole("checkbox", { name: "Map", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByTestId("workspace-host").locator('.map-panel[data-panel-id="map"]'),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('[data-rail="right"] > [data-panel-id="map"]')).toBeVisible();
  await expect(
    page.getByTestId("workspace-host").locator('.map-panel[data-panel-id="map"]'),
  ).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("darkflow-session-core-v1"))).toBe(
    desktopBytes,
  );
});

test("duplicate persisted ownership keeps the Dockview panel", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "desktop rails only");
  await openWorkspace(page);
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await page.getByRole("checkbox", { name: "Map", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");
  await page.evaluate(() => {
    const runtime = (
      window as unknown as { __darkflowPhase1Runtime: { characterProfileId: string } }
    ).__darkflowPhase1Runtime;
    const state = JSON.parse(localStorage.getItem("darkflow-session-core-v1") ?? "{}");
    state.characterProfiles[
      runtime.characterProfileId
    ].workspace.payload.dockview.layout.scrollviews.left.push("map");
    localStorage.setItem("darkflow-session-core-v1", JSON.stringify(state));
  });

  await page.reload();
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace restored");
  await expect(
    page.getByTestId("workspace-host").locator('.map-panel[data-panel-id="map"]'),
  ).toBeVisible();
  await expect(page.locator('[data-rail="left"] > [data-panel-id="map"]')).toHaveCount(0);
  await expect(page.locator('.map-panel[data-panel-id="map"]')).toHaveCount(1);
});

test("failed and disposed transfers do not leave partial owners", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "focused lifecycle fault injection");
  await openWorkspace(page);
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await page.getByRole("checkbox", { name: "Map", exact: true }).click();
  await page.keyboard.press("Escape");
  const map = page.getByTestId("workspace-host").locator('.map-panel[data-panel-id="map"]');
  const before = await map.boundingBox();

  await page.evaluate(() => {
    const rail = document.querySelector<HTMLElement>('[data-rail="left"]')!;
    Object.defineProperty(rail, "insertBefore", {
      configurable: true,
      value() {
        delete (rail as HTMLElement & { insertBefore?: unknown }).insertBefore;
        throw new Error("fixture destination failure");
      },
    });
  });
  await dragPanelToRail(page, "map", "left");
  await expect(map).toBeVisible();
  await expect(page.locator('[data-rail="left"] > [data-panel-id="map"]')).toHaveCount(0);
  const recovered = await map.boundingBox();
  expect(Math.abs((recovered?.x ?? 0) - (before?.x ?? 0))).toBeLessThanOrEqual(2);
  expect(Math.abs((recovered?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(2);

  await dragPanelToRail(page, "map", "left");
  await disposeSession(page);
  await expect(page.getByTestId("phase2-shell")).toHaveCount(0);
  await expect(page.locator('[data-workspace-owned="true"]')).toHaveCount(0);
});

test("a multi-panel floating window cannot be dropped into a rail", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "focused floating-window ownership guard");
  await openWorkspace(page);
  for (const title of ["Map", "Room Image"]) {
    await page.getByRole("button", { name: "Panels", exact: true }).click();
    await page.getByRole("checkbox", { name: title, exact: true }).click();
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Float Map", exact: true }).click();
  await dockPanelAsTab(page, "roomImage", "map");
  const floating = page.locator(".dv-resize-container").filter({
    has: panelDragHandle(page, "map"),
  });
  await expect(floating.locator('[data-panel-drag-handle="true"]')).toHaveCount(2);
  const titlebar = await floating.locator(".dv-floating-titlebar").boundingBox();
  const rail = await page.locator('[data-rail="left"]').boundingBox();
  expect(titlebar).not.toBeNull();
  expect(rail).not.toBeNull();
  await page.mouse.move(titlebar!.x + titlebar!.width / 2, titlebar!.y + titlebar!.height / 2);
  await page.mouse.down();
  await page.mouse.move(rail!.x + rail!.width / 2, rail!.y + 60, { steps: 12 });
  await page.mouse.up();

  await expect(page.locator('[data-rail] > [data-panel-id="map"]')).toHaveCount(0);
  await expect(page.locator('[data-rail] > [data-panel-id="roomImage"]')).toHaveCount(0);
  await expect(
    page.getByTestId("workspace-host").locator('[data-panel-drag-handle][data-panel-id="map"]'),
  ).toHaveCount(1);
  await expect(
    page
      .getByTestId("workspace-host")
      .locator('[data-panel-drag-handle][data-panel-id="roomImage"]'),
  ).toHaveCount(1);
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
    const saved = state.characterProfiles[runtime.characterProfileId].workspace.payload.dockview;
    saved.layout = { collapsed: saved.layout.collapsed, dockview: saved.layout.dockview };
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
