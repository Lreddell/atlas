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
