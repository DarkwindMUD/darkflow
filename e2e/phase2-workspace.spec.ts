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

test("Dockview tab shortcuts reserved for Darkflow stay disabled", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "desktop Dockview only");
  await openWorkspace(page);

  const terminalTab = page.locator('.dv-tab:has([data-panel-id="terminal"])');
  await terminalTab.evaluate((tab) => {
    const state = window as unknown as { __darkflowDockviewTabKeys: string[] };
    state.__darkflowDockviewTabKeys = [];
    tab.addEventListener("keydown", (event) =>
      state.__darkflowDockviewTabKeys.push((event as KeyboardEvent).key),
    );
  });
  await terminalTab.focus();

  for (const key of ["Home", "End", "Enter", "Space", "Delete", "Backspace"]) {
    await page.keyboard.press(key);
  }

  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __darkflowDockviewTabKeys: string[] }).__darkflowDockviewTabKeys,
    ),
  ).toEqual([]);
  await expect(page.locator("[data-terminal-identity]")).toHaveCount(1);
});

async function moveFloatingPanel(
  page: Page,
  panelId: string,
  deltaX: number,
  deltaY: number,
): Promise<void> {
  const titlebar = await page
    .locator(`.dv-floating-titlebar[data-panel-id="${panelId}"]`)
    .boundingBox();
  expect(titlebar).not.toBeNull();
  const x = titlebar!.x + titlebar!.width / 2;
  const y = titlebar!.y + titlebar!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 2, y + 2);
  await page.mouse.move(x + deltaX, y + deltaY, { steps: 6 });
  await page.mouse.up();
}

test("desktop panel selector toggles from its label and trigger", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "desktop menu only");
  await openWorkspace(page);

  const trigger = page.getByRole("button", { name: "Panels", exact: true });
  const menu = page.locator(".df-panels-menu-list");
  const avatar = page.getByRole("checkbox", { name: "Avatar", exact: true });

  await trigger.click();
  await expect(menu).toBeVisible();
  await avatar.locator("..").getByText("Avatar", { exact: true }).click();
  await expect(avatar).not.toBeChecked();
  await expect(panelDragHandle(page, "avatar")).toHaveCount(0);
  await expect(menu).toBeVisible();

  await avatar.click();
  await expect(avatar).toBeChecked();
  await expect(panelDragHandle(page, "avatar")).toBeVisible();

  await trigger.click();
  await expect(menu).toBeHidden();
});

