import { DeterministicRng, hashSimulationSeed } from './simulation/DeterministicRng';

export type WeatherType = 'clear' | 'rain' | 'thunder' | 'snow';

export interface WeatherState {
    type: WeatherType;
    intensity: number;
    remainingTicks: number;
    lightningFlash: number;
}

const DEFAULT_STATE: WeatherState = { type: 'clear', intensity: 0, remainingTicks: 9000, lightningFlash: 0 };

export class WeatherSystem {
    private state: WeatherState = { ...DEFAULT_STATE };

    tick(seed: number, simulationTime: number, cycleEnabled: boolean): void {
        this.state.lightningFlash = Math.max(0, this.state.lightningFlash - 0.08);
        if (!cycleEnabled) return;
        this.state.remainingTicks--;
        if (this.state.type === 'thunder') {
            const rng = new DeterministicRng(hashSimulationSeed(seed, simulationTime, 'lightning'));
            if (rng.nextInt(1800) === 0) this.state.lightningFlash = 1;
        }
        if (this.state.remainingTicks > 0) return;
        const rng = new DeterministicRng(hashSimulationSeed(seed, simulationTime, 'weather_transition'));
        if (this.state.type !== 'clear') {
            this.set('clear', 6000 + rng.nextInt(12000));
            return;
        }
        const roll = rng.nextFloat();
        const type: WeatherType = roll < 0.12 ? 'thunder' : roll < 0.32 ? 'snow' : 'rain';
        this.set(type, 6000 + rng.nextInt(12000), 0.55 + rng.nextFloat() * 0.45);
    }

    set(type: WeatherType, duration = 12000, intensity = type === 'clear' ? 0 : 0.8): void {
        this.state = {
            type,
            intensity: Math.max(0, Math.min(1, intensity)),
            remainingTicks: Math.max(1, Math.floor(duration)),
            lightningFlash: 0,
        };
    }

    get(): Readonly<WeatherState> { return this.state; }
    serialize(): WeatherState { return { ...this.state }; }
    restore(value: unknown): void {
        if (!value || typeof value !== 'object') { this.state = { ...DEFAULT_STATE }; return; }
        const input = value as Partial<WeatherState>;
        const type = ['clear', 'rain', 'thunder', 'snow'].includes(String(input.type)) ? input.type as WeatherType : 'clear';
        this.set(type, Number(input.remainingTicks) || 9000, Number(input.intensity) || 0);
        this.state.lightningFlash = Math.max(0, Math.min(1, Number(input.lightningFlash) || 0));
    }
}

export const weatherSystem = new WeatherSystem();
