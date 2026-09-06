import { expect, test, type Page } from "@playwright/test";

interface FakeSocketSnapshot {
  readyStates: number[];
  sentCounts: number[];
  urls: string[];
}

test("Phase 2 uses one Svelte shell without loading the legacy client", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  await page.goto("/phase2/");

  const shell = page.getByTestId("phase2-shell");
  await expect(shell).toHaveCount(1);
  await expect(shell.getByRole("heading", { level: 1 })).toHaveText("Darkflow");
  await expect(page.getByTestId("phase2-workspace")).toHaveCount(1);
  expect(await shell.getAttribute("data-session-id")).toBeTruthy();
  expect(requests).not.toContain("/js/app.js");
  await expect.poll(() => requests.filter((path) => path === "/api/version").length).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(() => ({
        howl: typeof (window as unknown as { Howl?: unknown }).Howl,
        phase: (window as unknown as { __darkflowPhase1Bootstrap?: { phase: string } })
          .__darkflowPhase1Bootstrap?.phase,
      })),
    )
    .toEqual({ howl: "function", phase: "client-loaded" });

  await page.evaluate(() => {
    (
      window as unknown as { __darkflowPhase1Runtime: { session: { dispose(): void } } }
    ).__darkflowPhase1Runtime.session.dispose();
  });
  await expect(shell).toHaveCount(0);

  await page.goto("/");
  await expect(page.locator("#toolbar")).toBeVisible();
});

test("Phase 2 chrome applies the migrated theme and disposes desktop updates", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("darkwind-client-settings", JSON.stringify({ theme: "dracula" }));
    const listeners = new Set<(status: unknown) => void>();
    const diagnostics = { checks: 0, installs: 0 };
    const desktop = {
      checkForUpdates: () => {
        diagnostics.checks += 1;
      },
      getInfo: () => Promise.resolve({ updateStatus: { state: "checking" } }),
      installUpdate: () => {
        diagnostics.installs += 1;
      },
      onUpdateStatus: (listener: (status: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    Object.defineProperty(window, "darkflowDesktop", { configurable: true, value: desktop });
    (
      window as unknown as {
        __phase2DesktopControl: {
          diagnostics: typeof diagnostics;
          emit(status: unknown): void;
          listenerCount(): number;
        };
      }
    ).__phase2DesktopControl = {
      diagnostics,
      emit: (status) => listeners.forEach((listener) => listener(status)),
      listenerCount: () => listeners.size,
    };
  });

  await page.goto("/phase2/");

  await expect(page).toHaveTitle("Darkflow");
  await expect(page.getByRole("main")).toHaveCount(1);
  const connectionForm = page.getByRole("form", { name: "Connection" });
  await expect(connectionForm).toBeVisible();
  await expect(page.getByTestId("connection-status")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#282a36");
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "dark");
  await expect(page.getByTestId("update-banner")).toContainText("Checking for Darkwind updates...");
  expect((await connectionForm.boundingBox())?.width).toBeLessThanOrEqual(390);
  await page.evaluate(() =>
    (
      window as unknown as { __phase2DesktopControl: { emit(status: unknown): void } }
    ).__phase2DesktopControl.emit({ state: "available", version: "2.0.0" }),
  );
  await expect(page.getByTestId("update-banner")).toContainText("Darkwind 2.0.0 is downloading...");
  await page.evaluate(() =>
    (
      window as unknown as { __phase2DesktopControl: { emit(status: unknown): void } }
    ).__phase2DesktopControl.emit({ state: "downloading", percent: 42 }),
  );
  await expect(page.getByTestId("update-banner")).toContainText("Downloading Darkwind update: 42%");
  await page.evaluate(() =>
    (
      window as unknown as { __phase2DesktopControl: { emit(status: unknown): void } }
    ).__phase2DesktopControl.emit({ state: "downloaded", version: "2.0.0" }),
  );
  await page.getByRole("button", { name: "Restart and update" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __phase2DesktopControl: { diagnostics: { installs: number } } })
            .__phase2DesktopControl.diagnostics.installs,
      ),
    )
    .toBe(1);
  await page.evaluate(() =>
    (
      window as unknown as { __phase2DesktopControl: { emit(status: unknown): void } }
    ).__phase2DesktopControl.emit({ state: "manual", version: "2.0.0" }),
  );
  await page.getByRole("button", { name: "Download installer" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __phase2DesktopControl: { diagnostics: { installs: number } } })
            .__phase2DesktopControl.diagnostics.installs,
      ),
    )
    .toBe(2);
  await page.evaluate(() =>
    (
      window as unknown as { __phase2DesktopControl: { emit(status: unknown): void } }
    ).__phase2DesktopControl.emit({ state: "error" }),
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __phase2DesktopControl: { diagnostics: { checks: number } } })
            .__phase2DesktopControl.diagnostics.checks,
      ),
    )
    .toBe(1);

  await disposePhase2Session(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __phase2DesktopControl: { listenerCount(): number } }
        ).__phase2DesktopControl.listenerCount(),
      ),
    )
    .toBe(0);
});

