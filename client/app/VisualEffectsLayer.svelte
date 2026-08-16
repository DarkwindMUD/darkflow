<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { Session } from "../runtime/session.ts";

  let { session }: { session: Session } = $props();

  const flameSprites = Array.from({ length: 12 }, (_, index) => index);
  const lightningArcs = Array.from({ length: 6 }, (_, index) => index);
  let snapshot = $state(untrack(() => session.visualEffects.getSnapshot()));

  const incoming = $derived(snapshot.activeCues.find(({ slot }) => slot === "incoming"));
  const outgoing = $derived(snapshot.activeCues.find(({ slot }) => slot === "outgoing"));
  const spell = $derived(snapshot.activeCues.find(({ slot }) => slot === "spell"));
  const previewPlanet = $derived(snapshot.preview?.kind === "planet" ? snapshot.preview.value : "");
  const previewTerrain = $derived(
    snapshot.preview?.kind === "terrain" ? snapshot.preview.value : "",
  );
  const planet = $derived(
    snapshot.enabled && snapshot.preferences.planetAmbience
      ? previewPlanet || snapshot.world.planet
      : "",
  );
  const terrain = $derived(
    snapshot.enabled && snapshot.preferences.terrainAmbience
      ? previewTerrain || snapshot.world.terrains[0] || ""
      : "",
  );
  const lowHealth = $derived(
    snapshot.enabled &&
      snapshot.preferences.lowHealth &&
      snapshot.health.alive &&
      snapshot.health.lowHealth,
  );
  const rootClass = $derived(
    [
      planet && `is-planet-${planet}`,
      terrain && `is-terrain-${terrain}`,
      snapshot.enabled && snapshot.world.transitionActive && "is-world-transition",
      lowHealth && "is-low-health",
      incoming && snapshot.preferences.incomingDamage && "is-incoming-damage",
      incoming &&
        snapshot.preferences.incomingDamage &&
        `is-incoming-intensity-${incoming.intensity}`,
      outgoing && snapshot.preferences.outgoingDamage && "is-outgoing-damage",
      outgoing &&
        snapshot.preferences.outgoingDamage &&
        `is-outgoing-intensity-${outgoing.intensity}`,
      spell?.slot === "spell" && snapshot.preferences.spellCasts && "is-spell-cast",
      spell?.slot === "spell" && snapshot.preferences.spellCasts && `is-spell-${spell.palette}`,
      snapshot.preview?.kind === "planet" && "is-preview-planet",
      snapshot.preview?.kind === "terrain" && "is-preview-terrain",
      snapshot.preview?.kind === "low-health" && "is-preview-low-health",
      snapshot.preview?.kind === "transition" && "is-preview-transition",
      snapshot.reducedMotion && "is-reduced-motion",
    ]
      .filter(Boolean)
      .join(" "),
  );
  const spellIntensity = $derived(
    spell?.slot === "spell" ? String(0.72 + spell.intensity * 0.09) : undefined,
  );
  const presentationKey = $derived(
    `${snapshot.world.transitionActive ? snapshot.world.transitionGeneration : 0}:${snapshot.preview?.kind === "transition" ? snapshot.previewGeneration : 0}`,
  );

  onMount(() => {
    let active = true;
    const unsubscribe = session.visualEffects.subscribe((next) => {
      if (active) snapshot = next;
    });
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    const forcedColors = window.matchMedia?.("(forced-colors: active)") ?? null;
    const updateMotion = (): void => session.visualEffects.setReducedMotion(!!motion?.matches);
    const updateVisibility = (): void =>
      session.visualEffects.setPresentationVisible(!document.hidden && !forcedColors?.matches);

    updateMotion();
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    if (motion?.addEventListener) motion.addEventListener("change", updateMotion);
    else motion?.addListener(updateMotion);
    if (forcedColors?.addEventListener) forcedColors.addEventListener("change", updateVisibility);
    else forcedColors?.addListener(updateVisibility);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", updateVisibility);
      if (motion?.removeEventListener) motion.removeEventListener("change", updateMotion);
      else motion?.removeListener(updateMotion);
      if (forcedColors?.removeEventListener)
        forcedColors.removeEventListener("change", updateVisibility);
      else forcedColors?.removeListener(updateVisibility);
      unsubscribe();
      session.visualEffects.setPresentationVisible(false);
    };
  });
</script>

{#key presentationKey}
  <div
    id="visual-effects-root"
    class={rootClass}
    style:--visual-spell-intensity={spellIntensity}
    aria-hidden="true"
    hidden={!snapshot.enabled}
  >
    {#key snapshot.preview?.kind === "planet" ? snapshot.previewGeneration : 0}
      <div class="visual-effects-planet"></div>
    {/key}
    {#key snapshot.preview?.kind === "terrain" ? snapshot.previewGeneration : 0}
      <div class="visual-effects-terrain"></div>
    {/key}
    {#key snapshot.preview?.kind === "low-health" ? snapshot.previewGeneration : 0}
      <div class="visual-effects-low-health"></div>
    {/key}
    {#key spell?.generation ?? 0}
      <div class="visual-effects-spell-cast">
        <div class="visual-effects-fire">
          {#each flameSprites as sprite (sprite)}
            <span class="visual-fire-flame"></span>
          {/each}
        </div>
        <div class="visual-effects-frost"></div>
        <div class="visual-effects-lightning">
          {#each lightningArcs as arc (arc)}
            <span class="visual-lightning-arc"></span>
          {/each}
        </div>
      </div>
    {/key}
    {#key outgoing?.generation ?? 0}
      <div class="visual-effects-outgoing-damage"></div>
    {/key}
    {#key incoming?.generation ?? 0}
      <div class="visual-effects-incoming-damage"></div>
    {/key}
  </div>
{/key}
