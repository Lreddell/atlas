import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import {
    ChunkColumn, SECTIONS_PER_COLUMN, SECTION_VOLUME, COLUMN_VOLUME, SECTION_SHIFT,
    uniformValueOf,
} from './chunkColumn.ts';

// idx layout must match worldCoords.index3D: (y - MIN_Y) * 256 + lz * 16 + lx
const idx3D = (lx, yOff, lz) => yOff * 256 + lz * 16 + lx;

function makeTerrainArrays() {
    // Plausible column: bedrock-to-stone up to yOff=120, dirt cap, air above,
    // a torch pocket, sky light above ground, dark below.
    const blocks = new Uint8Array(COLUMN_VOLUME);
    const light = new Uint8Array(COLUMN_VOLUME);
    const meta = new Uint8Array(COLUMN_VOLUME);
    for (let yOff = 0; yOff < 384; yOff++) {
        for (let lz = 0; lz < 16; lz++) {
            for (let lx = 0; lx < 16; lx++) {
                const i = idx3D(lx, yOff, lz);
                if (yOff < 120) blocks[i] = 1; // stone
                else if (yOff === 120) blocks[i] = 3; // grass-ish
                light[i] = yOff > 120 ? 0xF0 : 0x00;
            }
        }
    }
    blocks[idx3D(5, 90, 5)] = 0; // small cave hole
    light[idx3D(5, 90, 5)] = 0x07; // torch-lit
    meta[idx3D(7, 120, 7)] = 3; // one rotated block
    return { blocks, light, meta };
}

test('constants stay in sync with src/constants.ts', () => {
    const constants = readFileSync(new URL('../../constants.ts', import.meta.url), 'utf8');
    assert.match(constants, /CHUNK_SIZE = 16/);
    assert.match(constants, /WORLD_HEIGHT = 384/);
    assert.match(constants, /MIN_Y = -64/);
    assert.equal(SECTIONS_PER_COLUMN * (SECTION_VOLUME / 256), 384);
    assert.equal(COLUMN_VOLUME, 16 * 16 * 384);
});

test('ingest detects uniform sections and flatten round-trips exactly', () => {
    const { blocks, light, meta } = makeTerrainArrays();
    const col = ChunkColumn.fromArrays(blocks, light, meta);

    // Deep solid sections and empty sky sections are implicit (numbers).
    assert.equal(typeof col.blocks[0], 'number'); // uniform stone
    assert.equal(col.blocks[0], 1);
    assert.equal(typeof col.blocks[23], 'number'); // uniform air
    assert.equal(col.blocks[23], 0);
    assert.equal(typeof col.light[23], 'number'); // uniform sky light
    assert.equal(col.light[23], 0xF0);
    // Metadata is uniform 0 in every section except the one with the rotation.
    let metaArrays = 0;
    for (const p of col.meta) if (typeof p !== 'number') metaArrays++;
    assert.equal(metaArrays, 1);

    // Byte-exact round trip of all three planes.
    assert.deepEqual(col.flattenBlocks(), blocks);
    assert.deepEqual(col.flattenLight(), light);
    assert.deepEqual(col.flattenMeta(), meta);

    // Substantially less resident memory than 3 full 96 KiB arrays.
    assert.ok(col.materializedBytes < COLUMN_VOLUME, `materialized ${col.materializedBytes}`);
});

test('reads and writes are exact; writes materialize lazily and no-ops are free', () => {
    const { blocks, light, meta } = makeTerrainArrays();
    const col = ChunkColumn.fromArrays(blocks, light, meta);

    const i = idx3D(3, 200, 3); // uniform air section
    assert.equal(col.getB(i), 0);

    const before = col.materializedBytes;
    // No-op write on a uniform section: no materialization, no dirty.
    col.consumeDirtyMask();
    assert.equal(col.setB(i, 0), false);
    assert.equal(col.materializedBytes, before);
    assert.equal(col.consumeDirtyMask(), 0);

    // Real write materializes exactly one section and dirties exactly it.
    assert.equal(col.setB(i, 7), true);
    assert.equal(col.getB(i), 7);
    assert.equal(col.materializedBytes, before + SECTION_VOLUME);
    assert.equal(col.consumeDirtyMask(), 1 << (i >> SECTION_SHIFT));

    // Everything else in the materialized section kept the uniform value.
    assert.equal(col.getB(idx3D(0, 200, 0)), 0);

    // Light/meta writes work the same way and bump versions.
    const v0 = col.dataVersion[i >> SECTION_SHIFT];
    col.setL(i, 0x35);
    col.setM(i, 2);
    assert.equal(col.getL(i), 0x35);
    assert.equal(col.getM(i), 2);
    assert.equal(col.dataVersion[i >> SECTION_SHIFT], v0 + 2);
});

test('occupancy bounds track non-air sections and grow with writes', () => {
    const { blocks, light } = makeTerrainArrays();
    const col = ChunkColumn.fromArrays(blocks, light);
    // Terrain occupies sections 0..7 (yOff 0..120 → 120>>4 = 7).
    assert.equal(col.minOccSection, 0);
    assert.equal(col.maxOccSection, 7);

    // Building a tower into yOff 300 grows the bounds.
    col.setB(idx3D(8, 300, 8), 5);
    assert.equal(col.maxOccSection, 300 >> 4);

    const empty = ChunkColumn.fromArrays(new Uint8Array(COLUMN_VOLUME), new Uint8Array(COLUMN_VOLUME));
    assert.equal(empty.minOccSection, -1);
    assert.equal(empty.occupiedSectionMask(), 0);
});

test('border planes match a manual extraction from the flat arrays', () => {
    const { blocks, light, meta } = makeTerrainArrays();
    // add asymmetry at the borders so sides are distinguishable
    blocks[idx3D(15, 130, 4)] = 9;
    blocks[idx3D(0, 131, 9)] = 8;
    blocks[idx3D(11, 132, 15)] = 7;
    blocks[idx3D(12, 133, 0)] = 6;
    const col = ChunkColumn.fromArrays(blocks, light, meta);

    const plane = new Uint8Array(16 * 384);
    // 'left' relation → this column shares its lx=15 border.
    col.fillBorderPlane(plane, 'blocks', 'left');
    for (const yOff of [0, 90, 120, 130, 383]) {
        for (let lz = 0; lz < 16; lz++) {
            assert.equal(plane[yOff * 16 + lz], blocks[idx3D(15, yOff, lz)], `left y=${yOff} lz=${lz}`);
        }
    }
    col.fillBorderPlane(plane, 'blocks', 'front'); // shares lz=0
    for (const yOff of [120, 133]) {
        for (let lx = 0; lx < 16; lx++) {
            assert.equal(plane[yOff * 16 + lx], blocks[idx3D(lx, yOff, 0)], `front y=${yOff} lx=${lx}`);
        }
    }
    col.fillBorderPlane(plane, 'light', 'back'); // shares lz=15
    for (const yOff of [0, 121, 200]) {
        for (let lx = 0; lx < 16; lx++) {
            assert.equal(plane[yOff * 16 + lx], light[idx3D(lx, yOff, 15)], `back light y=${yOff} lx=${lx}`);
        }
    }
});

test('uniformValueOf detects uniform and non-uniform sections', () => {
    const u = new Uint8Array(SECTION_VOLUME).fill(42);
    assert.equal(uniformValueOf(u), 42);
    u[1234] = 41;
    assert.equal(uniformValueOf(u), null);
});
