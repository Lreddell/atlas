import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadTs } from './storage/bundleTs.mjs';

globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const farm = await loadTs(`
    export * from './src/systems/world/farming';
    export { BlockType } from './src/types';
    export { CHUNK_SIZE, WORLD_HEIGHT, MIN_Y } from './src/constants';
    export { BLOCKS } from './src/data/blocks';
    export { checkRecipe } from './src/recipes';
`);
const { BlockType: B, CHUNK_SIZE, WORLD_HEIGHT, MIN_Y } = farm;

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

/** A small world: blocks and data by position, light by a function. */
function fakeWorld({ light = () => ({ sky: 15, block: 0 }) } = {}) {
    const blocks = new Map();
    const metas = new Map();
    const drops = [];
    const key = (x, y, z) => `${x},${y},${z}`;
    const world = {
        tryGetBlock: (x, y, z) => blocks.get(key(x, y, z)) ?? B.AIR,
        getMetadata: (x, y, z) => metas.get(key(x, y, z)) ?? 0,
        setBlockData: (x, y, z, meta) => { metas.set(key(x, y, z), meta); },
        setBlock: (x, y, z, type, meta = 0) => { blocks.set(key(x, y, z), type); metas.set(key(x, y, z), meta); },
        spawnDrop: (type) => drops.push(type),
        getLight: (x, y, z) => light(x, y, z),
        getChunkData: (cx, cz) => {
            const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
            for (const [k, type] of blocks) {
                const [x, y, z] = k.split(',').map(Number);
                if (Math.floor(x / CHUNK_SIZE) !== cx || Math.floor(z / CHUNK_SIZE) !== cz) continue;
                const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE, lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
                data[(y - MIN_Y) * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx] = type;
            }
            return data;
        },
        getChunkMetadata: (cx, cz) => {
            const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
            for (const [k, meta] of metas) {
                const [x, y, z] = k.split(',').map(Number);
                if (Math.floor(x / CHUNK_SIZE) !== cx || Math.floor(z / CHUNK_SIZE) !== cz) continue;
                const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE, lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
                data[(y - MIN_Y) * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx] = meta;
            }
            return data;
        },
        getTickCenter: () => ({ cx: 0, cz: 0 }),
        isOpenPlant: (type) => type === B.GRASS_PLANT || type === B.ROSE,
    };
    return { world, blocks, metas, drops, key };
}

test('a hoe tills grass and dirt into farmland, coarse dirt into dirt, and nothing else', () => {
    const tilled = farm.tillResult(B.GRASS, 0);
    assert.deepEqual(tilled, { type: B.DIRT, meta: farm.TILLED_BIT });
    assert.ok(farm.isFarmland(tilled.type, tilled.meta));
    assert.deepEqual(farm.tillResult(B.DIRT, 0), tilled);
    assert.deepEqual(farm.tillResult(B.MEADOW_GRASS, 0), tilled);
    assert.deepEqual(farm.tillResult(B.COARSE_DIRT, 0), { type: B.DIRT, meta: 0 });
    for (const type of [B.STONE, B.SAND, B.SNOWY_GRASS, B.PODZOL, B.MUD]) assert.equal(farm.tillResult(type, 0), null);
    assert.equal(farm.tillResult(B.DIRT, farm.farmlandMeta(5)), null, 'already farmland');
    for (const hoe of [B.WOOD_HOE, B.STONE_HOE, B.COPPER_HOE, B.IRON_HOE, B.GOLD_HOE, B.DIAMOND_HOE]) assert.ok(farm.isHoe(hoe));
    assert.equal(farm.isHoe(B.WOOD_SHOVEL), false);
});

test('farmland shows its moisture, and each wheat stage its own tile', () => {
    assert.equal(farm.farmlandTopSlot(farm.farmlandMeta(0)), farm.FARMLAND_DRY_SLOT);
    assert.equal(farm.farmlandTopSlot(farm.farmlandMeta(3)), farm.FARMLAND_WET_SLOT);
    for (let stage = 0; stage <= 7; stage++) {
        assert.equal(farm.cropTextureSlot(B.WHEAT_SEEDS, stage), farm.WHEAT_STAGE_SLOT + stage);
    }
    assert.ok(farm.isCrop(B.WHEAT_SEEDS));
    assert.equal(farm.isCrop(B.SAPLING), false);
});

