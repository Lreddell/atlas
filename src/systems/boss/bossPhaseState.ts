import { gameEvents } from '../events/GameEvents';

// Tracks the active boss "storm" intensity so ambient systems (biome fog + FX
// particles + music) can intensify per phase without each subscribing to the
// event bus. Enum-free + side-effect-light so it stays unit-testable.
//
//   phase 0 = no boss   1 = engaged   2 = slam phase (≤50%)   3 = frenzy (≤25%)

class BossPhaseState {
    private phase = 0;

    constructor() {
        gameEvents.on('boss:spawned', () => { this.phase = Math.max(this.phase, 1); });
        gameEvents.on('boss:phase', ({ phase }) => { this.phase = Math.max(this.phase, phase); });
        gameEvents.on('boss:defeated', () => { this.phase = 0; });
        gameEvents.on('boss:cleared', () => { this.phase = 0; });
    }

    /** Raw phase number (0..3). */
    get phaseNum(): number { return this.phase; }

    /** True once the boss has reached its frenzy phase (≤25% HP). */
    get isFrenzy(): boolean { return this.phase >= 3; }

    /** 0 (no boss) → 1 (frenzy): drives ambient storm intensity. */
    get intensity(): number {
        switch (this.phase) {
            case 0: return 0;
            case 1: return 0.35;
            case 2: return 0.65;
            default: return 1;
        }
    }
}

export const bossPhaseState = new BossPhaseState();
