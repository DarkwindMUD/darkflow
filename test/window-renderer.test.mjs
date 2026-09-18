import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countDirectPlayerRows,
  dependentSelectOptions,
  usesNpcDialogueMultiColumnChoices,
  usesPlayerRowMultiColumnGrid,
} from '../public/js/window-renderer.js';
import { DISPLAY_TYPES } from '../public/js/window-types.js';

test('paged text remains an explicit renderer display type', () => {
  assert.equal(DISPLAY_TYPES.has('paged_text'), true);
});

function gridWithPlayerRows(count) {
  return {
    type: 'grid',
    children: Array.from({ length: count }, (_, index) => ({
      type: 'player_row',
      name: 'Character ' + (index + 1),
    })),
  };
}

test('player row grids stay single layout through three characters', () => {
  assert.equal(countDirectPlayerRows(gridWithPlayerRows(3)), 3);
  assert.equal(usesPlayerRowMultiColumnGrid(gridWithPlayerRows(3), { windowId: 'charselect' }), false);
});

test('charselect player row grids switch to multicolumn beyond three characters', () => {
  assert.equal(countDirectPlayerRows(gridWithPlayerRows(4)), 4);
  assert.equal(usesPlayerRowMultiColumnGrid(gridWithPlayerRows(4), { windowId: 'charselect' }), true);
});

test('non-charselect player row grids do not switch layout', () => {
  assert.equal(usesPlayerRowMultiColumnGrid(gridWithPlayerRows(4), { windowId: 'finger' }), false);
});

test('npc dialogue choices switch to columns only for long choice lists', () => {
  assert.equal(usesNpcDialogueMultiColumnChoices(8), false);
  assert.equal(usesNpcDialogueMultiColumnChoices(9), true);
});

test('dependent selects resolve options from the controlling value', () => {
  const optionsByValue = {
    basics: [{ value: 'inventory', label: 'inventory' }],
    combat: [{ value: 'kill', label: 'kill' }, { value: 'engage', label: 'engage' }],
  };

  assert.deepEqual(dependentSelectOptions(optionsByValue, 'basics'), [
    { value: 'inventory', label: 'inventory' },
  ]);
  assert.deepEqual(dependentSelectOptions(optionsByValue, 'combat'), [
    { value: 'kill', label: 'kill' },
    { value: 'engage', label: 'engage' },
  ]);
  assert.deepEqual(dependentSelectOptions(optionsByValue, 'missing'), []);
});
