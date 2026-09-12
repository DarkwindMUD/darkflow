<script lang="ts">
  import type { AutomationStep } from "../model/configuration.ts";

  type Target = { id: string; label: string };
  type Sound = { category: string; sound: string; label: string };
  let {
    steps = $bindable(),
    aliases = [],
    triggers = [],
    timers = [],
    functions = [],
    sounds = [],
    triggerMode = false,
    timerMode = false,
    testSound = () => false,
  }: {
    steps: AutomationStep[];
    aliases?: Target[];
    triggers?: Target[];
    timers?: Target[];
    functions?: Target[];
    sounds?: Sound[];
    triggerMode?: boolean;
    timerMode?: boolean;
    testSound?: (category: string, sound: string, volume: number) => boolean;
  } = $props();
  let addType = $state<AutomationStep["type"]>("send_command");

  const stepTypes: Array<{ value: AutomationStep["type"]; label: string }> = [
    { value: "send_command", label: "Send command" },
    { value: "set_variable", label: "Set variable" },
    { value: "show_message", label: "Show local message" },
    { value: "script", label: "Run script" },
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
        return {
          type,
          category: sounds[0]?.category ?? "",
          sound: sounds[0]?.sound ?? "",
          volume: 1,
        };
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

  function soundsFor(category: string) {
    return sounds.filter((item) => item.category === category);
  }

  function categoryLabel(category: string): string {
    return soundsFor(category)[0]?.label.split(" / ")[0] ?? category;
  }

  function updateSoundCategory(
    step: Extract<AutomationStep, { type: "play_sound" }>,
    category: string,
  ): void {
    step.category = category;
    step.sound = soundsFor(category).some((item) => item.sound === step.sound)
      ? step.sound
      : (soundsFor(category)[0]?.sound ?? "");
  }

  function splitAliasTemplate(template: string): { id: string; arguments: string } {
    const match = aliases
      .filter((alias) => template === alias.label || template.startsWith(`${alias.label} `))
      .sort((left, right) => right.label.length - left.label.length)[0];
    return match
      ? { id: match.id, arguments: template.slice(match.label.length).trimStart() }
      : { id: "", arguments: template };
  }

  function updateAliasTemplate(
    step: Extract<AutomationStep, { type: "run_alias" }>,
    id: string,
    arguments_: string,
  ): void {
    const alias = aliases.find((item) => item.id === id);
    step.template = alias ? [alias.label, arguments_].filter(Boolean).join(" ") : arguments_;
  }
</script>

<fieldset>
  <legend>Steps</legend>
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

      {#if step.type === "send_command" || step.type === "show_message"}
        <label>Template <textarea bind:value={step.template} required></textarea></label>
      {:else if step.type === "run_alias" && (triggerMode || timerMode)}
        {@const parsedAlias = splitAliasTemplate(step.template)}
        <label
          >Alias <select
            value={parsedAlias.id}
            onchange={(event) =>
              updateAliasTemplate(step, event.currentTarget.value, parsedAlias.arguments)}
          >
            {#if !parsedAlias.id && step.template}<option value=""
                >Unresolved: {step.template}</option
              >{:else}<option value="">Select alias</option>{/if}
            {#each aliases as alias (alias.id)}<option value={alias.id}>{alias.label}</option
              >{/each}
          </select></label
        >
        <label
          >Arguments <input
            value={parsedAlias.arguments}
            oninput={(event) =>
              updateAliasTemplate(step, parsedAlias.id, event.currentTarget.value)}
          /></label
        >
      {:else if step.type === "run_alias"}
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
        <label
          >Category <select
            value={step.category}
            onchange={(event) => updateSoundCategory(step, event.currentTarget.value)}
            required
          >
            {#if step.category && !soundsFor(step.category).length}<option value={step.category}
                >Unresolved: {step.category}</option
              >{/if}
            {#each Array.from(new Set(sounds.map((item) => item.category))) as category (category)}<option
                value={category}>{categoryLabel(category)}</option
              >{/each}
          </select></label
        >
        <label
          >Sound <select bind:value={step.sound} required>
            {#if step.sound && !soundsFor(step.category).some((item) => item.sound === step.sound)}<option
                value={step.sound}>Unresolved: {step.sound}</option
              >{/if}
            {#each soundsFor(step.category) as sound (sound.sound)}<option value={sound.sound}
                >{sound.label}</option
              >{/each}
          </select></label
        >
        <label
          >Volume ({Math.round(step.volume * 100)}%)
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            bind:value={step.volume}
            required
          /></label
        >
        {#if triggerMode}<button
            type="button"
            onclick={() => testSound(step.category, step.sound, step.volume)}>Test Sound</button
          >{/if}
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
    {#if triggerMode}
      <p>
        Simple patterns support * or %1-%9 as captures. Regex triggers use JavaScript regular
        expressions with capture groups as %1-%9. Templates support %0 for the full match, $name
        variables, and &#36;&#123;lower:%1&#125; or &#36;&#123;lower:$name&#125; for lowercase.
        Scripts support if/elseif/else/while/end, break, continue, send, show, wait &lt;seconds&gt;,
        set $name = value, run_alias, call, play_sound, and alias/timer controls.
      </p>
    {:else if timerMode}
      <p>
        Timer templates use %0 for the timer name plus $name variables. Scripts support
        if/elseif/else/while/end, break, continue, send, show, wait &lt;seconds&gt;, set $name =
        value, run_alias, call, and alias/trigger/timer controls.
      </p>
    {:else}
      <p>
        Simple aliases match command words; %0 is everything after the alias. Regex aliases use
        JavaScript regular expressions with capture groups as %1-%9. Templates support $name
        variables and &#36;&#123;lower:%1&#125; or &#36;&#123;lower:$name&#125; for lowercase.
        Scripts support if/elseif/else/while/end, break, continue, send, show, wait &lt;seconds&gt;,
        set $name = value, run_alias, call, and trigger/timer controls.
      </p>
    {/if}
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
