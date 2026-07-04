import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// These components touch the BlockType enum / React, so their behavior is
// asserted via source text (repo convention for enum-touching modules).
const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const inventoryUI = read('src/components/ui/InventoryUI.tsx');
const controller = read('src/hooks/useInventoryController.ts');
const app = read('src/App.tsx');
const worldManager = read('src/systems/WorldManager.ts');
const chunkBase = read('src/components/ui/ChunkBase.tsx');

test('drag_end is exempt from the per-slot availability gate (the real drag bug)', () => {
    // drag_end (like drop_cursor) is dispatched with collection 'none', so the
    // controller's availability guard must let it through — otherwise every drag
    // distribution was dropped and the held stack bounced back to the cursor.
    assert.match(controller, /action !== 'drop_cursor' && action !== 'drag_end'/);
    // The UI still drives it: a lone-origin press is a click, a paint is drag_end.
    assert.match(inventoryUI, /if \(!dragMovedRef\.current\)/);
    assert.match(inventoryUI, /handleInventoryAction\('drag_end'/);
    // Codex's other work is untouched (double-click collect, pointer capture).
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

test('spawns resolve a real clear standing Y from actual blocks (no spawning in blocks)', () => {
    // Every spawn (world entry + respawn go through findSafeSpawnPosition) snaps
    // to a genuine air gap on top of the actual surface, not just noiseHeight+2,
    // so it can't land inside a tree / structure / overhang.
    assert.match(worldManager, /public resolveClearStandY\(x: number, z: number\): number/);
    assert.match(worldManager, /const y = this\.resolveClearStandY\(pick\.x, pick\.z\)/);
    assert.match(worldManager, /return \{ x: pick\.x \+ 0\.5, y, z: pick\.z \+ 0\.5 \}/);
});

test('resuming from the pause menu cannot bounce back to a pause', () => {
    // The pointer-lock-loss auto-pause is suppressed past the browser's ~1.25s
    // Escape cooldown, so a lock bounce during that window no longer re-pauses.
    const resume = app.slice(app.indexOf('const resumeFromUserGesture'), app.indexOf('const resumeFromUserGesture') + 900);
    assert.match(resume, /suppressAutoPauseFor\(1500\)/);
    // The Escape-unpause path gets the same protection.
    assert.match(app, /setIsPaused\(false\); wantsGameplayRef\.current = true; relockWantedRef\.current = true; suppressAutoPauseFor\(1500\)/);
});

test('Escape uses e.repeat, not a latching ref that a missed keyup can wedge', () => {
    // The "sometimes Escape does nothing, hit it again" bug was a boolean ref
    // set on keydown and cleared on keyup: a dropped keyup left it stuck true
    // and swallowed the next press. e.repeat is browser-managed and resets per
    // fresh press, so it can't wedge.
    assert.doesNotMatch(app, /escapeHeldRef/);
    const esc = app.slice(app.indexOf("if (e.key === 'Escape') {"));
    assert.match(esc, /if \(e\.repeat\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); return; \}/);
    // Escape out of a container/inventory returns to gameplay, not the pause menu.
    assert.match(esc, /if \(openContainer\) \{ closeInventory\(\{ deferPointerLock: true \}\); return; \}/);
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
