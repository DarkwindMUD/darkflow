<script lang="ts">
  import Info from "@lucide/svelte/icons/info";
  import { onMount, tick } from "svelte";
  import {
    TERMINAL_FONT_SIZES,
    type PanelLayer,
    type PanelPreference,
  } from "../app/client-settings";
  import type { PanelSettingsTarget } from "./workspace";

  let {
    onClose,
    onLayer,
    onReset,
    onTextSize,
    preference,
    target,
  }: {
    onClose: () => void;
    onLayer: (layer: PanelLayer) => boolean;
    onReset: () => boolean;
    onTextSize: (fontSize: NonNullable<PanelPreference["fontSize"]> | undefined) => boolean;
    preference: PanelPreference | undefined;
    target: PanelSettingsTarget | undefined;
  } = $props();

  let popover = $state<HTMLDivElement>();

  function clamp(value: number, size: number, limit: number): number {
    return Math.max(8, Math.min(value, limit - size - 8));
  }

  function overlapArea(
    position: { left: number; top: number },
    size: DOMRect,
    target: DOMRect,
  ): number {
    return (
      Math.max(
        0,
        Math.min(position.left + size.width, target.right) - Math.max(position.left, target.left),
      ) *
      Math.max(
        0,
        Math.min(position.top + size.height, target.bottom) - Math.max(position.top, target.top),
      )
    );
  }

  function distanceFrom(
    position: { left: number; top: number },
    size: DOMRect,
    target: DOMRect,
  ): number {
    const x = Math.max(position.left - target.right, target.left - position.left - size.width, 0);
    const y = Math.max(position.top - target.bottom, target.top - position.top - size.height, 0);
    return Math.hypot(x, y);
  }

  function bestFloatingPosition(anchor: DOMRect, size: DOMRect, frame: DOMRect) {
    const centeredLeft = anchor.left + anchor.width / 2 - size.width / 2;
    const centeredTop = anchor.top + anchor.height / 2 - size.height / 2;
    const candidates = [
      { left: frame.right + 6, top: centeredTop },
      { left: frame.left - size.width - 6, top: centeredTop },
      { left: centeredLeft, top: frame.top - size.height - 6 },
      { left: centeredLeft, top: frame.bottom + 6 },
      { left: anchor.right + 6, top: centeredTop },
      { left: anchor.left - size.width - 6, top: centeredTop },
      { left: centeredLeft, top: anchor.top - size.height - 6 },
      { left: centeredLeft, top: anchor.bottom + 6 },
    ].map(({ left, top }) => ({
      left: clamp(left, size.width, innerWidth),
      top: clamp(top, size.height, innerHeight),
    }));
    const clearOfButton = candidates.filter(
      (position) => overlapArea(position, size, anchor) === 0,
    );
    return (clearOfButton.length ? clearOfButton : candidates).sort((a, b) => {
      const overlap = overlapArea(a, size, frame) - overlapArea(b, size, frame);
      const distance = distanceFrom(a, size, anchor) - distanceFrom(b, size, anchor);
      return frame.height > size.height * 2 ? distance || overlap : overlap || distance;
    })[0]!;
  }

  function floatingFrameAt(anchor: DOMRect): DOMRect | undefined {
    const x = anchor.left + anchor.width / 2;
    const y = anchor.top + anchor.height / 2;
    return [...document.querySelectorAll<HTMLElement>(".dv-resize-container")]
      .map((element) => ({ bounds: element.getBoundingClientRect(), element }))
      .filter(
        ({ bounds }) =>
          x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom,
      )
      .sort(
        (a, b) =>
          Number(getComputedStyle(b.element).zIndex) - Number(getComputedStyle(a.element).zIndex),
      )[0]?.bounds;
  }

  function defaultFontLabel(): string {
    if (!target || preference?.fontSize !== undefined) return "Default";
    const roots = document.querySelectorAll<HTMLElement>(
      `[data-workspace-root-id^="${CSS.escape(target.panelId)}-"]`,
    );
    const root = [...roots].find((element) => element.getClientRects().length > 0);
    const size = root ? Math.round(Number.parseFloat(getComputedStyle(root).fontSize)) : 0;
    return size > 0 ? `${size}px (Default)` : "Default";
  }

  $effect(() => {
    const current = target;
    const element = popover;
    if (!current || !element) return;
    void tick().then(() => {
      if (target !== current) return;
      const anchor = current.button.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      const frame = current.floating ? floatingFrameAt(anchor) : undefined;
      const position = frame
        ? bestFloatingPosition(anchor, bounds, frame)
        : {
            left: clamp(anchor.right - bounds.width, bounds.width, innerWidth),
            top: clamp(anchor.bottom + 6, bounds.height, innerHeight),
          };
      element.style.left = `${position.left}px`;
      element.style.top = `${position.top}px`;
    });
  });

  function close(): void {
    if (!target) return;
    const button = target.button;
    onClose();
    queueMicrotask(() => button.focus());
  }

  onMount(() => {
    const dismiss = (event: PointerEvent) => {
      if (!target || !popover || !(event.target instanceof Node)) return;
      if (popover.contains(event.target) || target.button.contains(event.target)) return;
      close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !target) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", escape, true);
    };
  });
