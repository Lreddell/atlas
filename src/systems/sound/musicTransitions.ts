export type MusicPriorityContext =
    | 'DEATH'
    | 'CINEMATIC'
    | 'BOSS_RESONANT'
    | 'BOSS_MAGNETIC'
    | 'VAULT_ESCAPE'
    | 'VAULT_COMBAT'
    | 'VAULT'
    | string;

export interface MusicTransitionState {
    context: MusicPriorityContext;
    activeTrack: string | null;
    outgoingTrack: string | null;
    priority: number;
    reason: string;
    crossfadeMs: number;
    crossfadeCurve: 'equal-power';
    silenceGapMs: 0;
    resumePreviousVaultTrack: boolean;
}
export interface MusicRequest {
    context: MusicPriorityContext;
    reason: string;
    track?: string | null;
}

export const PRIORITY_CROSSFADE_MS = 450;

const MUSIC_CONTEXT_PRIORITIES: Readonly<Record<string, number>> = Object.freeze({
    DEATH: 600,
    CINEMATIC: 600,
    BOSS_RESONANT: 500,
    BOSS_MAGNETIC: 450,
    VAULT_ESCAPE: 400,
    VAULT_COMBAT: 300,
    VAULT: 200,
});

export function getMusicContextPriority(context: MusicPriorityContext): number {
    return MUSIC_CONTEXT_PRIORITIES[context] ?? 100;
}

export function createMusicState(
    initial: { context?: MusicPriorityContext; track?: string | null } = {},
): MusicTransitionState {
    const context = initial.context ?? '';
    return {
        context,
        activeTrack: initial.track ?? null,
        outgoingTrack: null,
        priority: getMusicContextPriority(context),
        reason: 'initial',
        crossfadeMs: 0,
        crossfadeCurve: 'equal-power',
        silenceGapMs: 0,
        resumePreviousVaultTrack: false,
    };
}

export function reduceMusicRequest(
    state: MusicTransitionState,
    request: MusicRequest,
): MusicTransitionState {
    const contextChanged = request.context !== state.context;
    const nextTrack = request.track === undefined
        ? (contextChanged ? null : state.activeTrack)
        : request.track;

    return {
        context: request.context,
        activeTrack: nextTrack,
        outgoingTrack: contextChanged ? state.activeTrack : state.outgoingTrack,
        priority: getMusicContextPriority(request.context),
        reason: request.reason,
        crossfadeMs: contextChanged ? PRIORITY_CROSSFADE_MS : 0,
        crossfadeCurve: 'equal-power',
        silenceGapMs: 0,
        resumePreviousVaultTrack: false,
    };
}
