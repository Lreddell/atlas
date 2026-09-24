import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { loadTs } from './storage/bundleTs.mjs';

globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const mod = await loadTs(`
    export * as THREE from 'three';
    export { RegionBatcher, mergeRegionLayer, REGION_CHUNKS, REBUILD_DEBOUNCE_MS, NEAR_TRANSPARENT_REGIONS, regionOf } from './src/systems/world/regionBatcher';
`);
const { THREE, RegionBatcher, mergeRegionLayer, REGION_CHUNKS, REBUILD_DEBOUNCE_MS, NEAR_TRANSPARENT_REGIONS, regionOf } = mod;

// A chunk-shaped geometry: one quad at (x, y, z), with every attribute the mesher writes.
const quad = (x = 0, y = 0, z = 0) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([x, y, z, x + 1, y, z, x + 1, y + 1, z, x, y + 1, z]), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(16).fill(255), 4, true));
    geometry.setAttribute('atlasTile', new THREE.BufferAttribute(new Uint16Array([7, 7, 7, 7]), 1));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array([0, 1, 2, 0, 2, 3]), 1));
    geometry.computeBoundingSphere();
    return geometry;
};

const candidate = (geometry, water = null) => {
    const mesh = new THREE.Mesh(geometry);
    const waterMesh = water ? new THREE.Mesh(water) : null;
    return { mesh, waterMesh, candidate: { geometries: { opaque: geometry, cutout: null, transparent: water }, meshes: { opaque: mesh, cutout: null, transparent: waterMesh } } };
};

const materials = () => ({
    opaque: new THREE.MeshBasicMaterial(),
    cutout: new THREE.MeshBasicMaterial(),
    transparent: new THREE.MeshBasicMaterial({ transparent: true, side: THREE.FrontSide }),
    transparentBack: new THREE.MeshBasicMaterial({ transparent: true, side: THREE.BackSide }),
    cutoutDepth: new THREE.MeshDepthMaterial(),
});
const later = () => performance.now() + REBUILD_DEBOUNCE_MS + 1;
// A camera far from every region these tests use, unless a test says otherwise.
const FAR = 1e5;
const regionMeshes = (root) => root.children.filter(child => child.name === 'chunkRegion');

test('regions group chunks by floor division, negatives included', () => {
    assert.equal(regionOf(0), 0);
    assert.equal(regionOf(REGION_CHUNKS - 1), 0);
    assert.equal(regionOf(REGION_CHUNKS), 1);
    assert.equal(regionOf(-1), -1);
    assert.equal(regionOf(-REGION_CHUNKS), -1);
    assert.equal(regionOf(-REGION_CHUNKS - 1), -2);
});

