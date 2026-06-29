// Integration test: the real DesktopFsBackend (renderer side) driving the real
// SavesManager (Node fs, actual .acr region files) through a fake IPC layer that
// mirrors electron/main.js's handlers. A fake in-memory "legacy" backend stands in
// for IndexedDB so we can exercise migration without a DOM. This covers the full
// desktop path: migrate -> route -> read/write chunks -> export/import -> rename/delete.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadTs } from './bundleTs.mjs';

const require = createRequire(import.meta.url);
const { SavesManager } = require('../../../../electron/saves/savesManager.cjs');
const { DesktopFsBackend } = await loadTs(`
    export { DesktopFsBackend } from './src/systems/world/storage/DesktopFsBackend.ts';
`);

const meta = (id, name = 'World') => ({ id, name, seed: 's', seedNum: 7, created: 1, lastPlayed: 2, gameMode: 'survival', time: 1000 });
function chunk(cx, cz, seed = 1) {
    const mk = (n, s) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (i + seed + s) & 0xff; return a; };
    return { cx, cz, blocks: mk(300, 1), light: mk(80, 2), meta: mk(20, 3), timestamp: 1000 + seed };
}

// Wrap a SavesManager as the {ok,...} IPC bridge (same shape as main.js handlers).
function makeApi(sm) {
    const ok = (x) => Object.assign({ ok: true }, x);
    const fail = (e) => ({ ok: false, error: String(e?.message || e), code: e?.code });
    return {
        list: async () => { try { return ok({ worlds: await sm.list() }); } catch (e) { return fail(e); } },
        readMeta: async (id) => { try { return ok({ meta: await sm.readMeta(id) }); } catch (e) { return fail(e); } },
        writeMeta: async (m) => { try { await sm.writeMeta(m); return ok(); } catch (e) { return fail(e); } },
        create: async (m) => { try { await sm.create(m); return ok(); } catch (e) { return fail(e); } },
        delete: async (id) => { try { await sm.deleteWorld(id); return ok(); } catch (e) { return fail(e); } },
        rename: async (id, name) => { try { await sm.rename(id, name); return ok(); } catch (e) { return fail(e); } },
        readChunk: async (id, cx, cz) => { try { return ok({ chunk: await sm.readChunk(id, cx, cz) }); } catch (e) { return fail(e); } },
        writeChunks: async (id, chunks) => { try { await sm.writeChunks(id, chunks); return ok(); } catch (e) { return fail(e); } },
        readChunksAll: async (id) => { try { return ok({ chunks: await sm.listAllChunks(id) }); } catch (e) { return fail(e); } },
        open: async (id) => { try { await sm.open(id); return ok(); } catch (e) { return fail(e); } },
        close: async (id) => { try { await sm.close(id); return ok(); } catch (e) { return fail(e); } },
        openFolder: async () => ok(),
    };
}

// Minimal in-memory legacy backend (stands in for IndexedDbBackend).
function makeLegacy(worlds, chunksByWorld) {
    return {
        async init() {},
        async listWorlds() { return worlds.map((w) => ({ ...w })); },
        async readAllChunks(id) { return (chunksByWorld[id] || []).map((c) => ({ ...c })); },
        async readMeta(id) { return worlds.find((w) => w.id === id); },
        async writeMeta(m) { const i = worlds.findIndex((w) => w.id === m.id); if (i >= 0) worlds[i] = m; else worlds.push(m); },
        async renameWorld(id, name) { const w = worlds.find((w) => w.id === id); if (w) w.name = name; },
        async deleteWorld(id) { const i = worlds.findIndex((w) => w.id === id); if (i >= 0) worlds.splice(i, 1); delete chunksByWorld[id]; },
        async readChunk(id, cx, cz) { return (chunksByWorld[id] || []).find((c) => c.cx === cx && c.cz === cz) || null; },
        async writeChunks(id, batch) { chunksByWorld[id] = chunksByWorld[id] || []; for (const c of batch) chunksByWorld[id].push(c); },
    };
}

async function tmpRoot() { return fs.mkdtemp(path.join(os.tmpdir(), 'atlas-dfs-')); }

