import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

const source = readFileSync(new URL('./equipment.ts', import.meta.url), 'utf8');
const ironArmorSet = source.match(/const IRON_ARMOR[\s\S]*?\]\);/)?.[0] ?? '';

test('passive worn-player magnetism is activated only by iron armor', () => {
    for (const piece of ['IRON_HELMET', 'IRON_CHESTPLATE', 'IRON_LEGGINGS', 'IRON_BOOTS']) {
        assert.match(ironArmorSet, new RegExp(`BlockType\\.${piece}\\b`));
    }

    assert.doesNotMatch(ironArmorSet, /BlockType\.(?:COPPER|GOLD)_/);
});
