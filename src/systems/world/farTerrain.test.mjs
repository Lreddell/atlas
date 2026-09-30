import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadTs } from './storage/bundleTs.mjs';

globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const far = await loadTs(`
    import './src/data/resonantDefinitions';
    export * from './src/systems/world/farTerrain';
    export { reseedGlobalNoise, GlobalNoise } from './src/utils/noise';
    export { getTerrainHeight } from './src/systems/world/baseChunkGeneration';
    export { getBiome } from './src/systems/world/biomes';
    export { BlockType } from './src/types';
`);
const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const chunkDist = (t, cx, cz) => {
    // The nearest chunk of a tile to the centre chunk.
    const n = far.FAR_LEVELS[t.level].tileChunks;
    const x = Math.max(t.tx * n, Math.min(cx, t.tx * n + n - 1));
    const z = Math.max(t.tz * n, Math.min(cz, t.tz * n + n - 1));
    return Math.hypot(x - cx, z - cz);
};

test('full chunks stop at 32; render distances reach 128', () => {
    assert.equal(far.FULL_DETAIL_MAX, 32);
    assert.equal(far.MAX_RENDER_DISTANCE, 128);
    assert.deepEqual(far.desiredFarTiles(0, 0, 24, 24), [], 'no far terrain within full detail');
    assert.deepEqual(far.desiredFarTiles(5, -3, 32, 32), []);
});

test('far tiles cover the ring past full detail out to the render distance, nearest first', () => {
    for (const [cx, cz] of [[0, 0], [37, -12], [-100, 250]]) {
        const tiles = far.desiredFarTiles(cx, cz, 32, 96);
        assert.ok(tiles.length > 50);
        for (let i = 1; i < tiles.length; i++) assert.ok(tiles[i].d >= tiles[i - 1].d, 'sorted by distance');
        for (const t of tiles) {
            assert.ok(chunkDist(t, cx, cz) <= 96, 'reaches into the render distance');
            // Near tiles are the finer level, far ones the coarser.
            assert.equal(t.level, t.d <= far.FAR_NEAR_LEVEL_CHUNKS + far.FAR_LEVELS[0].tileChunks ? t.level : 1);
        }
        // No two tiles cover the same ground.
        for (const a of tiles) for (const b of tiles) {
            if (a === b) continue;
            if (a.level === b.level) assert.ok(a.tx !== b.tx || a.tz !== b.tz);
            else {
                const [f, c] = a.level === 0 ? [a, b] : [b, a];
                assert.ok(Math.floor(f.tx / 2) !== c.tx || Math.floor(f.tz / 2) !== c.tz, 'levels never overlap');
            }
        }
    }
});

test('a far tile is deterministic and sits on the terrain the generator makes', () => {
    far.reseedGlobalNoise(1337);
    const a = far.buildFarTile(0, 2, -1);
    const b = far.buildFarTile(0, 2, -1);
    assert.deepEqual(a.positions, b.positions);
    assert.ok(a.indices.length > 0 && a.indices.length % 6 === 0);
    assert.ok(a.bounds[0] >= 0 && a.bounds[3] <= 8 * 16, 'tile-local x');
    // Land cells without trees stand at the generator's terrain height.
    const origin = far.farTileOrigin(0, 2, -1);
    let checked = 0;
    for (let i = 0; i < 32; i += 5) {
        for (let j = 0; j < 32; j += 5) {
            const x0 = origin.x + i * 4, z0 = origin.z + j * 4;
            const cell = far.sampleFarCell(x0, z0, 4, far.GlobalNoise.seed | 0);
            const h = far.getTerrainHeight(x0 + 2, z0 + 2);
            if (h < 63) {
                assert.equal(cell.top, 63, 'the sea surface');
                continue;
            }
            if (/LEAVES/.test(far.BlockType[cell.type])) {
                assert.ok(cell.top > h, 'canopy stands above the ground');
                continue;
            }
            assert.equal(cell.top, h);
            checked++;
        }
    }
    assert.ok(checked > 0);
});

// Where full chunks draw, far terrain stands aside, measured per chunk as the
// streaming measures it; and its water reflects like near water, or the sea
// changes look in a ring where full chunks stop.
test('the far material cuts away inside full detail and reflects its water', () => {
    const material = read('src/systems/graphics/materials/voxelMaterial.ts');
    assert.match(material, /vec2 atlasFarChunk = floor\( \( cameraPosition\.xz \+ vAtlasFogOffset\.xz \) \/ 16\.0 \) - atlasFarView\.xy;/);
    assert.match(material, /if \( atlasFarDistSq <= atlasFarView\.z \|\| atlasFarDistSq > atlasFarView\.w \) discard;/);
    assert.match(material, /#if \( defined\( ATLAS_VOXEL_TRANSPARENT \) \|\| defined\( ATLAS_FAR_TERRAIN \) \) && defined\( USE_FOG \)/);
    const app = read('src/App.tsx');
    assert.match(app, /const fullDetailDistance = Math\.min\(renderDistance, FULL_DETAIL_MAX\);/);
    assert.match(app, /buildChunkOffsets\(fullDetailDistance\)/);
    assert.match(app, /farView\.set\(\{ cx, cz, fullDetail: fullDetailDistance, renderDistance \}\);/);
    // App's chunk offsets and the far-terrain cut agree: d^2 <= r^2 both ways.
    assert.match(app, /if \(d > r \* r\) continue;/);
});
