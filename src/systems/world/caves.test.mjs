import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// caves.ts, genConfig.ts and noise.ts are all enum-free/erasable, so the real
// sampler can run against real noise here. chunkGeneration.ts / blocks.ts /
// ChunkBase.tsx touch the BlockType enum, so their wiring is asserted via source.
import { DEFAULTS } from './genConfig.ts';
import * as caves from './caves.ts';
import { createNoiseSet, hashSeed } from '../../utils/noise.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const chunkGen = read('src/systems/world/baseChunkGeneration.ts');
const biomesSrc = read('src/systems/world/biomes.ts');
const debugScreen = read('src/components/ui/DebugScreen.tsx');
const worldManagerSrc = read('src/systems/WorldManager.ts');
const blocks = read('src/data/blocks.ts');
const types = read('src/types.ts');
const geometry = read('src/systems/world/geometry.ts');
const spriteBlocks = read('src/data/spriteBlocks.ts');
const textures = read('src/utils/textures.ts');
const cutouts = read('src/utils/atlasTileFamilies.ts');
const mapping = read('src/systems/textures/textureMapping.ts');
const chunkBase = read('src/components/ui/ChunkBase.tsx');

const ns = createNoiseSet(hashSeed('cave-test'));
const cfg = DEFAULTS.caves;
const n2 = (x, z) => ns.cave.noise2D(x, z);
const n3 = (x, y, z) => ns.cave.noise3D(x, y, z);
const ox = ns.offsets.cave.x;
const oz = ns.offsets.cave.z;

// Scan a deep slab and return {carved, total} for a given config.
const scan = (c, { surfaceH = 70, yLo = -40, yHi = 55, xN = 220 } = {}) => {
    let carved = 0, total = 0;
    for (let wx = 0; wx < xN; wx++) {
        const isBreach = caves.isBreachColumn(wx + ox, oz, n2, c);
        for (let y = yLo; y <= yHi; y++) {
            const depth = surfaceH - y;
            if (depth <= 0) continue;
            const taper = caves.caveSurfaceTaper(depth, isBreach, c);
            total++;
            if (caves.isCaveCarved(wx + ox, y, oz, depth, taper, n3, c)) carved++;
        }
    }
    return { carved, total };
};

test('the cave sampler carves a realistic minority of deep rock into void', () => {
    const { carved, total } = scan(cfg);
    assert.ok(carved > 0, 'some cells must be carved into caves');
    assert.ok(carved < total, 'caves must not dissolve all the rock');
    assert.ok(carved / total < 0.6, `caves should be a minority of rock, got ${(carved / total).toFixed(2)}`);
});

test('carving tapers to nothing at the surface and opens up with depth', () => {
    assert.equal(caves.caveSurfaceTaper(0, false, cfg), 0);
    assert.equal(caves.caveSurfaceTaper(cfg.surfaceTaperDepth, false, cfg), 1);
    assert.ok(caves.caveSurfaceTaper(cfg.surfaceTaperDepth / 2, false, cfg) > 0);
    // Breach columns keep a carving floor so some caves reach daylight.
    assert.ok(caves.caveSurfaceTaper(1, true, cfg) >= 0.6);

    // Shallow band (depth 1..4) carves far less often than the deep band.
    const near = scan(cfg, { surfaceH: 70, yLo: 66, yHi: 69 });
    const deep = scan(cfg, { surfaceH: 70, yLo: 10, yHi: 40 });
    const nearRate = near.carved / near.total;
    const deepRate = deep.carved / deep.total;
    assert.ok(deepRate > nearRate, `deep rock (${deepRate.toFixed(3)}) must be cavier than the skin (${nearRate.toFixed(3)})`);
});

test('the master toggle and each cave layer switch independently', () => {
    assert.equal(scan({ ...cfg, enabled: false }).carved, 0, 'disabling caves must carve nothing');
    const allLayersOff = { ...cfg, wormEnabled: false, cavernEnabled: false, noodleEnabled: false, deepCheeseEnabled: false };
    assert.equal(scan(allLayersOff).carved, 0, 'with every layer off nothing carves');
    // Turning worm caves off alone reduces (but need not zero) the carve count.
    assert.ok(scan({ ...cfg, wormEnabled: false }).carved < scan(cfg).carved, 'worm caves contribute carving');
});

test('deepslate replaces stone only below its band, hash-blended in between', () => {
    assert.equal(caves.isDeepslateAt(cfg.deepslateFullY - 1, 0.99, cfg), true, 'below the band is always deepslate');
    assert.equal(caves.isDeepslateAt(cfg.deepslateStartY + 1, 0.01, cfg), false, 'above the band is never deepslate');
    // Inside the band a low hash always converts, a high hash near the top does not.
    const midY = Math.round((cfg.deepslateStartY + cfg.deepslateFullY) / 2);
    assert.equal(caves.isDeepslateAt(midY, 0, cfg), true);
    assert.equal(caves.isDeepslateAt(cfg.deepslateStartY - 1, 0.999, cfg), false);
});

