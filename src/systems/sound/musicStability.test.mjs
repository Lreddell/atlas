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
    // The guard must skip the pause when the deck has become live again, the
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
    assert.match(sm, /Already initialized, just resume if suspended/);
});

test('every biome has a tag config, and every tag has a folder + manifest event', () => {
    const biomes = read('src/systems/world/biomes.ts');
    const defaults = read('src/systems/sound/soundDefaults.ts');
    const musicRoot = path.join(root, 'public/assets/rvx/sounds/music');
    const biomeIds = [...new Set([...biomes.matchAll(/id:\s*'([a-z_]+)'/g)].map((m) => m[1]))];
    assert.ok(biomeIds.length >= 20, 'expected to find the biome id list');

    for (const id of biomeIds) {
        // Each biome has a tag-config folder listing its active tags.
        const cfgPath = path.join(musicRoot, 'biomes', id, 'tags.json');
        assert.ok(fs.existsSync(cfgPath), `music/biomes/${id}/tags.json is missing`);
        const tags = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        assert.ok(Array.isArray(tags) && tags.length > 0, `${id} must list at least one tag`);
        // The same biome must have a code-default entry (safety net before load).
        assert.match(mc, new RegExp(`\\b${id}:\\s*\\[`), `${id} missing from BIOME_TAGS default`);

        for (const tag of tags) {
            // Every referenced tag has a song folder and a manifest event.
            assert.ok(fs.existsSync(path.join(musicRoot, tag)), `tag folder music/${tag} is missing (used by ${id})`);
            assert.match(defaults, new RegExp(`"music\\.${tag}":`), `manifest event music.${tag} is missing (used by ${id})`);
        }
    }
    // The consolidated tags exist and the redundant ones are gone.
    assert.ok(fs.existsSync(path.join(musicRoot, 'mesa')), 'mesa tag folder must exist');
    assert.ok(!fs.existsSync(path.join(musicRoot, 'red_mesa')), 'red_mesa tag folder should be removed');
    assert.ok(!fs.existsSync(path.join(musicRoot, 'mesa_bryce')), 'mesa_bryce tag folder should be removed');
    assert.doesNotMatch(defaults, /"music\.cherry"/, 'legacy music.cherry event should be removed');
});

test('music pools songs across a biome\'s tags, with cross-biome continuity', () => {
    // Selection pools every tag that actually has songs and picks one at random.
    assert.match(mc, /this\.tagsForContext\(this\.currentContext\)\s*\n?\s*\.filter\(tag => soundManager\.hasTracksForEvent\(`music\.\$\{tag\}`\)\)/);
    // Continuity: keep the current song if the new context still uses its tag.
    assert.match(mc, /this\.isPlaying && this\.currentTrackTag && newTags\.includes\(this\.currentTrackTag\)/);
    // Cave biomes route to their own music underground, else the generic caves pack.
    assert.match(mc, /biomeId === 'lush_caves' \|\| biomeId === 'dripstone_caves'/);
    // Biome tags come from the folder config with a code default fallback.
    assert.match(mc, /soundManager\.getBiomeTags\(context\)/);
});

test('music transitions never own or truncate gameplay one-shot voices', () => {
    const stopMusic = sm.slice(sm.indexOf('public stopMusic'), sm.indexOf('public getActiveMusicTimeRemaining'));
    assert.doesNotMatch(stopMusic, /activeSources|activeByEvent|\.stop\(/);
    assert.match(sm, /private readonly MAX_EVENT_SOURCES = 4;/);
    assert.match(sm, /activeByEvent/);
    assert.match(sm, /source\.onended = \(\) =>/);
});

test('pause muffling is idempotent and replaces old automation instead of stacking it', () => {
    const pauseMethod = sm.slice(sm.indexOf('public setGamePaused'), sm.indexOf('public async preload'));
    assert.match(sm, /private gamePaused: boolean = false;/);
    assert.match(pauseMethod, /if \(this\.gamePaused === paused\) return;/);
    assert.match(pauseMethod, /cancelScheduledValues\(now\)/);
    assert.match(pauseMethod, /linearRampToValueAtTime/);
    assert.doesNotMatch(pauseMethod, /setTargetAtTime/);
});

test('authored-only Vault assets log once in development and stay silent in production', () => {
    assert.match(sm, /missingAuthoredAssetsLogged/);
    assert.match(sm, /import\.meta[\s\S]{0,100}env\?\.[\s\S]{0,40}DEV/);
    assert.match(sm, /if \(!allowFallback\)/);
    assert.match(
        sm,
        /if \(!allowFallback\) \{[\s\S]{0,160}reportMissingAuthoredAsset[\s\S]{0,80}return null;[\s\S]{0,40}\}\s*const fallback =/,
    );
});
