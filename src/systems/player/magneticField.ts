export interface Vector3Like {
    x: number;
    y: number;
    z: number;
}

export interface MagnetSource extends Vector3Like {
    polarity: 1 | -1;
    axis: Vector3Like | null;
}

export interface RawMagneticField extends Vector3Like {
    positiveStrength: number;
    negativeStrength: number;
}

export interface MagneticBlockIds {
    positiveMagnet: number;
    negativeMagnet: number;
    ironBlock: number;
}

export type BlockSampler = (x: number, y: number, z: number) => number;

export const MAGNET_RANGE = 5;
export const MAGNET_FORCE = 70;
export const MAGNET_MAX_SPEED = 20;
export const DIRECTIONAL_PEAK_MULTIPLIER = 4;
export const DIRECTIONAL_LEAK_MULTIPLIER = 0.01;
export const DIRECTIONAL_CONE_HALF_ANGLE = Math.PI / 6;
const DIRECTIONAL_CONE_COSINE = Math.cos(DIRECTIONAL_CONE_HALF_ANGLE);

const ADJACENT_OFFSETS = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
] as const;

export function getClosestPointOnAabb(
    point: Vector3Like,
    min: Vector3Like,
    max: Vector3Like,
    target: Vector3Like = { x: 0, y: 0, z: 0 },
): Vector3Like {
    target.x = Math.max(min.x, Math.min(max.x, point.x));
    target.y = Math.max(min.y, Math.min(max.y, point.y));
    target.z = Math.max(min.z, Math.min(max.z, point.z));
    return target;
}

export const getMagnetPolarity = (
    blockType: number,
    positiveMagnet: number,
    negativeMagnet: number,
): 1 | -1 | 0 => {
    if (blockType === positiveMagnet) return 1;
    if (blockType === negativeMagnet) return -1;
    return 0;
};

export const getMagneticResponseSign = (
    controlled: boolean,
    playerPolarity: number,
    magnetPolarity: 1 | -1,
): 1 | -1 => {
    if (!controlled) return magnetPolarity;
    return playerPolarity === magnetPolarity ? 1 : -1;
};

export function getDirectionalAxis(
    getBlock: BlockSampler,
    magnetX: number,
    magnetY: number,
    magnetZ: number,
    ironBlock: number,
    target: Vector3Like = { x: 0, y: 0, z: 0 },
): Vector3Like | null {
    let axisX = 0;
    let axisY = 0;
    let axisZ = 0;

    for (const [offsetX, offsetY, offsetZ] of ADJACENT_OFFSETS) {
        if (getBlock(magnetX + offsetX, magnetY + offsetY, magnetZ + offsetZ) !== ironBlock) {
            continue;
        }

        axisX -= offsetX;
        axisY -= offsetY;
        axisZ -= offsetZ;
    }

    const length = Math.hypot(axisX, axisY, axisZ);
    if (length < 1e-9) return null;

    target.x = axisX / length;
    target.y = axisY / length;
    target.z = axisZ / length;
    return target;
}

export function getDirectionalMultiplier(
    axis: Vector3Like | null,
    directionX: number,
    directionY: number,
    directionZ: number,
): number {
    if (!axis) return 1;

    const directionLength = Math.hypot(directionX, directionY, directionZ);
    if (directionLength < 1e-9) return 1;

    const dot = Math.max(
        -1,
        Math.min(
            1,
            (axis.x * directionX + axis.y * directionY + axis.z * directionZ) / directionLength,
        ),
    );
    if (dot <= DIRECTIONAL_CONE_COSINE) return DIRECTIONAL_LEAK_MULTIPLIER;

    const coneAmount = (dot - DIRECTIONAL_CONE_COSINE) / (1 - DIRECTIONAL_CONE_COSINE);
    const smoothed = coneAmount * coneAmount * (3 - 2 * coneAmount);
    return DIRECTIONAL_LEAK_MULTIPLIER
        + (DIRECTIONAL_PEAK_MULTIPLIER - DIRECTIONAL_LEAK_MULTIPLIER) * smoothed;
}

export function collectMagnetSources(
    getBlock: BlockSampler,
    centerX: number,
    centerY: number,
    centerZ: number,
    scanRadius: number,
    blockIds: MagneticBlockIds,
): MagnetSource[] {
    const sources: MagnetSource[] = [];

    for (let x = centerX - scanRadius; x <= centerX + scanRadius; x += 1) {
        for (let y = centerY - scanRadius; y <= centerY + scanRadius; y += 1) {
            for (let z = centerZ - scanRadius; z <= centerZ + scanRadius; z += 1) {
                const polarity = getMagnetPolarity(
                    getBlock(x, y, z),
                    blockIds.positiveMagnet,
                    blockIds.negativeMagnet,
                );
                if (polarity === 0) continue;

                const axis = getDirectionalAxis(getBlock, x, y, z, blockIds.ironBlock);
                sources.push({
                    x: x + 0.5,
                    y: y + 0.5,
                    z: z + 0.5,
                    polarity,
                    axis: axis ? { ...axis } : null,
                });
            }
        }
    }

    return sources;
}

