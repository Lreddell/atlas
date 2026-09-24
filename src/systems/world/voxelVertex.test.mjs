import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './storage/bundleTs.mjs';

globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const mod = await loadTs(`
    import './src/data/resonantDefinitions';
    export * from './src/systems/world/voxelVertex';
    export { generateGeometryData } from './src/systems/world/geometry';
    export { CHUNK_SIZE, MIN_Y, MAX_Y } from './src/constants';
    export { index3D } from './src/systems/world/worldCoords';
    export { BlockType } from './src/types';
`);
const {
    VoxelClass, SWAY_BIT, AO_BYTES, lightByte, packVoxelAlpha, unpackVoxelAlpha, voxelClassOf, voxelAlphaOf,
    uvVariantFor, applyUvVariant, FACE_INDEX, generateGeometryData, CHUNK_SIZE, MIN_Y, MAX_Y, index3D, BlockType,
} = mod;

const CELLS = CHUNK_SIZE * CHUNK_SIZE * (MAX_Y - MIN_Y + 1);

test('vertex alpha packing round-trips every class, emission and sway', () => {
    for (let voxelClass = 0; voxelClass < 8; voxelClass++) {
        for (let emission = 0; emission < 16; emission++) {
            for (const sway of [false, true]) {
                const byte = packVoxelAlpha(voxelClass, emission, sway);
                assert.ok(byte >= 0 && byte <= 255);
                assert.deepEqual(unpackVoxelAlpha(byte), { voxelClass, emission, sway });
                // The shader's float decode (voxelMaterial.ts) must agree.
                let packed = Math.floor((byte / 255) * 255 + 0.5);
                packed -= packed >= 128 ? 128 : 0;
                assert.equal(Math.floor(packed / 16), voxelClass);
                assert.equal(packed - Math.floor(packed / 16) * 16, emission);
            }
        }
    }
    assert.equal(lightByte(0), 0);
    assert.equal(lightByte(15), 255);
    assert.deepEqual([...AO_BYTES], [255, 170, 85, 0]);
});

test('blocks get the material class and glow the shader expects', () => {
    const check = (type, voxelClass, emission) => {
        assert.equal(voxelClassOf(type), voxelClass, `class of ${type}`);
        assert.deepEqual(unpackVoxelAlpha(voxelAlphaOf(type)), { voxelClass, emission, sway: false }, `alpha of ${type}`);
    };
    check(BlockType.STONE, VoxelClass.SOLID, 0);
    check(BlockType.GRASS, VoxelClass.SOLID, 0);
    check(BlockType.LEAVES, VoxelClass.LEAF, 0);
    check(BlockType.JUNGLE_LEAVES, VoxelClass.LEAF, 0);
    check(BlockType.GRASS_PLANT, VoxelClass.PLANT, 0);
    check(BlockType.SAPLING, VoxelClass.PLANT, 0);
    check(BlockType.WATER, VoxelClass.WATER, 0);
    check(BlockType.LAVA, VoxelClass.LAVA, 15);
    check(BlockType.GLASS, VoxelClass.GLASS, 0);
    check(BlockType.ICE, VoxelClass.GLASS, 0);
    check(BlockType.TORCH, VoxelClass.SPRITE, 14);
    check(BlockType.MAGNETITE_SHARD, VoxelClass.SPRITE, 12);
    check(BlockType.MAGMA, VoxelClass.SOLID, 3);
    // Resonant blocks stay restrained whatever their light level (the vault is never neon).
    assert.ok(unpackVoxelAlpha(voxelAlphaOf(BlockType.RESONANT_LAMP)).emission <= 3);
    assert.ok(unpackVoxelAlpha(voxelAlphaOf(BlockType.ECHO_CRYSTAL)).emission <= 3);
});

// Finds the quad covering the top of block (x, y, z) (a merged face covers many), returning its colour bytes.
const topFaceBytes = (buffer, x, y, z) => {
    const { positions, normals, colors } = buffer;
    for (let v = 0; v * 3 < positions.length; v += 4) {
        if (normals[v * 3 + 1] !== 1) continue;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, flat = true;
        for (let k = 0; k < 4; k++) {
            const px = positions[(v + k) * 3], py = positions[(v + k) * 3 + 1], pz = positions[(v + k) * 3 + 2];
            if (py !== y + 1) flat = false;
            minX = Math.min(minX, px); maxX = Math.max(maxX, px); minZ = Math.min(minZ, pz); maxZ = Math.max(maxZ, pz);
        }
        if (flat && minX <= x && maxX >= x + 1 && minZ <= z && maxZ >= z + 1) {
            return [0, 1, 2, 3].map(k => [...colors.slice((v + k) * 4, (v + k) * 4 + 4)]);
        }
    }
    return null;
};

