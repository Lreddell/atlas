
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Boat, BlockType } from '../types';
import { BLOCKS, ATLAS_COLS } from '../data/blocks';
import { worldManager } from '../systems/WorldManager';
import { simulateBoatStep } from '../systems/boat/boatPhysics';
import { getAtlasDimensions, ATLAS_STRIDE, ATLAS_PADDING, ATLAS_RAW_TILE_SIZE } from '../utils/textures';
import { globalSunlightValue } from './chunkLightingState';
import { textureAtlasManager } from '../systems/textures/TextureAtlasManager';

interface BoatManagerProps {
    boats: Boat[];
    ridingBoatId: string | null;
    isPaused: boolean;
    brightness: number;
}

// Box geometry with every face UV-mapped onto one atlas tile, and a flat
// vertex-color shade baked in (boats use an unlit material tinted by voxel
// light, so face shading comes from these baked colors).
function makeTileBox(w: number, h: number, d: number, tileSlot: number, shade: number): THREE.BoxGeometry {
    const geo = new THREE.BoxGeometry(w, h, d);

    const { width, height } = getAtlasDimensions();
    const col = tileSlot % ATLAS_COLS;
    const row = Math.floor(tileSlot / ATLAS_COLS);
    const pxX = col * ATLAS_STRIDE + ATLAS_PADDING;
    const pxY = row * ATLAS_STRIDE + ATLAS_PADDING;
    const u0 = pxX / width;
    const u1 = (pxX + ATLAS_RAW_TILE_SIZE) / width;
    const v1 = 1.0 - (pxY / height);
    const v0 = 1.0 - ((pxY + ATLAS_RAW_TILE_SIZE) / height);

    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    }
    uv.needsUpdate = true;

    const colors = new Float32Array(geo.attributes.position.count * 3);
    colors.fill(shade);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
}

interface HullPart {
    geo: THREE.BoxGeometry;
    pos: [number, number, number];
}

let cachedHullParts: HullPart[] | null = null;

// Rowboat hull: flat bottom, two long sides, bow/stern walls and a seat.
// All parts are plank-textured and shared across every boat instance.
function getHullParts(): HullPart[] {
    if (cachedHullParts) return cachedHullParts;
    const plank = BLOCKS[BlockType.OAK_PLANKS].textureSlot ?? 8;
    cachedHullParts = [
        { geo: makeTileBox(1.1, 0.12, 2.0, plank, 0.72), pos: [0, 0.06, 0] },        // bottom
        { geo: makeTileBox(0.12, 0.42, 2.0, plank, 0.9), pos: [-0.54, 0.32, 0] },    // left wall
        { geo: makeTileBox(0.12, 0.42, 2.0, plank, 0.9), pos: [0.54, 0.32, 0] },     // right wall
        { geo: makeTileBox(1.2, 0.42, 0.16, plank, 1.0), pos: [0, 0.32, -0.94] },    // bow
        { geo: makeTileBox(1.2, 0.42, 0.16, plank, 0.8), pos: [0, 0.32, 0.94] },     // stern
        { geo: makeTileBox(0.95, 0.1, 0.3, plank, 0.95), pos: [0, 0.28, 0.25] },     // seat
    ];
    return cachedHullParts;
}

const BoatMesh: React.FC<{ boat: Boat, brightness: number }> = ({ boat, brightness }) => {
    const groupRef = useRef<THREE.Group>(null);
    const [texture, setTexture] = useState<THREE.Texture | null>(null);

    useEffect(() => {
        setTexture(textureAtlasManager.getTexture());
    }, []);

    // Unlit material tinted by local voxel light — the same convention drops
    // use, so boats stay dark in caves and dim at night regardless of the
    // scene's directional sun light.
    const material = useMemo(() => {
        if (!texture) return null;
        return new THREE.MeshBasicMaterial({ map: texture, vertexColors: true });
    }, [texture]);

    useEffect(() => () => { material?.dispose(); }, [material]);

    const parts = useMemo(() => getHullParts(), []);

    useFrame(() => {
        const g = groupRef.current;
        if (!g) return;
        g.position.set(boat.position[0], boat.position[1], boat.position[2]);
        g.rotation.y = boat.yaw;

        if (material) {
            const bx = Math.floor(boat.position[0]);
            const by = Math.floor(boat.position[1] + 0.5);
            const bz = Math.floor(boat.position[2]);
            const light = worldManager.getLight(bx, by, bz);
            const minLight = 0.05 + brightness * 0.25;
            const factor = Math.max(light.sky / 15 * globalSunlightValue, light.block / 15 * 0.9, minLight);
            material.color.setScalar(factor);
        }
    });

    if (!material) return null;

    return (
        <group ref={groupRef}>
            {parts.map((p, i) => (
                <mesh key={i} geometry={p.geo} position={p.pos} material={material} />
            ))}
        </group>
    );
};

const FIXED_STEP = 1 / 20;
const MAX_STEPS = 4;

export const BoatManager: React.FC<BoatManagerProps> = ({ boats, ridingBoatId, isPaused, brightness }) => {
    const accumulator = useRef(0);

    // Idle physics: unridden boats settle onto water/ground and glide to a
    // stop. The ridden boat is simulated by the Player's fixed-step loop.
    useFrame((_, delta) => {
        if (isPaused) return;
        accumulator.current += Math.min(delta, 0.2);
        let steps = 0;
        while (accumulator.current >= FIXED_STEP && steps < MAX_STEPS) {
            for (const boat of boats) {
                if (boat.id === ridingBoatId) continue;
                simulateBoatStep(worldManager, boat, null, 0, FIXED_STEP);
            }
            accumulator.current -= FIXED_STEP;
            steps++;
        }
        if (accumulator.current > FIXED_STEP) accumulator.current = 0;
    });

    return (
        <group>
            {boats.map(b => <BoatMesh key={b.id} boat={b} brightness={brightness} />)}
        </group>
    );
};
