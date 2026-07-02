import { useCallback, useEffect, useState } from 'react';
import { soundManager } from '../../../systems/sound/SoundManager';
import { ExportedWorldData, WorldMetadata, WorldStorage } from '../../../systems/world/WorldStorage';
import { getStorageEstimate, formatBytes } from '../../../systems/world/storage/storagePersistence';
import { getWorldGenPresetByIdAsync, listWorldGenPresetsAsync, type WorldGenPresetEntry } from '../../../systems/world/worldGenPresets';
import type { GameMode } from '../../../types';
import type { UiNoticeState } from '../UiNotice';

const BACKEND_LABELS: Record<string, string> = {
    'desktop-fs': 'Filesystem',
    'opfs': 'Browser filesystem',
    'indexeddb': 'Browser database',
};

const WORLD_GAME_MODES: GameMode[] = ['survival', 'creative', 'spectator'];

interface UseWorldMenuArgs {
    onStart: (worldId: string) => void;
}

export const useWorldMenu = ({ onStart }: UseWorldMenuArgs) => {
    const [worlds, setWorlds] = useState<WorldMetadata[]>([]);
    const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
    const [worldName, setWorldName] = useState('New World');
    const [seed, setSeed] = useState('');
    const [gameMode, setGameMode] = useState<GameMode>('survival');
    const [worldGenPresets, setWorldGenPresets] = useState<WorldGenPresetEntry[]>([]);
    const [selectedWorldGenPresetId, setSelectedWorldGenPresetId] = useState('');
    const [menuNotice, setMenuNotice] = useState<UiNoticeState | null>(null);
    // Id of the world awaiting delete confirmation (drives an in-app modal).
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    // Id of the world awaiting a rename (drives the in-app RenameWorldModal).
    const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
    // A short "Saves: <backend> • <usage>/<quota>" line for the world menu footer.
    const [storageInfo, setStorageInfo] = useState<string>('');

    const loadWorlds = useCallback(async () => {
        const list = await WorldStorage.getAllWorlds();
        list.sort((a, b) => b.lastPlayed - a.lastPlayed);
        setWorlds(list);
    }, []);

    const refreshStorageInfo = useCallback(async () => {
        try {
            const kind = await WorldStorage.getBackendKind();
            const estimate = await getStorageEstimate();
            const label = BACKEND_LABELS[kind] ?? kind;
            setStorageInfo(estimate ? `Saves: ${label} • ${formatBytes(estimate.usage)} used` : `Saves: ${label}`);
        } catch {
            setStorageInfo('');
        }
    }, []);

    const refreshWorldGenPresets = useCallback(async () => {
        try {
            const presets = await listWorldGenPresetsAsync();
            setWorldGenPresets(presets);
            setSelectedWorldGenPresetId((prev) => {
                if (prev && presets.some((preset) => preset.id === prev)) return prev;
                return '';
            });
        } catch (error) {
            console.error('[MainMenu] Failed to load world presets:', error);
            setMenuNotice({ type: 'error', message: 'Failed to load World Editor presets.' });
        }
    }, []);

    useEffect(() => {
        void loadWorlds().catch((error) => {
            console.error('[MainMenu] Failed to load worlds:', error);
            setMenuNotice({ type: 'error', message: 'Failed to load saved worlds.' });
        });
        void refreshWorldGenPresets();
        void refreshStorageInfo();
    }, [loadWorlds, refreshWorldGenPresets, refreshStorageInfo]);

    const cycleGameMode = useCallback(() => {
        setGameMode((current) => WORLD_GAME_MODES[(WORLD_GAME_MODES.indexOf(current) + 1) % WORLD_GAME_MODES.length]);
    }, []);

    const handleCreateWorld = useCallback(async () => {
        setMenuNotice(null);
        try {
            const selectedPreset = selectedWorldGenPresetId ? await getWorldGenPresetByIdAsync(selectedWorldGenPresetId) : null;
            const meta = await WorldStorage.createWorld(
                worldName,
                seed,
                gameMode,
                selectedPreset?.config,
                selectedPreset?.id ?? null,
                selectedPreset?.name ?? null,
            );
            onStart(meta.id);
        } catch (error) {
            console.error('[MainMenu] Failed to create world:', error);
            setMenuNotice({ type: 'error', message: 'Failed to create the world.' });
        }
    }, [gameMode, onStart, seed, selectedWorldGenPresetId, worldName]);

    const handlePlayWorld = useCallback(async (worldId?: string | null) => {
        const nextWorldId = worldId ?? selectedWorldId;
        if (nextWorldId) {
            onStart(nextWorldId);
        }
    }, [onStart, selectedWorldId]);

    // Opens the confirmation modal (the actual deletion runs in confirmDeleteWorld).
    const handleDeleteWorld = useCallback(() => {
        if (!selectedWorldId) return;
        setPendingDeleteId(selectedWorldId);
    }, [selectedWorldId]);

    const cancelDeleteWorld = useCallback(() => setPendingDeleteId(null), []);

    const confirmDeleteWorld = useCallback(async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        if (!id) return;
        try {
            await WorldStorage.deleteWorld(id);
            setSelectedWorldId((current) => (current === id ? null : current));
            await loadWorlds();
            soundManager.play('ui.click', { pitch: 0.6 });
        } catch (error) {
            console.error('[MainMenu] Failed to delete world:', error);
            setMenuNotice({ type: 'error', message: 'Failed to delete the world.' });
        }
    }, [loadWorlds, pendingDeleteId]);

    // --- Rename (in-app modal; renames the display name, keeps the save folder) ---
    const handleRenameWorld = useCallback(() => {
        if (selectedWorldId) setRenameTargetId(selectedWorldId);
    }, [selectedWorldId]);

    const cancelRenameWorld = useCallback(() => setRenameTargetId(null), []);

    const confirmRenameWorld = useCallback(async (name: string) => {
        const id = renameTargetId;
        setRenameTargetId(null);
        if (!id || !name.trim()) return;
        try {
            await WorldStorage.renameWorld(id, name.trim());
            await loadWorlds();
            soundManager.play('ui.click', { pitch: 1.05 });
        } catch (error) {
            console.error('[MainMenu] Failed to rename world:', error);
            setMenuNotice({ type: 'error', message: 'Failed to rename the world.' });
        }
    }, [loadWorlds, renameTargetId]);

    // --- Open the world's save folder in the OS file explorer (desktop only) ---
    const canOpenSaveFolder = typeof window !== 'undefined' && !!window.atlasDesktop?.saves?.openFolder;
    const handleOpenSaveFolder = useCallback(async () => {
        if (!selectedWorldId) return;
        try {
            await window.atlasDesktop?.saves?.openFolder?.(selectedWorldId);
            soundManager.play('ui.click');
        } catch (error) {
            console.error('[MainMenu] Failed to open save folder:', error);
            setMenuNotice({ type: 'error', message: 'Failed to open the world save folder.' });
        }
    }, [selectedWorldId]);

    const handleExportWorld = useCallback(async () => {
        if (!selectedWorldId) return;

        try {
            const world = worlds.find((entry) => entry.id === selectedWorldId);
            const exported = await WorldStorage.exportWorld(selectedWorldId);
            const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const safeName = (world?.name || 'world').replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'world';
            const anchor = document.createElement('a');

            anchor.href = url;
            anchor.download = `${safeName}.atlasworld.json`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);

            soundManager.play('ui.click', { pitch: 1.1 });
            setMenuNotice({ type: 'success', message: 'World export downloaded.' });
        } catch (error) {
            console.error('[MainMenu] Failed to export world:', error);
            setMenuNotice({ type: 'error', message: 'Failed to export the world.' });
        }
    }, [selectedWorldId, worlds]);

    const handleImportWorld = useCallback(async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.atlasworld.json,.json,application/json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const parsed = JSON.parse(text) as ExportedWorldData;
                const imported = await WorldStorage.importWorld(parsed);
                await loadWorlds();
                setSelectedWorldId(imported.id);
                soundManager.play('ui.click', { pitch: 1.15 });
                setMenuNotice({ type: 'success', message: `Imported world: ${imported.name}` });
            } catch (error) {
                console.error('[MainMenu] Failed to import world:', error);
                setMenuNotice({ type: 'error', message: 'Failed to import the world. Select a valid Atlas export.' });
            }
        };
        input.click();
    }, [loadWorlds]);

    return {
        worlds,
        selectedWorldId,
        setSelectedWorldId,
        worldName,
        setWorldName,
        seed,
        setSeed,
        gameMode,
        cycleGameMode,
        worldGenPresets,
        selectedWorldGenPresetId,
        setSelectedWorldGenPresetId,
        refreshWorldGenPresets,
        handleCreateWorld,
        handlePlayWorld,
        handleDeleteWorld,
        handleExportWorld,
        handleImportWorld,
        pendingDeleteId,
        pendingDeleteName: worlds.find((w) => w.id === pendingDeleteId)?.name ?? null,
        confirmDeleteWorld,
        cancelDeleteWorld,
        // rename + save-management
        handleRenameWorld,
        renameTargetId,
        renameTargetName: worlds.find((w) => w.id === renameTargetId)?.name ?? '',
        confirmRenameWorld,
        cancelRenameWorld,
        handleOpenSaveFolder,
        canOpenSaveFolder,
        storageInfo,
        menuNotice,
        dismissMenuNotice: () => setMenuNotice(null),
    };
};
