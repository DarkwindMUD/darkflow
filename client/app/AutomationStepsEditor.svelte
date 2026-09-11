<script lang="ts">
  import type { AutomationStep } from "../model/configuration.ts";

  type Target = { id: string; label: string };
  let {
    steps = $bindable(),
    aliases = [],
    triggers = [],
    timers = [],
    functions = [],
  }: {
    steps: AutomationStep[];
    aliases?: Target[];
    triggers?: Target[];
    timers?: Target[];
    functions?: Target[];
  } = $props();
  let addType = $state<AutomationStep["type"]>("send_command");

  const stepTypes: Array<{ value: AutomationStep["type"]; label: string }> = [
    { value: "send_command", label: "Send command" },
    { value: "set_variable", label: "Set variable" },
    { value: "show_message", label: "Show message" },
    { value: "script", label: "Script" },
    { value: "wait", label: "Wait" },
    { value: "set_alias_enabled", label: "Set alias enabled" },
    { value: "set_trigger_enabled", label: "Set trigger enabled" },
    { value: "set_timer_enabled", label: "Set timer enabled" },
    { value: "control_timer", label: "Control timer" },
    { value: "play_sound", label: "Play sound" },
    { value: "run_alias", label: "Run alias" },
    { value: "call_function", label: "Call function" },
  ];

  function blankStep(type: AutomationStep["type"]): AutomationStep {
    switch (type) {
      case "set_variable":
        return { type, name: "", template: "" };
      case "script":
        return { type, script: "" };
      case "wait":
        return { type, seconds: 1 };
      case "set_alias_enabled":
      case "set_trigger_enabled":
      case "set_timer_enabled":
        return { type, mode: "toggle", target: "", targetId: "" };
      case "control_timer":
        return { type, mode: "start", target: "", targetId: "" };
      case "play_sound":
        return { type, category: "", sound: "", volume: 1 };
      case "call_function":
        return { type, target: "", targetId: "", template: "" };
      default:
        return { type, template: "" };
    }
  }

  function replace(index: number, step: AutomationStep): void {
    steps = steps.map((current, currentIndex) => (currentIndex === index ? step : current));
  }

  function move(index: number, offset: number): void {
    const target = index + offset;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target]!, next[index]!];
    steps = next;
  }

  function remove(index: number): void {
    const next = steps.filter((_, item) => item !== index);
    steps = next.length ? next : [blankStep("send_command")];
  }

  function targetOptions(step: AutomationStep): Target[] {
    if (step.type === "set_alias_enabled" || step.type === "run_alias") return aliases;
    if (step.type === "set_trigger_enabled") return triggers;
    if (step.type === "set_timer_enabled" || step.type === "control_timer") return timers;
    return functions;
  }

  function updateTarget(
    step: Extract<AutomationStep, { target: string; targetId: string }>,
    id: string,
  ): void {
    const target = targetOptions(step).find((item) => item.id === id);
    step.targetId = id;
    step.target = target?.label ?? "";
  }
</script>

