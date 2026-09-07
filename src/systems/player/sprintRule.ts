// When a walk key counts as "running", and which key can start a sprint.
//
// The welded views (first person, and the over-the-shoulder third person) keep
// the body facing the camera, so only W is running: A/D strafe and S backpedals,
// and both are deliberately slower than a sprint. The free third person (F6)
// unbolts the body from the camera — WASD picks one of eight headings around the
// camera and the body turns onto that heading and runs *forwards* along it — so
// there is no strafe or backpedal to hold back, and every direction sprints.
//
// Pure so the rule can be tested on its own; `playerInput` owns the live state
// and supplies the view mode.

/** The four walk keys, as the movement fields they set. */
export type Direction = 'forward' | 'backward' | 'left' | 'right';

/** Just the walk keys out of the input state. */
export interface DirectionKeys {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
}

export const DIRECTIONS: readonly Direction[] = ['forward', 'backward', 'left', 'right'];

/** Whether anything is asking the body to move. */
export function anyDirectionHeld(keys: DirectionKeys): boolean {
    return keys.forward || keys.backward || keys.left || keys.right;
}

/**
 * Whether a key that can drive a sprint is held. This is what starts a sprint,
 * sustains it, and — once it goes false — ends it, so switching headings
 * mid-run in the free view never drops you out of the sprint.
 */
export function sprintDriveHeld(keys: DirectionKeys, omni: boolean): boolean {
    return omni ? anyDirectionHeld(keys) : keys.forward;
}

/** Whether pressing `dir` can start a sprint (double tap, or latch onto Ctrl). */
export function canDirectionSprint(dir: Direction, omni: boolean): boolean {
    return dir === 'forward' || omni;
}

/**
 * Whether a fresh press of `dir` completes a double tap. The direction is part
 * of the comparison so a double tap always means the SAME key twice: W then A
 * inside the window is two different directions, not a sprint.
 */
export function isDoubleTap(
    dir: Direction, lastDir: Direction | null, lastTime: number, now: number, windowMs: number,
): boolean {
    return dir === lastDir && now - lastTime < windowMs;
}

/** The live sprint sources: Ctrl held, the Ctrl latch, and the double tap. */
export interface SprintSources {
    sprint: boolean;
    sprintLatch: boolean;
    doubleTap: boolean;
}

/**
 * The sprint rule: some source is asking to sprint, a key that can drive one is
 * held, and the player is not sneaking (sneak always wins, in every view).
 */
export function isSprinting(
    sources: SprintSources, keys: DirectionKeys, omni: boolean, sneak: boolean,
): boolean {
    return (sources.sprint || sources.sprintLatch || sources.doubleTap)
        && sprintDriveHeld(keys, omni)
        && !sneak;
}
