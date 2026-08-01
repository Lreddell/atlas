export interface MusicLoopDefinition {
    sampleRate: number;
    startSample: number;
    endSample: number;
    crossfadeSamples: number;
}
export interface MusicLoopSchedule {
    currentStartSample: number;
    nextStartSample: number;
    overlapSamples: number;
    silenceGapSamples: 0;
}

const MUSIC_LOOP_DEFINITIONS: Readonly<Record<string, MusicLoopDefinition>> = Object.freeze({
    echoes_below: Object.freeze({
        sampleRate: 48_000,
        startSample: 0,
        endSample: 9_216_000,
        crossfadeSamples: 0,
    }),
    three_wings: Object.freeze({
        sampleRate: 48_000,
        startSample: 0,
        endSample: 6_248_135,
        crossfadeSamples: 0,
    }),
    bell_titan: Object.freeze({
        sampleRate: 48_000,
        startSample: 0,
        endSample: 9_525_454,
        crossfadeSamples: 0,
    }),
    the_vault_unravels: Object.freeze({
        sampleRate: 48_000,
        startSample: 0,
        endSample: 5_266_286,
        crossfadeSamples: 0,
    }),
});

export function readMusicLoopManifest(): Readonly<Record<string, MusicLoopDefinition>> {
    return MUSIC_LOOP_DEFINITIONS;
}

export function getMusicLoopDefinition(trackPath: string): MusicLoopDefinition | null {
    const normalized = trackPath.replace(/\\/g, '/');
    const fileName = normalized.slice(normalized.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
    const loopId = fileName === 'last_toll' ? 'bell_titan' : fileName;
    return MUSIC_LOOP_DEFINITIONS[loopId] ?? null;
}

export function scheduleLoopDecks(
    loop: MusicLoopDefinition,
    currentStartSample: number,
): MusicLoopSchedule {
    if (loop.sampleRate <= 0 || loop.endSample <= loop.startSample) {
        throw new RangeError('Music loop bounds must describe a positive sample range.');
    }
    if (loop.crossfadeSamples !== 0) {
        throw new RangeError('Authored Vault loops must restart at the exact end sample without overlap.');
    }

    return {
        currentStartSample,
        nextStartSample: currentStartSample
            + loop.endSample
            - loop.startSample
            - loop.crossfadeSamples,
        overlapSamples: 0,
        silenceGapSamples: 0,
    };
}
