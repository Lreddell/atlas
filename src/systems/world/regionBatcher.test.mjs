import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { loadTs } from './storage/bundleTs.mjs';

globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const mod = await loadTs(`
    export * as THREE from 'three';
    export { RegionBatcher, REGION_CHUNKS, JOIN_BUDGET_BYTES, NEAR_TRANSPARENT_REGIONS, regionOf, BACK_FACE_ORDER, WATER_ORDER } from './src/systems/world/regionBatcher';
    export { RangeAllocator } from './src/systems/world/geometryArena';
`);
const { THREE, RegionBatcher, REGION_CHUNKS, JOIN_BUDGET_BYTES, NEAR_TRANSPARENT_REGIONS, regionOf, BACK_FACE_ORDER, WATER_ORDER, RangeAllocator } = mod;

// The GPU, on the CPU: buffers are byte arrays the batcher writes ranges of.
class FakeGpu {
    constructor() { this.live = new Set(); this.writes = []; }
    create(kind, bytes) { const buffer = { kind, bytes: new Uint8Array(bytes) }; this.live.add(buffer); return buffer; }
    write(kind, buffer, byteOffset, data) {
        assert.ok(this.live.has(buffer), 'writes only to live buffers');
        assert.equal(buffer.kind, kind);
        buffer.bytes.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), byteOffset);
        this.writes.push({ kind, byteOffset, bytes: data.byteLength });
    }
    copy(kind, from, to, bytes, fromOffset = 0, toOffset = 0) { to.bytes.set(from.bytes.subarray(fromOffset, fromOffset + bytes), toOffset); }
    destroy(buffer) { this.live.delete(buffer); }
}
const indicesOf = (geometry) => new Uint32Array(geometry.index.buffer.bytes.buffer).subarray(0, geometry.drawRange.count);
const positionsOf = (geometry) => new Float32Array(geometry.attributes.position.buffer.bytes.buffer);

// A chunk-shaped geometry: one quad at (x, y, z), with every attribute the mesher writes.
const quad = (x = 0, y = 0, z = 0) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([x, y, z, x + 1, y, z, x + 1, y + 1, z, x, y + 1, z]), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Int8Array([0, 0, 127, 0, 0, 0, 127, 0, 0, 0, 127, 0, 0, 0, 127, 0]), 4, true));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(16).fill(255), 4, true));
    geometry.setAttribute('atlasTile', new THREE.BufferAttribute(new Uint16Array([7, 7, 7, 7]), 1));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array([0, 1, 2, 0, 2, 3]), 1));
    return geometry;
};

const candidate = (geometry, water = null, glass = null) => {
    const mesh = new THREE.Mesh(geometry);
    const waterMesh = water ? new THREE.Mesh(water) : null;
    const glassMesh = glass ? new THREE.Mesh(glass) : null;
    return {
        mesh, waterMesh, glassMesh,
        candidate: {
            geometries: { opaque: geometry, cutout: null, transparent: glass, water },
            meshes: { opaque: mesh, cutout: null, transparent: glassMesh, water: waterMesh },
        },
    };
};

const materials = () => ({
    opaque: new THREE.MeshBasicMaterial(),
    cutout: new THREE.MeshBasicMaterial(),
    transparent: new THREE.MeshBasicMaterial({ transparent: true, side: THREE.FrontSide }),
    transparentBack: new THREE.MeshBasicMaterial({ transparent: true, side: THREE.BackSide }),
    water: new THREE.MeshBasicMaterial({ transparent: true, side: THREE.FrontSide }),
    waterBack: new THREE.MeshBasicMaterial({ transparent: true, side: THREE.BackSide }),
    cutoutDepth: new THREE.MeshDepthMaterial(),
});
// A camera far from every region these tests use, unless a test says otherwise.
const FAR = 1e5;
const now = () => performance.now();
const regionMeshes = (root) => root.children.filter(child => child.name === 'chunkRegion');
const setup = () => {
    const batcher = new RegionBatcher();
    const root = new THREE.Group();
    const gpu = new FakeGpu();
    const mats = materials();
    batcher.attach(root, mats, gpu);
    return { batcher, root, gpu, mats };
};

