import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

const { FadeBudget } = await loadTs(`
  export { FadeBudget } from './src/systems/rendering/fadeBudget';
`);

test('active set never exceeds the hard limit', () => {
  const budget = new FadeBudget(2);
  assert.equal(budget.request('a'), 'active');
  assert.equal(budget.request('b'), 'active');
  assert.equal(budget.request('c'), 'queued');
  assert.equal(budget.active.size, 2);
  assert.equal(budget.pendingCount, 1);
});

test('completion promotes queued fades in FIFO order', () => {
  const budget = new FadeBudget(2);
  budget.request('a');
  budget.request('b');
  budget.request('c');
  budget.request('d');
  assert.deepEqual(budget.complete('a'), ['c']);
  assert.deepEqual([...budget.active], ['b', 'c']);
  assert.deepEqual(budget.complete('b'), ['d']);
});

test('cancel removes queued work without consuming capacity', () => {
  const budget = new FadeBudget(1);
  budget.request('a');
  budget.request('b');
  budget.cancel('b');
  assert.equal(budget.pendingCount, 0);
  assert.deepEqual(budget.complete('a'), []);
});

test('duplicate requests are idempotent', () => {
  const budget = new FadeBudget(1);
  assert.equal(budget.request('a'), 'active');
  assert.equal(budget.request('a'), 'active');
  assert.equal(budget.active.size, 1);
});
