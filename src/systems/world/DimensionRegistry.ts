export interface DimensionDefinition {
    id: string;
    minY: number;
    maxY: number;
    seaLevel: number;
    dayLength: number;
    naturalLight: number;
    generatorId: string;
}

class DimensionRegistry {
    private definitions = new Map<string, DimensionDefinition>();
    register(definition: DimensionDefinition): void { this.definitions.set(definition.id, { ...definition }); }
    get(id: string): DimensionDefinition | undefined {
        const value = this.definitions.get(id);
        return value ? { ...value } : undefined;
    }
    list(): DimensionDefinition[] { return Array.from(this.definitions.values()).map((value) => ({ ...value })); }
}

export const dimensions = new DimensionRegistry();
dimensions.register({ id: 'atlas:overworld', minY: -64, maxY: 319, seaLevel: 62, dayLength: 24000, naturalLight: 1, generatorId: 'atlas:overworld' });
