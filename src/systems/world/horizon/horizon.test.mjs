import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { loadTs } from '../storage/bundleTs.mjs';

globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const h = await loadTs(`
    import './src/data/resonantDefinitions';
    export * from './src/systems/world/horizon/horizonTiles';
    export { sampleColumn, rasterizeTrees, SEA_LEVEL } from './src/systems/world/horizon/horizonColumns';
    export { buildHorizonTile } from './src/systems/world/horizon/buildHorizonTile';
    export { reseedGlobalNoise, GlobalNoise } from './src/utils/noise';
    export { generateChunk } from './src/systems/world/baseChunkGeneration';
    export { BlockType } from './src/types';
    export { CROSS_RENDERED_BLOCKS } from './src/data/spriteBlocks';
`);
const { BlockType } = h;

test('tiles cover the ring past the full chunks to the horizon, finest first, never overlapping', () => {
    assert.deepEqual(h.wantedTiles(0, 0, 32, 32, 256), [], 'no horizon within the render distance');
    for (const [cx, cz] of [[0, 0], [37, -12], [-100, 250]]) {
        const tiles = h.wantedTiles(cx, cz, 32, 256, 256);
        assert.ok(tiles.length > 50, `${tiles.length} tiles`);
        for (let i = 1; i < tiles.length; i++) assert.ok(tiles[i].distance >= tiles[i - 1].distance, 'nearest first');
        const x = (cx + 0.5) * 16, z = (cz + 0.5) * 16;
        for (const t of tiles) {
            assert.ok(t.distance <= 257 * 16, 'reaches into the horizon');
            // Single blocks where the full chunks stop, coarser further out.
            if (t.distance < 32 * 16) assert.equal(t.level, 0, `a tile at ${t.distance} is level ${t.level}`);
            const size = h.tileSize(t.level);
            const far = Math.hypot(Math.max(Math.abs(x - t.tx * size), Math.abs(x - (t.tx + 1) * size)), Math.max(Math.abs(z - t.tz * size), Math.abs(z - (t.tz + 1) * size)));
            assert.ok(far >= (32 - h.HORIZON_OVERLAP_CHUNKS) * 16, 'none wholly inside the full chunks');
        }
        for (let a = 0; a < tiles.length; a++) {
            for (let b = a + 1; b < tiles.length; b++) assert.ok(!h.tilesOverlap(tiles[a], tiles[b]), 'no two tiles cover the same ground');
        }
        assert.ok(tiles.some((t) => t.level >= 3), 'far tiles are coarse');
    }
});

// The horizon's columns against the world generator's own chunks: where the
// full chunks stop, the horizon has to go on block for block.
test('level-0 columns match the generated chunks: heights, top blocks, sea and trees', () => {
    h.reseedGlobalNoise(20260930);
    const worldSeed = h.GlobalNoise.seed | 0;
    const skip = new Set([...h.CROSS_RENDERED_BLOCKS, BlockType.CACTUS, BlockType.AIR]);
    const leafOrLog = (t) => /LEAVES|_LOG$|^LOG$/.test(BlockType[t] ?? '');
    let columns = 0, heights = 0, tops = 0, seas = 0, trees = 0, treeColumns = 0;
    for (const [cx, cz] of [[0, 0], [5, -3], [-20, 14], [60, 41], [-75, -90], [120, -33]]) {
        const { blocks } = h.generateChunk(cx, cz);
        const x0 = cx * 16, z0 = cz * 16;
        const sampled = new Map();
        const column = (x, z) => {
            const key = `${x},${z}`;
            if (!sampled.has(key)) sampled.set(key, h.sampleColumn(x, z, h.GlobalNoise));
            return sampled.get(key);
        };
        const treeMap = h.rasterizeTrees(x0, z0, 16, 16, (x, z) => column(x, z).height, h.GlobalNoise, worldSeed);
        for (let lx = 0; lx < 16; lx++) {
            for (let lz = 0; lz < 16; lz++) {
                const at = (y) => blocks[(y + 64) * 256 + lz * 16 + lx];
                let y = 319;
                while (y > -64 && skip.has(at(y))) y--;
                const expected = column(x0 + lx, z0 + lz);
                const tree = treeMap.get(lx * 16 + lz);
                columns++;
                if (leafOrLog(at(y))) {
                    treeColumns++;
                    const top = tree ? Math.max(tree.leafTop, tree.trunkTop) : -Infinity;
                    if (top === y) trees++;
                    continue;
                }
                if (at(y) === BlockType.WATER || at(y) === BlockType.ICE || at(y) === BlockType.LAVA) {
                    if (expected.fluid === at(y) || (at(y) === BlockType.WATER && expected.fluid === BlockType.ICE)) seas++;
                    while (y > -64 && (at(y) === BlockType.WATER || at(y) === BlockType.ICE || skip.has(at(y)))) y--;
                } else seas++;
                if (expected.height === y) heights++;
                if (expected.top === at(y)) tops++;
            }
        }
    }
    const share = (n, of) => n / of;
    assert.ok(share(heights, columns - treeColumns) > 0.97, `heights ${heights}/${columns - treeColumns}`);
    assert.ok(share(tops, columns - treeColumns) > 0.95, `top blocks ${tops}/${columns - treeColumns}`);
    assert.ok(share(seas, columns - treeColumns) > 0.99, `sea ${seas}/${columns - treeColumns}`);
    if (treeColumns > 0) assert.ok(share(trees, treeColumns) > 0.9, `tree tops ${trees}/${treeColumns}`);
});

