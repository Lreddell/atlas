// Lightweight "effect" particle system — glowing, additively-blended sparks and
// motes (NOT block-texture debris like worldManager.spawnParticles). A tiny
// pub/sub bridge so non-React singletons (EntityManager, bossSummon) can fire
// effects that the in-Canvas <FxParticles> renderer simulates and draws.

export interface FxBurst {
    x: number;
    y: number;
    z: number;
    count: number;
    /** Primary colour, linear RGB 0..1. */
    color: [number, number, number];
    /** Optional second colour; each particle lerps randomly between the two. */
    color2?: [number, number, number];
    /** Base outward speed (blocks/s). */
    speed: number;
    /** Extra upward velocity added on top of the radial burst. */
    upBias: number;
    /** Direction bias (un-normalised ok); particles fire into this cone. */
    dir?: [number, number, number];
    /** 0 = tight along dir, 1 = full sphere. */
    spread: number;
    /** Particle size in world-ish units. */
    size: number;
    /** Lifetime seconds (randomised ±25%). */
    life: number;
    /** Downward acceleration (blocks/s²). */
    gravity: number;
    /** Per-second velocity damping (0..1 retained-per-second-ish). */
    drag: number;
}

type Listener = (b: FxBurst) => void;

const POSITIVE: [number, number, number] = [1.0, 0.42, 0.32]; // warm red/orange
const NEGATIVE: [number, number, number] = [0.42, 0.72, 1.0]; // cool blue/cyan
const CHARGED: [number, number, number] = [0.78, 0.5, 1.0];   // arc-purple

class ParticleFx {
    private listeners = new Set<Listener>();

    subscribe(fn: Listener): () => void {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    }

    burst(b: Partial<FxBurst> & { x: number; y: number; z: number; color: [number, number, number] }): void {
        const full: FxBurst = {
            count: 16,
            speed: 4,
            upBias: 1.5,
            spread: 1,
            size: 0.22,
            life: 0.8,
            gravity: 6,
            drag: 0.6,
            ...b,
        };
        for (const fn of this.listeners) fn(full);
    }

    /** Colour for a polarity sign (+1 / -1). */
    static polarityColor(p: number): [number, number, number] {
        return p >= 0 ? POSITIVE : NEGATIVE;
    }

    static get CHARGED(): [number, number, number] { return CHARGED; }
    static get POSITIVE(): [number, number, number] { return POSITIVE; }
    static get NEGATIVE(): [number, number, number] { return NEGATIVE; }
}

export const particleFx = new ParticleFx();
export const FX_POSITIVE = POSITIVE;
export const FX_NEGATIVE = NEGATIVE;
export const FX_CHARGED = CHARGED;
export const polarityFxColor = (p: number): [number, number, number] => (p >= 0 ? POSITIVE : NEGATIVE);
