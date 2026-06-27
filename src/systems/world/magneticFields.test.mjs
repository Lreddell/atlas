import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Pure, enum-free modules → safe to import under --experimental-strip-types.
import {
    getMagneticFieldInstanceAt,
    getMagneticFieldColumn,
    isInMagneticFields,
    getMagneticFieldTier,
    getMagneticFieldTierHeight,
    getArenaCenter,
    getActiveCenters,
    getMagnetiteWallPolarity,
    getMagneticFeature,
    magneticFieldsTouchBox,
    MAGNETIC_SPIKE_FALL_MULTIPLIER,
    MF_RADIUS,
    MF_EDGE_AMP,
    MF_TIER_COUNT,
    MF_TIER_HEIGHT,
    MF_ARENA_FLOOR_Y,
    MF_BASE_HEIGHT,
    MAGNETIC_FIELDS_BIOME_ID,
    MAGNETIC_FIELDS_REGION_ID,
    MAGNETIC_WARDEN_BOSS_ID,
} from './magneticFields.ts';
import { SimpleNoise } from '../../utils/noise.ts';

// Anything that touches the BlockType enum is asserted via source text, matching
// the repo convention (see recipes.test.mjs) since enums can't be stripped.
const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const blocksSrc = read('src/data/blocks.ts');
const recipesSrc = read('src/recipes.ts');

const SEED = 1234;
// Real boss-biome noise channel (mirrors createNoiseSet: masterSeed + 800).
const bossNoise = new SimpleNoise(SEED + 800);
const noise2D = (x, z) => bossNoise.noise2D(x, z);

// Scan a wide area to find a concrete active instance + measure rarity.
const scan = () => {
    let inCount = 0;
    let total = 0;
    let firstInstance = null;
    for (let x = -40000; x <= 40000; x += 256) {
        for (let z = -40000; z <= 40000; z += 256) {
            total++;
            const inst = getMagneticFieldInstanceAt(x, z, SEED, noise2D);
            if (inst) {
                inCount++;
                if (!firstInstance) firstInstance = inst;
            }
        }
    }
    return { inCount, total, firstInstance };
};
const SCAN = scan();
const findInstance = () => SCAN.firstInstance;

test('Magnetic Fields ids are stable', () => {
    assert.equal(MAGNETIC_FIELDS_BIOME_ID, 'magnetic_fields');
    assert.equal(MAGNETIC_FIELDS_REGION_ID, 'magnetic_fields');
    assert.equal(MAGNETIC_WARDEN_BOSS_ID, 'magnetic_warden');
});

test('instance lookup is deterministic', () => {
    assert.deepEqual(
        getMagneticFieldInstanceAt(5000, -8000, SEED, noise2D),
        getMagneticFieldInstanceAt(5000, -8000, SEED, noise2D),
    );
});

test('biome is rare: covers a tiny fraction of the world', () => {
    assert.ok(SCAN.inCount > 0, 'expected at least one magnetic-fields column in the scan');
    const coverage = SCAN.inCount / SCAN.total;
    assert.ok(coverage < 0.03, `biome too common: ${coverage}`);
});

test('biome is coherent: one center owns its whole footprint', () => {
    const inst = findInstance();
    assert.ok(inst, 'expected to find an instance');
    // The center column resolves to that same center (coherent, not fragmented).
    assert.deepEqual(getMagneticFieldInstanceAt(inst.centerX, inst.centerZ, SEED, noise2D), inst);
    // Far outside the warped radius there is no instance (bounded region).
    const far = MF_RADIUS * (1 + MF_EDGE_AMP) + 300;
    assert.equal(getMagneticFieldInstanceAt(inst.centerX + far, inst.centerZ, SEED, noise2D), null);
});

test('biome boundary is organic, not a circle', () => {
    const inst = findInstance();
    const boundary = [];
    for (let a = 0; a < 24; a++) {
        const ang = (a / 24) * Math.PI * 2;
        let r = 0;
        // Walk outward until we leave the region; record the first exit radius.
        while (r < MF_RADIUS * (1 + MF_EDGE_AMP) + 100) {
            const x = inst.centerX + Math.cos(ang) * r;
            const z = inst.centerZ + Math.sin(ang) * r;
            if (!isInMagneticFields(x, z, SEED, noise2D)) break;
            r += 4;
        }
        boundary.push(r);
    }
    const spread = Math.max(...boundary) - Math.min(...boundary);
    // A perfect circle would have spread ~0; the noise warp must vary it noticeably.
    assert.ok(spread > 24, `boundary too circular (spread ${spread})`);
});