// Ice over water: whichever chunk or region a ray meets them in, all the water
// is drawn before any glass or ice, and every back face before both.
test('water draws before glass and ice, and back faces before both', () => {
    assert.ok(BACK_FACE_ORDER < WATER_ORDER && WATER_ORDER < 0);
    const { batcher, root, mats } = setup();
    const a = candidate(quad(), quad(0, 1, 0), quad(0, 2, 0));
    batcher.offer(0, 0, a.candidate);
    batcher.update(now(), FAR, FAR);
    const order = (material) => regionMeshes(root).find(mesh => mesh.material === material)?.renderOrder;
    assert.equal(order(mats.waterBack), BACK_FACE_ORDER);
    assert.equal(order(mats.transparentBack), BACK_FACE_ORDER);
    assert.equal(order(mats.water), WATER_ORDER);
    assert.equal(order(mats.transparent), 0, 'glass and ice sort with the rest of the scene');
    // Near the camera both hand over to the chunk's own meshes, and back.
    batcher.update(now(), 8, 8);
    assert.equal(a.waterMesh.visible, true);
    assert.equal(a.glassMesh.visible, true);
    // The chunk meshes carry the same orders (ChunkMesh.tsx).
    const chunkMesh = readFileSync(new URL('../../components/ChunkMesh.tsx', import.meta.url), 'utf8');
    assert.match(chunkMesh, /ref=\{waterMeshRef\}[^>]*renderOrder=\{WATER_ORDER\}/);
    assert.match(chunkMesh, /ref=\{waterBackMeshRef\}[^>]*renderOrder=\{BACK_FACE_ORDER\}/);
    assert.match(chunkMesh, /ref=\{transparentBackMeshRef\}[^>]*renderOrder=\{BACK_FACE_ORDER\}/);
    assert.doesNotMatch(chunkMesh, /ref=\{transparentMeshRef\}[^>]*renderOrder/);
});

test('regions group chunks by floor division, negatives included', () => {
    assert.equal(regionOf(0), 0);
    assert.equal(regionOf(REGION_CHUNKS - 1), 0);
    assert.equal(regionOf(REGION_CHUNKS), 1);
    assert.equal(regionOf(-1), -1);
    assert.equal(regionOf(-REGION_CHUNKS), -1);
    assert.equal(regionOf(-REGION_CHUNKS - 1), -2);
});

test('a chunk joins its region on the next frame: moved into region space, its own mesh hidden', () => {
    const { batcher, root } = setup();
    const a = candidate(quad(0, 5, 0));
    const b = candidate(quad(2, 5, 3));
    let disposed = 0;
    a.candidate.geometries.opaque.addEventListener('dispose', () => disposed++);
    batcher.offer(0, 0, a.candidate);
    batcher.offer(1, 2, b.candidate);
    assert.equal(regionMeshes(root).length, 0, 'nothing joins before the frame');
    assert.ok(a.mesh.visible && b.mesh.visible);

    batcher.update(now(), FAR, FAR);
    const [region] = regionMeshes(root);
    assert.ok(region, 'the region mesh exists');
    assert.equal(region.geometry.drawRange.count, 12);
    assert.deepEqual([...indicesOf(region.geometry)], [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7], 'indices rebased onto each chunk\'s vertices');
    assert.deepEqual([...positionsOf(region.geometry).slice(12, 15)], [18, 5, 35], 'the second chunk moved by its offset');
    assert.equal(region.geometry.attributes.color.normalized, true);
    assert.equal(region.geometry.attributes.normal.normalized, true);
    assert.equal(region.geometry.attributes.normal.itemSize, 4);
    const box = region.geometry.boundingBox;
    assert.deepEqual(box.min.toArray(), [-0.5, 4.5, -0.5], 'tight bounds, padded half a block for the wind');
    assert.deepEqual(box.max.toArray(), [19.5, 6.5, 35.5]);
    assert.equal(a.mesh.visible, false);
    assert.equal(b.mesh.visible, false);
    assert.equal(disposed, 1, 'a batched chunk frees its own GPU copy');
    assert.equal(batcher.stats().batchedChunks, 2);
});

