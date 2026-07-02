import * as THREE from 'three';
import type { WorldManager } from '../WorldManager';
import { BlockType } from '../../types';
import {
    MAGNET_FORCE,
    MAGNET_MAX_SPEED,
    MAGNET_RANGE,
    getClosestPointOnAabb,
    getDirectionalAxis,
    getDirectionalMultiplier,
    getMagneticResponseSign,
    getMagnetPolarity as getPolarityForBlockIds,
    bossFieldVelocityDelta,
    type BossFieldSource,
} from './magneticField';

export type { BossFieldSource } from './magneticField';
import { PLAYER_HEIGHT, PLAYER_WIDTH } from './playerConstants';

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
const _magnetCenter = { x: 0, y: 0, z: 0 };
const _bodyMin = { x: 0, y: 0, z: 0 };
const _bodyMax = { x: 0, y: 0, z: 0 };
const _bodySample = { x: 0, y: 0, z: 0 };

// The magnet scan sweeps an ~11x13x11 block volume (~1,500 getBlock calls).
// Running it every physics substep (up to 4 per frame) whenever iron armor or
// polarity boots are equipped dominated the movement hot path — even with no
// magnet anywhere near. Magnets are static blocks, so the volume is rescanned
// only when the player enters a new block cell or every RESCAN_MS; each substep
// then integrates forces from this (tiny, usually empty) cached list. The
// direction axis (from adjacent iron blocks) is cached per magnet too. Worst
// case, a magnet placed or broken right next to the player takes RESCAN_MS to
// register — imperceptible for an assist-style force.
interface CachedMagnet {
    x: number; y: number; z: number;
    polarity: 1 | -1;
    hasAxis: boolean; axisX: number; axisY: number; axisZ: number;
}
const RESCAN_MS = 150;
const _magnetCache = {
    cellX: NaN, cellY: NaN, cellZ: NaN,
    at: 0,
    magnets: [] as CachedMagnet[],
};

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
    bodyHeight = PLAYER_HEIGHT,
    /** Scales the pull — lowered while grounded so standing on/near magnet
     *  blocks isn't slippery and you can walk to a block's edge. */
    strengthScale = 1,
): void {
    if (mode === 'none' || strengthScale <= 0) return;

    _acc.set(0, 0, 0);
    const halfWidth = PLAYER_WIDTH * 0.5;
    _bodyMin.x = pos.x - halfWidth;
    _bodyMin.y = pos.y;
    _bodyMin.z = pos.z - halfWidth;
    _bodyMax.x = pos.x + halfWidth;
    _bodyMax.y = pos.y + bodyHeight;
    _bodyMax.z = pos.z + halfWidth;

    const cellX = Math.floor(pos.x);
    const cellY = Math.floor(pos.y);
    const cellZ = Math.floor(pos.z);
    const now = Date.now();
    if (cellX !== _magnetCache.cellX || cellY !== _magnetCache.cellY || cellZ !== _magnetCache.cellZ
        || now - _magnetCache.at > RESCAN_MS) {
        _magnetCache.cellX = cellX;
        _magnetCache.cellY = cellY;
        _magnetCache.cellZ = cellZ;
        _magnetCache.at = now;
        _magnetCache.magnets.length = 0;

        const minX = Math.floor(_bodyMin.x - MAGNET_RANGE);
        const maxX = Math.floor(_bodyMax.x + MAGNET_RANGE);
        const minY = Math.floor(_bodyMin.y - MAGNET_RANGE);
        const maxY = Math.floor(_bodyMax.y + MAGNET_RANGE);
        const minZ = Math.floor(_bodyMin.z - MAGNET_RANGE);
        const maxZ = Math.floor(_bodyMax.z + MAGNET_RANGE);
        const getBlock = (x: number, y: number, z: number) => wm.getBlock(x, y, z, false);

        for (let magnetX = minX; magnetX <= maxX; magnetX++) {
            for (let magnetY = minY; magnetY <= maxY; magnetY++) {
                for (let magnetZ = minZ; magnetZ <= maxZ; magnetZ++) {
                    const polarity = getMagnetPolarity(wm.getBlock(magnetX, magnetY, magnetZ, false));
                    if (polarity === 0) continue;
                    const axis = getDirectionalAxis(
                        getBlock,
                        magnetX,
                        magnetY,
                        magnetZ,
                        BlockType.IRON_BLOCK,
                        _axis,
                    );
                    _magnetCache.magnets.push({
                        x: magnetX, y: magnetY, z: magnetZ,
                        polarity,
                        hasAxis: axis !== null,
                        axisX: axis ? axis.x : 0, axisY: axis ? axis.y : 0, axisZ: axis ? axis.z : 0,
                    });
                }
            }
        }
    }

    const magnets = _magnetCache.magnets;
    if (magnets.length === 0) return;

    let found = false;
    for (let i = 0; i < magnets.length; i++) {
        const m = magnets[i];
        _magnetCenter.x = m.x + 0.5;
        _magnetCenter.y = m.y + 0.5;
        _magnetCenter.z = m.z + 0.5;
        getClosestPointOnAabb(_magnetCenter, _bodyMin, _bodyMax, _bodySample);
        _dir.set(
            _bodySample.x - _magnetCenter.x,
            _bodySample.y - _magnetCenter.y,
            _bodySample.z - _magnetCenter.z,
        );
        const dist = _dir.length();
        if (dist < 0.001 || dist > MAGNET_RANGE) continue;

        _axis.x = m.axisX; _axis.y = m.axisY; _axis.z = m.axisZ;
        const directionalMultiplier = getDirectionalMultiplier(
            m.hasAxis ? _axis : null,
            _dir.x,
            _dir.y,
            _dir.z,
        );
        _dir.multiplyScalar(1 / dist);

        const strength = (MAGNET_FORCE / (dist * dist)) * directionalMultiplier;
        const responseSign = getMagneticResponseSign(
            mode === 'controlled',
            playerPolarity,
            m.polarity,
        );
        _acc.addScaledVector(_dir, strength * responseSign);
        found = true;
    }

    if (!found) return;

    vel.addScaledVector(_acc, dt * strengthScale);

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

/**
 * Apply the Magnetic Warden's arena field to the player's velocity this tick.
 * Mutates `vel`; returns whether any boss field was in range. Kept separate from
 * the block field so its strong, clamped acceleration is added with the player's
 * real velocity in hand (no global speed cap that would kill jumps).
 */
export function applyBossMagneticFields(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    playerPolarity: number,
    dt: number,
    sources: readonly BossFieldSource[],
    bodyHeight = PLAYER_HEIGHT,
): boolean {
    if (sources.length === 0) return false;
    const delta = bossFieldVelocityDelta(
        sources,
        pos.x,
        pos.y + bodyHeight * 0.5,
        pos.z,
        vel.x,
        vel.y,
        vel.z,
        playerPolarity,
        dt,
    );
    if (!delta.active) return false;
    vel.x += delta.x;
    vel.y += delta.y;
    vel.z += delta.z;
    return true;
}
