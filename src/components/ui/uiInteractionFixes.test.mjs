import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// These components touch the BlockType enum / React, so their behavior is
// asserted via source text (repo convention for enum-touching modules).
const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const inventoryUI = read('src/components/ui/InventoryUI.tsx');
const app = read('src/App.tsx');
const worldManager = read('src/systems/WorldManager.ts');
const chunkBase = read('src/components/ui/ChunkBase.tsx');

test('a plain click routes to the standard click handler, not drag_end', () => {
    // A press that only ever touched its origin slot is a click, not a paint, so
    // it dispatches click/right_click (correct place/merge/SWAP/pickup) instead
    // of distributing through drag_end (which bounced swaps back to the cursor —
    // the "items just go back to the mouse" bug).
    assert.match(inventoryUI, /const painted = Array\.from\(dragSlotsRef\.current\)/);
    assert.match(inventoryUI, /if \(painted\.length <= 1\)/);
    assert.match(inventoryUI, /handleInventoryAction\(dragMode === 'one' \? 'right_click' : 'click', c, i\)/);
    // A genuine multi-slot paint still distributes via drag_end.
    assert.match(inventoryUI, /handleInventoryAction\('drag_end'/);
    // The fragile pointer-capture drag from the reverted commit is gone.
    assert.doesNotMatch(inventoryUI, /setPointerCapture/);
    assert.doesNotMatch(inventoryUI, /dragMovedRef/);
});

test('Escape from a container returns to the game, never the pause menu', () => {
    // The openContainer close is handled BEFORE the pause fallback, so closing a
    // UI with Escape resumes the game rather than opening the pause menu.
    const esc = app.slice(app.lastIndexOf("if (e.key === 'Escape') {"));
    const containerIdx = esc.indexOf('if (openContainer) { closeInventory');
    const pauseIdx = esc.indexOf('setIsPaused(true)');
    assert.ok(containerIdx !== -1, 'container Escape must close the inventory');
    assert.ok(pauseIdx !== -1 && containerIdx < pauseIdx, 'container close must precede the pause fallback');
});

test('respawn re-centers chunk streaming so the spawn area renders', () => {
    // handleRespawn force-applies the chunk center at the spawn point; without it
    // the world stays streamed around the death location until you walk.
    const respawn = app.slice(app.indexOf('const handleRespawn'), app.indexOf('const handleRespawn') + 3000);
    assert.match(respawn, /worldManager\.ensureChunk\(cx, cz\);\s*\n\s*applyChunkCenter\(cx, cz, true\)/);
});

test('caves render across the near/mid view, not just a few chunks out', () => {
    assert.match(worldManager, /DARK_CULL_DISTANCE = 8/);
});

test('the Magnetic Fields editor row matches the standard biome accordion', () => {
    assert.doesNotMatch(chunkBase, /border-purple-500\/40 rounded bg-\[#1c1726\]/);
    assert.doesNotMatch(chunkBase, /text-sm font-bold text-purple-300 flex-1/);
    assert.match(chunkBase, /toggleBiomeExpand\('magneticFields'\)/);
    assert.match(chunkBase, /expandedBiomes\['magneticFields'\]/);
    assert.match(chunkBase, /<span className="text-sm font-bold text-gray-200 flex-1 text-left">Magnetic Fields<\/span>/);
});
