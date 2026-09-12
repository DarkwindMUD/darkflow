import { evaluateTriggerDefinitions, matchAliasDefinitions, resolveDefinitionTemplate } from './definition-runtime-core.mjs';
import { evaluateAutomationCondition, parseAutomationScript } from './automation-script-core.mjs';

const LOOP_LIMIT = 10;

function resolve(template, context) {
  const result = resolveDefinitionTemplate(template, context);
  return { text: result.text, warnings: [...result.missingVariables.map((name) => 'Missing variable $' + name + '.'), ...result.errors] };
}

function findTarget(step, targets, field) {
  return targets.find((item) => item.id === step.targetId) || targets.find((item) => String(item[field]).trim() === String(step.target).trim());
}

function previewStep(step, context, catalogs, rows) {
  if (step.type === 'wait') { rows.push({ label: 'Wait', text: String(step.seconds) + 's', warnings: Number.isFinite(step.seconds) && step.seconds >= 0 ? [] : ['Wait must be a non-negative number.'] }); return; }
  if (step.type === 'script') { previewScript(step.script, context, catalogs, rows); return; }
  if (step.type === 'play_sound') { rows.push({ label: 'Play sound', text: [step.category, step.sound].filter(Boolean).join(' / '), warnings: catalogs.sounds.some((sound) => sound.category === step.category && sound.sound === step.sound) ? [] : ['Sound not found.'] }); return; }
  if (step.type === 'run_alias') {
    const value = resolve(step.template, context);
    const match = matchAliasDefinitions(value.text, catalogs.aliases);
    rows.push({ label: 'Run alias', text: match ? `${value.text} -> ${match.alias.trigger}` : value.text, warnings: [...value.warnings, ...(match ? [] : ['No enabled alias matches this command.'])] });
    return;
  }
  const targetKind = step.type === 'set_alias_enabled' ? ['aliases', 'trigger'] : step.type === 'set_trigger_enabled' ? ['triggers', 'pattern'] : step.type === 'set_timer_enabled' || step.type === 'control_timer' ? ['timers', 'name'] : step.type === 'call_function' ? ['functions', 'name'] : null;
  if (targetKind) {
    const [kind, field] = targetKind;
    const target = findTarget(step, catalogs[kind], field);
    const argument = step.template ? resolve(step.template, context) : null;
    rows.push({ label: step.type.replaceAll('_', ' '), text: `${step.mode ? step.mode + ' ' : ''}${target ? target[field] : step.target || '(unresolved target)'}${argument?.text ? ' ' + argument.text : ''}`, warnings: [...(target ? [] : ['Target not found.']), ...(argument?.warnings ?? [])] });
    if (target && 'enabled' in target && (step.mode === 'enable' || step.mode === 'disable' || step.mode === 'toggle')) target.enabled = step.mode === 'toggle' ? !target.enabled : step.mode === 'enable';
    return;
  }
  const value = resolve(step.template, context);
  rows.push({ label: step.type === 'set_variable' ? 'Set $' + step.name : step.type === 'show_message' ? 'Show' : 'Send', ...value });
  if (step.type === 'set_variable' && step.name) context.variables[step.name] = value.text;
}

function previewScript(script, context, catalogs, rows) {
  const parsed = parseAutomationScript(script);
  if (parsed.diagnostics.length) { rows.push({ label: 'Script', text: script || '', warnings: parsed.diagnostics }); return; }
  const visit = (nodes) => {
    for (const node of nodes) {
      if (node.type === 'action') previewStep(node.step, context, catalogs, rows);
      else if (node.type === 'break' || node.type === 'continue') return node.type;
      else if (node.type === 'if') {
        let branch = null;
        for (const candidate of node.branches) {
          const result = evaluateAutomationCondition(candidate.condition, context, resolve);
          if (result.diagnostics.length) rows.push({ label: 'Condition', text: candidate.condition, warnings: result.diagnostics });
          if (result.value) { branch = candidate; break; }
        }
        const control = visit(branch ? branch.steps : node.elseSteps || []);
        if (control) return control;
      } else if (node.type === 'while') {
        let count = 0;
        while (count < LOOP_LIMIT) {
          const result = evaluateAutomationCondition(node.condition, context, resolve);
          if (result.diagnostics.length) { rows.push({ label: 'Condition', text: node.condition, warnings: result.diagnostics }); break; }
          if (!result.value) break;
          count++;
          const control = visit(node.steps);
          if (control === 'break') break;
          if (control === 'continue') continue;
        }
        if (count === LOOP_LIMIT) rows.push({ label: 'Script', text: '', warnings: [`Loop preview stopped after ${LOOP_LIMIT} iterations.`] });
      }
    }
    return null;
  };
  visit(parsed.ast);
}