<fieldset>
  <legend>Automation steps</legend>
  {#each steps as step, index (index)}
    <section aria-label={`Automation step ${index + 1}`}>
      <label>
        Step type
        <select
          value={step.type}
          onchange={(event) =>
            replace(index, blankStep(event.currentTarget.value as AutomationStep["type"]))}
        >
          {#each stepTypes as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>

      {#if step.type === "send_command" || step.type === "show_message" || step.type === "run_alias"}
        <label>Template <textarea bind:value={step.template} required></textarea></label>
      {:else if step.type === "set_variable"}
        <label>Variable name <input bind:value={step.name} required /></label>
        <label>Template <textarea bind:value={step.template}></textarea></label>
      {:else if step.type === "script"}
        <label>Script <textarea bind:value={step.script} required></textarea></label>
      {:else if step.type === "wait"}
        <label
          >Seconds <input
            type="number"
            min="0"
            max="86400"
            step="0.1"
            bind:value={step.seconds}
            required
          /></label
        >
      {:else if step.type === "set_alias_enabled" || step.type === "set_trigger_enabled" || step.type === "set_timer_enabled"}
        <label>
          Mode
          <select bind:value={step.mode}>
            <option value="enable">Enable</option>
            <option value="disable">Disable</option>
            <option value="toggle">Toggle</option>
          </select>
        </label>
        <label
          >Target <select
            value={step.targetId}
            onchange={(event) => updateTarget(step, event.currentTarget.value)}
          >
            {#if step.target && (!step.targetId || !targetOptions(step).some((item) => item.id === step.targetId))}
              <option value="">Unresolved: {step.target || step.targetId}</option>
            {:else}<option value="">Select target</option>{/if}
            {#each targetOptions(step) as target (target.id)}<option value={target.id}
                >{target.label}</option
              >{/each}
          </select></label
        >
      {:else if step.type === "control_timer"}
        <label>
          Mode
          <select bind:value={step.mode}>
            <option value="start">Start</option>
            <option value="stop">Stop</option>
            <option value="reset">Reset</option>
            <option value="run">Run now</option>
          </select>
        </label>
        <label
          >Target <select
            value={step.targetId}
            onchange={(event) => updateTarget(step, event.currentTarget.value)}
          >
            {#if step.target && (!step.targetId || !targetOptions(step).some((item) => item.id === step.targetId))}
              <option value="">Unresolved: {step.target || step.targetId}</option>
            {:else}<option value="">Select target</option>{/if}
            {#each targetOptions(step) as target (target.id)}<option value={target.id}
                >{target.label}</option
              >{/each}
          </select></label
        >
      {:else if step.type === "play_sound"}
        <label>Category <input bind:value={step.category} required /></label>
        <label>Sound <input bind:value={step.sound} required /></label>
        <label
          >Volume <input
            type="number"
            min="0"
            max="1"
            step="any"
            bind:value={step.volume}
            required
          /></label
        >
      {:else if step.type === "call_function"}
        <label
          >Target <select
            value={step.targetId}
            onchange={(event) => updateTarget(step, event.currentTarget.value)}
          >
            {#if step.target && (!step.targetId || !targetOptions(step).some((item) => item.id === step.targetId))}
              <option value="">Unresolved: {step.target || step.targetId}</option>
            {:else}<option value="">Select target</option>{/if}
            {#each targetOptions(step) as target (target.id)}<option value={target.id}
                >{target.label}</option
              >{/each}
          </select></label
        >
        <label>Template <textarea bind:value={step.template}></textarea></label>
      {/if}

      <div class="step-actions">
        <button type="button" disabled={index === 0} onclick={() => move(index, -1)}
          >Move step up</button
        >
        <button type="button" disabled={index === steps.length - 1} onclick={() => move(index, 1)}
          >Move step down</button
        >
        <button type="button" onclick={() => remove(index)}>Remove step</button>
      </div>
    </section>
  {/each}
  <label
    >Add step type <select bind:value={addType}
      >{#each stepTypes as option (option.value)}<option value={option.value}>{option.label}</option
        >{/each}</select
    ></label
  >
  <button type="button" onclick={() => (steps = [...steps, blankStep(addType)])}
    >Add automation step</button
  >
  <details>
    <summary>Template syntax</summary>
    <p>
      Use %0 for the remaining input, %1-%9 for captures, $name for variables, and
      &#36;&#123;lower:%1&#125; or &#36;&#123;lower:$name&#125; for lowercase.
    </p>
  </details>
</fieldset>

<style>
  fieldset,
  section,
  label {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .step-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  section {
    padding: 0.75rem;
    border: 1px solid var(--border-color, #30363d);
  }

  input,
  select,
  textarea,
  button {
    box-sizing: border-box;
    min-height: 2.75rem;
    min-width: 0;
  }
</style>
