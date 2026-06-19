import * as THREE from 'three';
import type { WorldManager } from '../WorldManager';
import { BlockType } from '../../types';
import {
    MAGNET_FORCE,
    MAGNET_MAX_SPEED,
    MAGNET_RANGE,
    getDirectionalAxis,
    getDirectionalMultiplier,
    getMagneticResponseSign,
    getMagnetPolarity as getPolarityForBlockIds,
} from './magneticField';

// Magnetism (Phase 4). Magnet blocks emit a field; a magnetically-susceptible
// player is pushed/pulled each tick. Susceptibility comes from equipment:
//  - 'ferro'      (iron armor): positive repels and negative attracts.
//  - 'controlled' (polarity boots): player picks a polarity (R); same sign as a
//                  block repels, opposite attracts — for launch/stick traversal.
//  - 'none':       no effect.
// Forces are inverse-square within a small radius, then the magnetic contribution
// is clamped so it feels like an assisted dash rather than raw physics.

export type MagneticMode = 'none' | 'ferro' | 'controlled';

export function getMagnetPolarity(type: BlockType): 1 | -1 | 0 {
    return getPolarityForBlockIds(type, BlockType.POSITIVE_MAGNET, BlockType.NEGATIVE_MAGNET);
}

const _acc = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _axis = { x: 0, y: 0, z: 0 };

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
    const getBlock = (x: number, y: number, z: number) => wm.getBlock(x, y, z, false);

    let found = false;
    for (let dx = -MAGNET_RANGE; dx <= MAGNET_RANGE; dx++) {
        for (let dy = -MAGNET_RANGE; dy <= MAGNET_RANGE; dy++) {
            for (let dz = -MAGNET_RANGE; dz <= MAGNET_RANGE; dz++) {
                const polarity = getMagnetPolarity(wm.getBlock(cx + dx, cy + dy, cz + dz, false));
                if (polarity === 0) continue;

                const magnetX = cx + dx;
                const magnetY = cy + dy;
                const magnetZ = cz + dz;
                _dir.set(ox - (magnetX + 0.5), oy - (magnetY + 0.5), oz - (magnetZ + 0.5));
                const dist = _dir.length();
                if (dist < 0.001 || dist > MAGNET_RANGE) continue;

                const axis = getDirectionalAxis(
                    getBlock,
                    magnetX,
                    magnetY,
                    magnetZ,
                    BlockType.IRON_BLOCK,
                    _axis,
                );
                const directionalMultiplier = getDirectionalMultiplier(
                    axis,
                    _dir.x,
                    _dir.y,
                    _dir.z,
                );
                _dir.multiplyScalar(1 / dist);

                const strength = (MAGNET_FORCE / (dist * dist)) * directionalMultiplier;
                const responseSign = getMagneticResponseSign(
                    mode === 'controlled',
                    playerPolarity,
                    polarity,
                );
                _acc.addScaledVector(_dir, strength * responseSign);
                found = true;
            }
        }
    }

    if (!found) return;

    vel.addScaledVector(_acc, dt);

    // Clamp the magnetic contribution so it stays controllable.
    const horiz = Math.hypot(vel.x, vel.z);
    if (horiz > MAGNET_MAX_SPEED) {
        const k = MAGNET_MAX_SPEED / horiz;
        vel.x *= k;
        vel.z *= k;
    }
    if (vel.y > MAGNET_MAX_SPEED) vel.y = MAGNET_MAX_SPEED;
    else if (vel.y < -MAGNET_MAX_SPEED) vel.y = -MAGNET_MAX_SPEED;
}