test('terrain tiers converge inward and are NOT crater-shaped', () => {
    const outerTier = getMagneticFieldTier(MF_RADIUS - 1);
    const innerTier = getMagneticFieldTier(0);
    assert.equal(innerTier, MF_TIER_COUNT - 1);
    assert.ok(innerTier > outerTier, 'inner tier index must exceed outer');
    assert.ok(
        getMagneticFieldTierHeight(innerTier) > getMagneticFieldTierHeight(outerTier),
        'inner shelf must sit higher than outer shelf (convergence, not a bowl)',
    );
    let prev = getMagneticFieldTier(0);
    for (let d = 0; d <= MF_RADIUS; d += 50) {
        const t = getMagneticFieldTier(d);
        assert.ok(t <= prev, 'tier must not rise with distance');
        prev = t;
    }
});

test('exactly one arena center per instance, at the deterministic center', () => {
    const inst = findInstance();
    const arena = getArenaCenter(inst.centerX + 40, inst.centerZ - 40, SEED, noise2D);
    assert.ok(arena);
    assert.equal(arena.x, inst.centerX);
    assert.equal(arena.z, inst.centerZ);
    assert.equal(arena.y, MF_ARENA_FLOOR_Y);
    assert.equal(getArenaCenter(inst.centerX + MF_RADIUS + 5000, inst.centerZ, SEED, noise2D), null);
});

test('per-column terrain: flat arena floor at center, tiered shelves outward, null outside', () => {
    const inst = findInstance();
    // Center column is the arena floor (highest, flat).
    const center = getMagneticFieldColumn(inst.centerX, inst.centerZ, SEED, noise2D);
    assert.ok(center && center.isArena);
    assert.equal(center.surfaceY, MF_ARENA_FLOOR_Y);
    assert.equal(center.tier, MF_TIER_COUNT - 1);

    // Every in-biome column sits near a discrete shelf band (small natural jitter
    // only) and never far below the outer base height (→ stays above sea level).
    let sawLowerTier = false;
    let sawArena = false;
    for (let r = 0; r <= MF_RADIUS; r += 8) {
        const col = getMagneticFieldColumn(inst.centerX + r, inst.centerZ, SEED, noise2D);
        if (!col) continue;
        assert.ok(col.surfaceY >= MF_BASE_HEIGHT - 3, 'no column far below outer base → never underwater');
        if (col.isArena) {
            sawArena = true;
            assert.equal(col.surfaceY, MF_ARENA_FLOOR_Y);
        } else {
            const band = (col.surfaceY - MF_BASE_HEIGHT) - (col.tier * MF_TIER_HEIGHT);
            assert.ok(Math.abs(band) <= 3, `shelf within jitter of its tier band (off by ${band})`);
        }
        if (col.tier < MF_TIER_COUNT - 1) sawLowerTier = true;
    }
    assert.ok(sawArena, 'center resolves to the flat arena plateau');
    assert.ok(sawLowerTier, 'outward columns drop to lower tiers (converging terrain)');

    assert.equal(getMagneticFieldColumn(inst.centerX + MF_RADIUS + 5000, inst.centerZ, SEED, noise2D), null);
});

test('cliff walls are magnetized in clusters, not everywhere', () => {
    let pos = 0, neg = 0, bare = 0;
    for (let x = 0; x < 240; x += 2) {
        for (let z = 0; z < 240; z += 2) {
            const p = getMagnetiteWallPolarity(x, z, SEED);
            if (p === 1) pos++; else if (p === -1) neg++; else bare++;
            assert.ok(p === 0 || p === 1 || p === -1);
        }
    }
    const magnetized = pos + neg;
    const total = magnetized + bare;
    // Some walls magnetized, but most bare (you must wrap around to find a route).
    assert.ok(magnetized > 0 && bare > 0);
    assert.ok(magnetized / total < 0.6, 'most wall area should be bare magnetite');
    assert.ok(pos > 0 && neg > 0, 'both polarities appear');
    // Deterministic.
    assert.equal(getMagnetiteWallPolarity(40, 18, SEED), getMagnetiteWallPolarity(40, 18, SEED));
});

