import assert from 'node:assert/strict';
import test from 'node:test';

import { extractEquipmentItems } from './equipmentLifecycle.ts';

test('extracting equipment preserves item instances and clears every slot', () => {
    const equipment = {
        helmet: { type: 1, count: 1, instance: { durability: 80 } },
        chestplate: null,
        leggings: null,
        boots: { type: 2, count: 1, instance: { tags: ['polarity'] } },
        accessory: null,
    };

    const result = extractEquipmentItems(equipment);

    assert.deepEqual(result.items, [equipment.helmet, equipment.boots]);
    assert.notEqual(result.items[0], equipment.helmet);
    assert.deepEqual(result.equipment, {
        helmet: null,
        chestplate: null,
        leggings: null,
        boots: null,
        accessory: null,
    });
});
