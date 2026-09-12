import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import {
  localhostCertificatePath,
  TransportFixtureOwner,
  type TransportEndpoint,
  type TransportName,
} from "./fixtures/transport-fixtures";

interface WsEvent {
  detail: { transport?: string; url?: string };
  type: string;
}

interface WsDebugSnapshot {
  events: WsEvent[];
  lastHandlerErrorAt: number | null;
  lastInboundGmcpAt: number | null;
  readyStateName: string;
  url: string;
}

const appOrigin = "http://127.0.0.1:3124";
const transports: TransportName[] = ["ws", "wss", "telnet", "telnets"];
let fixtures: TransportFixtureOwner;

test.beforeAll(async () => {
  fixtures = await TransportFixtureOwner.start();
});

test.afterAll(async () => {
  await fixtures.close();
});

test("localhost fixture certificate remains valid for at least one year", () => {
  const certificate = new X509Certificate(readFileSync(localhostCertificatePath));
  expect(Date.parse(certificate.validTo)).toBeGreaterThan(Date.now() + 365 * 24 * 60 * 60 * 1000);
  expect(certificate.subjectAltName).toContain("DNS:localhost");
  expect(certificate.subjectAltName).toContain("IP Address:127.0.0.1");
});

for (const transport of transports) {
  test(`${transport} uses the default-root session transport without fallback`, async ({
    page,
  }) => {
    const endpoint = fixtures.endpoints[transport];
    const websocketUrls: string[] = [];
    const runtimeErrors: string[] = [];
    page.on("websocket", (socket) => websocketUrls.push(socket.url()));
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    await page.goto("/");
    await connectThroughPublicControls(page, endpoint);

    const expectedUrl = transportUrl(endpoint);
    await expect
      .poll(() => readHealthSnapshot(page))
      .toMatchObject({ readyStateName: "open", url: expectedUrl });
    await expect(page.getByTestId("connection-status")).toHaveText("Connected");
    await expect(page.getByLabel("Terminal output", { exact: true })).toContainText(
      endpoint.prompt,
    );
    expect(
      (await readHealthSnapshot(page)).events.filter((event) => event.type === "send-generic"),
    ).toHaveLength(8);
    await page.getByLabel("Command input", { exact: true }).fill("look");
    await page.getByLabel("Command input", { exact: true }).press("Enter");
    const expectedCommand = transport === "ws" || transport === "wss" ? "look" : "look\r\n";
    await expect.poll(() => endpoint.commands).toEqual([expectedCommand]);
    await expect(page.getByLabel("Terminal output", { exact: true })).toContainText(endpoint.reply);

    const snapshot = await readHealthSnapshot(page);
    const attempts = snapshot.events.filter((event) => event.type === "connect-attempt");
    const opens = snapshot.events.filter((event) => event.type === "open");
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      type: "connect-attempt",
      detail: { transport, url: expectedUrl },
    });
    expect(opens).toHaveLength(1);
    expect(opens[0]).toMatchObject({ type: "open", detail: { transport, url: expectedUrl } });
    expect(snapshot.events.filter((event) => event.type === "transport-fallback")).toEqual([]);
    expect(snapshot.lastInboundGmcpAt).not.toBeNull();
    expect(snapshot.lastHandlerErrorAt).toBeNull();
    expect(websocketUrls).toEqual([expectedUrl]);
    expect(websocketUrls.some((url) => url.includes("darkwind.ai"))).toBe(false);
    expect(runtimeErrors).toEqual([]);
    await page.close();
    await expect.poll(() => endpoint.activeSocketCount()).toBe(0);
  });
}

async function connectThroughPublicControls(
  page: Page,
  endpoint: TransportEndpoint,
): Promise<void> {
  await page.getByLabel("Host").fill("127.0.0.1");
  await page.getByLabel("Port", { exact: true }).fill(String(endpoint.port));
  await page.getByLabel("Connection protocol").selectOption(endpoint.protocol);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
}

function transportUrl(endpoint: TransportEndpoint): string {
  if (endpoint.protocol === "ws" || endpoint.protocol === "wss") {
    return `${endpoint.protocol}://127.0.0.1:${endpoint.port}/`;
  }
  return `${appOrigin.replace("http", "ws")}/proxy?host=127.0.0.1&port=${endpoint.port}&tls=${endpoint.protocol === "telnets" ? "1" : "0"}`;
}

async function readHealthSnapshot(page: Page): Promise<WsDebugSnapshot> {
  return page.evaluate(() =>
    (
      window as unknown as {
        __darkflowPhase1Runtime: { session: { getHealthSnapshot(): WsDebugSnapshot } };
      }
    ).__darkflowPhase1Runtime.session.getHealthSnapshot(),
  );
}
