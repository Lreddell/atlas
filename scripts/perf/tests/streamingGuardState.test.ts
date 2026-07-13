import test from 'node:test';
import assert from 'node:assert/strict';
import { StreamingGuardState } from '../../../src/systems/world/streamingGuardState';

test('assignments are tracked per worker and released by completion', () => {
  const state = new StreamingGuardState();
  state.assign({ workerId: 1, jobType: 'GEN', cx: 2, cz: 3, ticket: 4, inputBytes: 100 });
  state.assign({ workerId: 2, jobType: 'MESH', cx: 5, cz: 6, ticket: 7, inputBytes: 200 });

  assert.equal(state.inFlightBytes, 300);
  assert.equal(state.assignmentsForWorker(1).length, 1);
  assert.equal(state.complete('GEN', 2, 3, 4)?.workerId, 1);
  assert.equal(state.inFlightBytes, 200);
  assert.equal(state.complete('GEN', 2, 3, 4), undefined);
});

test('new world sessions clear assignments and increment session identity', () => {
  const state = new StreamingGuardState();
  state.assign({ workerId: 1, jobType: 'GEN', cx: 2, cz: 3, ticket: 4, inputBytes: 100 });
  const first = state.beginWorldSession();
  const second = state.beginWorldSession();

  assert.equal(first, 1);
  assert.equal(second, 2);
  assert.equal(state.inFlightBytes, 0);
  assert.equal(state.assignmentsForWorker(1).length, 0);
});

test('retry attempts reset after a successful job', () => {
  const state = new StreamingGuardState();
  assert.equal(state.recordFailure('MESH', 1, 2), 0);
  assert.equal(state.recordFailure('MESH', 1, 2), 1);
  state.recordSuccess('MESH', 1, 2);
  assert.equal(state.recordFailure('MESH', 1, 2), 0);
});

test('desired epochs increase and store the latest desired set', () => {
  const state = new StreamingGuardState();
  assert.equal(state.updateDesired(['0,0', '1,0']), 1);
  assert.equal(state.isDesired('1,0'), true);
  assert.equal(state.updateDesired(['2,0']), 2);
  assert.equal(state.isDesired('1,0'), false);
  assert.equal(state.isDesired('2,0'), true);
});
