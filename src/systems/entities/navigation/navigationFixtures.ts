import { EntityLocomotion } from './EntityLocomotion.ts';
import { VoxelNavigator } from './VoxelNavigator.ts';

export const NAV_FIXTURE_BLOCKS = {
    AIR: 0,
    STONE: 3,
    LAVA: 22,
    SPIKES: 82,
    CLOSED_GATE: 85,
} as const;

export interface NavigationFixtureWorld {
    start: { x: number; y: number; z: number };
    goal: { x: number; y: number; z: number };
    getBlock(x: number, y: number, z: number): number | null;
    isLoaded(x: number, z: number): boolean;
    setBlock(x: number, y: number, z: number, type: number): void;
    setLoaded(x: number, z: number, loaded: boolean): void;
}

export interface GroundEntitySimulationInput {
    behavior: 'close' | 'ranged';
    seconds: number;
    fixture: 'ledge_detour' | 'open_range';
}

export interface GroundEntitySimulationResult {
    fell: boolean;
    distanceToTarget: number;
    replans: number;
    hasLineOfSight: boolean;
}

const key3 = (x: number, y: number, z: number) => `${x},${y},${z}`;
const key2 = (x: number, z: number) => `${x},${z}`;

/**
 * Compact deterministic test world. Each non-space map cell has a stone floor
 * at y=0; `^` raises the walking surface by one. `#` is a three-block wall,
 * spaces are loaded void, and S/G mark foot positions.
 */
export function makeNavigationWorld(rows: string[]): NavigationFixtureWorld {
    const blocks = new Map<string, number>();
    const loaded = new Set<string>();
    let start = { x: 0, y: 1, z: 0 };
    let goal = { x: 0, y: 1, z: 0 };
    const width = Math.max(0, ...rows.map((row) => row.length));

    for (let z = 0; z < rows.length; z += 1) {
        const row = rows[z];
        for (let x = 0; x < width; x += 1) {
            const symbol = row[x] ?? ' ';
            loaded.add(key2(x, z));
            if (symbol === ' ') continue;
            blocks.set(key3(x, 0, z), NAV_FIXTURE_BLOCKS.STONE);
            if (symbol === '#') {
                blocks.set(key3(x, 1, z), NAV_FIXTURE_BLOCKS.STONE);
                blocks.set(key3(x, 2, z), NAV_FIXTURE_BLOCKS.STONE);
                blocks.set(key3(x, 3, z), NAV_FIXTURE_BLOCKS.STONE);
            } else if (symbol === '^') {
                blocks.set(key3(x, 1, z), NAV_FIXTURE_BLOCKS.STONE);
            }
            const feetY = symbol === '^' ? 2 : 1;
            if (symbol === 'S') start = { x, y: feetY, z };
            if (symbol === 'G') goal = { x, y: feetY, z };
        }
    }

    return {
        start,
        goal,
        getBlock: (x, y, z) => loaded.has(key2(x, z)) ? blocks.get(key3(x, y, z)) ?? NAV_FIXTURE_BLOCKS.AIR : null,
        isLoaded: (x, z) => loaded.has(key2(x, z)),
        setBlock: (x, y, z, type) => {
            loaded.add(key2(x, z));
            if (type === NAV_FIXTURE_BLOCKS.AIR) blocks.delete(key3(x, y, z));
            else blocks.set(key3(x, y, z), type);
        },
        setLoaded: (x, z, isLoaded) => {
            if (isLoaded) loaded.add(key2(x, z));
            else loaded.delete(key2(x, z));
        },
    };
}

export function simulateGroundEntity(input: GroundEntitySimulationInput): GroundEntitySimulationResult {
    const rows = input.fixture === 'ledge_detour'
        ? ['#########', '#S..   G#', '#.#####.#', '#.......#', '#########']
        : ['S........................G'];
    const world = makeNavigationWorld(rows);
    const profile = {
        width: 0.6, height: 1.6, maxStep: 1, maxJump: 1, maxDrop: 2,
        preferredRange: input.behavior === 'ranged' ? { min: 9, max: 13 } : { min: 0, max: 2 },
        acceleration: 14, turnRate: 10, jumpImpulse: 7, dropSpeedScale: 0.55,
    };
    const goal = input.behavior === 'ranged'
        ? { x: Math.max(world.start.x, world.goal.x - 11), y: world.goal.y, z: world.goal.z }
        : world.goal;
    const path = new VoxelNavigator(world).findPath({ start: world.start, goal, profile, maxExpandedNodes: 2048 });
    const agent = {
        pos: { x: world.start.x + 0.5, y: world.start.y, z: world.start.z + 0.5 },
        vel: { x: 0, y: 0, z: 0 },
        yaw: 0,
        grounded: true,
        navigationState: { waypointIndex: 1 },
    };
    const locomotionWorld = {
        canOccupy: ({ x, y, z }: { x: number; y: number; z: number }) => world.getBlock(x, y, z) === NAV_FIXTURE_BLOCKS.AIR,
        hasSafeLanding: ({ x, y, z }: { x: number; y: number; z: number }) => world.getBlock(x, y - 1, z) === NAV_FIXTURE_BLOCKS.STONE,
    };
    let fell = path === null;
    const dt = 0.05;
    for (let elapsed = 0; path && elapsed < input.seconds; elapsed += dt) {
        EntityLocomotion.tick(agent, path, locomotionWorld, dt, profile, 2.6);
        const nextX = agent.pos.x + agent.vel.x * dt;
        const nextZ = agent.pos.z + agent.vel.z * dt;
        const cellX = Math.floor(nextX);
        const cellZ = Math.floor(nextZ);
        if (world.getBlock(cellX, Math.floor(agent.pos.y) - 1, cellZ) !== NAV_FIXTURE_BLOCKS.STONE) {
            fell = true;
            break;
        }
        agent.pos.x = nextX;
        agent.pos.z = nextZ;
    }
    return {
        fell,
        distanceToTarget: Math.hypot(world.goal.x + 0.5 - agent.pos.x, world.goal.z + 0.5 - agent.pos.z),
        replans: path ? 1 : 0,
        hasLineOfSight: input.fixture === 'open_range',
    };
}
