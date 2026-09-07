import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { PanelObservation } from "./workspace-test-bridge";

// Green PR 1 of Phase 2 Step 12 (legacy look and feel).
//
// This spec freezes the *current* /phase2/ presentation as executable evidence
// before any product change, and proves — via the vendor-neutral /phase0/
// workspace bridge — that the legacy "classic hybrid" shape (terminal center,
// two ordered 260px rails, float/redock) is expressible without leaking a
// Dockview handle. Screenshots are the visual "before"; the semantic
// assertions are the durable invariants that must survive later slices.
//
// Baselines are per-project. Desktop viewports run under `chromium` (the spec
// drives the viewport itself); the mobile shell runs under `mobile-chromium`
// (native 390x844 + touch). See phase-2-step-12-parity-matrix.md.

const DESKTOP_VIEWPORTS = [
  { name: "wide-1440x900", width: 1440, height: 900 },
  { name: "standard-1024x768", width: 1024, height: 768 },
  { name: "compact-800x800", width: 800, height: 800 },
] as const;

const isMobileProject = (testInfo: TestInfo): boolean =>
  testInfo.project.name === "mobile-chromium";

/** Mask content that is legitimately nondeterministic across runs. */
function nondeterministicRegions(page: Page) {
  return [page.getByTestId("workspace-status")];
}

async function openPhase2(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Fresh default layout so the "before" record does not depend on prior state.
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("darkflow-session-core-v1");
    } catch {
      // Storage may be unavailable in some contexts; the default layout still loads.
    }
  });
  await page.goto("/phase2/");
  await expect(page.getByTestId("phase2-shell")).toHaveCount(1);
  await expect(page.getByTestId("workspace-host")).toBeVisible();
  await expect
    .poll(async () => (await page.getByTestId("workspace-host").boundingBox())?.height ?? 0)
    .toBeGreaterThan(100);
  // The single terminal island is the load-complete signal and a core invariant.
  await expect(page.locator("[data-terminal-identity]")).toHaveCount(1);
}

for (const viewport of DESKTOP_VIEWPORTS) {
  test(`freezes the /phase2/ desktop shell at ${viewport.name}`, async ({ page }, testInfo) => {
    test.skip(isMobileProject(testInfo), "desktop reference runs under the chromium project");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openPhase2(page);

    // Durable invariants (survive the shell rewrite).
    await expect(page.locator("[data-terminal-identity]")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Panels", exact: true })).toBeVisible();
    await expect(page.locator(".app-workspace-slot > .workspace-controls")).toHaveCount(1);
    await expect(page.locator(".app-workspace-slot > .workspace-status")).toHaveCount(1);
    expect(
      (await page.getByRole("form", { name: "Connection" }).boundingBox())?.height,
    ).toBeLessThanOrEqual(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);

    await expect(page).toHaveScreenshot(`phase2-shell-${viewport.name}.png`, {
      fullPage: true,
      animations: "disabled",
      mask: nondeterministicRegions(page),
    });

    await page.getByRole("button", { name: "Panels", exact: true }).click();
    const panelMenu = page.locator(".df-panels-menu-list");
    const panelTrigger = page.getByRole("button", { name: "Panels", exact: true });
    const [menuBounds, triggerBounds] = await Promise.all([
      panelMenu.boundingBox(),
      panelTrigger.boundingBox(),
    ]);
    expect(menuBounds).not.toBeNull();
    expect(triggerBounds).not.toBeNull();
    expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(menuBounds!.x + menuBounds!.width).toBeCloseTo(
      triggerBounds!.x + triggerBounds!.width,
      0,
    );
    await expect(panelMenu.locator(".df-panels-menu-groups")).toHaveCSS("column-count", "2");
    expect(
      await panelMenu.locator(".df-panels-menu-group").evaluateAll((groups) =>
        groups.map((group) => ({
          items: [...group.querySelectorAll("label")].map((label) => label.textContent?.trim()),
          title: group.querySelector("legend")?.textContent,
        })),
      ),
    ).toEqual([
      {
        title: "Character",
        items: [
          "Avatar",
          "Buffs",
          "Cyberware",
          "Guild vitals",
          "Inventory",
          "Stats",
          "Status",
          "Vitals",
          "Worth",
        ],
      },
      { title: "Progress", items: ["Achievements", "Quests", "XP monitor"] },
      { title: "Social", items: ["Chat", "Group"] },
      { title: "System", items: ["Connection health"] },
      { title: "World", items: ["Jukebox", "Map", "Omens", "Room", "Room Image", "Sky"] },
    ]);
    if (viewport.name === "wide-1440x900" && testInfo.project.name === "chromium") {
      await expect(panelMenu).toHaveScreenshot("phase2-panels-menu.png", {
        animations: "disabled",
      });
    }
    expect(
      await page.getByRole("checkbox", { name: "Avatar", exact: true }).evaluate((checkbox) => {
        const label = checkbox.closest("label");
        if (!label) return false;
        const bounds = label.getBoundingClientRect();
        const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + 2);
        return hit !== null && label.contains(hit);
      }),
    ).toBe(true);
  });
}

