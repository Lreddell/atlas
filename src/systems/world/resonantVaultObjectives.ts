import type { BellTitanAction } from '../entities/BellTitanEncounterCore';
import type { VaultEscapeRoute } from './resonantVaultEscapes';
import type { VaultRoomKind } from './resonantVaults';

export type VaultObjectivePhase =
    | 'enter'
    | 'search'
    | 'follow_echo'
    | 'sealed'
    | 'echo_listen'
    | 'echo_repeat'
    | 'cross'
    | 'judgment_pit'
    | 'restore_relay'
    | 'restore_counterweight'
    | 'combat'
    | 'boss'
    | 'claim'
    | 'choose_exit'
    | 'escape';

export interface VaultObjectiveState {
    phase: VaultObjectivePhase;
    progress?: number;
    total?: number;
    route?: VaultEscapeRoute | null;
    remainingSeconds?: number;
    hazardTier?: 0 | 1 | 2 | 3;
}

export interface VaultObjectiveView {
    key: string;
    primary: string;
    secondary?: string;
    /** Progress that must remain visible instead of yielding to world cues. */
    persistent?: true;
}

export interface VaultEnvironmentalCue {
    kind: 'path_light' | 'route_symbol' | 'receptive_device' | 'hazard' | 'cache' | 'completion_response';
    evidence: readonly string[];
}

export const VAULT_ENVIRONMENTAL_CUES: readonly VaultEnvironmentalCue[] = Object.freeze([
    { kind: 'path_light', evidence: ['warm_lamps', 'floor_inlay', 'open_sightline'] },
    { kind: 'route_symbol', evidence: ['grand_mosaic', 'fracture_mosaic'] },
    { kind: 'receptive_device', evidence: ['brass_fork_mark', 'matching_pylon_cap'] },
    { kind: 'hazard', evidence: ['visible_test_cycle', 'positional_warning_sound'] },
    { kind: 'cache', evidence: ['facing_enemy_lane', 'matching_use_target'] },
    { kind: 'completion_response', evidence: ['warm_light', 'physical_gate_open', 'single_response_sound'] },
]);

const PRIMARY: Readonly<Record<VaultObjectivePhase, string>> = Object.freeze({
    enter: 'Descend into the vault',
    search: 'Complete the chambers',
    follow_echo: 'Follow the echo',
    sealed: 'Seal locked',
    echo_listen: 'Listen',
    echo_repeat: 'Repeat the echo',
    cross: 'Cross the chamber',
    judgment_pit: 'The lower hall is listening',
    restore_relay: 'Carry the pulse',
    restore_counterweight: 'Balance the gallery',
    combat: 'Defeat the guardians',
    boss: 'Enter the bell chamber',
    claim: 'Claim the hammer',
    choose_exit: 'Choose an ascent',
    escape: 'Reach the surface',
});

function formatTime(seconds: number): string {
    const remaining = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0));
    return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
}

export function formatVaultObjective(state: VaultObjectiveState): VaultObjectiveView {
    const progress = Math.max(0, Math.floor(state.progress ?? 0));
    const total = Math.max(0, Math.floor(state.total ?? 0));
    if (state.phase === 'echo_listen' || state.phase === 'echo_repeat') {
        return {
            key: `${state.phase}:${progress}:${total}`,
            primary: PRIMARY[state.phase],
            ...(total > 0 ? { secondary: `${progress} / ${total}` } : {}),
            persistent: true,
        };
    }
    if (state.phase === 'search' || state.phase === 'follow_echo') {
        return {
            key: `${state.phase}:${progress}:${total}`,
            primary: PRIMARY[state.phase],
            secondary: `${progress} / ${total} complete`,
            persistent: true,
        };
    }
    if (state.phase === 'restore_relay') {
        return {
            key: `restore_relay:${progress}:${total}`,
            primary: PRIMARY.restore_relay,
            secondary: `${progress} / ${total} resonators awake`,
            persistent: true,
        };
    }
    if (state.phase === 'restore_counterweight') {
        return {
            key: `restore_counterweight:${progress}:${total}`,
            primary: PRIMARY.restore_counterweight,
            ...(total > 0 ? { secondary: `${progress} / ${total} weights raised` } : {}),
            persistent: true,
        };
    }
    if (state.phase === 'judgment_pit') {
        return { key: state.phase, primary: PRIMARY[state.phase], persistent: true };
    }
    if (state.phase === 'sealed') {
        return {
            key: `sealed:${progress}:${total}`,
            primary: PRIMARY.sealed,
            secondary: `${progress} / ${total} chambers complete`,
            persistent: true,
        };
    }
    if (state.phase === 'choose_exit') {
        return {
            key: `choose_exit:${progress}:${total}`,
            primary: PRIMARY.choose_exit,
            secondary: 'Grand: long, guarded | Fracture: short, hazardous',
            persistent: true,
        };
    }
    if (state.phase === 'escape') {
        const route = state.route === 'grand' ? 'Grand Ascent' : 'Fracture Stair';
        const remaining = Math.max(0, Math.ceil(state.remainingSeconds ?? 0));
        return {
            key: `escape:${state.route ?? 'none'}:${remaining}`,
            primary: PRIMARY.escape,
            secondary: remaining <= 0 || state.hazardTier === 3 && remaining < 1
                ? `${route} | hazards at maximum`
                : `${formatTime(remaining)} | ${route}`,
            persistent: true,
        };
    }
    return { key: state.phase, primary: PRIMARY[state.phase] };
}

