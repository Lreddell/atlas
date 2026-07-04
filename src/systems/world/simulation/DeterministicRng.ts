/** Small deterministic PRNG for simulation domains. Never use wall-clock time. */
export class DeterministicRng {
    private state: number;

    constructor(seed: number) {
        this.state = (seed >>> 0) || 0x6d2b79f5;
    }

    nextUint(): number {
        let x = this.state;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.state = x >>> 0;
        return this.state;
    }

    nextFloat(): number {
        return this.nextUint() / 0x100000000;
    }

    nextInt(bound: number): number {
        if (!Number.isInteger(bound) || bound <= 0) throw new Error('bound must be a positive integer');
        return Math.floor(this.nextFloat() * bound);
    }
}

export function hashSimulationSeed(seed: number, tick: number, domain: string): number {
    let hash = (seed ^ Math.imul(tick | 0, 0x9e3779b1)) >>> 0;
    for (let i = 0; i < domain.length; i++) {
        hash ^= domain.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash || 1;
}
