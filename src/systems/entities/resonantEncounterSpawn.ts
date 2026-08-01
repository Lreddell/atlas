import type { VaultRoutePoint } from '../world/resonantVaults';

/**
 * Resolve one navigation point per enemy in a wave.
 *
 * Later waves prefer doorway entry anchors so reinforcements read as pouring
 * in from the room edges, but a doorway anchor is frequently unresolvable in
 * practice: the encounter seals the doorway plane with VAULT_SEAL (a
 * navigation hazard) while the fight runs, and wide kinds such as the
 * tollkeeper have a footprint that overlaps the sealed plane even from the
 * cell just inside the room. Every anchor is therefore only a preference —
 * each enemy falls back through all remaining anchors, first demanding an
 * unused point, then accepting a shared one, and resolves to null only when
 * no anchor is standable for its kind at all.
 *
 * The result always has one slot per wave entry; a null slot means that enemy
 * cannot spawn right now. Callers must treat nulls as skippable rather than
 * aborting the whole wave — an all-or-nothing wave retried against the same
 * deterministic anchors deadlocks the room (and the vault's one-active-room
 * lock) forever.
 */
export function resolveEncounterWaveSpawnPoints<TKind>(
    wave: readonly TKind[],
    entryAnchors: readonly VaultRoutePoint[],
    recoveryAnchors: readonly VaultRoutePoint[],
    waveIndex: number,
    resolveAnchor: (kind: TKind, anchor: VaultRoutePoint) => VaultRoutePoint | null,
): Array<VaultRoutePoint | null> {
    const anchors = waveIndex > 0 && entryAnchors.length > 0
        ? [...entryAnchors, ...recoveryAnchors]
        : [...recoveryAnchors];
    if (anchors.length === 0) return wave.map(() => null);

    const used = new Set<string>();
    const pointKey = (point: VaultRoutePoint) => `${point.x},${point.y},${point.z}`;
    return wave.map((kind, enemyIndex) => {
        let shared: VaultRoutePoint | null = null;
        for (let attempt = 0; attempt < anchors.length; attempt += 1) {
            const anchor = anchors[(waveIndex + enemyIndex + attempt) % anchors.length];
            const point = resolveAnchor(kind, anchor);
            if (!point) continue;
            if (!used.has(pointKey(point))) {
                used.add(pointKey(point));
                return point;
            }
            shared = shared ?? point;
        }
        return shared;
    });
}
