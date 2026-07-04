export interface SavedDataEnvelope {
    version: number;
    data: unknown;
}

export type SavedDataMap = Record<string, SavedDataEnvelope>;

export interface SavedDataModule<T> {
    id: string;
    version: number;
    save(): T;
    load(data: unknown, version: number): void;
    reset(): void;
}

/**
 * Namespaced world-wide saved modules. Unknown modules are retained byte-for-byte
 * through load/save so opening a world without a pack cannot destroy its data.
 */
export class SavedDataRegistry {
    private modules = new Map<string, SavedDataModule<unknown>>();
    private unknown: SavedDataMap = {};

    register<T>(module: SavedDataModule<T>): () => void {
        if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(module.id)) {
            throw new Error(`Saved-data id must be namespaced: ${module.id}`);
        }
        if (this.modules.has(module.id)) throw new Error(`Duplicate saved-data module: ${module.id}`);
        this.modules.set(module.id, module as SavedDataModule<unknown>);
        const retained = this.unknown[module.id];
        if (retained) {
            module.load(retained.data, retained.version);
            delete this.unknown[module.id];
        }
        return () => this.modules.delete(module.id);
    }

    load(saved: SavedDataMap | undefined): void {
        for (const module of this.modules.values()) module.reset();
        this.unknown = {};
        for (const [id, envelope] of Object.entries(saved ?? {})) {
            const module = this.modules.get(id);
            if (module) module.load(envelope.data, envelope.version);
            else this.unknown[id] = structuredClone(envelope);
        }
    }

    save(): SavedDataMap {
        const out: SavedDataMap = structuredClone(this.unknown);
        for (const module of this.modules.values()) {
            out[module.id] = { version: module.version, data: module.save() };
        }
        return out;
    }

    reset(): void {
        this.unknown = {};
        for (const module of this.modules.values()) module.reset();
    }
}
