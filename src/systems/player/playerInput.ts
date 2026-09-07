
import { gameEvents } from '../events/GameEvents';
import { viewRig } from './viewRig';
import {
    canDirectionSprint, isDoubleTap, isSprinting,
    sprintDriveHeld as sprintDriveHeldRule, type Direction,
} from './sprintRule';

export interface PlayerInputState {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    jump: boolean;
    sneak: boolean;
    sprint: boolean;
    sprintLatch: boolean;
    flyToggleTrigger: boolean;
    /** Player's chosen magnetic polarity (+1 / -1); only effective with polarity boots. */
    magneticPolarity: number;
    /** Whether the polarity ability is switched on (toggled with N on upgraded boots). */
    polarityPowerOn: boolean;
    /** True while a bite is actively charging (drives the held-item eat animation). */
    eating: boolean;
    /**
     * Timestamp (ms) of the last dodge press (C), or 0. Kept as a timestamp
     * rather than a boolean so a press that lands between physics substeps is
     * still honoured a few frames later (the input buffer every action game
     * needs: at 60 fps only every third frame runs a 20 Hz substep, so a
     * one-frame flag loses two presses out of three).
     */
    dodgePressedAt: number;
}

// Internal state for double-tap detection. The direction is remembered with the
// time so a double tap always means the SAME key twice, never W then A.
let lastTapDirection: Direction | null = null;
let lastTapTime = 0;
let lastJumpPressTime = 0;
let doubleTapSprintActive = false;
const DOUBLE_TAP_WINDOW_MS = 400;

export const inputState: PlayerInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sneak: false,
    sprint: false,
    sprintLatch: false,
    flyToggleTrigger: false,
    magneticPolarity: 1,
    polarityPowerOn: true,
    eating: false,
    dodgePressedAt: 0,
};

/**
 * How long a dodge press stays queued once the physics has had a chance to
 * answer it. The window is checked AFTER a frame's substeps run, never before,
 * so a slow frame can never expire a press it was never offered.
 */
export const DODGE_BUFFER_MS = 260;

// Bridge between the mouse-look handler (CameraControls) and the wall-adhesion
// camera (Player). While `active`, the pointer-lock handler stops driving the
// world-up Euler camera and instead accumulates raw deltas here, which Player
// consumes as look around the wall normal. When inactive this is untouched, so
// normal first-person look is completely unaffected.
export const lookBridge = {
    active: false,
    dYaw: 0,
    dPitch: 0,
};

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyC']);

/** Whether every walk direction can sprint, rather than forward alone (F6). */
const omniSprint = (): boolean => viewRig.mode === 'free';

/** The keys that can start and sustain a sprint in the current view. */
const sprintDriveHeld = (): boolean => sprintDriveHeldRule(inputState, omniSprint());

/**
 * A walk key going down. Only forward starts a sprint in the welded views; in
 * the free view any of the four can, so the double-tap and the Ctrl latch both
 * follow whichever direction is actually driving the run.
 */
const pressDirection = (dir: Direction, now: number): void => {
    const canSprint = canDirectionSprint(dir, omniSprint());
    if (canSprint && !inputState[dir]) { // Edge trigger
        if (isDoubleTap(dir, lastTapDirection, lastTapTime, now, DOUBLE_TAP_WINDOW_MS)) {
            doubleTapSprintActive = true;
        }
        lastTapDirection = dir;
        lastTapTime = now;
    }
    inputState[dir] = true;
    // If CTRL is held when the key is pressed, latch sprint
    if (canSprint && inputState.sprint) inputState.sprintLatch = true;
};

/**
 * A walk key going up. The sprint only ends once nothing is driving it any
 * more, so in the free view you can switch headings mid-run without dropping
 * out of the sprint.
 */
const releaseDirection = (dir: Direction): void => {
    inputState[dir] = false;
    if (sprintDriveHeld()) return;
    doubleTapSprintActive = false;
    inputState.sprintLatch = false; // Reset latch on stop
};

