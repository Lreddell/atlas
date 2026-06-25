import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Source-text wiring tests (these modules pull in enums/DOM, per repo convention).
const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('a game-mode change switches music promptly (no biome debounce wait)', () => {
    const mc = read('src/systems/sound/MusicController.ts');
    // CREATIVE (entering or leaving) is treated as an instant switch like menu/boss,
    // so the right track starts even when nothing is currently playing.
    assert.match(mc, /isCreativeSwitch = targetContext === 'CREATIVE' \|\| this\.currentContext === 'CREATIVE'/);
    assert.match(mc, /isMenuSwitch \|\| isDeathSwitch \|\| isBossSwitch \|\| isCreativeSwitch/);
});

test('browser shortcuts (Ctrl+W etc.) are blocked while loading a world too', () => {
    const app = read('src/App.tsx');
    // The keydown block + the reliable beforeunload guard both cover the load screen.
    assert.match(app, /loadingIntoWorld = appState === 'loading'/);
    assert.match(app, /shouldBlockBrowserShortcuts = inGameActive \|\| loadingIntoWorld/);
    assert.match(app, /addEventListener\('beforeunload'/);
    assert.match(app, /appState !== 'game' && appState !== 'loading'\) return/);
});
