<script lang="ts">
  let {
    checked = $bindable(false),
    label,
    help,
    onchange,
  }: {
    checked?: boolean;
    label: string;
    help: string;
    onchange?: (checked: boolean) => void;
  } = $props();
  let helpId = $derived(`settings-help-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`);
</script>

<label class="settings-checkbox-row">
  <input
    type="checkbox"
    aria-label={label}
    aria-describedby={helpId}
    bind:checked
    onchange={() => onchange?.(checked)}
  />
  <span>
    <span class="settings-checkbox-label">{label}</span>
    <span class="settings-checkbox-help" id={helpId}>{help}</span>
  </span>
</label>

<style>
  .settings-checkbox-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  input {
    flex: none;
    margin-top: 0.2rem;
  }
  .settings-checkbox-label,
  .settings-checkbox-help {
    display: block;
  }
  .settings-checkbox-help {
    margin-top: 0.2rem;
    color: var(--df-muted, #8b949e);
    font-size: 0.9em;
  }
</style>
