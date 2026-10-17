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
  const instanceId = $props.id();
  const helpId = `${instanceId}-help`;
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
    gap: 0.7rem;
    cursor: pointer;
  }
  input {
    flex: none;
    width: 1rem;
    height: 1rem;
    margin: 0.15rem 0 0;
    cursor: pointer;
  }
  .settings-checkbox-label,
  .settings-checkbox-help {
    display: block;
  }
  .settings-checkbox-label {
    font-weight: 500;
  }
  .settings-checkbox-help {
    margin-top: 0.15rem;
    color: var(--df-muted, #8b949e);
    font-size: 12.5px;
    line-height: 1.4;
  }
</style>
