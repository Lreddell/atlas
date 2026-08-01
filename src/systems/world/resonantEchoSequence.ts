export const MEMORY_ECHO_STEP_MS = 1100;
export const MEMORY_ECHO_PASS_PAUSE_MS = 1400;
export const MEMORY_ECHO_SOUND_EVENT = 'vault.echo_step' as const;
export const MEMORY_PYLON_OFFSETS = [
    [-8, -6],
    [8, -6],
    [8, 6],
    [-8, 6],
] as const;

export interface VaultEchoMarker {
    x: number;
    y: number;
    z: number;
}

export interface VaultEchoStep {
    symbol: number;
    sequenceIndex: number;
    marker: VaultEchoMarker;
    pass: 1 | 2;
    startsAtMs: number;
    durationMs: number;
}

export function buildMemoryDemonstration(
    sequence: readonly number[],
    markers: readonly VaultEchoMarker[],
    firstActivation: boolean,
): VaultEchoStep[] {
    const passes = firstActivation ? 2 : 1;
    const steps: VaultEchoStep[] = [];
    for (let pass = 0; pass < passes; pass += 1) {
        const passOffset = pass * (sequence.length * MEMORY_ECHO_STEP_MS + MEMORY_ECHO_PASS_PAUSE_MS);
        sequence.forEach((symbol, index) => {
            const marker = markers[symbol];
            if (!marker) throw new Error(`Echo symbol ${symbol} has no visible marker`);
            steps.push({
                symbol,
                sequenceIndex: index,
                marker: { ...marker },
                pass: (pass + 1) as 1 | 2,
                startsAtMs: passOffset + index * MEMORY_ECHO_STEP_MS,
                durationMs: MEMORY_ECHO_STEP_MS,
            });
        });
    }
    return steps;
}

export function getMemoryEchoMarkers(room: { x: number; y: number; z: number }): VaultEchoMarker[] {
    return MEMORY_PYLON_OFFSETS.map(([dx, dz]) => ({
        x: room.x + dx,
        y: room.y + 1,
        z: room.z + dz,
    }));
}