export const onKeyDown = (code: string, e?: KeyboardEvent) => {
    // Intercept game keys to prevent browser/OS shortcuts
    if (e && GAME_KEYS.has(code)) {
        e.preventDefault();
        e.stopPropagation();
    }

    const now = Date.now();

    switch (code) {
        case 'KeyW':
        case 'ArrowUp':
            pressDirection('forward', now);
            break;
        case 'KeyS':
        case 'ArrowDown':
            pressDirection('backward', now);
            break;
        case 'KeyA':
        case 'ArrowLeft':
            pressDirection('left', now);
            break;
        case 'KeyD':
        case 'ArrowRight':
            pressDirection('right', now);
            break;
        case 'Space': 
            if (!inputState.jump) {
                if (now - lastJumpPressTime < DOUBLE_TAP_WINDOW_MS) {
                    inputState.flyToggleTrigger = true; 
                }
                lastJumpPressTime = now;
            }
            inputState.jump = true; 
            break;
        case 'ShiftLeft': 
        case 'ShiftRight':
            inputState.sneak = true;
            doubleTapSprintActive = false;
            inputState.sprintLatch = false; // Sneak cancels sprint
            break;
        case 'ControlLeft':
        case 'ControlRight':
            if (e && e.repeat) break;
            inputState.sprint = true;
            // If a direction is already held when CTRL is pressed, latch sprint
            if (sprintDriveHeld()) inputState.sprintLatch = true;
            break;
        case 'KeyR':
            if (e && e.repeat) break;
            // Suppress the browser's Ctrl/Cmd+R reload, but STILL flip polarity :
            // the player is usually holding Ctrl (sprint) during a fight, and that
            // must not eat the polarity swap. (The global shortcut block also stops
            // reload; this is belt-and-suspenders.)
            if (e && (e.ctrlKey || e.metaKey)) e.preventDefault();
            // Flip magnetic polarity (only has an effect while wearing polarity boots).
            inputState.magneticPolarity = inputState.magneticPolarity >= 0 ? -1 : 1;
            gameEvents.emit('ability:changed', { abilityId: 'polarity', active: inputState.magneticPolarity > 0 });
            break;
        case 'KeyN':
            // Toggle the polarity ability on/off (only effective with upgraded boots).
            if (e && e.repeat) break;
            inputState.polarityPowerOn = !inputState.polarityPowerOn;
            gameEvents.emit('ability:changed', { abilityId: 'polarity-power', active: inputState.polarityPowerOn });
            break;
        case 'KeyC':
            // The kit button: resolved by the player physics into a roll, a
            // magnetic dash, a repel leap, or a launch off the wall. C sits
            // under the left hand without leaving WASD, and is the only such
            // key Atlas had free (Q drops, E opens, R flips, Shift/Ctrl/Space
            // are sneak/sprint/jump).
            if (e && e.repeat) break;
            inputState.dodgePressedAt = now;
            break;
    }
};

export const onKeyUp = (code: string) => {
    switch (code) {
        case 'KeyW':
        case 'ArrowUp':
            releaseDirection('forward');
            break;
        case 'KeyS':
        case 'ArrowDown':
            releaseDirection('backward');
            break;
        case 'KeyA':
        case 'ArrowLeft':
            releaseDirection('left');
            break;
        case 'KeyD':
        case 'ArrowRight':
            releaseDirection('right');
            break;
        case 'Space': 
            inputState.jump = false; 
            break;
        case 'ShiftLeft': 
        case 'ShiftRight':
            inputState.sneak = false; 
            break;
        case 'ControlLeft': 
        case 'ControlRight':
            inputState.sprint = false; 
            // Do NOT reset sprintLatch here. That allows letting go of Ctrl while continuing to run.
            break;
    }
};

export const getMovementIntent = () => {
    // Sprint is active if (CTRL Held OR double-tap is active OR Latch is active)
    // AND a direction that can drive a sprint is held AND NOT sneaking. That
    // direction is forward in the welded views and any of the four in the free
    // one, where the body runs forwards along whichever heading it turned onto.
    const omni = omniSprint();
    const sprinting = isSprinting(
        { sprint: inputState.sprint, sprintLatch: inputState.sprintLatch, doubleTap: doubleTapSprintActive },
        inputState, omni, inputState.sneak,
    );


    // Copy the triggers and reset them immediately. The dodge is NOT cleared
    // here: it stays queued (for DODGE_BUFFER_MS) until a physics substep
    // actually consumes it, so a press never falls between substeps.
    const flyToggle = inputState.flyToggleTrigger;
    inputState.flyToggleTrigger = false;
    const dodge = inputState.dodgePressedAt > 0;

    return {
        ...inputState,
        sprint: sprinting,
        /** The sprint may be running onto a heading other than camera-forward. */
        omniSprint: omni,
        flyToggle,
        dodge,
        cancelDoubleTap: () => {
            doubleTapSprintActive = false;
            inputState.sprintLatch = false;
        }
    };
};

/** The physics consumed the queued dodge (or it expired): clear the buffer. */
export const consumeDodgePress = (): void => {
    inputState.dodgePressedAt = 0;
};

/** How long the queued dodge press has been waiting (ms); 0 when none is queued. */
export const dodgePressAge = (): number =>
    (inputState.dodgePressedAt > 0 ? Date.now() - inputState.dodgePressedAt : 0);

export const resetInputState = () => {
    inputState.forward = false;
    inputState.backward = false;
    inputState.left = false;
    inputState.right = false;
    inputState.jump = false;
    inputState.sneak = false;
    inputState.sprint = false;
    inputState.sprintLatch = false;
    inputState.flyToggleTrigger = false;
    inputState.magneticPolarity = 1;
    inputState.polarityPowerOn = true;
    inputState.eating = false;
    inputState.dodgePressedAt = 0;
    doubleTapSprintActive = false;
    lastTapDirection = null;
    lastTapTime = 0;
    lastJumpPressTime = 0;
};
