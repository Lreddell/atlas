import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const types = read('src/types.ts');

const WORLD_IDS = {
    ECHO_STONE: 70,
    ECHO_BRICKS: 71,
    CRACKED_ECHO_BRICKS: 72,
    CHISELED_ECHO_STONE: 73,
    ECHO_MOSAIC: 74,
    ECHO_CRYSTAL: 75,
    RESONANCE_PYLON: 76,
    PULSE_CONDUIT: 78,
    PHASE_BLOCK: 79,
    RESONANCE_PLATE: 80,
    RESONANT_LAMP: 81,
    ECHO_SPIKES: 82,
    SENTINEL_CORE: 83,
    LISTENING_STONE: 84,
    VAULT_SEAL: 85,
    ECHO_STONE_SLAB: 178,
    ECHO_STONE_STAIRS: 179,
    ECHO_BRICK_SLAB: 180,
    ECHO_BRICK_STAIRS: 181,
};

const ITEM_IDS = {
    ECHO_SHARD: 170,
    ECHO_DUST: 171,
    ECHO_CORE: 173,
    FRACTURED_CORE: 177,
    VAULTSTEEL_SPEAR: 182,
    VAULT_CROSSBOW: 183,
    VAULT_BOLT: 184,
    BELLBREAKER_MAUL: 185,
    ECHO_TUNING_FORK: 186,
    TITAN_HAMMER: 187,
};

function enumValue(name) {
    const match = types.match(new RegExp(`\\b${name}\\s*=\\s*(\\d+)`));
    return match ? Number(match[1]) : null;
}

test('resonant world block IDs preserve 70-85 (minus the retired door) and add the approved 178-181 shapes', () => {
    for (const [name, expected] of Object.entries(WORLD_IDS)) {
        assert.equal(enumValue(name), expected, `${name} must equal ${expected}`);
    }
    // ID 77 (RESONANCE_DOOR) is retired, never reassigned.
    assert.equal(enumValue('RESONANCE_DOOR'), null);
    assert.equal(new Set(Object.values(WORLD_IDS)).size, 19);
});

test('resonant inventory IDs register only the current items', () => {
    for (const [name, expected] of Object.entries(ITEM_IDS)) {
        assert.equal(enumValue(name), expected, `${name} must equal ${expected}`);
    }
    assert.equal(new Set(Object.values(ITEM_IDS)).size, 10);
    for (const retired of [172, 174, 175, 176]) {
        assert.equal(Object.values(ITEM_IDS).includes(retired), false);
    }
});

test('resonant IDs do not collide and fit the block storage byte', () => {
    const all = [...Object.values(WORLD_IDS), ...Object.values(ITEM_IDS)];
    assert.equal(new Set(all).size, all.length);
    assert.equal(all.every((id) => Number.isInteger(id) && id >= 0 && id <= 255), true);
});

test('current catalog modules exist', () => {
    for (const file of [
        'src/systems/registry/worldBlockCatalog.ts',
        'src/systems/registry/itemCatalog.ts',
        'src/systems/registry/contentCatalog.ts',
    ]) {
        assert.equal(fs.existsSync(path.join(root, file)), true, `${file} must exist`);
    }
});

test('catalogs distinguish world blocks from inventory-only items', () => {
    const worldCatalog = read('src/systems/registry/worldBlockCatalog.ts');
    const itemCatalog = read('src/systems/registry/itemCatalog.ts');
    const contentCatalog = read('src/systems/registry/contentCatalog.ts');

    assert.match(worldCatalog, /RESONANT_WORLD_BLOCK_IDS/);
    assert.match(worldCatalog, /isWorldBlockId/);
    assert.match(worldCatalog, /assertWorldBlockId/);
    assert.match(itemCatalog, /RESONANT_ITEM_IDS/);
    assert.match(itemCatalog, /isInventoryOnlyItemId/);
    assert.match(itemCatalog, /placedBlock/);
    assert.match(contentCatalog, /getContentDefinition/);
    assert.match(contentCatalog, /assertContentCatalogIntegrity/);
});
