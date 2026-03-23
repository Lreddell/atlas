import { DEFAULTS } from './genConfig';

const WORLD_GEN_PRESETS_KEY = 'atlas.worldGen.presets';

export type WorldGenConfigSnapshot = typeof DEFAULTS;

export interface WorldGenPresetEntry {
    id: string;
    name: string;
    config: WorldGenConfigSnapshot;
    createdAt: number;
    updatedAt: number;
}

const cloneConfig = (value: WorldGenConfigSnapshot): WorldGenConfigSnapshot => JSON.parse(JSON.stringify(value));

const sanitizePresetName = (value: string) => {
    const trimmed = String(value || '').trim();
    const safe = trimmed.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ');
    return safe || 'World Preset';
};

const getUniquePresetName = (existingNames: string[], requestedName: string) => {
    const base = sanitizePresetName(requestedName);
    const lower = new Set(existingNames.map((name) => name.toLowerCase()));
    if (!lower.has(base.toLowerCase())) return base;
    let attempt = 2;
    while (attempt < 10000) {
        const candidate = `${base} (${attempt})`;
        if (!lower.has(candidate.toLowerCase())) return candidate;
        attempt += 1;
    }
    return `${base}-${Date.now()}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const normalizeConfigSnapshot = (value: unknown): WorldGenConfigSnapshot | null => {
    if (!isRecord(value)) return null;

    const snapshot = cloneConfig(DEFAULTS);

    if (isRecord(value.noise)) {
        const noiseValue = value.noise;
        const noiseKeys = Object.keys(snapshot.noise) as Array<keyof WorldGenConfigSnapshot['noise']>;
        noiseKeys.forEach((key) => {
            const incomingNoise = noiseValue[key];
            if (!isRecord(incomingNoise)) return;
            const incomingType = incomingNoise.type;
            Object.assign(snapshot.noise[key], incomingNoise);
            if (incomingType === 'simplex') {
                snapshot.noise[key].type = 'opensimplex2';
            }
        });
    }

    if (isRecord(value.terrainShape)) {
        Object.assign(snapshot.terrainShape, value.terrainShape);
    }

    if (isRecord(value.biomes)) {
        const biomeValue = value.biomes;
        const biomeKeys = Object.keys(snapshot.biomes) as Array<keyof WorldGenConfigSnapshot['biomes']>;
        biomeKeys.forEach((key) => {
            const incomingBiome = biomeValue[key];
            if (!isRecord(incomingBiome)) return;
            Object.assign(snapshot.biomes[key], incomingBiome);
        });
    }

    if (isRecord(value.height)) {
        Object.assign(snapshot.height, value.height);
    }

    if (isRecord(value.climateWarp)) {
        Object.assign(snapshot.climateWarp, value.climateWarp);
    }

    if (isRecord(value.spawn)) {
        Object.assign(snapshot.spawn, value.spawn);
    }

    return snapshot;
};

const normalizeEntry = (entry: unknown): WorldGenPresetEntry | null => {
    if (!isRecord(entry)) return null;
    const config = normalizeConfigSnapshot(entry.config);
    if (typeof entry.id !== 'string' || typeof entry.name !== 'string' || !config) return null;
    return {
        id: entry.id,
        name: entry.name,
        config,
        createdAt: Number(entry.createdAt) || Date.now(),
        updatedAt: Number(entry.updatedAt) || Date.now(),
    };
};

const hasDesktopPresetApi = () => !!window?.atlasDesktop?.listWorldPresets;

const readPresetList = (): WorldGenPresetEntry[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(WORLD_GEN_PRESETS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(normalizeEntry)
            .filter((entry): entry is WorldGenPresetEntry => !!entry);
    } catch {
        return [];
    }
};

const writePresetList = (entries: WorldGenPresetEntry[]) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(WORLD_GEN_PRESETS_KEY, JSON.stringify(entries));
};

export const listWorldGenPresets = (): WorldGenPresetEntry[] => {
    return readPresetList().sort((a, b) => b.updatedAt - a.updatedAt);
};

const listWorldGenPresetsDesktop = async (): Promise<WorldGenPresetEntry[]> => {
    const result = await window.atlasDesktop?.listWorldPresets?.();
    const presetsRaw = result?.presets;
    if (!Array.isArray(presetsRaw)) return [];
    return presetsRaw
        .map(normalizeEntry)
        .filter((entry): entry is WorldGenPresetEntry => !!entry)
        .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const listWorldGenPresetsAsync = async (): Promise<WorldGenPresetEntry[]> => {
    if (hasDesktopPresetApi()) {
        try {
            return await listWorldGenPresetsDesktop();
        } catch {
            return [];
        }
    }
    return listWorldGenPresets();
};

export const getWorldGenPresetById = (id: string): WorldGenPresetEntry | null => {
    if (!id) return null;
    const match = readPresetList().find((entry) => entry.id === id);
    return match ?? null;
};

export const getWorldGenPresetByIdAsync = async (id: string): Promise<WorldGenPresetEntry | null> => {
    if (!id) return null;

    if (hasDesktopPresetApi()) {
        const result = await window.atlasDesktop?.readWorldPreset?.(id);
        const preset = normalizeEntry(result?.preset);
        return preset ?? null;
    }

    return getWorldGenPresetById(id);
};

export const saveWorldGenPreset = (name: string, config: WorldGenConfigSnapshot): WorldGenPresetEntry | null => {
    const trimmed = sanitizePresetName(name);
    if (!trimmed) return null;

    const entries = readPresetList();
    const now = Date.now();
    const finalName = getUniquePresetName(entries.map((entry) => entry.name), trimmed);

    const entry: WorldGenPresetEntry = {
        id: crypto.randomUUID(),
        name: finalName,
        config: cloneConfig(config),
        createdAt: now,
        updatedAt: now,
    };
    entries.push(entry);
    writePresetList(entries);
    return entry;
};

export const saveWorldGenPresetAsync = async (name: string, config: WorldGenConfigSnapshot): Promise<WorldGenPresetEntry | null> => {
    if (hasDesktopPresetApi()) {
        const result = await window.atlasDesktop?.saveWorldPreset?.(name, cloneConfig(config));
        const preset = normalizeEntry(result?.preset);
        return preset ?? null;
    }
    return saveWorldGenPreset(name, config);
};

export const deleteWorldGenPreset = (id: string): boolean => {
    if (!id) return false;
    const entries = readPresetList();
    const next = entries.filter((entry) => entry.id !== id);
    if (next.length === entries.length) return false;
    writePresetList(next);
    return true;
};

export const deleteWorldGenPresetAsync = async (id: string): Promise<boolean> => {
    if (!id) return false;
    if (hasDesktopPresetApi()) {
        const result = await window.atlasDesktop?.deleteWorldPreset?.(id);
        return !!result?.ok;
    }
    return deleteWorldGenPreset(id);
};