test("freezes the /phase2/ mobile shell and panels sheet", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "mobile reference runs under the mobile-chromium project");
  await openPhase2(page);

  const trigger = page.getByRole("button", { name: "Panels", exact: true });
  const sheet = page.getByRole("dialog", { name: "Panels" });

  // The workspace is the mobile view; the sheet only selects within it.
  await expect(page.getByTestId("workspace-host")).toBeVisible();
  await expect(trigger).toBeVisible();
  await expect(sheet).toBeHidden();

  await expect(page).toHaveScreenshot("phase2-shell-mobile-390x844.png", {
    fullPage: true,
    animations: "disabled",
    mask: nondeterministicRegions(page),
  });

  await trigger.click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Close panels" })).toBeFocused();
  await expect(page).toHaveScreenshot("phase2-sheet-mobile-390x844.png", {
    animations: "disabled",
    mask: nondeterministicRegions(page),
  });
});

// --- Rail adapter experiment (vendor-neutral placement contract only) --------

async function openBridge(page: Page): Promise<void> {
  await page.goto("/phase0/");
  await expect(page.getByTestId("workspace-host")).toBeVisible();
  await expect
    .poll(() =>
      page.getByTestId("workspace-host").evaluate((host) => host.getBoundingClientRect().width > 0),
    )
    .toBe(true);
  await page.waitForFunction(() => typeof window.__darkflowWorkspace?.upsert === "function");
}

async function observe(page: Page, id: string): Promise<PanelObservation> {
  const panel = await page.evaluate((panelId) => window.__darkflowWorkspace.panel(panelId), id);
  expect(panel, `expected panel ${id}`).not.toBeNull();
  return panel as PanelObservation;
}

async function terminalIdentity(page: Page): Promise<string> {
  const terminal = await page.evaluate(() => window.__darkflowWorkspace.terminal("rail-terminal"));
  expect(terminal, "expected terminal island").not.toBeNull();
  return terminal!.identity;
}

