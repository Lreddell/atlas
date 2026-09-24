import * as THREE from 'three';
import { CHUNK_SIZE } from '../../constants';

// Chunk meshes, batched by region.
//
// Every draw call costs the CPU about the same whatever it holds (~10 us in
// Chrome over ANGLE/D3D11, far more than the GPU spends on a chunk), and a
// render distance of 16 draws about a thousand chunk meshes a frame between
// the view and the shadow map. So chunks that have stopped changing are merged
// into one mesh per region (REGION_CHUNKS x REGION_CHUNKS chunks) and layer,
// and hide their own meshes while the region draws them.
//
// A chunk that changes (a block edit, a remesh, a fade, unloading) is withdrawn
// at once: its triangles in the region collapse to nothing with a small index
// upload, and its own mesh shows again in the same frame, so there is never a
// gap or a double. The region is rebuilt without it (or with its new geometry)
// once its members have held still for REBUILD_DEBOUNCE_MS, one region a frame.
//
// Water and glass blend without writing depth, so their draw order matters
// where two of them overlap. Chunk meshes are sorted back to front; a merged
// region is not, inside itself. So near the camera (the camera's region and
// the ones around it) the chunks' own water and glass draw, sorted as ever,
// and only farther out does the region's merged copy take over, where fog and
// distance hide any overlap. Switching is a visibility flip, with no rebuild.
// A region's water is drawn as two meshes over one geometry: every far
// region's back faces first, then the front faces sorted with everything else
// (createSplitTransparentMaterials in voxelMaterial.ts explains why).

/** Chunks a region spans along x and along z. */
export const REGION_CHUNKS = 4;
/** A region is rebuilt once its membership has held still this long. */
export const REBUILD_DEBOUNCE_MS = 1000;
/** Regions this close to the camera's (in regions, either axis) draw their chunks' own water and glass. */
export const NEAR_TRANSPARENT_REGIONS = 1;

export type BatchLayer = 'opaque' | 'cutout' | 'transparent';
const LAYERS: readonly BatchLayer[] = ['opaque', 'cutout', 'transparent'];
/** Layers whose chunk meshes stay hidden (and free their GPU copies) while batched. */
const SOLID_LAYERS: readonly BatchLayer[] = ['opaque', 'cutout'];

/** What a chunk offers: its geometry per layer, and its own meshes to hide while batched. */
export interface BatchCandidate {
    geometries: Record<BatchLayer, THREE.BufferGeometry | null>;
    meshes: Record<BatchLayer, THREE.Mesh | null>;
}

export interface BatchMaterials {
    opaque: THREE.Material;
    cutout: THREE.Material;
    /** Front faces of merged water and glass. */
    transparent: THREE.Material;
    /** Their back faces, drawn before every other water and glass (renderOrder -1). */
    transparentBack: THREE.Material;
    /** The shadow caster for cutout geometry (alpha-tested, swaying with the wind). */
    cutoutDepth: THREE.Material;
}

interface Region {
    rx: number;
    rz: number;
    /** Chunks offered and still unchanged. */
    members: Map<string, BatchCandidate>;
    /** Chunks inside the region's current geometry: their index range per layer. */
    drawn: Map<string, { candidate: BatchCandidate; ranges: Partial<Record<BatchLayer, [number, number]>> }>;
    meshes: Record<BatchLayer, THREE.Mesh | null>;
    /** The back-face pass of the transparent layer, sharing its geometry. */
    transparentBack: THREE.Mesh | null;
    /** When membership last changed (ms), or 0 when the geometry is current. */
    dirtyAt: number;
    /** Near the camera: the chunks draw their own water and glass (see above). */
    near: boolean;
}

export const regionOf = (chunk: number): number => Math.floor(chunk / REGION_CHUNKS);
const regionKey = (rx: number, rz: number) => `${rx},${rz}`;
const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

// Region attributes are dropped from the CPU once uploaded (the chunks keep
// their own copies); only the index array stays, to withdraw chunks in place.
const EMPTY_FLOATS = new Float32Array(0);
function releaseArray(this: THREE.BufferAttribute): void {
    this.array = EMPTY_FLOATS;
}

