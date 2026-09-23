type Position = { x: number; y: number; z: number };

/** Find the nearest clear exit when geometry appears inside the player.
 * Never search down into the foundation. The caller supplies the actual body
 * collision test, including partial blocks and unloaded chunk boundaries.
 */
export function findUnstuckPosition(position: Position, collides: (p: Position) => boolean): Position | null {
    if (!collides(position)) return null;
    const directions = [
        [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
        [Math.SQRT1_2, 0, Math.SQRT1_2], [-Math.SQRT1_2, 0, Math.SQRT1_2],
        [Math.SQRT1_2, 0, -Math.SQRT1_2], [-Math.SQRT1_2, 0, -Math.SQRT1_2],
    ];
    let best: Position | null = null;
    let bestDistance = Infinity;
    for (const [x, y, z] of directions) {
        const at = (d: number): Position => ({ x: position.x + x * d, y: position.y + y * d, z: position.z + z * d });
        const limit = y ? 32 : 4;
        for (let distance = 0.125; distance <= Math.min(limit, bestDistance + 0.125); distance += 0.125) {
            if (collides(at(distance))) continue;
            // Refine the first clear sample to avoid jumping farther than needed.
            let lo = distance - 0.125, hi = distance;
            for (let i = 0; i < 10; i++) {
                const mid = (lo + hi) / 2;
                if (collides(at(mid))) lo = mid;
                else hi = mid;
            }
            if (hi < bestDistance) { bestDistance = hi; best = at(hi); }
            break;
        }
    }
    return best;
}