</script>

<div
  bind:this={popover}
  class="panel-settings-popover"
  role="group"
  hidden={!target}
  aria-label={target ? `Settings for ${target.title}` : "Panel settings"}
>
  <label>
    Text size
    <select
      aria-label="Text size"
      value={preference?.fontSize ?? ""}
      onchange={(event) => {
        const select = event.currentTarget as HTMLSelectElement;
        const value = select.value;
        if (
          !onTextSize(
            value ? (Number(value) as NonNullable<PanelPreference["fontSize"]>) : undefined,
          )
        )
          select.value = String(preference?.fontSize ?? "");
      }}
    >
      <option value="">{defaultFontLabel()}</option>
      {#each TERMINAL_FONT_SIZES as size (size)}<option value={size}>{size}px</option>{/each}
    </select>
  </label>
  {#if target?.floating}
    <div class="layer-field">
      <span class="layer-label"
        ><label for="panel-layer-select">Layer</label>
        <button
          class="layer-info"
          type="button"
          aria-label="About panel layers"
          aria-describedby="panel-layer-help"
        >
          <Info size={14} />
          <span id="panel-layer-help" role="tooltip"
            >Normal panels come forward when selected. Above stays over Normal panels. Always on top
            stays over both.</span
          >
        </button></span
      >
      <select
        id="panel-layer-select"
        aria-label="Layer"
        value={preference?.layer ?? "normal"}
        onchange={(event) => {
          const select = event.currentTarget as HTMLSelectElement;
          if (!onLayer(select.value as PanelLayer)) select.value = preference?.layer ?? "normal";
        }}
      >
        <option value="normal">Normal</option>
        <option value="above">Above</option>
        <option value="always-on-top">Always on top</option>
      </select>
    </div>
  {/if}
  <button type="button" onclick={onReset}>Reset this panel</button>
</div>

<style>
  .panel-settings-popover {
    position: fixed;
    z-index: 2000;
    margin: 0;
    padding: 0.75rem;
    color: var(--df-text, #e6edf3);
    background: var(--df-elevated, #1c2333);
    border: 1px solid var(--df-border, #30363d);
    border-radius: 6px;
    box-shadow: 0 12px 30px rgb(0 0 0 / 45%);
  }

  .panel-settings-popover > label {
    display: grid;
    gap: 0.25rem;
    margin-bottom: 0.625rem;
    font-size: 0.875rem;
  }

  .panel-settings-popover select,
  .panel-settings-popover button {
    min-height: 2rem;
  }

  .layer-label {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .layer-field {
    display: grid;
    gap: 0.25rem;
    margin-bottom: 0.625rem;
    font-size: 0.875rem;
  }

  .panel-settings-popover .layer-info {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 1.5rem;
    width: 1.5rem;
    padding: 0;
    color: var(--df-muted, #8b949e);
    background: transparent;
    border: 0;
    border-radius: 50%;
  }

  [role="tooltip"] {
    position: absolute;
    z-index: 1;
    top: calc(100% + 0.25rem);
    left: 0;
    width: 15rem;
    padding: 0.5rem;
    color: var(--df-text, #e6edf3);
    background: var(--df-panel, #161b22);
    border: 1px solid var(--df-border, #30363d);
    border-radius: 4px;
    box-shadow: 0 6px 18px rgb(0 0 0 / 45%);
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1.35;
    opacity: 0;
    pointer-events: none;
  }

  .layer-info:is(:hover, :focus) [role="tooltip"] {
    opacity: 1;
  }
</style>
