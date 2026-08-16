<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import type { SessionTutorial, SessionTutorialSnapshot } from "../runtime/tutorial.ts";

  type TutorialAction = SessionTutorialSnapshot["state"]["actions"][number];
  type TutorialTarget = Exclude<SessionTutorialSnapshot["state"]["step"]["target"], "">;

  interface Props {
    tutorial: SessionTutorial;
    onExampleCommand?: (command: string) => void;
  }

  interface TargetRect {
    left: number;
    top: number;
    width: number;
    height: number;
  }

  const ACTION_LABELS: Readonly<Record<TutorialAction, string>> = {
    continue: "Continue",
    directions: "Show directions",
    hint: "Show hint",
    restart: "Restart tutorial",
    skip: "Skip tutorial",
  };
  const ACTION_ORDER: readonly TutorialAction[] = [
    "continue",
    "directions",
    "hint",
    "restart",
    "skip",
  ];

  const TARGET_SELECTORS: Readonly<Record<TutorialTarget, readonly string[]>> = {
    terminal: ['[data-tutorial-target="terminal"]'],
    "command-input": ['[data-tutorial-target="command-input"]'],
    "panels-menu": ['[data-tutorial-target="panels-menu"]'],
    "inventory-panel": [
      '[data-tutorial-target="inventory-panel"]',
      '[data-tutorial-target="panels-menu"]',
    ],
    "vitals-panel": [
      '[data-tutorial-target="vitals-panel"]',
      '[data-tutorial-target="panels-menu"]',
    ],
    "enemy-panel": ['[data-tutorial-target="enemy-panel"]', '[data-tutorial-target="panels-menu"]'],
  };

  const RENDER_RECOVERY_DELAYS_MS = [500, 1_500, 3_000] as const;

  let { tutorial, onExampleCommand }: Props = $props();
  let snapshot = $state(untrack(() => tutorial.getSnapshot()));
  let collapsed = $state(false);
  let hintVisible = $state(false);
  let routeVisible = $state(false);
  let skipConfirming = $state(false);
  let targetRect = $state<TargetRect | null>(null);
  let minimizedChip = $state<HTMLButtonElement>();
  let minimizeButton = $state<HTMLButtonElement>();
  let keepButton = $state<HTMLButtonElement>();
  let stepKey = "";
  let mounted = false;
  let renderFailed = false;
  let renderGeneration = 0;
  let recoveryAttempt = 0;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let recoveryReset: (() => void) | undefined;

  const cardVisible = $derived(
    snapshot.connected && snapshot.controlEnabled && snapshot.state.status === "active",
  );
  const progressTotal = $derived(Math.max(1, snapshot.state.step.total));
  const progressValue = $derived(Math.min(progressTotal, Math.max(0, snapshot.state.step.index)));
  const chapterLabel = $derived(
    snapshot.state.chapter.title
      ? `Chapter ${snapshot.state.chapter.index || 1} of ${snapshot.state.chapter.total || 1} · ${snapshot.state.chapter.title}`
      : "Getting started",
  );
  const orderedActions = $derived(
    ACTION_ORDER.filter((action) => snapshot.state.actions.includes(action)),
  );

  $effect(() => {
    let active = true;
    const unsubscribe = tutorial.subscribe((next) => {
      if (active) snapshot = next;
    });
    return () => {
      active = false;
      unsubscribe();
    };
  });

  $effect(() => {
    const nextKey = `${snapshot.state.epoch}\u0000${snapshot.state.step.id}`;
    if (nextKey !== stepKey) {
      stepKey = nextKey;
      hintVisible = false;
      routeVisible = false;
      skipConfirming = false;
    }
    if (snapshot.state.hintVisible || snapshot.state.reason === "hint") hintVisible = true;
    if (snapshot.state.reason === "directions") routeVisible = true;
    if (!cardVisible) skipConfirming = false;
  });

  $effect(() => {
    snapshot.presentationGeneration;
    snapshot.state.step.target;
    cardVisible;
    collapsed;
    queueMicrotask(updateTargetHalo);
  });

  onMount(() => {
    mounted = true;
    if (renderFailed && recoveryReset) scheduleRenderRecovery(recoveryReset);
    else tutorial.setPresentationReady(true);
    window.addEventListener("resize", updateTargetHalo);
    window.addEventListener("scroll", updateTargetHalo, true);
    window.addEventListener("darkflow:workspace-layout-changed", updateTargetHalo);
    return () => {
      mounted = false;
      renderGeneration += 1;
      if (recoveryTimer !== undefined) clearTimeout(recoveryTimer);
      recoveryReset = undefined;
      window.removeEventListener("resize", updateTargetHalo);
      window.removeEventListener("scroll", updateTargetHalo, true);
      window.removeEventListener("darkflow:workspace-layout-changed", updateTargetHalo);
      tutorial.setPresentationReady(false);
    };
  });

  function updateTargetHalo(): void {
    if (!mounted || !cardVisible || collapsed) {
      targetRect = null;
      return;
    }
    const token = snapshot.state.step.target;
    const selectors = token ? TARGET_SELECTORS[token] : [];
    const candidates = selectors.flatMap((selector) => [
      ...document.querySelectorAll<HTMLElement>(selector),
    ]);
    const target =
      candidates.find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }) ?? candidates[0];
    if (!target) {
      targetRect = null;
      return;
    }
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      targetRect = null;
      return;
    }
    const gutter = token === "command-input" ? 4 : 6;
    targetRect = {
      left: Math.round(rect.left - gutter),
      top: Math.round(rect.top - gutter),
      width: Math.round(rect.width + gutter * 2),
      height: Math.round(rect.height + gutter * 2),
    };
  }

  function handleRenderError(error: unknown, reset: () => void): void {
    renderFailed = true;
    recoveryReset = reset;
    tutorial.setPresentationReady(false);
    console.error("Tutorial overlay failed to render", error);
    scheduleRenderRecovery(reset);
  }

  function scheduleRenderRecovery(reset: () => void): void {
    if (
      !mounted ||
      recoveryTimer !== undefined ||
      recoveryAttempt >= RENDER_RECOVERY_DELAYS_MS.length
    )
      return;
    const generation = ++renderGeneration;
    const delay = RENDER_RECOVERY_DELAYS_MS[recoveryAttempt++];
    recoveryTimer = setTimeout(() => {
      recoveryTimer = undefined;
      if (!mounted || generation !== renderGeneration) return;
      reset();
      queueMicrotask(() => {
        if (!mounted || generation !== renderGeneration) return;
        renderFailed = false;
        recoveryAttempt = 0;
        recoveryReset = undefined;
        tutorial.setPresentationReady(true);
        updateTargetHalo();
      });
    }, delay);
  }

  function handleAction(action: TutorialAction): void {
    if (action === "skip") {
      skipConfirming = true;
      void tick().then(() => keepButton?.focus());
      return;
    }
    if (!tutorial.perform(action)) return;
    if (action === "hint") hintVisible = true;
    if (action === "directions") routeVisible = true;
  }

  function confirmSkip(): void {
    if (tutorial.perform("skip")) skipConfirming = false;
  }

  function useExampleCommand(): void {
    const command = snapshot.state.step.exampleCommand.trim();
    if (command) onExampleCommand?.(command);
  }

  async function setCollapsed(next: boolean): Promise<void> {
    collapsed = next;
    skipConfirming = false;
    await tick();
    (next ? minimizedChip : minimizeButton)?.focus();
  }