test('withdrawing collapses the chunk in place, and the next one reuses its room', () => {
    const { batcher, root, gpu } = setup();
    const a = candidate(quad());
    const b = candidate(quad());
    batcher.offer(0, 0, a.candidate);
    batcher.offer(1, 0, b.candidate);
    batcher.update(now(), FAR, FAR);
    const [region] = regionMeshes(root);
    gpu.writes.length = 0;

    batcher.withdraw(1, 0);
    assert.equal(b.mesh.visible, true, 'its own mesh shows in the same frame');
    assert.equal(a.mesh.visible, false);
    assert.deepEqual([...new Uint32Array(region.geometry.index.buffer.bytes.buffer).slice(0, 6)], [0, 1, 2, 0, 2, 3], 'the others stay');
    assert.deepEqual(gpu.writes, [{ kind: 'index', byteOffset: 24, bytes: 24 }], 'only the withdrawn indices upload, as zeros');
    assert.equal(region.geometry.drawRange.count, 6, 'the draw stops where the rest ends');

    // Its replacement (a block edit's remesh) goes into the same room.
    const c = candidate(quad(3, 0, 0));
    batcher.offer(1, 0, c.candidate);
    batcher.update(now(), FAR, FAR);
    assert.equal(c.mesh.visible, false);
    assert.deepEqual([...indicesOf(region.geometry)], [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    assert.equal(positionsOf(region.geometry)[12], 16 + 3, 'rewritten from the new geometry');

    batcher.withdraw(1, 0);
    batcher.withdraw(0, 0);
    assert.equal(a.mesh.visible, true);
    assert.equal(regionMeshes(root).length, 0, 'an empty region goes away');
    assert.equal(batcher.stats().regions, 0);
    assert.equal(gpu.live.size, 0, 'and frees its buffers');
});

test('full buffers grow on the GPU and hand three fresh attributes', () => {
    const { batcher, root, gpu } = setup();
    const chunks = [];
    for (let i = 0; i < REGION_CHUNKS * REGION_CHUNKS; i++) {
        // A big chunk: many quads, so the region outgrows its first buffers.
        const geometry = quad(i, 0, 0);
        const count = 2000;
        const positions = new Float32Array(count * 12);
        for (let q = 0; q < count; q++) positions.set([i, q, 0, i + 1, q, 0, i + 1, q + 1, 0, i, q + 1, 0], q * 12);
        const index = new Uint32Array(count * 6);
        for (let q = 0; q < count; q++) index.set([0, 1, 2, 0, 2, 3].map((v) => v + q * 4), q * 6);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(count * 16), 4, true));
        geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 8), 2));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(count * 16), 4, true));
        geometry.setAttribute('atlasTile', new THREE.BufferAttribute(new Uint16Array(count * 4), 1));
        geometry.setIndex(new THREE.BufferAttribute(index, 1));
        chunks.push(candidate(geometry));
        batcher.offer(i % REGION_CHUNKS, Math.floor(i / REGION_CHUNKS), chunks[i].candidate);
    }
    batcher.update(now(), FAR, FAR);
    const [region] = regionMeshes(root);
    const firstPosition = region.geometry.attributes.position;
    const firstIndex = region.geometry.index;
    for (let frame = 0; frame < 4; frame++) batcher.update(now(), FAR, FAR);
    assert.equal(batcher.stats().batchedChunks, REGION_CHUNKS * REGION_CHUNKS);
    assert.notEqual(region.geometry.attributes.position, firstPosition, 'a new attribute, so three rebuilds its vertex array');
    assert.notEqual(region.geometry.index, firstIndex);
    assert.ok(!gpu.live.has(firstPosition.buffer), 'the old buffer is freed');
    // What was written before the growth survived it.
    const indices = indicesOf(region.geometry);
    assert.equal(indices.length, REGION_CHUNKS * REGION_CHUNKS * 2000 * 6);
    assert.deepEqual([...indices.slice(0, 6)], [0, 1, 2, 0, 2, 3]);
    assert.equal(positionsOf(region.geometry)[3 * 4 * 1999 + 1], 1999, 'the first chunk\'s last quad kept its place');
});