test('unripe wheat gives its seed back; ripe wheat a wheat and one to four seeds', () => {
    assert.deepEqual(farm.cropDrops(B.WHEAT_SEEDS, 3, () => 0), [{ type: B.WHEAT_SEEDS, count: 1 }]);
    const lucky = farm.cropDrops(B.WHEAT_SEEDS, 7, () => 0);
    assert.deepEqual(lucky, [{ type: B.WHEAT, count: 1 }, { type: B.WHEAT_SEEDS, count: 4 }]);
    const unlucky = farm.cropDrops(B.WHEAT_SEEDS, 7, () => 0.99);
    assert.deepEqual(unlucky, [{ type: B.WHEAT, count: 1 }, { type: B.WHEAT_SEEDS, count: 1 }]);
});

test('water within four blocks keeps farmland soaked; without it, it dries a step a tick', () => {
    const { world, metas, key } = fakeWorld();
    world.setBlock(0, 64, 0, B.DIRT, farm.farmlandMeta(0));
    world.setBlock(4, 64, 0, B.WATER);
    farm.tickFarmland(world, 0, 64, 0, farm.farmlandMeta(0), () => 0.99);
    assert.equal(farm.moistureOf(metas.get(key(0, 64, 0))), farm.MAX_MOISTURE, 'water four blocks off soaks it');

    const dry = fakeWorld();
    dry.world.setBlock(0, 64, 0, B.DIRT, farm.farmlandMeta(7));
    dry.world.setBlock(0, 65, 0, B.WHEAT_SEEDS, 0);
    dry.world.setBlock(5, 64, 0, B.WATER); // five blocks off: too far
    farm.tickFarmland(dry.world, 0, 64, 0, farm.farmlandMeta(7), () => 0.99);
    assert.equal(farm.moistureOf(dry.metas.get(dry.key(0, 64, 0))), 6);
    assert.ok(farm.hasWaterNearby(dry.world.tryGetBlock, 1, 64, 0), 'but it reaches the next block over');
    // Water one level above counts; two above does not.
    const high = fakeWorld();
    high.world.setBlock(2, 65, 0, B.WATER);
    assert.ok(farm.hasWaterNearby(high.world.tryGetBlock, 0, 64, 0));
    const higher = fakeWorld();
    higher.world.setBlock(2, 66, 0, B.WATER);
    assert.equal(farm.hasWaterNearby(higher.world.tryGetBlock, 0, 64, 0), false);
});

test('dry, empty farmland turns back to dirt; planted farmland waits; a block on top packs it', () => {
    const empty = fakeWorld();
    empty.world.setBlock(0, 64, 0, B.DIRT, farm.farmlandMeta(0));
    farm.tickFarmland(empty.world, 0, 64, 0, farm.farmlandMeta(0), () => 0.99);
    assert.equal(empty.metas.get(empty.key(0, 64, 0)), 0, 'plain dirt again');

    const planted = fakeWorld();
    planted.world.setBlock(0, 64, 0, B.DIRT, farm.farmlandMeta(0));
    planted.world.setBlock(0, 65, 0, B.WHEAT_SEEDS, 2);
    farm.tickFarmland(planted.world, 0, 64, 0, farm.farmlandMeta(0), () => 0.99);
    assert.ok(farm.isFarmland(B.DIRT, planted.metas.get(planted.key(0, 64, 0))), 'a crop keeps it farmland');

    const covered = fakeWorld();
    covered.world.setBlock(0, 64, 0, B.DIRT, farm.farmlandMeta(7));
    covered.world.setBlock(0, 65, 0, B.STONE);
    farm.tickFarmland(covered.world, 0, 64, 0, farm.farmlandMeta(7), () => 0.99);
    assert.equal(covered.metas.get(covered.key(0, 64, 0)), 0);
    // Grass or a flower on it is fine.
    const flowered = fakeWorld();
    flowered.world.setBlock(0, 64, 0, B.DIRT, farm.farmlandMeta(7));
    flowered.world.setBlock(0, 65, 0, B.ROSE);
    flowered.world.setBlock(3, 64, 0, B.WATER);
    farm.tickFarmland(flowered.world, 0, 64, 0, farm.farmlandMeta(7), () => 0.99);
    assert.ok(farm.isFarmland(B.DIRT, flowered.metas.get(flowered.key(0, 64, 0))));
});

