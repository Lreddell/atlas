import type {
    NavigationAction,
    NavigationFailureReason,
    NavigationNode,
    NavigationPath,
    NavigationProfile,
    NavigationRequest,
    NavigationVector,
    NavigationWorld,
    SegmentResult,
} from './navigationTypes';

const AIR = 0;
const WATER = 7;
const LAVA = 22;
const PHASE_BLOCK = 79;
const ECHO_SPIKES = 82;
const VAULT_SEAL = 85;
const MAGNETIC_SPIKE = 245;
const EPSILON = 1e-6;
const SQRT_TWO = Math.SQRT2;

const DEFAULT_HAZARDS = new Set([LAVA, PHASE_BLOCK, ECHO_SPIKES, VAULT_SEAL, MAGNETIC_SPIKE]);
const NEIGHBORS = [
    { x: -1, z: -1 }, { x: -1, z: 0 }, { x: -1, z: 1 },
    { x: 0, z: -1 }, { x: 0, z: 1 },
    { x: 1, z: -1 }, { x: 1, z: 0 }, { x: 1, z: 1 },
] as const;

interface SearchNode extends NavigationNode {
    key: string;
    g: number;
    h: number;
    f: number;
}

const nodeKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

function compareNodes(a: SearchNode, b: SearchNode): number {
    return a.f - b.f
        || a.h - b.h
        || a.x - b.x
        || a.y - b.y
        || a.z - b.z;
}

class DeterministicMinHeap {
    private values: SearchNode[] = [];

    get size(): number {
        return this.values.length;
    }

    push(value: SearchNode): void {
        let index = this.values.length;
        this.values.push(value);
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (compareNodes(this.values[parent], value) <= 0) break;
            this.values[index] = this.values[parent];
            index = parent;
        }
        this.values[index] = value;
    }

    pop(): SearchNode | null {
        if (this.values.length === 0) return null;
        const first = this.values[0];
        const last = this.values.pop()!;
        if (this.values.length === 0) return first;
        let index = 0;
        while (true) {
            const left = index * 2 + 1;
            if (left >= this.values.length) break;
            const right = left + 1;
            let child = left;
            if (right < this.values.length && compareNodes(this.values[right], this.values[left]) < 0) child = right;
            if (compareNodes(last, this.values[child]) <= 0) break;
            this.values[index] = this.values[child];
            index = child;
        }
        this.values[index] = last;
        return first;
    }
}

function normalizeProfile(profile: NavigationProfile): NavigationProfile {
    const width = Number.isFinite(profile.width) ? profile.width : 0.6;
    const height = Number.isFinite(profile.height) ? profile.height : 1.8;
    const maxStep = Number.isFinite(profile.maxStep) ? profile.maxStep : 0;
    const maxJump = Number.isFinite(profile.maxJump) ? profile.maxJump : 0;
    const maxDrop = Number.isFinite(profile.maxDrop) ? profile.maxDrop : 0;
    return {
        ...profile,
        width: Math.max(0.1, width),
        height: Math.max(0.1, height),
        maxStep: Math.max(0, Math.floor(maxStep)),
        maxJump: Math.max(0, Math.floor(maxJump)),
        maxDrop: Math.max(0, Math.floor(maxDrop)),
    };
}

function normalizePoint(point: NavigationVector): NavigationVector {
    return {
        x: Math.floor(Number.isFinite(point.x) ? point.x : 0),
        y: Math.round(Number.isFinite(point.y) ? point.y : 0),
        z: Math.floor(Number.isFinite(point.z) ? point.z : 0),
    };
}

function heuristic(from: NavigationVector, to: NavigationVector): number {
    const dx = Math.abs(to.x - from.x);
    const dz = Math.abs(to.z - from.z);
    const diagonal = Math.min(dx, dz);
    return diagonal * SQRT_TWO + (Math.max(dx, dz) - diagonal) + Math.abs(to.y - from.y) * 0.25;
}

function movementCost(from: NavigationVector, to: NavigationVector, action: NavigationAction): number {
    const horizontal = from.x !== to.x && from.z !== to.z ? SQRT_TWO : 1;
    const vertical = Math.abs(to.y - from.y);
    const actionPenalty = action === 'jump' ? 0.45 : action === 'drop' ? 0.16 : action === 'step' ? 0.1 : 0;
    return horizontal + vertical * 0.12 + actionPenalty;
}

function maximumDropStride(profile: NavigationProfile): number {
    return profile.width > 1 + EPSILON ? Math.ceil(profile.width) + 1 : 1;
}

