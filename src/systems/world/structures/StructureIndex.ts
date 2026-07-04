export interface StructureBounds {
    minX: number; minY: number; minZ: number;
    maxX: number; maxY: number; maxZ: number;
}

export interface StructureRecord {
    id: string;
    type: string;
    startChunkX: number;
    startChunkZ: number;
    bounds: StructureBounds;
    generatedChunks: string[];
    data?: unknown;
}

export class StructureIndex {
    private records = new Map<string, StructureRecord>();

    upsert(record: StructureRecord): void { this.records.set(record.id, structuredClone(record)); }
    get(id: string): StructureRecord | undefined {
        const value = this.records.get(id);
        return value ? structuredClone(value) : undefined;
    }
    remove(id: string): void { this.records.delete(id); }
    clear(): void { this.records.clear(); }

    intersectingChunk(cx: number, cz: number, chunkSize = 16): StructureRecord[] {
        const minX = cx * chunkSize, maxX = minX + chunkSize - 1;
        const minZ = cz * chunkSize, maxZ = minZ + chunkSize - 1;
        return Array.from(this.records.values())
            .filter((record) => record.bounds.maxX >= minX && record.bounds.minX <= maxX
                && record.bounds.maxZ >= minZ && record.bounds.minZ <= maxZ)
            .map((record) => structuredClone(record));
    }

    nearest(type: string, x: number, z: number): StructureRecord | undefined {
        let best: StructureRecord | undefined;
        let bestDistance = Infinity;
        for (const record of this.records.values()) {
            if (record.type !== type) continue;
            const centerX = (record.bounds.minX + record.bounds.maxX) * 0.5;
            const centerZ = (record.bounds.minZ + record.bounds.maxZ) * 0.5;
            const distance = (centerX - x) ** 2 + (centerZ - z) ** 2;
            if (distance < bestDistance) { bestDistance = distance; best = record; }
        }
        return best ? structuredClone(best) : undefined;
    }

    serialize(): StructureRecord[] { return Array.from(this.records.values()).map((record) => structuredClone(record)); }
    restore(records: readonly StructureRecord[] | undefined): void {
        this.clear();
        for (const record of records ?? []) {
            if (record?.id && record?.type && record?.bounds) this.upsert(record);
        }
    }
}