test("built-in panel settings stay local and persist semantic floating layers", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "desktop floating panes only");
  await openWorkspace(page);

  const settings = page.getByRole("button", { name: "Settings for Status", exact: true });
  await expect(settings).toBeVisible();
  await settings.click();
  const popover = page.locator(".panel-settings-popover");
  await expect(popover).toBeVisible();
  await expect(popover.getByLabel("Text size").locator("option:checked")).toHaveText(
    /\d+px \(Default\)/,
  );
  await settings.click();
  await expect(popover).toBeHidden();
  await expect(settings).toBeFocused();
  await settings.click();
  await expect(popover).toBeVisible();
  await expect(popover.getByLabel("Layer", { exact: true })).toHaveCount(0);
  await popover.getByLabel("Text size").selectOption("16");
  await expect
    .poll(() =>
      page
        .locator('[data-workspace-owned="true"][data-workspace-root-id^="status-"]')
        .evaluate((element) => element.style.getPropertyValue("--pane-font-scale")),
    )
    .toBe(String(16 / 12));
  await expect(
    page.locator('[data-workspace-owned="true"][data-workspace-root-id^="avatar-"]'),
  ).not.toHaveAttribute("style", /pane-font-scale/);

  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await page.getByRole("checkbox", { name: "Map", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings for Map", exact: true }).click();
  await expect(popover).toHaveAttribute("aria-label", "Settings for Map");
  const defaultMapFontSize = await page
    .locator(".map-panel-status")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  await popover.getByLabel("Text size").selectOption("16");
  await expect
    .poll(() =>
      page
        .locator(".map-panel-status")
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    )
    .toBeGreaterThan(defaultMapFontSize);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Settings for Map", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Float Status", exact: true }).click();
  const floatingSettings = page.getByRole("button", { name: "Settings for Status", exact: true });
  await floatingSettings.click();
  await expect(popover.getByLabel("Layer", { exact: true })).toBeVisible();
  const layerInfo = popover.getByRole("button", { name: "About panel layers" });
  const layerHelp = popover.getByRole("tooltip");
  await expect(layerInfo).toHaveAttribute("aria-describedby", "panel-layer-help");
  const [layerLabelBounds, layerInfoBounds] = await Promise.all([
    popover.locator('label[for="panel-layer-select"]').boundingBox(),
    layerInfo.boundingBox(),
  ]);
  expect(layerLabelBounds).not.toBeNull();
  expect(layerInfoBounds).not.toBeNull();
  expect(
    Math.abs(
      layerLabelBounds!.y +
        layerLabelBounds!.height / 2 -
        (layerInfoBounds!.y + layerInfoBounds!.height / 2),
    ),
  ).toBeLessThanOrEqual(1);
  await layerInfo.focus();
  await expect(layerHelp).toHaveCSS("opacity", "1");
  await expect(layerHelp).toContainText("Normal panels come forward when selected.");
  await expect(layerHelp).not.toContainText("active-front");
  await expect
    .poll(async () => {
      const [panel, menu] = await Promise.all([
        page
          .locator('[data-workspace-owned="true"][data-workspace-root-id^="status-"]')
          .boundingBox(),
        popover.boundingBox(),
      ]);
      if (!panel || !menu) return false;
      return (
        menu.x + menu.width <= panel.x ||
        panel.x + panel.width <= menu.x ||
        menu.y + menu.height <= panel.y ||
        panel.y + panel.height <= menu.y
      );
    })
    .toBe(true);
  await popover.getByLabel("Layer", { exact: true }).selectOption("above");
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const settings = JSON.parse(localStorage.getItem("darkwind-client-settings") ?? "{}");
        return settings.panelPreferences.status?.layer;
      }),
    )
    .toBe("above");
  const statusFrame = page
    .locator(".dv-resize-container")
    .filter({ has: panelDragHandle(page, "status") });
  await page.getByRole("button", { name: "Float Vitals", exact: true }).click();
  await page
    .getByRole("button", { name: "Settings for Vitals", exact: true })
    .evaluate((button) => (button as HTMLElement).click());
  await expect(popover).toHaveAttribute("aria-label", "Settings for Vitals");
  await popover.getByLabel("Layer", { exact: true }).selectOption("always-on-top");
  await page.keyboard.press("Escape");
  await moveFloatingPanel(page, "vitals", 320, 0);
  await page.getByRole("button", { name: "Float Avatar", exact: true }).click();
  const vitalsFrame = page
    .locator(".dv-resize-container")
    .filter({ has: panelDragHandle(page, "vitals") });
  const avatarFrame = page
    .locator(".dv-resize-container")
    .filter({ has: panelDragHandle(page, "avatar") });
  await moveFloatingPanel(page, "avatar", 0, 260);
  const zIndex = (frame: Locator) =>
    frame.evaluate((element) => Number(getComputedStyle(element).zIndex));
  await expect.poll(() => zIndex(avatarFrame)).toBeLessThan(await zIndex(statusFrame));
  await expect.poll(() => zIndex(statusFrame)).toBeLessThan(await zIndex(vitalsFrame));

  await page
    .getByRole("button", { name: "Settings for Status", exact: true })
    .evaluate((button) => (button as HTMLElement).click());
  await expect(popover).toHaveAttribute("aria-label", "Settings for Status");
  await popover.getByLabel("Layer", { exact: true }).selectOption("normal");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Settings for Vitals", exact: true })
    .evaluate((button) => (button as HTMLElement).click());
  await expect(popover).toHaveAttribute("aria-label", "Settings for Vitals");
  await popover.getByLabel("Layer", { exact: true }).selectOption("normal");
  await page.keyboard.press("Escape");
  await panelDragHandle(page, "status").locator(".dv-default-tab-content").click();
  await expect.poll(() => zIndex(statusFrame)).toBeGreaterThan(await zIndex(vitalsFrame));
  await panelDragHandle(page, "vitals").locator(".dv-default-tab-content").click();
  await expect.poll(() => zIndex(vitalsFrame)).toBeGreaterThan(await zIndex(statusFrame));

  await page
    .getByRole("button", { name: "Settings for Status", exact: true })
    .evaluate((button) => (button as HTMLElement).click());
  await expect(popover).toHaveAttribute("aria-label", "Settings for Status");
  await popover.getByRole("button", { name: "Reset this panel", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const settings = JSON.parse(localStorage.getItem("darkwind-client-settings") ?? "{}");
        return settings.panelPreferences.status;
      }),
    )
    .toBeUndefined();

  if (testInfo.project.name === "chromium") {
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      (
        window as typeof window & {
          __panelSettingsOriginalSetItem?: typeof Storage.prototype.setItem;
        }
      ).__panelSettingsOriginalSetItem = original;
      Storage.prototype.setItem = function (key, value) {
        if (key === "darkwind-client-settings") throw new Error("panel settings fixture failure");
        return original.call(this, key, value);
      };
    });
    await popover.getByLabel("Text size").selectOption("20");
    await expect(popover.getByLabel("Text size")).toHaveValue("");
    await expect(page.getByTestId("workspace-status")).toHaveText(
      "Client settings could not be saved.",
    );
    await page.evaluate(() => {
      const target = window as typeof window & {
        __panelSettingsOriginalSetItem?: typeof Storage.prototype.setItem;
      };
      if (target.__panelSettingsOriginalSetItem) {
        Storage.prototype.setItem = target.__panelSettingsOriginalSetItem;
        delete target.__panelSettingsOriginalSetItem;
      }
    });
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(popover).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
});