test("expresses the classic terminal-center + two-rail layout without a vendor leak", async ({
  page,
}, testInfo) => {
  test.skip(isMobileProject(testInfo), "adapter experiment runs under the chromium project");
  await page.setViewportSize({ width: 1280, height: 800 });
  await openBridge(page);

  const leftRail = ["avatar", "status", "vitals", "sky"] as const;
  const rightRail = ["group", "inventory", "quests"] as const;

  await page.evaluate(
    ({ left, right }) => {
      const bridge = window.__darkflowWorkspace;
      bridge.upsert({ id: "rail-terminal", kind: "terminal", title: "Terminal", state: {} });
      bridge.focusTerminal("rail-terminal");
      // Left rail: first panel docks left of Terminal, the rest stack below it.
      left.forEach((name, index) => {
        bridge.upsert({
          id: `left-${name}`,
          kind: "lifecycle",
          title: name,
          state: { value: name },
          placement:
            index === 0
              ? { kind: "grid", direction: "left", referencePanelId: "rail-terminal" }
              : { kind: "grid", direction: "below", referencePanelId: `left-${left[index - 1]}` },
        });
      });
      right.forEach((name, index) => {
        bridge.upsert({
          id: `right-${name}`,
          kind: "lifecycle",
          title: name,
          state: { value: name },
          placement:
            index === 0
              ? { kind: "grid", direction: "right", referencePanelId: "rail-terminal" }
              : { kind: "grid", direction: "below", referencePanelId: `right-${right[index - 1]}` },
        });
      });
      bridge.resize("left-avatar", { width: 260 });
      bridge.resize("right-group", { width: 260 });
    },
    { left: [...leftRail], right: [...rightRail] },
  );

  const identity = await terminalIdentity(page);

  // Structure: terminal is centered between a left and a right rail.
  const leftEdge = await observe(page, "left-avatar");
  const terminal = await observe(page, "rail-terminal");
  const rightEdge = await observe(page, "right-group");
  expect(leftEdge.bounds.left).toBeLessThan(terminal.bounds.left);
  expect(terminal.bounds.left).toBeLessThan(rightEdge.bounds.left);
  // Center is the flexible remainder; each rail is narrower than the terminal.
  expect(terminal.bounds.width).toBeGreaterThan(leftEdge.bounds.width);
  expect(terminal.bounds.width).toBeGreaterThan(rightEdge.bounds.width);
  expect(leftEdge.bounds.width).toBeLessThan(360);
  expect(rightEdge.bounds.width).toBeLessThan(360);

  // Each rail pane is its own box (legacy rails stack independent panels, not
  // tabs), aligned in one column and ordered top-to-bottom.
  const leftStatus = await observe(page, "left-status");
  expect(leftStatus.groupId).not.toBe(leftEdge.groupId);
  expect(Math.abs(leftStatus.bounds.left - leftEdge.bounds.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(leftStatus.bounds.width - leftEdge.bounds.width)).toBeLessThanOrEqual(2);
  expect(leftStatus.bounds.top).toBeGreaterThan(leftEdge.bounds.top);

  // Rail overflow: adding another panel keeps every rail panel mounted.
  await page.evaluate(() => {
    window.__darkflowWorkspace.upsert({
      id: "left-omens",
      kind: "lifecycle",
      title: "omens",
      state: { value: "omens" },
      placement: { kind: "grid", direction: "below", referencePanelId: "left-sky" },
    });
  });
  await expect
    .poll(() => page.evaluate(() => window.__darkflowWorkspace.panel("left-omens")))
    .not.toBeNull();
  expect(await terminalIdentity(page)).toBe(identity);

  // Float a rail panel, then redock it — Terminal identity survives both.
  await page.evaluate(() =>
    window.__darkflowWorkspace.move("left-status", {
      kind: "floating",
      bounds: { left: 300, top: 200, width: 320, height: 200 },
    }),
  );
  await expect
    .poll(() => page.evaluate(() => window.__darkflowWorkspace.panel("left-status")?.floating))
    .toBe(true);
  expect(await terminalIdentity(page)).toBe(identity);

  await page.evaluate(() =>
    window.__darkflowWorkspace.move("left-status", {
      kind: "grid",
      direction: "below",
      referencePanelId: "left-avatar",
    }),
  );
  await expect
    .poll(() => page.evaluate(() => window.__darkflowWorkspace.panel("left-status")?.floating))
    .toBe(false);
  expect(await terminalIdentity(page)).toBe(identity);

  // Exactly one terminal island throughout every rail operation.
  expect(await page.evaluate(() => window.__darkflowWorkspace.diagnostics().terminalIslands)).toBe(
    1,
  );
});

test("collapses rails off the desktop zone and restores them on return", async ({
  page,
}, testInfo) => {
  test.skip(isMobileProject(testInfo), "responsive round-trip runs under the chromium project");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPhase2(page);

  const terminal = page.locator("[data-terminal-identity]");
  const identity = await terminal.getAttribute("data-terminal-identity");
  const avatar = page.locator('[data-panel-drag-handle][data-panel-id="avatar"]');

  // Desktop: the frozen left rail is present.
  await expect(avatar).toBeVisible();

  // Compact (701-939): the rails empty out and go inert so the terminal keeps
  // its width; one terminal island survives. Emptying matters as much as
  // hiding -- off the desktop zone the sheet opens these panels into the grid,
  // and a card left mounted in a hidden rail would double-mount the same id.
  await page.setViewportSize({ width: 800, height: 800 });
  await expect(avatar).toHaveCount(0);
  await expect(page.locator('[data-rail="left"]')).toBeHidden();
  await expect(page.locator('[data-rail="right"]')).toBeHidden();
  await expect(terminal).toHaveCount(1);
  expect(await terminal.getAttribute("data-terminal-identity")).toBe(identity);

  // Mobile (<=700): still terminal-centric.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(avatar).toHaveCount(0);
  await expect(terminal).toHaveCount(1);

  // Back to desktop: the captured rail layout is restored, identity intact.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(avatar).toBeVisible();
  await expect(terminal).toHaveCount(1);
  expect(await terminal.getAttribute("data-terminal-identity")).toBe(identity);
});

test("persistent panes expose accessible collapse, float, and dock controls", async ({
  page,
}, testInfo) => {
  test.skip(isMobileProject(testInfo), "pane controls are a desktop affordance");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPhase2(page);

  const terminal = page.locator("[data-terminal-identity]");
  const identity = await terminal.getAttribute("data-terminal-identity");
  const avatarTab = page.locator('.dv-default-tab[data-panel-id="avatar"]');
  const avatarBody = page.locator('.information-panel[data-panel-id="avatar"]');
  const avatarFloating = page.locator('[data-floating-drag-handle][data-panel-id="avatar"]');

  expect(
    await page.locator('.dv-tab:has(.dv-default-tab[data-panel-id="terminal"])').evaluate((tab) => {
      const header = tab.closest(".dv-tabs-and-actions-container");
      return header
        ? Math.abs(header.getBoundingClientRect().width - tab.getBoundingClientRect().width)
        : Infinity;
    }),
  ).toBeLessThanOrEqual(2);

  expect(
    await avatarTab.evaluate((header) => {
      const close = header.querySelector<HTMLElement>('[aria-label="Close Avatar"]');
      return close
        ? Math.abs(header.getBoundingClientRect().right - close.getBoundingClientRect().right)
        : Infinity;
    }),
  ).toBeLessThanOrEqual(2);

  const closeAvatar = avatarTab.getByRole("button", { name: "Close Avatar" });
  const collapseAvatar = avatarTab.getByRole("button", { name: "Collapse Avatar" });
  await expect(closeAvatar.locator(".lucide-x")).toBeVisible();
  await expect(collapseAvatar.locator(".lucide-chevrons-down-up")).toBeVisible();
  await expect(collapseAvatar.locator(".lucide-chevrons-up-down")).toBeHidden();

  // Collapse hides the body, keeps the header, and never remounts the terminal.
  await collapseAvatar.click();
  const expandAvatar = avatarTab.getByRole("button", { name: "Expand Avatar" });
  await expect(expandAvatar.locator(".lucide-chevrons-up-down")).toBeVisible();
  await expect(expandAvatar.locator(".lucide-chevrons-down-up")).toBeHidden();
  await expect(avatarBody).toBeHidden();
  expect(await terminal.getAttribute("data-terminal-identity")).toBe(identity);

  await avatarTab.getByRole("button", { name: "Expand Avatar" }).click();
  await expect(avatarBody).toBeVisible();

  // Float via keyboard, then dock back; the terminal island survives both.
  const floatAvatar = avatarTab.getByRole("button", { name: "Float Avatar" });
  await expect(floatAvatar.locator(".lucide-square-square")).toBeVisible();
  await expect(floatAvatar.locator(".lucide-dock")).toBeHidden();
  await floatAvatar.focus();
  await page.keyboard.press("Enter");
  await expect(avatarFloating).toBeVisible();
  await expect(
    avatarTab.getByRole("button", { name: "Dock Avatar" }).locator(".lucide-dock"),
  ).toBeVisible();
  await expect(
    avatarTab.getByRole("button", { name: "Dock Avatar" }).locator(".lucide-square-square"),
  ).toBeHidden();
  const floatingFrame = avatarFloating.locator("..");
  const resizeGrip = floatingFrame.locator(".dv-resize-handle-bottomright");
  await expect(resizeGrip).toBeVisible();
  await expect(resizeGrip).toHaveAttribute("title", "Resize Avatar");
  await expect(resizeGrip).toHaveCSS("width", "16px");
  await expect(resizeGrip).toHaveCSS("height", "16px");
  await expect(resizeGrip).toHaveCSS("z-index", "999");
  await expect(resizeGrip).toHaveCSS("cursor", "se-resize");
  expect(
    await resizeGrip.evaluate((grip) => {
      const bounds = grip.getBoundingClientRect();
      return (
        document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) ===
        grip
      );
    }),
  ).toBe(true);
  await expect(avatarFloating).toHaveCSS("height", "12px");
  await expect(floatingFrame).toHaveCSS("border-top-width", "0px");
  expect(await floatingFrame.evaluate((frame) => getComputedStyle(frame).boxShadow)).toContain(
    "inset",
  );
  expect(
    await resizeGrip.evaluate((grip) => getComputedStyle(grip, "::before").backgroundImage),
  ).toContain("linear-gradient");
  const floatingGroup = floatingFrame.locator(".dv-groupview");
  await expect(floatingGroup).toHaveCSS("border-top-left-radius", "0px");
  await expect(floatingGroup).toHaveCSS("border-bottom-left-radius", "5px");
  const floatingTabHeight = await avatarTab.evaluate((tab) => tab.getBoundingClientRect().height);
  const dockedTabHeight = await page
    .locator('.dv-default-tab[data-panel-id="terminal"]')
    .evaluate((tab) => tab.getBoundingClientRect().height);
  expect(floatingTabHeight).toBeCloseTo(dockedTabHeight, 0);
  const titlebarColor = await avatarFloating.evaluate(
    (titlebar) => getComputedStyle(titlebar).backgroundColor,
  );
  await avatarFloating.hover();
  expect(
    await avatarFloating.evaluate((titlebar) => getComputedStyle(titlebar).backgroundColor),
  ).not.toBe(titlebarColor);
  if (testInfo.project.name === "chromium") {
    await expect(floatingFrame).toHaveScreenshot("phase2-floating-panel.png", {
      animations: "disabled",
    });
  }
  const expandedBounds = await floatingFrame.boundingBox();
  expect(expandedBounds).not.toBeNull();
  const gripX = expandedBounds!.x + expandedBounds!.width - 8;
  const gripY = expandedBounds!.y + expandedBounds!.height - 8;
  await page.mouse.move(gripX, gripY);
  await page.mouse.down();
  await page.mouse.move(gripX, gripY);
  await page.mouse.move(gripX + 20, gripY + 20);
  const resizedBounds = await floatingFrame.boundingBox();
  await page.mouse.up();
  expect(resizedBounds!.x).toBeCloseTo(expandedBounds!.x, 0);
  expect(resizedBounds!.y).toBeCloseTo(expandedBounds!.y, 0);
  const titlebarBounds = await avatarFloating.boundingBox();
  const dragX = titlebarBounds!.x + titlebarBounds!.width / 2;
  const dragY = titlebarBounds!.y + titlebarBounds!.height / 2;
  await page.mouse.move(dragX, dragY);
  await page.mouse.down();
  await page.mouse.move(dragX + 1, dragY + 1);
  await page.mouse.move(dragX + 80, dragY + 40);
  await page.mouse.up();
  const draggedFrame = avatarFloating.locator("..");
  const draggedBounds = await draggedFrame.boundingBox();
  expect(draggedBounds!.x).toBeCloseTo(resizedBounds!.x + 80, 0);
  expect(draggedBounds!.y).toBeCloseTo(resizedBounds!.y + 40, 0);
  await avatarTab.getByRole("button", { name: "Collapse Avatar" }).click();
  const collapsedBounds = await draggedFrame.boundingBox();
  expect(collapsedBounds).not.toBeNull();
  expect(collapsedBounds!.height).toBeLessThan(expandedBounds!.height);
  expect(collapsedBounds!.y).toBeCloseTo(draggedBounds!.y, 0);
  await expect(resizeGrip).toBeHidden();
  await avatarTab.getByRole("button", { name: "Expand Avatar" }).click();
  await expect(resizeGrip).toBeVisible();
  await expect
    .poll(async () => (await draggedFrame.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(expandedBounds!.height - 2);
  expect((await draggedFrame.boundingBox())!.y).toBeCloseTo(collapsedBounds!.y, 0);
  await expect(avatarBody).toBeVisible();
  await page
    .locator('.dv-default-tab[data-panel-id="avatar"]')
    .getByRole("button", { name: "Dock Avatar" })
    .click();
  await expect(avatarFloating).toHaveCount(0);
  expect(await terminal.getAttribute("data-terminal-identity")).toBe(identity);

  await avatarTab.getByRole("button", { name: "Close Avatar" }).click();
  await expect(avatarTab).toHaveCount(0);
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");
});

test("preserved floating content leaves its resize grip interactive", async ({
  page,
}, testInfo) => {
  test.skip(isMobileProject(testInfo), "floating resize is a desktop affordance");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPhase2(page);

  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await page.getByRole("checkbox", { name: "Chat", exact: true }).click();
  const frame = page.locator('[data-floating-drag-handle][data-panel-id="chat"]').locator("..");
  const grip = frame.locator(".dv-resize-handle-bottomright");
  await expect(grip).toBeVisible();
  await expect(grip).toHaveCSS("cursor", "se-resize");
  expect(
    await grip.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return document.elementFromPoint(bounds.right - 8, bounds.bottom - 8) === element;
    }),
  ).toBe(true);

  const before = await frame.boundingBox();
  expect(before).not.toBeNull();
  const x = before!.x + before!.width - 8;
  const y = before!.y + before!.height - 8;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y);
  await page.mouse.move(x + 20, y + 20);
  await page.mouse.up();
  const after = await frame.boundingBox();
  expect(after!.x).toBeCloseTo(before!.x, 0);
  expect(after!.y).toBeCloseTo(before!.y, 0);
  expect(after!.width).toBeGreaterThan(before!.width);
  expect(after!.height).toBeGreaterThan(before!.height);

  await page.setViewportSize({ width: 1024, height: 768 });
  const host = page.getByTestId("workspace-host");
  await expect
    .poll(async () => {
      const [frameBounds, hostBounds] = await Promise.all([
        frame.boundingBox(),
        host.boundingBox(),
      ]);
      return frameBounds && hostBounds
        ? frameBounds.x + frameBounds.width <= hostBounds.x + hostBounds.width
        : false;
    })
    .toBe(true);
  expect(
    await grip.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return document.elementFromPoint(bounds.right - 8, bounds.bottom - 8) === element;
    }),
  ).toBe(true);
});

