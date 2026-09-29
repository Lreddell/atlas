import React from 'react';
import { APP_DISPLAY_VERSION } from '../../../constants';
import { getBuiltInMenuPanorama } from '../../../data/menuPanoramas';
import type { WorldMetadata } from '../../../systems/world/WorldStorage';
import type { WorldGenPresetEntry } from '../../../systems/world/worldGenPresets';
import type { GameMode } from '../../../types';
import { MenuButton, MenuSlider } from './MainMenuControls';
import type { FormattedSplashSegment } from './useSplashAnimation';
import { AtlasWordmark, StarGlyph } from '../kit/PixelArt';

export type MainMenuView = 'main' | 'create' | 'select' | 'settings';
export type PanoramaSubmenu = 'manager' | 'settings';

const GAME_MODE_NAMES: Record<GameMode, string> = {
    survival: 'Survival',
    creative: 'Creative',
    spectator: 'Spectator',
};

interface CreateWorldPanelProps {
    worldName: string;
    onWorldNameChange: (value: string) => void;
    seed: string;
    onSeedChange: (value: string) => void;
    gameMode: GameMode;
    onCycleGameMode: () => void;
    allowCommands: boolean;
    onToggleAllowCommands: () => void;
    worldGenPresets: WorldGenPresetEntry[];
    selectedWorldGenPresetId: string;
    onSelectedWorldGenPresetIdChange: (value: string) => void;
    onCancel: () => void;
    onCreateWorld: () => void;
}

export const CreateWorldPanel: React.FC<CreateWorldPanelProps> = ({
    worldName,
    onWorldNameChange,
    seed,
    onSeedChange,
    gameMode,
    onCycleGameMode,
    allowCommands,
    onToggleAllowCommands,
    worldGenPresets,
    selectedWorldGenPresetId,
    onSelectedWorldGenPresetIdChange,
    onCancel,
    onCreateWorld,
}) => {
    // World type cycles like the other options: Default Terrain, then each saved preset.
    const presetIds = ['', ...worldGenPresets.map((preset) => preset.id)];
    const presetName = worldGenPresets.find((preset) => preset.id === selectedWorldGenPresetId)?.name ?? 'Default Terrain';
    const cyclePreset = () => {
        const next = presetIds[(presetIds.indexOf(selectedWorldGenPresetId) + 1) % presetIds.length];
        onSelectedWorldGenPresetIdChange(next ?? '');
    };

    return (
        <div className="atlas-panel relative z-10 flex w-[560px] max-w-[calc(100vw-2rem)] flex-col gap-3 px-8 pb-7 pt-5">
            <h1 className="atlas-title mb-1 text-center">Create New World</h1>

            <label className="flex flex-col gap-1">
                <span className="atlas-label">World Name</span>
                <input
                    autoFocus
                    type="text"
                    value={worldName}
                    onChange={(event) => onWorldNameChange(event.target.value)}
                    className="atlas-input"
                />
            </label>

            <label className="flex flex-col gap-1">
                <span className="atlas-label">World Seed (Leave blank for random)</span>
                <input
                    type="text"
                    value={seed}
                    onChange={(event) => onSeedChange(event.target.value)}
                    placeholder="e.g. atlas"
                    className="atlas-input"
                />
            </label>

            <div className="mt-2 flex flex-col gap-1">
                <MenuButton label={`Game Mode: ${GAME_MODE_NAMES[gameMode]}`} onClick={onCycleGameMode} width="w-full" />
                <p className="atlas-hint px-1">
                    {gameMode === 'survival' && 'Search for resources, craft, gain levels, health and hunger.'}
                    {gameMode === 'creative' && 'Unlimited resources, free flying and destroy blocks instantly.'}
                    {gameMode === 'spectator' && "You can look but don't touch."}
                </p>
            </div>

            <div className="flex flex-col gap-1">
                <MenuButton label={`Allow Commands: ${allowCommands ? 'ON' : 'OFF'}`} onClick={onToggleAllowCommands} width="w-full" />
                <p className="atlas-hint px-1">
                    {allowCommands
                        ? 'Commands like /gamemode, /giveitem and /tp work in this world.'
                        : 'No cheat commands. You can change this later in World Options.'}
                </p>
            </div>

            <div className="flex flex-col gap-1">
                <MenuButton
                    label={`World Edit Preset: ${presetName}`}
                    onClick={cyclePreset}
                    disabled={worldGenPresets.length === 0}
                    tooltip={worldGenPresets.length === 0 ? 'Save a preset in the World Editor first' : undefined}
                    width="w-full"
                />
                <p className="atlas-hint px-1">Presets are saved from the World Editor.</p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
                <MenuButton label="Cancel" onClick={onCancel} width="w-full" />
                <MenuButton label="Create World" onClick={onCreateWorld} variant="primary" width="w-full" />
            </div>
        </div>
    );
};