test("floating panel settings switch from non-overlap to proximity for tall panels", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "focused floating geometry regression");
  await openWorkspace(page);
  await page.getByRole("button", { name: "Toggle right sidebar", exact: true }).click();
  await page.getByRole("button", { name: "Float Status", exact: true }).click();

  const frame = page.locator(".dv-resize-container").filter({
    has: panelDragHandle(page, "status"),
  });
  const [initialFrame, workspace] = await Promise.all([
    frame.boundingBox(),
    page.getByTestId("workspace-host").boundingBox(),
  ]);
  expect(initialFrame).not.toBeNull();
  expect(workspace).not.toBeNull();
  await moveFloatingPanel(
    page,
    "status",
    workspace!.x + workspace!.width - initialFrame!.x - initialFrame!.width - 48,
    0,
  );

  const settings = page.getByRole("button", { name: "Settings for Status", exact: true });
  await settings.click();
  const [panel, button, popover] = await Promise.all([
    frame.boundingBox(),
    settings.boundingBox(),
    page.locator(".panel-settings-popover").boundingBox(),
  ]);
  expect(panel).not.toBeNull();
  expect(button).not.toBeNull();
  expect(popover).not.toBeNull();
  expect(popover!.y).toBeGreaterThanOrEqual(panel!.y + panel!.height);
  expect(
    Math.abs(popover!.x + popover!.width / 2 - (button!.x + button!.width / 2)),
  ).toBeLessThanOrEqual(8);

  await page.keyboard.press("Escape");
  const resizeGrip = frame.locator(".dv-resize-handle-bottomright");
  const grip = await resizeGrip.boundingBox();
  expect(grip).not.toBeNull();
  const resizePoint = { x: grip!.x + grip!.width / 2, y: grip!.y + grip!.height / 2 };
  await resizeGrip.dispatchEvent("pointerdown", { ...resizePoint, pointerId: 1 });
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, pointerId: 1 }));
    window.dispatchEvent(
      new PointerEvent("pointermove", { clientX: x, clientY: y + 180, pointerId: 1 }),
    );
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: x, clientY: y + 180 }));
  }, resizePoint);
  await expect
    .poll(async () => (await frame.boundingBox())?.height ?? 0)
    .toBeGreaterThan(popover!.height * 2);

  await settings.click();
  await expect
    .poll(async () => {
      const [currentButton, currentPopover] = await Promise.all([
        settings.boundingBox(),
        page.locator(".panel-settings-popover").boundingBox(),
      ]);
      if (!currentButton || !currentPopover) return Number.POSITIVE_INFINITY;
      const horizontalDistance = Math.max(
        currentPopover.x - currentButton.x - currentButton.width,
        currentButton.x - currentPopover.x - currentPopover.width,
        0,
      );
      const verticalDistance = Math.max(
        currentPopover.y - currentButton.y - currentButton.height,
        currentButton.y - currentPopover.y - currentPopover.height,
        0,
      );
      return Math.hypot(horizontalDistance, verticalDistance);
    })
    .toBeLessThanOrEqual(6);
  const [tallPanel, nearbyPopover] = await Promise.all([
    frame.boundingBox(),
    page.locator(".panel-settings-popover").boundingBox(),
  ]);
  expect(tallPanel).not.toBeNull();
  expect(nearbyPopover).not.toBeNull();
  expect(
    Math.max(
      0,
      Math.min(nearbyPopover!.x + nearbyPopover!.width, tallPanel!.x + tallPanel!.width) -
        Math.max(nearbyPopover!.x, tallPanel!.x),
    ) *
      Math.max(
        0,
        Math.min(nearbyPopover!.y + nearbyPopover!.height, tallPanel!.y + tallPanel!.height) -
          Math.max(nearbyPopover!.y, tallPanel!.y),
      ),
  ).toBeGreaterThan(0);
});

