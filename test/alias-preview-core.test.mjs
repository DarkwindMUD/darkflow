import assert from 'node:assert/strict';
import test from 'node:test';
import { previewAliasInput } from '../public/js/alias-preview-core.mjs';

test('preview resolves the winning unsent alias without mutating inputs', () => {
  const aliases = [{ id: 'a', enabled: true, trigger: 'go', isRegex: false, steps: [{ type: 'set_variable', name: 'place', template: '%1' }, { type: 'send_command', template: 'walk $place' }] }];
  const variables = { hp: '10' };
  const result = previewAliasInput({ aliases, variables, sample: 'go north' });
  assert.equal(result.match.id, 'a');
  assert.deepEqual(result.rows.map((row) => row.text), ['north', 'walk north']);
  assert.deepEqual(variables, { hp: '10' });
  assert.equal(aliases[0].steps.length, 2);
});

test('preview reports no match and script diagnostics', () => {
  assert.deepEqual(previewAliasInput({ sample: 'none' }).warnings, ['No enabled alias matches this input.']);
  const result = previewAliasInput({ aliases: [{ enabled: true, trigger: 'x', isRegex: false, steps: [{ type: 'script', script: 'if' }] }], sample: 'x' });
  assert.match(result.rows[0].warnings.join(' '), /Unknown script action|Missing end/);
});

test('preview evaluates script conditions with a bounded loop and no input mutation', () => {
  const aliases = [{ enabled: true, trigger: 'x', isRegex: false, steps: [{ type: 'script', script: 'while $again == yes\n  send ping\nend' }] }];
  const variables = { again: 'yes' };
  const result = previewAliasInput({ aliases, variables, sample: 'x' });
  assert.equal(result.rows.filter((row) => row.text === 'ping').length, 10);
  assert.match(result.rows.at(-1).warnings.join(' '), /10 iterations/);
  assert.deepEqual(variables, { again: 'yes' });
});

test('preview resolves run aliases and honors script break diagnostics', () => {
  const result = previewAliasInput({ aliases: [{ enabled: true, trigger: 'x', isRegex: false, steps: [{ type: 'run_alias', template: 'heal %1' }, { type: 'script', script: 'while $again == yes\n  send once\n  break\nend\nif unsupported\n  send never\nend' }] }], variables: { again: 'yes' }, sample: 'x me' });
  assert.equal(result.rows[0].text, 'heal me');
  assert.equal(result.rows.filter((row) => row.text === 'once').length, 1);
  assert.match(result.rows.flatMap((row) => row.warnings).join(' '), /Unsupported condition/);
});
