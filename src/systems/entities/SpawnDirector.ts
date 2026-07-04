export interface SpawnCategory {
    id: string;
    cap: number;
    minPlayerDistance: number;
    maxPlayerDistance: number;
}

export class SpawnDirector {
    private counts = new Map<string, number>();
    setCount(category: string, count: number): void { this.counts.set(category, Math.max(0, count | 0)); }
    canSpawn(category: SpawnCategory, distance: number): boolean {
        return (this.counts.get(category.id) ?? 0) < category.cap
            && distance >= category.minPlayerDistance && distance <= category.maxPlayerDistance;
    }
}
