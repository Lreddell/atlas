import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import ts from 'typescript';
import * as transitions from './musicTransitions.ts';
import * as rate from './musicRate.ts';

const code = ts.transpileModule(readFileSync(new URL('./MusicController.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
function harness() {
    const listeners = new Map(), tracks = [], rates = [];
    const modules = {
        './SoundManager': { soundManager: {
            hasTracksForEvent: () => true, getBiomeTags: () => [],
            playMusic: async (id, _fade, ended, _out, playbackRate) => { tracks.push({ id, ended, playbackRate }); return true; },
            setMusicPlaybackRate: value => rates.push(value), stopMusic() {}, getActiveMusicTimeRemaining: () => null,
        } },
        './musicRate': rate, './musicTransitions': transitions,
        '../world/magneticFields': { MAGNETIC_WARDEN_BOSS_ID: 'magnetic_warden' },
        '../events/GameEvents': { gameEvents: { on: (name, fn) => listeners.set(name, fn) } },
    };
    const exports = {};
    new Function('require', 'exports', code)(name => modules[name], exports);
    return { music: exports.musicController, tracks, rates, emit: (name, payload = {}) => listeners.get(name)?.(payload) };
}

test('boss loops keep the initiation day/night rate and the final-phase modifier', async () => {
    for (const night of [false, true]) {
        const { music, tracks, emit } = harness();
        music.isNight = night;
        emit('boss:spawned', { bossId: 'magnetic_warden' });
        music.currentContext = 'BOSS_MAGNETIC';
        await music.playNextTrack(0);
        const firstRate = tracks.at(-1).playbackRate;
        music.setBossFrenzy(true);
        music.update(false, 'survival', 'plains', false, false, null, !night);
        music.setNightSlowdownEnabled(!night);
        await music.playNextTrack(0); // Crossfade / natural loop after day turns to night.
        assert.ok(Math.abs(tracks.at(-1).playbackRate - firstRate * 2 ** (1 / 12)) < 1e-12);
        tracks.at(-1).ended();
        assert.equal(music.nextPlayTime, 0);
        await music.playNextTrack(0);
        assert.equal(tracks.at(-1).id, 'music.boss_magnetic_warden');
        assert.ok(music.bossFrenzy);
    }
});

test('lost aggro and unrelated boss events cannot end ongoing Warden music', () => {
    const { music, emit } = harness();
    emit('boss:spawned', { bossId: 'magnetic_warden' });
    music.currentContext = 'BOSS_MAGNETIC'; music.isPlaying = true;
    emit('combat:stop');
    emit('boss:defeated', { bossId: 'bell_titan' });
    emit('boss:cleared', { bossId: 'bell_titan' });
    music.update(false, 'survival', 'plains', false, true, 1000, true);
    assert.equal(music.pendingContext, 'BOSS_MAGNETIC');
    assert.equal(music.currentContext, 'BOSS_MAGNETIC');
    emit('boss:defeated', { bossId: 'magnetic_warden' });
    music.update(false, 'survival', 'plains', false, true, 1000, true);
    assert.equal(music.currentContext, 'BLOODMOON');
});
