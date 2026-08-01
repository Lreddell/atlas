import { gameEvents } from '../events/GameEvents';
import { bellTitanEncounter } from '../entities/BellTitanEncounter';
import { soundManager } from './SoundManager';
import type { SoundOptions } from './soundTypes';

interface ResonantSoundSink {
    play(eventId: string, options?: SoundOptions): void;
    playAt(eventId: string, position: { x: number; y: number; z: number }, options?: SoundOptions): void;
    preload(soundIds: string[]): Promise<void>;
}

const RESONANT_PRELOAD_EVENTS = [
    'vault.discovery',
    'vault.enter',
    'vault.tuning_fork',
    'vault.route_step',
    'vault.echo_step',
    'vault.pylon_wrong',
    'vault.room_complete',
    'vault.seal_release',
    'vault.sentinel_spawn',
    'vault.titan_awaken',
    'vault.titan_step',
    'vault.titan_chain',
    'vault.titan_sweep',
    'vault.titan_slam',
    'vault.titan_toll',
    'vault.titan_core_open',
    'vault.titan_shell_break',
    'vault.titan_hurt',
    'vault.titan_death',
    'vault.core_claim',
    'vault.escape_start',
    'vault.escape_warning',
    'vault.escape_complete',
    'vault.listening_stone',
    'vault.enemy.guard_step',
    'vault.enemy.guard_swing',
    'vault.enemy.marksman_brace',
    'vault.enemy.marksman_fire',
    'vault.enemy.marksman_reload',
    'vault.enemy.hound_leap',
    'vault.enemy.hound_land',
    'vault.enemy.tollkeeper_windup',
    'vault.enemy.tollkeeper_impact',
] as const;

const ESCAPE_WARNING_THRESHOLDS = [30, 10, 5] as const;
const ECHO_STEP_PITCH = [0.92, 1, 1.08, 1.19] as const;
const ROUTE_ECHO_PITCH = [0.94, 1.04, 1.15] as const;

/**
 * Maps typed vault events onto authored cues. The director owns only event-to-cue
 * policy; decoding, category volume, positional panning, concurrency, and pause
 * filtering remain inside SoundManager.
 */
export class ResonantVaultAudioDirector {
    private enteredVaultId: string | null = null;
    private preloaded = false;
    private playedEscapeWarnings = new Set<number>();
    private routeEchoTimers = new Set<number>();

