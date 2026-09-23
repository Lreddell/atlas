// One resolver for the music playback rate.
//
// Two features independently want the music faster or slower, and they must
// compose rather than fight: before this, the boss frenzy simply overrode the
// night slowdown, so a night track in the final phase sounded the same as a day
// track in the final phase.
//
// They are composed in SEMITONE space and converted once at the end, so a night
// track (-1) that enters the frenzy (+1) lands back on the authored pitch rather
// than somewhere between two multipliers.

export interface MusicRateModifiers {
    /** The track PLAYING carries the authored night slowdown. */
    night: boolean;
    /** The Warden's final phase. */
    bossFrenzy: boolean;
}

export const NO_MUSIC_MODIFIERS: MusicRateModifiers = { night: false, bossFrenzy: false };

/** Semitone contribution of each modifier. */
export const NIGHT_SEMITONES = -1;
export const BOSS_FRENZY_SEMITONES = 1;

/** The sum of the active modifiers, in semitones. */
export function composeSemitones(mods: MusicRateModifiers): number {
    return (mods.night ? NIGHT_SEMITONES : 0)
        + (mods.bossFrenzy ? BOSS_FRENZY_SEMITONES : 0);
}

/**
 * Semitones to a playback-rate multiplier. Pitch preservation stays OFF
 * everywhere this is used, so speed and pitch move together — that coupling is
 * the effect, not a side effect.
 */
export function playbackRateForSemitones(semitones: number): number {
    return 2 ** (semitones / 12);
}

/** The final rate for a set of modifiers. */
export function resolveMusicPlaybackRate(mods: MusicRateModifiers): number {
    return playbackRateForSemitones(composeSemitones(mods));
}
