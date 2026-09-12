import assert from 'node:assert/strict';
import test from 'node:test';
import { previewAliasInput, previewTimer, previewTriggerOutput } from '../public/js/alias-preview-core.mjs';

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
  const result = previewAliasInput({ aliases: [{ enabled: true, trigger: 'x', isRegex: false, steps: [{ type: 'run_alias', template: 'heal %1' }, { type: 'script', script: 'while $again == yes\n  send once\n  break\nend\nif unsupported\n  send never\nend' }] }, { enabled: true, trigger: 'heal', isRegex: false, steps: [] }], variables: { again: 'yes' }, sample: 'x me' });
  assert.equal(result.rows[0].text, 'heal me -> heal');
  assert.deepEqual(result.rows[0].warnings, []);
  assert.equal(result.rows.filter((row) => row.text === 'once').length, 1);
  assert.match(result.rows.flatMap((row) => row.warnings).join(' '), /Unsupported condition/);
});

test('trigger preview overlays all matches without mutating definitions or variables', () => {
  const triggers = [
    { id: 'first', enabled: true, pattern: 'danger *', isRegex: false, gag: false, steps: [{ type: 'set_variable', name: 'target', template: '%1' }] },
    { id: 'second', enabled: true, pattern: 'danger *', isRegex: false, gag: true, steps: [{ type: 'send_command', template: 'flee $target' }, { type: 'play_sound', category: 'alert', sound: 'warning', volume: 0.5 }] },
  ];
  const variables = { hp: '10' };
  const result = previewTriggerOutput({ triggers, variables, sounds: [{ category: 'alert', sound: 'warning' }], sample: 'danger orc' });
  assert.equal(result.matches.length, 2);
  assert.equal(result.gag, true);
  assert.deepEqual(result.rows.map((row) => row.text), ['danger *', '%1=orc', 'orc', 'danger *', '%1=orc', 'flee orc', 'alert / warning']);
  assert.deepEqual(variables, { hp: '10' });
  assert.equal(triggers[0].enabled, true);
});

test('alias preview target simulations do not mutate input catalogs', () => {
  const aliases = [{ id: 'a', enabled: true, trigger: 'go', isRegex: false, steps: [{ type: 'set_trigger_enabled', mode: 'disable', target: 'danger', targetId: 't' }] }];
  const triggers = [{ id: 't', enabled: true, pattern: 'danger', isRegex: false }];
  previewAliasInput({ aliases, triggers, sample: 'go' });
  assert.equal(triggers[0].enabled, true);
});

test('trigger preview reports no match and unknown sound without effects', () => {
  assert.deepEqual(previewTriggerOutput({ sample: 'none' }).warnings, ['No enabled trigger matches this output.']);
  const result = previewTriggerOutput({ triggers: [{ enabled: true, pattern: 'x', isRegex: false, steps: [{ type: 'play_sound', category: 'missing', sound: 'sound', volume: 1 }] }], sample: 'x' });
  assert.match(result.rows[2].warnings.join(' '), /Sound not found/);
});

test('timer preview uses the timer name without mutating its catalogs or variables', () => {
  const timer = {
    id: 'timer-preview',
    enabled: true,
    name: 'Heartbeat',
    durationMs: 60000,
    recurring: true,
    autoStart: true,
    steps: [
      { type: 'send_command', template: 'say %0 $target' },
      { type: 'run_alias', template: 'heal %0' },
      { type: 'control_timer', mode: 'start', target: 'missing', targetId: '' },
      { type: 'play_sound', category: 'missing', sound: 'sound', volume: 1 },
      { type: 'script', script: 'while 1 == 1\n  send loop\nend' },
    ],
  };
  const variables = { target: 'ready' };
  const timers = [timer];
  const aliases = [{ id: 'alias-heal', enabled: true, trigger: 'heal', isRegex: false, steps: [] }];

  const result = previewTimer({ timer, timers, aliases, variables });

  assert.deepEqual(result.schedule, { label: 'Runs every', durationMs: 60000, start: 'Starts automatically.' });
  assert.equal(result.rows[0].text, 'say Heartbeat ready');
  assert.equal(result.rows[1].text, 'heal Heartbeat -> heal');
  assert.match(result.rows[2].warnings.join(' '), /Target not found/);
  assert.match(result.rows[3].warnings.join(' '), /Sound not found/);
  assert.equal(result.rows.filter((row) => row.text === 'loop').length, 10);
  assert.match(result.rows.at(-1).warnings.join(' '), /10 iterations/);
  assert.equal(timer.steps[2].target, 'missing');
  assert.deepEqual(variables, { target: 'ready' });
  assert.equal(aliases[0].enabled, true);
});
