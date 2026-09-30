import * as THREE from 'three';

// How much of each full chunk is drawn, for the horizon to draw the rest.
//
// A chunk fading in or out dissolves on a 4 x 4 ordered dither (0 to 16 of
// every 16 pixels, voxelMaterial.ts). The horizon's terrain behind it takes
// exactly the other pixels of the same pattern, so the two cross-fade with no
// pixel drawn twice and none left empty: no sky shows through a chunk as it
// streams in, and nothing floats in front of it (the LOD cross-fade Unity's
// LOD groups and Unreal's dithered transitions use, chunk by chunk). A chunk
// fully in hides the horizon under it; one not there yet shows it whole.
//
// One byte a chunk (its dither step, 0..16) in a square texture that wraps
// around the world (a chunk's texel is its coordinates modulo the size), so
// nothing moves when the player does; the shader reads the steps with
// texelFetch, exactly.

/** Chunks the texture spans along x and z: every full chunk's step fits while it is within half of this of the centre. */
export const COVERAGE_SIZE = 128;
/** The dither step of a chunk drawn whole. */
export const FULL_STEP = 16;

const data = new Uint8Array(COVERAGE_SIZE * COVERAGE_SIZE);
const texture = new THREE.DataTexture(data, COVERAGE_SIZE, COVERAGE_SIZE, THREE.RedIntegerFormat, THREE.UnsignedByteType);
texture.internalFormat = 'R8UI';
texture.minFilter = THREE.NearestFilter;
texture.magFilter = THREE.NearestFilter;
texture.generateMipmaps = false;
texture.needsUpdate = true;

const texel = (cx: number, cz: number): number => {
    const x = ((cx % COVERAGE_SIZE) + COVERAGE_SIZE) % COVERAGE_SIZE;
    const z = ((cz % COVERAGE_SIZE) + COVERAGE_SIZE) % COVERAGE_SIZE;
    return z * COVERAGE_SIZE + x;
};

export const chunkCoverage = {
    texture,
    /** The chunk the coverage is read around (x, z), set as the player moves. */
    center: new THREE.Vector2(),

    /** A chunk's dither step, 0 (not drawn) to FULL_STEP (drawn whole). */
    set(cx: number, cz: number, step: number): void {
        const i = texel(cx, cz);
        const value = Math.max(0, Math.min(FULL_STEP, Math.round(step)));
        if (data[i] === value) return;
        data[i] = value;
        texture.needsUpdate = true;
    },

    get(cx: number, cz: number): number {
        return data[texel(cx, cz)];
    },

    /** Every chunk undrawn (a new world). */
    clear(): void {
        data.fill(0);
        texture.needsUpdate = true;
    },
};
