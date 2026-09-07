// The single owner of low-health state, and the single scheduler behind both the
// heartbeat cue and the vignette pulse.
//
// Health is pushed in whenever it CHANGES (see App's health effect), never polled
// per frame, and always as the final post-armor value — so fall damage, fire,
// drowning, starvation, regeneration, healing, a loaded save and a respawn all
// arrive through the same door. Inferring low health from `player:damaged` would
// be wrong: armor reduces the hit before it lands, and healing is not a hit.
//
// Audio and visuals share one timer on purpose. Two timers drift, and a heartbeat
// whose thump and flash are 40 ms apart reads as a bug.

import { gameEvents } from '../events/GameEvents';
import { soundManager } from '../sound/SoundManager';
import { DEFAULT_MAX_HEALTH, heartbeatIntervalMs, lowHealthSeverity, resolveLowHealth } from './lowHealth';

/**
 * Reasons the presentation is muted while the state itself stays correct. The
 * heartbeat is gameplay feedback; it has no business playing over a cutscene, a
 * pause menu or the death screen, but the player is still hurt underneath.
 */
export interface LowHealthSuppression {
    dead: boolean;
    paused: boolean;
    cinematic: boolean;
    /** No world: main menu, loading, or a world that has been unloaded. */
    inactive: boolean;
}

const NONE: LowHealthSuppression = { dead: false, paused: false, cinematic: false, inactive: true };

class LowHealthState {
    private health = DEFAULT_MAX_HEALTH;
    private maxHealth = DEFAULT_MAX_HEALTH;
    private active = false;
    private suppression: LowHealthSuppression = { ...NONE };
    private timer: number | null = null;
    /** Bumped on every stop, so a beat already in flight cannot fire after it. */
    private generation = 0;
    private onActiveChanged: ((active: boolean) => void) | null = null;

    /** Called when the state flips, so music can add or drop its modifier. */
    public setActiveListener(fn: ((active: boolean) => void) | null): void {
        this.onActiveChanged = fn;
    }

    public isActive(): boolean { return this.active; }
    public getHealth(): number { return this.health; }
    public getMaxHealth(): number { return this.maxHealth; }
    /** 0 at the entry threshold, 1 at 1 HP. Drives the vignette's severity. */
    public getSeverity(): number { return lowHealthSeverity(this.health, this.maxHealth); }

    /** Whether anything is currently muting the presentation. */
    private isSuppressed(): boolean {
        const s = this.suppression;
        return s.dead || s.paused || s.cinematic || s.inactive;
    }

    /**
     * The authoritative health input. Idempotent: the same value twice does not
     * restart the scheduler, so a re-render can never double the heartbeat.
     */
    public setHealth(health: number, maxHealth: number = DEFAULT_MAX_HEALTH): void {
        const changed = this.health !== health || this.maxHealth !== maxHealth;
        this.health = health;
        this.maxHealth = maxHealth;
        if (!changed) return;
        gameEvents.emit('player:health-changed', { health, maxHealth });
        this.evaluate();
    }

    /** Update one or more suppression reasons. */
    public setSuppression(patch: Partial<LowHealthSuppression>): void {
        const next = { ...this.suppression, ...patch };
        const same = (Object.keys(next) as (keyof LowHealthSuppression)[])
            .every((k) => next[k] === this.suppression[k]);
        if (same) return;
        this.suppression = next;
        this.evaluate();
    }

    /** Leaving a world: drop every trace so nothing leaks into the next one. */
    public reset(): void {
        this.stopBeating();
        const wasActive = this.active;
        this.active = false;
        this.health = DEFAULT_MAX_HEALTH;
        this.maxHealth = DEFAULT_MAX_HEALTH;
        this.suppression = { ...NONE };
        if (wasActive) {
            this.onActiveChanged?.(false);
            gameEvents.emit('player:low-health', { active: false, severity: 0 });
        }
    }

    /** Recompute the state, then start or stop the scheduler to match. */
    private evaluate(): void {
        const next = resolveLowHealth(this.active, this.health, this.maxHealth);
        if (next !== this.active) {
            this.active = next;
            // Music first: death should never begin with a leaked +1 semitone.
            this.onActiveChanged?.(next);
            gameEvents.emit('player:low-health', { active: next, severity: this.getSeverity() });
        }
        if (this.active && !this.isSuppressed()) this.startBeating();
        else this.stopBeating();
    }

    /**
     * Start the beat, or let a running one continue. Crucially this does NOT
     * restart on every health change: losing a point mid-cycle updates the NEXT
     * interval rather than retriggering, so damage never machine-guns the cue.
     */
    private startBeating(): void {
        if (this.timer !== null) return;
        // The first beat lands immediately, so entering low health is felt at once.
        this.beat();
    }

    private stopBeating(): void {
        if (this.timer !== null) {
            window.clearTimeout(this.timer);
            this.timer = null;
        }
        // Invalidate any callback already queued: a beat must not fire into a
        // paused game or after death just because its timeout was in flight.
        this.generation += 1;
    }

    private beat(): void {
        if (!this.active || this.isSuppressed()) { this.stopBeating(); return; }

        const severity = this.getSeverity();
        // One event drives both the cue and the pulse, so they cannot drift apart.
        gameEvents.emit('player:heartbeat', { severity, health: this.health });
        // Authored cue: `fallback: false` in the manifest means a missing file is
        // silent rather than a synthesised stand-in.
        soundManager.play('entity.player.heartbeat');

        const generation = this.generation;
        const interval = heartbeatIntervalMs(this.health, this.maxHealth);
        this.timer = window.setTimeout(() => {
            if (generation !== this.generation) return;
            this.timer = null;
            this.beat();
        }, interval);
    }
}

export const lowHealthState = new LowHealthState();
