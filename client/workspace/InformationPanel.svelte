<script lang="ts">
  import { onMount } from "svelte";
  import type { Readable } from "svelte/store";
  import type { SessionInformationSnapshot } from "../gmcp/contracts/information.ts";
  import type { Session } from "../runtime/session.ts";
  import type { PanelState } from "./workspace";
  // @ts-expect-error Shared DOM renderer is legacy-compatible JavaScript.
  import { createInformationPanelRenderers } from "../../public/js/core-information-panel-renderers.mjs";

  let {
    panelId,
    state: _state,
    session,
  }: { panelId: string; state: Readable<PanelState>; session?: Session } = $props();

  let body: HTMLElement;
  let imageDialog: HTMLDialogElement;
  let imageUrl = $state("");
  let imageAlt = $state("");

  function panelData(snapshot: SessionInformationSnapshot): unknown {
    switch (panelId) {
      case "avatar":
        // The shared renderer reads the avatar frame directly; vitals ride
        // alongside so it can draw the charge/active meter.
        return { ...snapshot.avatar, vitals: snapshot.vitals };
      case "status":
        return snapshot.status;
      case "vitals":
        return snapshot.vitals;
      case "guildVitals":
        return snapshot.guildVitals;
      case "xpmon":
        return snapshot.xpmon;
      case "omens":
        return snapshot.omens;
      case "sky":
        return snapshot.sky;
      case "stats":
        return snapshot.stats;
      case "buffs":
        return snapshot.defences;
      case "worth":
        return (
          snapshot.worth ??
          (snapshot.status ? { gold: snapshot.status.gold, bank: snapshot.status.bank } : null)
        );
      case "group":
        return snapshot.group;
      default:
        return null;
    }
  }

  onMount(() => {
    if (!session || !body) return;
    const renderers = createInformationPanelRenderers({
      sendCommand: (command: string) => session.terminal.sendCommand(command),
      openImageDialog: (url: string, alt: string) => {
        imageUrl = url;
        imageAlt = alt;
        imageDialog?.showModal();
      },
    });
    const render = (snapshot: SessionInformationSnapshot) => {
      const renderer = renderers[panelId];
      if (renderer) renderer(body, panelData(snapshot));
    };
    const unsubscribe = session.information.subscribe(render);
    // Only the sky clock advances between frames; re-render it on a timer.
    const timer =
      panelId === "sky"
        ? window.setInterval(() => render(session.information.getSnapshot()), 1000)
        : undefined;
    return () => {
      unsubscribe();
      if (timer !== undefined) window.clearInterval(timer);
    };
  });
</script>

<section class="information-panel" data-panel-id={panelId} data-workspace-owned="true">
  <div bind:this={body}></div>
</section>

<dialog bind:this={imageDialog} aria-label={imageAlt || "Avatar image"}>
  {#if imageUrl}
    <img src={imageUrl} alt={imageAlt} />
  {/if}
  <button type="button" onclick={() => imageDialog.close()}>Close image</button>
</dialog>

<style>
  .information-panel {
    box-sizing: border-box;
    height: 100%;
    overflow: auto;
    padding: 0.75rem;
  }
  dialog img {
    display: block;
    max-height: min(75vh, 50rem);
    max-width: min(90vw, 50rem);
  }
</style>