export class NavigationSearch {
    private readonly navigator: VoxelNavigator;
    private readonly open = new DeterministicMinHeap();
    private readonly bestG = new Map<string, number>();
    private readonly cameFrom = new Map<string, string>();
    private readonly nodeByKey = new Map<string, NavigationNode>();
    private readonly start: NavigationVector;
    private readonly goal: NavigationVector;
    private readonly profile: NavigationProfile;
    private readonly maxExpandedNodes: number;
    private status: 'pending' | 'complete' | 'failed' = 'pending';
    private result: NavigationPath | null = null;
    private failure: NavigationFailureReason | null = null;
    private expanded = 0;

    constructor(navigator: VoxelNavigator, request: NavigationRequest) {
        this.navigator = navigator;
        this.start = normalizePoint(request.start);
        this.goal = normalizePoint(request.goal);
        this.profile = normalizeProfile(request.profile);
        this.maxExpandedNodes = Number.isFinite(request.maxExpandedNodes)
            ? Math.max(1, Math.floor(request.maxExpandedNodes))
            : 1;

        const startStatus = navigator.inspectStandingCell(this.start, this.profile);
        const goalStatus = navigator.inspectStandingCell(this.goal, this.profile);
        if (!startStatus.traversable || !goalStatus.traversable) {
            this.status = 'failed';
            this.failure = !startStatus.traversable ? startStatus.reason ?? 'blocked' : goalStatus.reason ?? 'blocked';
            return;
        }

        const h = heuristic(this.start, this.goal);
        const first: SearchNode = { ...this.start, action: 'walk', key: nodeKey(this.start.x, this.start.y, this.start.z), g: 0, h, f: h };
        this.open.push(first);
        this.bestG.set(first.key, 0);
        this.nodeByKey.set(first.key, first);
    }

    step(nodeBudget: number): 'pending' | 'complete' | 'failed' {
        if (this.status !== 'pending') return this.status;
        let remaining = Number.isFinite(nodeBudget) ? Math.max(0, Math.floor(nodeBudget)) : 0;
        while (remaining > 0 && this.open.size > 0) {
            const current = this.open.pop()!;
            if (current.g > (this.bestG.get(current.key) ?? Number.POSITIVE_INFINITY) + EPSILON) continue;
            this.expanded += 1;
            remaining -= 1;
            if (current.x === this.goal.x && current.y === this.goal.y && current.z === this.goal.z) {
                this.result = this.navigator.buildPath(current, this.cameFrom, this.nodeByKey, this.profile, this.expanded);
                this.status = 'complete';
                return this.status;
            }
            if (this.expanded >= this.maxExpandedNodes) {
                this.status = 'failed';
                this.failure = 'budget_exhausted';
                return this.status;
            }

            for (const neighbor of this.navigator.getNeighbors(current, this.profile)) {
                const key = nodeKey(neighbor.x, neighbor.y, neighbor.z);
                const g = current.g + movementCost(current, neighbor, neighbor.action);
                if (g + EPSILON >= (this.bestG.get(key) ?? Number.POSITIVE_INFINITY)) continue;
                const h = heuristic(neighbor, this.goal);
                const next: SearchNode = { ...neighbor, key, g, h, f: g + h };
                this.bestG.set(key, g);
                this.cameFrom.set(key, current.key);
                this.nodeByKey.set(key, next);
                this.open.push(next);
            }
        }
        if (this.open.size === 0) {
            this.status = 'failed';
            this.failure = 'no_path';
        }
        return this.status;
    }

    getResult(): NavigationPath | null {
        return this.result;
    }

    getFailureReason(): NavigationFailureReason | null {
        return this.failure;
    }

    getExpandedNodes(): number {
        return this.expanded;
    }
}

export class VoxelNavigator {
    private readonly world: NavigationWorld;

    constructor(world: NavigationWorld) {
        this.world = world;
    }

    beginSearch(request: NavigationRequest): NavigationSearch {
        return new NavigationSearch(this, request);
    }

    findPath(request: NavigationRequest): NavigationPath | null {
        const search = this.beginSearch(request);
        search.step(Math.max(1, request.maxExpandedNodes));
        return search.getResult();
    }

