<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { Readable } from "svelte/store";
  import type { Session } from "../runtime/session.ts";
  import type { SessionWorldSnapshot, WorldMapSource } from "../runtime/world.ts";
  import type { PanelState } from "./workspace.ts";
  // @ts-expect-error Retained renderer factory is JavaScript without declarations.
  import { createMapRenderer } from "../../public/js/map-renderer-core.js";
  // @ts-expect-error Retained pan controller is JavaScript without declarations.
  import { wireMapPan } from "../../public/js/map-pan.js";
  // @ts-expect-error Retained zoom helpers are JavaScript without declarations.
  import * as zoomHelpers from "../../public/js/map-zoom.js";

  const { MAP_ZOOM_LEVELS, formatMapZoom, normalizeMapZoom, stepMapZoom } = zoomHelpers;

  let {
    panelId,
    state: panelState,
    session,
  }: { panelId: string; state: Readable<PanelState>; session?: Session } = $props();

  const resolvedSession = untrack(() => session);
  if (!resolvedSession) throw new Error("Map panels require a session");
  const activeSession: Session = resolvedSession;
  const resolvedPanelId = untrack(() => panelId);
  if (resolvedPanelId !== "map" && resolvedPanelId !== "areaMap") {
    throw new Error(`Unsupported map panel '${resolvedPanelId}'`);
  }

  const live = resolvedPanelId === "map";
  const renderer = createMapRenderer();
  let panel: HTMLElement;
  let body: HTMLElement;
  let mapZoom = $state(1);
  let mapStatus = $state("");
  let snapshot: SessionWorldSnapshot = activeSession.world.getSnapshot();

  const source = (): WorldMapSource => (live ? snapshot.source : snapshot.browseSource);

  function enhanceRoomTiles(): void {
    for (const tile of body.querySelectorAll<HTMLElement>(".map-tile-room[data-room-id]")) {
      const name = tile.title.split("\n", 1)[0] || "Mapped room";
      tile.tabIndex = 0;
      tile.setAttribute("role", "button");
      tile.setAttribute("aria-label", live ? `Speedwalk to ${name}` : name);
      if (!live) tile.setAttribute("aria-disabled", "true");
    }
  }

  function render(): void {
    body.dataset.mapZoom = String(mapZoom);
    renderer.render(body, source());
    enhanceRoomTiles();
    mapStatus = snapshot.speedwalking
      ? "Speedwalking"
      : source().getMapStatus() || (live ? "Live map" : "Area map");
  }

  function activateTile(target: EventTarget | null): void {
    if (!live || !(target instanceof Element)) return;
    const tile = target.closest<HTMLElement>(".map-tile-room[data-room-id]");
    const roomId = tile?.dataset.roomId;
    if (roomId) activeSession.world.speedwalkTo(roomId);
  }

  function handleClick(event: MouseEvent): void {
    activateTile(event.target);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
    if (!(event.target instanceof Element)) return;
    const tile = event.target.closest<HTMLElement>(".map-tile-room[data-room-id]");
    if (!tile || !live) return;
    event.preventDefault();
    activateTile(tile);
  }

  function setZoom(value: unknown): void {
    const next = normalizeMapZoom(value);
    if (next === mapZoom) return;
    mapZoom = next;
    render();
    panel.dispatchEvent(
      new CustomEvent("darkflow:map-panel-state", {
        bubbles: true,
        detail: { panelId: resolvedPanelId, mapZoom },
      }),
    );
  }

  function recenter(): void {
    delete body.dataset.mapPanX;
    delete body.dataset.mapPanY;
    render();
  }

  onMount(() => {
    const unsubscribeState = panelState.subscribe((next) => {
      const nextZoom = normalizeMapZoom(next.mapZoom);
      if (nextZoom !== mapZoom) {
        mapZoom = nextZoom;
        render();
      }
    });
    const unsubscribeWorld = activeSession.world.subscribe((next) => {
      snapshot = next;
      render();
    });
    const disposePan = wireMapPan(body, { rerender: render }) as (() => void) | undefined;
    const resizeObserver = new ResizeObserver(render);
    resizeObserver.observe(body);
    body.addEventListener("click", handleClick);
    body.addEventListener("keydown", handleKeydown);

    return () => {
      unsubscribeWorld();
      unsubscribeState();
      disposePan?.();
      resizeObserver.disconnect();
      body.removeEventListener("click", handleClick);
      body.removeEventListener("keydown", handleKeydown);
      renderer.dispose();
      if (!live) activeSession.world.closeBrowse();
    };
  });
</script>

<section bind:this={panel} class="map-panel" data-panel-id={panelId} data-workspace-owned="true">
  <div class="map-toolbar" role="toolbar" aria-label="Map controls">
    <button
      class="panel-btn map-zoom-btn map-zoom-out"
      type="button"
      aria-label="Zoom map out"
      title="Zoom map out"
      disabled={mapZoom === MAP_ZOOM_LEVELS[0]}
      onclick={() => setZoom(stepMapZoom(mapZoom, -1))}>−</button
    >
    <span class="map-zoom-level" aria-live="polite">{formatMapZoom(mapZoom)}</span>
    <button
      class="panel-btn map-zoom-btn map-zoom-in"
      type="button"
      aria-label="Zoom map in"
      title="Zoom map in"
      disabled={mapZoom === MAP_ZOOM_LEVELS[MAP_ZOOM_LEVELS.length - 1]}
      onclick={() => setZoom(stepMapZoom(mapZoom, 1))}>+</button
    >
    <button
      class="panel-btn map-recenter-btn"
      type="button"
      aria-label="Re-center map"
      title="Re-center map"
      onclick={recenter}>◎</button
    >
    <span class="map-panel-status" role="status" aria-live="polite">{mapStatus}</span>
  </div>
  <div bind:this={body} class="map-body" id={`panel-body-${panelId}`}></div>
</section>

<style>
  .map-panel {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: #000;
  }

  .map-toolbar {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.125rem;
    min-height: 1.75rem;
    padding: 0.125rem 0.375rem;
    border-bottom: 1px solid var(--df-border);
    background: var(--df-panel);
  }

  .map-panel-status {
    min-width: 0;
    margin-left: auto;
    overflow: hidden;
    color: var(--df-muted);
    font-size: calc(0.625rem * var(--pane-font-scale, 1));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .map-body {
    position: relative;
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 0;
    overflow: hidden;
    touch-action: none;
    user-select: none;
  }

  .map-body :global(.map-grid-frame) {
    cursor: grab;
  }

  .map-body:global(.map-panning) :global(.map-grid-frame),
  .map-body:global(.map-panning) :global(.map-tile) {
    cursor: grabbing;
  }

  .map-body :global(.map-tile-room:focus-visible) {
    z-index: 3;
    outline: 2px solid var(--df-accent-blue);
    outline-offset: 1px;
  }
</style>