test("magnetic snapping outlines the target pane", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "desktop floating panes only");
  await openWorkspace(page);
  await page.getByRole("button", { name: "Float Status", exact: true }).click();

  const movingFrame = page.locator(".dv-resize-container").filter({
    has: panelDragHandle(page, "status"),
  });
  const targetGroup = page.locator(".dv-groupview").filter({
    has: panelDragHandle(page, "terminal"),
  });
  const [moving, target, titlebar] = await Promise.all([
    movingFrame.boundingBox(),
    targetGroup.boundingBox(),
    movingFrame.locator(".dv-floating-titlebar").boundingBox(),
  ]);
  expect(moving).not.toBeNull();
  expect(target).not.toBeNull();
  expect(titlebar).not.toBeNull();

  const grabX = titlebar!.x + titlebar!.width / 2;
  const grabY = titlebar!.y + titlebar!.height / 2;
  const snapLeft = target!.x - moving!.width - 6;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + 2, grabY + 2);
  await page.mouse.move(grabX + snapLeft + 12 - moving!.x, grabY + target!.y - moving!.y, {
    steps: 8,
  });

  await expect(targetGroup).toHaveClass(/df-floating-snap-target/);
  await expect(targetGroup).toHaveCSS("outline", "rgba(88, 166, 255, 0.75) solid 2px");
  await page.mouse.up();
  await expect(targetGroup).not.toHaveClass(/df-floating-snap-target/);
});

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
  await expect(page.getByLabel("Command input", { exact: true })).toBeFocused();

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
  await page.getByRole("button", { name: "Toggle left sidebar" }).click();
  await expect(page.locator("#phase2-left-rail")).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
        const character = state.characterProfiles[state.defaults.defaultCharacterProfileId];
        return character.workspace.payload.dockview.layout.railVisibility;
      }),
    )
    .toEqual({ left: false, right: true });

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
  expect(saved.payload.dockview.layout.railVisibility).toEqual({ left: false, right: true });

  await page.reload();
  await expect(page.getByTestId("workspace-host")).toBeVisible();
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace restored");
  await expect(page.locator("[data-terminal-identity]")).toHaveCount(1);
  await expect(panelDragHandle(page, "avatar")).toHaveCount(0);
  await expect(page.locator("#phase2-left-rail")).toBeHidden();
  await expect(page.getByRole("button", { name: "Toggle left sidebar" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator("#phase2-right-rail")).toBeVisible();
  await page.getByRole("button", { name: "Toggle left sidebar" }).click();
  await expect(page.getByRole("button", { name: "Expand Status", exact: true })).toBeVisible();

  await disposeSession(page);
  await expect(page.getByTestId("phase2-shell")).toHaveCount(0);
  await expect(page.locator('[data-workspace-owned="true"]')).toHaveCount(0);
});

