<script lang="ts">
  import { untrack } from "svelte";
  import type {
    InteractionWindow,
    SessionInteractionSnapshot,
  } from "../gmcp/contracts/interactions.ts";
  import type { Session, SessionConnectionSnapshot } from "../runtime/session.ts";
  import ServerWindowPanel from "../workspace/ServerWindowPanel.svelte";

  const AUTH_WINDOW_IDS = new Set(["login", "newchar", "charselect"]);
  const AUTH_REVALIDATION_MS = 8_000;

  type AvatarZoom = { src: string; fallback?: string; alt: string; name: string };

  let { session }: { session: Session } = $props();
  const activeSession = untrack(() => session);
  let snapshot = $state<SessionInteractionSnapshot>(activeSession.interactions.getSnapshot());
  let connection = $state<SessionConnectionSnapshot>(activeSession.getConnectionSnapshot());
  let avatarZoom = $state<AvatarZoom | null>(null);
  let avatarCloseButton = $state<HTMLButtonElement>();
  let avatarPreviousFocus: HTMLElement | undefined;
  const retainedAuthWindows: Record<string, InteractionWindow> = {};
  const revalidationTimers: Record<string, number> = {};
  const hostedWindows = $derived(
    Object.values(snapshot.windows).filter((window) => window.type !== "panel"),
  );

  $effect(() => activeSession.interactions.subscribe((next) => (snapshot = next)));
  $effect(() => {
    const handleAvatarZoom = (event: Event): void => {
      if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== "object")
        return;
      const detail = event.detail as Record<string, unknown>;
      const src = typeof detail.src === "string" ? detail.src.trim() : "";
      if (!src) return;
      if (!avatarZoom && document.activeElement instanceof HTMLElement) {
        avatarPreviousFocus = document.activeElement;
      }
      avatarZoom = {
        src,
        ...(typeof detail.fallback === "string" && detail.fallback.trim()
          ? { fallback: detail.fallback.trim() }
          : {}),
        alt: typeof detail.alt === "string" ? detail.alt : "",
        name: typeof detail.name === "string" && detail.name.trim() ? detail.name.trim() : "Player",
      };
      queueMicrotask(() => avatarCloseButton?.focus());
    };
    document.addEventListener("dw:avatarZoom", handleAvatarZoom);
    return () => {
      document.removeEventListener("dw:avatarZoom", handleAvatarZoom);
      avatarZoom = null;
      restoreAvatarFocus();
    };
  });
  $effect(() => {
    let disposed = false;
    const unsubscribe = activeSession.subscribeConnection((next) => {
      connection = next;
      if (next.state !== "connected") {
        for (const timer of Object.values(revalidationTimers)) window.clearTimeout(timer);
        for (const id of Object.keys(revalidationTimers)) delete revalidationTimers[id];
        queueMicrotask(() => {
          if (disposed) return;
          for (const id of Object.keys(retainedAuthWindows)) delete retainedAuthWindows[id];
          for (const [id, window] of Object.entries(
            activeSession.interactions.getSnapshot().windows,
          )) {
            if (isAuthWindow(window)) retainedAuthWindows[id] = window;
          }
        });
        return;
      }

      for (const [id, retained] of Object.entries(retainedAuthWindows)) {
        if (revalidationTimers[id] !== undefined) continue;
        revalidationTimers[id] = window.setTimeout(() => {
          delete revalidationTimers[id];
          if (activeSession.interactions.getSnapshot().windows[id]?.layout === retained.layout) {
            activeSession.interactions.dismissWindow(id);
          }
          delete retainedAuthWindows[id];
        }, AUTH_REVALIDATION_MS);
      }
    });
    return () => {
      disposed = true;
      unsubscribe();
      for (const timer of Object.values(revalidationTimers)) window.clearTimeout(timer);
      for (const id of Object.keys(revalidationTimers)) delete revalidationTimers[id];
      for (const id of Object.keys(retainedAuthWindows)) delete retainedAuthWindows[id];
    };
  });
  function isAuthWindow(window: InteractionWindow): boolean {
    return AUTH_WINDOW_IDS.has(window.sourceId);
  }

  function reconnecting(): boolean {
    return (
      connection.state === "connecting" ||
      connection.reconnect?.status === "connecting" ||
      connection.reconnect?.status === "scheduled"
    );
  }

  function connectionLabel(): string {
    if (connection.state === "connected") return "Connected";
    return reconnecting() ? "Reconnecting..." : "Disconnected";
  }

  function closable(window: InteractionWindow): boolean {
    return window.closable !== false && window.closable !== 0;
  }

  function dimension(value: unknown): string | undefined {
    return typeof value === "number" ? `${value}px` : typeof value === "string" ? value : undefined;
  }

  function close(window: InteractionWindow): void {
    if (closable(window)) activeSession.interactions.closeWindow(window.id);
  }

  function restoreAvatarFocus(): void {
    const previousFocus = avatarPreviousFocus;
    avatarPreviousFocus = undefined;
    queueMicrotask(() => {
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    });
  }

  function closeAvatarZoom(): void {
    if (!avatarZoom) return;
    avatarZoom = null;
    restoreAvatarFocus();
  }

  function handleAvatarError(event: Event): void {
    const image = event.currentTarget;
    if (!(image instanceof HTMLImageElement) || !avatarZoom?.fallback) return;
    if (image.dataset.fallbackApplied === "true") return;
    image.dataset.fallbackApplied = "true";
    image.src = avatarZoom.fallback;
  }

  function manageDialogFocus(host: HTMLElement, serverWindow: InteractionWindow) {
    const previousFocus = document.activeElement;
    queueMicrotask(() => {
      const firstInput = isAuthWindow(serverWindow)
        ? host.querySelector<HTMLElement>(".dw-input:not(:disabled)")
        : null;
      const firstControl =
        firstInput ??
        host.querySelector<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        );
      (firstControl ?? host).focus({ preventScroll: true });
    });
    return {
      destroy() {
        queueMicrotask(() => {
          const active = document.activeElement;
          const closingDialogOwnedFocus =
            active === document.body || (active && host.contains(active));
          if (
            closingDialogOwnedFocus &&
            previousFocus instanceof HTMLElement &&
            previousFocus.isConnected
          ) {
            previousFocus.focus({ preventScroll: true });
          }
        });
      },
    };
  }

  function eventOverlay(event: Event): HTMLElement | undefined {
    const overlay =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-phase2-server-window]")
        : null;
    return overlay ?? undefined;
  }

  function overlayWindow(overlay: HTMLElement | undefined): InteractionWindow | undefined {
    const id = overlay?.dataset.phase2ServerWindow;
    return id ? snapshot.windows[id] : undefined;
  }

  function handleClick(event: MouseEvent): void {
    if (
      avatarZoom &&
      event.target instanceof HTMLElement &&
      event.target.classList.contains("dw-avatar-lightbox-overlay")
    ) {
      closeAvatarZoom();
      return;
    }
    const overlay = eventOverlay(event);
    if (overlay && event.target === overlay) {
      const window = overlayWindow(overlay);
      if (window) close(window);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (avatarZoom && event.key === "Escape") {
      event.preventDefault();
      closeAvatarZoom();
      return;
    }
    const overlay =
      eventOverlay(event) ??
      (document.activeElement instanceof Element
        ? (document.activeElement.closest<HTMLElement>("[data-phase2-server-window]") ?? undefined)
        : undefined);
    if (!overlay) return;
    const window = overlayWindow(overlay);
    if (!window) return;

    if (event.key === "Escape" && closable(window)) {
      event.preventDefault();
      activeSession.interactions.closeWindow(window.id);
      return;
    }
    if (event.key !== "Enter") return;
    const active = document.activeElement;
    if (active?.tagName === "TEXTAREA") return;
    if (active instanceof HTMLButtonElement && !active.classList.contains("dw-button-primary"))
      return;
    const submit = overlay.querySelector<HTMLButtonElement>(".dw-button-primary");
    if (submit) {
      event.preventDefault();
      submit.click();
    }
  }
</script>

<svelte:window onclick={handleClick} onkeydown={handleKeydown} />

{#if avatarZoom}
  <div class="dw-avatar-lightbox-overlay">
    <div
      class="dw-avatar-lightbox-frame"
      role="dialog"
      aria-modal="true"
      aria-label={`${avatarZoom.name} avatar`}
    >
      <button
        bind:this={avatarCloseButton}
        type="button"
        class="dw-avatar-lightbox-close"
        aria-label="Close avatar"
        onclick={closeAvatarZoom}>✕</button
      >
      {#key avatarZoom}
        <img
          class="dw-avatar-lightbox-image"
          src={avatarZoom.src}
          alt={avatarZoom.alt}
          draggable="false"
          onerror={handleAvatarError}
        />
      {/key}
    </div>
  </div>
{/if}

{#each hostedWindows as serverWindow (serverWindow.id)}
  {#if serverWindow.type === "npc_dialogue"}
    <div
      class="dw-npc-dialogue-overlay"
      data-dw-window={serverWindow.id}
      data-phase2-server-window={serverWindow.id}
    >
      <div
        class="dw-npc-dialogue-frame"
        role="dialog"
        aria-modal="true"
        aria-label={serverWindow.title || "Conversation"}
        tabindex="-1"
        use:manageDialogFocus={serverWindow}
      >
        {#if closable(serverWindow)}
          <button
            type="button"
            class="dw-npc-dialogue-close"
            aria-label="Close dialogue"
            onclick={() => close(serverWindow)}>✕</button
          >
        {/if}
        <div class="dw-npc-dialogue-body">
          <ServerWindowPanel
            panelId={`server-dialogue-${serverWindow.id}`}
            windowId={serverWindow.id}
            {session}
          />
        </div>
      </div>
    </div>
  {:else}
    <div
      class:dw-login-overlay={serverWindow.sourceId === "login"}
      class="dw-modal-overlay"
      data-dw-window={serverWindow.id}
      data-phase2-server-window={serverWindow.id}
    >
      <div
        class:dw-login-modal={serverWindow.sourceId === "login"}
        class="dw-modal"
        role="dialog"
        aria-modal="true"
        aria-label={serverWindow.title || "Server window"}
        tabindex="-1"
        use:manageDialogFocus={serverWindow}
        style:width={serverWindow.sourceId === "login" ? undefined : dimension(serverWindow.width)}
        style:height={serverWindow.sourceId === "login"
          ? undefined
          : dimension(serverWindow.height)}
      >
        {#if serverWindow.sourceId === "login"}
          <div class="dw-login-art">
            <img src="/assets/login-background.jpg" alt="" draggable="false" />
          </div>
          <div class="dw-login-form">
            <div class="dw-login-brand">Darkwind</div>
            <div class="dw-login-tagline">Enter the Realm</div>
            <div class="dw-modal-body dw-login-body">
              <div
                class:is-connected={connection.state === "connected"}
                class:is-reconnecting={connection.state !== "connected" && reconnecting()}
                class:is-disconnected={connection.state !== "connected" && !reconnecting()}
                class="dw-conn-strip"
              >
                <span class="dw-conn-strip-dot"></span>
                <span class="dw-spinner dw-spinner-small"></span>
                <span class="dw-conn-strip-label">{connectionLabel()}</span>
              </div>
              <ServerWindowPanel
                panelId={`server-modal-${serverWindow.id}`}
                windowId={serverWindow.id}
                {session}
              />
            </div>
          </div>
        {:else}
          <div class="dw-modal-header">
            <span class="dw-modal-title">{serverWindow.title || ""}</span>
            {#if closable(serverWindow)}
              <button
                type="button"
                class="dw-modal-close"
                aria-label={`Close ${serverWindow.title || "window"}`}
                onclick={() => close(serverWindow)}>✕</button
              >
            {/if}
          </div>
          <div class="dw-modal-body">
            {#if isAuthWindow(serverWindow)}
              <div
                class:is-connected={connection.state === "connected"}
                class:is-reconnecting={connection.state !== "connected" && reconnecting()}
                class:is-disconnected={connection.state !== "connected" && !reconnecting()}
                class="dw-conn-strip"
              >
                <span class="dw-conn-strip-dot"></span>
                <span class="dw-spinner dw-spinner-small"></span>
                <span class="dw-conn-strip-label">{connectionLabel()}</span>
              </div>
            {/if}
            <ServerWindowPanel
              panelId={`server-modal-${serverWindow.id}`}
              windowId={serverWindow.id}
              {session}
            />
          </div>
        {/if}
      </div>
    </div>
  {/if}
{/each}

<style>
  .dw-npc-dialogue-overlay {
    inset: 0;
  }
</style>
