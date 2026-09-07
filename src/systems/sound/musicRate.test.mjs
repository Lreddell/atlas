import assert from 'node:assert/strict';
import test from 'node:test';

import {
    NO_MUSIC_MODIFIERS, composeSemitones, playbackRateForSemitones, resolveMusicPlaybackRate,
} from './musicRate.ts';

const mods = (over = {}) => ({ ...NO_MUSIC_MODIFIERS, ...over });
const near = (actual, expected, label) =>
    assert.ok(Math.abs(actual - expected) < 1e-12, `${label}: ${actual} !== ${expected}`);

test('the required rate table, exactly', () => {
    const cases = [
        ['day, normal', {}, 0, 1],
        ['night only', { night: true }, -1, 2 ** (-1 / 12)],
        ['day + boss final phase', { bossFrenzy: true }, 1, 2 ** (1 / 12)],
        ['night + boss final phase', { night: true, bossFrenzy: true }, 0, 1],
        ['day + low health', { lowHealth: true }, 1, 2 ** (1 / 12)],
        ['night + low health', { night: true, lowHealth: true }, 0, 1],
        ['day + boss + low health', { bossFrenzy: true, lowHealth: true }, 2, 2 ** (2 / 12)],
        ['night + boss + low health', { night: true, bossFrenzy: true, lowHealth: true }, 1, 2 ** (1 / 12)],
    ];
    for (const [label, over, semitones, rate] of cases) {
        assert.equal(composeSemitones(mods(over)), semitones, `${label} semitones`);
        near(resolveMusicPlaybackRate(mods(over)), rate, label);
    }
});

test('boss and low health stack rather than capping at one semitone', () => {
    const both = resolveMusicPlaybackRate(mods({ bossFrenzy: true, lowHealth: true }));
    const one = resolveMusicPlaybackRate(mods({ bossFrenzy: true }));
    assert.ok(both > one, 'two contributions must beat one');
    near(both, 2 ** (2 / 12), 'stacked');
    // The old behaviour, where the frenzy simply overrode everything else.
    assert.notEqual(both, one);
});

test('each modifier can be removed independently, leaving the others', () => {
    const all = mods({ night: true, bossFrenzy: true, lowHealth: true });
    // Healing removes exactly its +1.
    assert.equal(composeSemitones({ ...all, lowHealth: false }), 0);
    // The fight ending removes exactly its +1.
    assert.equal(composeSemitones({ ...all, bossFrenzy: false }), 0);
    // A day track composes the same two the same way.
    assert.equal(composeSemitones({ ...all, night: false }), 2);
});

test('semitone conversion is the authored constant', () => {
    near(playbackRateForSemitones(1), 1.0594630943592953, '+1 semitone');
    near(playbackRateForSemitones(-1), 0.9438743126816935, '-1 semitone');
    assert.equal(playbackRateForSemitones(0), 1);
    // Up then down returns exactly, so a heal cannot leave the music detuned.
    near(playbackRateForSemitones(1) * playbackRateForSemitones(-1), 1, 'round trip');
});

test('every rate stays inside the sound layer clamp of 0.5..2', () => {
    for (const night of [false, true]) {
        for (const bossFrenzy of [false, true]) {
            for (const lowHealth of [false, true]) {
                const rate = resolveMusicPlaybackRate({ night, bossFrenzy, lowHealth });
                assert.ok(rate >= 0.5 && rate <= 2, `${night}/${bossFrenzy}/${lowHealth} -> ${rate}`);
            }
        }
    }
});
