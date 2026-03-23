import React from 'react';
import { APP_DISPLAY_VERSION } from '../../../constants';
import type { WorldMetadata } from '../../../systems/world/WorldStorage';
import type { WorldGenPresetEntry } from '../../../systems/world/worldGenPresets';
import type { GameMode } from '../../../types';
import { MenuButton, MenuSlider } from './MainMenuControls';
import type { FormattedSplashSegment } from './useSplashAnimation';

export type MainMenuView = 'main' | 'create' | 'select' | 'settings' | 'editors';
export type PanoramaSubmenu = 'manager' | 'settings';

const submenuHeadingClass = 'text-white text-xl mb-4 font-bold text-shadow-lg';

interface CreateWorldPanelProps {
    worldName: string;
    onWorldNameChange: (value: string) => void;
    seed: string;
    onSeedChange: (value: string) => void;
    gameMode: GameMode;
    onCycleGameMode: () => void;
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
    worldGenPresets,
    selectedWorldGenPresetId,
    onSelectedWorldGenPresetIdChange,
    onCancel,
    onCreateWorld,
}) => (
    <div className="relative z-10 flex flex-col items-center">
        <h1 className={submenuHeadingClass}>Create New World</h1>
        <div className="flex w-[400px] flex-col gap-6">
            <div className="space-y-1">
                <label className="pl-1 text-xs font-minecraft uppercase text-gray-400">World Name</label>
                <input
                    autoFocus
                    type="text"
                    value={worldName}
                    onChange={(event) => onWorldNameChange(event.target.value)}
                    className="h-10 w-full border-2 border-[#333] bg-black px-3 font-minecraft text-white outline-none focus:border-blue-500"
                />
            </div>

            <div className="space-y-1">
                <label className="pl-1 text-xs font-minecraft uppercase text-gray-400">World Seed (Leave blank for random)</label>
                <input
                    type="text"
                    value={seed}
                    onChange={(event) => onSeedChange(event.target.value)}
                    placeholder="e.g. atlas"
                    className="h-10 w-full border-2 border-[#333] bg-black px-3 font-minecraft text-white outline-none focus:border-blue-500"
                />
            </div>

            <div className="space-y-1">
                <label className="pl-1 text-xs font-minecraft uppercase text-gray-400">Game Mode</label>
                <MenuButton
                    label={`Game Mode: ${gameMode.charAt(0).toUpperCase() + gameMode.slice(1)}`}
                    onClick={onCycleGameMode}
                    width="w-full"
                />
                <p className="pl-1 text-[10px] font-minecraft italic leading-tight text-gray-500">
                    {gameMode === 'survival' && 'Search for resources, craft, gain levels, health and hunger.'}
                    {gameMode === 'creative' && 'Unlimited resources, free flying and destroy blocks instantly.'}
                    {gameMode === 'spectator' && "You can look but don't touch."}
                </p>
            </div>

            <div className="space-y-1">
                <label className="pl-1 text-xs font-minecraft uppercase text-gray-400">World Edit Preset (.json)</label>
                <select
                    value={selectedWorldGenPresetId}
                    onChange={(event) => onSelectedWorldGenPresetIdChange(event.target.value)}
                    className="h-10 w-full border-2 border-[#333] bg-black px-3 font-minecraft text-white outline-none focus:border-blue-500"
                >
                    <option value="">Default Terrain</option>
                    {worldGenPresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.name}</option>
                    ))}
                </select>
                <p className="pl-1 text-[10px] font-minecraft italic leading-tight text-gray-500">
                    Presets are saved from Editor Features {'\u2192'} World Editor.
                </p>
            </div>

            <div className="mt-4 flex gap-4">
                <MenuButton label="Cancel" onClick={onCancel} width="w-[192px]" />
                <MenuButton label="Create World" onClick={onCreateWorld} variant="primary" width="w-[192px]" />
            </div>
        </div>
    </div>
);

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
}

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
}) => (
    <div className="relative z-10 flex h-full w-[600px] flex-col items-center py-10">
        <h1 className={submenuHeadingClass}>Select World</h1>
        <div className="mb-6 flex-1 w-full overflow-y-auto border-2 border-white/20 bg-black/50 p-2 scrollbar-thin">
            {worlds.length === 0 && (
                <div className="mt-20 text-center italic text-gray-500">No worlds found. Create one!</div>
            )}
            {worlds.map((world) => (
                <div
                    key={world.id}
                    onClick={() => onSelectWorld(world.id)}
                    onDoubleClick={() => onDoubleClickWorld(world.id)}
                    className={`
                        mb-1 flex cursor-pointer items-center justify-between border-2 p-3 transition-all
                        ${selectedWorldId === world.id
                            ? 'border-white bg-white/10'
                            : 'border-transparent bg-black/40 hover:border-white/10 hover:bg-white/5'}
                    `}
                >
                    <div>
                        <div className="flex items-center gap-2 text-lg font-bold text-[#eee]">
                            <span>{world.name}</span>
                            <span className="rounded border border-white/20 bg-black/35 px-2 py-0.5 text-[10px] font-minecraft text-blue-200">
                                Preset: {world.worldGenPresetName || 'Default Terrain'}
                            </span>
                        </div>
                        <div className="text-xs font-minecraft text-gray-400">
                            {world.id.split('-')[0]} {'\u2022'} {world.gameMode} {'\u2022'} {new Date(world.lastPlayed).toLocaleDateString()} {new Date(world.lastPlayed).toLocaleTimeString()}
                        </div>
                    </div>
                    {selectedWorldId === world.id && (
                        <div className="animate-pulse text-2xl text-green-500">{'\u25B6'}</div>
                    )}
                </div>
            ))}
        </div>

        <div className="flex w-full flex-col gap-3">
            <div className="flex justify-center gap-4">
                <MenuButton label="Play Selected World" onClick={onPlaySelected} disabled={!selectedWorldId} variant="primary" width="w-[280px]" />
                <MenuButton label="Create New World" onClick={onCreateNewWorld} width="w-[280px]" />
            </div>
            <div className="flex justify-center gap-4">
                <MenuButton label="Delete" onClick={onDeleteWorld} disabled={!selectedWorldId} variant="danger" width="w-[185px]" />
                <MenuButton label="Cancel" onClick={onCancel} width="w-[185px]" />
            </div>
            <div className="flex justify-center gap-4">
                <MenuButton label="Export" onClick={onExportWorld} disabled={!selectedWorldId} width="w-[185px]" />
                <MenuButton label="Import World" onClick={onImportWorld} width="w-[185px]" />
            </div>
        </div>
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

const getPanoramaLabel = (filePath: string, defaultPanoramaId: string) => {
    if (filePath === defaultPanoramaId) return 'Default Panorama (Alpha-1.0.1)';
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
    <div className="relative z-10 flex h-full w-[760px] flex-col items-center py-10">
        <h1 className={submenuHeadingClass}>Panorama Settings</h1>

        {panoramaSubmenu === 'manager' && (
            <>
                <div className="mb-4 w-full border-2 border-white/20 bg-black/50 p-2 text-xs font-minecraft text-gray-300">
                    Capture from in-game using {panoramaCaptureHotkey}, import an existing panorama PNG, and open Settings for panorama tuning.
                </div>

                <div className="mb-6 flex-1 w-full overflow-y-auto border-2 border-white/20 bg-black/50 p-2 scrollbar-thin">
                    {panoramaEntries.length === 0 && (
                        <div className="mt-20 text-center italic text-gray-500">No panoramas saved yet.</div>
                    )}

                    {panoramaEntries.map((filePath) => {
                        const isActive = activePanoramaPath === filePath;
                        const isDefault = filePath === defaultPanoramaId;
                        return (
                            <div
                                key={filePath}
                                className={`mb-1 flex items-center justify-between gap-3 border-2 p-3 ${isActive ? 'border-white bg-white/10' : 'border-transparent bg-black/40'}`}
                            >
                                <div className="min-w-0">
                                    <div className="truncate font-bold text-[#eee]">{getPanoramaLabel(filePath, defaultPanoramaId)}</div>
                                    <div className="truncate text-[10px] text-gray-400">
                                        {isDefault ? 'Built-in default panorama' : filePath.startsWith('web:') ? 'Stored in browser local storage' : filePath}
                                    </div>
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    <MenuButton
                                        label={isActive ? 'Using' : 'Use'}
                                        onClick={() => onUsePanorama(filePath)}
                                        disabled={isActive}
                                        width="w-[88px]"
                                        small
                                        variant="primary"
                                    />
                                    {!isDefault && (
                                        <MenuButton
                                            label="Delete"
                                            onClick={() => onDeletePanoramaFromDisk(filePath)}
                                            disabled={!canDeletePanoramaFromDisk}
                                            tooltip={!canDeletePanoramaFromDisk ? 'Desktop build only' : undefined}
                                            width="w-[88px]"
                                            small
                                            variant="danger"
                                        />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="flex w-full justify-center gap-4">
                    <MenuButton
                        label="Import Panorama"
                        onClick={onImportPanorama}
                        disabled={!canImportPanorama}
                        tooltip={!canImportPanorama ? 'Desktop build only' : undefined}
                        width="w-[220px]"
                    />
                    <MenuButton label="Settings" onClick={() => onPanoramaSubmenuChange('settings')} width="w-[220px]" />
                    <MenuButton label="Back" onClick={onBack} width="w-[220px]" />
                </div>
            </>
        )}

        {panoramaSubmenu === 'settings' && (
            <>
                <div className="mb-4 w-full border-2 border-white/20 bg-black/50 p-2 text-xs font-minecraft text-gray-300">
                    Panorama appearance settings apply to menu and loading backgrounds.
                </div>

                <div className="mb-4 flex w-full justify-center gap-4">
                    <MenuButton
                        label={`Background: ${usingPanorama ? 'Panorama' : 'Dirt'}`}
                        onClick={onToggleBackground}
                        disabled={!hasPanoramaBackground && backgroundMode === 'dirt'}
                        tooltip={!hasPanoramaBackground && backgroundMode === 'dirt' ? `Capture panorama in-game (${panoramaCaptureHotkey})` : undefined}
                        width="w-[320px]"
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

                <div className="flex w-full justify-center gap-4">
                    <MenuButton label="Back to Panorama" onClick={() => onPanoramaSubmenuChange('manager')} width="w-[320px]" />
                </div>
            </>
        )}
    </div>
);

interface EditorsPanelProps {
    onChunkBase: () => void;
    onFeatureEditor: () => void;
    onBack: () => void;
}

export const EditorsPanel: React.FC<EditorsPanelProps> = ({ onChunkBase, onFeatureEditor, onBack }) => (
    <div className="relative z-10 flex flex-col items-center">
        <h1 className={submenuHeadingClass}>Editor Features</h1>
        <div className="flex w-[420px] flex-col gap-4">
            <MenuButton label="World Editor" onClick={onChunkBase} width="w-full" variant="primary" />
            <MenuButton label="Feature Editor" onClick={onFeatureEditor} disabled tooltip="Coming soon!" width="w-full" />
            <MenuButton label="Back" onClick={onBack} width="w-full" />
        </div>
    </div>
);

interface MainLandingPanelProps {
    formattedSplash: FormattedSplashSegment[];
    splashFontSize: number;
    isBrowserMode: boolean;
    onSingleplayer: () => void;
    onEditors: () => void;
    onPanoramaSettings: () => void;
    onOptions: () => void;
    onTutorial: () => void;
    onQuit?: () => void;
    onBuildCreditClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

export const MainLandingPanel: React.FC<MainLandingPanelProps> = ({
    formattedSplash,
    splashFontSize,
    isBrowserMode,
    onSingleplayer,
    onEditors,
    onPanoramaSettings,
    onOptions,
    onTutorial,
    onQuit,
    onBuildCreditClick,
}) => (
    <>
        <style>{`
            .text-shadow-xl { text-shadow: 4px 4px 0px #3f3f3f; }
            .text-shadow-md { text-shadow: 1px 1px 0px #3f3f3f; }
            @keyframes pulse-scale {
                0%, 100% { transform: scale(1) rotate(-20deg); }
                50% { transform: scale(1.1) rotate(-20deg); }
            }
        `}</style>

        <div className="relative mb-16 flex flex-col items-center">
            <h1 className="text-7xl font-bold tracking-tighter text-[#c6c6c6] text-shadow-xl">Atlas</h1>
            <div
                className="pointer-events-none absolute w-max"
                style={{
                    left: 'calc(100% - 0.4rem)',
                    top: 'calc(100% - 0.55rem)',
                    transform: 'translateX(-50%)',
                }}
            >
                <div
                    className="whitespace-nowrap font-bold text-yellow-300 drop-shadow-md"
                    style={{
                        fontSize: `${splashFontSize}px`,
                        animation: 'pulse-scale 0.5s infinite alternate ease-in-out',
                        transformOrigin: 'center top',
                    }}
                >
                    {formattedSplash.map((segment, index) => (
                        <span key={`${index}-${segment.text}`} style={segment.style}>{segment.text}</span>
                    ))}
                </div>
            </div>
        </div>

        <div className="flex w-[400px] flex-col gap-4">
            <MenuButton label="Singleplayer" onClick={onSingleplayer} width="w-full" variant="primary" />
            <MenuButton label="Editor Features" onClick={onEditors} width="w-full" />
            <MenuButton label="Panorama Settings" onClick={onPanoramaSettings} width="w-full" />
            <MenuButton label="Multiplayer" disabled tooltip="Coming soon!" width="w-full" />
            <div className="flex w-full gap-4">
                <MenuButton label="Options..." onClick={onOptions} width="w-[192px]" />
                {isBrowserMode ? (
                    <MenuButton label="Tutorial..." onClick={onTutorial} width="w-[192px]" />
                ) : (
                    <MenuButton label="Quit Game" onClick={onQuit} disabled={!onQuit} tooltip={!onQuit ? 'Cannot quit in browser' : undefined} width="w-[192px]" />
                )}
            </div>
        </div>

        <div className="absolute bottom-2 left-2 text-white text-shadow-md">Atlas {APP_DISPLAY_VERSION}</div>
        <a
            className="absolute bottom-2 right-2 text-white text-shadow-md hover:underline"
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
    <div className="absolute inset-0 z-[260] flex items-center justify-center bg-black/70">
        <div className="w-[560px] border-2 border-white border-b-[#373737] border-r-[#373737] bg-[#151515] p-6">
            <h2 className="mb-2 text-2xl font-bold text-white text-shadow-md">First Time Here?</h2>
            <p className="mb-6 text-sm font-minecraft leading-relaxed text-gray-200">
                Atlas includes a built-in tutorial wiki for controls, mechanics, and core gameplay concepts.
                Open it now?
            </p>
            <div className="flex justify-center gap-4">
                <MenuButton label="Yes, Show Tutorial" onClick={onAccept} width="w-[220px]" variant="primary" />
                <MenuButton label="No, Thanks" onClick={onDecline} width="w-[220px]" />
            </div>
        </div>
    </div>
);
