import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

const { buildCloudMap, sampleCloudCover, CLOUD_DEPTH_CELLS } = await loadTs(`
    export * from './src/systems/graphics/cloudMap';
`);

const W = 32;
const H = 24;
/** A map with the cells in `cells` ([x, y] pairs) set. */
const mapOf = (cells) => {
    const cover = new Uint8Array(W * H);
    for (const [x, y] of cells) cover[(((y % H) + H) % H) * W + (((x % W) + W) % W)] = 1;
    return buildCloudMap(W, H, cover);
};
const texel = (map, x, y) => {
    const i = ((((y % H) + H) % H) * W + (((x % W) + W) % W)) * 4;
    return { cloud: map.rgba[i], depth: map.rgba[i + 1], b: map.rgba[i + 2], a: map.rgba[i + 3] };
};
const square = (x0, y0, size) => {
    const cells = [];
    for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) cells.push([x, y]);
    return cells;
};

test('the cover channel is exactly the input', () => {
    const map = mapOf([[3, 4], [10, 11]]);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const on = (x === 3 && y === 4) || (x === 10 && y === 11);
            assert.equal(texel(map, x, y).cloud, on ? 255 : 0);
            assert.equal(texel(map, x, y).b, 0);
            assert.equal(texel(map, x, y).a, 255);
        }
    }
});

test('a cloud is darkest in its middle, and a small cloud is all rim', () => {
    const lone = mapOf([[5, 5]]);
    assert.equal(texel(lone, 5, 5).depth, 0, 'a one-cell cloud is rim');
    const big = mapOf(square(4, 4, 11)); // cells 4..14, middle at 9
    assert.equal(texel(big, 4, 9).depth, 0, 'its rim');
    assert.equal(texel(big, 5, 9).depth, Math.round(255 / CLOUD_DEPTH_CELLS), 'one cell in');
    assert.equal(texel(big, 9, 9).depth, 255, 'its middle');
    // Deeper never reads shallower along a line into the cloud.
    for (let x = 4; x < 9; x++) assert.ok(texel(big, x + 1, 9).depth >= texel(big, x, 9).depth);
    assert.equal(texel(big, 2, 9).depth, 0, 'clear sky has no depth');
});

test('the map wraps: a cloud across its edge matches one inside it', () => {
    const inside = mapOf(square(10, 8, 7));
    const across = mapOf(square(W - 3, H - 2, 7)); // straddles both edges
    for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 7; dx++) {
            assert.deepEqual(texel(across, W - 3 + dx, H - 2 + dy), texel(inside, 10 + dx, 8 + dy));
        }
    }
});

test('an overcast sky is all middle', () => {
    const solid = buildCloudMap(W, H, new Uint8Array(W * H).fill(1));
    assert.equal(texel(solid, 0, 0).cloud, 255);
    assert.equal(texel(solid, 0, 0).depth, 255);
});

test('sampling blends linearly between cell centres and wraps', () => {
    const lone = mapOf([[5, 5]]);
    // Even a one-cell cloud shades fully under its middle, half at its edge.
    assert.equal(sampleCloudCover(lone, 5.5, 5.5), 1);
    assert.equal(sampleCloudCover(lone, 6, 5.5), 0.5);
    assert.equal(sampleCloudCover(lone, 6.5, 5.5), 0);
    const map = mapOf(square(4, 4, 6));
    const at = (x, y) => texel(map, x, y).cloud / 255;
    assert.ok(Math.abs(sampleCloudCover(map, 3.75, 6.5) - (0.75 * at(3, 6) + 0.25 * at(4, 6))) < 1e-9);
    assert.equal(sampleCloudCover(map, 6.5 + W, 6.5 - H), 1, 'a whole map away is the same');
    assert.ok(Math.abs(sampleCloudCover(map, 4, 4) - 0.25) < 1e-9, 'a cloud corner');
});