const meshFloorWith = (surround) => {
    const chunk = new Uint8Array(CELLS);
    const light = new Uint8Array(CELLS).fill(15 << 4);
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            chunk[index3D(x, 1, z)] = BlockType.STONE;
            if (x !== 5 || z !== 5) chunk[index3D(x, 2, z)] = surround;
        }
    }
    return generateGeometryData(0, 0, chunk, undefined, {}, { center: light }, false);
};

test('water does not darken the corners of the blocks around it, stone does', () => {
    const underWater = topFaceBytes(meshFloorWith(BlockType.WATER).opaque, 5, 1, 5);
    assert.ok(underWater, 'the floor face under the gap is meshed');
    for (const corner of underWater) assert.equal(corner[2], 255, 'no AO from water');

    const inPit = topFaceBytes(meshFloorWith(BlockType.STONE).opaque, 5, 1, 5);
    assert.ok(inPit);
    for (const corner of inPit) assert.equal(corner[2], AO_BYTES[3], 'a pit floor is fully occluded at every corner');
    // Light and AO are separate channels: the pit floor still reports its sky light.
    for (const corner of inPit) assert.equal(corner[0], 255);
});

test('plants sway from the top corners only; their class survives the mesher', () => {
    const chunk = new Uint8Array(CELLS);
    const light = new Uint8Array(CELLS).fill(15 << 4);
    chunk[index3D(3, 1, 3)] = BlockType.GRASS;
    chunk[index3D(3, 2, 3)] = BlockType.GRASS_PLANT;
    const { cutout } = generateGeometryData(0, 0, chunk, undefined, {}, { center: light }, false);
    assert.equal(cutout.colors.length, (cutout.positions.length / 3) * 4, 'four colour bytes a vertex');
    for (let v = 0; v * 3 < cutout.positions.length; v++) {
        const y = cutout.positions[v * 3 + 1];
        const { voxelClass, sway } = unpackVoxelAlpha(cutout.colors[v * 4 + 3]);
        assert.equal(voxelClass, VoxelClass.PLANT);
        assert.equal(sway, y === 3, `vertex at y=${y}`);
    }
    assert.ok(SWAY_BIT === 0x80);
});

test('texture variation is deterministic and leaves directional tiles alone', () => {
    // Same place, same answer; and across a field every variant turns up.
    const seen = new Set();
    for (let x = -20; x < 20; x++) {
        for (let z = -20; z < 20; z++) {
            const variant = uvVariantFor(BlockType.STONE, FACE_INDEX.top, x, 40, z);
            assert.equal(variant, uvVariantFor(BlockType.STONE, FACE_INDEX.top, x, 40, z));
            seen.add(variant);
        }
    }
    assert.equal(seen.size, 8);

    const directional = [
        BlockType.LOG, BlockType.SPRUCE_LOG, BlockType.BIRCH_LOG, BlockType.FURNACE, BlockType.FURNACE_ACTIVE,
        BlockType.CRAFTING_TABLE, BlockType.CHEST, BlockType.SANDSTONE, BlockType.OAK_PLANKS, BlockType.BRICK,
        BlockType.BED_HEAD, BlockType.CACTUS, BlockType.BASALT,
    ];
    for (const type of directional) {
        for (let face = 0; face < 6; face++) {
            for (let i = 0; i < 50; i++) assert.equal(uvVariantFor(type, face, i * 7, i, -i * 3), 0, `type ${type} face ${face}`);
        }
    }

    // Grass sides keep their fringe on top: mirror only, never turned.
    for (let i = 0; i < 200; i++) {
        for (const face of [FACE_INDEX.right, FACE_INDEX.left, FACE_INDEX.front, FACE_INDEX.back]) {
            assert.equal(uvVariantFor(BlockType.GRASS, face, i, 64, i * 3) & 3, 0);
        }
    }
});

test('a UV variant only permutes the tile corners', () => {
    const base = [0.1, 0.2, 0.3, 0.2, 0.3, 0.4, 0.1, 0.4];
    const out = new Array(8);
    applyUvVariant(base, 0, out);
    assert.deepEqual(out, base);
    const key = (uvs) => [0, 1, 2, 3].map(c => `${uvs[c * 2]},${uvs[c * 2 + 1]}`).sort().join('|');
    for (let variant = 0; variant < 8; variant++) {
        applyUvVariant(base, variant, out);
        assert.equal(key(out), key(base), `variant ${variant} keeps the same corners`);
    }
    // A quarter turn applied four times is the identity.
    let uvs = base;
    for (let i = 0; i < 4; i++) {
        const next = new Array(8);
        applyUvVariant(uvs, 1, next);
        uvs = next;
    }
    assert.deepEqual(uvs, base);
});