test("Phase 2 header matches the legacy toolbar controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/phase2/");
  await expect(page.getByTestId("workspace-host")).toBeVisible();

  const header = page.locator(".app-chrome");
  const connection = page.getByRole("form", { name: "Connection" });
  const host = page.getByLabel("Host");
  const port = page.getByLabel("Port");
  const protocol = page.getByLabel("Connection protocol");
  await expect(header).toHaveCSS("height", "42px");
  expect(await header.boundingBox()).toMatchObject({ x: 0, y: 0, width: 1440, height: 42 });
  expect(await page.locator(".workspace-rails").boundingBox()).toMatchObject({ x: 0 });
  await expect(connection.locator("label")).toHaveCount(0);
  await expect(host).toHaveAttribute("placeholder", "Host");
  await expect(host).toHaveValue("");
  await expect(host).toHaveCSS("width", "130px");
  await expect(port).toHaveAttribute("type", "number");
  await expect(port).toHaveAttribute("inputmode", "numeric");
  await expect(port).toHaveCSS("appearance", "textfield");
  await expect(port).toHaveCSS("width", "64px");
  await expect(protocol.locator("option")).toHaveText(["wss", "ws", "telnets", "telnet"]);
  await expect(page.getByTestId("connection-status")).toHaveCSS("position", "absolute");
  const connectButton = page.locator("#connect-btn");
  await expect(connectButton).toHaveText("Connect");
  await expect(connectButton).toHaveClass(/disconnected/);
  await expect(connectButton).toBeDisabled();
  await host.fill("fixture.example");
  await expect(connectButton).toBeEnabled();
  await host.fill("");
  await expect(connectButton).toHaveCSS("width", "112px");
  await expect(connectButton).toHaveCSS("margin-left", "4px");
  const disconnectedColor = await connectButton.evaluate((button) =>
    getComputedStyle(button).backgroundColor.match(/\d+/g)?.map(Number),
  );
  expect(disconnectedColor?.[1]).toBeGreaterThan(disconnectedColor?.[0] ?? 0);
  expect(disconnectedColor?.[1]).toBeGreaterThan(disconnectedColor?.[2] ?? 0);

  const notifications = page.getByRole("button", { name: "Notifications" });
  const announcements = page.getByRole("button", { name: "Announcements" });
  const leftToggle = page.getByRole("button", { name: "Toggle left sidebar" });
  const rightToggle = page.getByRole("button", { name: "Toggle right sidebar" });
  const panels = page.getByRole("button", { name: "Panels", exact: true });
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  await expect(notifications.locator(".lucide-bell")).toBeVisible();
  await expect(announcements.locator(".lucide-newspaper")).toBeVisible();
  await expect(panels.locator(".lucide-layout-panel-left")).toBeVisible();
  await expect(settings.locator(".lucide-settings")).toBeVisible();
  await expect(announcements).toHaveCSS("width", "26px");
  await expect(announcements).toHaveCSS("height", "26px");
  await expect(header.locator(".toolbar-separator")).toHaveCount(2);
  await expect(header.locator(".toolbar-brand span")).toHaveCSS(
    "background-image",
    /linear-gradient/,
  );

  await expect(leftToggle).toHaveAttribute("aria-pressed", "true");
  await expect(leftToggle).toHaveClass(/active/);
  await expect(leftToggle.locator(".lucide-panel-left-close")).toBeVisible();
  await leftToggle.click();
  await expect(leftToggle).toHaveAttribute("aria-pressed", "false");
  await expect(leftToggle).not.toHaveClass(/active/);
  await expect(leftToggle.locator(".lucide-panel-left-open")).toBeVisible();
  await expect(page.locator("#phase2-left-rail")).toBeHidden();
  await leftToggle.click();
  await expect(page.locator("#phase2-left-rail")).toBeVisible();

  await expect(rightToggle).toHaveAttribute("aria-pressed", "true");
  await expect(rightToggle).toHaveClass(/active/);
  await expect(rightToggle.locator(".lucide-panel-right-close")).toBeVisible();
  await rightToggle.click();
  await expect(rightToggle).toHaveAttribute("aria-pressed", "false");
  await expect(rightToggle).not.toHaveClass(/active/);
  await expect(rightToggle.locator(".lucide-panel-right-open")).toBeVisible();
  await expect(page.locator("#phase2-right-rail")).toBeHidden();
  await rightToggle.click();
  await expect(page.locator("#phase2-right-rail")).toBeVisible();
});