interface WorldSelectPanelProps {
    worlds: WorldMetadata[];
    selectedWorldId: string | null;
    onSelectWorld: (worldId: string) => void;
    onDoubleClickWorld: (worldId: string) => void;
    onPlaySelected: () => void;
    onCreateNewWorld: () => void;
    onDeleteWorld: () => void;
    onCancel: () => void;
    onExportWorld: () => void;
    onImportWorld: () => void;
    onRenameWorld: () => void;
    onOpenSaveFolder: () => void;
    canOpenSaveFolder: boolean;
    storageInfo?: string;
}

const formatPlayed = (time: number) => {
    const date = new Date(time);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

export const WorldSelectPanel: React.FC<WorldSelectPanelProps> = ({
    worlds,
    selectedWorldId,
    onSelectWorld,
    onDoubleClickWorld,
    onPlaySelected,
    onCreateNewWorld,
    onDeleteWorld,
    onCancel,
    onExportWorld,
    onImportWorld,
    onRenameWorld,
    onOpenSaveFolder,
    canOpenSaveFolder,
    storageInfo,
}) => (
    <div className="atlas-panel relative z-10 my-6 flex h-[calc(100%-3rem)] max-h-[760px] w-[640px] max-w-[calc(100vw-2rem)] flex-col px-6 pb-6 pt-5">
        <h1 className="atlas-title mb-4 text-center">Select World</h1>
        <div className="atlas-well mb-5 min-h-[120px] w-full flex-1 overflow-y-auto p-2 scrollbar-thin" role="listbox" aria-label="Saved worlds">
            {worlds.length === 0 && (
                <div className="mt-16 text-center text-px-2 text-parchment-400">No worlds found. Create one!</div>
            )}
            {worlds.map((world) => {
                const selected = selectedWorldId === world.id;
                return (
                    <div
                        key={world.id}
                        role="option"
                        aria-selected={selected}
                        onClick={() => onSelectWorld(world.id)}
                        onDoubleClick={() => onDoubleClickWorld(world.id)}
                        className="atlas-row mb-1 flex cursor-pointer items-center gap-3 px-3 py-2"
                    >
                        <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-3">
                                <span className="truncate text-px-2 text-parchment-50 text-shadow-md">{world.name}</span>
                                {world.worldGenPresetName && (
                                    <span className="shrink-0 border-2 border-ink-500 px-1 text-px-1 text-parchment-300">{world.worldGenPresetName}</span>
                                )}
                            </div>
                            <div className="truncate text-read text-parchment-400">
                                {GAME_MODE_NAMES[world.gameMode] ?? world.gameMode} {'•'} Seed {world.seed.trim() || world.seedNum} {'•'} {formatPlayed(world.lastPlayed)}
                            </div>
                        </div>
                        {selected && <StarGlyph scale={2} className="shrink-0" />}
                    </div>
                );
            })}
        </div>

        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <MenuButton label="Play Selected World" onClick={onPlaySelected} disabled={!selectedWorldId} variant="primary" width="w-full" />
            <MenuButton label="Create New World" onClick={onCreateNewWorld} width="w-full" />
            <MenuButton label="Rename" onClick={onRenameWorld} disabled={!selectedWorldId} width="w-full" />
            <MenuButton label="Delete" onClick={onDeleteWorld} disabled={!selectedWorldId} variant="danger" width="w-full" />
            <MenuButton label="Export" onClick={onExportWorld} disabled={!selectedWorldId} width="w-full" />
            <MenuButton label="Import World" onClick={onImportWorld} width="w-full" />
            <MenuButton
                label="Open Save Folder"
                onClick={onOpenSaveFolder}
                disabled={!selectedWorldId || !canOpenSaveFolder}
                tooltip={!canOpenSaveFolder ? 'Desktop build only' : undefined}
                width="w-full"
            />
            <MenuButton label="Cancel" onClick={onCancel} width="w-full" />
        </div>
        {storageInfo && (
            <div className="mt-3 text-center text-read text-parchment-400">{storageInfo}</div>
        )}
    </div>
);

interface PanoramaPanelProps {
    panoramaSubmenu: PanoramaSubmenu;
    onPanoramaSubmenuChange: (submenu: PanoramaSubmenu) => void;
    panoramaCaptureHotkey: string;
    panoramaEntries: string[];
    activePanoramaPath: string | null;
    defaultPanoramaId: string;
    onUsePanorama: (filePath: string) => void;
    onImportPanorama: () => void;
    canImportPanorama: boolean;
    onDeletePanoramaFromDisk: (filePath: string) => void;
    canDeletePanoramaFromDisk: boolean;
    usingPanorama: boolean;
    hasPanoramaBackground: boolean;
    backgroundMode: 'dirt' | 'panorama';
    onToggleBackground: () => void;
    panoramaBlur: number;
    panoramaGradient: number;
    setPanoramaBlur: (value: number) => void;
    setPanoramaGradient: (value: number) => void;
    panoramaRotationSpeed: number;
    setPanoramaRotationSpeed: (value: number) => void;
    onBack: () => void;
}

const getPanoramaLabel = (filePath: string) => {
    const builtIn = getBuiltInMenuPanorama(filePath);
    if (builtIn) return builtIn.name;
    if (filePath.startsWith('web:')) return filePath.slice(4) || 'Browser Panorama';
    const normalized = filePath.replace(/\\/g, '/');
    const chunks = normalized.split('/');
    return chunks[chunks.length - 1] || filePath;
};

export const PanoramaPanel: React.FC<PanoramaPanelProps> = ({
    panoramaSubmenu,
    onPanoramaSubmenuChange,
    panoramaCaptureHotkey,
    panoramaEntries,
    activePanoramaPath,
    defaultPanoramaId,
    onUsePanorama,
    onImportPanorama,
    canImportPanorama,
    onDeletePanoramaFromDisk,
    canDeletePanoramaFromDisk,
    usingPanorama,
    hasPanoramaBackground,
    backgroundMode,
    onToggleBackground,
    panoramaBlur,
    panoramaGradient,
    setPanoramaBlur,
    setPanoramaGradient,
    panoramaRotationSpeed,
    setPanoramaRotationSpeed,
    onBack,
}) => (
    <div className={`atlas-panel relative z-10 my-6 flex w-[780px] max-w-[calc(100vw-2rem)] flex-col items-center px-6 pb-6 pt-5 ${panoramaSubmenu === 'manager' ? 'h-[calc(100%-3rem)] max-h-[720px]' : ''}`}>
        <h1 className="atlas-title mb-4 text-center">Panorama Settings</h1>

        <div key={panoramaSubmenu} className="flex min-h-0 w-full flex-1 flex-col items-center atlas-fade-in">
        {panoramaSubmenu === 'manager' && (
            <>
                <p className="atlas-hint mb-3 w-full px-1">
                    Capture from in-game using {panoramaCaptureHotkey}, import an existing panorama PNG, and open Settings for panorama tuning.
                </p>

                <div className="atlas-well mb-5 min-h-[120px] w-full flex-1 overflow-y-auto p-2 scrollbar-thin">
                    {panoramaEntries.length === 0 && (
                        <div className="mt-16 text-center text-px-2 text-parchment-400">No panoramas saved yet.</div>
                    )}

                    {panoramaEntries.map((filePath) => {
                        const isActive = activePanoramaPath === filePath;
                        const isDefault = filePath === defaultPanoramaId;
                        const builtIn = getBuiltInMenuPanorama(filePath);
                        return (
                            <div
                                key={filePath}
                                data-active={isActive}
                                className="atlas-row mb-1 flex items-center justify-between gap-3 px-3 py-2"
                            >
                                <div className="min-w-0">
                                    <div className="truncate text-px-2 text-parchment-50 text-shadow-md">{getPanoramaLabel(filePath)}{isDefault ? ' (Default)' : ''}</div>
                                    <div className="truncate text-read text-parchment-400">
                                        {builtIn ? builtIn.description : filePath.startsWith('web:') ? 'Stored in browser local storage' : filePath}
                                    </div>
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    <MenuButton
                                        label={isActive ? 'Using' : 'Use'}
                                        onClick={() => onUsePanorama(filePath)}
                                        disabled={isActive}
                                        width="w-[104px]"
                                        small
                                        variant="primary"
                                    />
                                    {!builtIn && (
                                        <MenuButton
                                            label="Delete"
                                            onClick={() => onDeletePanoramaFromDisk(filePath)}
                                            disabled={!canDeletePanoramaFromDisk}
                                            tooltip={!canDeletePanoramaFromDisk ? 'Desktop build only' : undefined}
                                            width="w-[104px]"
                                            small
                                            variant="danger"
                                        />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="grid w-full grid-cols-3 gap-3">
                    <MenuButton
                        label="Import Panorama"
                        onClick={onImportPanorama}
                        disabled={!canImportPanorama}
                        tooltip={!canImportPanorama ? 'Desktop build only' : undefined}
                        width="w-full"
                    />
                    <MenuButton label="Settings" onClick={() => onPanoramaSubmenuChange('settings')} width="w-full" />
                    <MenuButton label="Back" onClick={onBack} width="w-full" />
                </div>
            </>
        )}

        {panoramaSubmenu === 'settings' && (
            <>
                <p className="atlas-hint mb-4 w-full px-1 text-center">
                    Panorama appearance settings apply to menu and loading backgrounds.
                </p>

                <div className="mb-3 flex w-full justify-center">
                    <MenuButton
                        label={`Background: ${usingPanorama ? 'Panorama' : 'Dirt'}`}
                        onClick={onToggleBackground}
                        disabled={!hasPanoramaBackground && backgroundMode === 'dirt'}
                        tooltip={!hasPanoramaBackground && backgroundMode === 'dirt' ? `Capture panorama in-game (${panoramaCaptureHotkey})` : undefined}
                        width="w-[460px]"
                    />
                </div>

                <div className="mb-6 grid w-full grid-cols-1 justify-items-center gap-3">
                    <MenuSlider
                        label="Menu Panorama Blur"
                        value={panoramaBlur}
                        min={0}
                        max={12}
                        step={0.5}
                        onChange={setPanoramaBlur}
                        width="w-[460px]"
                        formatValue={(value) => `${value.toFixed(1)} px`}
                    />
                    <MenuSlider
                        label="Menu Gradient"
                        value={panoramaGradient}
                        min={0}
                        max={0.9}
                        step={0.05}
                        onChange={setPanoramaGradient}
                        width="w-[460px]"
                        formatValue={(value) => `${Math.round(value * 100)}%`}
                    />
                    <MenuSlider
                        label="Rotation Speed"
                        value={panoramaRotationSpeed}
                        min={0}
                        max={4}
                        step={0.1}
                        onChange={setPanoramaRotationSpeed}
                        width="w-[460px]"
                        formatValue={(value) => (value <= 0 ? 'Rotation Off' : `${value.toFixed(1)}x`)}
                    />
                </div>

                <MenuButton label="Back to Panorama" onClick={() => onPanoramaSubmenuChange('manager')} width="w-[460px]" />
            </>
        )}
        </div>
    </div>
);

interface MainLandingPanelProps {
    formattedSplash: FormattedSplashSegment[];
    splashFontSize: number;
    isBrowserMode: boolean;
    onSingleplayer: () => void;
    onWorldEditor: () => void;
    onOptions: () => void;
    onTutorial: () => void;
    onQuit?: () => void;
    onBuildCreditClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
    onShowWhatsNew: () => void;
}

export const MainLandingPanel: React.FC<MainLandingPanelProps> = ({
    formattedSplash,
    splashFontSize,
    isBrowserMode,
    onSingleplayer,
    onWorldEditor,
    onOptions,
    onTutorial,
    onQuit,
    onBuildCreditClick,
    onShowWhatsNew,
}) => (
    <>
        <div className="relative mb-14 flex flex-col items-center">
            <h1 className="relative" aria-label="Atlas">
                <AtlasWordmark scale={7} />
                <StarGlyph scale={4} className="absolute -right-9 -top-7" />
            </h1>
            <div
                className="pointer-events-none absolute w-max"
                style={{
                    left: 'calc(100% - 0.4rem)',
                    top: 'calc(100% - 0.55rem)',
                    transform: 'translateX(-50%)',
                }}
            >
                <div
                    className="atlas-splash whitespace-nowrap font-bold text-brass-200 [text-shadow:2px_2px_0_#3e2c12]"
                    style={{ fontSize: `${splashFontSize}px` }}
                >
                    {formattedSplash.map((segment, index) => (
                        <span key={`${index}-${segment.text}`} style={segment.style}>{segment.text}</span>
                    ))}
                </div>
            </div>
        </div>

        <div className="flex w-[400px] flex-col gap-3">
            <MenuButton label="Singleplayer" onClick={onSingleplayer} width="w-full" variant="primary" />
            <MenuButton label="World Editor" onClick={onWorldEditor} width="w-full" />
            <div className="grid w-full grid-cols-2 gap-3">
                <MenuButton label="Options..." onClick={onOptions} width="w-full" />
                {isBrowserMode ? (
                    <MenuButton label="Tutorial..." onClick={onTutorial} width="w-full" />
                ) : (
                    <MenuButton label="Quit Game" onClick={onQuit} disabled={!onQuit} tooltip={!onQuit ? 'Cannot quit in browser' : undefined} width="w-full" />
                )}
            </div>
        </div>

        <button
            type="button"
            onClick={onShowWhatsNew}
            data-tip="See what's new"
            className="absolute bottom-2 left-3 text-px-2 text-parchment-100 text-shadow-md hover:text-brass-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-star"
        >
            Atlas {APP_DISPLAY_VERSION}: What&apos;s New
        </button>
        <a
            className="absolute bottom-2 right-3 text-px-2 text-parchment-100 text-shadow-md hover:text-brass-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-star"
            href="https://github.com/Lreddell/atlas"
            onClick={onBuildCreditClick}
            target="_blank"
            rel="noreferrer"
        >
            Built by Logan Reddell
        </a>
    </>
);

interface TutorialPromptModalProps {
    onAccept: () => void;
    onDecline: () => void;
}

export const TutorialPromptModal: React.FC<TutorialPromptModalProps> = ({ onAccept, onDecline }) => (
    <div className="absolute inset-0 z-[260] flex items-center justify-center bg-ink-950/70 atlas-fade-in">
        <div className="atlas-panel w-[560px] max-w-[calc(100vw-2rem)] px-8 pb-7 pt-5">
            <h2 className="atlas-title mb-3">First Time Here?</h2>
            <p className="mb-6 text-read text-parchment-200">
                Atlas includes a built-in tutorial wiki for controls, mechanics, and core gameplay concepts.
                Open it now?
            </p>
            <div className="grid grid-cols-2 gap-3">
                <MenuButton label="Yes, Show Tutorial" onClick={onAccept} width="w-full" variant="primary" />
                <MenuButton label="No, Thanks" onClick={onDecline} width="w-full" />
            </div>
        </div>
    </div>
);