test("legacy panel state converts rail order, collapse, and floating bounds", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "desktop layout conversion only");
  await openWorkspace(page);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
    const character = state.characterProfiles[state.defaults.defaultCharacterProfileId];
    character.workspace = {
      version: 1,
      payload: {
        activeLayout: "classic",
        version: 2,
        profiles: {
          classic: {
            docks: { left: false, right: true },
            panels: {
              avatar: { dock: "left", order: 0, collapsed: false, visible: false },
              status: { dock: "left", order: 1, collapsed: true, visible: true },
              chat: {
                dock: "float",
                order: 0,
                collapsed: false,
                visible: true,
                floatX: 300,
                floatY: 200,
                floatW: 420,
                floatH: 260,
              },
            },
          },
        },
      },
    };
    localStorage.setItem("darkflow-session-core-v1", JSON.stringify(state));
  });

  await page.reload();
  await expect(page.getByRole("button", { name: "Expand Status", exact: true })).toBeVisible();
  await expect(page.locator("#phase2-right-rail")).toBeHidden();
  await expect(panelDragHandle(page, "avatar")).toHaveCount(0);
  const chatFrame = page.locator('[data-floating-drag-handle][data-panel-id="chat"]').locator("..");
  await expect(chatFrame).toBeVisible();
  await expect
    .poll(async () => await chatFrame.boundingBox())
    .toMatchObject({ x: 300, y: 200, width: 420, height: 260 });
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
        const character = state.characterProfiles[state.defaults.defaultCharacterProfileId];
        return character.workspace.version;
      }),
    )
    .toBe(2);

  await page.reload();
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace restored");
  await expect(page.getByRole("button", { name: "Expand Status", exact: true })).toBeVisible();
  await expect(page.locator("#phase2-right-rail")).toBeHidden();
  await expect
    .poll(async () => await chatFrame.boundingBox())
    .toMatchObject({ x: 300, y: 200, width: 420, height: 260 });
});

