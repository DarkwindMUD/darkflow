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

test("inventory and progress panels open from desktop and mobile controls", async ({ page }) => {
  await connect(page);
  for (const [title, id] of [
    ["Inventory", "inventory"],
    ["Quests", "quests"],
    ["Achievements", "achievements"],
    ["Cyberware", "cyberware"],
  ]) {
    if ((page.viewportSize()?.width ?? Infinity) <= 700) {
      await page.getByRole("button", { name: "Panels", exact: true }).click();
    }
    await page.getByRole("button", { name: `Open ${title}`, exact: true }).click();
    await expect(page.locator(`.information-panel[data-panel-id="${id}"]`)).toHaveCount(1);
  }
});

test("wire data drives inventory, progress, and accessible cyberware details", async ({ page }) => {
  await connect(page);
  const endpoint = fixtures.endpoints.ws;
  for (const title of ["Inventory", "Quests", "Achievements", "Cyberware"]) {
    if ((page.viewportSize()?.width ?? Infinity) <= 700) {
      await page.getByRole("button", { name: "Panels", exact: true }).click();
    }
    await page.getByRole("button", { name: `Open ${title}`, exact: true }).click();
  }

  endpoint.sendGmcp("Char.Items.List", {
    location: "inv",
    items: [
      { id: "sword", name: "a bronze sword (main weapon)", attrib: "l" },
      { id: "cloak", name: "a wool cloak (worn over the shoulders)", attrib: "w" },
    ],
  });
  endpoint.sendGmcp("Darkwind.Quests.List", [
    { id: "herbs", name: "Gather herbs", status: "Started", current: 1, total: 3 },
  ]);
  endpoint.sendGmcp("Darkwind.Achievements.List", {
    summary: {
      unlockedTierCount: 1,
      totalTierCount: 2,
      completedFamilyCount: 0,
      totalFamilyCount: 1,
    },
    families: [{ id: "explorer", name: "Explorer", currentValue: 2, nextTierThreshold: 5 }],
  });
  endpoint.sendGmcp("Darkwind.Cyberware.List", {
    installed: [{ id: "eyes", name: "Targeting Suite", locations: ["left_eye"], strain: 2 }],
    strain: { used: 2, total: 6 },
  });

  const inventory = page.locator('.information-panel[data-panel-id="inventory"]');
  await expect(inventory).toContainText("A bronze sword");
  await inventory.getByRole("button", { name: "Worn" }).click();
  await expect(inventory.locator('.inv-tab-content[data-tab="worn"]')).toHaveClass(/active/);
  await expect(page.locator('.information-panel[data-panel-id="quests"]')).toContainText(
    "Gather herbs",
  );
  await expect(page.locator('.information-panel[data-panel-id="achievements"]')).toContainText(
    "Explorer",
  );

  const cyberwareRow = page.getByRole("button", { name: /Targeting Suite/ });
  await cyberwareRow.focus();
  await cyberwareRow.press("Enter");
  await expect
    .poll(() => endpoint.gmcpMessages)
    .toContain('Darkwind.Cyberware.Details {"id":"eyes"}');

  const dialog = page.getByRole("dialog", { name: "Cyberware details" });
  await expect(dialog).toContainText("Querying implant");
  endpoint.sendGmcp("Darkwind.Cyberware.Details", {
    id: "other",
    description: "Wrong implant",
  });
  await expect(dialog).not.toContainText("Wrong implant");
  endpoint.sendGmcp("Darkwind.Cyberware.Details", {
    id: "eyes",
    name: "Targeting Suite",
    description: "Locked on",
    image_pending: 1,
  });
  endpoint.sendGmcp("Darkwind.Cyberware.Image", { id: "eyes", url: "/eyes.png" });
  await expect(dialog).toContainText("Locked on");
  await expect(dialog.getByRole("img", { name: "Targeting Suite" })).toHaveAttribute(
    "src",
    "/eyes.png",
  );

  await dialog.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(cyberwareRow).toBeFocused();
});
