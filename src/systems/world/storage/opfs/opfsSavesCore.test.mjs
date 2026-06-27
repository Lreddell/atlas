// OpfsSavesCore over a fake OPFS, using the real CompressionStream-based
// streamCompressor (Node 18+ has CompressionStream/Response). Mirrors the Node
// savesManager test: round-trip, reload, list/rename/delete, atomic level.json +
// .bak recovery, the sync-access-handle session lock, and path sanitization.
import assert from 'node:assert/strict';
import test from 'node:test';
import { TextEncoder } from 'node:util';

import { loadTs } from '../bundleTs.mjs';
import { FakeDir } from './fakeOpfs.mjs';

const { OpfsSavesCore, handleSaveRequest, streamCompressor } = await loadTs(`
    export { OpfsSavesCore } from './src/systems/world/storage/opfs/OpfsSavesCore.ts';
    export { handleSaveRequest } from './src/systems/world/storage/opfs/saveWorkerRouter.ts';
    export { streamCompressor } from './src/systems/world/storage/acr/streamCompressor.ts';
`);

const meta = (id, name = 'World') => ({ id, name, seed: 's', seedNum: 7, created: 1, lastPlayed: 2, gameMode: 'survival', time: 1000 });
function chunk(cx, cz, seed = 1) {
    const mk = (n, s) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (i + seed + s) & 0xff; return a; };
    return { cx, cz, blocks: mk(400, 1), light: mk(120, 2), meta: mk(30, 3), timestamp: 1000 + seed };
}
const core = (root) => new OpfsSavesCore(root, streamCompressor);

test('streamCompressor round-trips and actually compresses repetitive data', async () => {
    const data = new Uint8Array(2000).fill(7);
    const z = await streamCompressor.compress(data);
    assert.ok(z.length < data.length, 'should shrink repetitive data');
    assert.deepEqual([...await streamCompressor.decompress(z)], [...data]);
});

test('create + write + read round-trips across regions; survives a fresh core (reload)', async () => {
    const root = new FakeDir();
    const c = core(root);
    await c.create(meta('w1', 'Hello'));
    await c.writeChunks('w1', [chunk(0, 0, 5), chunk(40, 40, 6), chunk(-1, -1, 7)]); // 3 regions
    for (const want of [chunk(0, 0, 5), chunk(40, 40, 6), chunk(-1, -1, 7)]) {
        assert.deepEqual([...(await c.readChunk('w1', want.cx, want.cz)).blocks], [...want.blocks]);
    }
    assert.equal(await c.readChunk('w1', 99, 99), null);
    await c.close('w1');

    // Fresh core over the SAME fake disk sees the persisted world + chunks.
    const c2 = core(root);
    const worlds = await c2.list();
    assert.ok(worlds.some((w) => w.id === 'w1' && w.name === 'Hello'));
    assert.deepEqual([...(await c2.readChunk('w1', 40, 40)).blocks], [...chunk(40, 40, 6).blocks]);
});

test('writeMeta keeps a .bak and readMeta recovers from it when level.json is corrupt', async () => {
    const root = new FakeDir();
    const c = core(root);
    await c.create(meta('w1', 'First'));
    await c.writeMeta(meta('w1', 'Second'));
    // Corrupt the primary level.json directly through the fake.
    const worldDir = await root.getDirectoryHandle('w1');
    const fh = await worldDir.getFileHandle('level.json', { create: true });
    const w = await fh.createWritable(); await w.write(new TextEncoder().encode('{ broken')); await w.close();
    assert.equal((await c.readMeta('w1')).name, 'First'); // fell back to .bak ("First")
});

test('rename changes the name without touching chunks; delete removes the world', async () => {
    const root = new FakeDir();
    const c = core(root);
    await c.create(meta('w1', 'Before'));
    await c.writeChunks('w1', [chunk(2, 2, 9)]);
    await c.rename('w1', 'After');
    assert.equal((await c.readMeta('w1')).name, 'After');
    assert.deepEqual([...(await c.readChunk('w1', 2, 2)).blocks], [...chunk(2, 2, 9).blocks]);
    await c.close('w1');
    await c.deleteWorld('w1');
    assert.equal(await c.readMeta('w1'), undefined);
});

test('listAllChunks enumerates every stored chunk (export source)', async () => {
    const root = new FakeDir();
    const c = core(root);
    await c.create(meta('w1'));
    await c.writeChunks('w1', [chunk(0, 0, 1), chunk(3, 4, 2), chunk(-2, 7, 3)]);
    const all = await c.listAllChunks('w1');
    assert.equal(all.length, 3);
    const keys = new Set(all.map((x) => `${x.cx},${x.cz}`));
    for (const cc of [[0, 0], [3, 4], [-2, 7]]) assert.ok(keys.has(`${cc[0]},${cc[1]}`));
});

test('the session lock is exclusive: a second opener is rejected until the first closes', async () => {
    const root = new FakeDir();
    const c1 = core(root);
    const c2 = core(root); // a "second tab" over the same disk
    await c1.create(meta('w1'));
    await c1.open('w1');
    await assert.rejects(() => c2.open('w1'), (e) => e.code === 'LOCKED');
    await c1.close('w1');
    await c2.open('w1'); // now free
    await c2.close('w1');
});

test('world ids are sanitized (path traversal / separators rejected)', async () => {
    const c = core(new FakeDir());
    for (const bad of ['../escape', 'a/b', '..', '', 'has space']) {
        await assert.rejects(() => c.readMeta(bad), /Invalid world id/);
        await assert.rejects(() => c.writeChunks(bad, [chunk(0, 0)]), /Invalid world id/);
    }
});

test('the worker router dispatches ops to the core', async () => {
    const root = new FakeDir();
    const c = core(root);
    await handleSaveRequest(c, 'create', [meta('w1', 'Router')]);
    await handleSaveRequest(c, 'writeChunks', ['w1', [chunk(0, 0, 4)]]);
    const got = await handleSaveRequest(c, 'readChunk', ['w1', 0, 0]);
    assert.deepEqual([...got.blocks], [...chunk(0, 0, 4).blocks]);
    const worlds = await handleSaveRequest(c, 'list', []);
    assert.ok(worlds.some((w) => w.id === 'w1'));
    await assert.rejects(() => handleSaveRequest(c, 'bogus', []), /Unknown save op/);
});
