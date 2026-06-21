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
    MAGNETIC_SPIKE_FALL_MULTIPLIER,
    MF_RADIUS,
    MF_EDGE_AMP,
    MF_TIER_COUNT,
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

    // Every in-biome column sits on a discrete flat shelf height (→ vertical walls
    // between tiers) and never below the outer base height.
    let sawLowerTier = false;
    for (let r = 0; r <= MF_RADIUS; r += 8) {
        const col = getMagneticFieldColumn(inst.centerX + r, inst.centerZ, SEED, noise2D);
        if (!col) continue;
        assert.ok(col.surfaceY >= MF_BASE_HEIGHT, 'no column below outer base → never underwater');
        assert.equal((col.surfaceY - MF_BASE_HEIGHT) % 14, 0, 'shelves are discrete height bands');
        if (col.tier < MF_TIER_COUNT - 1) sawLowerTier = true;
    }
    assert.ok(sawLowerTier, 'outward columns drop to lower tiers (converging terrain)');

    assert.equal(getMagneticFieldColumn(inst.centerX + MF_RADIUS + 5000, inst.centerZ, SEED, noise2D), null);
});

test('isInMagneticFields agrees with instance lookup', () => {
    const inst = findInstance();
    assert.equal(isInMagneticFields(inst.centerX, inst.centerZ, SEED, noise2D), true);
    assert.equal(isInMagneticFields(inst.centerX + MF_RADIUS + 3000, inst.centerZ, SEED, noise2D), false);
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

test('only the two crystals are mineable while sealed', () => {
    const src = read('src/systems/world/magneticFieldsBlocks.ts');
    assert.match(src, /POSITIVE_MAGNETITE_CRYSTAL/);
    assert.match(src, /NEGATIVE_MAGNETITE_CRYSTAL/);
    // Exactly two entries in the set.
    const inside = src.match(/new Set\(\[([\s\S]*?)\]\)/)[1];
    assert.equal((inside.match(/BlockType\./g) || []).length, 2);
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
