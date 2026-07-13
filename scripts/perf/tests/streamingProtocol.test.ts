import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRetryDelayMs,
  isAllocationError,
  makeAssignmentKey,
  normalizeWorkerError,
} from '../../../src/systems/world/workers/streamingProtocol';

test('allocation failures are recognized from common browser messages', () => {
  assert.equal(isAllocationError(new RangeError('Array buffer allocation failed')), true);
  assert.equal(isAllocationError(new Error('Out of memory while allocating ArrayBuffer')), true);
  assert.equal(isAllocationError(new Error('ordinary generation failure')), false);
});

test('worker errors are normalized into serializable payloads', () => {
  const payload = normalizeWorkerError({
    error: new RangeError('Array buffer allocation failed'),
    jobType: 'MESH',
    workerId: 2,
    cx: -4,
    cz: 9,
    ticket: 17,
    worldSessionId: 3,
    desiredEpoch: 8,
    jobInputBytes: 1234,
  });

  assert.equal(payload.type, 'JOB_ERROR');
  assert.equal(payload.errorName, 'RangeError');
  assert.equal(payload.allocationRelated, true);
  assert.equal(payload.workerId, 2);
  assert.equal(payload.jobInputBytes, 1234);
});

test('retry delay applies bounded exponential backoff', () => {
  assert.equal(getRetryDelayMs(0), 100);
  assert.equal(getRetryDelayMs(1), 200);
  assert.equal(getRetryDelayMs(5), 3200);
  assert.equal(getRetryDelayMs(20), 5000);
});

test('assignment key distinguishes job type, coordinates, and ticket', () => {
  assert.notEqual(makeAssignmentKey('GEN', 1, 2, 3), makeAssignmentKey('MESH', 1, 2, 3));
  assert.notEqual(makeAssignmentKey('GEN', 1, 2, 3), makeAssignmentKey('GEN', 1, 2, 4));
});