test('cave biomes are large, rare, coherent regions (lush + dripstone + plain)', () => {
    // Wide scan: the biomes are big and uncommon now, so sample a large area.
    const seen = new Set();
    let special = 0, total = 0;
    for (let wx = -4000; wx < 4000; wx += 13) {
        for (let wz = -4000; wz < 4000; wz += 13) {
            const b = caves.caveBiomeAt(wx + ox, wz + oz, n2, cfg);
            seen.add(b);
            total++;
            if (b !== 'plain') special++;
        }
    }
    for (const b of seen) assert.ok(['plain', 'lush', 'dripstone'].includes(b), `invalid region ${b}`);
    assert.ok(seen.has('plain'), 'plain regions must exist');
    assert.ok(seen.size >= 2, 'lush and/or dripstone biomes must appear across the sampled area');
    // Rare: special cave biomes are a small minority of the underground.
    assert.ok(special / total < 0.35, `cave biomes should be rare, got ${(special / total).toFixed(2)}`);

    // Coherent + large: neighbouring samples along a line rarely flip biome
    // (small blobs would flip constantly). Count transitions over a 4000-block row.
    let flips = 0, steps = 0;
    let prev = null;
    for (let wx = -2000; wx < 2000; wx += 4) {
        const b = caves.caveBiomeAt(wx + ox, oz, n2, cfg);
        if (prev !== null && b !== prev) flips++;
        prev = b; steps++;
    }
    assert.ok(flips / steps < 0.05, `biomes must be large/coherent, got ${(flips / steps).toFixed(3)} flip rate`);
});

test('GenConfig.caves exposes every carving + decoration knob', () => {
    const expected = [
        'enabled', 'surfaceTaperDepth', 'breachFreq', 'breachThreshold',
        'wormEnabled', 'wormFreq', 'wormThreshold', 'wormYScale',
        'cavernEnabled', 'cavernMinDepth', 'cavernMaskThreshold', 'cavernFreq', 'cavernThreshold',
        'noodleEnabled', 'noodleFreq', 'noodleMaskThreshold', 'noodleThreshold',
        'deepCheeseEnabled', 'deepCheeseMaxY', 'deepCheeseFreq', 'deepCheeseThreshold',
        'lavaLevel', 'deepslateStartY', 'deepslateFullY',
        'decorate', 'lushFreq', 'lushThreshold', 'dripstoneFreq', 'dripstoneThreshold',
        'glowLichenChance', 'mossChance', 'dripstoneChance', 'geodeRarity',
    ];
    for (const k of expected) assert.ok(k in cfg, `caves config missing "${k}"`);
    // deepslate band is well-formed and the lava level sits above the world floor.
    assert.ok(cfg.deepslateFullY < cfg.deepslateStartY);
    assert.ok(cfg.lavaLevel > 0);
});

test('the generator drives caves from config + the shared caves.ts sampler', () => {
    assert.match(chunkGen, /from '\.\/caves'/);
    assert.match(chunkGen, /const caveCfg = GenConfig\.caves/);
    assert.match(chunkGen, /isCaveCarved\(cwx, y, cwz, depth, taper, caveNoise3D, caveCfg\)/);
    // Deep-stone substitution and the decoration + geode passes are wired in.
    assert.match(chunkGen, /isDeepslateAt\(y, seededRand01\(wx, y, wz, 71\), caveCfg\)/);
    assert.match(chunkGen, /BlockType\.DEEPSLATE/);
    assert.match(chunkGen, /Cave decoration pass/);
    assert.match(chunkGen, /BlockType\.POINTED_DRIPSTONE/);
    assert.match(chunkGen, /BlockType\.GLOW_LICHEN/);
    assert.match(chunkGen, /BlockType\.MOSS_BLOCK/);
    assert.match(chunkGen, /Amethyst geodes/);
    assert.match(chunkGen, /BlockType\.BUDDING_AMETHYST/);
    // Ores still host in the deepslate band.
    assert.match(chunkGen, /!== BlockType\.STONE && blocks\[index\] !== BlockType\.DEEPSLATE/);
});