test('init migrates legacy IndexedDB worlds into filesystem saves (idempotently)', async () => {
    const root = await tmpRoot();
    const sm = new SavesManager(root);
    const legacy = makeLegacy([meta('w1', 'Legacy World')], { w1: [chunk(0, 0, 5), chunk(7, 7, 6)] });

    const be = new DesktopFsBackend(makeApi(sm), legacy);
    await be.init();

    // World is now on disk with a level.json + region files.
    await fs.access(path.join(root, 'w1', 'level.json'));
    const worlds = await be.listWorlds();
    assert.ok(worlds.some((w) => w.id === 'w1' && w.name === 'Legacy World'));
    // Migrated chunks are readable from the filesystem backend.
    const got = await be.readChunk('w1', 0, 0);
    assert.deepEqual([...got.blocks], [...chunk(0, 0, 5).blocks]);
    assert.deepEqual([...(await be.readChunk('w1', 7, 7)).blocks], [...chunk(7, 7, 6).blocks]);

    // Re-running init (fresh backend, same disk) migrates nothing new and preserves data.
    const be2 = new DesktopFsBackend(makeApi(new SavesManager(root)), makeLegacy([meta('w1', 'Legacy World')], { w1: [chunk(0, 0, 5)] }));
    await be2.init();
    assert.deepEqual([...(await be2.readChunk('w1', 0, 0)).blocks], [...chunk(0, 0, 5).blocks]);
    await fs.rm(root, { recursive: true, force: true });
});

test('failed migration keeps the source intact and the world still visible', async () => {
    const root = await tmpRoot();
    const sm = new SavesManager(root);
    const chunks = { good: [chunk(0, 0)], bad: [chunk(0, 0)] };
    const legacy = makeLegacy([meta('good'), meta('bad')], chunks);
    // Make writing chunks for "bad" fail by breaking its readAllChunks.
    legacy.readAllChunks = async (id) => { if (id === 'bad') throw new Error('boom'); return (chunks[id] || []).map((c) => ({ ...c })); };

    const be = new DesktopFsBackend(makeApi(sm), legacy);
    await be.init();

    // "good" migrated to fs; "bad" failed but is still listed (surfaced from legacy).
    const worlds = await be.listWorlds();
    const ids = worlds.map((w) => w.id).sort();
    assert.deepEqual(ids, ['bad', 'good']);
    await fs.access(path.join(root, 'good', 'level.json'));
    await assert.rejects(() => fs.access(path.join(root, 'bad', 'level.json'))); // not on fs
    // The legacy source for "bad" is untouched and still readable through the backend.
    assert.ok(await be.readChunk('bad', 0, 0));
    await fs.rm(root, { recursive: true, force: true });
});

test('create + write + read + export/import round-trips through the filesystem backend', async () => {
    const root = await tmpRoot();
    const be = new DesktopFsBackend(makeApi(new SavesManager(root)), makeLegacy([], {}));
    await be.init();

    await be.createWorld(meta('w2', 'Fresh'));
    await be.writeChunks('w2', [chunk(0, 0, 11), chunk(-1, 3, 12)]);
    assert.deepEqual([...(await be.readChunk('w2', -1, 3)).blocks], [...chunk(-1, 3, 12).blocks]);

    // Export then import => a brand-new world with identical chunks + a unique name.
    const exported = await be.exportWorld('w2');
    const imported = await be.importWorld(exported);
    assert.notEqual(imported.id, 'w2');
    assert.equal(imported.name, 'Fresh (2)');
    assert.deepEqual([...(await be.readChunk(imported.id, 0, 0)).blocks], [...chunk(0, 0, 11).blocks]);
    await fs.rm(root, { recursive: true, force: true });
});

test('rename updates the name without rewriting chunks; delete removes the world', async () => {
    const root = await tmpRoot();
    const sm = new SavesManager(root);
    const be = new DesktopFsBackend(makeApi(sm), makeLegacy([], {}));
    await be.init();
    await be.createWorld(meta('w3', 'Before'));
    await be.writeChunks('w3', [chunk(2, 2, 9)]);

    await be.renameWorld('w3', 'After');
    assert.equal((await be.readMeta('w3')).name, 'After');
    assert.deepEqual([...(await be.readChunk('w3', 2, 2)).blocks], [...chunk(2, 2, 9).blocks]); // chunks intact

    await be.openWorld('w3'); // acquires the session lock
    await be.closeWorld('w3');
    await be.deleteWorld('w3');
    assert.equal(await be.readMeta('w3'), undefined);
    await fs.rm(root, { recursive: true, force: true });
});
