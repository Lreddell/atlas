import * as THREE from 'three';
import { CHUNK_SIZE } from '../../constants';
import {
    GL_BYTE, GL_FLOAT, GL_UNSIGNED_BYTE, GL_UNSIGNED_SHORT,
    GeometryArena, type ArenaAttributeLayout, type ArenaGpu, type ArenaSlot,
} from './geometryArena';

// Chunk meshes, batched by region.
//
// Every draw call costs the CPU about the same whatever it holds (~10 us in
// Chrome over ANGLE/D3D11, far more than the GPU spends on a chunk), and a
// render distance of 16 draws about a thousand chunk meshes a frame between
// the view and the shadow map. So chunks that have stopped changing are drawn
// by one mesh per region (REGION_CHUNKS x REGION_CHUNKS chunks) and layer, and
// hide their own meshes while the region draws them.
//
// A region's geometry is an arena (geometryArena.ts): a chunk joins by
// writing only its own vertices into free ranges of the region's buffers, and
// leaves (a block edit, a remesh, a fade, unloading) by zeroing its indices,
// so its triangles collapse at once and its own mesh shows again in the same
// frame: there is never a gap or a double. Nothing is ever merged again, so a
// block edit or a chunk streaming in costs one chunk's upload, not a region's.
// Chunks join a few a frame (JOIN_BUDGET_BYTES) so a burst never stalls one,
// and a region that has held still for REPACK_AFTER_MS gives back its spare
// room (GeometryArena.repack), one region a frame.
//
// Water and glass blend without writing depth, so their draw order matters
// where two of them overlap. Chunk meshes are sorted back to front; a region is
// not, inside itself. So near the camera (the camera's region and the ones
// around it) the chunks' own water and glass draw, sorted as ever, and only
// farther out does the region's copy take over, where fog and distance hide
// any overlap. Switching is a visibility flip.
// A region's water, and its glass and ice, are each drawn as two meshes over
// one geometry: every back face first, then the front faces (createVoxelMaterials
// in voxelMaterial.ts explains why), all the water's before any glass or ice.

/**
 * Where see-through faces fall in the draw order (three sorts by renderOrder,
 * then by distance), for chunks and regions alike: every back face first, then
 * all the water, then glass and ice with the rest of the scene's see-through
 * things (0). Water and ice drawn chunk by chunk instead, a ray through ice in
 * one chunk that met the water beneath in the next could have that water
 * blended over the ice: a band of differently tinted ice along each chunk
 * border, widening toward the horizon.
 */
export const BACK_FACE_ORDER = -1;
export const WATER_ORDER = -0.5;

/** Chunks a region spans along x and along z. */
export const REGION_CHUNKS = 4;
/** Chunk geometry written into regions per frame, at most (one chunk always goes, however large). */
export const JOIN_BUDGET_BYTES = 3 * 1024 * 1024;
/** A region repacks its buffers once its chunks have held still this long. */
export const REPACK_AFTER_MS = 3000;
/** Regions this close to the camera's (in regions, either axis) draw their chunks' own water and glass. */
export const NEAR_TRANSPARENT_REGIONS = 1;

export type BatchLayer = 'opaque' | 'cutout' | 'transparent' | 'water';
const LAYERS: readonly BatchLayer[] = ['opaque', 'cutout', 'transparent', 'water'];
/** Layers whose chunk meshes stay hidden (and free their GPU copies) while batched. */
const SOLID_LAYERS: readonly BatchLayer[] = ['opaque', 'cutout'];
/** Water, and glass and ice: drawn by the chunks near the camera, with a back-face pass. */
type SeeThroughLayer = 'transparent' | 'water';
const SEE_THROUGH_LAYERS: readonly SeeThroughLayer[] = ['transparent', 'water'];
const isSeeThrough = (layer: BatchLayer): layer is SeeThroughLayer => layer === 'transparent' || layer === 'water';

/** The chunk mesher's vertex layout (geometry.ts), as region buffers hold it. */
export const CHUNK_VERTEX_LAYOUT: readonly ArenaAttributeLayout[] = [
    { name: 'position', itemSize: 3, glType: GL_FLOAT, componentBytes: 4, normalized: false },
    // Signed bytes, x y z and a pad (geometry.ts).
    { name: 'normal', itemSize: 4, glType: GL_BYTE, componentBytes: 1, normalized: true },
    { name: 'uv', itemSize: 2, glType: GL_FLOAT, componentBytes: 4, normalized: false },
    { name: 'color', itemSize: 4, glType: GL_UNSIGNED_BYTE, componentBytes: 1, normalized: true },
    { name: 'atlasTile', itemSize: 1, glType: GL_UNSIGNED_SHORT, componentBytes: 2, normalized: false },
];
const VERTEX_BYTES = CHUNK_VERTEX_LAYOUT.reduce((sum, a) => sum + a.itemSize * a.componentBytes, 0);

