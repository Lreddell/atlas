import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { worldManager } from '../../systems/WorldManager';
import { textureAtlasManager } from '../../systems/textures/TextureAtlasManager';
import { HORIZON_VIEW_UNIFORM, createHorizonMaterials } from '../../systems/graphics/materials/voxelMaterial';
import { HORIZON_LAND_LAYER, HORIZON_SEA_LAYER, horizonPass } from '../../systems/graphics/horizonPass';
import { chunkCoverage } from '../../systems/world/chunkCoverage';
import { horizonStats, horizonView, type HorizonViewState } from '../../systems/world/horizonView';
import { GeometryArena, WebGLArenaGpu, type ArenaGpu, type ArenaSlot } from '../../systems/world/geometryArena';
import { CHUNK_VERTEX_LAYOUT } from '../../systems/world/regionBatcher';
import {
    HORIZON_OVERLAP_CHUNKS, SECTOR_SIZE, sectorOf, tileKey, tileOrigin, tileSize, tilesOverlap, wantedTiles,
    type HorizonTile, type WantedTile,
} from '../../systems/world/horizon/horizonTiles';
import type { HorizonTileMeshes } from '../../systems/world/horizon/buildHorizonTile';
import type { GeometryAttributes } from '../../systems/world/geometry';
import { CHUNK_SIZE } from '../../constants';

const VERTEX_BYTES = CHUNK_VERTEX_LAYOUT.reduce((sum, a) => sum + a.itemSize * a.componentBytes, 0);

// The horizon: the world past the full chunks out to the Horizon Distance, in
// tiles of simplified terrain (horizon/) that the world workers build, drawn
// in their own pass (horizonPass.ts).
//
// It waits for the full chunks: no tile is asked for until the chunks around
// the player have all streamed in (after loading a world, or a teleport), so
// a world never opens on distant hills over empty ground; then it builds
// nearest first, a tile or two at a time while chunks are still coming in,
// and fades in as a whole once the tiles near the edge are there. As the
// player travels, a tile being replaced (by finer or coarser ones) stays until
// every one of its replacements is in, so the horizon never opens.
//
// Tiles share GPU buffers by sector (geometryArena.ts), a few draw calls for
// the whole horizon, each culled as one.

/** Tile geometry written to the GPU per frame, at most (one tile always goes). */
const UPLOAD_BUDGET_BYTES = 2 * 1024 * 1024;
/** How long the horizon takes to fade in. */
const REVEAL_SECONDS = 1.2;
/** The longest the fade-in waits for the tiles near the edge. */
const REVEAL_WAIT_MS = 4000;
/** A jump of the streaming centre this far (chunks) is a teleport: the horizon waits for the chunks again. */
const TELEPORT_CHUNKS = 6;
/** A sector repacks its buffers once its tiles have held still this long (GeometryArena.repack). */
const REPACK_AFTER_MS = 4000;

interface Sector {
    key: string;
    x: number;
    z: number;
    arenas: { opaque: GeometryArena | null; transparent: GeometryArena | null };
    meshes: { opaque: THREE.Mesh | null; transparent: THREE.Mesh | null };
    tiles: number;
    /** When a tile last came or went (ms). */
    changedAt: number;
}

interface Tile extends HorizonTile {
    key: string;
    sector: Sector;
    slots: { opaque?: ArenaSlot; transparent?: ArenaSlot };
    /** Its index arrays (the rest of its geometry lives only on the GPU), for its sector to repack. */
    indices: { opaque?: Uint16Array | Uint32Array; transparent?: Uint16Array | Uint32Array };
}

interface Ready extends HorizonTile {
    key: string;
    epoch: number;
    meshes: HorizonTileMeshes;
}

type Layer = 'opaque' | 'transparent';
const LAYERS: readonly Layer[] = ['opaque', 'transparent'];

const meshBytes = (mesh: GeometryAttributes | null): number => mesh
    ? mesh.positions.byteLength + mesh.normals.byteLength + mesh.uvs.byteLength + mesh.colors.byteLength + mesh.tiles.byteLength + mesh.indices.byteLength
    : 0;

