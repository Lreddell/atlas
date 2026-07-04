export interface WorldRuleValues {
    keepInventory: boolean;
    daylightCycle: boolean;
    weatherCycle: boolean;
    mobSpawning: boolean;
    fireSpread: boolean;
    blockDrops: boolean;
    naturalRegeneration: boolean;
    randomTickSpeed: number;
}

export const DEFAULT_WORLD_RULES: Readonly<WorldRuleValues> = Object.freeze({
    keepInventory: false,
    daylightCycle: true,
    weatherCycle: true,
    mobSpawning: true,
    fireSpread: true,
    blockDrops: true,
    naturalRegeneration: true,
    randomTickSpeed: 3,
});

export class WorldRules {
    private values: WorldRuleValues = { ...DEFAULT_WORLD_RULES };

    get<K extends keyof WorldRuleValues>(key: K): WorldRuleValues[K] { return this.values[key]; }

    set<K extends keyof WorldRuleValues>(key: K, value: WorldRuleValues[K]): void {
        if (key === 'randomTickSpeed') {
            this.values.randomTickSpeed = Math.max(0, Math.min(4096, Math.floor(Number(value) || 0)));
            return;
        }
        this.values[key] = value;
    }

    serialize(): WorldRuleValues { return { ...this.values }; }

    restore(value: unknown): void {
        this.values = { ...DEFAULT_WORLD_RULES };
        if (!value || typeof value !== 'object') return;
        const input = value as Partial<WorldRuleValues>;
        for (const key of Object.keys(DEFAULT_WORLD_RULES) as (keyof WorldRuleValues)[]) {
            const candidate = input[key];
            if (candidate !== undefined && typeof candidate === typeof DEFAULT_WORLD_RULES[key]) {
                this.set(key, candidate as never);
            }
        }
    }
}

export const worldRules = new WorldRules();
