import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Source-text wiring tests (these modules pull in enums/DOM, per repo convention).
const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('drops only age toward despawn while loaded near the player (drop-aging rule)', () => {
    const app = read('src/App.tsx');
    // The despawn timer advances only while the drop is within the loaded range of
    // the player, so wandering far pauses it instead of deleting the drop.
    assert.match(app, /const loadedRange = renderDistance \* CHUNK_SIZE \+ CHUNK_SIZE/);
    assert.match(app, /if \(dx \* dx \+ dz \* dz <= loadedR2\) d\.age \+= TICK_MS/);
    assert.match(app, /d\.age < DROP_LIFETIME_MS/);
    // The old wall-clock despawn (deleted drops regardless of distance) is gone.
    assert.doesNotMatch(app, /now - d\.createdAt < DROP_LIFETIME_MS/);

    // Drop entities carry the accumulated loaded-age clock.
    const types = read('src/types.ts');
    assert.match(types, /age: number/);
});

test('turning off boss frenzy does not snap the fading track pitch (no glitch)', () => {
    const mc = read('src/systems/sound/MusicController.ts');
    // Only the ON path applies the rate live; OFF leaves the fading track alone so
    // the next track (death/world) starts fresh at 1.0 via playNextTrack().
    assert.match(mc, /if \(active\) \{[\s\S]*?setMusicPlaybackRate\(FRENZY_PLAYBACK_RATE\)/);
    assert.doesNotMatch(mc, /setMusicPlaybackRate\(active \? FRENZY_PLAYBACK_RATE : 1\.0\)/);
});

test('the death screen no longer shows a score', () => {
    const ds = read('src/components/ui/DeathScreen.tsx');
    assert.doesNotMatch(ds, /Score/);
});