test("Phase 2 controls drive connection, retry countdown, disconnect, and disposal", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("darkflow-protocol", "telnet"));
  await installFakeWebSocket(page);
  await page.goto("/phase2/");

  const shell = page.getByTestId("phase2-shell");
  const protocol = page.getByLabel("Connection protocol");
  await expect(protocol).toHaveValue("telnet");
  await expect(protocol.locator("option")).toHaveCount(4);
  await protocol.selectOption("ws");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("darkflow-protocol")))
    .toBe("ws");

  await page.getByLabel("Host").fill("fixture.example");
  await page.getByLabel("Port").fill("4321");
  const connectionButton = page.locator("#connect-btn");
  const connectionButtonWidth = await connectionButton.evaluate(
    (button) => button.getBoundingClientRect().width,
  );
  await connectionButton.click();
  await expect(page.getByTestId("connection-status")).toHaveText("Connecting");
  await expect(connectionButton).toHaveText("Connecting");
  await expect(connectionButton).toHaveClass(/connecting/);
  await expect(connectionButton).toHaveCSS("animation-name", /connection-sweep/);
  await expect(connectionButton).toHaveCSS("background-image", /linear-gradient/);
  expect(await connectionButton.evaluate((button) => button.getBoundingClientRect().width)).toBe(
    connectionButtonWidth,
  );
  expect(await readFakeSockets(page)).toMatchObject({ urls: ["ws://fixture.example:4321/"] });
  await expect(page.locator(".reconnect-overlay")).toHaveCount(0);

  await controlFakeSocket(page, "open");
  await expect(page.getByTestId("connection-status")).toHaveText("Connected");
  await expect(connectionButton).toHaveText("Disconnect");
  await expect(connectionButton).toHaveClass(/connected/);
  await expect(connectionButton).toHaveCSS("background-image", /linear-gradient/);
  expect(await connectionButton.evaluate((button) => button.getBoundingClientRect().width)).toBe(
    connectionButtonWidth,
  );
  await expect(page.locator(".app-workspace-slot > .workspace-controls")).toHaveCount(1);
  await expect(page.locator(".app-workspace-slot > .workspace-status")).toHaveCount(1);

  await shell.focus();
  await controlFakeSocket(page, "drop");
  await expect(page.locator(".reconnect-overlay")).toHaveCount(0);
  await expect(connectionButton).toHaveText(/Retrying in \d+s/);
  await expect(connectionButton).toHaveClass(/retrying/);
  await expect(connectionButton).toHaveCSS("animation-direction", "reverse");
  await expect(connectionButton).toHaveCSS("background-image", /linear-gradient/);
  expect(await connectionButton.evaluate((button) => button.getBoundingClientRect().width)).toBe(
    connectionButtonWidth,
  );

  await page.getByLabel("Host").fill("retry.example");
  await expect
    .poll(async () => (await readFakeSockets(page)).urls)
    .toEqual(["ws://fixture.example:4321/", "ws://retry.example:4321/"]);
  await expect(connectionButton).toHaveText("Connecting");
  await controlFakeSocket(page, "open");
  await expect(connectionButton).toHaveText("Disconnect");

  const socketsBeforeDisconnect = (await readFakeSockets(page)).urls.length;
  await connectionButton.click();
  await expect(connectionButton).toHaveText("Connect");
  await expect(page.locator(".reconnect-overlay")).toHaveCount(0);
  await page.waitForTimeout(1_100);
  expect((await readFakeSockets(page)).urls).toHaveLength(socketsBeforeDisconnect);
  await expect(page.getByTestId("connection-status")).toHaveText("Disconnected");
  await expect(page.getByLabel("Host")).toHaveValue("retry.example");

  await page.getByLabel("Host").fill("");
  await page.getByLabel("Port").fill("");
  await expect(connectionButton).toBeDisabled();
  await expect(page.getByLabel("Host")).toHaveValue("");
  await expect(page.getByLabel("Port")).toHaveValue("");
  expect((await readFakeSockets(page)).urls).toHaveLength(socketsBeforeDisconnect);

  await page.getByLabel("Host").fill("retry.example");
  await expect(connectionButton).toBeEnabled();
  await connectionButton.click();
  await expect
    .poll(async () => (await readFakeSockets(page)).urls.at(-1))
    .toBe("ws://retry.example:4242/");
  await controlFakeSocket(page, "open");
  await controlFakeSocket(page, "drop");
  await expect(connectionButton).toHaveText(/Retrying in \d+s/);
  const socketsBeforeDisposal = (await readFakeSockets(page)).urls.length;
  await disposePhase2Session(page);
  await expect(shell).toHaveCount(0);
  await page.waitForTimeout(1_100);
  expect((await readFakeSockets(page)).urls).toHaveLength(socketsBeforeDisposal);
});

