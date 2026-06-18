import * as THREE from 'three';
import type { WorldManager } from '../WorldManager';
import { BlockType } from '../../types';

// Magnetism (Phase 4). Magnet blocks emit a field; a magnetically-susceptible
// player is pushed/pulled each tick. Susceptibility comes from equipment:
//  - 'ferro'      (iron armor): attracted to ALL magnets, no control.
//  - 'controlled' (polarity boots): player picks a polarity (R); same sign as a
//                  block repels, opposite attracts — for launch/stick traversal.
//  - 'none':       no effect.
// Forces are inverse-square within a small radius, then the magnetic contribution
// is clamped so it feels like an assisted dash rather than raw physics.

export type MagneticMode = 'none' | 'ferro' | 'controlled';

const MAGNET_RANGE = 5;
const FORCE = 70;       // base acceleration scalar
const MAX_SPEED = 13;   // clamp on magnetic-contributed velocity

export function getMagnetPolarity(type: BlockType): number {
    if (type === BlockType.POSITIVE_MAGNET) return 1;
    if (type === BlockType.NEGATIVE_MAGNET) return -1;
    return 0;
}

const _acc = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * Apply magnetic acceleration to the player's velocity for this tick. Mutates
 * `vel`. Call after the normal movement integration.
 */
export function applyMagneticForce(
    wm: WorldManager,
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    mode: MagneticMode,
    playerPolarity: number,
    dt: number,
): void {
    if (mode === 'none') return;

    _acc.set(0, 0, 0);
    const cx = Math.floor(pos.x);
    const cy = Math.floor(pos.y);
    const cz = Math.floor(pos.z);
    // Sample around the player's torso so vertical pulls feel centered.
    const ox = pos.x;
    const oy = pos.y + 0.9;
    const oz = pos.z;

    let found = false;
    for (let dx = -MAGNET_RANGE; dx <= MAGNET_RANGE; dx++) {
        for (let dy = -MAGNET_RANGE; dy <= MAGNET_RANGE; dy++) {
            for (let dz = -MAGNET_RANGE; dz <= MAGNET_RANGE; dz++) {
                const polarity = getMagnetPolarity(wm.getBlock(cx + dx, cy + dy, cz + dz, false));
                if (polarity === 0) continue;

                _dir.set(ox - (cx + dx + 0.5), oy - (cy + dy + 0.5), oz - (cz + dz + 0.5));
                const dist = _dir.length();
                if (dist < 0.001 || dist > MAGNET_RANGE) continue;
                _dir.multiplyScalar(1 / dist);

                const strength = FORCE / (dist * dist);
                // ferro always attracts; controlled: same sign repels, opposite attracts.
                const attract = mode === 'ferro' ? true : playerPolarity !== polarity;
                // _dir points block -> player, so +dir repels, -dir attracts.
                _acc.addScaledVector(_dir, attract ? -strength : strength);
                found = true;
            }
        }
    }

    if (!found) return;

    vel.addScaledVector(_acc, dt);

    // Clamp the magnetic contribution so it stays controllable.
    const horiz = Math.hypot(vel.x, vel.z);
    if (horiz > MAX_SPEED) {
        const k = MAX_SPEED / horiz;
        vel.x *= k;
        vel.z *= k;
    }
    if (vel.y > MAX_SPEED) vel.y = MAX_SPEED;
    else if (vel.y < -MAX_SPEED) vel.y = -MAX_SPEED;
}