    constructor(private readonly sound: ResonantSoundSink = soundManager) {
        gameEvents.on('vault:discovered', () => {
            this.preloadOnce();
            this.sound.play('vault.discovery');
        });

        gameEvents.on('vault:entered', ({ vaultId }) => {
            this.preloadOnce();
            if (this.enteredVaultId === vaultId) return;
            this.enteredVaultId = vaultId;
            this.sound.play('vault.enter');
        });

        gameEvents.on('vault:left', ({ vaultId }) => {
            if (this.enteredVaultId === vaultId) this.enteredVaultId = null;
            this.playedEscapeWarnings.clear();
            this.clearRouteEchoTimers();
        });

        gameEvents.on('vault:echo-preview', ({ kind, cells }) => {
            if (kind !== 'route' || cells.length === 0) return;
            this.clearRouteEchoTimers();
            const indices = [...new Set(ROUTE_ECHO_PITCH.map((_, index) => (
                Math.round(index * (cells.length - 1) / Math.max(1, ROUTE_ECHO_PITCH.length - 1))
            )))];
            indices.forEach((cellIndex, cueIndex) => {
                const timer = window.setTimeout(() => {
                    this.routeEchoTimers.delete(timer);
                    const cell = cells[cellIndex];
                    if (!cell) return;
                    this.sound.playAt(
                        'vault.route_step',
                        { x: cell.x + 0.5, y: cell.y + 1.08, z: cell.z + 0.5 },
                        { pitch: ROUTE_ECHO_PITCH[cueIndex], fallback: false },
                    );
                }, 320 + cueIndex * 260);
                this.routeEchoTimers.add(timer);
            });
        });

        gameEvents.on('vault:memory-input', ({ symbol, correct, x, y, z }) => {
            this.sound.playAt(
                correct ? 'vault.echo_step' : 'vault.pylon_wrong',
                { x: x + 0.5, y: y + 1.25, z: z + 0.5 },
                correct ? { pitch: ECHO_STEP_PITCH[symbol & 3], fallback: false } : { fallback: false },
            );
        });

        gameEvents.on('vault:echo-step', ({ symbol, x, y, z }) => {
            this.sound.playAt(
                'vault.echo_step',
                { x: x + 0.5, y: y + 1.1, z: z + 0.5 },
                {
                    pitch: ECHO_STEP_PITCH[symbol & 3],
                    volume: 1.15,
                    refDistance: 7,
                    maxDistance: 52,
                    rolloffFactor: 0.55,
                },
            );
        });

        gameEvents.on('vault:room-solved', () => {
            this.sound.play('vault.room_complete');
        });

        gameEvents.on('vault:unsealed', () => {
            this.sound.play('vault.seal_release');
        });

        gameEvents.on('vault:encounter-started', ({ room, roomId }) => {
            // Definitive room enemies receive their recorded identity cues with
            // their dedicated presentation. Never borrow the retired Sentinel cue.
            if (room === 'combat' && !roomId) this.sound.play('vault.sentinel_spawn');
        });

        gameEvents.on('vault:titan-awakened', () => {
            const position = this.titanPosition(3.1);
            if (!position) return;
            this.sound.playAt('vault.titan_awaken', position, { fallback: false });
            this.sound.playAt('vault.titan_chain', position, { pitch: 0.92, volume: 0.66, fallback: false });
        });

        gameEvents.on('vault:titan-action', ({ action }) => {
            const position = this.titanPosition(action.includes('toll') || action.includes('storm') ? 3.05 : 1.1);
            if (!position) return;
            if (action.endsWith('_windup')) {
                const heavy = action.startsWith('vaultbreaker') || action.startsWith('bell_storm')
                    || action.startsWith('resonance_cage');
                this.sound.playAt('vault.titan_chain', position, {
                    volume: heavy ? 0.84 : 0.66,
                    pitch: action.startsWith('chain_lash') ? 1.08 : heavy ? 0.84 : 0.96,
                    fallback: false,
                });
                if (heavy) this.sound.playAt('vault.titan_toll', this.titanPosition(3.05) ?? position, {
                    volume: 0.34,
                    pitch: action.startsWith('resonance_cage') ? 1.12 : 0.76,
                    fallback: false,
                });
            } else if (action === 'advance_active') {
                this.sound.playAt('vault.titan_step', position, { fallback: false });
            }
        });

        gameEvents.on('vault:titan-strike', ({ attack, index = 1 }) => {
            const high = this.titanPosition(3.05);
            const low = this.titanPosition(1.05);
            if (!high || !low) return;
            if (attack === 'sweep' || attack === 'chain_lash' || attack === 'hammer_combo') {
                this.sound.playAt('vault.titan_sweep', low, {
                    volume: attack === 'chain_lash' ? 1.06 : 0.9,
                    pitch: attack === 'chain_lash' ? 0.78 : index === 2 ? 0.92 : 1.02,
                    fallback: false,
                });
                if (attack === 'hammer_combo' && index === 2) {
                    this.sound.playAt('vault.titan_slam', low, { volume: 0.58, pitch: 1.08, fallback: false });
                }
            } else if (attack === 'slam' || attack === 'vaultbreaker' || attack === 'phase_burst') {
                this.sound.playAt('vault.titan_slam', low, {
                    volume: attack === 'vaultbreaker' ? 1.12 : 0.94,
                    pitch: attack === 'phase_burst' ? 0.88 : attack === 'vaultbreaker' ? 0.74 : 1,
                    fallback: false,
                });
            } else if (attack === 'double_toll' || attack === 'bell_storm' || attack === 'resonance_cage') {
                this.sound.playAt('vault.titan_toll', high, {
                    volume: attack === 'bell_storm' ? 1.08 : 0.94,
                    pitch: attack === 'resonance_cage' ? 1.12 : 0.9 + Math.min(3, index - 1) * 0.06,
                    fallback: false,
                });
            } else if (attack === 'advance') {
                this.sound.playAt('vault.titan_slam', low, { volume: 0.72, pitch: 1.12, fallback: false });
            }
        });

        gameEvents.on('vault:titan-core', ({ open }) => {
            if (!open) return;
            const position = this.titanPosition(3.15);
            if (position) this.sound.playAt('vault.titan_core_open', position, { fallback: false });
        });

        gameEvents.on('vault:titan-shell-broken', () => {
            const position = this.titanPosition(3.4);
            if (position) this.sound.playAt('vault.titan_shell_break', position, { fallback: false });
        });

        gameEvents.on('vault:titan-hurt', () => {
            const position = this.titanPosition(3.1);
            if (position) this.sound.playAt('vault.titan_hurt', position, { fallback: false });
        });

        gameEvents.on('vault:titan-deflected', () => {
            const position = this.titanPosition(3.1);
            if (position) this.sound.playAt('vault.titan_chain', position, { volume: 0.46, pitch: 1.18, fallback: false });
        });

        gameEvents.on('vault:titan-defeated', () => {
            const position = this.titanPosition(3.1);
            if (position) this.sound.playAt('vault.titan_death', position, { fallback: false });
        });

        gameEvents.on('vault:core-claimed', () => {
            this.sound.play('vault.core_claim');
        });

        gameEvents.on('vault:escape-started', () => {
            this.playedEscapeWarnings.clear();
            this.sound.play('vault.escape_start');
        });

        gameEvents.on('vault:escape-tick', ({ remainingSeconds }) => {
            for (const threshold of ESCAPE_WARNING_THRESHOLDS) {
                if (remainingSeconds > threshold || this.playedEscapeWarnings.has(threshold)) continue;
                this.playedEscapeWarnings.add(threshold);
                const pitch = threshold === 30 ? 0.9 : threshold === 10 ? 1.0 : 1.12;
                this.sound.play('vault.escape_warning', { pitch });
            }
        });

        gameEvents.on('vault:escape-completed', () => {
            this.playedEscapeWarnings.clear();
            this.sound.play('vault.escape_complete');
        });

        gameEvents.on('vault:resonance-pulse', ({ x, y, z }) => {
            const position = { x, y, z };
            this.sound.playAt('vault.tuning_fork', position);
        });

        gameEvents.on('vault:enemy-action', ({ kind, action, phase, x, y, z }) => {
            const position = { x, y: y + (kind === 'bell_hound' ? 0.65 : 1.1), z };
            if ((action === 'guard_sweep' || action === 'shield_bash') && phase === 'active') {
                this.sound.playAt('vault.enemy.guard_swing', position, {
                    pitch: action === 'shield_bash' ? 0.78 : 1,
                    volume: action === 'shield_bash' ? 0.92 : 1,
                    fallback: false,
                });
            } else if (action === 'crossbow_shot' || action === 'crossbow_volley') {
                const cue = phase === 'anticipation' ? 'vault.enemy.marksman_brace'
                    : phase === 'active' ? 'vault.enemy.marksman_fire'
                        : 'vault.enemy.marksman_reload';
                this.sound.playAt(cue, position, {
                    pitch: action === 'crossbow_volley' ? 0.9 : 1,
                    volume: action === 'crossbow_volley' && phase === 'active' ? 1.08 : 1,
                    fallback: false,
                });
            } else if ((action === 'hound_leap' || action === 'hound_rake') && phase === 'active') {
                this.sound.playAt('vault.enemy.hound_leap', position, {
                    pitch: action === 'hound_rake' ? 0.82 : 1,
                    volume: action === 'hound_rake' ? 0.78 : 1,
                    fallback: false,
                });
            } else if (action === 'guard_block') {
                // Raised guard: a bright metallic ring going up, a dull one down,
                // so the timing window reads without looking at the enemy.
                this.sound.playAt('block.amethyst.hit', position, { volume: 0.55, pitch: phase === 'active' ? 1.5 : 0.85 });
            } else if (action === 'hammer_strike' || action === 'bell_toll' || action === 'breaker_charge') {
                if (phase === 'anticipation') {
                    this.sound.playAt('vault.enemy.tollkeeper_windup', position, {
                        pitch: action === 'bell_toll' ? 0.72 : action === 'breaker_charge' ? 0.86 : 1,
                        volume: action === 'bell_toll' ? 1.08 : 1,
                        fallback: false,
                    });
                } else if (phase === 'active') {
                    this.sound.playAt('vault.enemy.tollkeeper_impact', position, {
                        pitch: action === 'bell_toll' ? 0.76 : action === 'breaker_charge' ? 0.9 : 1,
                        volume: action === 'bell_toll' ? 1.12 : 1,
                        fallback: false,
                    });
                }
            }
        });

        gameEvents.on('vault:enemy-footstep', ({ kind, x, y, z }) => {
            const pitch = kind === 'tollkeeper' ? 0.78 : kind === 'vault_marksman' ? 1.08 : 1;
            const volume = kind === 'tollkeeper' ? 1.05 : kind === 'vault_marksman' ? 0.62 : 0.82;
            this.sound.playAt('vault.enemy.guard_step', { x, y: y + 0.12, z }, { pitch, volume, fallback: false });
        });

        gameEvents.on('vault:enemy-landed', ({ kind, x, y, z }) => {
            if (kind !== 'bell_hound') return;
            this.sound.playAt('vault.enemy.hound_land', { x, y: y + 0.18, z }, { fallback: false });
        });

        gameEvents.on('vault:listening-stone-activated', ({ x, y, z }) => {
            this.preloadOnce();
            this.sound.playAt('vault.listening_stone', { x: x + 0.5, y: y + 0.75, z: z + 0.5 });
        });
    }

    private preloadOnce(): void {
        if (this.preloaded) return;
        this.preloaded = true;
        void this.sound.preload([...RESONANT_PRELOAD_EVENTS]);
    }

    private clearRouteEchoTimers(): void {
        for (const timer of this.routeEchoTimers) window.clearTimeout(timer);
        this.routeEchoTimers.clear();
    }

    private titanPosition(yOffset: number): { x: number; y: number; z: number } | null {
        const anchor = bellTitanEncounter.getRenderAnchor();
        return anchor ? { x: anchor.x, y: anchor.y + yOffset, z: anchor.z } : null;
    }
}

export const resonantVaultAudio = new ResonantVaultAudioDirector();