test("connection button cancels connecting and scheduled retries", async ({ page }) => {
  await installFakeWebSocket(page);
  await page.goto("/phase2/");

  const connectionButton = page.locator("#connect-btn");
  await connectionButton.click();
  await expect(connectionButton).toHaveText("Connecting");
  await expect(connectionButton).toHaveAttribute("title", "Cancel connection attempt");
  await connectionButton.click();
  await expect(connectionButton).toHaveText("Connect");

  const socketsAfterConnectingCancel = (await readFakeSockets(page)).urls.length;
  await page.waitForTimeout(1_100);
  expect((await readFakeSockets(page)).urls).toHaveLength(socketsAfterConnectingCancel);

  await connectionButton.click();
  await controlFakeSocket(page, "open");
  await controlFakeSocket(page, "drop");
  await expect(connectionButton).toHaveText(/Retrying in \d+s/);
  await expect(connectionButton).toHaveAttribute("title", "Cancel automatic retry");
  await connectionButton.click();
  await expect(connectionButton).toHaveText("Connect");

  const socketsAfterRetryCancel = (await readFakeSockets(page)).urls.length;
  await page.waitForTimeout(1_100);
  expect((await readFakeSockets(page)).urls).toHaveLength(socketsAfterRetryCancel);
});

test("Phase 2 endpoint precedence auto-connects config, URL, and Zork targets", async ({
  page,
}) => {
  await installFakeWebSocket(page);
  await page.route("**/config.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        host: "config.example",
        port: 7777,
        wss: true,
        gameName: "Fixture",
        hiddenPanels: [],
      }),
    }),
  );

  await page.goto("/phase2/");
  await expect(page.getByLabel("Host")).toHaveValue("config.example");
  await expect(page.getByLabel("Port")).toHaveValue("7777");
  await expect
    .poll(async () => (await readFakeSockets(page)).urls)
    .toEqual(["wss://config.example:7777/"]);
  await controlFakeSocket(page, "open");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByLabel("Host")).toHaveValue("config.example");

  await page.goto("/phase2/?host=url.example&port=3131&type=ws");
  await expect(page.getByLabel("Host")).toHaveValue("url.example");
  await expect(page.getByLabel("Port")).toHaveValue("3131");
  await expect(page.getByLabel("Connection protocol")).toHaveValue("ws");
  await expect
    .poll(async () => (await readFakeSockets(page)).urls)
    .toEqual(["ws://url.example:3131/"]);

  await page.goto("/phase2/?zork=1&host=ignored.example&port=1&type=wss");
  await expect(page.getByLabel("Host")).toHaveCount(0);
  await expect(page.getByText("Darkwind connection")).toBeVisible();
  await expect
    .poll(async () => (await readFakeSockets(page)).urls)
    .toEqual([
      `${new URL(page.url()).origin.replace("http", "ws")}/proxy?host=darkwind.ai&port=4244&tls=0`,
    ]);
});