test('the new cave blocks exist and the cross-plane ones are cutouts', () => {
    for (const b of ['DEEPSLATE', 'COBBLED_DEEPSLATE', 'DRIPSTONE_BLOCK', 'POINTED_DRIPSTONE', 'MOSS_BLOCK', 'GLOW_LICHEN', 'AMETHYST_BLOCK', 'BUDDING_AMETHYST', 'AMETHYST_CLUSTER', 'CALCITE']) {
        assert.match(types, new RegExp(`\\b${b}\\s*=\\s*\\d+`), `${b} missing from BlockType`);
        assert.match(blocks, new RegExp(`\\[BlockType\\.${b}\\]:`), `${b} missing a block def`);
    }
    // Deepslate mines into cobbled deepslate (stone → cobblestone parity).
    assert.match(blocks, /BlockType\.DEEPSLATE[\s\S]*?drops:\s*\[\{\s*type:\s*BlockType\.COBBLED_DEEPSLATE/);
    // Budding amethyst can't be harvested; glow lichen + amethyst cluster glow.
    assert.match(blocks, /BlockType\.BUDDING_AMETHYST[\s\S]*?drops:\s*\[\]/);
    assert.match(blocks, /BlockType\.GLOW_LICHEN[\s\S]*?lightLevel:\s*\d+/);
    // The three cross-plane cutouts live in the shared sprite list the mesher
    // builds its cutout/cross tables from.
    assert.ok(geometry.includes('CROSS_RENDERED_BLOCKS'), 'geometry does not consume the shared sprite list');
    for (const b of ['POINTED_DRIPSTONE', 'GLOW_LICHEN', 'AMETHYST_CLUSTER']) {
        assert.ok(spriteBlocks.includes(`BlockType.${b}`), `${b} not registered in the shared sprite list`);
    }
    for (const slot of [220, 222, 225]) assert.match(cutouts, new RegExp(`slot:\\s*${slot}\\b`));
    // Every new tile is painted and has a PNG-override mapping.
    for (let slot = 217; slot <= 226; slot++) {
        assert.match(textures, new RegExp(`withTile\\(${slot},`), `no tile painted for slot ${slot}`);
        assert.match(mapping, new RegExp(`${slot}:\\s*'blocks/`), `no PNG mapping for slot ${slot}`);
    }
});

test('cave biomes are real registered biomes surfaced everywhere', () => {
    // Registered in BIOMES like every surface biome, tagged 'cave'.
    for (const [id, name] of [['caves', 'Caves'], ['lush_caves', 'Lush Caves'], ['dripstone_caves', 'Dripstone Caves']]) {
        assert.match(biomesSrc, new RegExp(`id:\\s*'${id}',\\s*name:\\s*'${name}'`), `${id} biome missing`);
    }
    assert.match(biomesSrc, /tags:\s*\['cave'\]/);
    // A 3D biome lookup resolves the underground cave biome (surface otherwise).
    assert.match(chunkGen, /export function getBiomeAt\(x: number, y: number, z: number/);
    assert.match(chunkGen, /if \(region === 'lush'\) return BIOMES\.LUSH_CAVES/);
    assert.match(chunkGen, /if \(region === 'dripstone'\) return BIOMES\.DRIPSTONE_CAVES/);
    assert.match(chunkGen, /return BIOMES\.CAVES/);
    // The F3 debug screen shows the Y-aware biome (so caves display underground).
    assert.match(debugScreen, /getBiomeAt\(bx, by, bz\)/);
    // /locate finds cave biomes by their region field, not surface climate.
    assert.match(worldManagerSrc, /lush_caves:\s*'lush', dripstone_caves:\s*'dripstone', caves:\s*'plain'/);
    assert.match(worldManagerSrc, /caveBiomeAt\(wx \+ caveOx, wz \+ caveOz, caveNoise2D, GenConfig\.caves\) === caveTarget/);
});

test('the World Editor exposes a CAVES tab and a live cross-section preview', () => {
    // A dedicated CAVES section and tab.
    assert.match(chunkBase, /'noise' \| 'biomes' \| 'terrain' \| 'caves'/);
    assert.match(chunkBase, /setActiveSection\('caves'\)/);
    assert.match(chunkBase, /activeSection === 'caves'/);
    // The cross-section renders from the SAME sampler the generator uses.
    assert.match(chunkBase, /const CaveCrossSection/);
    assert.match(chunkBase, /isCaveCarved\(/);
    assert.match(chunkBase, /caveSurfaceTaper\(/);
    assert.match(chunkBase, /isDeepslateAt\(/);
    assert.match(chunkBase, /<CaveCrossSection/);
    // Every carving + decoration knob is surfaced as an editable field.
    for (const key of ['wormFreq', 'wormThreshold', 'cavernThreshold', 'noodleThreshold', 'deepslateStartY', 'glowLichenChance', 'geodeRarity']) {
        assert.ok(chunkBase.includes(`'${key}'`), `editor missing control for ${key}`);
    }
});
