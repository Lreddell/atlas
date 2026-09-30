import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { worldManager } from '../../systems/WorldManager';
import { textureAtlasManager } from '../../systems/textures/TextureAtlasManager';
import { FAR_VIEW_UNIFORM, createFarTerrainMaterial } from '../../systems/graphics/materials/voxelMaterial';
import { desiredFarTiles, farTileKey, farTileOrigin, type FarTileKey } from '../../systems/world/farTerrain';
import { farView, type FarViewState } from '../../systems/world/farView';
import type { GeometryAttributes } from '../../systems/world/geometry';

// The world past the full-detail chunks, out to the render distance: tiles of
// far terrain (farTerrain.ts), built by the world workers once the chunks near
// the player are in, and drawn with the chunks' own solid material, cut away
// wherever full chunks draw. A tile being replaced (by the other level as the
// player travels) stays until its replacement is in, so the horizon never
// opens.

/** Tiles built into meshes per frame, so their uploads spread out. */
const BUILDS_PER_FRAME = 2;
/** Tiles being built at once: fewer while full chunks are still streaming in. */
const IN_FLIGHT_BUSY = 2;
const IN_FLIGHT_IDLE = 8;

interface Tile extends FarTileKey {
    mesh: THREE.Mesh;
}

interface Ready extends FarTileKey {
    key: string;
    epoch: number;
    geometry: GeometryAttributes;
}

// Tile arrays are dropped from the CPU once uploaded: far tiles never rebuild from them.
const EMPTY_ARRAY = new Float32Array(0);
function releaseArray(this: THREE.BufferAttribute): void {
    this.array = EMPTY_ARRAY;
}

function tileGeometry(data: GeometryAttributes): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const attribute = (array: THREE.TypedArray, itemSize: number, normalized = false) =>
        new THREE.BufferAttribute(array, itemSize, normalized).onUpload(releaseArray);
    geometry.setAttribute('position', attribute(data.positions, 3));
    geometry.setAttribute('normal', attribute(data.normals, 4, true));
    geometry.setAttribute('uv', attribute(data.uvs, 2));
    geometry.setAttribute('color', attribute(data.colors, 4, true));
    geometry.setAttribute('atlasTile', attribute(data.tiles, 1));
    geometry.setIndex(attribute(data.indices, 1));
    const [minX, minY, minZ, maxX, maxY, maxZ] = data.bounds ?? [0, 0, 0, 0, 0, 0];
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    return geometry;
}

/** Whether tiles a and b (either level) cover any of the same ground. */
function overlaps(a: FarTileKey, b: FarTileKey): boolean {
    if (a.level === b.level) return a.tx === b.tx && a.tz === b.tz;
    const [near, far] = a.level === 0 ? [a, b] : [b, a];
    return Math.floor(near.tx / 2) === far.tx && Math.floor(near.tz / 2) === far.tz;
}

export const FarTerrain: React.FC = () => {
    const groupRef = useRef<THREE.Group>(null);
    const material = useMemo(() => createFarTerrainMaterial(textureAtlasManager.getTexture()), []);
    const state = useRef({
        epoch: -1,
        view: null as FarViewState | null,
        desired: [] as (FarTileKey & { d: number })[],
        desiredKeys: new Set<string>(),
        tiles: new Map<string, Tile>(),
        pending: new Set<string>(),
        ready: [] as Ready[],
        dirty: true,
    });

    useEffect(() => farView.subscribe(() => { state.current.dirty = true; }), []);

    const disposeTile = (key: string) => {
        const s = state.current;
        const tile = s.tiles.get(key);
        if (!tile) return;
        tile.mesh.removeFromParent();
        tile.mesh.geometry.dispose();
        s.tiles.delete(key);
    };

    useEffect(() => () => {
        const s = state.current;
        for (const key of [...s.tiles.keys()]) disposeTile(key);
        s.pending.clear();
        s.ready = [];
        material.dispose();
    }, [material]);

    useFrame(() => {
        const s = state.current;
        const group = groupRef.current;
        if (!group) return;

        // A new world (or seed): everything built so far is stale.
        const epoch = worldManager.getFarEpoch();
        if (epoch !== s.epoch) {
            for (const key of [...s.tiles.keys()]) disposeTile(key);
            s.pending.clear();
            s.ready = [];
            s.epoch = epoch;
            s.dirty = true;
        }

        if (s.dirty) {
            s.dirty = false;
            const view = farView.get();
            s.view = view;
            s.desired = view ? desiredFarTiles(view.cx, view.cz, view.fullDetail, view.renderDistance) : [];
            s.desiredKeys = new Set(s.desired.map((t) => farTileKey(t.level, t.tx, t.tz)));
            if (view) FAR_VIEW_UNIFORM.value.set(view.cx, view.cz, view.fullDetail * view.fullDetail, view.renderDistance * view.renderDistance);
            else FAR_VIEW_UNIFORM.value.set(0, 0, 0, -1);
            // Out of range: gone, unless it still stands in for a wanted tile not built yet.
            const waiting = s.desired.filter((t) => !s.tiles.has(farTileKey(t.level, t.tx, t.tz)));
            for (const [key, tile] of s.tiles) {
                if (s.desiredKeys.has(key)) continue;
                if (waiting.some((t) => overlaps(t, tile))) continue;
                disposeTile(key);
            }
        }

        // Tiles in from the workers, a couple a frame.
        let built = 0;
        while (built < BUILDS_PER_FRAME && s.ready.length > 0) {
            const next = s.ready.shift()!;
            if (next.epoch !== s.epoch || !s.desiredKeys.has(next.key) || s.tiles.has(next.key)) continue;
            const mesh = new THREE.Mesh(tileGeometry(next.geometry), material);
            const origin = farTileOrigin(next.level, next.tx, next.tz);
            mesh.name = 'farTerrain';
            mesh.position.set(origin.x, 0, origin.z);
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            group.add(mesh);
            mesh.updateMatrixWorld(true);
            s.tiles.set(next.key, { level: next.level, tx: next.tx, tz: next.tz, mesh });
            built++;
            // Anything it stood in for can go now, once nothing else waits on it.
            for (const [key, tile] of s.tiles) {
                if (s.desiredKeys.has(key) || !overlaps(tile, next)) continue;
                const stillNeeded = s.desired.some((t) => !s.tiles.has(farTileKey(t.level, t.tx, t.tz)) && overlaps(t, tile));
                if (!stillNeeded) disposeTile(key);
            }
        }

        // New requests, nearest first, while the chunks near the player come first.
        const limit = worldManager.pendingChunkJobs() > 0 ? IN_FLIGHT_BUSY : IN_FLIGHT_IDLE;
        for (const t of s.desired) {
            if (s.pending.size >= limit) break;
            const key = farTileKey(t.level, t.tx, t.tz);
            if (s.tiles.has(key) || s.pending.has(key)) continue;
            const requestEpoch = s.epoch;
            const sent = worldManager.requestFarTile(t.level, t.tx, t.tz, (geometry) => {
                s.pending.delete(key);
                s.ready.push({ key, level: t.level, tx: t.tx, tz: t.tz, geometry, epoch: requestEpoch });
            });
            if (!sent) break;
            s.pending.add(key);
        }
    });

    return <group ref={groupRef} name="farTerrain" matrixAutoUpdate={false} />;
};
