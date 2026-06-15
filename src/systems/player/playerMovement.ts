
import * as THREE from 'three';
import { WorldManager } from '../WorldManager';
import { checkCollision, hasGroundSupport, getSupportTop } from './playerCollision';
import { BlockType } from '../../types';
import { 
    PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_HEIGHT_SNEAK, 
    WALK_SPEED, SPRINT_MULTIPLIER, SNEAK_MULTIPLIER,
    GRAVITY, JUMP_VELOCITY, TERMINAL_VELOCITY, SPRINT_JUMP_BOOST,
    GROUND_FRICTION, AIR_FRICTION, FLUID_FRICTION, AIR_CONTROL, SPRINT_STOP_GRACE_TICKS,
    SAFE_WALK_STEP, CONTACT_EPS, GROUND_EPS,
    SWIM_SPEED, SWIM_SUBMERGED_SPEED, LAVA_HORIZONTAL_REDUCTION,
    FLUID_GRAVITY, FLUID_TERMINAL_VEL, FLUID_JUMP_ACCEL, FLUID_JUMP_MAX
} from './playerConstants';

const SAFE_WALK_WIDTH = PLAYER_WIDTH; 

// Reusable vectors to reduce GC
const _inputVec = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);

// Consecutive slow-sprint ticks (single player — module state is fine)
let sprintSlowTicks = 0;

export interface SimulationResult {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    grounded: boolean;
}

