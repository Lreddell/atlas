import type { VaultLayout, VaultRoomId } from './resonantVaults';
import { getVaultPreSealRequiredRoomIds, getVaultRequiredRoomIds } from './resonantVaultProgression.ts';

export interface MemoryState {
    progress: number;
    solved: boolean;
}

export interface MemoryInputResult {
    state: MemoryState;
    correct: boolean;
    completed: boolean;
}

export interface RelayState extends MemoryState {
    active: boolean;
    deadlineSeconds: number;
}

export interface RelayInputResult {
    state: RelayState;
    correct: boolean;
    completed: boolean;
}

export const RELAY_HANDOFF_SECONDS = 8;

export function getRelayHandoffSeconds(progress: number, length: number): number {
    const fraction = Math.max(0, Math.min(1, progress / Math.max(1, length - 1)));
    return RELAY_HANDOFF_SECONDS - fraction * 1.5;
}

export function beginRelay(state: RelayState, nowSeconds: number, length: number): RelayState {
    if (state.solved || length <= 0) return { ...state };
    return {
        progress: 0,
        solved: false,
        active: true,
        deadlineSeconds: nowSeconds + getRelayHandoffSeconds(0, length),
    };
}

export interface PhaseTiming {
    periodTicks: number;
    solidTicks: number;
    offsetTicks: number;
}

export function advanceMemoryInput(sequence: readonly number[], state: MemoryState, symbol: number): MemoryInputResult {
    if (state.solved) return { state: { ...state }, correct: true, completed: true };
    if (sequence.length === 0 || symbol !== sequence[state.progress]) {
        return { state: { progress: 0, solved: false }, correct: false, completed: false };
    }
    const progress = state.progress + 1;
    const solved = progress >= sequence.length;
    return {
        state: { progress, solved },
        correct: true,
        completed: solved,
    };
}

export function isPhaseLaneSolid(ticks: number, timing: PhaseTiming, lane: number): boolean {
    const period = Math.max(2, Math.floor(timing.periodTicks));
    const solidTicks = Math.max(1, Math.min(period - 1, Math.floor(timing.solidTicks)));
    const laneShift = (lane & 3) * Math.floor(period / 4);
    const phase = ((Math.floor(ticks) + timing.offsetTicks + laneShift) % period + period) % period;
    return phase < solidTicks;
}

export function advanceRelayInput(
    state: RelayState,
    receiverIndex: number,
    length: number,
    nowSeconds: number,
): RelayInputResult {
    if (state.solved) return { state: { ...state }, correct: true, completed: true };
    const expired = state.active && nowSeconds > state.deadlineSeconds;
    // The striker remains the clearest authored start, but the first receiver
    // also wakes the circuit. Missing the room-entry demonstration must never
    // leave an otherwise-correct player unable to begin the relay.
    const startingFromFirstReceiver = receiverIndex === 0 && (!state.active || expired);
    const expectedReceiver = startingFromFirstReceiver ? 0 : state.progress;
    if ((expired && !startingFromFirstReceiver) || receiverIndex !== expectedReceiver || length <= 0) {
        return {
            state: { progress: 0, solved: false, active: false, deadlineSeconds: Number.POSITIVE_INFINITY },
            correct: false,
            completed: false,
        };
    }
    const progress = (startingFromFirstReceiver ? 0 : state.progress) + 1;
    const solved = progress >= length;
    return {
        state: {
            progress,
            solved,
            active: !solved,
            deadlineSeconds: solved ? Number.POSITIVE_INFINITY : nowSeconds + getRelayHandoffSeconds(progress, length),
        },
        correct: true,
        completed: solved,
    };
}

export interface VaultEchoProgress {
    rooms: Record<string, boolean>;
    titanDefeated: boolean;
    coreClaimed: boolean;
    escapeStarted: boolean;
}

export function getNextVaultEchoTarget(
    layout: VaultLayout,
    progress: VaultEchoProgress,
    currentRoomId: VaultRoomId,
): VaultRoomId {
    const nearest = (roomIds: readonly VaultRoomId[]): VaultRoomId | null => {
        const ranked = roomIds
            .filter((roomId) => !progress.rooms[roomId])
            .map((roomId) => ({
                roomId,
                pathLength: getVaultRoomPath(layout.edges, currentRoomId, roomId).length,
                layoutIndex: layout.rooms.findIndex((room) => room.id === roomId),
            }))
            .sort((a, b) => a.pathLength - b.pathLength || a.layoutIndex - b.layoutIndex);
        return ranked[0]?.roomId ?? null;
    };

    // Never point through the inner seal while a reachable requirement remains.
    const preSealTarget = nearest(getVaultPreSealRequiredRoomIds(layout));
    if (preSealTarget) return preSealTarget;
    const requiredTarget = nearest(getVaultRequiredRoomIds(layout));
    if (requiredTarget) return requiredTarget;
    if (!progress.titanDefeated) return 'arena';
    if (!progress.coreClaimed) return 'core';
    const grandPath = getVaultRoomPath(layout.edges, currentRoomId, 'outlet_grand').length;
    const fracturePath = getVaultRoomPath(layout.edges, currentRoomId, 'outlet_fracture').length;
    return grandPath <= fracturePath ? 'outlet_grand' : 'outlet_fracture';
}

export function getVaultRoomPath(
    edges: ReadonlyArray<readonly [string, string]>,
    from: string,
    to: string,
): string[] {
    if (from === to) return [from];
    const neighbors = new Map<string, string[]>();
    for (const [left, right] of edges) {
        neighbors.set(left, [...(neighbors.get(left) ?? []), right]);
        neighbors.set(right, [...(neighbors.get(right) ?? []), left]);
    }
    const queue: string[][] = [[from]];
    const visited = new Set<string>([from]);
    while (queue.length > 0) {
        const path = queue.shift()!;
        const tail = path[path.length - 1];
        for (const next of neighbors.get(tail) ?? []) {
            if (visited.has(next)) continue;
            const extended = [...path, next];
            if (next === to) return extended;
            visited.add(next);
            queue.push(extended);
        }
    }
    return [from];
}
