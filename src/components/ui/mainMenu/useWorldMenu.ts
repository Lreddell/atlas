import { useCallback, useEffect, useState } from 'react';
import { soundManager } from '../../../systems/sound/SoundManager';
import { ExportedWorldData, WorldMetadata, WorldStorage } from '../../../systems/world/WorldStorage';
import { getWorldGenPresetByIdAsync, listWorldGenPresetsAsync, type WorldGenPresetEntry } from '../../../systems/world/worldGenPresets';
import type { GameMode } from '../../../types';

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

    const loadWorlds = useCallback(async () => {
        const list = await WorldStorage.getAllWorlds();
        list.sort((a, b) => b.lastPlayed - a.lastPlayed);
        setWorlds(list);
    }, []);

    const refreshWorldGenPresets = useCallback(async () => {
        const presets = await listWorldGenPresetsAsync();
        setWorldGenPresets(presets);
        setSelectedWorldGenPresetId((prev) => {
            if (prev && presets.some((preset) => preset.id === prev)) return prev;
            return '';
        });
    }, []);

    useEffect(() => {
        void loadWorlds();
        void refreshWorldGenPresets();
    }, [loadWorlds, refreshWorldGenPresets]);

    const cycleGameMode = useCallback(() => {
        setGameMode((current) => WORLD_GAME_MODES[(WORLD_GAME_MODES.indexOf(current) + 1) % WORLD_GAME_MODES.length]);
    }, []);

    const handleCreateWorld = useCallback(async () => {
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
    }, [gameMode, onStart, seed, selectedWorldGenPresetId, worldName]);

    const handlePlayWorld = useCallback(async (worldId?: string | null) => {
        const nextWorldId = worldId ?? selectedWorldId;
        if (nextWorldId) {
            onStart(nextWorldId);
        }
    }, [onStart, selectedWorldId]);

    const handleDeleteWorld = useCallback(async () => {
        if (!selectedWorldId || !window.confirm('Are you sure you want to delete this world? It will be lost forever! (A long time!)')) {
            return;
        }

        try {
            await WorldStorage.deleteWorld(selectedWorldId);
            setSelectedWorldId(null);
            await loadWorlds();
            soundManager.play('ui.click', { pitch: 0.6 });
        } catch (error) {
            alert('Failed to delete world. See console for details.');
            console.error(error);
        }
    }, [loadWorlds, selectedWorldId]);

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
        } catch (error) {
            console.error(error);
            alert('Failed to export world. See console for details.');
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
            } catch (error) {
                console.error(error);
                alert('Failed to import world file. Ensure it is a valid Atlas export.');
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
    };
};
