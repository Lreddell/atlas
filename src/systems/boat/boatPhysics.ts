
import { WorldManager } from '../WorldManager';
import { checkCollision, getSupportTop } from '../player/playerCollision';
import { BlockType, Boat } from '../../types';
import { CONTACT_EPS } from '../player/playerConstants';

// --- Boat dimensions ---
// boat.position is the hull bottom center. The collision box is deliberately
// squat so the boat can pass under overhangs a player couldn't.
export const BOAT_WIDTH = 1.2;
export const BOAT_HEIGHT = 0.55;

// Rider seating: player feet sit slightly above the hull bottom, and the
// camera uses a lowered "seated" eye height.
export const BOAT_RIDER_FEET_OFFSET = 0.2;
export const BOAT_SEAT_EYE_HEIGHT = 1.15;

// Water surface sits at the top of the water cell; the hull floats with a
// small draft below the surface.
const WATER_SURFACE = 0.9;
const BOAT_DRAFT = 0.2;

// Speeds (blocks/sec). Water speed is ~2x sprint so boats meaningfully beat
// swimming AND overland sprinting along a coast. On land the boat only scrapes.
const BOAT_WATER_SPEED = 9.0;
const BOAT_LAND_SPEED = 1.2;

// Per-tick velocity retention (same friction model as playerMovement).
const BOAT_WATER_FRICTION = 0.9;
const BOAT_LAND_FRICTION = 0.55;
const BOAT_AIR_FRICTION = 0.95;

const BOAT_GRAVITY = 24;
const BOAT_TERMINAL_VEL = 30;

export interface BoatIntent {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
}

/**
 * Top Y of the water surface the boat should float on at (x, z), or null when
 * the boat isn't over water near its current height. Scans a short column
 * around the hull so a boat pushed slightly under (waves, falls) recovers.
 */
export function findWaterSurfaceY(wm: WorldManager, x: number, y: number, z: number): number | null {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const startY = Math.floor(y + BOAT_DRAFT);

    let waterY: number | null = null;
    for (let by = startY; by >= startY - 2; by--) {
        if (wm.getBlock(bx, by, bz, false) === BlockType.WATER) {
            waterY = by;
            break;
        }
    }
    if (waterY === null) return null;

    // Climb to the top of the contiguous water column (bounded).
    for (let i = 0; i < 3; i++) {
        if (wm.getBlock(bx, waterY + 1, bz, false) === BlockType.WATER) waterY++;
        else break;
    }
    return waterY + WATER_SURFACE;
}

/**
 * One fixed-timestep boat physics step. Mutates boat.position / boat.velocity /
 * boat.yaw in place (boats follow the Drop pattern of in-place mutation).
 *
 * `intent` + `cameraYaw` drive the boat when ridden; pass null when idle so the
 * boat just floats, settles, and stops.
 */
export function simulateBoatStep(
    wm: WorldManager,
    boat: Boat,
    intent: BoatIntent | null,
    cameraYaw: number,
    dt: number
): void {
    const pos = boat.position;
    const vel = boat.velocity;

    const surfaceY = findWaterSurfaceY(wm, pos[0], pos[1], pos[2]);
    const onWater = surfaceY !== null;

    const grounded = !onWater && checkCollision(
        wm,
        { x: pos[0], y: pos[1] - 0.05, z: pos[2] },
        BOAT_WIDTH,
        BOAT_HEIGHT
    );

    // --- Horizontal: friction + input acceleration (equilibrium = top speed) ---
    const friction = onWater ? BOAT_WATER_FRICTION : (grounded ? BOAT_LAND_FRICTION : BOAT_AIR_FRICTION);
    vel[0] *= friction;
    vel[2] *= friction;

    if (intent) {
        let ix = 0, iz = 0;
        if (intent.forward) iz -= 1;
        if (intent.backward) iz += 1;
        if (intent.left) ix -= 1;
        if (intent.right) ix += 1;

        if (ix !== 0 || iz !== 0) {
            const len = Math.hypot(ix, iz);
            ix /= len; iz /= len;
            // Rotate into world space around Y by the camera yaw.
            const sin = Math.sin(cameraYaw);
            const cos = Math.cos(cameraYaw);
            const wx = ix * cos + iz * sin;
            const wz = -ix * sin + iz * cos;

            const targetSpeed = onWater ? BOAT_WATER_SPEED : BOAT_LAND_SPEED;
            const accel = targetSpeed * (1 - friction);
            vel[0] += wx * accel;
            vel[2] += wz * accel;
        }
    }

    // --- Vertical: buoyancy spring toward the float line, else gravity ---
    if (onWater) {
        const targetY = (surfaceY as number) - BOAT_DRAFT;
        // Critically-damped-ish approach: velocity proportional to offset.
        vel[1] = Math.max(-3, Math.min(3, (targetY - pos[1]) * 6));
    } else {
        vel[1] -= BOAT_GRAVITY * dt;
        if (vel[1] < -BOAT_TERMINAL_VEL) vel[1] = -BOAT_TERMINAL_VEL;
    }

    // --- Integration with axis-separated collision (as the player does) ---
    const dx = vel[0] * dt;
    pos[0] += dx;
    if (checkCollision(wm, { x: pos[0], y: pos[1] + 0.05, z: pos[2] }, BOAT_WIDTH, BOAT_HEIGHT)) {
        pos[0] -= dx;
        vel[0] = 0;
    }

    const dz = vel[2] * dt;
    pos[2] += dz;
    if (checkCollision(wm, { x: pos[0], y: pos[1] + 0.05, z: pos[2] }, BOAT_WIDTH, BOAT_HEIGHT)) {
        pos[2] -= dz;
        vel[2] = 0;
    }

    const dy = vel[1] * dt;
    pos[1] += dy;
    if (checkCollision(wm, { x: pos[0], y: pos[1], z: pos[2] }, BOAT_WIDTH, BOAT_HEIGHT)) {
        pos[1] -= dy;
        if (vel[1] < 0) {
            const support = getSupportTop(wm, { x: pos[0], y: pos[1], z: pos[2] }, BOAT_WIDTH);
            if (support !== null) pos[1] = support + CONTACT_EPS;
        }
        vel[1] = 0;
    }

    // --- Heading: turn the hull toward the motion direction while moving ---
    const hSpeed = Math.hypot(vel[0], vel[2]);
    if (hSpeed > 0.5) {
        const targetYaw = Math.atan2(-vel[0], -vel[2]);
        let diff = targetYaw - boat.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        boat.yaw += diff * Math.min(1, 10 * dt);
    }
}