test("rail cards size to content under one scrollbar and reorder by drag", async ({
  page,
}, testInfo) => {
  test.skip(isMobileProject(testInfo), "rails are a desktop affordance");
  await page.setViewportSize({ width: 1440, height: 700 });
  await openPhase2(page);

  const rail = page.locator('[data-rail="left"]');
  const cards = rail.locator(".df-rail-card");
  const order = () =>
    cards.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.panelId));

  expect(await order()).toEqual([
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

  // The defect this replaced: ten panels needed 1000px of grid slices in a
  // short rail, so the last three were clipped and unreachable. The rail is
  // now the only scroller and every card sizes to its own content.
  expect(await rail.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(
    await cards.evaluateAll((nodes) =>
      nodes.every((node) => node.scrollHeight <= node.clientHeight),
    ),
  ).toBe(true);

  // Stats is the card the old grid clipped; it must be reachable by scrolling.
  await cards.last().scrollIntoViewIfNeeded();
  await expect(cards.last()).toBeVisible();
  await rail.evaluate((element) => element.scrollTo(0, 0));

  // Reordering is a rail-local drag: no Dockview involvement, no vendor leak.
  await page
    .locator('[data-panel-drag-handle][data-panel-id="status"]')
    .dragTo(page.locator('[data-panel-drag-handle][data-panel-id="avatar"]'));
  expect((await order()).slice(0, 2)).toEqual(["status", "avatar"]);

  // The same drag must land correctly with the rail scrolled: the insertion
  // index comes from viewport-relative rects, not from offsets into the column.
  await rail.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect.poll(() => rail.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page
    .locator('[data-panel-drag-handle][data-panel-id="stats"]')
    .dragTo(page.locator('[data-panel-drag-handle][data-panel-id="xpmon"]'));
  const scrolled = await order();
  expect(scrolled.indexOf("stats")).toBeLessThan(scrolled.indexOf("xpmon"));
});

test("rail card drags to the other rail and to the grid as a float", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "rails are a desktop affordance");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPhase2(page);

  const leftRail = page.locator('[data-rail="left"]');
  const rightRail = page.locator('[data-rail="right"]');
  const leftIds = () =>
    leftRail
      .locator(".df-rail-card")
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.panelId));
  const rightIds = () =>
    rightRail
      .locator(".df-rail-card")
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.panelId));

  // Rail-to-rail: drop Status onto the right rail. It leaves the left rail and
  // appears in the right rail at the drop index.
  await page
    .locator('[data-panel-drag-handle][data-panel-id="status"]')
    .dragTo(page.locator('[data-panel-drag-handle][data-panel-id="group"]'));
  expect(await leftIds()).not.toContain("status");
  expect(await rightIds()).toContain("status");

  // Rail-to-grid: drop Avatar onto the terminal area. It leaves the rail and
  // becomes a floating pane in the Dockview host.
  const terminalArea = page.locator('[data-panel-drag-handle][data-panel-id="terminal"]').first();
  const terminalBounds = await terminalArea.boundingBox();
  await page.locator('[data-panel-drag-handle][data-panel-id="avatar"]').dragTo(terminalArea);
  expect(await leftIds()).not.toContain("avatar");
  const avatarTitlebar = page.locator('.dv-floating-titlebar[data-panel-id="avatar"]');
  await expect(avatarTitlebar).toBeVisible();
  const avatarBounds = await avatarTitlebar.boundingBox();
  expect(avatarBounds!.x).toBe(Math.floor(terminalBounds!.x + terminalBounds!.width / 2));
  expect(avatarBounds!.y).toBe(Math.floor(terminalBounds!.y + terminalBounds!.height / 2));
});