test('magnetic features are deterministic, sparse crystal clusters', () => {
    let crystals = 0;
    let total = 0;
    for (let x = 0; x < 300; x++) {
        for (let z = 0; z < 300; z++) {
            const f = getMagneticFeature(x, z, SEED);
            total++;
            if (f) {
                assert.equal(f.kind, 'crystals'); // spike/spire/launchpad removed for now
                assert.ok(f.polarity === 1 || f.polarity === -1);
                assert.ok(f.count >= 1);
                crystals++;
            }
        }
    }
    assert.deepEqual(getMagneticFeature(13, 24, SEED), getMagneticFeature(13, 24, SEED));
    assert.ok(crystals > 0, 'expected some crystal clusters (the craft resource)');
    assert.ok(crystals / total < 0.05, 'features stay sparse');
});

test('getActiveCenters finds the instance near it and nothing in an empty stub', () => {
    const inst = findInstance();
    const near = getActiveCenters(inst.centerX, inst.centerZ, inst.centerX, inst.centerZ, SEED, noise2D, 80);
    assert.ok(near.some((c) => c.centerX === inst.centerX && c.centerZ === inst.centerZ));
    assert.equal(getActiveCenters(inst.centerX, inst.centerZ, inst.centerX, inst.centerZ, SEED, () => -1, 80).length, 0);
});

test('arena generator is a large composed structure with the required parts', () => {
    const a = read('src/systems/world/magneticArena.ts');
    // Centralized dimensions and a large footprint (~150 across).
    assert.match(a, /ARENA_OUTER_RADIUS\s*=\s*(\d+)/);
    const outer = Number(a.match(/ARENA_OUTER_RADIUS\s*=\s*(\d+)/)[1]);
    assert.ok(outer >= 60, 'arena should be large');
    for (const c of ['ARENA_CENTRAL_RADIUS', 'ARENA_LAVA_INNER_RADIUS', 'ARENA_LAVA_OUTER_RADIUS',
        'ARENA_WALL_HEIGHT', 'ARENA_PILLAR_HEIGHT', 'ARENA_PROTECTED_RADIUS', 'ARENA_FOUNDATION_DEPTH']) {
        assert.match(a, new RegExp(`export const ${c}`));
    }
    // Named sub-builders (deliberate generator, not scattered code).
    for (const b of ['clearArenaAirspace', 'buildProtectedFoundationVolume', 'buildOuterFoundation',
        'buildOuterRim', 'buildOuterTerrace', 'buildLavaMoat', 'buildCentralPlatform',
        'buildMagneticPillarTowers', 'buildShieldCrystalPedestals', 'buildBossSummoner',
        'buildLaunchRoutes']) {
        assert.match(a, new RegExp(`function ${b}`));
    }
    // Materials/landmarks: summoner centred, crystals on towers, lava moat, magnets,
    // brick + chiseled detailing, alternating tower polarity.
    assert.match(a, /MAGNETIC_BOSS_SUMMONER/);
    // Shield-crystal positions are exposed (the crystals themselves are spawned by
    // the summon cutscene, not generated with the arena).
    assert.match(a, /getShieldCrystalPositions/);
    assert.match(a, /BlockType\.LAVA/);
    assert.match(a, /POSITIVE_MAGNET/);
    assert.match(a, /NEGATIVE_MAGNET/);
    assert.match(a, /MAGNETITE_BRICKS/);
    assert.match(a, /CHISELED_MAGNETITE/);
    assert.match(a, /ARENA_PILLAR_COUNT\s*=\s*4/);
    assert.match(a, /arenaPillarPolarity[\s\S]*i % 2 === 0 \? 1 : -1/);
});

test('arena build pass is wired into chunk generation, off natural features', () => {
    const cg = read('src/systems/world/chunkGeneration.ts');
    assert.match(cg, /generateMagneticWardenArena/);
    assert.match(cg, /getActiveCenters/);
    // The generator reserves its volume (no caves) and features skip the structure.
    assert.match(cg, /ARENA_PROTECTED_RADIUS/);
    assert.match(cg, /onArena\(rootWx, rootWz\)/);
});

