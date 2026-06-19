import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

const source = readFileSync(new URL('./metalItems.ts', import.meta.url), 'utf8');

const magneticItems = [
    'RAW_IRON', 'IRON_INGOT', 'IRON_BLOCK',
    'IRON_PICKAXE', 'IRON_AXE', 'IRON_SHOVEL', 'IRON_SWORD', 'IRON_HOE',
    'IRON_HELMET', 'IRON_CHESTPLATE', 'IRON_LEGGINGS', 'IRON_BOOTS',
    'POSITIVE_MAGNET', 'NEGATIVE_MAGNET',
];

const nonMagneticItems = [
    'RAW_COPPER', 'COPPER_INGOT',
    'COPPER_PICKAXE', 'COPPER_AXE', 'COPPER_SHOVEL', 'COPPER_SWORD', 'COPPER_HOE',
    'COPPER_HELMET', 'COPPER_CHESTPLATE', 'COPPER_LEGGINGS', 'COPPER_BOOTS',
    'RAW_GOLD', 'GOLD_INGOT',
    'GOLD_PICKAXE', 'GOLD_AXE', 'GOLD_SHOVEL', 'GOLD_SWORD', 'GOLD_HOE',
    'GOLD_HELMET', 'GOLD_CHESTPLATE', 'GOLD_LEGGINGS', 'GOLD_BOOTS',
    'STONE_PICKAXE',
    'WOOD_PICKAXE',
    'DIAMOND_PICKAXE',
    'APPLE',
    'GRASS_PLANT',
];

test('classifies every approved metal item family', () => {
    for (const item of magneticItems) {
        assert.match(source, new RegExp(`BlockType\\.${item}\\b`), `${item} is missing`);
    }
});

test('does not classify unrelated item families as magnetic metal', () => {
    for (const item of nonMagneticItems) {
        assert.doesNotMatch(source, new RegExp(`BlockType\\.${item}\\b`), `${item} must remain unaffected`);
    }
});