test('merging offsets each chunk into region space and rebases its indices', () => {
    const ranges = new Map();
    const merged = mergeRegionLayer([
        { key: 'a', geometry: quad(0, 5, 0), offsetX: 0, offsetZ: 0 },
        { key: 'b', geometry: quad(2, 5, 3), offsetX: 16, offsetZ: 32 },
    ], ranges);
    const positions = merged.attributes.position.array;
    assert.deepEqual([...positions.slice(12, 15)], [18, 5, 35], 'second chunk moved by its offset');
    assert.deepEqual([...merged.index.array], [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    assert.deepEqual(ranges.get('a'), [0, 6]);
    assert.deepEqual(ranges.get('b'), [6, 6]);
    assert.deepEqual([...merged.attributes.atlasTile.array], [7, 7, 7, 7, 7, 7, 7, 7]);
    assert.equal(merged.attributes.color.normalized, true);
    const box = merged.boundingBox;
    assert.deepEqual(box.min.toArray(), [-0.5, 4.5, -0.5], 'tight bounds, padded half a block for the wind');
    assert.deepEqual(box.max.toArray(), [19.5, 6.5, 35.5]);
});

test('settled chunks merge after the debounce and hide their own meshes', () => {
    const batcher = new RegionBatcher();
    const root = new THREE.Group();
    batcher.attach(root, materials());
    const a = candidate(quad());
    const b = candidate(quad());
    let disposed = 0;
    a.candidate.geometries.opaque.addEventListener('dispose', () => disposed++);
    batcher.offer(0, 0, a.candidate);
    batcher.offer(1, 0, b.candidate);

    batcher.update(performance.now(), FAR, FAR);
    assert.equal(regionMeshes(root).length, 0, 'nothing merges before the debounce');
    assert.ok(a.mesh.visible && b.mesh.visible);

    batcher.update(later(), FAR, FAR);
    const [region] = regionMeshes(root);
    assert.ok(region, 'the region mesh exists');
    assert.equal(region.geometry.index.count, 12);
    assert.equal(a.mesh.visible, false);
    assert.equal(b.mesh.visible, false);
    assert.equal(disposed, 1, "a batched chunk frees its own GPU copy");
    assert.deepEqual(batcher.stats().batchedChunks, 2);
});

test('withdrawing collapses the chunk in place and shows it again at once', () => {
    const batcher = new RegionBatcher();
    const root = new THREE.Group();
    batcher.attach(root, materials());
    const a = candidate(quad());
    const b = candidate(quad());
    batcher.offer(0, 0, a.candidate);
    batcher.offer(1, 0, b.candidate);
    batcher.update(later(), FAR, FAR);
    const [region] = regionMeshes(root);
    const index = region.geometry.index;
    const before = index.version;

    batcher.withdraw(1, 0);
    assert.equal(b.mesh.visible, true, 'its own mesh shows in the same frame');
    assert.equal(a.mesh.visible, false);
    assert.deepEqual([...index.array.slice(6, 12)], [0, 0, 0, 0, 0, 0], 'its triangles collapse');
    assert.deepEqual([...index.array.slice(0, 6)], [0, 1, 2, 0, 2, 3], 'the others stay');
    assert.ok(index.version > before, 'the index re-uploads');
    assert.deepEqual(index.updateRanges, [{ start: 6, count: 6 }], 'only the withdrawn range');

    batcher.update(later(), FAR, FAR);
    assert.equal(regionMeshes(root)[0].geometry.index.count, 6, 'the rebuild drops it');

    batcher.withdraw(0, 0);
    assert.equal(a.mesh.visible, true);
    assert.equal(regionMeshes(root).length, 0, 'an empty region goes away');
    assert.equal(batcher.stats().regions, 0);
});

test('re-offering new geometry replaces the old one at the next rebuild', () => {
    const batcher = new RegionBatcher();
    const root = new THREE.Group();
    batcher.attach(root, materials());
    const first = candidate(quad(0, 0, 0));
    batcher.offer(-1, -1, first.candidate);
    batcher.update(later(), FAR, FAR);
    const [region] = regionMeshes(root);
    assert.deepEqual(region.position.toArray(), [-REGION_CHUNKS * 16, 0, -REGION_CHUNKS * 16], 'negative regions sit at their corner');

    batcher.withdraw(-1, -1);
    const second = candidate(quad(4, 0, 0));
    batcher.offer(-1, -1, second.candidate);
    batcher.update(later(), FAR, FAR);
    assert.equal(second.mesh.visible, false);
    assert.equal(first.mesh.visible, true, 'the replaced mesh is left to its owner');
    const x = regionMeshes(root)[0].geometry.boundingBox.min.x;
    assert.equal(x, (REGION_CHUNKS - 1) * 16 + 4 - 0.5, 'rebuilt from the new geometry');
});

test('shadow flags follow the setting, and detach hands every chunk back', () => {
    const batcher = new RegionBatcher();
    const root = new THREE.Group();
    batcher.setShadows(true);
    const a = candidate(quad());
    batcher.offer(0, 0, a.candidate);
    batcher.attach(root, materials());
    batcher.update(later(), FAR, FAR);
    const [region] = regionMeshes(root);
    assert.equal(region.castShadow, true);
    batcher.setShadows(false);
    assert.equal(region.castShadow, false);
    assert.equal(region.receiveShadow, false);

    batcher.detach();
    assert.equal(a.mesh.visible, true);
    assert.equal(regionMeshes(root).length, 0);
    batcher.update(later(), FAR, FAR);
    assert.equal(regionMeshes(root).length, 0, 'nothing rebuilds while detached');
});

test('water and glass: merged far away, the chunk meshes near the camera', () => {
    const batcher = new RegionBatcher();
    const root = new THREE.Group();
    batcher.attach(root, materials());
    const a = candidate(quad(), quad(0, 1, 0));
    batcher.offer(0, 0, a.candidate);
    batcher.update(later(), FAR, FAR);
    const merged = regionMeshes(root).find(mesh => mesh.material.transparent && mesh.material.side === THREE.FrontSide);
    const back = regionMeshes(root).find(mesh => mesh.material.side === THREE.BackSide);
    assert.ok(merged, 'water merges too');
    assert.ok(back, 'with a back-face pass');
    assert.equal(back.geometry, merged.geometry, 'the two passes share one geometry');
    assert.equal(back.renderOrder, -1, 'back faces draw before other water');
    assert.deepEqual(back.matrix.elements, merged.matrix.elements);
    assert.equal(merged.castShadow, false, 'water casts no shadow');
    assert.equal(merged.visible, true);
    assert.equal(back.visible, true);
    assert.equal(a.waterMesh.visible, false);
    assert.equal(a.mesh.visible, false);

    // The camera walks into the region: the chunk's own water takes over, the solid stays merged.
    batcher.update(performance.now(), 8, 8);
    assert.equal(merged.visible, false);
    assert.equal(back.visible, false);
    assert.equal(a.waterMesh.visible, true);
    assert.equal(a.mesh.visible, false);

    // And one region further than the near band: merged again.
    const away = (NEAR_TRANSPARENT_REGIONS + 1) * REGION_CHUNKS * 16 + 8;
    batcher.update(performance.now(), away, 8);
    assert.equal(merged.visible, true);
    assert.equal(a.waterMesh.visible, false);

    // Withdrawn: everything of the chunk shows, whatever the distance, and the empty region goes.
    batcher.withdraw(0, 0);
    assert.equal(a.waterMesh.visible, true);
    assert.equal(a.mesh.visible, true);
    assert.equal(back.parent, null, 'the back pass goes with its region');
});

