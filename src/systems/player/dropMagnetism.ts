import type { Vector3Like } from './magneticField';

export const DROP_MAGNET_MAX_SPEED = 18;

export function applyMagneticFieldToVelocity(
    velocity: [number, number, number],
    field: Vector3Like,
    deltaSeconds: number,
): void {
    velocity[0] += field.x * deltaSeconds;
    velocity[1] += field.y * deltaSeconds;
    velocity[2] += field.z * deltaSeconds;

    const speed = Math.hypot(velocity[0], velocity[1], velocity[2]);
    if (speed <= DROP_MAGNET_MAX_SPEED) return;

    const scale = DROP_MAGNET_MAX_SPEED / speed;
    velocity[0] *= scale;
    velocity[1] *= scale;
    velocity[2] *= scale;
}
