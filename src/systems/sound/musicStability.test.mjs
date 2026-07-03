import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// SoundManager/MusicController are window/Audio-bound, so the stutter fixes are
// pinned via source text (repo convention for DOM-touching modules).
const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const sm = read('src/systems/sound/SoundManager.ts');
const mc = read('src/systems/sound/MusicController.ts');
const app = read('src/App.tsx');

test('crossfade cleanup pauses retired decks, never the live one', () => {
    // The guard must skip the pause when the deck has become live again — the
    // old inverted guard paused the ACTIVE deck on a quick A→B→A reuse (the
    // intermittent "music cuts out" stutter) and never cleaned up retired decks.
    assert.match(sm, /if \(this\.activeDeck === prevDeckId\) return;/);
    assert.doesNotMatch(sm, /this\.activeDeck !== \(nextDeckId === 'A' \? 'B' : 'A'\)/);
    // The pause timeout lives in the per-deck stop slot, so stopMusic AND a
    // playMusic that reuses the deck both cancel it deterministically.
    assert.match(sm, /this\.clearMusicStopTimeout\(prevDeckId\);/);
    assert.match(sm, /if \(prevDeckId === 'A'\) this\.musicStopTimeoutA = pauseTimeout;/);
});

test('live playback-rate changes are clamped to sane musical shifts', () => {
    assert.match(sm, /if \(!Number\.isFinite\(rate\) \|\| rate < 0\.5 \|\| rate > 2\) return;/);
});

test('entering the menu resets frenzy and both deck rates to 1.0', () => {
    // Menu music must always play as-authored, regardless of what a boss fight
    // did to the decks. The menu switch uses a zero-length fade, so the reset
    // can never cause an audible mid-fade pitch snap.
    const enteringMenuBlock = mc.slice(mc.indexOf('} else if (enteringMenu) {'), mc.indexOf('} else if (leavingMenuForWorld)'));
    assert.match(enteringMenuBlock, /this\.bossFrenzy = false;/);
    assert.match(enteringMenuBlock, /soundManager\.setMusicPlaybackRate\(1\.0\);/);
    // Night slowdown + frenzy never apply to MENU tracks at start either.
    assert.match(mc, /this\.currentContext !== 'MENU'\s*\n\s*&& this\.currentContext !== 'DEATH'/);
});

test('aggro flicker cannot thrash the boss music', () => {
    // Leaving the boss context while the boss is still alive (combat:stop for a
    // beat mid-fight) is debounced; a real end (boss dead, player dead, menu)
    // still switches instantly.
    assert.match(mc, /leavingLiveBossFlicker/);
    assert.match(mc, /&& this\.bossAlive && !inMenu;/);
    assert.match(mc, /leavingLiveBossFlicker\s*\n?\s*\? 3000/);
});

test('the sound manifest only reloads from the explicit /sound reload command', () => {
    // No menu/render path may clear buffers or reload the manifest while music
    // is playing.
    const reloadCalls = [...app.matchAll(/soundManager\.reloadManifest\(\)/g)];
    assert.equal(reloadCalls.length, 1, 'reloadManifest must have exactly one caller in App');
    const idx = app.indexOf('soundManager.reloadManifest()');
    const context = app.slice(Math.max(0, idx - 400), idx);
    assert.match(context, /'\/sound'/, 'reloadManifest must sit inside the /sound command handler');
    // init() must not re-run the manifest/folder-index load once initialized.
    assert.match(sm, /Already initialized — just resume if suspended/);
});