test("Phase 2 preserves center panel proportions across reload", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "desktop Dockview sizing only");
  await openWorkspace(page);
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await page.getByRole("checkbox", { name: "Map", exact: true }).click();
  await page.keyboard.press("Escape");

  const terminal = page.locator('.phase0-terminal-panel[data-panel-id="terminal"]');
  const map = page.locator('.map-panel[data-panel-id="map"]');
  await expect(map).toBeVisible();
  const sash = page
    .locator(
      ".dv-dockview .dv-split-view-container.dv-horizontal > .dv-sash-container > .dv-sash.dv-enabled",
    )
    .first();
  const sashBounds = await sash.boundingBox();
  expect(sashBounds).not.toBeNull();
  await page.mouse.move(sashBounds!.x + sashBounds!.width / 2, sashBounds!.y + 20);
  await page.mouse.down();
  await page.mouse.move(sashBounds!.x + 120, sashBounds!.y + 20, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");

  const ratio = async () => {
    const [terminalBounds, mapBounds] = await Promise.all([
      terminal.boundingBox(),
      map.boundingBox(),
    ]);
    expect(terminalBounds).not.toBeNull();
    expect(mapBounds).not.toBeNull();
    return terminalBounds!.width / (terminalBounds!.width + mapBounds!.width);
  };
  const beforeReload = await ratio();
  expect(Math.abs(beforeReload - 0.5)).toBeGreaterThan(0.08);

  await page.reload();
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace restored");
  await expect(map).toBeVisible();
  expect(await ratio()).toBeCloseTo(beforeReload, 1);
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

test("a slow floating titlebar drag moves Connection Health into a rail", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "desktop rails only");
  await openWorkspace(page);
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await page.getByRole("checkbox", { name: "Connection health", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Float Connection health", exact: true }).click();

  const titlebar = page.locator('.dv-floating-titlebar[data-panel-id="connection-health"]');
  const source = await titlebar.boundingBox();
  const rail = await page.locator('[data-rail="right"]').boundingBox();
  expect(source).not.toBeNull();
  expect(rail).not.toBeNull();
  const x = source!.x + source!.width / 2;
  const y = source!.y + source!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 1, y);
  await page.waitForTimeout(100);
  await page.mouse.move(rail!.x + rail!.width / 2, rail!.y + 40, { steps: 12 });
  await page.mouse.up();

  await expect(
    page.locator('[data-rail="right"] > [data-panel-id="connection-health"]'),
  ).toBeVisible();
  await expect(titlebar).toHaveCount(0);
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");

  await page.reload();
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace restored");
  await expect(
    page.locator('[data-rail="right"] > [data-panel-id="connection-health"]'),
  ).toBeVisible();
});

test("a panel floated from a rail can stay docked in the center", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "desktop center docking only");
  await openWorkspace(page);

  await page.getByRole("button", { name: "Float Avatar", exact: true }).click();
  await expect(page.locator('.dv-floating-titlebar[data-panel-id="avatar"]')).toBeVisible();

  await dockPanelAsTab(page, "avatar", "terminal");
  await expect(page.locator('.dv-floating-titlebar[data-panel-id="avatar"]')).toHaveCount(0);
  await expect(page.locator('.dv-dockview .dv-default-tab[data-panel-id="avatar"]')).toBeVisible();
  await expect(page.locator('[data-rail="left"] > [data-panel-id="avatar"]')).toHaveCount(0);
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");

  await page.reload();
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace restored");
  await expect(page.locator('.dv-dockview .dv-default-tab[data-panel-id="avatar"]')).toBeVisible();
  await expect(page.locator('[data-rail="left"] > [data-panel-id="avatar"]')).toHaveCount(0);
});

