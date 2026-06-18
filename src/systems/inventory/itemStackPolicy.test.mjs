import assert from 'node:assert/strict';
import test from 'node:test';

import {
    canStackByPolicy,
    cloneStack,
    getStackLimitForCapabilities,
} from './itemStackRules.ts';

test('durable and equippable items are singletons', () => {
    assert.equal(getStackLimitForCapabilities(true, false), 1);
    assert.equal(getStackLimitForCapabilities(false, true), 1);
    assert.equal(getStackLimitForCapabilities(true, true), 1);
    assert.equal(getStackLimitForCapabilities(false, false), 64);
});

test('singleton items never merge and ordinary stacks require equal instances', () => {
    const fresh = { type: 10, count: 1, instance: { durability: 100 } };
    const damaged = { type: 10, count: 1, instance: { durability: 50 } };

    assert.equal(canStackByPolicy(fresh, fresh, 1), false);
    assert.equal(canStackByPolicy(fresh, damaged, 64), false);
    assert.equal(canStackByPolicy(fresh, { ...fresh }, 64), true);
});

test('cloning a stack preserves independent instance data', () => {
    const source = {
        type: 10,
        count: 1,
        instance: { durability: 50, tags: ['mobility'] },
    };
    const cloned = cloneStack(source);

    assert.deepEqual(cloned, source);
    assert.notEqual(cloned.instance, source.instance);
    cloned.instance.tags.push('changed');
    assert.deepEqual(source.instance.tags, ['mobility']);
});
