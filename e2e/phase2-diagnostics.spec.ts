import { expect, test, type Page } from "@playwright/test";
import { TransportFixtureOwner } from "./fixtures/transport-fixtures";

let fixtures: TransportFixtureOwner;
const CLEAR_MAP_CONFIRMATION =
  "Clear the authoritative map cache for this world? This affects other characters on the same world and cannot be undone locally. Map Export can preserve a diagnostic copy, but it cannot restore the cache.";

test.beforeAll(async () => {
  fixtures = await TransportFixtureOwner.start();
});

test.afterAll(async () => {
  await fixtures.close();
});

async function connect(page: Page): Promise<void> {
  await page.goto("/phase2/?rfc2549=1");
  await page.getByLabel("Host").fill("127.0.0.1");
  await page.getByLabel("Port", { exact: true }).fill(String(fixtures.endpoints.ws.port));
  await page.getByLabel("Connection protocol").selectOption("ws");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByTestId("connection-status")).toHaveText("Connected");
}

async function connectCurrentPage(page: Page): Promise<void> {
  await page.getByLabel("Host").fill("127.0.0.1");
  await page.getByLabel("Port", { exact: true }).fill(String(fixtures.endpoints.ws.port));
  await page.getByLabel("Connection protocol").selectOption("ws");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByTestId("connection-status")).toHaveText("Connected");
}

