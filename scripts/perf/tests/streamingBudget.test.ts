import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RAW_BYTES_PER_CHUNK,
  byteLengthOfGeometryResult,
  estimateTransferBytes,
  getDefaultStreamingBudget,
  getResidentChunkCap,
} from '../../../src/systems/world/streamingBudget';

test('raw chunk byte estimate includes blocks, light, and metadata', () => {
  assert.equal(RAW_BYTES_PER_CHUNK, 16 * 384 * 16 * 3);
});

test('geometry byte estimate sums every typed attribute once', () => {
  const shared = new ArrayBuffer(64);
  const result = {
    opaque: {
      positions: new Float32Array(shared, 0, 4),
      normals: new Float32Array(shared, 16, 4),
      uvs: new Float32Array(8),
      colors: new Float32Array(12),
      indices: new Uint32Array(6),
    },
    cutout: {
      positions: new Float32Array(0),
      normals: new Float32Array(0),
      uvs: new Float32Array(0),
      colors: new Float32Array(0),
      indices: new Uint32Array(0),
    },
    transparent: {
      positions: new Float32Array(0),
      normals: new Float32Array(0),
      uvs: new Float32Array(0),
      colors: new Float32Array(0),
      indices: new Uint32Array(0),
    },
  };

  assert.equal(byteLengthOfGeometryResult(result), 64 + 32 + 48 + 24);
});

test('transfer estimate does not double count aliases of the same buffer', () => {
  const buffer = new ArrayBuffer(128);
  const payload = {
    chunk: new Uint8Array(buffer),
    alias: new Uint8Array(buffer, 16, 32),
    nested: [new Uint8Array(64)],
  };

  assert.equal(estimateTransferBytes(payload), 192);
});

test('default budgets scale down on constrained and mobile devices', () => {
  const desktop = getDefaultStreamingBudget(16, false);
  const mobile = getDefaultStreamingBudget(8, true);
  const constrained = getDefaultStreamingBudget(2, false);

  assert.ok(desktop.hardBytes > mobile.hardBytes);
  assert.ok(mobile.hardBytes > constrained.hardBytes);
  assert.ok(desktop.softBytes < desktop.hardBytes);
});

test('resident chunk cap leaves non-chunk headroom and never falls below the protected minimum', () => {
  const cap = getResidentChunkCap({ hardBytes: RAW_BYTES_PER_CHUNK * 100, protectedMinimum: 197 });
  assert.equal(cap, 197);

  const larger = getResidentChunkCap({ hardBytes: RAW_BYTES_PER_CHUNK * 1000, protectedMinimum: 197 });
  assert.ok(larger > 197);
  assert.ok(larger < 1000);
});