export interface VaultObjectiveContext {
    discovered: boolean;
    entered: boolean;
    room: VaultRoomKind | null;
    hasTuningFork: boolean;
    roomSolved: boolean;
    expeditionReady: boolean;
    memoryProgress: number;
    restoreProgress: number;
    restoreTotal: number;
    counterweightProgress: number;
    counterweightTotal: number;
    crossingPitActive: boolean;
    echoMode: 'idle' | 'listen' | 'repeat';
    echoProgress: number;
    echoLength: number;
    titanActive: boolean;
    titanCoreExposed: boolean;
    titanDefeated: boolean;
    titanAction: BellTitanAction | null;
    coreClaimed: boolean;
    escapeStarted: boolean;
    escapeCompleted: boolean;
    escapeRoute: VaultEscapeRoute | null;
    escapeHazardTier: 0 | 1 | 2 | 3;
    escapeRemaining: number;
    requiredCompleted: number;
    requiredTotal: number;
    preSealCompleted: number;
    preSealTotal: number;
    nearInnerSeal: boolean;
    guidanceActive: boolean;
}

const COMBAT_ROOMS = new Set<VaultRoomKind>([
    'guard_hall', 'resonance_foundry', 'inner_works', 'bell_crypt',
]);

export function getVaultObjective(context: VaultObjectiveContext): VaultObjectiveView | null {
    if (context.escapeCompleted) return null;
    if (context.escapeStarted) {
        return context.escapeRoute
            ? formatVaultObjective({
                phase: 'escape',
                route: context.escapeRoute,
                remainingSeconds: context.escapeRemaining,
                hazardTier: context.escapeHazardTier,
            })
            : formatVaultObjective({ phase: 'choose_exit', progress: 0, total: 0 });
    }
    if (!context.discovered || !context.entered) return formatVaultObjective({ phase: 'enter' });
    if (!context.hasTuningFork) return { key: 'find_fork', primary: 'Find a tuning fork', persistent: true };

    if (!context.expeditionReady) {
        if (context.crossingPitActive) return formatVaultObjective({ phase: 'judgment_pit' });
        if (context.nearInnerSeal && context.preSealCompleted < context.preSealTotal) {
            return formatVaultObjective({
                phase: 'sealed',
                progress: context.preSealCompleted,
                total: context.preSealTotal,
            });
        }
        if (context.guidanceActive) {
            return formatVaultObjective({
                phase: 'follow_echo',
                progress: context.requiredCompleted,
                total: context.requiredTotal,
            });
        }
        if (context.room === 'memory_choir' && !context.roomSolved) {
            const phase = context.echoMode === 'repeat' ? 'echo_repeat' : 'echo_listen';
            return formatVaultObjective({
                phase,
                progress: context.echoMode === 'idle' ? 0 : context.echoProgress,
                total: context.echoMode === 'idle' ? 0 : context.echoLength,
            });
        }
        if (context.room === 'broken_crossing' && !context.roomSolved) {
            return formatVaultObjective({ phase: 'cross' });
        }
        if (context.room === 'acoustic_relay' && !context.roomSolved) {
            return formatVaultObjective({
                phase: 'restore_relay',
                progress: context.restoreProgress,
                total: context.restoreTotal,
            });
        }
        if (context.room === 'counterweight_gallery' && !context.roomSolved) {
            return formatVaultObjective({
                phase: 'restore_counterweight',
                progress: context.counterweightProgress,
                total: context.counterweightTotal,
            });
        }
        if (context.room && COMBAT_ROOMS.has(context.room) && !context.roomSolved) {
            return formatVaultObjective({ phase: 'combat' });
        }
        return formatVaultObjective({
            phase: 'search',
            progress: context.requiredCompleted,
            total: context.requiredTotal,
        });
    }

    if (!context.titanDefeated) {
        if (context.titanActive) return null;
        return formatVaultObjective({ phase: 'boss' });
    }
    if (!context.coreClaimed) return formatVaultObjective({ phase: 'claim' });
    return null;
}
