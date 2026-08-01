import type { VaultLayout, VaultRoom, VaultRoomKind } from './resonantVaults';

const MANDATORY_PUZZLE_KINDS = new Set<VaultRoomKind>([
    'memory_choir',
    'counterweight_gallery',
    'acoustic_relay',
    'broken_crossing',
]);

const MANDATORY_COMBAT_KINDS = new Set<VaultRoomKind>([
    'guard_hall',
    'resonance_foundry',
    'inner_works',
]);

export function isVaultChallengeRoom(room: VaultRoom): boolean {
    return MANDATORY_PUZZLE_KINDS.has(room.kind) || MANDATORY_COMBAT_KINDS.has(room.kind);
}

export function getVaultPreSealRequiredRoomIds(layout: VaultLayout): string[] {
    const blockedEdges = new Set(layout.doorways
        .filter(({ gate }) => gate === 'inner_seal')
        .flatMap(({ from, to }) => [`${from}>${to}`, `${to}>${from}`]));
    const neighbors = new Map<string, string[]>();
    for (const [from, to] of layout.edges) {
        if (blockedEdges.has(`${from}>${to}`)) continue;
        neighbors.set(from, [...(neighbors.get(from) ?? []), to]);
        neighbors.set(to, [...(neighbors.get(to) ?? []), from]);
    }

    const reached = new Set<string>(['entrance']);
    const queue = ['entrance'];
    for (let index = 0; index < queue.length; index += 1) {
        for (const next of neighbors.get(queue[index]) ?? []) {
            if (reached.has(next)) continue;
            reached.add(next);
            queue.push(next);
        }
    }
    return layout.rooms
        .filter((room) => reached.has(room.id) && isVaultChallengeRoom(room))
        .map((room) => room.id);
}

export function getVaultRequiredRoomIds(layout: VaultLayout): string[] {
    return layout.rooms.filter(isVaultChallengeRoom).map((room) => room.id);
}