test('shape detection is data-driven (future-proof), not a hardcoded list', () => {
    // Regression: placed slabs/stairs rendered as full cubes because the type lists
    // were hardcoded. isSlab/isStairs now read each block's `shape` field instead.
    const shapes = read('src/systems/world/blockShapes.ts');
    assert.match(shapes, /isSlab\s*=\s*\(t: BlockType\): boolean =>\s*BLOCKS\[t\]\?\.shape === 'slab'/);
    assert.match(shapes, /isStairs\s*=\s*\(t: BlockType\): boolean =>\s*BLOCKS\[t\]\?\.shape === 'stairs'/);
    assert.doesNotMatch(shapes, /const SLAB_TYPES/);
    // And the magnetite shaped blocks carry the right `shape` so they auto-register.
    assert.match(blocksSrc, /MAGNETITE_SLAB\][^\n]*shape:\s*'slab'/);
    assert.match(blocksSrc, /MAGNETITE_STAIRS\][^\n]*shape:\s*'stairs'/);
    assert.match(blocksSrc, /MAGNETITE_BRICK_SLAB\][^\n]*shape:\s*'slab'/);
    assert.match(blocksSrc, /MAGNETITE_BRICK_STAIRS\][^\n]*shape:\s*'stairs'/);
});

test('arena tweaks: brick towers by default, magnets placed only for a fight', () => {
    const a = read('src/systems/world/magneticArena.ts');
    // The towers are plain brick by default — no magnets baked into the shaft.
    const towers = a.match(/function buildMagneticPillarTowers[\s\S]*?\n}/)[0];
    assert.doesNotMatch(towers, /POSITIVE_MAGNET|NEGATIVE_MAGNET/);
    assert.doesNotMatch(towers, /% 6 === 0/); // no horizontal trim bands breaking the (placed) climb
    // The magnet climb faces are placed per-pillar for a fight and stripped afterwards.
    assert.match(a, /export function placePillarClimbMagnets/);
    assert.match(a, /export function stripArenaClimbMagnets/);
    // The lava-pit pylon builder was removed.
    assert.doesNotMatch(a, /buildMoatPylons/);
    // The central platform floor no longer paints polarity magnets.
    const platform = a.match(/function buildCentralPlatform[\s\S]*?\n}/)[0];
    assert.doesNotMatch(platform, /POSITIVE_MAGNET|NEGATIVE_MAGNET/);
});

test('isInMagneticFields agrees with instance lookup', () => {
    const inst = findInstance();
    assert.equal(isInMagneticFields(inst.centerX, inst.centerZ, SEED, noise2D), true);
    assert.equal(isInMagneticFields(inst.centerX + MF_RADIUS + 3000, inst.centerZ, SEED, noise2D), false);
});

test('chunk-level reject matches whether any center is active near the box', () => {
    const inst = findInstance();
    // Real noise: a 16-block box at an active center is covered.
    assert.equal(magneticFieldsTouchBox(inst.centerX, inst.centerZ, inst.centerX + 16, inst.centerZ + 16, SEED, noise2D), true);
    // Stub where no center ever activates → every box is rejected (distant chunks skip).
    const never = () => -1;
    assert.equal(magneticFieldsTouchBox(inst.centerX, inst.centerZ, inst.centerX + 16, inst.centerZ + 16, SEED, never), false);
});

test('Magnetic Spike fall multiplier is configured and amplifies', () => {
    assert.ok(MAGNETIC_SPIKE_FALL_MULTIPLIER >= 2);
    // Helper returns 1 for normal blocks and the spike multiplier for spikes.
    const fall = read('src/systems/player/fallDamage.ts');
    assert.match(fall, /MAGNETIC_SPIKE[\s\S]*MAGNETIC_SPIKE_FALL_MULTIPLIER/);
    assert.match(fall, /return 1;/);
    // Applied once per landing, multiplying base fall damage in Player.tsx.
    const player = read('src/components/Player.tsx');
    assert.match(player, /getFallDamageMultiplierForLandingBlock\(landedBlock\)/);
});