test('a burst of chunks joins a few a frame', () => {
    const { batcher } = setup();
    const big = () => {
        const geometry = quad();
        const count = Math.ceil(JOIN_BUDGET_BYTES / 2 / (30 * 4 + 24));
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 12), 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(count * 16), 4, true));
        geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 8), 2));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(count * 16), 4, true));
        geometry.setAttribute('atlasTile', new THREE.BufferAttribute(new Uint16Array(count * 4), 1));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(count * 6), 1));
        return candidate(geometry);
    };
    for (let i = 0; i < 6; i++) batcher.offer(i, 0, big().candidate);
    batcher.update(now(), FAR, FAR);
    const first = batcher.stats().batchedChunks;
    assert.ok(first >= 1 && first < 6, `joined ${first} in one frame`);
    for (let frame = 0; frame < 6; frame++) batcher.update(now(), FAR, FAR);
    assert.equal(batcher.stats().batchedChunks, 6);
    assert.equal(batcher.stats().waiting, 0);
});

test('shadow flags follow the setting, and detach hands every chunk back', () => {
    const batcher = new RegionBatcher();
    const root = new THREE.Group();
    const gpu = new FakeGpu();
    batcher.setShadows(true);
    const a = candidate(quad());
    batcher.offer(0, 0, a.candidate);
    batcher.update(now(), FAR, FAR);
    assert.equal(regionMeshes(root).length, 0, 'nothing joins before the batcher is attached');
    batcher.attach(root, materials(), gpu);
    batcher.update(now(), FAR, FAR);
    const [region] = regionMeshes(root);
    assert.equal(region.castShadow, true);
    batcher.setShadows(false);
    assert.equal(region.castShadow, false);
    assert.equal(region.receiveShadow, false);

    batcher.detach();
    assert.equal(a.mesh.visible, true);
    assert.equal(regionMeshes(root).length, 0);
    assert.equal(gpu.live.size, 0);
    batcher.update(now(), FAR, FAR);
    assert.equal(regionMeshes(root).length, 0, 'nothing joins while detached');
});

test('water and glass: the region\'s far away, the chunk meshes near the camera', () => {
    const { batcher, root, mats } = setup();
    const a = candidate(quad(), quad(0, 1, 0));
    batcher.offer(0, 0, a.candidate);
    batcher.update(now(), FAR, FAR);
    const merged = regionMeshes(root).find(mesh => mesh.material === mats.water);
    const back = regionMeshes(root).find(mesh => mesh.material === mats.waterBack);
    assert.ok(merged, 'water joins too');
    assert.ok(back, 'with a back-face pass');
    assert.equal(back.geometry, merged.geometry, 'the two passes share one geometry');
    assert.equal(back.renderOrder, BACK_FACE_ORDER, 'back faces draw before other water');
    assert.equal(merged.renderOrder, WATER_ORDER);
    assert.deepEqual(back.matrix.elements, merged.matrix.elements);
    assert.equal(merged.castShadow, false, 'water casts no shadow');
    assert.equal(merged.visible, true);
    assert.equal(back.visible, true);
    assert.equal(a.waterMesh.visible, false);
    assert.equal(a.mesh.visible, false);

    // The camera walks into the region: the chunk's own water takes over, the solid stays batched.
    batcher.update(now(), 8, 8);
    assert.equal(merged.visible, false);
    assert.equal(back.visible, false);
    assert.equal(a.waterMesh.visible, true);
    assert.equal(a.mesh.visible, false);

    // And one region further than the near band: the region's again.
    const away = (NEAR_TRANSPARENT_REGIONS + 1) * REGION_CHUNKS * 16 + 8;
    batcher.update(now(), away, 8);
    assert.equal(merged.visible, true);
    assert.equal(a.waterMesh.visible, false);

    // Withdrawn: everything of the chunk shows, whatever the distance, and the empty region goes.
    batcher.withdraw(0, 0);
    assert.equal(a.waterMesh.visible, true);
    assert.equal(a.mesh.visible, true);
    assert.equal(back.parent, null, 'the back pass goes with its region');
});

