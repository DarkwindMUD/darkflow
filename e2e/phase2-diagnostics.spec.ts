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
  await page.goto("/phase2/?rfc2549=1");
  await page.getByLabel("Host").fill("127.0.0.1");
  await page.getByLabel("Port").fill(String(fixtures.endpoints.ws.port));
  await page.getByLabel("Connection protocol").selectOption("ws");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByTestId("connection-status")).toHaveText("Connected via ws");
}

test("connection health and RFC 2549 use the public session snapshot", async ({ page }) => {
  await connect(page);
  const endpoint = fixtures.endpoints.ws;
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
  await page.getByRole("button", { name: "Open Connection health", exact: true }).click();

  const health = page.locator('.connection-health-panel[data-panel-id="connection-health"]');
  await expect(health).toContainText("Collecting samples");
  await expect(health).toContainText("drift 4ms avg, 35ms max");
  await expect.poll(() => endpoint.gmcpMessages, { timeout: 8_000 }).toContain("Core.Ping");

  await health.getByRole("button", { name: "Run full check" }).click();
  await expect(health.getByRole("button", { name: "Checking..." })).toBeDisabled();

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
});