test('new blocks are defined with the right shape', () => {
    // Magnetite Block: solid opaque (no transparent / noCollision flags).
    assert.match(blocksSrc, /\[BlockType\.MAGNETITE_BLOCK\]:\s*{[^}]*name:\s*'Magnetite Block'/);
    const magLine = blocksSrc.match(/\[BlockType\.MAGNETITE_BLOCK\]:\s*{[^}]*}/)[0];
    assert.ok(!/noCollision/.test(magLine) && !/transparent/.test(magLine));

    // Crystals: cross-plane (transparent + noCollision), self-dropping, natural.
    for (const t of ['POSITIVE_MAGNETITE_CRYSTAL', 'NEGATIVE_MAGNETITE_CRYSTAL']) {
        const line = blocksSrc.match(new RegExp(`\\[BlockType\\.${t}\\]:\\s*{[^}]*}`))[0];
        assert.match(line, /transparent:\s*true/);
        assert.match(line, /noCollision:\s*true/);
        assert.match(line, new RegExp(`drops:\\s*\\[{\\s*type:\\s*BlockType\\.${t}`));
        assert.match(line, /category:\s*'natural'/);
    }

    // Spike: cross-plane render but solid (keeps collision so the player lands).
    const spike = blocksSrc.match(/\[BlockType\.MAGNETIC_SPIKE\]:\s*{[^}]*}/)[0];
    assert.match(spike, /transparent:\s*true/);
    assert.ok(!/noCollision/.test(spike));

    assert.match(blocksSrc, /\[BlockType\.MAGNETIC_BOSS_SUMMONER\]:/);
    assert.match(blocksSrc, /\[BlockType\.MAGNETIC_SHIELD_CRYSTAL\]:/);

    // Contrast decoration blocks: emissive solid accent + bright cross-plane shard.
    const charged = blocksSrc.match(/\[BlockType\.CHARGED_MAGNETITE\]:\s*{[^}]*}/)[0];
    assert.match(charged, /lightLevel:\s*\d/);
    assert.ok(!/noCollision/.test(charged), 'charged magnetite is a solid accent');
    const shard = blocksSrc.match(/\[BlockType\.MAGNETITE_SHARD\]:\s*{[^}]*}/)[0];
    assert.match(shard, /transparent:\s*true/);
    assert.match(shard, /noCollision:\s*true/);
});

test('terrain wiring: edge blend + wall magnets + crystal feature pass', () => {
    const cg = read('src/systems/world/chunkGeneration.ts');
    // Outer apron blends down to ambient terrain (soft shore, no hard ocean wall).
    assert.match(cg, /MF_APRON/);
    assert.match(cg, /computeAmbientTerrainInfo/);
    // Polarity magnets embedded on wall bands.
    assert.match(cg, /getMagnetiteWallPolarity/);
    assert.match(cg, /POSITIVE_MAGNET\s*:\s*BlockType\.NEGATIVE_MAGNET/);
    // Feature pass places the resource crystal clusters.
    assert.match(cg, /getMagneticFeature/);
    assert.match(cg, /POSITIVE_MAGNETITE_CRYSTAL/);

    // Ocean blend: biome water is WATER (soft shore), not a hard lava border.
    const biomes = read('src/systems/world/biomes.ts');
    assert.match(biomes, /MAGNETIC_FIELDS:\s*{[\s\S]*?waterBlock:\s*BlockType\.WATER/);

    // The Charged Magnetite launch-pad bounce was removed.
    const player = read('src/components/Player.tsx');
    assert.doesNotMatch(player, /MAGNETIC_LAUNCH_VELOCITY/);
});

test('magnetite traversal blocks use magnetite user-facing names', () => {
    assert.match(blocksSrc, /\[BlockType\.POSITIVE_MAGNET\]:[^\n]*name:\s*'Positive Magnetite Block'/);
    assert.match(blocksSrc, /\[BlockType\.NEGATIVE_MAGNET\]:[^\n]*name:\s*'Negative Magnetite Block'/);
});

test('Polarity Boots recipe uses two iron ingots and one of each crystal', () => {
    // push(3, [..FE.. , ..FE.. , PC .. NC], BlockType.POLARITY_BOOTS, 1)
    const m = recipesSrc.match(/push\(3,\s*\[([^\]]*)\],\s*BlockType\.POLARITY_BOOTS,\s*1\)/);
    assert.ok(m, 'expected a 3x3 Polarity Boots recipe');
    const cells = m[1];
    assert.equal((cells.match(/\bFE\b/g) || []).length, 2, 'two iron ingots');
    assert.equal((cells.match(/\bPC\b/g) || []).length, 1, 'one positive crystal');
    assert.equal((cells.match(/\bNC\b/g) || []).length, 1, 'one negative crystal');
    assert.match(recipesSrc, /const FE = BlockType\.IRON_INGOT/);
    assert.match(recipesSrc, /const PC = BlockType\.POSITIVE_MAGNETITE_CRYSTAL/);
    assert.match(recipesSrc, /const NC = BlockType\.NEGATIVE_MAGNETITE_CRYSTAL/);
});

