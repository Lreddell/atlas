import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

const wm = readFileSync(new URL('../WorldManager.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('./workers/world.worker.ts', import.meta.url), 'utf8');

test('every gen/mesh job carries a world session id and a ticket', () => {
    // Session bumps on both context switches and resets.
    assert.match(wm, /setWorldContext\(worldId: string, seedNum: number\) \{[\s\S]{0,200}?this\.worldSession\+\+/);
    assert.match(wm, /activeWorldId = null; \/\/ Clear context\s*\n\s*this\.worldSession\+\+/);
    // Dispatches include the session (worker jobs, storage loads, fallbacks).
    assert.match(wm, /type: 'GEN', id: `gen-\$\{cx\}-\$\{cz\}`, cx, cz, ticket, session: this\.worldSession/);
    assert.match(wm, /type: 'MESH',[\s\S]{0,200}?session: this\.worldSession/);
    // The worker echoes it back on every reply, including errors.
    assert.match(worker, /type: 'GEN_DONE',[\s\S]{0,100}?session/);
    assert.match(worker, /type: 'MESH_DONE', id, cx, cz, ticket, session/);
    assert.match(worker, /type: 'JOB_ERROR',[\s\S]{0,120}?session/);
});

test('results are rejected unless session, ticket, and retention all match', () => {
    // Session gate runs before anything touches world state.
    assert.match(wm, /data\.session !== undefined && data\.session !== this\.worldSession[\s\S]{0,120}?staleSessionDiscarded[\s\S]{0,60}?return;/);
    // Ticket mismatches are counted and discarded (gen + mesh).
    assert.match(wm, /staleGenDiscarded/);
    assert.match(wm, /staleMeshDiscarded/);
    // Retention check at acceptance: a chunk that left the active area while
    // its job ran is not inserted into storage or the mesh cache.
    const genDone = wm.split("if (type === 'GEN_DONE')")[1].split("else if (type === 'MESH_DONE')")[0];
    assert.ok(genDone.includes('isWithinRetention'), 'GEN_DONE must verify retention before inserting');
    assert.ok(genDone.indexOf('isWithinRetention') < genDone.indexOf('WorldStore.setChunkData'),
        'retention check must precede chunk data insertion');
    const meshDone = wm.split("else if (type === 'MESH_DONE')")[1];
    assert.ok(meshDone.includes('isWithinRetention'), 'MESH_DONE must verify retention before caching');
    assert.ok(meshDone.indexOf('isWithinRetention') < meshDone.indexOf('this.storeMeshResult'),
        'retention check must precede mesh cache insertion');
});