    validateSegment(fromInput: NavigationVector, toInput: NavigationVector, profileInput: NavigationProfile): SegmentResult {
        const from = normalizePoint(fromInput);
        const to = normalizePoint(toInput);
        const profile = normalizeProfile(profileInput);
        const deltaY = to.y - from.y;
        let action: NavigationAction = 'walk';
        if (deltaY > 0) {
            if (deltaY <= profile.maxStep) action = 'step';
            else if (deltaY <= profile.maxJump) action = 'jump';
            else return { traversable: false, reason: 'step_too_high' };
        } else if (deltaY < 0) {
            if (-deltaY > profile.maxDrop) return { traversable: false, reason: 'drop_too_far' };
            action = 'drop';
        }

        const destination = this.inspectStandingCell(to, profile);
        if (!destination.traversable) return destination;

        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const horizontalDistance = Math.hypot(dx, dz);
        const dropStride = Math.max(Math.abs(dx), Math.abs(dz));
        const maxDropStride = maximumDropStride(profile);
        if (action !== 'walk' && action !== 'drop' && horizontalDistance > SQRT_TWO + EPSILON) {
            return { traversable: false, reason: 'blocked' };
        }
        if (action === 'drop' && (dropStride > maxDropStride
            || horizontalDistance > SQRT_TWO * maxDropStride + EPSILON)) {
            return { traversable: false, reason: 'blocked' };
        }
        if (horizontalDistance <= EPSILON) return { traversable: true, action };

        // Explicit height-change actions are neighboring locomotion actions, not
        // smoothing candidates. Lift before a step/jump and descend after a drop.
        const sweepY = deltaY > 0 ? to.y : from.y;
        const samples = Math.max(1, Math.ceil(horizontalDistance / 0.2));
        for (let index = 0; index <= samples; index += 1) {
            const fraction = index / samples;
            const point = { x: from.x + dx * fraction, y: sweepY, z: from.z + dz * fraction };
            const clearance = this.inspectClearance(point, profile);
            if (!clearance.traversable) return clearance;
            if (action === 'walk') {
                const support = this.inspectSupport(point, profile);
                if (!support.traversable) return support;
            }
        }
        if (action === 'drop' && dropStride > 1) {
            // Wide bodies cannot settle in the first lower cell beside a ledge: their
            // trailing edge still intersects the upper block. Let the path commit to
            // the first lower cell that clears the lip, but require continuous safe
            // floor beneath the traversed cells so this never becomes a gap jump.
            for (let stride = 1; stride < dropStride; stride += 1) {
                const fraction = stride / dropStride;
                const support = this.inspectSupport({
                    x: from.x + dx * fraction,
                    y: to.y,
                    z: from.z + dz * fraction,
                }, profile);
                if (!support.traversable) return support;
            }
        }
        return { traversable: true, action };
    }

    inspectStandingCell(pointInput: NavigationVector, profile: NavigationProfile): SegmentResult {
        const point = normalizePoint(pointInput);
        const clearance = this.inspectClearance(point, profile);
        if (!clearance.traversable) return clearance;
        return this.inspectSupport(point, profile);
    }

    getNeighbors(node: NavigationVector, profile: NavigationProfile): NavigationNode[] {
        const neighbors: NavigationNode[] = [];
        const maxRise = Math.max(profile.maxStep, profile.maxJump);
        const deltas: number[] = [0];
        for (let amount = 1; amount <= Math.max(maxRise, profile.maxDrop); amount += 1) {
            if (amount <= maxRise) deltas.push(amount);
            if (amount <= profile.maxDrop) deltas.push(-amount);
        }

        for (const offset of NEIGHBORS) {
            for (const deltaY of deltas) {
                const target = { x: node.x + offset.x, y: node.y + deltaY, z: node.z + offset.z };
                const result = this.validateSegment(node, target, profile);
                if (result.traversable && result.action) {
                    neighbors.push({ ...target, action: result.action });
                    break;
                }
                if (deltaY >= 0 || profile.width <= 1) continue;
                const maxDropStride = maximumDropStride(profile);
                let extendedDrop: NavigationNode | null = null;
                for (let stride = 2; stride <= maxDropStride; stride += 1) {
                    const extendedTarget = {
                        x: node.x + offset.x * stride,
                        y: node.y + deltaY,
                        z: node.z + offset.z * stride,
                    };
                    const extended = this.validateSegment(node, extendedTarget, profile);
                    if (!extended.traversable || extended.action !== 'drop') continue;
                    extendedDrop = { ...extendedTarget, action: 'drop' };
                    break;
                }
                if (extendedDrop) {
                    neighbors.push(extendedDrop);
                    break;
                }
            }
        }
        return neighbors;
    }