test('magnetite block recipes: eight crystals around one iron ingot', () => {
    const pos = recipesSrc.match(/push\(3,\s*\[([^\]]*)\],\s*BlockType\.POSITIVE_MAGNET,\s*1\)/);
    const neg = recipesSrc.match(/push\(3,\s*\[([^\]]*)\],\s*BlockType\.NEGATIVE_MAGNET,\s*1\)/);
    assert.ok(pos && neg, 'expected magnetite block recipes');
    assert.equal((pos[1].match(/\bPC\b/g) || []).length, 8);
    assert.equal((pos[1].match(/\bFE\b/g) || []).length, 1);
    assert.equal((neg[1].match(/\bNC\b/g) || []).length, 8);
    assert.equal((neg[1].match(/\bFE\b/g) || []).length, 1);
});

test('only the crystals are mineable while sealed', () => {
    const src = read('src/systems/world/magneticFieldsBlocks.ts');
    assert.match(src, /POSITIVE_MAGNETITE_CRYSTAL/);
    assert.match(src, /NEGATIVE_MAGNETITE_CRYSTAL/);
    assert.match(src, /MAGNETIC_SHIELD_CRYSTAL/);
    // Exactly the three crystals — the two craftable resource crystals plus the
    // boss shield crystals; no other terrain becomes mineable while sealed.
    const inside = src.match(/new Set\(\[([\s\S]*?)\]\)/)[1];
    assert.equal((inside.match(/BlockType\./g) || []).length, 3);
});

test('Magnetic Fields biome + sealed region are registered', () => {
    const biomes = read('src/systems/world/biomes.ts');
    assert.match(biomes, /MAGNETIC_FIELDS:\s*{[\s\S]*?id:\s*'magnetic_fields'/);
    assert.match(biomes, /isInMagneticFields\(x, z, noiseSet\.seed/);

    const regions = read('src/systems/world/regions.ts');
    assert.match(regions, /magnetic_fields:\s*{[\s\S]*?bossId:\s*'magnetic_warden'[\s\S]*?sealedByDefault:\s*true/);
});

test('sealed-region crystal-mining exception is wired into canEditBlock', () => {
    const wm = read('src/systems/WorldManager.ts');
    assert.match(wm, /MAGNETIC_FIELDS_REGION_ID/);
    assert.match(wm, /SEALED_MINEABLE_BLOCKS\.has/);
});

test('shield crystals are mineable while the region is sealed (so the boss can be beaten)', () => {
    // The Warden's shield crystals must be breakable during the sealed fight,
    // alongside the two craftable resource crystals.
    const blocks = read('src/systems/world/magneticFieldsBlocks.ts');
    assert.match(blocks, /SEALED_MINEABLE_BLOCKS[\s\S]*?MAGNETIC_SHIELD_CRYSTAL/);
    assert.match(blocks, /POSITIVE_MAGNETITE_CRYSTAL/);
    assert.match(blocks, /NEGATIVE_MAGNETITE_CRYSTAL/);
});

test('Magnetic Fields + Magnetic Warden music are wired with on-disk folders', () => {
    const manifest = read('src/systems/sound/soundDefaults.ts');
    assert.match(manifest, /"music\.magnetic_fields":/);
    assert.match(manifest, /"music\.boss_magnetic_warden":/);

    const mc = read('src/systems/sound/MusicController.ts');
    assert.match(mc, /"magnetic_fields":\s*\["music\.magnetic_fields"\]/);
    assert.match(mc, /"BOSS_MAGNETIC":\s*\["music\.boss_magnetic_warden"\]/);
    assert.match(mc, /boss:spawned[\s\S]*?MAGNETIC_WARDEN_BOSS_ID/);

    assert.ok(fs.existsSync(path.join(root, 'public/assets/rvx/sounds/music/magnetic_fields')));
    assert.ok(fs.existsSync(path.join(root, 'public/assets/rvx/sounds/music/boss_magnetic_warden')));
});
