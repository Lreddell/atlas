import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Pure, enum-free module → safe to import under --experimental-strip-types.
import {
    getMagneticFieldInstanceAt,
    isInMagneticFields,
    getMagneticFieldTier,
    getMagneticFieldTierHeight,
    getArenaCenter,
    MAGNETIC_SPIKE_FALL_MULTIPLIER,
    MF_RADIUS,
    MF_CELL,
    MF_TIER_COUNT,
    MF_SPAWN_CHANCE,
    MAGNETIC_FIELDS_BIOME_ID,
    MAGNETIC_FIELDS_REGION_ID,
    MAGNETIC_WARDEN_BOSS_ID,
} from './magneticFields.ts';

// Anything that touches the BlockType enum is asserted via source text, matching
// the repo convention (see recipes.test.mjs) since enums can't be stripped.
const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const blocksSrc = read('src/data/blocks.ts');
const recipesSrc = read('src/recipes.ts');

const SEED = 1234;

const findInstance = () => {
    for (let cx = 0; cx < 40; cx++) {
        for (let cz = 0; cz < 40; cz++) {
            const inst = getMagneticFieldInstanceAt(cx * MF_CELL, cz * MF_CELL, SEED);
            if (inst) return inst;
        }
    }
    return null;
};

test('Magnetic Fields ids are stable', () => {
    assert.equal(MAGNETIC_FIELDS_BIOME_ID, 'magnetic_fields');
    assert.equal(MAGNETIC_FIELDS_REGION_ID, 'magnetic_fields');
    assert.equal(MAGNETIC_WARDEN_BOSS_ID, 'magnetic_warden');
});

test('instance lookup is deterministic', () => {
    assert.deepEqual(
        getMagneticFieldInstanceAt(5000, -8000, SEED),
        getMagneticFieldInstanceAt(5000, -8000, SEED),
    );
});

test('biome is rare: only a small fraction of cells host an instance', () => {
    let hosts = 0;
    const N = 30;
    for (let cx = 0; cx < N; cx++) {
        for (let cz = 0; cz < N; cz++) {
            const inst = getMagneticFieldInstanceAt(cx * MF_CELL + MF_CELL / 2, cz * MF_CELL + MF_CELL / 2, SEED);
            if (inst && Math.floor(inst.centerX / MF_CELL) === cx && Math.floor(inst.centerZ / MF_CELL) === cz) hosts++;
        }
    }
    const frac = hosts / (N * N);
    assert.ok(frac > 0, 'expected at least one instance in the sampled grid');
    assert.ok(frac < MF_SPAWN_CHANCE + 0.12, `instances too common: ${frac}`);
});

test('biome is large and coherent: one center covers a wide radius', () => {
    const inst = findInstance();
    assert.ok(inst, 'expected to find an instance');
    assert.deepEqual(getMagneticFieldInstanceAt(inst.centerX, inst.centerZ, SEED), inst);
    assert.deepEqual(getMagneticFieldInstanceAt(inst.centerX + MF_RADIUS - 50, inst.centerZ, SEED), inst);
    assert.equal(getMagneticFieldInstanceAt(inst.centerX + MF_RADIUS + 200, inst.centerZ, SEED), null);
    assert.ok(MF_RADIUS >= 500, 'biome should be very large');
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
    const arena = getArenaCenter(inst.centerX + 100, inst.centerZ - 100, SEED);
    assert.ok(arena);
    assert.equal(arena.x, inst.centerX);
    assert.equal(arena.z, inst.centerZ);
    assert.equal(getArenaCenter(inst.centerX + MF_RADIUS + 5000, inst.centerZ, SEED), null);
});

test('isInMagneticFields agrees with instance lookup', () => {
    const inst = findInstance();
    assert.equal(isInMagneticFields(inst.centerX, inst.centerZ, SEED), true);
    assert.equal(isInMagneticFields(inst.centerX + MF_RADIUS + 3000, inst.centerZ, SEED), false);
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