export function simulateStep(
    wm: WorldManager,
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    intent: any,
    cameraYaw: number,
    dt: number,
    isFlying: boolean,
    noClip: boolean = false
): SimulationResult {
    const newPos = pos.clone();
    const newVel = vel.clone();
    
    const height = intent.sneak ? PLAYER_HEIGHT_SNEAK : PLAYER_HEIGHT;

    // Check Fluids
    const blockFeet = wm.getBlock(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z), false);
    const blockHead = wm.getBlock(Math.floor(pos.x), Math.floor(pos.y + 1.5), Math.floor(pos.z), false);
    
    const inWater = blockFeet === BlockType.WATER;
    const inLava = blockFeet === BlockType.LAVA;
    const inFluid = inWater || inLava;
    const submerged = blockHead === BlockType.WATER || blockHead === BlockType.LAVA;

    // 1. Calculate Target Speed
    let targetSpeed = WALK_SPEED;
    if (intent.sprint) targetSpeed *= SPRINT_MULTIPLIER;
    if (intent.sneak) targetSpeed *= SNEAK_MULTIPLIER;

    // Apply Fluid Speed Modifiers
    if (inWater) {
        targetSpeed = submerged ? SWIM_SUBMERGED_SPEED : SWIM_SPEED;
        if (intent.sprint && submerged) targetSpeed *= 1.5; 
    } else if (inLava) {
        targetSpeed *= LAVA_HORIZONTAL_REDUCTION;
    }

    // Input vector
    _inputVec.set(0, 0, 0);
    if (intent.forward) _inputVec.z -= 1;
    if (intent.backward) _inputVec.z += 1;
    if (intent.left) _inputVec.x -= 1;
    if (intent.right) _inputVec.x += 1;
    
    // Normalize and Rotate
    if (_inputVec.lengthSq() > 0) _inputVec.normalize();
    _inputVec.applyAxisAngle(_yAxis, cameraYaw);

    if (isFlying) {
        // --- FLYING PHYSICS ---
        // Increased speeds for better creative mode traversal
        const flySpeed = intent.sprint ? 50.0 : 24.0;

        // Minecraft creative flight: per-tick drag (0.91, same as air) + input
        // injection sized so the equilibrium equals flySpeed. This gives the
        // gliding, momentum-carrying flight where you coast after releasing keys.
        const flyAccel = 1 - AIR_FRICTION; // injection factor -> terminal == flySpeed
        newVel.x *= AIR_FRICTION;
        newVel.z *= AIR_FRICTION;
        newVel.y *= AIR_FRICTION;

        newVel.addScaledVector(_inputVec, flySpeed * flyAccel);

        const hVel = new THREE.Vector2(newVel.x, newVel.z);
        if (hVel.length() > flySpeed) {
            hVel.normalize().multiplyScalar(flySpeed);
            newVel.x = hVel.x;
            newVel.z = hVel.y;
        }

        if (intent.jump) newVel.y += flySpeed * flyAccel;
        if (intent.sneak) newVel.y -= flySpeed * flyAccel;
        
        // Integrate
        const dx = newVel.x * dt;
        const dy = newVel.y * dt;
        const dz = newVel.z * dt;

        newPos.x += dx;
        if (!noClip && checkCollision(wm, newPos, PLAYER_WIDTH, height)) newPos.x -= dx;
        
        newPos.y += dy;
        if (!noClip && checkCollision(wm, newPos, PLAYER_WIDTH, height)) newPos.y -= dy;
        
        newPos.z += dz;
        if (!noClip && checkCollision(wm, newPos, PLAYER_WIDTH, height)) newPos.z -= dz;

        return { position: newPos, velocity: newVel, grounded: false };
    }

    // --- Ground Detection ---
    const wasGrounded = checkCollision(wm, {x: pos.x, y: pos.y - GROUND_EPS, z: pos.z}, PLAYER_WIDTH, height);
    
    // --- Horizontal Movement (Minecraft friction model) ---
    // Per tick: decay velocity by a friction factor, then add a fixed input
    // acceleration. The equilibrium of the two equals targetSpeed, so momentum
    // (gradual ramp-up, glide-to-stop, and direction reversals that carry your
    // old velocity) emerges naturally instead of being lerped toward a target.
    // FIXED_DT == one Minecraft tick, so these per-tick factors apply directly.
    const horizFriction = inFluid
        ? FLUID_FRICTION
        : (wasGrounded ? GROUND_FRICTION : AIR_FRICTION);

    newVel.x *= horizFriction;
    newVel.z *= horizFriction;

    if (_inputVec.lengthSq() > 0) {
        let accel;
        if (!wasGrounded && !inFluid) {
            // Airborne: acceleration is a fixed fraction of the GROUND amplitude
            // (target·(1−GROUND_FRICTION)), NOT of (1−AIR_FRICTION). Paired with the
            // high 0.91 air retention this puts the air terminal speed at ~your ground
            // speed, so sprint speed survives a jump and you keep enough forward drive
            // to land on a block. Reduced authority still limits mid-air turning.
            accel = targetSpeed * (1 - GROUND_FRICTION) * AIR_CONTROL;
        } else {
            // Ground / fluid: sustained input converges to targetSpeed because
            //   v* = v*·friction + accel  =>  accel = targetSpeed · (1 − friction).
            accel = targetSpeed * (1 - horizFriction);
        }
        newVel.x += _inputVec.x * accel;
        newVel.z += _inputVec.z * accel;
    }

    // --- Vertical Movement (Gravity & Jumping) ---
    if (inFluid) {
        newVel.y *= inLava ? 0.8 : 0.9;
        
        newVel.y -= FLUID_GRAVITY * dt; 
        if (newVel.y < -FLUID_TERMINAL_VEL) newVel.y = -FLUID_TERMINAL_VEL;

        if (intent.jump) {
            newVel.y += FLUID_JUMP_ACCEL * dt;
            if (newVel.y > FLUID_JUMP_MAX) newVel.y = FLUID_JUMP_MAX;
        }
    } else {
        if (!wasGrounded) {
            newVel.y -= GRAVITY * dt;
            newVel.y = Math.max(newVel.y, -TERMINAL_VELOCITY);
        } else {
            if (newVel.y < 0) newVel.y = 0;
        }

        if (intent.jump && wasGrounded) {
            newVel.y = JUMP_VELOCITY;
            if (intent.sprint) {
                 newVel.x -= Math.sin(cameraYaw) * SPRINT_JUMP_BOOST;
                 newVel.z -= Math.cos(cameraYaw) * SPRINT_JUMP_BOOST;
            }
        }
    }

    // --- Integration & Collision Resolution ---

    // Auto-step: when a horizontal move is blocked while grounded (and not jumping),
    // lift over a low obstacle — slabs, stair steps, a single half-block. Flat-ground
    // walking never collides horizontally, so normal movement feel is unaffected.
    const STEP_HEIGHT = 0.55;
    const tryStepUp = (): boolean => {
        if (!wasGrounded || newVel.y > 0.01) return false;
        const probeY = newPos.y + STEP_HEIGHT;
        if (checkCollision(wm, { x: newPos.x, y: probeY, z: newPos.z }, PLAYER_WIDTH, height)) return false;
        const support = getSupportTop(wm, { x: newPos.x, y: probeY, z: newPos.z }, PLAYER_WIDTH);
        if (support === null) return false;
        const rise = support - newPos.y;
        if (rise <= CONTACT_EPS || rise > STEP_HEIGHT) return false;
        newPos.y = support + CONTACT_EPS;
        return true;
    };

    // X Axis
    let dx = newVel.x * dt;
    if (intent.sneak && wasGrounded) {
        const safeDx = applySafeWalk(wm, newPos, dx, 0, SAFE_WALK_WIDTH);
        if (Math.abs(safeDx) < Math.abs(dx)) newVel.x = 0;
        dx = safeDx;
    }

    newPos.x += dx;
    if (checkCollision(wm, newPos, PLAYER_WIDTH, height)) {
        if (!tryStepUp()) {
            newPos.x -= dx;
            newVel.x = 0;
        }
    }

    // Z Axis
    let dz = newVel.z * dt;
    if (intent.sneak && wasGrounded) {
        const safeDz = applySafeWalk(wm, newPos, 0, dz, SAFE_WALK_WIDTH);
        if (Math.abs(safeDz) < Math.abs(dz)) newVel.z = 0;
        dz = safeDz;
    }

    newPos.z += dz;
    if (checkCollision(wm, newPos, PLAYER_WIDTH, height)) {
        if (!tryStepUp()) {
            newPos.z -= dz;
            newVel.z = 0;
        }
    }

    // Y Axis
    const dy = newVel.y * dt;
    newPos.y += dy;
    let isGrounded = false;

    if (checkCollision(wm, newPos, PLAYER_WIDTH, height)) {
        newPos.y -= dy;
        
        if (newVel.y < 0) {
            isGrounded = true;
            // Snap to the top of the actual supporting block (beds are 0.5 high).
            const supportTop = getSupportTop(wm, newPos, PLAYER_WIDTH);
            newPos.y = (supportTop !== null ? supportTop : Math.floor(newPos.y)) + CONTACT_EPS;
        } else {
            newPos.y = Math.floor(newPos.y + height + 1.0) - height - CONTACT_EPS;
        }
        newVel.y = 0;
    }
    
    // Ground probe: fix rare "hovering" cases where gravity/collision misses for a tick.
    // This prevents delayed land detection (and delayed fall damage) and avoids arming fall damage on tiny steps.
    if (!isFlying && newVel.y <= 0) {
        const support = checkCollision(
            wm,
            { x: newPos.x, y: newPos.y - GROUND_EPS, z: newPos.z },
            PLAYER_WIDTH,
            PLAYER_HEIGHT
        );
        if (support) {
            isGrounded = true;
            newVel.y = 0;
        }
    }

    // --- Lenient Sprint Stop Check ---
    // Only evaluated while grounded. In Minecraft a jump never cancels your sprint —
    // sprint-jumping is a core movement tech — so airborne ticks neither cancel nor
    // accumulate toward a cancel. On the ground, a genuine wall bump (sustained low
    // speed) still ends the sprint after the grace window; a momentum direction flip
    // recovers before then.
    if (intent.sprint && wasGrounded) {
        const hSpeed = Math.hypot(newVel.x, newVel.z);
        const stopThreshold = WALK_SPEED * 0.6;
        if (hSpeed < stopThreshold) {
            sprintSlowTicks++;
            if (sprintSlowTicks >= SPRINT_STOP_GRACE_TICKS) {
                intent.cancelDoubleTap();
            }
        } else {
            sprintSlowTicks = 0;
        }
    } else if (wasGrounded) {
        sprintSlowTicks = 0;
    }

    return { position: newPos, velocity: newVel, grounded: isGrounded };
}

function applySafeWalk(wm: WorldManager, pos: THREE.Vector3, dx: number, dz: number, width: number): number {
    const delta = dx !== 0 ? dx : dz;
    if (delta === 0) return 0;
    
    const sign = Math.sign(delta);
    const absDelta = Math.abs(delta);
    let moved = 0;
    
    while (Math.abs(moved) + SAFE_WALK_STEP <= absDelta) {
        const testPos = pos.clone();
        if (dx !== 0) testPos.x += (moved + sign * SAFE_WALK_STEP);
        else testPos.z += (moved + sign * SAFE_WALK_STEP);
        
        if (!hasGroundSupport(wm, testPos, width)) {
            return moved;
        }
        moved += sign * SAFE_WALK_STEP;
    }
    
    const rem = absDelta - Math.abs(moved);
    if (rem > 0) {
        const testPos = pos.clone();
        if (dx !== 0) testPos.x += (moved + sign * rem);
        else testPos.z += (moved + sign * rem);
        
        if (hasGroundSupport(wm, testPos, width)) {
            moved += sign * rem;
        }
    }
    
    return moved;
}