test("connection health and RFC 2549 use the public session snapshot", async ({ page }) => {
  await connect(page);
  const endpoint = fixtures.endpoints.ws;
  endpoint.sendGmcp("Game", {
    game_name: "Darkwind",
    game_version: "4.2.2",
    game_uptime: 86_400,
    game_reboot: 0,
  });
  endpoint.sendGmcp("Darkwind.Lag.Status", {
    uptime_s: 100,
    window_s: 60,
    hb_interval_ms: 2_000,
    hb_drift_avg_ms: 4,
    hb_drift_max_ms: 35,
    hb_missed: 0,
    cmds_per_sec_x100: 145,
    lines_per_sec_x100: 820,
    hb_processed_pct: 100,
    obj_processed_pct: 100,
  });
  await expect(page.locator("#status-uptime")).toHaveText("Uptime: 1d 0s");
  await expect(page.locator("#status-uptime")).toHaveCSS("width", "152px");
  await expect(page.locator("#status-server-version")).toHaveText("Server v4.2.2");
  endpoint.sendGmcp("Game", { game_uptime: 86_430, game_reboot: 1_153_471 });
  await expect(page.locator("#status-uptime")).toHaveText("Uptime: 1d 30s");
  await expect(page.locator("#status-server-version")).toHaveText("Server v4.2.2");
  await expect.poll(() => endpoint.gmcpMessages, { timeout: 8_000 }).toContain("Core.Ping");
  const latency = page.locator("#status-latency");
  await expect(latency).toBeVisible();
  await expect(latency).toHaveCSS("width", "64px");
  const mobile = (page.viewportSize()?.width ?? Infinity) <= 700;
  if (mobile) await page.getByTitle("Disable RFC 2549 debug").click();
  await latency.click();
  const health = page.locator('.connection-health-panel[data-panel-id="connection-health"]');
  await expect(health).toContainText("Collecting samples");
  await expect(health).toContainText("drift 4ms avg, 35ms max");

  endpoint.sendGmcp("Darkwind.Lag.Status", { hb_drift_avg_ms: "invalid" });
  await expect(health).toContainText("drift 4ms avg, 35ms max");

  await health.getByRole("button", { name: "Run full check" }).click();
  await expect(health.getByRole("button", { name: "Checking..." })).toBeDisabled();

  if (mobile)
    await page.evaluate(() =>
      (window as typeof window & { rfc2549Debug: { enable(): void } }).rfc2549Debug.enable(),
    );
  const rfc = page.getByLabel("RFC 2549 debug panel");
  await expect(rfc).toContainText("Avian QoS");
  await expect(rfc).toContainText("ws direct to 127.0.0.1");
  await page.evaluate(() => {
    const debug = (
      window as typeof window & {
        rfc2549Debug: { markRed(reason: string): void; setQoS(value: string): void };
      }
    ).rfc2549Debug;
    debug.markRed("fixture");
    debug.setQoS("First");
  });
  await expect(rfc).toContainText("RED-marked packets1");
  await expect(rfc).toContainText("QoS classFirst");

  await rfc.getByTitle("Disable RFC 2549 debug").click();
  await expect(rfc).toHaveCount(0);
  await page.evaluate(() =>
    (window as typeof window & { rfc2549Debug: { enable(): void } }).rfc2549Debug.enable(),
  );
  await expect(page.getByLabel("RFC 2549 debug panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("RFC 2549 debug panel")).toHaveCount(0);

  endpoint.dropConnections();
  await expect(health).not.toContainText("drift 4ms avg, 35ms max");
  await expect(page.locator("#connect-btn")).toHaveText(/Retrying in \d+s/);
  await expect(page.getByTestId("connection-status")).toHaveText("Connected");
  await expect(health).toContainText("drift 4ms avg, 35ms max");
  await expect(health).toContainText("1 reconnect(s)");

  await page.evaluate(() => {
    (
      window as unknown as { __darkflowPhase1Runtime: { session: { dispose(): void } } }
    ).__darkflowPhase1Runtime.session.dispose();
  });
  await expect(page.locator('[data-workspace-owned="true"]')).toHaveCount(0);
  endpoint.sendGmcp("Darkwind.Lag.Status", {
    uptime_s: 200,
    window_s: 60,
    hb_interval_ms: 2_000,
    hb_drift_avg_ms: 99,
    hb_drift_max_ms: 999,
    hb_missed: 10,
    cmds_per_sec_x100: 1,
    lines_per_sec_x100: 1,
    hb_processed_pct: 50,
    obj_processed_pct: 50,
  });
  await expect(page.locator('[data-workspace-owned="true"]')).toHaveCount(0);
  await expect.poll(() => endpoint.activeSocketCount()).toBe(0);
});

test("GMCP debug is Settings-gated, bounded, and uses only public diagnostics actions", async ({
  page,
}) => {
  await page.goto("/phase2/");
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await expect(page.getByText("GMCP Debug", { exact: true })).toHaveCount(0);
  if ((page.viewportSize()?.width ?? Infinity) <= 700)
    await page.getByRole("button", { name: "Close panels", exact: true }).click();
  else await page.getByRole("button", { name: "Panels", exact: true }).click();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  const debugTab = settings.getByRole("tab", { name: "Debug", exact: true });
  if ((page.viewportSize()?.width ?? Infinity) > 700)
    await expect(settings.getByRole("heading", { name: "Help", exact: true })).toBeVisible();
  await debugTab.click();
  await expect(settings.getByLabel("Enable GMCP Debug", { exact: true })).not.toBeChecked();
  await settings.getByLabel("Enable GMCP Debug", { exact: true }).check();
  await settings.getByRole("button", { name: "Save & Close", exact: true }).click();
  await settings
    .getByRole("dialog", { name: "Download changed settings?", exact: true })
    .getByRole("button", { name: "Skip", exact: true })
    .click();

  const panel = page.locator('.gmcp-debug-panel[data-panel-id="gmcp-debug"]');
  await expect(panel).toBeVisible();
  await connectCurrentPage(page);
  fixtures.endpoints.ws.sendGmcp("Fixture.Secret", {
    nested: { authorization: "Bearer must-not-render", visible: "safe" },
  });
  await expect(panel).toContainText("Fixture.Secret");
  await expect(panel).toContainText("[redacted]");
  await expect(panel).not.toContainText("must-not-render");

  await panel.getByRole("button", { name: "Copy All" }).click();
  await expect(panel.getByRole("status")).toContainText(
    /Copied all entries|Clipboard access failed/,
  );
  await panel.getByRole("button", { name: "Map Summary" }).click();
  await expect(panel).toContainText("Map Summary");
  await panel.getByRole("button", { name: "Map Export" }).click();
  await expect(panel.getByRole("status")).toContainText(
    /Copied map export|Clipboard access failed/,
  );

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toBe(CLEAR_MAP_CONFIRMATION);
    await dialog.dismiss();
  });
  await panel.getByRole("button", { name: "Clear Map" }).click();
  await expect(panel.getByRole("status")).not.toContainText("Map cache cleared");
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toBe(CLEAR_MAP_CONFIRMATION);
    await dialog.accept();
  });
  await panel.getByRole("button", { name: "Clear Map" }).click();
  await expect(panel.getByRole("status")).toContainText("Map cache cleared");

  const mobile = ((await page.viewportSize())?.width ?? 0) < 700;
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  if (mobile) {
    const sheet = page.locator("#phase2-mobile-panels");
    await sheet.getByRole("button", { name: "Close GMCP Debug", exact: true }).click();
    await page.getByRole("button", { name: "Panels", exact: true }).click();
    await sheet.getByRole("button", { name: "Open GMCP Debug", exact: true }).click();
  } else {
    await page.getByRole("checkbox", { name: "GMCP Debug", exact: true }).uncheck();
    await page.getByRole("checkbox", { name: "GMCP Debug", exact: true }).check();
  }
  await expect(panel).toContainText("Fixture.Secret");
  await page.waitForTimeout(100);
  await expect
    .poll(() => page.evaluate(() => JSON.stringify(localStorage)))
    .not.toContain("gmcp-debug");
  await page.goto("/phase2/");
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await debugTab.click();
  await expect(settings.getByLabel("Enable GMCP Debug", { exact: true })).toBeChecked();
  await settings.getByLabel("Enable GMCP Debug", { exact: true }).uncheck();
  await settings.getByRole("button", { name: "Save & Close", exact: true }).click();
  await settings
    .getByRole("dialog", { name: "Download changed settings?", exact: true })
    .getByRole("button", { name: "Skip", exact: true })
    .click();
  await expect(page.locator('.gmcp-debug-panel[data-panel-id="gmcp-debug"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Panels", exact: true }).click();
  await expect(page.getByText("GMCP Debug", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.gmcp-debug-panel[data-panel-id="gmcp-debug"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await debugTab.click();
  await expect(settings.getByLabel("Enable GMCP Debug", { exact: true })).not.toBeChecked();
});