test("terminal renders after restoring below another panel in a floating window", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "desktop floating layout only");
  await page.goto("/phase0/");
  await page.waitForFunction(() => typeof window.__darkflowWorkspace?.upsert === "function");
  const dockview = await page.evaluate(() => {
    const roomImage = {
      id: "roomImage",
      kind: "lifecycle",
      title: "Room Image",
      state: {},
      placement: {
        kind: "floating" as const,
        bounds: { left: 300, top: 100, width: 600, height: 500 },
      },
    };
    const terminal = { id: "terminal", kind: "terminal", title: "Terminal", state: {} };
    window.__darkflowWorkspace.upsert(roomImage);
    window.__darkflowWorkspace.upsert(terminal);
    window.__darkflowWorkspace.move("terminal", {
      kind: "grid",
      direction: "below",
      referencePanelId: "roomImage",
    });
    return window.__darkflowWorkspace.save().layout;
  });
  const phase2Dockview = JSON.parse(JSON.stringify(dockview), (_key, value) =>
    value === "lifecycle" ? "roomImage" : value,
  );
  const floatingPosition = phase2Dockview.floatingGroups[0].position as
    | { left: number; top: number; width: number; height: number }
    | { right: number; top: number; width: number; height: number };

  await openWorkspace(page);
  await toggleAvatar(page);
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");
  await page.evaluate((nextDockview) => {
    const runtime = (
      window as unknown as { __darkflowPhase1Runtime: { characterProfileId: string } }
    ).__darkflowPhase1Runtime;
    const state = JSON.parse(localStorage.getItem("darkflow-session-core-v1")!);
    const layout =
      state.characterProfiles[runtime.characterProfileId].workspace.payload.dockview.layout;
    layout.dockview = nextDockview;
    layout.railVisibility = { left: false, right: false };
    layout.scrollviews.left = layout.scrollviews.left.filter((id: string) => id !== "roomImage");
    layout.scrollviews.right = layout.scrollviews.right.filter((id: string) => id !== "roomImage");
    localStorage.setItem("darkflow-session-core-v1", JSON.stringify(state));
  }, phase2Dockview);

  await page.reload();
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace restored");
  const groupedWindow = page.locator(".dv-resize-container").filter({
    has: panelDragHandle(page, "roomImage"),
  });
  await expect
    .poll(async () => {
      const [frame, workspaceHost] = await Promise.all([
        groupedWindow.boundingBox(),
        page.getByTestId("workspace-host").boundingBox(),
      ]);
      if (!frame || !workspaceHost) return Number.POSITIVE_INFINITY;
      const expectedX =
        "left" in floatingPosition
          ? workspaceHost.x + floatingPosition.left
          : workspaceHost.x + workspaceHost.width - floatingPosition.right - floatingPosition.width;
      return Math.abs(frame.x - expectedX);
    })
    .toBeLessThanOrEqual(2);
  await expect(page.locator("[data-terminal-identity]")).toBeVisible();
  const commandInput = page.getByLabel("Command input", { exact: true });
  await expect(commandInput).toBeVisible();
  await expect(
    groupedWindow.locator('[data-panel-drag-handle][data-panel-id="terminal"]'),
  ).toHaveCount(1);
  await expect
    .poll(() =>
      page.locator("[data-terminal-identity]").evaluate((element) => element.clientHeight),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      commandInput.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          document
            .elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
            ?.closest('[data-panel-id="terminal"]') !== null
        );
      }),
    )
    .toBe(true);
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
        Reflect.deleteProperty(rail, "insertBefore");
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
  await expect(page.getByRole("button", { name: "Dock Map", exact: true })).toBeVisible();
  const popover = page.locator(".panel-settings-popover");
  await page.getByRole("button", { name: "Settings for Map", exact: true }).click();
  await expect(popover).toHaveAttribute("aria-label", "Settings for Map");
  await popover.getByLabel("Layer", { exact: true }).selectOption("above");
  await page.keyboard.press("Escape");
  await dockPanelAsTab(page, "roomImage", "map");
  const floating = page.locator(".dv-resize-container").filter({
    has: panelDragHandle(page, "map"),
  });
  await expect(floating.locator('[data-panel-drag-handle="true"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Float Status", exact: true }).click();
  const statusFrame = page
    .locator(".dv-resize-container")
    .filter({ has: panelDragHandle(page, "status") });
  await page.getByRole("button", { name: "Settings for Status", exact: true }).click();
  await expect(popover).toHaveAttribute("aria-label", "Settings for Status");
  await popover.getByLabel("Layer", { exact: true }).selectOption("above");
  await page.keyboard.press("Escape");
  const zIndex = (frame: Locator) =>
    frame.evaluate((element) => Number(getComputedStyle(element).zIndex));
  await panelDragHandle(page, "map").locator(".dv-default-tab-content").click();
  await expect.poll(() => zIndex(floating)).toBeGreaterThan(await zIndex(statusFrame));
  await panelDragHandle(page, "roomImage").locator(".dv-default-tab-content").click();
  await expect.poll(() => zIndex(floating)).toBeLessThan(await zIndex(statusFrame));
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
