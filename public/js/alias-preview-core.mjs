import { matchAliasDefinitions, resolveDefinitionTemplate } from './definition-runtime-core.mjs';
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
  if (step.type === 'play_sound') { rows.push({ label: 'Play sound', text: [step.category, step.sound].filter(Boolean).join(' / '), warnings: [] }); return; }
  if (step.type === 'run_alias') {
    rows.push({ label: 'Run alias', ...resolve(step.template, context) });
    return;
  }
  const targetKind = step.type === 'set_alias_enabled' ? ['aliases', 'trigger'] : step.type === 'set_trigger_enabled' ? ['triggers', 'pattern'] : step.type === 'set_timer_enabled' || step.type === 'control_timer' ? ['timers', 'name'] : step.type === 'call_function' ? ['functions', 'name'] : null;
  if (targetKind) {
    const [kind, field] = targetKind;
    const target = findTarget(step, catalogs[kind], field);
    const argument = step.template ? resolve(step.template, context) : null;
    rows.push({ label: step.type.replaceAll('_', ' '), text: `${step.mode ? step.mode + ' ' : ''}${target ? target[field] : step.target || '(unresolved target)'}${argument?.text ? ' ' + argument.text : ''}`, warnings: [...(target ? [] : ['Target not found.']), ...(argument?.warnings ?? [])] });
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
export function previewAliasInput({ aliases = [], functions = [], triggers = [], timers = [], variables = {}, sample = '' }) {
  const match = matchAliasDefinitions(sample, structuredClone(aliases));
  if (!match) return { match: null, rows: [], warnings: sample.trim() ? ['No enabled alias matches this input.'] : [] };
  const context = { args: match.args, remainder: match.remainder, variables: { ...variables } };
  const rows = [];
  for (const step of match.alias.steps || []) previewStep(step, context, { aliases, functions, triggers, timers }, rows);
  return { match: match.alias, rows, warnings: [] };
}
