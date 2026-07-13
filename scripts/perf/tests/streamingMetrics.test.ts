import test from 'node:test';
import assert from 'node:assert/strict';
import { percentile, summarizeFrameTimes } from '../../../src/systems/world/streamingMetrics';

test('percentile interpolates sorted values without mutating the input', () => {
  const values = [30, 10, 20, 40];
  assert.equal(percentile(values, 0.5), 25);
  assert.deepEqual(values, [30, 10, 20, 40]);
});

test('frame summary reports percentiles and long-frame counts', () => {
  const summary = summarizeFrameTimes([10, 16, 20, 30, 60, 120]);
  assert.equal(summary.samples, 6);
  assert.equal(summary.framesOver25Ms, 3);
  assert.equal(summary.framesOver50Ms, 2);
  assert.equal(summary.framesOver100Ms, 1);
  assert.ok(summary.p95Ms >= summary.p50Ms);
  assert.ok(summary.p99Ms >= summary.p95Ms);
});

test('empty frame summary uses zero values', () => {
  assert.deepEqual(summarizeFrameTimes([]), {
    samples: 0,
    averageMs: 0,
    p50Ms: 0,
    p95Ms: 0,
    p99Ms: 0,
    framesOver25Ms: 0,
    framesOver50Ms: 0,
    framesOver100Ms: 0,
  });
});