test('a tile builds the same mesh every time, in its own space, at every level', () => {
    h.reseedGlobalNoise(1337);
    for (const level of [0, 1, 2, 4, 6]) {
        const a = h.buildHorizonTile(level, 3, -2);
        const b = h.buildHorizonTile(level, 3, -2);
        assert.ok(a.opaque, `level ${level} has terrain`);
        assert.deepEqual(a.opaque.positions, b.opaque.positions, 'deterministic');
        const size = h.tileSize(level);
        const [minX, , minZ, maxX, , maxZ] = a.opaque.bounds;
        assert.ok(minX >= 0 && minZ >= 0 && maxX <= size && maxZ <= size, `level ${level} stays inside its tile`);
        assert.equal(a.opaque.indices.length % 6, 0);
    }
});

// Where the full chunks stop, the horizon reaches a pixel under their edge
// (voxelMaterial.ts atlasCoverageAround). The chunks' water has to give way on
// exactly those pixels, or two see-through seas blend over each other there.
test('the chunks\' water gives way to the horizon\'s sea on the pixels the horizon takes', () => {
    const root = path.resolve(import.meta.dirname, '../../../..');
    const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
    const shader = read('src/systems/graphics/materials/voxelMaterial.ts');
    // One coverage rule for both: the horizon draws at or past it, the chunks' water below it.
    assert.match(shader, /if \( atlasDither < float\( atlasCoverageAround\( atlasFarXZ, atlasFarPixel \) \) \/ \$\{FULL_STEP\.toFixed\(1\)\} \) discard;/);
    assert.match(shader, /atlasSeaDither < atlasHorizonView\.w && atlasSeaDither >= atlasSeaStep \) discard;/);
    // The pixel width (a derivative) is taken outside any branch.
    const block = shader.slice(shader.indexOf('#elif defined( ATLAS_VOXEL_TRANSPARENT ) && defined( USE_FOG )'));
    const step = block.indexOf('fwidth( atlasSeaXZ )');
    assert.ok(step > 0 && step < block.indexOf('if ('), 'fwidth before the discard test');
    // Only water and ice, past the horizon's near plane, and nowhere while it draws nothing.
    assert.match(block, /vVoxelClass > 2\.5 && vVoxelClass < 3\.5 \) \|\| \( vVoxelClass > 4\.5 && vVoxelClass < 5\.5/);
    assert.match(block, /vViewPosition\.z > atlasHorizonNear/);
    const pass = read('src/systems/graphics/horizonPass.ts');
    assert.match(pass, /composite\.visible = false;\s*HORIZON_NEAR_UNIFORM\.value = NOWHERE;\s*return;/);

    // The two seas lie on one surface, so both sides judge each pixel at the same spot.
    const geometry = read('src/systems/world/geometry.ts');
    const sourceTop = Number(/fluidLevelHeight = \(level: number\): number => \(level === 0 \? ([\d.]+)/.exec(geometry)[1]);
    assert.equal(h.WATER_SURFACE, h.SEA_LEVEL + sourceTop);
});
