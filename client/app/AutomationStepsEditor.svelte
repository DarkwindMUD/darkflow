<script lang="ts">
  import type { AutomationStep } from "../model/configuration.ts";

  let { steps = $bindable() }: { steps: AutomationStep[] } = $props();

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
        <label>Template <input bind:value={step.template} required /></label>
      {:else if step.type === "set_variable"}
        <label>Variable name <input bind:value={step.name} required /></label>
        <label>Template <input bind:value={step.template} /></label>
      {:else if step.type === "script"}
        <label>Script <textarea bind:value={step.script} required></textarea></label>
      {:else if step.type === "wait"}
        <label
          >Seconds <input
            type="number"
            min="0"
            step="any"
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
        <label>Target <input bind:value={step.target} required /></label>
        <label>Target ID <input bind:value={step.targetId} /></label>
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
        <label>Target <input bind:value={step.target} required /></label>
        <label>Target ID <input bind:value={step.targetId} /></label>
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
        <label>Target <input bind:value={step.target} required /></label>
        <label>Target ID <input bind:value={step.targetId} /></label>
        <label>Template <input bind:value={step.template} /></label>
      {/if}

      <button type="button" onclick={() => (steps = steps.filter((_, item) => item !== index))}
        >Remove step</button
      >
    </section>
  {/each}
  <button type="button" onclick={() => (steps = [...steps, blankStep("send_command")])}
    >Add automation step</button
  >
</fieldset>

<style>
  fieldset,
  section,
  label {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
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