/** Copies the chunks' geometry for one layer into one region-local geometry, recording each chunk's index range. */
export function mergeRegionLayer(
    parts: ReadonlyArray<{ key: string; geometry: THREE.BufferGeometry; offsetX: number; offsetZ: number }>,
    ranges: Map<string, [number, number]>,
): THREE.BufferGeometry {
    let vertexCount = 0;
    let indexCount = 0;
    for (const part of parts) {
        vertexCount += part.geometry.attributes.position.count;
        indexCount += part.geometry.index ? part.geometry.index.count : 0;
    }
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const colors = new Uint8Array(vertexCount * 4);
    const tiles = new Uint16Array(vertexCount);
    const indices = new Uint32Array(indexCount);
    const bounds = new THREE.Box3();
    const partBounds = new THREE.Box3();

    let vertexBase = 0;
    let indexBase = 0;
    for (const { key, geometry, offsetX, offsetZ } of parts) {
        const count = geometry.attributes.position.count;
        const source = geometry.attributes.position.array as Float32Array;
        positions.set(source, vertexBase * 3);
        if (offsetX !== 0 || offsetZ !== 0) {
            for (let i = vertexBase * 3, end = (vertexBase + count) * 3; i < end; i += 3) {
                positions[i] += offsetX;
                positions[i + 2] += offsetZ;
            }
        }
        normals.set(geometry.attributes.normal.array as Float32Array, vertexBase * 3);
        uvs.set(geometry.attributes.uv.array as Float32Array, vertexBase * 2);
        colors.set(geometry.attributes.color.array as Uint8Array, vertexBase * 4);
        tiles.set(geometry.attributes.atlasTile.array as Uint16Array, vertexBase);
        const index = geometry.index?.array;
        if (index) {
            for (let i = 0; i < index.length; i++) indices[indexBase + i] = index[i] + vertexBase;
            ranges.set(key, [indexBase, index.length]);
            indexBase += index.length;
        }
        // The chunk's bounding sphere (ChunkMesh computes it) is a cheap, safe stand-in for its box.
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();
        const sphere = geometry.boundingSphere!;
        partBounds.min.set(sphere.center.x - sphere.radius + offsetX, sphere.center.y - sphere.radius, sphere.center.z - sphere.radius + offsetZ);
        partBounds.max.set(sphere.center.x + sphere.radius + offsetX, sphere.center.y + sphere.radius, sphere.center.z + sphere.radius + offsetZ);
        bounds.union(partBounds);
        vertexBase += count;
    }

    const merged = new THREE.BufferGeometry();
    const attribute = (array: THREE.TypedArray, itemSize: number, normalized = false) =>
        new THREE.BufferAttribute(array, itemSize, normalized).onUpload(releaseArray);
    merged.setAttribute('position', attribute(positions, 3));
    merged.setAttribute('normal', attribute(normals, 3));
    merged.setAttribute('uv', attribute(uvs, 2));
    merged.setAttribute('color', attribute(colors, 4, true));
    merged.setAttribute('atlasTile', attribute(tiles, 1));
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
    merged.boundingBox = bounds;
    merged.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
    merged.userData.bytes = positions.byteLength + normals.byteLength + uvs.byteLength + colors.byteLength + tiles.byteLength + indices.byteLength;
    return merged;
}

export class RegionBatcher {
    private regions = new Map<string, Region>();
    private root: THREE.Group | null = null;
    private materials: BatchMaterials | null = null;
    private shadows = false;
    private cameraRx = Number.NaN;
    private cameraRz = Number.NaN;

    /** Where region meshes go, and what they draw with. Chunks offered before this wait for it. */
    attach(root: THREE.Group, materials: BatchMaterials): void {
        this.root = root;
        this.materials = materials;
        const now = performance.now();
        for (const region of this.regions.values()) if (region.members.size > 0) region.dirtyAt = region.dirtyAt || now;
    }

    /** Takes every chunk back out and drops the region meshes (the root is going away). */
    detach(): void {
        for (const [key, region] of this.regions) {
            for (const [chunk] of region.drawn) this.withdrawDrawn(region, chunk);
            for (const layer of LAYERS) this.removeLayerMesh(region, layer);
            region.members.clear();
            this.regions.delete(key);
        }
        this.root = null;
        this.materials = null;
    }

