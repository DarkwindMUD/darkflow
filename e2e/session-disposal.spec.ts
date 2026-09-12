import { expect, test } from "@playwright/test";
import { TransportFixtureOwner } from "./fixtures/transport-fixtures";

const cycleCount = 25;
let fixtures: TransportFixtureOwner;

test.beforeAll(async () => {
  fixtures = await TransportFixtureOwner.start();
});

test.afterAll(async () => {
  await fixtures.close();
});

test("25 root session cycles release their socket and Svelte shell", async ({ page }) => {
  test.setTimeout(180_000);
  const endpoint = fixtures.endpoints.ws;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("darkwind-client-settings", JSON.stringify({ autoReconnect: false }));
  });

  for (let cycle = 1; cycle <= cycleCount; cycle++) {
    await page.goto("/");
    await expect(page.getByTestId("phase2-shell"), `cycle ${cycle} shell`).toBeVisible();
    await page.getByLabel("Host").fill("127.0.0.1");
    await page.getByLabel("Port", { exact: true }).fill(String(endpoint.port));
    await page.getByLabel("Connection protocol").selectOption("ws");
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect
      .poll(() => endpoint.activeSocketCount(), { message: `cycle ${cycle} socket` })
      .toBe(1);
    endpoint.sendText(`cycle ${cycle} output`);
    await expect(page.getByLabel("Terminal output", { exact: true })).toContainText(
      `cycle ${cycle} output`,
    );

    const result = await page.evaluate(() => {
      const runtime = (
        window as unknown as {
          __darkflowPhase1Runtime?: { session: { dispose(): void; disposed: boolean } };
          __darkflowPhase1ControllerBridge?: {
            getControllerDiagnostics(): { session: Record<string, number> };
          };
          __darkflowPhase1RuntimeBridge?: {
            gmcpDispatch(packageName: string, data: unknown): void;
          };
        }
      ).__darkflowPhase1Runtime;
      runtime?.session.dispose();
      runtime?.session.dispose();
      const target = window as unknown as {
        __darkflowPhase1ControllerBridge?: {
          getControllerDiagnostics(): { session: Record<string, number> };
        };
        __darkflowPhase1RuntimeBridge?: { gmcpDispatch(packageName: string, data: unknown): void };
      };
      const beforeLateDispatch = document.body.innerHTML;
      target.__darkflowPhase1RuntimeBridge?.gmcpDispatch("Darkwind.Broadcast.Show", {
        title: "late",
        message: "must not render",
        durationMs: 60_000,
      });
      return {
        disposed: runtime?.session.disposed,
        shellPresent: Boolean(document.querySelector('[data-testid="phase2-shell"]')),
        diagnostics: target.__darkflowPhase1ControllerBridge?.getControllerDiagnostics().session,
        unchangedAfterLateDispatch: document.body.innerHTML === beforeLateDispatch,
      };
    });
    expect(result.disposed, `cycle ${cycle} disposal`).toBe(true);
    expect(result.shellPresent, `cycle ${cycle} shell`).toBe(false);
    expect(result.unchangedAfterLateDispatch, `cycle ${cycle} late dispatch`).toBe(true);
    expect(result.diagnostics, `cycle ${cycle} resources`).toMatchObject({
      liveTimers: 0,
      liveAnimationFrames: 0,
      liveSubscriptions: 0,
      liveObservers: 0,
      liveListeners: 0,
      liveChildScopes: 0,
      liveSockets: 0,
      liveTeardowns: 0,
      rejectedResources: 0,
      handlerFailures: 0,
    });
    await expect.poll(() => endpoint.activeSocketCount()).toBe(0);
  }
  expect(pageErrors).toEqual([]);
});