/** What a chunk offers: its geometry per layer, and its own meshes to hide while batched. */
export interface BatchCandidate {
    geometries: Record<BatchLayer, THREE.BufferGeometry | null>;
    meshes: Record<BatchLayer, THREE.Mesh | null>;
}

export interface BatchMaterials {
    opaque: THREE.Material;
    cutout: THREE.Material;
    /** Front faces of merged glass and ice. */
    transparent: THREE.Material;
    /** Their back faces, drawn before every other water, glass and ice (BACK_FACE_ORDER). */
    transparentBack: THREE.Material;
    /** Front faces of merged water. */
    water: THREE.Material;
    /** Its back faces, drawn with the others. */
    waterBack: THREE.Material;
    /** The shadow caster for cutout geometry (alpha-tested, swaying with the wind). */
    cutoutDepth: THREE.Material;
}

interface Region {
    rx: number;
    rz: number;
    /** Chunks offered and still unchanged, drawn by the region or waiting to join it. */
    members: Map<string, BatchCandidate>;
    /** Chunks the region draws: where each layer of theirs sits. */
    drawn: Map<string, { candidate: BatchCandidate; slots: Partial<Record<BatchLayer, ArenaSlot>> }>;
    arenas: Record<BatchLayer, GeometryArena | null>;
    meshes: Record<BatchLayer, THREE.Mesh | null>;
    /** The back-face passes of the see-through layers, sharing their geometry. */
    backs: Record<SeeThroughLayer, THREE.Mesh | null>;
    /** Near the camera: the chunks draw their own water and glass (see above). */
    near: boolean;
    /** When a chunk last joined or left (ms). */
    changedAt: number;
}

export const regionOf = (chunk: number): number => Math.floor(chunk / REGION_CHUNKS);

/**
 * Shows or hides a chunk's mesh, and its chunk group with it: a group whose
 * meshes are all drawn by a region is hidden too, so three's render and
 * shadow walks skip it instead of visiting every mesh inside.
 */
const setChunkMeshVisible = (mesh: THREE.Object3D, visible: boolean): void => {
    mesh.visible = visible;
    const group = mesh.parent;
    if (group && group.type === 'Group') group.visible = group.children.some((child) => child.visible);
};
const regionKey = (rx: number, rz: number) => `${rx},${rz}`;
const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

/** Geometry bytes a chunk writes into its region. */
function candidateBytes(candidate: BatchCandidate): number {
    let bytes = 0;
    for (const layer of LAYERS) {
        const geometry = candidate.geometries[layer];
        if (!geometry?.index) continue;
        bytes += geometry.attributes.position.count * VERTEX_BYTES + geometry.index.count * 4;
    }
    return bytes;
}

/** A chunk geometry's bounds in its own space (the arena pads them for the wind). */
function boundsOf(geometry: THREE.BufferGeometry): number[] {
    const box = geometry.boundingBox;
    if (!box) {
        geometry.computeBoundingBox();
        const b = geometry.boundingBox!;
        return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z];
    }
    // ChunkMesh pads the mesher's box half a block for the wind already.
    return [box.min.x + 0.5, box.min.y + 0.5, box.min.z + 0.5, box.max.x - 0.5, box.max.y - 0.5, box.max.z - 0.5];
}

export class RegionBatcher {
    private regions = new Map<string, Region>();
    private root: THREE.Group | null = null;
    private materials: BatchMaterials | null = null;
    private gpu: ArenaGpu | null = null;
    private shadows = false;
    private cameraRx = Number.NaN;
    private cameraRz = Number.NaN;
    /** Chunks offered and not yet drawn by their region, oldest first. */
    private joining = new Set<string>();

    /** Where region meshes go, what they draw with, and the GPU they write to. Chunks offered before this wait for it. */
    attach(root: THREE.Group, materials: BatchMaterials, gpu: ArenaGpu): void {
        this.root = root;
        this.materials = materials;
        this.gpu = gpu;
    }

