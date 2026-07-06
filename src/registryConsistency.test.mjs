import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Cross-registry consistency checks (source-text based, matching the repo
// convention for enum-touching modules).
const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const typesSrc = read('src/types.ts');
const blocksSrc = read('src/data/blocks.ts');
const recipesSrc = read('src/recipes.ts');

const enumNames = new Set(
    [...typesSrc.matchAll(/^\s{2}([A-Z][A-Z0-9_]*)\s*=\s*\d+,?/gm)].map((m) => m[1]),
);

test('every BlockType referenced by recipes exists in the enum', () => {
    for (const m of recipesSrc.matchAll(/BlockType\.([A-Z0-9_]+)/g)) {
        assert.ok(enumNames.has(m[1]), `recipes.ts references unknown BlockType.${m[1]}`);
    }
});

test('every BlockType referenced by the block registry exists in the enum', () => {
    for (const m of blocksSrc.matchAll(/BlockType\.([A-Z0-9_]+)/g)) {
        assert.ok(enumNames.has(m[1]), `blocks.ts references unknown BlockType.${m[1]}`);
    }
});

test('all sixteen armor pieces are craftable', () => {
    // The ARMOR_SETS table drives helmet/chestplate/leggings/boots recipes for
    // iron, gold, diamond, and copper.
    assert.match(recipesSrc, /const ARMOR_SETS/);
    for (const material of ['IRON', 'GOLD', 'COPPER']) {
        for (const piece of ['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS']) {
            assert.match(recipesSrc, new RegExp(`BlockType\\.${material}_${piece}`), `${material}_${piece} recipe missing`);
        }
    }
    for (const piece of ['HELMET', 'CHESTPLATE', 'LEGGINGS', 'BOOTS']) {
        assert.match(recipesSrc, new RegExp(`BlockType\\.DIAMOND_${piece}`), `DIAMOND_${piece} recipe missing`);
    }
    assert.match(recipesSrc, /push\(3, \[M, M, M, M, null, M, null, null, null\], a\.helmet, 1\)/);
});

test('previously unobtainable items now have survival sources', () => {
    // Wool (bed ingredient) from wheat seeds; packed ice from ice; boat from
    // planks; charged magnetite + magnetic spikes from magnetite materials.
    assert.match(recipesSrc, /BlockType\.WHEAT_SEEDS[\s\S]{0,120}BlockType\.WOOL/);
    assert.match(recipesSrc, /BlockType\.ICE[\s\S]{0,120}BlockType\.PACKED_ICE/);
    assert.match(recipesSrc, /BlockType\.BOAT/);
    assert.match(recipesSrc, /BlockType\.CHARGED_MAGNETITE/);
    assert.match(recipesSrc, /BlockType\.MAGNETIC_SPIKE/);
});

test('the boat item is registered with a name, icon slot, and creative category', () => {
    assert.match(typesSrc, /\bBOAT\s*=\s*169\b/);
    assert.match(blocksSrc, /\[BlockType\.BOAT\]:[^\n]*name:\s*'Boat'/);
    assert.match(blocksSrc, /\[BlockType\.BOAT\]:[^\n]*textureSlot:\s*216/);
    assert.match(blocksSrc, /\[BlockType\.BOAT\]:[^\n]*category:/);
});

test('no two item entries share a texture slot (block-parent reuse excepted)', () => {
    // Items (isItem: true) must each render their own icon. UPGRADED_POLARITY_BOOTS
    // intentionally reuses the base boots tile (slot 155).
    const entryStarts = [...blocksSrc.matchAll(/^\s*\[BlockType\.([A-Z0-9_]+)\]:/gm)];
    const seen = new Map();
    entryStarts.forEach((m, i) => {
        const body = blocksSrc.slice(m.index, entryStarts[i + 1]?.index ?? blocksSrc.length);
        if (!/\bisItem:\s*true\b/.test(body)) return;
        if (m[1] === 'UPGRADED_POLARITY_BOOTS') return;
        const slot = Number(body.match(/textureSlot:\s*(\d+)/)?.[1]);
        assert.ok(!seen.has(slot), `items ${seen.get(slot)} and ${m[1]} share texture slot ${slot}`);
        seen.set(slot, m[1]);
    });
});
