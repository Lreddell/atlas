import type { EntityMovementAbility, NavigationRuntimeState } from '../Entity';
import type { NavigationPath, NavigationVector } from './navigationTypes';

export interface LocomotionAgent {
    pos: NavigationVector;
    vel: NavigationVector;
    yaw: number;
    grounded: boolean;
    navigationState: Pick<NavigationRuntimeState, 'waypointIndex'>;
}

export interface LocomotionWorld {
    canOccupy(position: NavigationVector, width: number, height: number): boolean;
    hasSafeLanding(position: NavigationVector, width: number): boolean;
}

export interface LocomotionResult {
    routeComplete: boolean;
    routeInvalid: boolean;
    jumped: boolean;
    waypointAdvanced: boolean;
    desiredSpeed: number;
}

const WAYPOINT_RADIUS = 0.32;

function moveToward(current: number, target: number, amount: number): number {
    if (current < target) return Math.min(current + amount, target);
    return Math.max(current - amount, target);
}

function rotateToward(current: number, target: number, amount: number): number {
    let delta = target - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return current + Math.max(-amount, Math.min(amount, delta));
}

function stop(agent: LocomotionAgent, acceleration: number, dt: number): void {
    const amount = acceleration * dt;
    agent.vel.x = moveToward(agent.vel.x, 0, amount);
    agent.vel.z = moveToward(agent.vel.z, 0, amount);
}

export const EntityLocomotion = {
    isSafeDropCommitted(
        agent: LocomotionAgent,
        path: NavigationPath | null,
        world: LocomotionWorld,
        profile: EntityMovementAbility,
    ): boolean {
        if (!path) return false;
        const currentIndex = agent.navigationState.waypointIndex;
        // A body wider than one block needs an extended drop node so its trailing
        // edge clears the upper lip before gravity takes over. Keep ledge guarding
        // disabled for that complete authored stride, including diagonal descents.
        const stride = profile.width > 1 ? Math.ceil(profile.width) + 1 : 1;
        const commitmentRadius = Math.SQRT2 * (stride + 0.4);
        for (let index = currentIndex; index <= Math.min(path.nodes.length - 1, currentIndex + 1); index += 1) {
            const node = path.nodes[index];
            if (node?.action !== 'drop') continue;
            const distance = Math.hypot(node.x + 0.5 - agent.pos.x, node.z + 0.5 - agent.pos.z);
            if (distance <= commitmentRadius && world.hasSafeLanding(node, profile.width)) return true;
        }
        return false;
    },

    tick(
        agent: LocomotionAgent,
        path: NavigationPath | null,
        world: LocomotionWorld,
        dt: number,
        profile: EntityMovementAbility,
        speed: number,
    ): LocomotionResult {
        const timestep = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.25)) : 0;
        const acceleration = Math.max(0.1, profile.acceleration);
        if (!path || path.nodes.length === 0 || agent.navigationState.waypointIndex >= path.nodes.length) {
            stop(agent, acceleration, timestep);
            return { routeComplete: true, routeInvalid: false, jumped: false, waypointAdvanced: false, desiredSpeed: 0 };
        }

        let waypointAdvanced = false;
        let node = path.nodes[agent.navigationState.waypointIndex];
        let targetX = node.x + 0.5;
        let targetZ = node.z + 0.5;
        let horizontal = Math.hypot(targetX - agent.pos.x, targetZ - agent.pos.z);
        while (horizontal <= WAYPOINT_RADIUS
            && Math.abs(node.y - agent.pos.y) <= 0.65
            && agent.navigationState.waypointIndex < path.nodes.length - 1) {
            agent.navigationState.waypointIndex += 1;
            waypointAdvanced = true;
            node = path.nodes[agent.navigationState.waypointIndex];
            targetX = node.x + 0.5;
            targetZ = node.z + 0.5;
            horizontal = Math.hypot(targetX - agent.pos.x, targetZ - agent.pos.z);
        }
        if (horizontal <= WAYPOINT_RADIUS
            && Math.abs(node.y - agent.pos.y) <= 0.65
            && agent.navigationState.waypointIndex === path.nodes.length - 1) {
            stop(agent, acceleration, timestep);
            return { routeComplete: true, routeInvalid: false, jumped: false, waypointAdvanced: true, desiredSpeed: 0 };
        }

        const target = { x: node.x, y: node.y, z: node.z };
        if (!world.canOccupy(target, profile.width, profile.height)
            || (node.action === 'drop' && !world.hasSafeLanding(target, profile.width))) {
            stop(agent, acceleration, timestep);
            return { routeComplete: false, routeInvalid: true, jumped: false, waypointAdvanced, desiredSpeed: 0 };
        }

        const length = horizontal || 1;
        // Preserve forward commitment while leaving the lip. Once airborne, use the
        // profile's controlled drop speed so enemies land cleanly instead of sailing.
        const speedScale = node.action === 'drop' && !agent.grounded ? profile.dropSpeedScale : 1;
        const desiredSpeed = Math.max(0, speed) * Math.max(0.1, speedScale);
        const desiredX = ((targetX - agent.pos.x) / length) * desiredSpeed;
        const desiredZ = ((targetZ - agent.pos.z) / length) * desiredSpeed;
        const velocityStep = acceleration * timestep;
        agent.vel.x = moveToward(agent.vel.x, desiredX, velocityStep);
        agent.vel.z = moveToward(agent.vel.z, desiredZ, velocityStep);
        const targetYaw = Math.atan2(targetX - agent.pos.x, targetZ - agent.pos.z);
        agent.yaw = rotateToward(agent.yaw, targetYaw, Math.max(0.1, profile.turnRate) * timestep);

        let jumped = false;
        if (node.action === 'jump' && agent.grounded && node.y > agent.pos.y + 0.25) {
            agent.vel.y = Math.max(agent.vel.y, profile.jumpImpulse);
            jumped = true;
        }
        return { routeComplete: false, routeInvalid: false, jumped, waypointAdvanced, desiredSpeed };
    },
};
