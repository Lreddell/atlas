import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

const geometry = readFileSync(new URL('./geometry.ts', import.meta.url), 'utf8');
const wm = readFileSync(new URL('../WorldManager.ts', import.meta.url), 'utf8');

// NOTE: functional correctness of the plane protocol is verified end-to-end by
// the perf harness `meshHash` scenario: it meshes fixed chunk neighborhoods
// through buildNeighborInput and asserts the emitted geometry buffers hash
// identically to the pre-plane full-array protocol (docs/performance/results).
// Any wrong byte in extraction or lookup changes those hashes.

test('extractBorderPlane maps each side to the shared column', () => {
    // left neighbor (cx-1) shares its lx=15 column, right its lx=0.
    assert.match(geometry, /side === 'left' \? CHUNK_SIZE - 1 : 0/);
    // back neighbor (cz-1) shares its lz=15 column, front its lz=0.
    assert.match(geometry, /side === 'back' \? CHUNK_SIZE - 1 : 0/);
    // Plane rows are indexed by world Y offset, matching the lookup side.
    assert.match(geometry, /plane\[\(y - MIN_Y\) \* CHUNK_SIZE \+ t\]|const yBase = \(y - MIN_Y\) \* CHUNK_SIZE/);
});

test('mesh jobs ship border planes, not full neighbor arrays', () => {
    // Dispatch builds planes through the single indirection point and
    // transfers their buffers (fresh copies) to the worker.
    assert.match(wm, /Geometry\.buildNeighborInput\(/);
    assert.match(wm, /postToPool\(\{\s*\n\s*type: 'MESH'[\s\S]*?\}, transfer\)/);
    assert.doesNotMatch(wm, /left: WorldStore\.getChunkData\(this\.state, job\.cx-1, job\.cz\)/);
    // The mesher documents and consumes the plane layout.
    assert.match(geometry, /NEIGHBOR_PLANE_SIZE = CHUNK_SIZE \* WORLD_HEIGHT/);
    assert.doesNotMatch(geometry, /neighbors\.left\[index3D/);
    // Tangential clamping is preserved so AO corner sampling stays identical.
    assert.match(geometry, /Math\.max\(0, Math\.min\(CHUNK_SIZE - 1, z\)\)/);
});
