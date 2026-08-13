import { expect, test, type Locator, type Page } from "@playwright/test";
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

async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

async function drag(page: Page, source: Locator, target: Locator): Promise<void> {
  const start = await center(source);
  const end = await center(target);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
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

  const output = page.getByLabel("Terminal output", { exact: true });
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
  await expect(page.getByTestId("terminal-announcer")).toContainText("phase two ANSI");

  const beforeLayout = await output.textContent();
  await drag(
    page,
    page.locator('[data-panel-drag-handle][data-panel-id="panel-placeholder"]'),
    page.locator('[data-panel-drag-handle][data-panel-id="terminal"]'),
  );
  await expect(page.getByTestId("workspace-status")).toHaveText("Workspace saved");
  await page.setViewportSize({ width: 1_100, height: 720 });
  expect(await output.getAttribute("data-terminal-identity")).toBe(identity);
  expect(await output.textContent()).toBe(beforeLayout);
  await page.getByRole("button", { name: "Focus terminal", exact: true }).click();
  await expect(output).toBeFocused();

  const terminalHandle = page.locator('[data-panel-drag-handle][data-panel-id="terminal"]');
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

  await drag(
    page,
    floatingHandle,
    page.locator('[data-panel-drag-handle][data-panel-id="panel-placeholder"]'),
  );
  await expect(floatingHandle).toHaveCount(0);
  await page.getByRole("button", { name: "Focus terminal", exact: true }).click();
  await expect(output).toBeFocused();
  expect(await output.getAttribute("data-terminal-identity")).toBe(identity);
  expect(await output.textContent()).toBe(beforeLayout);

  endpoint.dropConnections();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Retry now", exact: true }).click();
  await expect(page.getByTestId("connection-status")).toHaveText("Connected via ws");
  endpoint.sendText("delivered after reconnect\n");
  await expect(output).toContainText("delivered after reconnect");
  expect(await output.getAttribute("data-terminal-identity")).toBe(identity);

  await page.getByRole("button", { name: "Clear", exact: true }).click({ force: true });
  await expect(output).toBeEmpty();
  await page.getByRole("button", { name: "Focus terminal", exact: true }).click();
  await expect(output).toBeFocused();
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
