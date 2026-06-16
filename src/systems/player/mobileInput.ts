// Shared mutable state written by the touch UI (MobileControls) and read by the
// game systems. Kept as a single module-level object (like playerInput's inputState)
// so touch controls never trigger React re-renders and the hot loops just read fields.
//
// Movement/jump/sneak are written straight into the existing inputState
// (forward/back/left/right/jump/sneak/sprint), so there is ONE movement pipeline.
// This module only holds the things inputState has no slot for: camera-look deltas
// and the break/use action flags.
export interface MobileInputState {
    // Accumulated look delta in CSS pixels since the last frame consumed it. The
    // camera applies and zeroes these every frame, so a dropped frame can't lose input.
    lookDX: number;
    lookDY: number;
    // Break/attack held (acts like holding left mouse).
    attack: boolean;
    // Use/place held (acts like holding right mouse — continuous placing / eating).
    use: boolean;
    // One-shot "use" edge for a tap (acts like a single right-click: first place,
    // open containers). Set on touch start, consumed once by the interaction loop.
    useTriggered: boolean;
}

export const mobileInput: MobileInputState = {
    lookDX: 0,
    lookDY: 0,
    attack: false,
    use: false,
    useTriggered: false,
};

// Drain the accumulated look delta (called once per frame by the camera).
export function consumeMobileLook(out: { dx: number; dy: number }): void {
    out.dx = mobileInput.lookDX;
    out.dy = mobileInput.lookDY;
    mobileInput.lookDX = 0;
    mobileInput.lookDY = 0;
}

// Clear transient action/look state (e.g. when leaving gameplay), leaving movement
// to resetInputState in playerInput.
export function resetMobileInput(): void {
    mobileInput.lookDX = 0;
    mobileInput.lookDY = 0;
    mobileInput.attack = false;
    mobileInput.use = false;
    mobileInput.useTriggered = false;
}
