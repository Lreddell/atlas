import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../systems/world/storage/bundleTs.mjs';

const { SimpleNoise } = await loadTs(`export { SimpleNoise } from './src/utils/noise';`);

// The Perlin noise as it was written before noise3D was flattened for speed,
// kept here verbatim: world generation calls it for every block, so any change
// in its results would move terrain, caves and ores for every seed.
function referenceNoise(seed) {
    const permutation = new Array(256);
    for (let i = 0; i < 256; i++) permutation[i] = i;
    let currentSeed = seed;
    const random = () => {
        const x = Math.sin(currentSeed++) * 10000;
        return x - Math.floor(x);
    };
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
    }
    const p = new Array(512);
    for (let i = 0; i < 512; i++) p[i] = permutation[i % 256];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (t, a, b) => a + t * (b - a);
    const grad = (hash, x, y, z) => {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    };
    return (x, y, z) => {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);
        const u = fade(x);
        const v = fade(y);
        const w = fade(z);
        const A = p[X] + Y;
        const AA = p[A] + Z;
        const AB = p[A + 1] + Z;
        const B = p[X + 1] + Y;
        const BA = p[B] + Z;
        const BB = p[B + 1] + Z;
        return lerp(w,
            lerp(v, lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)), lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))),
            lerp(v, lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)), lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1))));
    };
}

test('the flattened noise3D gives bit-identical results, so every seed builds the same world', () => {
    for (const seed of [0, 12345, 987654321, 0.5]) {
        const noise = new SimpleNoise(seed);
        const reference = referenceNoise(seed);
        let state = 7;
        const next = () => { state = (Math.imul(state, 1103515245) + 12345) >>> 0; return state / 4294967296; };
        for (let i = 0; i < 20000; i++) {
            // World-scale coordinates, block-scale steps, negatives and integers.
            const x = (next() - 0.5) * (i % 3 === 0 ? 60000 : 900);
            const y = (next() - 0.5) * 800;
            const z = i % 5 === 0 ? Math.round((next() - 0.5) * 300) : (next() - 0.5) * 60000;
            const got = noise.noise3D(x, y, z);
            const want = reference(x, y, z);
            assert.ok(Object.is(got, want), `seed ${seed}: noise3D(${x}, ${y}, ${z}) = ${got}, was ${want}`);
        }
        // noise2D is the z = 0 slice.
        assert.ok(Object.is(noise.noise2D(12.25, -7.5), reference(12.25, -7.5, 0)));
    }
});

test('a noise column samples exactly what noise3D does, down, up and across its cells', () => {
    for (const seed of [0, 12345, 987654321]) {
        const noise = new SimpleNoise(seed);
        const column = noise.column();
        let state = 11;
        const next = () => { state = (Math.imul(state, 1103515245) + 12345) >>> 0; return state / 4294967296; };
        const check = (x, y, z) => {
            const got = column.sample(y);
            const want = noise.noise3D(x, y, z);
            assert.ok(Object.is(got, want), `seed ${seed}: column (${x}, ${z}) at y ${y} = ${got}, noise3D ${want}`);
        };
        for (let c = 0; c < 300; c++) {
            // Column positions the generator uses (block * frequency + offset),
            // whole-number ones (zero x/z offsets and -0 gradients), and far ones.
            const f = [0.005, 0.012, 0.02, 0.05, 0.15, 0.35, 1][c % 7];
            const bx = c % 11 === 0 ? 0 : Math.round((next() - 0.5) * 80000);
            const bz = c % 13 === 0 ? 20 : Math.round((next() - 0.5) * 80000);
            const offset = [0, 99, 123.4, 777][c % 4];
            const x = c % 9 === 0 ? Math.round(bx * f) : bx * f + offset;
            const z = c % 9 === 0 ? Math.round(bz * f) : bz * f + offset;
            column.begin(x, z);
            // Down the column the way the terrain pass walks it, then up it the way
            // the ore pass does, then at random heights.
            for (let by = 320; by >= -64; by--) check(x, by * f * 1.2 + offset, z);
            for (let by = -63; by <= 200; by++) check(x, by * f + offset, z);
            for (let i = 0; i < 40; i++) check(x, (next() - 0.5) * 900, z);
            // Whole numbers, and a hair below them (the rounding case).
            for (const y of [0, -0, 3, -3, -1e-17, -3 - 1e-16, 5 - 1e-15, -2.9999999999999996]) check(x, y, z);
        }
    }
});
