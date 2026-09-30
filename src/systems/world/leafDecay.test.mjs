import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadTs } from './storage/bundleTs.mjs';

globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const leaf = await loadTs(`
    export * from './src/systems/world/leafDecay';
    export { BlockType } from './src/types';
`);
const { BlockType: B } = leaf;

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function fakeWorld() {
    const blocks = new Map();
    const metas = new Map();
    const drops = [];
    const k = (x, y, z) => `${x},${y},${z}`;
    const world = {
        tryGetBlock: (x, y, z) => blocks.get(k(x, y, z)) ?? B.AIR,
        getMetadata: (x, y, z) => metas.get(k(x, y, z)) ?? 0,
        setBlock: (x, y, z, type) => { blocks.set(k(x, y, z), type); metas.set(k(x, y, z), 0); },
        spawnDrop: (type) => drops.push(type),
        isLeaf: (type) => type === B.LEAVES,
        isLog: (type) => type === B.LOG,
        leafDrops: () => [B.STICK],
        getChunkData: () => null, // the sweep has nothing to look at here
        getTickCenter: () => ({ cx: 0, cz: 0 }),
    };
    const put = (x, y, z, type, meta = 0) => { blocks.set(k(x, y, z), type); metas.set(k(x, y, z), meta); };
    const at = (x, y, z) => blocks.get(k(x, y, z)) ?? B.AIR;
    return { world, put, at, drops };
}

/** A trunk at (0, 64..68) and a leaf ball around its top. */
function tree(t) {
    for (let y = 64; y <= 68; y++) t.put(0, y, 0, B.LOG);
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let y = 67; y <= 69; y++) {
        if (x === 0 && z === 0 && y <= 68) continue;
        t.put(x, y, z, B.LEAVES);
    }
}

const run = (t, seconds, from = 0) => {
    for (let s = 0; s <= seconds * 20; s++) leaf.tickLeafDecay(t.world, from + s / 20, () => 0.5);
};

test('a standing tree keeps every leaf, even a hanging one three blocks out', () => {
    leaf.clearLeafDecay();
    const t = fakeWorld();
    tree(t);
    t.put(3, 65, 0, B.LEAVES); // touches no other leaf, three from the trunk
    leaf.noteLogRemoved(0, 63, 0); // a log removed nearby, the tree itself intact
    run(t, 10);
    assert.equal(t.at(3, 65, 0), B.LEAVES);
    assert.equal(t.at(2, 69, 2), B.LEAVES);
    assert.equal(t.drops.length, 0);
});

test('fell the trunk and its leaves fall a few seconds later, with their drops', () => {
    leaf.clearLeafDecay();
    const t = fakeWorld();
    tree(t);
    for (let y = 64; y <= 68; y++) { t.world.setBlock(0, y, 0, B.AIR); leaf.noteLogRemoved(0, y, 0); }
    run(t, 0.2);
    assert.equal(t.at(2, 69, 2), B.LEAVES, 'nothing falls at once');
    run(t, 15, 0.25);
    let left = 0;
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let y = 67; y <= 69; y++) if (t.at(x, y, z) === B.LEAVES) left++;
    assert.equal(left, 0, 'the whole canopy fell');
    assert.ok(t.drops.length > 60, 'each leaf dropped its loot');
});

test('placed leaves stay, and a log put back in time saves the canopy', () => {
    leaf.clearLeafDecay();
    const placed = fakeWorld();
    placed.put(10, 70, 10, B.LEAVES, leaf.LEAF_PLACED_BIT);
    placed.put(10, 69, 10, B.LOG);
    placed.world.setBlock(10, 69, 10, B.AIR);
    leaf.noteLogRemoved(10, 69, 10);
    run(placed, 10);
    assert.equal(placed.at(10, 70, 10), B.LEAVES);

    leaf.clearLeafDecay();
    const saved = fakeWorld();
    tree(saved);
    for (let y = 64; y <= 68; y++) { saved.world.setBlock(0, y, 0, B.AIR); leaf.noteLogRemoved(0, y, 0); }
    run(saved, 0.1);
    saved.put(0, 68, 0, B.LOG); // put back before any leaf is due
    run(saved, 15, 0.15);
    assert.equal(saved.at(2, 69, 2), B.LEAVES);
});

test('the world wires leaf decay in', () => {
    const manager = read('src/systems/WorldManager.ts');
    assert.match(manager, /isLogBlock\(oldType as BlockType\) && !isLogBlock\(type\)\) noteLogRemoved\(x, y, z\)/);
    assert.match(manager, /tickLeafDecay\(this\.leafWorld, this\.leafClock\)/);
    assert.match(manager, /clearLeafDecay\(\);/);
    const interaction = read('src/components/controllers/InteractionController.tsx');
    assert.match(interaction, /if \(isLeafType\(heldItem\.type\)\) \{\s*rotation = LEAF_PLACED_BIT;/);
});
