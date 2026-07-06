import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const modulePath = path.resolve(import.meta.dirname, 'blockFamilies.ts').replaceAll('\\', '/');
const result = spawnSync(
    process.execPath,
    [
        '--no-warnings',
        '--experimental-transform-types',
        '--input-type=module',
        '--eval',
        `
            const registry = await import(${JSON.stringify(`file:///${modulePath}`)});
            console.log(JSON.stringify({
                woods: registry.WOOD_FAMILIES,
                grass: registry.GRASS_BLOCKS,
                logs: registry.LOG_BLOCKS,
                stone: registry.STONE_TOOL_MATERIALS,
                logChecks: registry.LOG_BLOCKS.map(registry.isLogBlock),
            }));
        `,
    ],
    { encoding: 'utf8' },
);

assert.equal(result.status, 0, result.stderr || result.stdout);
const registry = JSON.parse(result.stdout.trim());
const blocksSource = fs.readFileSync(path.join(root, 'src/data/blocks.ts'), 'utf8');
const interactionSource = fs.readFileSync(
    path.join(root, 'src/components/controllers/InteractionController.tsx'),
    'utf8',
);

const blockEntryStarts = [...blocksSource.matchAll(/^\s*\[BlockType\.([A-Z0-9_]+)\]:/gm)];
const blockEntry = (type) => {
    const index = blockEntryStarts.findIndex((match) => match[1] === type);
    assert.notEqual(index, -1, `${type} block definition is missing`);
    return blocksSource.slice(
        blockEntryStarts[index].index,
        blockEntryStarts[index + 1]?.index ?? blocksSource.length,
    );
};

const expectedWoodNames = [
    'oak',
    'spruce',
    'birch',
    'cherry',
    'jungle',
    'dark_oak',
    'acacia',
];

test('all seven wood families are registered once', () => {
    assert.deepEqual(registry.woods.map(({ name }) => name), expectedWoodNames);
    assert.equal(new Set(registry.woods.map(({ log }) => log)).size, 7);
    assert.equal(new Set(registry.woods.map(({ planks }) => planks)).size, 7);
    assert.equal(new Set(registry.woods.map(({ sapling }) => sapling)).size, 7);
    assert.equal(new Set(registry.woods.map(({ slab }) => slab)).size, 7);
    assert.equal(new Set(registry.woods.map(({ stairs }) => stairs)).size, 7);
});

test('grass and stone families contain the intended blocks', () => {
    assert.equal(registry.grass.length, 8);
    assert.equal(registry.stone.length, 4);
    assert.equal(registry.logs.length, 7);
    registry.logChecks.forEach((isLog) => assert.equal(isLog, true));
});

test('all grass-topped blocks drop Dirt', () => {
    const grassTypes = [
        'GRASS',
        'SNOWY_GRASS',
        'MOSSY_GRASS',
        'LUSH_GRASS',
        'DARK_GRASS',
        'MEADOW_GRASS',
        'SAVANNA_GRASS',
        'JUNGLE_GRASS',
    ];

    for (const type of grassTypes) {
        assert.match(
            blockEntry(type),
            /drops:\s*\[\{\s*type:\s*BlockType\.DIRT,\s*chance:\s*1,\s*min:\s*1,\s*max:\s*1\s*\}\]/,
            `${type} must drop Dirt`,
        );
    }
});

test('wood families share fuel and charcoal behavior', () => {
    const familyTypes = [
        ['LOG', 'OAK_PLANKS', 'SAPLING', 'OAK_SLAB', 'OAK_STAIRS'],
        ['SPRUCE_LOG', 'SPRUCE_PLANKS', 'SPRUCE_SAPLING', 'SPRUCE_SLAB', 'SPRUCE_STAIRS'],
        ['BIRCH_LOG', 'BIRCH_PLANKS', 'BIRCH_SAPLING', 'BIRCH_SLAB', 'BIRCH_STAIRS'],
        ['CHERRY_LOG', 'CHERRY_PLANKS', 'CHERRY_SAPLING', 'CHERRY_SLAB', 'CHERRY_STAIRS'],
        ['JUNGLE_LOG', 'JUNGLE_PLANKS', 'JUNGLE_SAPLING', 'JUNGLE_SLAB', 'JUNGLE_STAIRS'],
        ['DARK_OAK_LOG', 'DARK_OAK_PLANKS', 'DARK_OAK_SAPLING', 'DARK_OAK_SLAB', 'DARK_OAK_STAIRS'],
        ['ACACIA_LOG', 'ACACIA_PLANKS', 'ACACIA_SAPLING', 'ACACIA_SLAB', 'ACACIA_STAIRS'],
    ];

    for (const [log, planks, sapling, slab, stairs] of familyTypes) {
        assert.match(blockEntry(log), /isFuel:\s*true/);
        assert.match(blockEntry(log), /fuelValue:\s*15000/);
        assert.match(blockEntry(log), /smeltsInto:\s*BlockType\.CHARCOAL/);
        assert.match(blockEntry(planks), /isFuel:\s*true/);
        assert.match(blockEntry(sapling), /isFuel:\s*true/);
        assert.match(blockEntry(slab), /isFuel:\s*true/);
        assert.match(blockEntry(stairs), /isFuel:\s*true/);
    }

    for (const tool of ['WOOD_PICKAXE', 'WOOD_AXE', 'WOOD_SHOVEL', 'WOOD_SWORD', 'WOOD_HOE']) {
        assert.match(blockEntry(tool), /isFuel:\s*true/, `${tool} must be furnace fuel`);
        assert.match(blockEntry(tool), /fuelValue:\s*10000/, `${tool} must use wooden-tool fuel value`);
    }
});

test('new stone variants drop themselves and smelt into Stone', () => {
    for (const type of ['ANDESITE', 'DIORITE', 'GRANITE']) {
        const entry = blockEntry(type);
        assert.match(entry, new RegExp(`drops:\\s*\\[\\{\\s*type:\\s*BlockType\\.${type},`));
        assert.match(entry, /smeltsInto:\s*BlockType\.STONE/);
    }
});

test('placement rotation uses the shared log-family predicate', () => {
    assert.match(
        interactionSource,
        /isLogBlock\(heldItem\.type\)/,
        'all registered logs must rotate through isLogBlock',
    );
});