    setShadows(enabled: boolean): void {
        this.shadows = enabled;
        for (const region of this.regions.values()) {
            for (const layer of SOLID_LAYERS) {
                const mesh = region.meshes[layer];
                if (mesh) mesh.castShadow = mesh.receiveShadow = enabled;
            }
        }
    }

    /** A chunk whose geometry has settled: the region takes it in at its next rebuild. */
    offer(cx: number, cz: number, candidate: BatchCandidate): void {
        const rx = regionOf(cx);
        const rz = regionOf(cz);
        const key = regionKey(rx, rz);
        let region = this.regions.get(key);
        if (!region) {
            region = {
                rx, rz, members: new Map(), drawn: new Map(),
                meshes: { opaque: null, cutout: null, transparent: null },
                transparentBack: null,
                dirtyAt: 0,
                near: this.isNear(rx, rz),
            };
            this.regions.set(key, region);
        }
        region.members.set(chunkKey(cx, cz), candidate);
        region.dirtyAt = performance.now();
    }

    /** A chunk that is about to change: it stops being drawn by its region now and shows its own meshes. */
    withdraw(cx: number, cz: number): void {
        const key = regionKey(regionOf(cx), regionOf(cz));
        const region = this.regions.get(key);
        if (!region) return;
        const chunk = chunkKey(cx, cz);
        const wasMember = region.members.delete(chunk);
        const wasDrawn = region.drawn.has(chunk);
        if (wasDrawn) this.withdrawDrawn(region, chunk);
        if (wasMember || wasDrawn) region.dirtyAt = performance.now();
        if (region.members.size === 0 && region.drawn.size === 0) {
            for (const layer of LAYERS) this.removeLayerMesh(region, layer);
            this.regions.delete(key);
        }
    }

    /**
     * Once a frame, before rendering: hands water and glass between regions and
     * chunks as the camera moves, and rebuilds at most one settled region.
     */
    update(nowMs: number, cameraX: number, cameraZ: number): void {
        if (!this.root || !this.materials) return;
        const rx = regionOf(Math.floor(cameraX / CHUNK_SIZE));
        const rz = regionOf(Math.floor(cameraZ / CHUNK_SIZE));
        if (rx !== this.cameraRx || rz !== this.cameraRz) {
            this.cameraRx = rx;
            this.cameraRz = rz;
            for (const region of this.regions.values()) {
                const near = this.isNear(region.rx, region.rz);
                if (near === region.near) continue;
                region.near = near;
                this.showTransparent(region);
            }
        }
        let due: Region | null = null;
        for (const region of this.regions.values()) {
            if (region.dirtyAt === 0 || nowMs - region.dirtyAt < REBUILD_DEBOUNCE_MS) continue;
            if (!due || region.dirtyAt < due.dirtyAt) due = region;
        }
        if (due) this.rebuild(due);
    }

    /** Batched region meshes and the chunks they stand in for (diagnostics). */
    stats(): { regions: number; regionMeshes: number; batchedChunks: number; triangles: number; bytes: number } {
        let regionMeshes = 0;
        let batchedChunks = 0;
        let triangles = 0;
        let bytes = 0;
        for (const region of this.regions.values()) {
            batchedChunks += region.drawn.size;
            if (region.transparentBack) regionMeshes++;
            for (const layer of LAYERS) {
                const mesh = region.meshes[layer];
                if (!mesh) continue;
                regionMeshes++;
                triangles += (mesh.geometry.index?.count ?? 0) / 3;
                bytes += mesh.geometry.userData.bytes ?? 0;
            }
        }
        return { regions: this.regions.size, regionMeshes, batchedChunks, triangles, bytes };
    }

    private isNear(rx: number, rz: number): boolean {
        return Math.abs(rx - this.cameraRx) <= NEAR_TRANSPARENT_REGIONS && Math.abs(rz - this.cameraRz) <= NEAR_TRANSPARENT_REGIONS;
    }

    /** Water and glass for a region: its merged copy when far, the drawn chunks' own when near. */
    private showTransparent(region: Region): void {
        const merged = region.meshes.transparent;
        if (merged) merged.visible = !region.near;
        if (region.transparentBack) region.transparentBack.visible = !region.near;
        for (const { candidate } of region.drawn.values()) {
            const own = candidate.meshes.transparent;
            if (own) own.visible = region.near || !merged;
        }
    }

