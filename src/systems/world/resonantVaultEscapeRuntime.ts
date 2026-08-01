import type { VaultEscapeRoute } from './resonantVaultEscapes.ts';

export const VAULT_ESCAPE_DURATION_SECONDS = 420;

export interface VaultEscapeState {
    started: boolean;
    remainingSeconds: number;
    chosenRoute: VaultEscapeRoute | null;
    closedRoute: VaultEscapeRoute | null;
    latestCheckpoint: string | null;
    hazardTier: 0 | 1 | 2 | 3;
    routeOpen: boolean;
    completed: boolean;
}

export type VaultEscapeInput =
    | { type: 'core_claimed' }
    | { type: 'tick'; dt: number }
    | { type: 'route_threshold'; route: VaultEscapeRoute }
    | { type: 'checkpoint'; route: VaultEscapeRoute; checkpointId: string }
    | {
        type: 'player_position';
        route: VaultEscapeRoute;
        y: number;
        surfaceY: number;
        insideCompletionVolume: boolean;
        connectedToOpenAir: boolean;
    };

export interface VaultEscapeTransition {
    state: VaultEscapeState;
    routeChosen: VaultEscapeRoute | null;
    checkpointCompleted: string | null;
    completedNow: boolean;
}

export function getEscapeHazardTier(remainingSeconds: number): 0 | 1 | 2 | 3 {
    const remaining = Math.max(0, Number.isFinite(remainingSeconds) ? remainingSeconds : 0);
    if (remaining <= 30) return 3;
    if (remaining <= 90) return 2;
    if (remaining <= 180) return 1;
    return 0;
}

export function createVaultEscapeState(
    initial: Partial<VaultEscapeState> = {},
): VaultEscapeState {
    const chosenRoute = initial.chosenRoute === 'grand' || initial.chosenRoute === 'fracture'
        ? initial.chosenRoute
        : null;
    const remainingSeconds = Math.max(0, Math.min(
        VAULT_ESCAPE_DURATION_SECONDS,
        Number.isFinite(initial.remainingSeconds) ? initial.remainingSeconds! : VAULT_ESCAPE_DURATION_SECONDS,
    ));
    const completed = initial.completed === true;
    return {
        started: initial.started ?? chosenRoute !== null,
        remainingSeconds,
        chosenRoute,
        closedRoute: chosenRoute === 'grand' ? 'fracture' : chosenRoute === 'fracture' ? 'grand' : null,
        latestCheckpoint: initial.latestCheckpoint ?? null,
        hazardTier: getEscapeHazardTier(remainingSeconds),
        routeOpen: !completed,
        completed,
    };
}

export function advanceVaultEscape(state: VaultEscapeState, input: VaultEscapeInput): VaultEscapeTransition {
    let next = { ...state };
    let routeChosen: VaultEscapeRoute | null = null;
    let checkpointCompleted: string | null = null;
    let completedNow = false;

    if (input.type === 'core_claimed' && !state.started && !state.completed) {
        next = createVaultEscapeState({ started: true });
    } else if (input.type === 'tick' && state.started && !state.completed) {
        const dt = Math.max(0, Number.isFinite(input.dt) ? input.dt : 0);
        next.remainingSeconds = Math.max(0, state.remainingSeconds - dt);
        next.hazardTier = getEscapeHazardTier(next.remainingSeconds);
        next.routeOpen = true;
    } else if (input.type === 'route_threshold' && state.started && !state.chosenRoute && !state.completed) {
        const route = input.route;
        next.chosenRoute = route;
        next.closedRoute = route === 'grand' ? 'fracture' : 'grand';
        next.routeOpen = true;
        routeChosen = route;
    } else if (input.type === 'checkpoint' && state.started && !state.completed) {
        const route = input.route;
        if (route === state.chosenRoute && input.checkpointId) {
            next.latestCheckpoint = input.checkpointId;
            checkpointCompleted = input.checkpointId;
        }
    } else if (input.type === 'player_position' && state.started && !state.completed) {
        const route = input.route;
        const completes = route === state.chosenRoute
            && input.insideCompletionVolume
            && input.connectedToOpenAir
            && input.y >= input.surfaceY + 1;
        if (completes) {
            next.completed = true;
            next.routeOpen = false;
            completedNow = true;
        }
    }

    return { state: next, routeChosen, checkpointCompleted, completedNow };
}
