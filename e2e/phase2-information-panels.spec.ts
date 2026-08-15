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
  await page.goto("/phase2/");
  await page.getByLabel("Host").fill("127.0.0.1");
  await page.getByLabel("Port").fill(String(fixtures.endpoints.ws.port));
  await page.getByLabel("Connection protocol").selectOption("ws");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByTestId("connection-status")).toHaveText("Connected via ws");
}

test("character information panels open, restore, and close from the mobile sheet", async ({
  page,
}) => {
  await connect(page);
  if ((page.viewportSize()?.width ?? Infinity) <= 700) {
    await page.getByRole("button", { name: "Panels", exact: true }).click();
  }
  await page.getByRole("button", { name: "Open Omens", exact: true }).click();
  await expect(page.locator('.information-panel[data-panel-id="omens"]')).toContainText(
    "Waiting for omens",
  );
  await page.reload();
  await expect(page.locator('.information-panel[data-panel-id="omens"]')).toContainText(
    "Waiting for omens",
  );
  const terminal = page.getByLabel("Terminal output");
  const identity = await terminal.getAttribute("data-terminal-identity");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await page.getByRole("button", { name: "Close Omens", exact: true }).click();
  await expect(page.locator('.information-panel[data-panel-id="omens"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await page.getByRole("button", { name: "Focus terminal", exact: true }).click();
  expect(await terminal.getAttribute("data-terminal-identity")).toBe(identity);
});
