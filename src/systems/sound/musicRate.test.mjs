import assert from 'node:assert/strict';
import test from 'node:test';

import {
    NO_MUSIC_MODIFIERS, composeSemitones, playbackRateForSemitones, resolveMusicPlaybackRate,
} from './musicRate.ts';

const mods = (over = {}) => ({ ...NO_MUSIC_MODIFIERS, ...over });
const near = (actual, expected, label) =>
    assert.ok(Math.abs(actual - expected) < 1e-12, `${label}: ${actual} !== ${expected}`);

test('the rate table, exactly', () => {
    const cases = [
        ['day, normal', {}, 0, 1],
        ['night only', { night: true }, -1, 2 ** (-1 / 12)],
        ['day + boss final phase', { bossFrenzy: true }, 1, 2 ** (1 / 12)],
        ['night + boss final phase', { night: true, bossFrenzy: true }, 0, 1],
    ];
    for (const [label, over, semitones, rate] of cases) {
        assert.equal(composeSemitones(mods(over)), semitones, `${label} semitones`);
        near(resolveMusicPlaybackRate(mods(over)), rate, label);
    }
});

test('night and the frenzy compose rather than overriding each other', () => {
    // The old behaviour: the frenzy simply won, so a night track in the final
    // phase sounded identical to a day track in the final phase.
    const nightFrenzy = resolveMusicPlaybackRate(mods({ night: true, bossFrenzy: true }));
    const dayFrenzy = resolveMusicPlaybackRate(mods({ bossFrenzy: true }));
    assert.notEqual(nightFrenzy, dayFrenzy);
    near(nightFrenzy, 1, 'night + frenzy lands back on the authored pitch');
});

test('each modifier can be removed independently, leaving the other', () => {
    const both = mods({ night: true, bossFrenzy: true });
    assert.equal(composeSemitones({ ...both, bossFrenzy: false }), -1, 'the fight ending leaves night');
    assert.equal(composeSemitones({ ...both, night: false }), 1, 'a day track keeps the frenzy');
});

test('semitone conversion is the authored constant', () => {
    near(playbackRateForSemitones(1), 1.0594630943592953, '+1 semitone');
    near(playbackRateForSemitones(-1), 0.9438743126816935, '-1 semitone');
    assert.equal(playbackRateForSemitones(0), 1);
    // Up then down returns exactly, so a modifier clearing cannot leave the music detuned.
    near(playbackRateForSemitones(1) * playbackRateForSemitones(-1), 1, 'round trip');
});

test('every rate stays inside the sound layer clamp of 0.5..2', () => {
    for (const night of [false, true]) {
        for (const bossFrenzy of [false, true]) {
            const rate = resolveMusicPlaybackRate({ night, bossFrenzy });
            assert.ok(rate >= 0.5 && rate <= 2, `${night}/${bossFrenzy} -> ${rate}`);
        }
    }
});
