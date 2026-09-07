import { expect, test } from "@playwright/test";

test("default root creates one Svelte session", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  await page.goto("/");

  await expect(page.getByTestId("phase2-shell")).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __darkflowPhase1Bootstrap?: { phase: string } })
            .__darkflowPhase1Bootstrap?.phase,
      ),
    )
    .toBe("client-loaded");

  const session = await page.evaluate(
    () =>
      (
        window as unknown as {
          __darkflowPhase1Session?: {
            characterProfileId: string;
            phase: string;
            serverProfileId: string;
            sessionId: string;
          };
        }
      ).__darkflowPhase1Session,
  );
  expect(session?.phase).toBe("session-ready");
  expect(typeof session?.sessionId).toBe("string");
  expect(typeof session?.characterProfileId).toBe("string");
  expect(typeof session?.serverProfileId).toBe("string");
  expect(requests).not.toContain("/js/app.js");
});

test("default root reloads without duplicate bootstrap", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("phase2-shell")).toBeVisible();
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __darkflowPhase1Bootstrap?: { phase: string } })
            .__darkflowPhase1Bootstrap?.phase,
      ),
    )
    .toBe("client-loaded");
});

test("session disposal removes the root shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("phase2-shell")).toBeVisible();
  const result = await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __darkflowPhase1Runtime?: { session: { dispose(): void; disposed: boolean } };
      }
    ).__darkflowPhase1Runtime;
    runtime?.session.dispose();
    return {
      disposed: runtime?.session.disposed,
      rootPresent: Boolean(document.querySelector('[data-testid="phase2-shell"]')),
    };
  });
  expect(result).toEqual({ disposed: true, rootPresent: false });
});
