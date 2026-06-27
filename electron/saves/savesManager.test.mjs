import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { SavesManager } = require('./savesManager.cjs');

async function tmpRoot() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'atlas-saves-'));
}
const meta = (id, name = 'World') => ({ id, name, seed: 's', seedNum: 1, created: 1, lastPlayed: 2, gameMode: 'survival', time: 1000 });
function chunk(cx, cz, seed = 1) {
    const mk = (len, salt) => { const a = new Uint8Array(len); for (let i = 0; i < len; i++) a[i] = (i + seed + salt) & 0xff; return a; };
    return { cx, cz, blocks: mk(512, 1), light: mk(128, 2), meta: mk(32, 3), timestamp: 1000 + seed };
}

test('create + writeMeta produce level.json; read round-trips', async () => {
    const root = await tmpRoot();
    const sm = new SavesManager(root);
    await sm.create(meta('w1', 'Hello'));
    const onDisk = path.join(root, 'w1', 'level.json');
    await fs.access(onDisk); // exists
    const got = await sm.readMeta('w1');
    assert.equal(got.name, 'Hello');
    assert.equal(got.id, 'w1');
    await fs.rm(root, { recursive: true, force: true });
});

test('writeMeta preserves the previous metadata as level.json.bak', async () => {
    const root = await tmpRoot();
    const sm = new SavesManager(root);
    await sm.create(meta('w1', 'First'));
    await sm.writeMeta({ ...meta('w1', 'Second'), time: 2000 });
    const bak = JSON.parse(await fs.readFile(path.join(root, 'w1', 'level.json.bak'), 'utf8'));
    const live = await sm.readMeta('w1');
    assert.equal(bak.name, 'First');
    assert.equal(live.name, 'Second');
    await fs.rm(root, { recursive: true, force: true });
});

test('a corrupt level.json recovers from level.json.bak', async () => {
    const root = await tmpRoot();
    const sm = new SavesManager(root);
    await sm.create(meta('w1', 'Good'));
    await sm.writeMeta(meta('w1', 'Newer')); // now .bak holds "Good", live holds "Newer"
    await fs.writeFile(path.join(root, 'w1', 'level.json'), '{ this is not json', 'utf8');
    const recovered = await sm.readMeta('w1');
    assert.equal(recovered.name, 'Good'); // fell back to backup
    await fs.rm(root, { recursive: true, force: true });
});

test('rename changes only the name; chunks are untouched', async () => {
    const root = await tmpRoot();
    const sm = new SavesManager(root);
    await sm.create(meta('w1', 'Old'));
    await sm.writeChunks('w1', [chunk(0, 0, 5)]);
    await sm.rename('w1', 'Renamed');
    assert.equal((await sm.readMeta('w1')).name, 'Renamed');
    const c = await sm.readChunk('w1', 0, 0);
    assert.deepEqual([...c.blocks], [...chunk(0, 0, 5).blocks]);
    await sm.close('w1');
    await fs.rm(root, { recursive: true, force: true });
});

test('batch writeChunks persists chunks across multiple region files; readChunk returns them', async () => {
    const root = await tmpRoot();
    const sm = new SavesManager(root);
    await sm.create(meta('w1'));
    const chunks = [chunk(0, 0, 1), chunk(5, 9, 2), chunk(-1, -1, 3), chunk(40, 40, 4)]; // spans regions 0,0 / -1,-1 / 1,1
    await sm.writeChunks('w1', chunks);
    for (const want of chunks) {
        const got = await sm.readChunk('w1', want.cx, want.cz);
        assert.ok(got, `chunk ${want.cx},${want.cz} should exist`);
        assert.deepEqual([...got.blocks], [...want.blocks]);
        assert.equal(got.timestamp, want.timestamp);
    }
    assert.equal(await sm.readChunk('w1', 99, 99), null); // absent
    // region files actually written
    const regionFiles = await fs.readdir(path.join(root, 'w1', 'region'));
    assert.ok(regionFiles.some((f) => f === 'r.0.0.acr'));
    assert.ok(regionFiles.some((f) => f === 'r.-1.-1.acr'));
    await sm.close('w1');
    await fs.rm(root, { recursive: true, force: true });
});

test('listAllChunks enumerates every stored chunk (export source)', async () => {
    const root = await tmpRoot();
    const sm = new SavesManager(root);
    await sm.create(meta('w1'));
    const chunks = [chunk(0, 0, 1), chunk(3, 4, 2), chunk(-2, 7, 3)];
    await sm.writeChunks('w1', chunks);
    const all = await sm.listAllChunks('w1');
    assert.equal(all.length, 3);
    const key = (c) => `${c.cx},${c.cz}`;
    const set = new Set(all.map(key));
    for (const c of chunks) assert.ok(set.has(key(c)), `missing ${key(c)}`);
    await sm.close('w1');
    await fs.rm(root, { recursive: true, force: true });
});

test('session lock: a live foreign owner blocks open (LOCKED); a dead owner is reclaimed', async () => {
    const root = await tmpRoot();
    const sm = new SavesManager(root);
    await sm.create(meta('w1'));

    // Foreign, alive owner (pid 1 / init is always alive) -> LOCKED.
    await fs.writeFile(path.join(root, 'w1', 'session.lock'), JSON.stringify({ pid: 1, startedAt: 1 }), 'utf8');
    await assert.rejects(() => sm.open('w1'), (e) => e.code === 'LOCKED');

    // Dead owner (an almost-certainly-unused pid) -> stale, reclaimed.
    await fs.writeFile(path.join(root, 'w1', 'session.lock'), JSON.stringify({ pid: 2147480000, startedAt: 1 }), 'utf8');
    await sm.open('w1'); // should reclaim and succeed
    // We now hold it; opening again from the same manager is idempotent.
    await sm.open('w1');
    await sm.close('w1');
    // lock file removed on close
    await assert.rejects(() => fs.access(path.join(root, 'w1', 'session.lock')));
    await fs.rm(root, { recursive: true, force: true });
});

test('world ids are sanitized: path traversal and separators are rejected', async () => {
    const root = await tmpRoot();
    const sm = new SavesManager(root);
    for (const bad of ['../escape', 'a/b', '..', '', 'with space', 'dots..dots', '/abs']) {
        await assert.rejects(() => sm.readMeta(bad), /Invalid world id|escapes/);
        await assert.rejects(() => sm.writeChunks(bad, [chunk(0, 0)]), /Invalid world id|escapes/);
    }
    // a valid id works
    await sm.create(meta('Good_id-123'));
    assert.ok(await sm.readMeta('Good_id-123'));
    await fs.rm(root, { recursive: true, force: true });
});

test('list() returns all worlds with readable metadata', async () => {
    const root = await tmpRoot();
    const sm = new SavesManager(root);
    await sm.create(meta('w1', 'One'));
    await sm.create(meta('w2', 'Two'));
    const worlds = await sm.list();
    const names = worlds.map((w) => w.name).sort();
    assert.deepEqual(names, ['One', 'Two']);
    await fs.rm(root, { recursive: true, force: true });
});