export function sampleRawMagneticField(
    sources: readonly MagnetSource[],
    sampleX: number,
    sampleY: number,
    sampleZ: number,
    range = MAGNET_RANGE,
): RawMagneticField {
    let fieldX = 0;
    let fieldY = 0;
    let fieldZ = 0;
    let positiveStrength = 0;
    let negativeStrength = 0;
    const rangeSquared = range * range;

    for (const source of sources) {
        const directionX = sampleX - source.x;
        const directionY = sampleY - source.y;
        const directionZ = sampleZ - source.z;
        const distanceSquared =
            directionX * directionX + directionY * directionY + directionZ * directionZ;
        if (distanceSquared < 1e-6 || distanceSquared > rangeSquared) continue;

        const distance = Math.sqrt(distanceSquared);
        const directionalMultiplier = getDirectionalMultiplier(
            source.axis,
            directionX,
            directionY,
            directionZ,
        );
        const strength = (MAGNET_FORCE / distanceSquared) * directionalMultiplier;
        const signedStrength = strength * source.polarity;

        fieldX += (directionX / distance) * signedStrength;
        fieldY += (directionY / distance) * signedStrength;
        fieldZ += (directionZ / distance) * signedStrength;
        if (source.polarity > 0) positiveStrength += strength;
        else negativeStrength += strength;
    }

    return {
        x: fieldX,
        y: fieldY,
        z: fieldZ,
        positiveStrength,
        negativeStrength,
    };
}

// --- Boss magnetic field -----------------------------------------------------
// The Magnetic Warden emits a polarity field across the whole arena. With
// controllable polarity (boots), the SAME sign as the boss repels the player
// (pushed away) and the OPPOSITE attracts (pulled in) — so the player must keep
// flipping polarity as the boss swaps its own. Unlike the block field this is a
// strong, arena-scale force, so it is clamped (as an acceleration) to stay fair
// and is applied with the player's velocity in hand so jumps are never capped.

export interface BossFieldSource extends Vector3Like {
    /** Boss polarity (+1 / -1). */
    polarity: number;
    /** Field reach in blocks. */
    range: number;
    /** Peak acceleration (blocks/s²) at point-blank, falling off linearly. */
    force: number;
}

/** Top drift speed (blocks/s) the field pushes the player to at point-blank. */
export const BOSS_FIELD_MAX_DRIFT = 7;
/** Vertical component is softened so the field tugs more than it launches. */
export const BOSS_FIELD_VERTICAL_FACTOR = 0.4;

/**
 * Net velocity change the boss field imparts this tick. Pure (no THREE / no
 * enum) so it is unit-tested directly. The caller adds {x,y,z} to the player's
 * velocity; `active` is false when no source is in range (so callers can skip).
 *
 * The field is VELOCITY-AWARE: it ramps the player toward a capped drift speed
 * along the push direction (and never beyond it), so it is firmly felt on the
 * ground yet can never accelerate an airborne player into a launch. The player
 * counters by flipping polarity, which reverses the push direction.
 *
 * @param px,py,pz  the player's body-centre position
 * @param vx,vy,vz  the player's current velocity
 */
export function bossFieldVelocityDelta(
    sources: readonly BossFieldSource[],
    px: number,
    py: number,
    pz: number,
    vx: number,
    vy: number,
    vz: number,
    playerPolarity: number,
    dt: number,
): { x: number; y: number; z: number; active: boolean } {
    let dvx = 0;
    let dvy = 0;
    let dvz = 0;
    let active = false;

    for (const s of sources) {
        const ex = px - s.x;
        const ey = py - s.y;
        const ez = pz - s.z;
        const dist = Math.hypot(ex, ey, ez);
        if (dist < 0.6 || dist > s.range) continue;
        active = true;

        const falloff = 1 - dist / s.range;
        // Same polarity repels (push along boss→player), opposite attracts.
        const sign = Math.sign(playerPolarity) === Math.sign(s.polarity) ? 1 : -1;
        const ux = (sign * ex) / dist;
        const uy = (sign * ey) / dist;
        const uz = (sign * ez) / dist;

        // Ramp the player's speed along the push direction up to the target
        // drift, but never decelerate or overshoot — that is what makes it
        // air-safe. `force` controls how fast it ramps (blocks/s²).
        const target = BOSS_FIELD_MAX_DRIFT * falloff;
        const along = vx * ux + vy * uy + vz * uz;
        let add = target - along;
        if (add <= 0) continue;
        const ramp = s.force * dt;
        if (add > ramp) add = ramp;

        dvx += ux * add;
        dvy += uy * add;
        dvz += uz * add;
    }

    if (!active) return { x: 0, y: 0, z: 0, active: false };
    return { x: dvx, y: dvy * BOSS_FIELD_VERTICAL_FACTOR, z: dvz, active: true };
}
