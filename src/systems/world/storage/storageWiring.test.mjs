import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Source-text wiring tests (these modules pull in IndexedDB/DOM/the BlockType enum
// and the whole app graph, so per repo convention they're asserted via source).
const root = path.resolve(import.meta.dirname, '../../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('WorldStorage keeps every public method its callers rely on, plus the new ones', () => {
    const ws = read('src/systems/world/WorldStorage.ts');
    for (const m of [
        'getAllWorlds', 'getWorldMeta', 'saveWorldMeta', 'createWorld', 'deleteWorld',
        'saveChunk', 'loadChunk', 'exportWorld', 'importWorld',
        // additive
        'saveChunks', 'openWorld', 'closeWorld', 'renameWorld',
    ]) {
        assert.match(ws, new RegExp(`public async ${m}\\b`), `WorldStorage.${m} missing`);
    }
    // Still re-exports the public types from the original import path.
    assert.match(ws, /export type \{[\s\S]*WorldMetadata[\s\S]*ExportedWorldData[\s\S]*\} from '\.\/storage\/types'/);
    // createWorld still hashes the seed into the world's identity.
    assert.match(ws, /seedNum = \(\(seedNum << 5\) - seedNum\) \+ seedInput\.charCodeAt\(i\)/);
    // saveChunk is a back-compat wrapper over the batch path.
    assert.match(ws, /saveChunk[\s\S]*?return this\.saveChunks\(/);
});

test('backend selection is feature detection (window.atlasDesktop?.saves), not a userAgent sniff', () => {
    const ws = read('src/systems/world/WorldStorage.ts');
    assert.match(ws, /window\.atlasDesktop\?\.saves/);
    assert.match(ws, /new DesktopFsBackend\(/);
    assert.match(ws, /new IndexedDbBackend\(/);
    assert.doesNotMatch(ws, /navigator\.userAgent/); // selection never sniffs the UA string
    // Desktop init failure falls back to IndexedDB (never blocks the web/desktop app).
    assert.match(ws, /return legacy/);
});

test('selection order is desktop-fs -> OPFS -> IndexedDB, each with a graceful fallback', () => {
    const ws = read('src/systems/world/WorldStorage.ts');
    // OPFS is tried only when the desktop bridge is absent, and is feature-detected.
    assert.match(ws, /opfsBackendSupported\(\)/);
    assert.match(ws, /new OpfsBackend\(legacy\)/);
    // both desktop and OPFS init are wrapped so a failure falls back to IndexedDB
    assert.match(ws, /OPFS backend failed to init; falling back to IndexedDB/);
    // OPFS backend self-tests a real round-trip and terminates the worker on failure.
    const opfs = read('src/systems/world/storage/OpfsBackend.ts');
    assert.match(opfs, /selfTest\(\)/);
    assert.match(opfs, /this\.worker\.terminate\(\)/);
    // createSyncAccessHandle IO lives in a dedicated worker (never the main thread).
    const core = read('src/systems/world/storage/opfs/OpfsSavesCore.ts');
    assert.match(core, /createSyncAccessHandle\(\)/);
    const worker = read('src/systems/world/storage/opfs/saveWorker.ts');
    assert.match(worker, /navigator.*storage.*getDirectory|getDirectory\(\)/);
});

test('both region backends share one base (routing + migration); .acr codec is pure (no Node/DOM/Electron)', () => {
    const base = read('src/systems/world/storage/RegionBackendBase.ts');
    assert.match(base, /migrateWorlds/);
    assert.match(base, /level\.json = the commit point|level\.json \(via create\) LAST|create\(world\)/);
    const desktop = read('src/systems/world/storage/DesktopFsBackend.ts');
    const opfs = read('src/systems/world/storage/OpfsBackend.ts');
    assert.match(desktop, /extends RegionBackendBase/);
    assert.match(opfs, /extends RegionBackendBase/);
    // The codec must not import Node/DOM/Electron so it can run in worker + tests + main port.
    const codec = read('src/systems/world/storage/acr/acrCodec.ts');
    assert.doesNotMatch(codec, /from 'fs'|require\(|window\.|document\.|navigator\./);
});

test('storage persistence + save-management UI are wired', () => {
    const app = read('src/App.tsx');
    // persist() is requested on world entry (a user gesture).
    assert.match(app, /requestPersistentStorage\(\)/);
    const persist = read('src/systems/world/storage/storagePersistence.ts');
    assert.match(persist, /navigator\.storage\.persist\(\)/);
    assert.match(persist, /navigator\.storage\.estimate\(\)/);
    // Rename + open-folder go through the storage layer / desktop bridge.
    const menu = read('src/components/ui/mainMenu/useWorldMenu.ts');
    assert.match(menu, /WorldStorage\.renameWorld\(/);
    assert.match(menu, /atlasDesktop\?\.saves\?\.openFolder/);
    assert.match(menu, /WorldStorage\.getBackendKind\(\)/);
    // Rename uses an in-app modal (not native prompt).
    assert.match(read('src/components/ui/MainMenu.tsx'), /RenameWorldModal/);
});

test('IndexedDbBackend preserves the existing AtlasDB schema and key scheme (old saves load)', () => {
    const idb = read('src/systems/world/storage/IndexedDbBackend.ts');
    assert.match(idb, /DB_NAME = 'AtlasDB'/);
    assert.match(idb, /DB_VERSION = 2/);
    assert.match(idb, /STORE_NAME = 'Chunks'/);
    assert.match(idb, /META_STORE = 'Metadata'/);
    assert.match(idb, /`chunk_\$\{worldId\}_\$\{cx\}_\$\{cz\}`/);
    // metadata store still keyPath 'id'
    assert.match(idb, /createObjectStore\(META_STORE, \{ keyPath: 'id' \}\)/);
    // batch write uses ONE transaction for the whole batch
    assert.match(idb, /transaction\(STORE_NAME, 'readwrite'\)[\s\S]*?for \(const c of chunks\)/);
});

test('the .acr format decision is the widened-count Atlas variant (no .mcc overflow)', () => {
    const fmt = read('src/systems/world/storage/acr/acrFormat.ts');
    assert.match(fmt, /ACR_MAGIC[\s\S]*0x41, 0x43, 0x52, 0x31/); // "ACR1"
    assert.match(fmt, /SECTOR_SIZE = 4096/);
    assert.match(fmt, /REGION_EDGE = 32/);
    assert.match(fmt, /SLOTS_PER_REGION = REGION_EDGE \* REGION_EDGE/);
    // widened: 32-bit offset + 32-bit count => 8-byte location entries
    assert.match(fmt, /LOCATION_ENTRY_BYTES = 8/);
    assert.match(fmt, /TIMESTAMP_ENTRY_BYTES = 8/);
    // The codec writes a full u32 sector count (widened) and has NO external-file
    // (.mcc-style) overflow branch / 255-sector cap in its logic.
    const codec = read('src/systems/world/storage/acr/acrCodec.ts');
    assert.match(codec, /putU32\(loc, 4, count\)/); // 32-bit count, not 1 byte
    assert.doesNotMatch(codec, /0x80|external file|\.mcc|255/);
});

test('WorldManager batches dirty chunks and only clears them after a successful write', () => {
    const wm = read('src/systems/WorldManager.ts');
    // Re-entrancy guard.
    assert.match(wm, /private saving = false/);
    assert.match(wm, /if \(this\.saving\) return;/);
    // Builds one batch and calls the batched API.
    assert.match(wm, /await WorldStorage\.saveChunks\(worldId, batch\)/);
    // Dirty flags cleared only inside the post-await success path (in a try, after the save).
    assert.match(wm, /await WorldStorage\.saveChunks\(worldId, batch\);[\s\S]*?this\.dirtyChunks\.delete\(key\)/);
    // On failure, chunks stay dirty for retry (no clear in catch).
    assert.match(wm, /catch \(e\) \{[\s\S]*?stay dirty for retry/);
    // knownMissing updated only after a successful persist.
    assert.match(wm, /this\.knownMissingStorageChunks\.delete\(key\); \/\/ now known to exist on disk/);
    // (Eviction of dirty chunks is covered by its own test below — it now DEFERS
    // rather than fire-and-forget saving, so there is no eviction-time save here.)
});

test('eviction never unloads a dirty chunk (no lost edits on a failed save)', () => {
    const wm = read('src/systems/WorldManager.ts');
    // evict() bails out (unloading nothing) while the chunk is still dirty...
    assert.match(wm, /private evict\(cx: number, cz: number\): boolean \{[\s\S]*?if \(this\.dirtyChunks\.has\(key\)\) \{\s*\n\s*return false;/);
    // ...and the old "delete dirty flag + fire-and-forget save" path is gone.
    assert.doesNotMatch(wm, /this\.dirtyChunks\.delete\(key\);[\s\S]{0,200}?WorldStore\.evictChunk/);
    // the scan only counts real unloads and flushes deferred-dirty chunks for a later pass
    assert.match(wm, /if \(this\.evict\(kcx, kcz\)\) \{[\s\S]*?evicted\+\+/);
    assert.match(wm, /deferredDirty[\s\S]*?void this\.processSaveQueue\(\)/);
});

test('the final save is reliable on quit/close (web visibilitychange + desktop flush handshake)', () => {
    const app = read('src/App.tsx');
    // Web: also flush when the page is hidden (more reliable than beforeunload).
    assert.match(app, /document\.visibilityState === 'hidden'/);
    assert.match(app, /addEventListener\('visibilitychange', onVisibility\)/);
    // Desktop: the renderer answers the main-process flush request, then acks.
    assert.match(app, /onFlushRequest\(\(\) => \{[\s\S]*?saveGameRef\.current\(\{ force: true \}\)[\s\S]*?flushComplete\?\.\(\)/);

    const preload = read('electron/preload.js');
    assert.match(preload, /onFlushRequest:/);
    assert.match(preload, /flushComplete: \(\) => ipcRenderer\.invoke\('app:flush-complete'\)/);

    const main = read('electron/main.js');
    // close is held (preventDefault), the renderer is asked to flush, and a timeout
    // guarantees quit never hangs on an unresponsive renderer.
    assert.match(main, /event\.preventDefault\(\)/);
    assert.match(main, /webContents\.send\('app:flush-request'\)/);
    assert.match(main, /setTimeout\(finish, 3000\)/);
    assert.match(main, /ipcMain\.handle\('app:flush-complete'/);
    assert.match(main, /win\.destroy\(\)/);
});

test('a locked world aborts entry instead of silently continuing as writable', () => {
    const app = read('src/App.tsx');
    // LOCKED -> clear the active world, go back to the menu, tell the user, and return.
    assert.match(app, /code\?: string \}\)\?\.code === 'LOCKED'\) \{[\s\S]*?activeWorldIdRef\.current = null;[\s\S]*?setAppState\('menu'\);[\s\S]*?return;/);
    // the lock errors carry a LOCKED code from both backends
    assert.match(read('electron/saves/savesManager.cjs'), /err\.code = 'LOCKED'/);
    assert.match(read('src/systems/world/storage/opfs/OpfsSavesCore.ts'), /err\.code = 'LOCKED'/);
});

test('App integrates the session lock, death-save, cursorStack, and clean-skip autosave', () => {
    const app = read('src/App.tsx');
    // open/close the world (filesystem session lock) on enter/quit.
    assert.match(app, /await WorldStorage\.openWorld\(worldId\)/);
    assert.match(app, /WorldStorage\.closeWorld\(quittingWorldId\)/);
    // death is persisted immediately on respawn (forced).
    assert.match(app, /saveGameRef\.current\(\{ force: true \}\)[\s\S]*?resumeFromUserGesture\('respawn'\)/);
    // cursorStack is saved and restored (was lost before).
    assert.match(app, /cursorStack: cursorStack/);
    assert.match(app, /setCursorStack\(meta\.player\.cursorStack \?\? null\)/);
    // autosave (the 10s tick) is NOT forced, so the clean-skip can elide redundant writes.
    assert.match(app, /const interval = setInterval\(\(\) => \{\s*saveGameRef\.current\(\);/);
    // forced save points pass force:true.
    assert.match(app, /saveGame\(\{ force: true \}\)/);
});
