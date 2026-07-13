import test from 'node:test';
import assert from 'node:assert/strict';
import { EvictionQueue } from '../../../src/systems/world/streamingEviction';

test('eviction queue pops the farthest chunk first', () => {
  const queue = new EvictionQueue();
  queue.upsert({ key: '1,1', cx: 1, cz: 1, distSq: 2 });
  queue.upsert({ key: '10,0', cx: 10, cz: 0, distSq: 100 });
  queue.upsert({ key: '3,4', cx: 3, cz: 4, distSq: 25 });

  assert.equal(queue.pop()?.key, '10,0');
  assert.equal(queue.pop()?.key, '3,4');
  assert.equal(queue.pop()?.key, '1,1');
});

test('upsert reprioritizes an existing key without creating duplicates', () => {
  const queue = new EvictionQueue();
  queue.upsert({ key: '1,1', cx: 1, cz: 1, distSq: 2 });
  queue.upsert({ key: '1,1', cx: 1, cz: 1, distSq: 200 });

  assert.equal(queue.size, 1);
  assert.equal(queue.pop()?.distSq, 200);
  assert.equal(queue.size, 0);
});

test('removing a queued key prevents it from being returned', () => {
  const queue = new EvictionQueue();
  queue.upsert({ key: '1,1', cx: 1, cz: 1, distSq: 2 });
  queue.upsert({ key: '2,2', cx: 2, cz: 2, distSq: 8 });
  assert.equal(queue.remove('2,2'), true);
  assert.equal(queue.pop()?.key, '1,1');
  assert.equal(queue.pop(), undefined);
});
