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

test('the inventory drag no longer captures the pointer (the real bug)', () => {
    // setPointerCapture bound the pointer to the origin slot, suppressing the
    // other slots' mouseenter events that the paint-drag relies on — so drags
    // "stuck" to one slot and bounced items back to the cursor. Removing it lets
    // handleSlotEnter → tryAddDragSlot run again. The rest of the hardening
    // commit (double-click collect, dialog focus, etc.) is intact.
    assert.doesNotMatch(inventoryUI, /\.setPointerCapture\(/);
    assert.match(inventoryUI, /tryAddDragSlot/);
    assert.match(inventoryUI, /dragMovedRef/);
    // A lone origin (no move) is a click; a real paint distributes via drag_end.
    assert.match(inventoryUI, /if \(!dragMovedRef\.current\)/);
    assert.match(inventoryUI, /handleInventoryAction\('drag_end'/);
    // Double-click-to-collect-into-cursor is preserved.
    assert.match(inventoryUI, /dispatchSlotAction\('double_click', collection, index\)/);
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