/** Pure display-only preview. It deliberately receives data, never session or executor methods. */
export function previewAliasInput({ aliases = [], functions = [], triggers = [], timers = [], sounds = [], variables = {}, sample = '' }) {
  const catalogs = structuredClone({ aliases, functions, triggers, timers, sounds });
  const match = matchAliasDefinitions(sample, catalogs.aliases);
  if (!match) return { match: null, rows: [], warnings: sample.trim() ? ['No enabled alias matches this input.'] : [] };
  const context = { args: match.args, remainder: match.remainder, variables: { ...variables } };
  const rows = [];
  for (const step of match.alias.steps || []) previewStep(step, context, catalogs, rows);
  return { match: match.alias, rows, warnings: [] };
}

/** Pure display-only trigger preview. It clones all mutable preview state before evaluation. */
export function previewTriggerOutput({ triggers = [], aliases = [], functions = [], timers = [], sounds = [], variables = {}, sample = '' }) {
  const catalogs = structuredClone({ aliases, triggers, functions, timers, sounds });
  const result = evaluateTriggerDefinitions(sample, catalogs.triggers);
  if (!result.matches.length) return { matches: [], gag: false, rows: [], warnings: sample.trim() ? ['No enabled trigger matches this output.'] : [] };
  const context = { args: [], remainder: '', variables: { ...variables } };
  const rows = [];
  for (const match of result.matches) {
    context.args = match.captures;
    context.remainder = match.fullMatch;
    rows.push({ label: 'Matches', text: match.trigger.pattern, warnings: [] });
    rows.push({ label: 'Captures', text: match.captures.length ? match.captures.map((value, index) => `%${index + 1}=${value}`).join(', ') : 'No captures', warnings: [] });
    for (const step of match.trigger.steps || []) previewStep(step, context, catalogs, rows);
  }
  return { matches: result.matches.map(({ trigger }) => trigger), gag: result.gag, rows, warnings: [] };
}

/** Pure display-only timer preview. It never schedules or executes a timer. */
export function previewTimer({ timer, aliases = [], triggers = [], functions = [], timers = [], sounds = [], variables = {} }) {
  const catalogs = structuredClone({ aliases, triggers, functions, timers, sounds });
  const current = structuredClone(timer);
  const context = { args: [current.name], remainder: current.name, variables: { ...variables } };
  const rows = [];
  for (const step of current.steps || []) previewStep(step, context, catalogs, rows);
  return {
    timer: current,
    schedule: {
      label: current.recurring ? 'Runs every' : 'Runs after',
      durationMs: current.durationMs,
      start: current.autoStart ? 'Starts automatically.' : 'Starts manually.',
    },
    rows,
    warnings: [],
  };
}

/** Pure display-only function preview. It never receives runtime capabilities. */
export function previewFunction({ definition, aliases = [], triggers = [], functions = [], timers = [], sounds = [], variables = {}, sample = '' }) {
  const catalogs = structuredClone({ aliases, triggers, functions, timers, sounds });
  const current = structuredClone(definition);
  const remainder = String(sample).trim();
  const context = { args: remainder ? remainder.split(/\s+/) : [], remainder, variables: { ...variables } };
  const rows = [];
  previewScript(current.script, context, catalogs, rows);
  const parsed = parseAutomationScript(current.script);
  const countActions = (nodes) => nodes.reduce((total, node) => total + ((node.type === 'action' || node.type === 'break' || node.type === 'continue') ? 1 : node.type === 'if' ? node.branches.reduce((sum, branch) => sum + countActions(branch.steps), 0) + countActions(node.elseSteps || []) : node.type === 'while' ? countActions(node.steps) : 0), 0);
  const actionCount = countActions(parsed.ast);
  return {
    definition: current,
    rows,
    warnings: [],
    summary: parsed.diagnostics.length
      ? `${parsed.diagnostics.length} script issue${parsed.diagnostics.length === 1 ? '' : 's'}`
      : `${actionCount} action${actionCount === 1 ? '' : 's'}`,
  };
}