export const HorizonTerrain: React.FC<{ samples: number }> = ({ samples }) => {
    const gl = useThree((s) => s.gl);
    const scene = useThree((s) => s.scene);
    const camera = useThree((s) => s.camera);
    const materials = useMemo(() => createHorizonMaterials(textureAtlasManager.getTexture()), []);
    const gpu = useMemo<ArenaGpu | null>(() => (gl.capabilities.isWebGL2 ? new WebGLArenaGpu(gl.getContext() as WebGL2RenderingContext) : null), [gl]);
    const drawingSize = useMemo(() => new THREE.Vector2(), []);
    const state = useRef({
        epoch: -1,
        view: null as HorizonViewState | null,
        wanted: [] as WantedTile[],
        wantedKeys: new Set<string>(),
        tiles: new Map<string, Tile>(),
        sectors: new Map<string, Sector>(),
        building: new Set<string>(),
        ready: [] as Ready[],
        dirty: true,
        /** The chunks around the player are all in: tiles may build. */
        open: false,
        openedAt: 0,
        revealStart: -1,
        reveal: 0,
    });

    useEffect(() => {
        const composites = horizonPass.composites;
        scene.add(...composites);
        return () => {
            scene.remove(...composites);
        };
    }, [scene]);

    useEffect(() => horizonView.subscribe(() => { state.current.dirty = true; }), []);

    const removeTile = (key: string) => {
        const s = state.current;
        const tile = s.tiles.get(key);
        if (!tile) return;
        s.tiles.delete(key);
        const sector = tile.sector;
        for (const layer of LAYERS) {
            const slot = tile.slots[layer];
            const arena = sector.arenas[layer];
            if (!slot || !arena) continue;
            arena.remove(slot);
            if (arena.empty) {
                sector.meshes[layer]?.removeFromParent();
                sector.meshes[layer] = null;
                arena.dispose();
                sector.arenas[layer] = null;
            }
        }
        sector.changedAt = performance.now();
        if (--sector.tiles <= 0) s.sectors.delete(sector.key);
    };

    const clearAll = () => {
        const s = state.current;
        for (const key of [...s.tiles.keys()]) removeTile(key);
        s.building.clear();
        s.ready = [];
    };

    useEffect(() => () => {
        clearAll();
        materials.opaque.dispose();
        materials.transparent.dispose();
        horizonPass.active = false;
        horizonPass.dispose();
        HORIZON_VIEW_UNIFORM.value.set(0, 0, -1, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [materials]);

    /** A built tile into its sector's buffers. */
    const addTile = (ready: Ready) => {
        const s = state.current;
        if (!gpu) return;
        const where = sectorOf(ready);
        let sector = s.sectors.get(where.key);
        if (!sector) {
            sector = { key: where.key, x: where.x, z: where.z, arenas: { opaque: null, transparent: null }, meshes: { opaque: null, transparent: null }, tiles: 0, changedAt: 0 };
            s.sectors.set(where.key, sector);
        }
        const origin = tileOrigin(ready.level, ready.tx, ready.tz);
        const tile: Tile = { level: ready.level, tx: ready.tx, tz: ready.tz, key: ready.key, sector, slots: {}, indices: {} };
        for (const layer of LAYERS) {
            const mesh = ready.meshes[layer];
            if (!mesh) continue;
            let arena = sector.arenas[layer];
            if (!arena) {
                // Room for as many tiles like this one as the sector holds (a
                // large tile is a sector of its own), up to eight.
                const fit = Math.min(8, Math.max(1, (SECTOR_SIZE / tileSize(ready.level)) ** 2));
                const vertices = Math.max(fit > 1 ? 8192 : 0, Math.ceil((mesh.positions.length / 3) * fit));
                const indices = Math.max(fit > 1 ? 12288 : 0, Math.ceil(mesh.indices.length * fit));
                arena = new GeometryArena(gpu, CHUNK_VERTEX_LAYOUT, vertices, indices);
                sector.arenas[layer] = arena;
                const object = new THREE.Mesh(arena.geometry, materials[layer]);
                object.name = 'horizon';
                object.position.set(sector.x, 0, sector.z);
                object.matrixAutoUpdate = false;
                object.updateMatrix();
                object.castShadow = object.receiveShadow = false;
                object.layers.set(layer === 'transparent' ? HORIZON_SEA_LAYER : HORIZON_LAND_LAYER);
                horizonPass.scene.add(object);
                object.updateMatrixWorld(true);
                sector.meshes[layer] = object;
            }
            tile.indices[layer] = mesh.indices;
            tile.slots[layer] = arena.add({
                attributes: { position: mesh.positions, normal: mesh.normals, uv: mesh.uvs, color: mesh.colors, atlasTile: mesh.tiles },
                index: mesh.indices,
                offsetX: origin.x - sector.x,
                offsetZ: origin.z - sector.z,
                bounds: mesh.bounds,
            });
        }
        sector.tiles++;
        sector.changedAt = performance.now();
        s.tiles.set(ready.key, tile);
    };

    useFrame(() => {
        const s = state.current;
        const now = performance.now();

        // A new world (or seed): everything built so far is stale.
        const epoch = worldManager.getFarEpoch();
        if (epoch !== s.epoch) {
            clearAll();
            chunkCoverage.clear();
            s.epoch = epoch;
            s.dirty = true;
            s.open = false;
            s.revealStart = -1;
            s.reveal = 0;
        }

        if (s.dirty) {
            s.dirty = false;
            const previous = s.view;
            const view = horizonView.get();
            s.view = view;
            if (view && previous && Math.max(Math.abs(view.cx - previous.cx), Math.abs(view.cz - previous.cz)) > TELEPORT_CHUNKS) {
                // A teleport: the new place's chunks come first, then its horizon.
                s.open = false;
                s.revealStart = -1;
                s.reveal = 0;
                s.ready = [];
            }
            s.wanted = view ? wantedTiles(view.cx, view.cz, view.renderDistance, view.horizon, view.quality) : [];
            s.wantedKeys = new Set(s.wanted.map((t) => tileKey(t.level, t.tx, t.tz)));
            if (view) {
                chunkCoverage.center.set(view.cx, view.cz);
                // The horizon's own depth range: from just inside where the full
                // chunks stop (any fragment it draws is at least that far,
                // straight ahead or at the corner of the widest view), to the horizon.
                const inner = Math.max(CHUNK_SIZE, (view.renderDistance - HORIZON_OVERLAP_CHUNKS) * CHUNK_SIZE - 24);
                horizonPass.near = Math.max(1, inner * 0.4);
                horizonPass.far = (view.horizon + 2) * CHUNK_SIZE * 1.1 + 400;
            }
            // Out of range: gone, unless it still stands in for a wanted tile not built yet.
            const missing = s.wanted.filter((t) => !s.tiles.has(tileKey(t.level, t.tx, t.tz)));
            for (const [key, tile] of [...s.tiles]) {
                if (s.wantedKeys.has(key)) continue;
                if (missing.some((t) => tilesOverlap(t, tile))) continue;
                removeTile(key);
            }
        }
        const view = s.view;

        // Tiles wait for the full chunks around the player.
        if (!s.open && view && view.horizon > view.renderDistance && worldManager.pendingChunkJobs() === 0) {
            s.open = true;
            s.openedAt = now;
        }

        // Built tiles in, a couple of megabytes a frame, then whatever they stood in for.
        let budget = UPLOAD_BUDGET_BYTES;
        while (budget > 0 && s.ready.length > 0) {
            const next = s.ready.shift()!;
            if (next.epoch !== s.epoch || !s.wantedKeys.has(next.key) || s.tiles.has(next.key)) continue;
            budget -= meshBytes(next.meshes.opaque) + meshBytes(next.meshes.transparent);
            addTile(next);
            for (const [key, tile] of [...s.tiles]) {
                if (s.wantedKeys.has(key) || !tilesOverlap(tile, next)) continue;
                const stillNeeded = s.wanted.some((t) => !s.tiles.has(tileKey(t.level, t.tx, t.tz)) && tilesOverlap(t, tile));
                if (!stillNeeded) removeTile(key);
            }
        }

        // In a quiet frame, a sector that has held still gives back its spare room.
        if (budget === UPLOAD_BUDGET_BYTES) {
            for (const sector of s.sectors.values()) {
                if (now - sector.changedAt < REPACK_AFTER_MS) continue;
                if (!LAYERS.some((layer) => sector.arenas[layer]?.slack)) continue;
                for (const layer of LAYERS) {
                    const arena = sector.arenas[layer];
                    if (!arena?.slack) continue;
                    const members: { slot: ArenaSlot; index: ArrayLike<number> }[] = [];
                    for (const tile of s.tiles.values()) {
                        const slot = tile.slots[layer];
                        const index = tile.indices[layer];
                        if (tile.sector === sector && slot && index) members.push({ slot, index });
                    }
                    arena.repack(members);
                }
                break;
            }
        }

        // New requests, nearest first: one at a time while chunks still stream in.
        if (s.open && view) {
            const limit = worldManager.pendingChunkJobs() > 0 ? 1 : Math.max(2, worldManager.workerCount() * 2);
            for (const t of s.wanted) {
                if (s.building.size >= limit) break;
                const key = tileKey(t.level, t.tx, t.tz);
                if (s.tiles.has(key) || s.building.has(key)) continue;
                const epochAtRequest = s.epoch;
                const sent = worldManager.requestHorizonTile(t.level, t.tx, t.tz, (meshes) => {
                    s.building.delete(key);
                    s.ready.push({ key, level: t.level, tx: t.tx, tz: t.tz, epoch: epochAtRequest, meshes });
                });
                if (!sent) break;
                s.building.add(key);
            }
        }

        // It fades in once the tiles near the edge are there (or it has waited long enough).
        if (s.open && view && s.revealStart < 0) {
            const edge = view.renderDistance * CHUNK_SIZE + 256;
            const nearReady = s.wanted.every((t) => t.distance > edge || s.tiles.has(tileKey(t.level, t.tx, t.tz)));
            if ((nearReady && s.tiles.size > 0) || now - s.openedAt > REVEAL_WAIT_MS) s.revealStart = now;
        }
        s.reveal = s.revealStart < 0 ? 0 : Math.min(1, (now - s.revealStart) / (REVEAL_SECONDS * 1000));

        if (view) HORIZON_VIEW_UNIFORM.value.set(view.cx, view.cz, view.horizon * view.horizon, s.reveal);
        horizonPass.active = !!view && view.horizon > view.renderDistance && s.tiles.size > 0 && s.reveal > 0;

        horizonStats.tiles = s.tiles.size;
        horizonStats.wanted = s.wanted.length;
        horizonStats.building = s.building.size;
        horizonStats.sectors = s.sectors.size;
        horizonStats.reveal = s.reveal;
        horizonStats.waiting = !s.open;
        let bytes = 0;
        let usedBytes = 0;
        for (const sector of s.sectors.values()) {
            for (const layer of LAYERS) {
                const stats = sector.arenas[layer]?.stats();
                if (!stats) continue;
                bytes += stats.bytes;
                usedBytes += stats.vertices * VERTEX_BYTES + stats.indices * 4;
            }
        }
        horizonStats.bytes = bytes;
        horizonStats.usedBytes = usedBytes;

        // Drawn before the world's own render, which lays it in (horizonPass.ts).
        gl.getDrawingBufferSize(drawingSize);
        horizonPass.render(gl, camera as THREE.PerspectiveCamera, scene, drawingSize.x, drawingSize.y, samples);
    }, -1);

    return null;
};