    buildPath(
        finalNode: SearchNode,
        cameFrom: ReadonlyMap<string, string>,
        nodeByKey: ReadonlyMap<string, NavigationNode>,
        profile: NavigationProfile,
        expandedNodes: number,
    ): NavigationPath {
        const reversed: NavigationNode[] = [];
        let cursor: string | undefined = finalNode.key;
        while (cursor) {
            const node = nodeByKey.get(cursor);
            if (!node) break;
            reversed.push({ x: node.x, y: node.y, z: node.z, action: node.action });
            cursor = cameFrom.get(cursor);
        }
        reversed.reverse();
        if (reversed.length > 0) reversed[0] = { ...reversed[0], action: 'walk' };
        const smoothed = this.smoothPath(reversed, profile);
        return { nodes: smoothed, expandedNodes, totalCost: finalNode.g };
    }

    private smoothPath(nodes: NavigationNode[], profile: NavigationProfile): NavigationNode[] {
        if (nodes.length <= 2) return nodes;
        const result: NavigationNode[] = [nodes[0]];
        let anchor = 0;
        while (anchor < nodes.length - 1) {
            let chosen = anchor + 1;
            for (let candidate = nodes.length - 1; candidate > anchor + 1; candidate -= 1) {
                let containsAction = false;
                for (let index = anchor + 1; index <= candidate; index += 1) {
                    if (nodes[index].action !== 'walk') { containsAction = true; break; }
                }
                if (containsAction) continue;
                const segment = this.validateSegment(nodes[anchor], nodes[candidate], profile);
                if (segment.traversable && segment.action === 'walk') { chosen = candidate; break; }
            }
            result.push(nodes[chosen]);
            anchor = chosen;
        }
        return result;
    }

    private footprintCells(point: NavigationVector, profile: NavigationProfile): Array<{ x: number; z: number }> {
        const radius = profile.width / 2;
        const centerX = point.x + 0.5;
        const centerZ = point.z + 0.5;
        const minX = Math.floor(centerX - radius + EPSILON);
        const maxX = Math.floor(centerX + radius - EPSILON);
        const minZ = Math.floor(centerZ - radius + EPSILON);
        const maxZ = Math.floor(centerZ + radius - EPSILON);
        const cells: Array<{ x: number; z: number }> = [];
        for (let z = minZ; z <= maxZ; z += 1) {
            for (let x = minX; x <= maxX; x += 1) cells.push({ x, z });
        }
        return cells;
    }

    private inspectClearance(point: NavigationVector, profile: NavigationProfile): SegmentResult {
        const minY = Math.floor(point.y + EPSILON);
        const maxY = Math.floor(point.y + profile.height - EPSILON);
        for (const cell of this.footprintCells(point, profile)) {
            if (!this.isLoaded(cell.x, cell.z)) return { traversable: false, reason: 'unloaded' };
            for (let y = minY; y <= maxY; y += 1) {
                const type = this.world.getBlock(cell.x, y, cell.z);
                if (type === null) return { traversable: false, reason: 'unloaded' };
                if (this.isHazard(type, profile)) return { traversable: false, reason: 'hazard' };
                if (this.isSolid(type)) return { traversable: false, reason: 'no_clearance' };
            }
        }
        return { traversable: true };
    }

    private inspectSupport(point: NavigationVector, profile: NavigationProfile): SegmentResult {
        const supportY = Math.floor(point.y - EPSILON);
        for (const cell of this.footprintCells(point, profile)) {
            if (!this.isLoaded(cell.x, cell.z)) return { traversable: false, reason: 'unloaded' };
            const type = this.world.getBlock(cell.x, supportY, cell.z);
            if (type === null) return { traversable: false, reason: 'unloaded' };
            if (this.isHazard(type, profile)) return { traversable: false, reason: 'hazard' };
            if (!this.isSolid(type)) return { traversable: false, reason: 'unsupported' };
        }
        return { traversable: true };
    }

    private isLoaded(x: number, z: number): boolean {
        return this.world.isLoaded ? this.world.isLoaded(x, z) : this.world.getBlock(x, 0, z) !== null;
    }

    private isSolid(type: number): boolean {
        return this.world.isSolid ? this.world.isSolid(type) : type !== AIR && type !== WATER && type !== LAVA;
    }

    private isHazard(type: number, profile: NavigationProfile): boolean {
        return profile.avoidHazards?.has(type) === true
            || (this.world.isHazard ? this.world.isHazard(type) : DEFAULT_HAZARDS.has(type));
    }
}
