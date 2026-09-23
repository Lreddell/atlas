// Where the boss is relative to the screen, written each frame by the in-Canvas
// tracker and read by the DOM compass. Plain mutable state (no React) so the
// HUD can poll it cheaply without re-rendering the scene.

export interface BossCompassState {
    /** A live boss exists. */
    active: boolean;
    /** The boss is inside the view frustum (no compass needed). */
    onScreen: boolean;
    /** Screen-space angle (radians, 0 = up, clockwise) toward the boss when off screen. */
    angle: number;
    /** Horizontal distance to the boss (blocks). */
    distance: number;
    /** The boss's polarity (+1 / -1) for the compass colour. */
    polarity: number;
    /** Whether the boss is above the player (a climb target) or below. */
    above: boolean;
}

export const bossCompassState: BossCompassState = {
    active: false,
    onScreen: true,
    angle: 0,
    distance: 0,
    polarity: 1,
    above: false,
};
