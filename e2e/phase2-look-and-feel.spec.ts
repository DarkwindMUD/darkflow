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

    await expect(page).toHaveScreenshot(`phase2-shell-${viewport.name}.png`, {
      fullPage: true,
      animations: "disabled",
      mask: nondeterministicRegions(page),
    });
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

  // Compact (701-939): rails collapse so the terminal keeps its width; one
  // terminal island survives.
  await page.setViewportSize({ width: 800, height: 800 });
  await expect(avatar).toHaveCount(0);
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

  // Collapse hides the body, keeps the header, and never remounts the terminal.
  await avatarTab.getByRole("button", { name: "Collapse Avatar" }).click();
  await expect(avatarTab.getByRole("button", { name: "Expand Avatar" })).toBeVisible();
  await expect(avatarBody).toBeHidden();
  expect(await terminal.getAttribute("data-terminal-identity")).toBe(identity);

  await avatarTab.getByRole("button", { name: "Expand Avatar" }).click();
  await expect(avatarBody).toBeVisible();

  // Float via keyboard, then dock back; the terminal island survives both.
  await avatarTab.getByRole("button", { name: "Float Avatar" }).focus();
  await page.keyboard.press("Enter");
  await expect(avatarFloating).toBeVisible();
  await page
    .locator('.dv-default-tab[data-panel-id="avatar"]')
    .getByRole("button", { name: "Dock Avatar" })
    .click();
  await expect(avatarFloating).toHaveCount(0);
  expect(await terminal.getAttribute("data-terminal-identity")).toBe(identity);
});
