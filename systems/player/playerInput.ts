
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
}

// Internal state for double-tap detection
let lastForwardPressTime = 0;
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
    flyToggleTrigger: false
};

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight']);

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
            if (!inputState.forward) { // Edge trigger
                if (now - lastForwardPressTime < DOUBLE_TAP_WINDOW_MS) {
                    doubleTapSprintActive = true;
                }
                lastForwardPressTime = now;
            }
            inputState.forward = true; 
            // If CTRL is held when W is pressed, latch sprint
            if (inputState.sprint) inputState.sprintLatch = true;
            break;
        case 'KeyS': 
        case 'ArrowDown':
            inputState.backward = true; 
            break;
        case 'KeyA': 
        case 'ArrowLeft':
            inputState.left = true; 
            break;
        case 'KeyD': 
        case 'ArrowRight':
            inputState.right = true; 
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
            // If W is already held when CTRL is pressed, latch sprint
            if (inputState.forward) inputState.sprintLatch = true;
            break;
    }
};

export const onKeyUp = (code: string) => {
    switch (code) {
        case 'KeyW': 
        case 'ArrowUp':
            inputState.forward = false; 
            doubleTapSprintActive = false; // Stop sprinting if forward is released
            inputState.sprintLatch = false; // Reset latch on stop
            break;
        case 'KeyS': 
        case 'ArrowDown':
            inputState.backward = false; 
            break;
        case 'KeyA': 
        case 'ArrowLeft':
            inputState.left = false; 
            break;
        case 'KeyD': 
        case 'ArrowRight':
            inputState.right = false; 
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
    // Sprint is active if (CTRL Held OR double-tap is active OR Latch is active) AND moving forward AND NOT sneaking
    const isSprinting = (inputState.sprint || inputState.sprintLatch || doubleTapSprintActive) && inputState.forward && !inputState.sneak;
    
    // Copy the trigger and reset it immediately
    const flyToggle = inputState.flyToggleTrigger;
    inputState.flyToggleTrigger = false;

    return {
        ...inputState,
        sprint: isSprinting,
        flyToggle,
        cancelDoubleTap: () => { 
            doubleTapSprintActive = false; 
            inputState.sprintLatch = false;
        }
    };
};

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
    doubleTapSprintActive = false;
    lastForwardPressTime = 0;
    lastJumpPressTime = 0;
};
