import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Source-text wiring tests (these modules pull in enums/DOM, per repo convention).
const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('use/place animation only plays on success, and eating repeats while held', () => {
    const held = read('src/components/HeldItem.tsx');
    // The continuous swing is gated on left-click (mine/attack) or an active bite —
    // NOT raw right-mouse — so a failed/no-op right-click no longer animates.
    assert.match(held, /const isAction = \(isLeftMouseDown\.current \|\| inputState\.eating\) && isLocked/);
    assert.doesNotMatch(held, /const isAction = \(isLeftMouseDown\.current \|\| isRightMouseDown\.current\) && isLocked/);

    const ctrl = read('src/components/controllers/InteractionController.tsx');
    // A bite no longer cancels the held button; it pauses briefly then eats again.
    assert.match(ctrl, /eatingTimer\.current = -EAT_PAUSE_TICKS/);
    assert.doesNotMatch(ctrl, /eatingTimer\.current = 0;\s*\n\s*isRightMouseDown\.current = false;/);
    assert.match(ctrl, /inputState\.eating = eatingTimer\.current >= 0/);

    const input = read('src/systems/player/playerInput.ts');
    assert.match(input, /eating: boolean/);
});

test('a game-mode change switches music promptly (no biome debounce wait)', () => {
    const mc = read('src/systems/sound/MusicController.ts');
    // CREATIVE (entering or leaving) is treated as an instant switch like menu/boss,
    // so the right track starts even when nothing is currently playing.
    assert.match(mc, /isCreativeSwitch = targetContext === 'CREATIVE' \|\| this\.currentContext === 'CREATIVE'/);
    assert.match(mc, /isMenuSwitch \|\| isDeathSwitch \|\| isBossSwitch \|\| isCreativeSwitch/);
});

test('browser shortcuts are suppressed everywhere (menu, loading, in-world)', () => {
    const app = read('src/App.tsx');
    // The keydown block runs app-wide; it only steps aside for editable elements so
    // Ctrl+A/C/V/X/Z still work in text fields.
    assert.match(app, /const blockBrowserShortcut = \(event: KeyboardEvent\) => \{[\s\S]*?isEditableElement\(event\.target\)\) return;[\s\S]*?event\.preventDefault\(\)/);
    // The beforeunload guard (catches the unpreventable Ctrl+W/Ctrl+R) is app-wide.
    assert.match(app, /addEventListener\('beforeunload'/);
    assert.doesNotMatch(app, /appState !== 'game' && appState !== 'loading'\) return/);
});
