import type {
    WorldGenConfigSnapshot,
    WorldGenPresetEntry,
} from './src/systems/world/worldGenPresets';

interface PanoramaSavePayload {
    dataUrl: string;
    cubeFaces: string[];
    suggestedName: string;
}

interface PanoramaSaveResult {
    canceled?: boolean;
    error?: string;
    filePath?: string;
}

interface PanoramaReadResult {
    ok: boolean;
    error?: string;
    dataUrl?: string;
}

interface PanoramaPickResult {
    canceled?: boolean;
    error?: string;
    filePath?: string;
}

interface PanoramaDeleteResult {
    ok: boolean;
    error?: string;
}

interface DefaultPanoramaPathResult {
    filePath: string | null;
}

interface WorldPresetListResult {
    presets?: WorldGenPresetEntry[];
}

interface WorldPresetReadResult {
    preset?: WorldGenPresetEntry;
}

interface WorldPresetSaveResult {
    preset?: WorldGenPresetEntry;
}

interface WorldPresetDeleteResult {
    ok?: boolean;
}

interface MusicFolderScanResult {
    ok: boolean;
    index?: Record<string, string[]>;
}

interface OpenExternalResult {
    ok: boolean;
    error?: string;
}

interface AtlasDesktopApi {
    savePanorama?: (payload: PanoramaSavePayload) => Promise<PanoramaSaveResult>;
    readPanorama?: (filePath: string) => Promise<PanoramaReadResult>;
    pickPanorama?: () => Promise<PanoramaPickResult>;
    deletePanorama?: (filePath: string) => Promise<PanoramaDeleteResult>;
    getDefaultPanoramaPath?: () => Promise<DefaultPanoramaPathResult>;
    listWorldPresets?: () => Promise<WorldPresetListResult>;
    readWorldPreset?: (id: string) => Promise<WorldPresetReadResult>;
    saveWorldPreset?: (name: string, config: WorldGenConfigSnapshot) => Promise<WorldPresetSaveResult>;
    deleteWorldPreset?: (id: string) => Promise<WorldPresetDeleteResult>;
    scanMusicFolders?: () => Promise<MusicFolderScanResult>;
    openExternal?: (url: string) => Promise<OpenExternalResult>;
}

declare global {
    const __APP_VERSION__: string;
    const __APP_DISPLAY_VERSION__: string;

    interface Window {
        atlasDesktop?: AtlasDesktopApi;
        webkitAudioContext?: typeof AudioContext;
    }

    interface Navigator {
        keyboard?: {
            lock?: (keyCodes?: string[]) => Promise<void>;
            unlock?: () => void;
        };
    }
}

export {};