</script>

<svelte:boundary onerror={handleRenderError}>
  <div class="tutorial-live sr-only" aria-live="polite" aria-atomic="true">
    {snapshot.announcement}
  </div>

  {#if cardVisible}
    <div class="tutorial-hover-layer">
      {#if targetRect}
        <div
          class="tutorial-target-halo"
          aria-hidden="true"
          style:left={`${targetRect.left}px`}
          style:top={`${targetRect.top}px`}
          style:width={`${targetRect.width}px`}
          style:height={`${targetRect.height}px`}
        ></div>
      {/if}

      {#if collapsed}
        <button
          bind:this={minimizedChip}
          class="tutorial-minimized-chip"
          type="button"
          aria-label="Restore tutorial"
          onclick={() => setCollapsed(false)}
        >
          <span class="tutorial-chip-mark" aria-hidden="true">?</span>
          <span class="tutorial-chip-text">Tutorial · {progressValue}/{progressTotal}</span>
        </button>
      {:else}
        <aside
          class="tutorial-hover-card"
          aria-label="Darkwind basics"
          aria-busy={!!snapshot.pendingAction}
        >
          <header class="tutorial-hover-header">
            <div class="tutorial-heading-wrap">
              <span class="tutorial-eyebrow">NEW PLAYER GUIDE</span>
              <h2 class="tutorial-title">Darkwind basics</h2>
            </div>
            <button
              bind:this={minimizeButton}
              class="tutorial-icon-button"
              type="button"
              title="Minimize tutorial"
              aria-label="Minimize tutorial"
              onclick={() => setCollapsed(true)}>−</button
            >
          </header>

          <div class="tutorial-progress-region">
            <span class="tutorial-chapter">{chapterLabel}</span>
            <span class="tutorial-progress-text">Step {progressValue} of {progressTotal}</span>
            <progress
              class="tutorial-progress"
              value={progressValue}
              max={progressTotal}
              aria-label="Tutorial progress"
              aria-valuetext={`${Math.round((progressValue / progressTotal) * 100)}% complete`}
            ></progress>
          </div>

          <div class="tutorial-hover-body">
            <h3 class="tutorial-step-title">
              {snapshot.state.step.title || "Your next step"}
            </h3>
            <p class="tutorial-task">{snapshot.state.step.task}</p>

            {#if snapshot.state.step.exampleCommand}
              <div class="tutorial-example">
                <span class="tutorial-example-label">TRY THIS</span>
                <button
                  class="tutorial-command-button"
                  type="button"
                  title="Put this command in the command line"
                  aria-label={`Put ${snapshot.state.step.exampleCommand} in the command line`}
                  onclick={useExampleCommand}>{snapshot.state.step.exampleCommand}</button
                >
              </div>
            {/if}

            {#if hintVisible && snapshot.state.step.hint}
              <div class="tutorial-note tutorial-hint" role="note">
                Hint: {snapshot.state.step.hint}{snapshot.state.step.help
                  ? ` (${snapshot.state.step.help})`
                  : ""}
              </div>
            {/if}

            {#if routeVisible && snapshot.state.route}
              <div class="tutorial-note tutorial-route" role="note">
                <strong class="tutorial-route-title"
                  >{snapshot.state.route.place
                    ? `Route to ${snapshot.state.route.place}`
                    : "Directions"}</strong
                >
                {#if snapshot.state.route.text}
                  <p class="tutorial-route-copy">{snapshot.state.route.text}</p>
                {/if}
                {#if snapshot.state.route.directions.length}
                  <ol class="tutorial-route-steps">
                    {#each snapshot.state.route.directions as direction, index (`${index}:${direction}`)}
                      <li>{direction}</li>
                    {/each}
                  </ol>
                {/if}
              </div>
            {/if}

            {#if skipConfirming}
              <div class="tutorial-note tutorial-skip-confirm">
                <p class="tutorial-skip-copy">
                  Skip the guided tutorial? You can restart it later with tutorial restart.
                </p>
                <div class="tutorial-skip-actions">
                  <button
                    bind:this={keepButton}
                    class="tutorial-button tutorial-button-secondary"
                    type="button"
                    onclick={() => (skipConfirming = false)}>Keep tutorial</button
                  >
                  <button
                    class="tutorial-button tutorial-button-danger"
                    type="button"
                    onclick={confirmSkip}>Skip tutorial</button
                  >
                </div>
              </div>
            {/if}
          </div>

          {#if !skipConfirming}
            <footer class="tutorial-actions">
              {#each orderedActions as action (action)}
                {#if !(action === "continue" && snapshot.state.awaitingContinue && snapshot.pendingAction === "continue") && !(action === "hint" && hintVisible)}
                  <button
                    class={`tutorial-button tutorial-button-${action} ${action === "continue" ? "tutorial-button-primary" : action === "skip" ? "tutorial-button-quiet" : "tutorial-button-secondary"}`}
                    type="button"
                    disabled={snapshot.pendingAction !== null}
                    onclick={() => handleAction(action)}>{ACTION_LABELS[action]}</button
                  >
                {/if}
              {/each}
            </footer>
          {/if}
        </aside>
      {/if}
    </div>
  {/if}
</svelte:boundary>

<style>
  .tutorial-hover-card,
  .tutorial-minimized-chip {
    top: 14px;
    right: 14px;
  }

  .tutorial-hover-card {
    width: min(390px, calc(100vw - 28px));
    max-height: calc(100vh - 28px);
  }

  @media (max-width: 700px) {
    .tutorial-hover-card,
    .tutorial-minimized-chip {
      top: 8px;
      right: 8px;
    }

    .tutorial-hover-card {
      width: calc(100vw - 16px);
      max-height: min(calc(100vh - 16px), 45vh);
    }
  }
</style>