async function installFakeWebSocket(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class FakeWebSocket extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSING = 2;
      readonly CLOSED = 3;
      readonly extensions = "";
      readonly protocol = "";
      binaryType: BinaryType = "blob";
      bufferedAmount = 0;
      readyState = FakeWebSocket.CONNECTING;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onopen: ((event: Event) => void) | null = null;
      sent: unknown[] = [];
      url: string;

      constructor(url: string | URL) {
        super();
        this.url = String(url);
        sockets.push(this);
      }

      close(code = 1000, reason = ""): void {
        if (this.readyState === FakeWebSocket.CLOSED) return;
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.(new CloseEvent("close", { code, reason, wasClean: code === 1000 }));
      }

      send(data: unknown): void {
        this.sent.push(data);
      }

      open(): void {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.(new Event("open"));
      }

      drop(): void {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.(new CloseEvent("close", { code: 1006, reason: "fixture drop" }));
      }
    }

    const sockets: FakeWebSocket[] = [];
    const applicationSockets = () =>
      sockets.filter((socket) => !new URL(socket.url).searchParams.has("token"));
    const control = {
      drop: () => applicationSockets().at(-1)?.drop(),
      open: () => applicationSockets().at(-1)?.open(),
      snapshot: () => ({
        readyStates: applicationSockets().map((socket) => socket.readyState),
        sentCounts: applicationSockets().map((socket) => socket.sent.length),
        urls: applicationSockets().map((socket) => socket.url),
      }),
    };
    (window as unknown as { __phase2SocketControl: typeof control }).__phase2SocketControl =
      control;
    window.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });
}

function readFakeSockets(page: Page): Promise<FakeSocketSnapshot> {
  return page.evaluate(() =>
    (
      window as unknown as {
        __phase2SocketControl: { snapshot(): FakeSocketSnapshot };
      }
    ).__phase2SocketControl.snapshot(),
  );
}

function controlFakeSocket(page: Page, action: "drop" | "open"): Promise<void> {
  return page.evaluate((nextAction) => {
    const control = (
      window as unknown as {
        __phase2SocketControl: { drop(): void; open(): void };
      }
    ).__phase2SocketControl;
    control[nextAction]();
  }, action);
}

function disposePhase2Session(page: Page): Promise<void> {
  return page.evaluate(() => {
    (
      window as unknown as { __darkflowPhase1Runtime: { session: { dispose(): void } } }
    ).__darkflowPhase1Runtime.session.dispose();
  });
}
