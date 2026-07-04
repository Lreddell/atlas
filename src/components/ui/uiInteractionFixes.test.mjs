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
    // A press that never moved to another slot is a click, not a paint-drag, so
    // it dispatches click/right_click (correct place/merge/swap) instead of
    // distributing through drag_end (which bounced swaps back to the cursor).
    assert.match(inventoryUI, /if \(!dragMovedRef\.current\)/);
    assert.match(inventoryUI, /dispatchSlotAction\(mode === 'one' \? 'right_click' : 'click', origin\.collection, origin\.index\)/);
    // A genuine paint (moved across slots) still distributes via drag_end,
    // reading the authoritative ref rather than async state.
    assert.match(inventoryUI, /handleInventoryAction\('drag_end'/);
    assert.match(inventoryUI, /Array\.from\(dragSlotsRef\.current\)/);
});

test('closing UIs with Escape re-locks immediately instead of waiting for a click', () => {
    // The Escape-close paths no longer defer pointer lock (a mousemove can never
    // re-acquire it), so the keydown — which still carries user activation —
    // re-locks and restores camera control at once.
    assert.doesNotMatch(app, /closeInventory\(\{ deferPointerLock: true \}\)/);
    assert.match(app, /if \(openContainer\) \{ closeInventory\(\); return; \}/);
    // mousedown is now a pointer-lock recovery trigger (earliest valid gesture).
    assert.match(app, /window\.addEventListener\('mousedown', onMouseDown, true\)/);
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
    // No more bespoke purple panel — it uses the same neutral accordion shell,
    // swatch/name/chevron header, and expand mechanism as every other biome.
    assert.doesNotMatch(chunkBase, /border-purple-500\/40 rounded bg-\[#1c1726\]/);
    assert.doesNotMatch(chunkBase, /text-sm font-bold text-purple-300 flex-1/);
    assert.match(chunkBase, /toggleBiomeExpand\('magneticFields'\)/);
    assert.match(chunkBase, /expandedBiomes\['magneticFields'\]/);
    // Header markup is identical in shape to the standard rows.
    assert.match(chunkBase, /<span className="text-sm font-bold text-gray-200 flex-1 text-left">Magnetic Fields<\/span>/);
});