test('crops grow a stage on a lucky tick, only in light, faster on moist soil', () => {
    const grow = (moisture, roll, lightLevel) => {
        const w = fakeWorld({ light: () => ({ sky: lightLevel, block: 0 }) });
        w.world.setBlock(0, 64, 0, B.DIRT, farm.farmlandMeta(moisture));
        if (moisture > 0) w.world.setBlock(2, 64, 0, B.WATER);
        w.world.setBlock(0, 65, 0, B.WHEAT_SEEDS, 3);
        farm.tickFarmland(w.world, 0, 64, 0, farm.farmlandMeta(moisture), () => roll);
        return w.metas.get(w.key(0, 65, 0));
    };
    assert.equal(grow(7, 0.4, 15), 4, 'moist soil: grows under 0.45');
    assert.equal(grow(0, 0.4, 15), 3, 'dry soil: 0.4 is not under 0.12');
    assert.equal(grow(0, 0.1, 15), 4, 'dry soil still grows, slowly');
    assert.equal(grow(7, 0.0, 8), 3, 'too dark');
    // Ripe wheat stays ripe.
    const ripe = fakeWorld();
    ripe.world.setBlock(0, 64, 0, B.DIRT, farm.farmlandMeta(7));
    ripe.world.setBlock(2, 64, 0, B.WATER);
    ripe.world.setBlock(0, 65, 0, B.WHEAT_SEEDS, 7);
    farm.tickFarmland(ripe.world, 0, 64, 0, farm.farmlandMeta(7), () => 0);
    assert.equal(ripe.metas.get(ripe.key(0, 65, 0)), 7);
});

test('packing farmland knocks its crop off with the crop\'s drops', () => {
    const w = fakeWorld();
    w.world.setBlock(0, 64, 0, B.DIRT, farm.farmlandMeta(7));
    w.world.setBlock(0, 65, 0, B.WHEAT_SEEDS, 7);
    farm.untillFarmland(w.world, 0, 64, 0, () => 0);
    assert.equal(w.blocks.get(w.key(0, 65, 0)), B.AIR);
    assert.equal(w.metas.get(w.key(0, 64, 0)), 0);
    assert.deepEqual(w.drops.sort(), [B.WHEAT, B.WHEAT_SEEDS, B.WHEAT_SEEDS, B.WHEAT_SEEDS, B.WHEAT_SEEDS].sort());
});

test('the farm tick finds a chunk\'s farmland and ticks it', () => {
    farm.clearFarmIndex();
    const w = fakeWorld();
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
        w.world.setBlock(x, 64, z, B.DIRT, farm.farmlandMeta(0)); // dry, empty: every ticked one reverts
    }
    // Twenty visits sample 240 columns at random: most of the 256 come up.
    for (let t = 0; t < 60 * 20; t++) farm.tickFarms(w.world, Math.random);
    let reverted = 0;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) if (w.metas.get(w.key(x, 64, z)) === 0) reverted++;
    assert.ok(reverted > 100, `${reverted} of 256 dry farmland blocks reverted in twenty visits`);
});

test('bread is three wheat in a row, and a loaf is real food', () => {
    const grid = [B.WHEAT, B.WHEAT, B.WHEAT, null, null, null, null, null, null];
    assert.deepEqual(farm.checkRecipe(grid, 3), { type: B.BREAD, count: 1 });
    const lower = [null, null, null, null, null, null, B.WHEAT, B.WHEAT, B.WHEAT];
    assert.deepEqual(farm.checkRecipe(lower, 3), { type: B.BREAD, count: 1 }, 'any row');
    assert.equal(farm.BLOCKS[B.BREAD].nutrition, 5);
    assert.equal(farm.BLOCKS[B.BREAD].category, 'food');
    assert.equal(farm.BLOCKS[B.WHEAT].isItem, true);
});

test('the game wires farming in: tilling, planting, crop drops, trampling, the tick', () => {
    const interaction = read('src/components/controllers/InteractionController.tsx');
    assert.match(interaction, /const tilled = tillResult\(targetType, targetMeta\)/);
    assert.match(interaction, /if \(isFarmland\(targetType, targetMeta\) && aboveType === BlockType\.AIR/);
    assert.match(interaction, /for \(const drop of cropDrops\(targetType, cropStageBroken\)\)/);
    assert.match(interaction, /\|\| isHoe\(heldItem\.type\) \|\| isCrop\(heldItem\.type\)\)\) \{\s*performInteraction\(true\);/);
    const manager = read('src/systems/WorldManager.ts');
    assert.match(manager, /tickFarms\(this\.farmWorld\);/);
    assert.match(manager, /setBlockData\(x: number, y: number, z: number, value: number\): void/);
    assert.match(manager, /clearFarmIndex\(\);/);
    const player = read('src/components/Player.tsx');
    assert.match(player, /fallDistance\.current >= TRAMPLE_FALL && landedBlock === BlockType\.DIRT/);
    const mesher = read('src/systems/world/geometry.ts');
    assert.match(mesher, /isFarmland\(type, cellMeta\) \? 0 : uvVariationMode\(type\)/);
    assert.match(mesher, /for \(const offset of CROP_PLANE_OFFSETS\)/);
    assert.match(read('src/systems/world/fluids.ts'), /if \(isCrop\(target\)\)/);
});