    /** Takes every chunk back out and drops the region meshes (the root is going away). */
    detach(): void {
        for (const [key, region] of this.regions) {
            for (const [chunk] of region.drawn) this.withdrawDrawn(region, chunk);
            for (const layer of LAYERS) this.removeLayer(region, layer);
            region.members.clear();
            this.regions.delete(key);
        }
        this.joining.clear();
        this.root = null;
        this.materials = null;
        this.gpu = null;
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

    /** A chunk whose geometry has settled: its region takes it in over the next frames. */
    offer(cx: number, cz: number, candidate: BatchCandidate): void {
        const rx = regionOf(cx);
        const rz = regionOf(cz);
        const key = regionKey(rx, rz);
        let region = this.regions.get(key);
        if (!region) {
            region = {
                rx, rz, members: new Map(), drawn: new Map(),
                arenas: { opaque: null, cutout: null, transparent: null, water: null },
                meshes: { opaque: null, cutout: null, transparent: null, water: null },
                backs: { transparent: null, water: null },
                near: this.isNear(rx, rz),
                changedAt: performance.now(),
            };
            this.regions.set(key, region);
        }
        const chunk = chunkKey(cx, cz);
        region.members.set(chunk, candidate);
        this.joining.delete(chunk);
        this.joining.add(chunk);
    }

    /** A chunk that is about to change: it stops being drawn by its region now and shows its own meshes. */
    withdraw(cx: number, cz: number): void {
        const key = regionKey(regionOf(cx), regionOf(cz));
        const region = this.regions.get(key);
        const chunk = chunkKey(cx, cz);
        this.joining.delete(chunk);
        if (!region) return;
        region.members.delete(chunk);
        if (region.drawn.has(chunk)) this.withdrawDrawn(region, chunk);
        if (region.members.size === 0 && region.drawn.size === 0) {
            for (const layer of LAYERS) this.removeLayer(region, layer);
            this.regions.delete(key);
        }
    }

    /**
     * Once a frame, before rendering: hands water and glass between regions and
     * chunks as the camera moves, and lets waiting chunks join their regions.
     */
    update(nowMs: number, cameraX: number, cameraZ: number): void {
        if (!this.root || !this.materials || !this.gpu) return;
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
        let budget = JOIN_BUDGET_BYTES;
        for (const chunk of this.joining) {
            if (budget <= 0) break;
            this.joining.delete(chunk);
            const [cx, cz] = chunk.split(',').map(Number);
            const region = this.regions.get(regionKey(regionOf(cx), regionOf(cz)));
            const candidate = region?.members.get(chunk);
            if (!region || !candidate || region.drawn.has(chunk)) continue;
            budget -= candidateBytes(candidate);
            this.join(region, chunk, cx, cz, candidate);
            region.changedAt = nowMs;
        }
        // In a quiet frame, one region that has held still gives back its spare room.
        if (budget === JOIN_BUDGET_BYTES) {
            for (const region of this.regions.values()) {
                if (nowMs - region.changedAt < REPACK_AFTER_MS) continue;
                if (!LAYERS.some((layer) => region.arenas[layer]?.slack)) continue;
                this.repack(region);
                break;
            }
        }
    }

    /** Packs a region's arenas tight, each member's slots rewritten in place. */
    private repack(region: Region): void {
        for (const layer of LAYERS) {
            const arena = region.arenas[layer];
            if (!arena?.slack) continue;
            const members: { slot: ArenaSlot; index: ArrayLike<number> }[] = [];
            for (const { candidate, slots } of region.drawn.values()) {
                const slot = slots[layer];
                const index = candidate.geometries[layer]?.index?.array;
                if (slot && index) members.push({ slot, index });
            }
            arena.repack(members);
        }
    }

    /** Batched region meshes and the chunks they stand in for (diagnostics). */
    stats(): { regions: number; regionMeshes: number; batchedChunks: number; waiting: number; triangles: number; bytes: number; holeBytes: number } {
        let regionMeshes = 0;
        let batchedChunks = 0;
        let triangles = 0;
        let bytes = 0;
        let holeBytes = 0;
        for (const region of this.regions.values()) {
            batchedChunks += region.drawn.size;
            for (const layer of SEE_THROUGH_LAYERS) if (region.backs[layer]) regionMeshes++;
            for (const layer of LAYERS) {
                const arena = region.arenas[layer];
                if (!arena) continue;
                regionMeshes++;
                const s = arena.stats();
                triangles += s.indices / 3;
                bytes += s.bytes;
                holeBytes += s.vertexHoles * VERTEX_BYTES + s.indexHoles * 4;
            }
        }
        return { regions: this.regions.size, regionMeshes, batchedChunks, waiting: this.joining.size, triangles, bytes, holeBytes };
    }

    private isNear(rx: number, rz: number): boolean {
        return Math.abs(rx - this.cameraRx) <= NEAR_TRANSPARENT_REGIONS && Math.abs(rz - this.cameraRz) <= NEAR_TRANSPARENT_REGIONS;
    }

    /** Water, glass and ice for a region: its copy when far, the drawn chunks' own when near. */
    private showTransparent(region: Region): void {
        for (const layer of SEE_THROUGH_LAYERS) {
            const merged = region.meshes[layer];
            if (merged) merged.visible = !region.near;
            const back = region.backs[layer];
            if (back) back.visible = !region.near;
            for (const { candidate, slots } of region.drawn.values()) {
                const own = candidate.meshes[layer];
                if (own) setChunkMeshVisible(own, region.near || !slots[layer]);
            }
        }
    }

    /** Writes a chunk's layers into its region and hides its own solid meshes, in the same frame. */
    private join(region: Region, chunk: string, cx: number, cz: number, candidate: BatchCandidate): void {
        const slots: Partial<Record<BatchLayer, ArenaSlot>> = {};
        const offsetX = (cx - region.rx * REGION_CHUNKS) * CHUNK_SIZE;
        const offsetZ = (cz - region.rz * REGION_CHUNKS) * CHUNK_SIZE;
        for (const layer of LAYERS) {
            const geometry = candidate.geometries[layer];
            if (!geometry || !geometry.index || geometry.index.count === 0) continue;
            const arena = this.arenaFor(region, layer, geometry);
            const attributes: Record<string, ArrayBufferView & ArrayLike<number>> = {};
            for (const { name } of CHUNK_VERTEX_LAYOUT) attributes[name] = geometry.attributes[name].array as ArrayBufferView & ArrayLike<number>;
            slots[layer] = arena.add({ attributes, index: geometry.index.array, offsetX, offsetZ, bounds: boundsOf(geometry) });
        }
        region.drawn.set(chunk, { candidate, slots });
        // Solid layers: hidden while the region draws them, their GPU copies
        // freed. Water and glass stay on the GPU, to take over near the camera.
        for (const layer of SOLID_LAYERS) {
            if (!slots[layer]) continue;
            const mesh = candidate.meshes[layer];
            if (mesh) setChunkMeshVisible(mesh, false);
            candidate.geometries[layer]?.dispose();
        }
        this.showTransparent(region);
    }

    /** The region's arena and meshes for a layer, made on first use and sized from the first chunk in it. */
    private arenaFor(region: Region, layer: BatchLayer, first: THREE.BufferGeometry): GeometryArena {
        const existing = region.arenas[layer];
        if (existing) return existing;
        const materials = this.materials!;
        // Room for a few chunks like this one before the first reallocation.
        const vertices = Math.max(4096, first.attributes.position.count * 6);
        const indices = Math.max(6144, first.index!.count * 6);
        const arena = new GeometryArena(this.gpu!, CHUNK_VERTEX_LAYOUT, vertices, indices);
        region.arenas[layer] = arena;
        const mesh = new THREE.Mesh(arena.geometry, materials[layer]);
        mesh.name = 'chunkRegion';
        if (layer === 'cutout') mesh.customDepthMaterial = materials.cutoutDepth;
        mesh.position.set(region.rx * REGION_CHUNKS * CHUNK_SIZE, 0, region.rz * REGION_CHUNKS * CHUNK_SIZE);
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        // Water, glass and ice never cast or catch shadows, as on chunks.
        mesh.castShadow = mesh.receiveShadow = !isSeeThrough(layer) && this.shadows;
        region.meshes[layer] = mesh;
        this.root!.add(mesh);
        mesh.updateMatrixWorld(true);
        if (isSeeThrough(layer)) {
            if (layer === 'water') mesh.renderOrder = WATER_ORDER;
            const back = new THREE.Mesh(arena.geometry, layer === 'water' ? materials.waterBack : materials.transparentBack);
            back.name = 'chunkRegion';
            back.renderOrder = BACK_FACE_ORDER;
            back.matrixAutoUpdate = false;
            back.matrix.copy(mesh.matrix);
            back.castShadow = back.receiveShadow = false;
            region.backs[layer] = back;
            this.root!.add(back);
            back.updateMatrixWorld(true);
        }
        return arena;
    }

    /** Collapses a drawn chunk's triangles in its region and shows its own meshes. */
    private withdrawDrawn(region: Region, chunk: string): void {
        const entry = region.drawn.get(chunk);
        if (!entry) return;
        region.drawn.delete(chunk);
        region.changedAt = performance.now();
        for (const layer of LAYERS) {
            const slot = entry.slots[layer];
            const arena = region.arenas[layer];
            if (slot && arena) {
                arena.remove(slot);
                if (arena.empty) this.removeLayer(region, layer);
            }
            const mesh = entry.candidate.meshes[layer];
            if (mesh) setChunkMeshVisible(mesh, true);
        }
    }

    private removeLayer(region: Region, layer: BatchLayer): void {
        const mesh = region.meshes[layer];
        if (mesh) mesh.removeFromParent();
        region.meshes[layer] = null;
        if (isSeeThrough(layer) && region.backs[layer]) {
            region.backs[layer]!.removeFromParent();
            region.backs[layer] = null;
        }
        region.arenas[layer]?.dispose();
        region.arenas[layer] = null;
    }
}

/** The one batcher the chunk meshes share. */
export const regionBatcher = new RegionBatcher();