    private rebuild(region: Region): void {
        const materials = this.materials!;
        const nextDrawn: Region['drawn'] = new Map();
        for (const [chunk, candidate] of region.members) nextDrawn.set(chunk, { candidate, ranges: {} });

        for (const layer of LAYERS) {
            const parts: Array<{ key: string; geometry: THREE.BufferGeometry; offsetX: number; offsetZ: number }> = [];
            for (const [chunk, candidate] of region.members) {
                const geometry = candidate.geometries[layer];
                if (!geometry || !geometry.index || geometry.index.count === 0) continue;
                const [cx, cz] = chunk.split(',').map(Number);
                parts.push({
                    key: chunk,
                    geometry,
                    offsetX: (cx - region.rx * REGION_CHUNKS) * CHUNK_SIZE,
                    offsetZ: (cz - region.rz * REGION_CHUNKS) * CHUNK_SIZE,
                });
            }
            if (parts.length === 0) {
                this.removeLayerMesh(region, layer);
                continue;
            }
            const ranges = new Map<string, [number, number]>();
            const geometry = mergeRegionLayer(parts, ranges);
            for (const [chunk, range] of ranges) nextDrawn.get(chunk)!.ranges[layer] = range;

            let mesh = region.meshes[layer];
            if (mesh) {
                mesh.geometry.dispose();
                mesh.geometry = geometry;
                if (layer === 'transparent' && region.transparentBack) region.transparentBack.geometry = geometry;
            } else {
                mesh = new THREE.Mesh(geometry, materials[layer]);
                mesh.name = 'chunkRegion';
                if (layer === 'cutout') mesh.customDepthMaterial = materials.cutoutDepth;
                mesh.position.set(region.rx * REGION_CHUNKS * CHUNK_SIZE, 0, region.rz * REGION_CHUNKS * CHUNK_SIZE);
                mesh.matrixAutoUpdate = false;
                mesh.updateMatrix();
                region.meshes[layer] = mesh;
                this.root!.add(mesh);
                mesh.updateMatrixWorld(true);
                if (layer === 'transparent') {
                    const back = new THREE.Mesh(geometry, materials.transparentBack);
                    back.name = 'chunkRegion';
                    back.renderOrder = -1;
                    back.matrixAutoUpdate = false;
                    back.matrix.copy(mesh.matrix);
                    region.transparentBack = back;
                    this.root!.add(back);
                    back.updateMatrixWorld(true);
                }
            }
            // Water and glass never cast or catch shadows, as on chunks.
            mesh.castShadow = mesh.receiveShadow = layer !== 'transparent' && this.shadows;
        }

        // Swap in the same frame: members now drawn by the region hide their own
        // solid meshes (and free their GPU copies), and nothing is drawn twice.
        // Their water and glass stay on the GPU, to take over when the camera nears.
        for (const { candidate } of nextDrawn.values()) {
            for (const layer of SOLID_LAYERS) {
                const mesh = candidate.meshes[layer];
                if (mesh) mesh.visible = false;
                candidate.geometries[layer]?.dispose();
            }
        }
        region.drawn = nextDrawn;
        region.dirtyAt = 0;
        this.showTransparent(region);
    }

    /** Collapses a drawn chunk's triangles in its region (a small index upload) and shows its own meshes. */
    private withdrawDrawn(region: Region, chunk: string): void {
        const entry = region.drawn.get(chunk);
        if (!entry) return;
        region.drawn.delete(chunk);
        for (const layer of LAYERS) {
            const range = entry.ranges[layer];
            const index = region.meshes[layer]?.geometry.index;
            if (range && index) {
                (index.array as Uint32Array).fill(0, range[0], range[0] + range[1]);
                index.addUpdateRange(range[0], range[1]);
                index.needsUpdate = true;
            }
            const mesh = entry.candidate.meshes[layer];
            if (mesh) mesh.visible = true;
        }
    }

    private removeLayerMesh(region: Region, layer: BatchLayer): void {
        const mesh = region.meshes[layer];
        if (!mesh) return;
        mesh.removeFromParent();
        mesh.geometry.dispose();
        region.meshes[layer] = null;
        if (layer === 'transparent' && region.transparentBack) {
            region.transparentBack.removeFromParent();
            region.transparentBack = null;
        }
    }
}

/** The one batcher the chunk meshes share. */
export const regionBatcher = new RegionBatcher();
