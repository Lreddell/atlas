
import * as THREE from 'three';
import { WorldManager } from '../WorldManager';
import { checkCollision, hasGroundSupport } from './playerCollision';
import { BlockType } from '../../types';
import { 
    PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_HEIGHT_SNEAK, 
    WALK_SPEED, SPRINT_MULTIPLIER, SNEAK_MULTIPLIER,
    GRAVITY, JUMP_VELOCITY, TERMINAL_VELOCITY, SPRINT_JUMP_BOOST,
    ACCEL_GROUND, ACCEL_AIR, FRICTION_GROUND, FRICTION_AIR,
    SAFE_WALK_STEP, CONTACT_EPS, GROUND_EPS,
    SWIM_SPEED, SWIM_SUBMERGED_SPEED, LAVA_HORIZONTAL_REDUCTION,
    FLUID_GRAVITY, FLUID_TERMINAL_VEL, FLUID_JUMP_ACCEL, FLUID_JUMP_MAX
} from './playerConstants';

const SAFE_WALK_WIDTH = PLAYER_WIDTH; 

// Reusable vectors to reduce GC
const _inputVec = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);

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
        
        newVel.x *= 0.8;
        newVel.z *= 0.8;
        newVel.y *= 0.8;

        newVel.addScaledVector(_inputVec, flySpeed * 0.2); 
        
        const hVel = new THREE.Vector2(newVel.x, newVel.z);
        if (hVel.length() > flySpeed) {
            hVel.normalize().multiplyScalar(flySpeed);
            newVel.x = hVel.x;
            newVel.z = hVel.y;
        }

        // Increased vertical acceleration multiplier to 0.2 (was 0.1)
        if (intent.jump) newVel.y += flySpeed * 0.2;
        if (intent.sneak) newVel.y -= flySpeed * 0.2;
        
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
    
    // --- Horizontal Movement (Vector Targeting) ---
    if (_inputVec.lengthSq() > 0) {
        const targetVelX = _inputVec.x * targetSpeed;
        const targetVelZ = _inputVec.z * targetSpeed;
        
        let accel = wasGrounded ? ACCEL_GROUND : ACCEL_AIR;
        if (inFluid && !wasGrounded) accel = ACCEL_GROUND * 0.5;
        
        const dot = newVel.x * targetVelX + newVel.z * targetVelZ;
        if (wasGrounded && dot < 0) {
            accel *= 2.0; 
        }
        
        const maxDelta = accel * dt;
        
        const dx = targetVelX - newVel.x;
        const dz = targetVelZ - newVel.z;
        const len = Math.hypot(dx, dz);
        
        if (len <= maxDelta) {
            newVel.x = targetVelX;
            newVel.z = targetVelZ;
        } else {
            const scale = maxDelta / len;
            newVel.x += dx * scale;
            newVel.z += dz * scale;
        }
    } else {
        const currentSpeed = Math.hypot(newVel.x, newVel.z);
        if (currentSpeed > 0) {
            let nextSpeed = currentSpeed;
            if (wasGrounded) {
                 const drop = FRICTION_GROUND * dt;
                 nextSpeed = Math.max(0, currentSpeed - drop);
            } else {
                 const friction = inFluid ? FRICTION_GROUND * 0.5 : FRICTION_AIR;
                 const drop = currentSpeed * friction * dt;
                 nextSpeed = Math.max(0, currentSpeed - drop);
            }
            
            if (nextSpeed !== currentSpeed) {
                const scale = nextSpeed / currentSpeed;
                newVel.x *= scale;
                newVel.z *= scale;
            }
        }
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
    
    // X Axis
    let dx = newVel.x * dt;
    if (intent.sneak && wasGrounded) {
        const safeDx = applySafeWalk(wm, newPos, dx, 0, SAFE_WALK_WIDTH);
        if (Math.abs(safeDx) < Math.abs(dx)) newVel.x = 0; 
        dx = safeDx;
    }
    
    newPos.x += dx;
    if (checkCollision(wm, newPos, PLAYER_WIDTH, height)) {
        newPos.x -= dx;
        newVel.x = 0;
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
        newPos.z -= dz;
        newVel.z = 0;
    }

    // Y Axis
    const dy = newVel.y * dt;
    newPos.y += dy;
    let isGrounded = false;

    if (checkCollision(wm, newPos, PLAYER_WIDTH, height)) {
        newPos.y -= dy;
        
        if (newVel.y < 0) {
            isGrounded = true;
            newPos.y = Math.floor(newPos.y) + CONTACT_EPS;
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
    if (intent.sprint) {
        // Calculate speed after collision resolution
        const hSpeed = Math.hypot(newVel.x, newVel.z);
        
        // Threshold: If we are moving slower than 60% of normal walk speed, stop sprinting.
        // This is less lenient than 30% (requires preserving more speed), but still tolerates glances.
        const stopThreshold = WALK_SPEED * 0.6;
        
        if (hSpeed < stopThreshold) {
            intent.cancelDoubleTap();
        }
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
