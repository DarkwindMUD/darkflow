<script lang="ts">
  import { untrack } from "svelte";
  import type { Readable } from "svelte/store";
  import type { CharVitals } from "../gmcp/contracts/char.ts";
  import type { Session } from "../runtime/session.ts";
  import { avatarBarReading } from "./avatar-bar.ts";
  import type { PanelState } from "./workspace.ts";

  let { panelId, session }: { panelId: string; state: Readable<PanelState>; session?: Session } =
    $props();

  const resolvedSession = untrack(() => session);
  if (!resolvedSession) throw new Error("The Wrathful Avatar bar requires a session");
  const activeSession: Session = resolvedSession;

  let vitals = $state<CharVitals | null>(activeSession.information.getSnapshot().vitals);
  let now = $state(Date.now());
  const reading = $derived(avatarBarReading(vitals, now));

  $effect(() =>
    activeSession.information.subscribe((snapshot) => {
      untrack(() => {
        vitals = snapshot.vitals;
        now = Date.now();
      });
    }),
  );

  // The charge prediction and the active countdown move between server
  // updates; refresh once a second only while they do.
  $effect(() => {
    if (!reading.ticking) return;
    const timer = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(timer);
  });
</script>

<section
  class="vital-bar-panel vital-bar-avatar vital-bar-avatar-{reading.mode}"
  class:is-unknown={!reading.known}
  class:is-critical={reading.mode === "active"}
  class:is-full={reading.full}
  class:patron-mitra={reading.patron === "mitra"}
  class:patron-gaea={reading.patron === "gaea"}
  class:patron-set={reading.patron === "set"}
  data-panel-id={panelId}
  data-workspace-owned="true"
  aria-label="Wrathful Avatar bar"
>
  <div
    class="vital-bar-track"
    role="progressbar"
    aria-label={reading.label}
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={reading.known ? Math.round(reading.percent) : undefined}
    aria-valuetext={reading.text}
    title={reading.mode === "active"
      ? "Wrathful Avatar is active."
      : reading.full
        ? "Wrathful Avatar is charged and ready."
        : reading.known
          ? "Wrathful Avatar charge."
          : "No Wrathful Avatar data yet."}
  >
    <div
      class="vital-bar-fill"
      style:transform={`scaleX(${reading.percent / 100})`}
      style:background={reading.background}
    ></div>
    <div class="vital-bar-text">
      <span class="vital-bar-name">Avatar</span>
      <span class="vital-bar-value">{reading.text}</span>
      <span class="vital-bar-percent">{reading.known ? `${Math.floor(reading.percent)}%` : ""}</span
      >
    </div>
  </div>
</section>
