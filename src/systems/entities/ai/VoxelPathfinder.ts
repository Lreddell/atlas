export interface PathNode { x: number; y: number; z: number }
export interface PathWorld { canStandAt(x: number, y: number, z: number): boolean }

const key = (node: PathNode) => `${node.x},${node.y},${node.z}`;
const heuristic = (a: PathNode, b: PathNode) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);

/** Bounded A* for short local mob paths; intentionally never searches unbounded terrain. */
export function findVoxelPath(world: PathWorld, start: PathNode, goal: PathNode, maxVisited = 1024): PathNode[] | null {
    const open: Array<{ node: PathNode; g: number; f: number }> = [{ node: start, g: 0, f: heuristic(start, goal) }];
    const cameFrom = new Map<string, string>();
    const nodes = new Map<string, PathNode>([[key(start), start]]);
    const score = new Map<string, number>([[key(start), 0]]);
    const closed = new Set<string>();
    while (open.length > 0 && closed.size < maxVisited) {
        open.sort((a, b) => a.f - b.f);
        const current = open.shift()!;
        const currentKey = key(current.node);
        if (closed.has(currentKey)) continue;
        if (currentKey === key(goal)) {
            const path: PathNode[] = [current.node];
            let cursor = currentKey;
            while (cameFrom.has(cursor)) { cursor = cameFrom.get(cursor)!; path.push(nodes.get(cursor)!); }
            return path.reverse();
        }
        closed.add(currentKey);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            let next: PathNode | null = null;
            for (const dy of [0, 1, -1]) {
                const candidate = { x: current.node.x + dx, y: current.node.y + dy, z: current.node.z + dz };
                if (world.canStandAt(candidate.x, candidate.y, candidate.z)) { next = candidate; break; }
            }
            if (!next) continue;
            const nextKey = key(next);
            const tentative = current.g + 1 + Math.abs(next.y - current.node.y) * 0.5;
            if (tentative >= (score.get(nextKey) ?? Infinity)) continue;
            nodes.set(nextKey, next);
            cameFrom.set(nextKey, currentKey);
            score.set(nextKey, tentative);
            open.push({ node: next, g: tentative, f: tentative + heuristic(next, goal) });
        }
    }
    return null;
}
