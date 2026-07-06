import { normalizeGenConfigSnapshot, type WorldGenConfigSnapshot } from './genConfig';

export type { WorldGenConfigSnapshot } from './genConfig';

const WORLD_GEN_PRESETS_KEY = 'atlas.worldGen.presets';

export interface WorldGenPresetEntry {
    id: string;
    name: string;
    config: WorldGenConfigSnapshot;
    createdAt: number;
    updatedAt: number;
}

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

const normalizeEntry = (entry: unknown): WorldGenPresetEntry | null => {
    if (!isRecord(entry)) return null;
    const config = normalizeGenConfigSnapshot(entry.config);
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
    const normalizedConfig = normalizeGenConfigSnapshot(config);
    if (!normalizedConfig) return null;

    const entries = readPresetList();
    const now = Date.now();
    const finalName = getUniquePresetName(entries.map((entry) => entry.name), trimmed);

    const entry: WorldGenPresetEntry = {
        id: crypto.randomUUID(),
        name: finalName,
        config: normalizedConfig,
        createdAt: now,
        updatedAt: now,
    };
    entries.push(entry);
    writePresetList(entries);
    return entry;
};

export const saveWorldGenPresetAsync = async (name: string, config: WorldGenConfigSnapshot): Promise<WorldGenPresetEntry | null> => {
    const normalizedConfig = normalizeGenConfigSnapshot(config);
    if (!normalizedConfig) return null;
    if (hasDesktopPresetApi()) {
        const result = await window.atlasDesktop?.saveWorldPreset?.(name, normalizedConfig);
        const preset = normalizeEntry(result?.preset);
        return preset ?? null;
    }
    return saveWorldGenPreset(name, normalizedConfig);
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
