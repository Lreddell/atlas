import { gameEvents } from '../events/GameEvents';

export interface StatisticsData { values: Record<string, number> }

export class StatisticsStore {
    private values = new Map<string, number>();
    private initialized = false;

    initialize(): void {
        if (this.initialized) return;
        this.initialized = true;
        gameEvents.on('entity:died', ({ type }) => this.increment(`entity.${type}.defeated`));
        gameEvents.on('boss:defeated', ({ bossId }) => this.increment(`boss.${bossId}.defeated`));
        gameEvents.on('region:cleansed', ({ regionId }) => this.increment(`region.${regionId}.cleansed`));
    }
    increment(id: string, amount = 1): void { this.values.set(id, (this.values.get(id) ?? 0) + amount); }
    get(id: string): number { return this.values.get(id) ?? 0; }
    serialize(): StatisticsData { return { values: Object.fromEntries(this.values) }; }
    restore(data: unknown): void {
        const values = data && typeof data === 'object' ? (data as Partial<StatisticsData>).values : undefined;
        this.values = new Map(Object.entries(values ?? {}).filter(([, value]) => Number.isFinite(value)));
    }
}

export const statistics = new StatisticsStore();
statistics.initialize();