test('ranges are reused first fit, merge with their neighbours, and lower the top', () => {
    const ranges = new RangeAllocator(100);
    assert.equal(ranges.allocate(10), 0);
    assert.equal(ranges.allocate(20), 10);
    assert.equal(ranges.allocate(5), 30);
    assert.equal(ranges.end, 35);
    ranges.release(10, 20);
    assert.equal(ranges.holes, 20);
    assert.equal(ranges.allocate(15), 10, 'the freed run is reused');
    assert.equal(ranges.allocate(8), 35, 'a run too small is skipped');
    ranges.release(0, 10);
    ranges.release(10, 15);
    assert.equal(ranges.holes, 30, 'neighbouring free runs merge');
    assert.equal(ranges.allocate(30), 0);
    ranges.release(35, 8);
    assert.equal(ranges.end, 35, 'a free run at the top lowers it');
    assert.equal(ranges.allocate(70), -1, 'no room: the arena grows instead');
});

test('a region that holds still packs its buffers tight, holes and spare room gone', () => {
    const { batcher, root, gpu } = setup();
    const chunks = [];
    for (let i = 0; i < 6; i++) {
        chunks.push(candidate(quad(i, 0, 0)));
        batcher.offer(i % REGION_CHUNKS, Math.floor(i / REGION_CHUNKS), chunks[i].candidate);
    }
    const t0 = now();
    batcher.update(t0, FAR, FAR);
    // Two leave (block edits elsewhere took them out, say): holes in the middle.
    batcher.withdraw(1, 0);
    batcher.withdraw(3, 0);
    const [region] = regionMeshes(root);
    const before = batcher.stats();
    assert.ok(before.holeBytes > 0);
    batcher.update(t0 + 100, FAR, FAR);
    assert.equal(batcher.stats().bytes, before.bytes, 'nothing repacks while the region is still changing');

    batcher.update(t0 + 1e6, FAR, FAR);
    const after = batcher.stats();
    assert.equal(after.holeBytes, 0, 'the holes are closed');
    assert.ok(after.bytes < before.bytes, 'and the spare room given back');
    assert.equal(region.geometry.drawRange.count, 4 * 6);
    // The four that stayed draw exactly as before, packed from the start.
    assert.deepEqual([...indicesOf(region.geometry)], [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15]);
    const xs = [0, 4, 8, 12].map((v) => positionsOf(region.geometry)[v * 3]);
    assert.deepEqual(xs, [0, 16 * 2 + 2, 4, 16 + 5], 'each chunk kept its own vertices, in region space');
    for (const i of [0, 2, 4, 5]) assert.equal(chunks[i].mesh.visible, false);
    // And a later join and leave still land where the slots now say.
    batcher.withdraw(0, 0);
    assert.deepEqual([...new Uint32Array(region.geometry.index.buffer.bytes.buffer).slice(0, 6)], [0, 0, 0, 0, 0, 0]);
    assert.ok(gpu.live.size > 0);
});
