
import React, { useEffect, useMemo, useState } from 'react';
import { soundManager } from '../../systems/sound/SoundManager';
import { musicController } from '../../systems/sound/MusicController';
import { ExportedWorldData, WorldStorage, WorldMetadata } from '../../systems/world/WorldStorage';
import { MenuPanoramaBackground } from './MenuPanoramaBackground';
import { APP_DISPLAY_VERSION } from '../../constants';
import { getWorldGenPresetByIdAsync, listWorldGenPresetsAsync, WorldGenPresetEntry } from '../../systems/world/worldGenPresets';

const PANORAMA_DEBUG_HOTKEY = 'F5';
const TUTORIAL_SCREEN_SEEN_KEY = 'atlas.tutorial.screenSeen.v2';
const TUTORIAL_PROMPTED_KEY = 'atlas.tutorial.prompted.v2';

interface MainMenuProps {
    onStart: (worldId: string) => void;
    onChunkBase: () => void;
    onFeatureEditor: () => void;
    onOptions: (opts?: { openTutorial?: boolean }) => void;
    onQuit?: () => void;
    backgroundMode: 'dirt' | 'panorama';
    panoramaBackgroundDataUrl: string | null;
    panoramaFaceDataUrls?: string[] | null;
    hasPanoramaBackground: boolean;
    onToggleBackground: () => void;
    panoramaCaptureHotkey: string;
    panoramaEntries: string[];
    activePanoramaPath: string | null;
    defaultPanoramaId: string;
    onUsePanorama: (filePath: string) => void;
    onImportPanorama: () => void;
    canImportPanorama: boolean;
    onDeletePanoramaFromDisk: (filePath: string) => void;
    canDeletePanoramaFromDisk: boolean;
    panoramaBlur: number;
    panoramaGradient: number;
    setPanoramaBlur: (value: number) => void;
    setPanoramaGradient: (value: number) => void;
    panoramaRotationSpeed: number;
    setPanoramaRotationSpeed: (value: number) => void;
    showBackground?: boolean;
}

const SPLASHES = [
    "Also try Minecraft!", "Procedural!", "Voxel based!", "React + Three.js!", "Infinite world!", 
    "Open source!", "Made with AI!", "100% bugs!", "Check out the code!", "Don't dig down!", 
    "Uses Web Workers!", "Greedy meshing!", "Now with biomes!", "Hello World!", 
    "Powered by Vite!", "Diamonds!", "Look behind you!", "Splashes are random!", 
    "Better than real life!", "Try WorldEdit!", "Blocky goodness!", "Is this the real life?", 
    "Or just fantasy?", "Undefined behavior!", "NaN!", "0 FPS!", "Just one more block...", 
    "Updates every frame!", "Lighting is hard!", "Shadows included!", "Made in a cave!", "With a box of scraps!",
    "Now with extra splashes!", "Chunk by chunk!", "Sky is not the limit!", "Sunrise simulator!",
    "Bedtime approved!", "Inventory Tetris!", "Craft responsibly!", "Punching trees works!", "Grass is greener here!",
    "Cobble all day!", "Smelt it like it's hot!", "Awaiting multiplayer!", "Press E to inventory!",
    "Press / for commands!", "Biome hunter!", "Spawn point saved!", "Sleep to skip night!",
    "Clouds enabled!", "Fog machine online!", "GPU says hello!", "CPU doing its best!", "Loading chunks...",
    "Meshing in progress!", "Worker-powered!", "Procedurally delicious!", "Terrain never ends!", "Watch your step!",
    "Build. Break. Repeat.", "Paused? Never heard of it.", "Worlds in your pocket!", "Atlas knows the way!",
    "No microtransactions!", "Free-range voxels!", "Seed of destiny!", "Try a weird seed!", "Day-night certified!",
    "Friendly neighborhood blocks!", "Stone age speedrun!", "Wood acquired!", "Torch the darkness!", "Stay hydrated, player!",
    "Spectator mode unlocked!", "Creative juices flowing!", "Survival instincts active!", "This splash is true!",
    "Bug? Feature!", "Blocks all the way down!", "Welcome back, crafter!", "Pickaxe recommended!", "*Digging intensifies*",
    "Now with fewer crashes*!", "*Not guaranteed!", "If you see void, walk away!", "Gravity works most days!", "Physics is a suggestion!",
    "May contain minor chaos!", "Autosave before panic!", "Chunk not found? Keep walking!", "Invisible wall? Classic!", "Lag spike detected!",
    "Works on my machine!", "Reload and pretend nothing happened!", "Unexpectedly expected behavior!",
    "If stuck, jump repeatedly!", "Try turning it off and on!", "Feature-rich, bug-richer!", "One tiny bug at a time!", "The void stares back!",
    "No clip? Not today!", "Edge of map? There isn't one!", "Oops, all edge cases!", "Patch notes pending...", "Debug mode is my love language!",
    "Fresh bugs, hot and ready!", "Collision is negotiable!", "This block is definitely solid... probably!", "Don't trust floating sand!",
    "Broken? It's immersive!", "Warning: fun may be unstable!", "Glitch% speedrun ready!", "Alt+F4 is not a feature!", "Your bug report is appreciated!",
    "Water physics went on vacation!", "Fire spreads fast, regret faster!",
    "Don't be scared of the dark!", "Just a harmless rendering artifact!", "FPS is a social construct!", "Compiling more confidence!",
    "Everything is fine. Totally.",
    "Mining with confidence issues!", "100% reproducible... maybe!", "Bug fixed in the next timeline!",
    "Hotfix incoming eventually!", "If it flickers, it's dynamic!",
    "§4§lC§c§lo§6§ll§e§lo§a§lr§2§lm§b§la§9§lt§d§li§5§lc§r!",
];

const ULTRA_RARE_SPLASHES = [
    "",
    "12 FPS on a supercomputer?",
    "The chunk loaded first try!",
    "Zero crashes today! I swear!",
    "Herobrine added back in!",
    "Collision worked perfectly!",
    "No TODOs left!",
    "Reproduced on first attempt!",
    "Bug fixed without new bugs!",
    "QA approved this build!",
    "One-line fix. No regrets.",
    "T H E  V O I D  S T A R E S  B A C K",
    "ChatGPT wrote this splash!",
    "Hey @Grok, why is the entire game broken?",
    "§k??????????????",
    "Playing for the vibes",
    "You found a rare splash!"
];

const ULTRA_RARE_SPLASH_CHANCE = 0.01;

/**
 * Minecraft-style color map for legacy formatting codes.
 *
 * Usage in splash strings:
 * - Color: §0..§9, §a..§f
 * - Styles: §l (bold), §o (italic), §n (underline), §m (strikethrough), §k (obfuscated), §r (reset)
 *
 * Example: "§6§lGolden! §r§bAqua"
 */
const MC_COLOR_BY_CODE: Record<string, string> = {
    '0': '#000000',
    '1': '#0000AA',
    '2': '#00AA00',
    '3': '#00AAAA',
    '4': '#AA0000',
    '5': '#AA00AA',
    '6': '#FFAA00',
    '7': '#AAAAAA',
    '8': '#555555',
    '9': '#5555FF',
    a: '#55FF55',
    b: '#55FFFF',
    c: '#FF5555',
    d: '#FF55FF',
    e: '#FFFF55',
    f: '#FFFFFF',
};

/** Default splash color when no color code is active (or after §r reset). */
const DEFAULT_SPLASH_COLOR = '#fde047';
/** Character pool used for §k obfuscated text effect. */
const OBFUSCATION_SOURCE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

interface ParsedSplashSegment {
    text: string;
    style: React.CSSProperties;
}

/** Returns a random replacement character for §k, preserving spaces for readability. */
const getObfuscatedChar = (sourceChar: string) => {
    if (sourceChar === ' ') return sourceChar;
    return OBFUSCATION_SOURCE[Math.floor(Math.random() * OBFUSCATION_SOURCE.length)];
};

/**
 * Counts visible characters only (ignores formatting tokens like §a).
 * This keeps font-size scaling consistent for formatted splashes.
 */
const getVisibleSplashLength = (value: string) => {
    let visibleCount = 0;
    for (let index = 0; index < value.length; index += 1) {
        if (value[index] === '§' && index + 1 < value.length) {
            index += 1;
            continue;
        }
        visibleCount += 1;
    }
    return visibleCount;
};

/**
 * Parses a splash string with Minecraft-style § formatting into renderable styled segments.
 *
 * Important behavior:
 * - A color code also clears active styles (Minecraft Java-like behavior)
 * - §r resets color + all styles to defaults
 * - Unknown codes are treated as literal text
 */
const parseSplashFormatting = (value: string): ParsedSplashSegment[] => {
    const parsedSegments: ParsedSplashSegment[] = [];

    let currentColor = DEFAULT_SPLASH_COLOR;
    let isBold = false;
    let isItalic = false;
    let isUnderlined = false;
    let isStrikethrough = false;
    let isObfuscated = false;
    let currentText = '';

    const pushSegment = () => {
        if (!currentText) return;
        parsedSegments.push({
            text: currentText,
            style: {
                color: currentColor,
                fontWeight: isBold ? 700 : 400,
                fontStyle: isItalic ? 'italic' : 'normal',
                textDecoration: [isUnderlined ? 'underline' : '', isStrikethrough ? 'line-through' : '']
                    .filter(Boolean)
                    .join(' '),
            }
        });
        currentText = '';
    };

    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        const nextCharacter = value[index + 1]?.toLowerCase();

        if (character === '§' && nextCharacter) {
            pushSegment();

            if (nextCharacter in MC_COLOR_BY_CODE) {
                currentColor = MC_COLOR_BY_CODE[nextCharacter];
                isBold = false;
                isItalic = false;
                isUnderlined = false;
                isStrikethrough = false;
                isObfuscated = false;
            } else if (nextCharacter === 'l') {
                isBold = true;
            } else if (nextCharacter === 'm') {
                isStrikethrough = true;
            } else if (nextCharacter === 'n') {
                isUnderlined = true;
            } else if (nextCharacter === 'o') {
                isItalic = true;
            } else if (nextCharacter === 'k') {
                isObfuscated = true;
            } else if (nextCharacter === 'r') {
                currentColor = DEFAULT_SPLASH_COLOR;
                isBold = false;
                isItalic = false;
                isUnderlined = false;
                isStrikethrough = false;
                isObfuscated = false;
            } else {
                currentText += character;
                continue;
            }

            index += 1;
            continue;
        }

        currentText += isObfuscated ? getObfuscatedChar(character) : character;
    }

    pushSegment();
    return parsedSegments;
};

const MenuButton: React.FC<{
    label: string;
    onClick?: () => void;
    width?: string;
    disabled?: boolean;
    tooltip?: string;
    small?: boolean;
    variant?: 'normal' | 'primary' | 'danger';
}> = ({ label, onClick, width = 'w-96', disabled = false, tooltip, small, variant = 'normal' }) => {
    const [isHovered, setIsHovered] = useState(false);

    let colors = 'bg-[#8b8b8b] border-white border-b-[#373737] border-r-[#373737] text-white';
    if (variant === 'primary') colors = 'bg-blue-600 border-blue-400 border-b-blue-950 border-r-blue-950 text-white';
    if (variant === 'danger') colors = 'bg-red-700 border-red-400 border-b-red-950 border-r-red-950 text-white';

    return (
        <div className="relative">
            <button 
                onClick={(e) => { 
                    e.stopPropagation(); 
                    if (!disabled && onClick) {
                        soundManager.play("ui.click");
                        onClick(); 
                    }
                }}
                onMouseEnter={() => { 
                    setIsHovered(true); 
                    if(!disabled) soundManager.play("ui.hover", { volume: 0.2, pitch: 2.0 }); 
                }}
                onMouseLeave={() => setIsHovered(false)}
                className={`
                    ${width} ${small ? 'h-8 text-sm' : 'h-10'} relative border-2 select-none outline-none group
                    ${colors}
                    font-minecraft text-shadow-md
                    ${disabled ? 'opacity-70 cursor-not-allowed grayscale' : 'hover:brightness-110 active:border-white active:border-b-white active:border-r-white'}
                `}
            >
                <div className={`absolute inset-[2px] border-2 border-transparent ${!disabled && 'group-active:border-white/10'} pointer-events-none`} />
                <span className="relative top-0 group-active:top-[1px]">{label}</span>
            </button>
            {disabled && isHovered && tooltip && (
                <div className="absolute left-[105%] top-1/2 transform -translate-y-1/2 bg-[#100010] border-2 border-[#2a0b4d] text-white px-2 py-1 text-sm whitespace-nowrap z-50 font-minecraft">
                    {tooltip}
                </div>
            )}
        </div>
    );
};

const MenuSlider: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (value: number) => void;
    width?: string;
    formatValue?: (value: number) => string;
}> = ({ label, value, min, max, step = 0.01, onChange, width = 'w-96', formatValue }) => {
    const percentage = ((value - min) / (max - min)) * 100;
    return (
        <div
            className={`${width} h-10 relative bg-[#000000] border-2 border-white border-b-[#373737] border-r-[#373737] select-none cursor-pointer`}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => {
                e.stopPropagation();
                soundManager.play('ui.slider');
            }}
        >
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer"
            />
            <div className="absolute inset-0 bg-[#8b8b8b] border border-[#555] pointer-events-none">
                <div className="absolute top-0 bottom-0 bg-[#a0a0a0] border-r-2 border-black/20" style={{ width: `${percentage}%` }} />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 text-white font-minecraft text-shadow-md">
                {label}: {formatValue ? formatValue(value) : `${Math.round(percentage)}%`}
            </div>
        </div>
    );
};

export const MainMenu: React.FC<MainMenuProps> = ({
    onStart,
    onChunkBase,
    onFeatureEditor,
    onOptions,
    onQuit,
    backgroundMode,
    panoramaBackgroundDataUrl,
    panoramaFaceDataUrls,
    hasPanoramaBackground,
    onToggleBackground,
    panoramaCaptureHotkey,
    panoramaEntries,
    activePanoramaPath,
    defaultPanoramaId,
    onUsePanorama,
    onImportPanorama,
    canImportPanorama,
    onDeletePanoramaFromDisk,
    canDeletePanoramaFromDisk,
    panoramaBlur,
    panoramaGradient,
    setPanoramaBlur,
    setPanoramaGradient,
    panoramaRotationSpeed,
    setPanoramaRotationSpeed,
    showBackground = true,
}) => {
    const [view, setView] = useState<'main' | 'create' | 'select' | 'settings' | 'editors'>('main');
    const [panoramaSubmenu, setPanoramaSubmenu] = useState<'manager' | 'settings'>('manager');
    const [panoramaDebugFly, setPanoramaDebugFly] = useState(false);
    const [splash, setSplash] = useState('');
    const [splashFontSize, setSplashFontSize] = useState(20);
    const [showTutorialPrompt, setShowTutorialPrompt] = useState(false);

    // World Selection State
    const [worlds, setWorlds] = useState<WorldMetadata[]>([]);
    const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);

    // Create World State
    const [worldName, setWorldName] = useState('New World');
    const [seed, setSeed] = useState('');
    const [gameMode, setGameMode] = useState<'survival' | 'creative' | 'spectator'>('survival');
    const [worldGenPresets, setWorldGenPresets] = useState<WorldGenPresetEntry[]>([]);
    const [selectedWorldGenPresetId, setSelectedWorldGenPresetId] = useState('');
    const hasFaceCubemap = !!panoramaFaceDataUrls && panoramaFaceDataUrls.length === 6;
    const isBrowserMode = !onQuit;

    const refreshWorldGenPresets = async () => {
        const presets = await listWorldGenPresetsAsync();
        setWorldGenPresets(presets);
        setSelectedWorldGenPresetId((prev) => {
            if (prev && presets.some((preset) => preset.id === prev)) return prev;
            return '';
        });
    };

    const refreshSplash = () => {
        const selectedSplash = Math.random() < ULTRA_RARE_SPLASH_CHANCE
            ? ULTRA_RARE_SPLASHES[Math.floor(Math.random() * ULTRA_RARE_SPLASHES.length)]
            : SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
        setSplash(selectedSplash);
        const baseSize = 20;
        const threshold = 20;
        const visibleLength = Math.max(1, getVisibleSplashLength(selectedSplash));
        const scale = Math.max(0.5, Math.min(1, threshold / visibleLength));
        setSplashFontSize(baseSize * scale);
    };

    useEffect(() => {
        void loadWorlds();
        void refreshWorldGenPresets();

        if (typeof window !== 'undefined') {
            const hasSeenTutorialScreen = window.localStorage.getItem(TUTORIAL_SCREEN_SEEN_KEY) === 'true';
            const hasBeenPrompted = window.localStorage.getItem(TUTORIAL_PROMPTED_KEY) === 'true';
            if (!hasSeenTutorialScreen && !hasBeenPrompted) {
                setShowTutorialPrompt(true);
            }
        }
    }, []);

    const markTutorialPrompted = () => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(TUTORIAL_PROMPTED_KEY, 'true');
    };

    const handleTutorialPromptAccept = () => {
        soundManager.resume();
        musicController.update(true, 'survival', 'plains');
        markTutorialPrompted();
        setShowTutorialPrompt(false);
        onOptions({ openTutorial: true });
    };

    const handleTutorialPromptDecline = () => {
        soundManager.resume();
        musicController.update(true, 'survival', 'plains');
        markTutorialPrompted();
        setShowTutorialPrompt(false);
    };

    useEffect(() => {
        if (view === 'create') {
            void refreshWorldGenPresets();
        }
    }, [view]);

    useEffect(() => {
        if (view === 'main') {
            refreshSplash();
        }
    }, [view]);

    useEffect(() => {
        if (view !== 'settings') {
            setPanoramaSubmenu('manager');
        }
    }, [view]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

            if (panoramaDebugFly && event.key === 'Escape') {
                event.preventDefault();
                setPanoramaDebugFly(false);
                return;
            }

            if (event.code === PANORAMA_DEBUG_HOTKEY) {
                event.preventDefault();
                if (hasPanoramaBackground || hasFaceCubemap) {
                    setPanoramaDebugFly((prev) => !prev);
                    setView('main');
                }
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [panoramaDebugFly, hasPanoramaBackground, hasFaceCubemap]);

    const formattedSplash = useMemo(() => parseSplashFormatting(splash), [splash]);
    const usingPanorama = backgroundMode === 'panorama' && (!!panoramaBackgroundDataUrl || hasFaceCubemap);
    const submenuOverlayClass = usingPanorama ? 'bg-black/60' : 'bg-black/35';
    const loadWorlds = async () => {
        const list = await WorldStorage.getAllWorlds();
        list.sort((a, b) => b.lastPlayed - a.lastPlayed);
        setWorlds(list);
    };

    const handleCreateWorld = async () => {
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
    };

    const handlePlaySelected = async () => {
        if (selectedWorldId) {
            onStart(selectedWorldId);
        }
    };

    const handleDeleteWorld = async () => {
        if (selectedWorldId && confirm("Are you sure you want to delete this world? It will be lost forever! (A long time!)")) {
            try {
                await WorldStorage.deleteWorld(selectedWorldId);
                setSelectedWorldId(null);
                await loadWorlds();
                soundManager.play("ui.click", { pitch: 0.6 });
            } catch (e) {
                alert("Failed to delete world. See console for details.");
                console.error(e);
            }
        }
    };

    const handleExportWorld = async () => {
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
    };

    const handleImportWorld = async () => {
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
    };

    const getPanoramaLabel = (filePath: string) => {
        if (filePath === defaultPanoramaId) {
            return 'Default Panorama (Alpha-1.0.1)';
        }
        if (filePath.startsWith('web:')) {
            return filePath.slice(4) || 'Browser Panorama';
        }
        const normalized = filePath.replace(/\\/g, '/');
        const chunks = normalized.split('/');
        return chunks[chunks.length - 1] || filePath;
    };

    if (panoramaDebugFly) {
        return (
            <div className="absolute inset-0 z-[240] cursor-none">
                <MenuPanoramaBackground
                    backgroundMode={'panorama'}
                    panoramaBackgroundDataUrl={panoramaBackgroundDataUrl}
                    panoramaFaceDataUrls={panoramaFaceDataUrls}
                    panoramaBlur={panoramaBlur}
                    panoramaGradient={panoramaGradient}
                    panoramaRotationSpeed={panoramaRotationSpeed}
                    debugFlyMode
                />
                <div className="absolute top-3 left-3 text-white text-xs font-minecraft bg-black/55 border border-white/30 px-2 py-1 pointer-events-none">
                    Panorama Debug Fly • F5 toggle • WASD/Space/Shift • Mouse look • Esc to exit
                </div>
            </div>
        );
    }
    const submenuHeadingClass = 'text-white text-xl mb-4 font-bold text-shadow-lg';
    const showSubmenuOverlay = view !== 'main';

    const renderMenuContent = () => {
        if (view === 'create') {
            return (
                <div className="relative z-10 flex flex-col items-center">
                    <h1 className={submenuHeadingClass}>Create New World</h1>

                    <div className="flex flex-col gap-6 w-[400px]">
                        <div className="space-y-1">
                            <label className="text-gray-400 text-xs font-minecraft uppercase pl-1">World Name</label>
                            <input
                                autoFocus
                                type="text"
                                value={worldName}
                                onChange={(e) => setWorldName(e.target.value)}
                                className="w-full h-10 bg-black border-2 border-[#333] focus:border-blue-500 text-white font-minecraft px-3 outline-none"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-gray-400 text-xs font-minecraft uppercase pl-1">World Seed (Leave blank for random)</label>
                            <input
                                type="text"
                                value={seed}
                                onChange={(e) => setSeed(e.target.value)}
                                placeholder="e.g. atlas"
                                className="w-full h-10 bg-black border-2 border-[#333] focus:border-blue-500 text-white font-minecraft px-3 outline-none"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-gray-400 text-xs font-minecraft uppercase pl-1">Game Mode</label>
                            <MenuButton
                                label={`Game Mode: ${gameMode.charAt(0).toUpperCase() + gameMode.slice(1)}`}
                                onClick={() => {
                                    const modes: any[] = ['survival', 'creative', 'spectator'];
                                    const next = modes[(modes.indexOf(gameMode) + 1) % modes.length];
                                    setGameMode(next);
                                }}
                                width="w-full"
                            />
                            <p className="text-[10px] text-gray-500 font-minecraft italic pl-1 leading-tight">
                                {gameMode === 'survival' && "Search for resources, craft, gain levels, health and hunger."}
                                {gameMode === 'creative' && "Unlimited resources, free flying and destroy blocks instantly."}
                                {gameMode === 'spectator' && "You can look but don't touch."}
                            </p>
                        </div>

                        <div className="space-y-1">
                            <label className="text-gray-400 text-xs font-minecraft uppercase pl-1">World Edit Preset (.json)</label>
                            <select
                                value={selectedWorldGenPresetId}
                                onChange={(e) => setSelectedWorldGenPresetId(e.target.value)}
                                className="w-full h-10 bg-black border-2 border-[#333] focus:border-blue-500 text-white font-minecraft px-3 outline-none"
                            >
                                <option value="">Default Terrain</option>
                                {worldGenPresets.map((preset) => (
                                    <option key={preset.id} value={preset.id}>{preset.name}</option>
                                ))}
                            </select>
                            <p className="text-[10px] text-gray-500 font-minecraft italic pl-1 leading-tight">
                                Presets are saved from Editor Features → World Editor.
                            </p>
                        </div>

                        <div className="flex gap-4 mt-4">
                            <MenuButton label="Cancel" onClick={() => setView('select')} width="w-[192px]" />
                            <MenuButton label="Create World" onClick={handleCreateWorld} variant="primary" width="w-[192px]" />
                        </div>
                    </div>
                </div>
            );
        }

        if (view === 'select') {
            return (
                <div className="relative z-10 flex flex-col items-center w-[600px] h-full py-10">
                    <h1 className={submenuHeadingClass}>Select World</h1>

                    <div className="flex-1 w-full bg-black/50 border-2 border-white/20 mb-6 overflow-y-auto p-2 scrollbar-thin">
                        {worlds.length === 0 && (
                            <div className="text-gray-500 text-center mt-20 italic">No worlds found. Create one!</div>
                        )}
                        {worlds.map(w => (
                            <div
                                key={w.id}
                                onClick={() => { setSelectedWorldId(w.id); soundManager.play("ui.click"); }}
                                onDoubleClick={() => { setSelectedWorldId(w.id); handlePlaySelected(); }}
                                className={`
                                    p-3 mb-1 cursor-pointer border-2 transition-all flex justify-between items-center
                                    ${selectedWorldId === w.id
                                        ? 'bg-white/10 border-white'
                                        : 'bg-black/40 border-transparent hover:bg-white/5 hover:border-white/10'}
                                `}
                            >
                                <div>
                                    <div className="font-bold text-lg text-[#eee] flex items-center gap-2">
                                        <span>{w.name}</span>
                                        <span className="text-[10px] font-minecraft px-2 py-0.5 rounded border border-white/20 bg-black/35 text-blue-200">
                                            Preset: {w.worldGenPresetName || 'Default Terrain'}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-400 font-minecraft">
                                        {w.id.split('-')[0]} • {w.gameMode} • {new Date(w.lastPlayed).toLocaleDateString()} {new Date(w.lastPlayed).toLocaleTimeString()}
                                    </div>
                                </div>
                                {selectedWorldId === w.id && (
                                    <div className="text-2xl text-green-500 animate-pulse">▶</div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col gap-3 w-full">
                        <div className="flex gap-4 justify-center">
                            <MenuButton
                                label="Play Selected World"
                                onClick={handlePlaySelected}
                                disabled={!selectedWorldId}
                                variant="primary"
                                width="w-[280px]"
                            />
                            <MenuButton
                                label="Create New World"
                                onClick={() => setView('create')}
                                width="w-[280px]"
                            />
                        </div>
                        <div className="flex gap-4 justify-center">
                            <MenuButton
                                label="Delete"
                                onClick={handleDeleteWorld}
                                disabled={!selectedWorldId}
                                variant="danger"
                                width="w-[185px]"
                            />
                            <MenuButton label="Cancel" onClick={() => setView('main')} width="w-[185px]" />
                        </div>
                        <div className="flex gap-4 justify-center">
                            <MenuButton
                                label="Export"
                                onClick={handleExportWorld}
                                disabled={!selectedWorldId}
                                width="w-[185px]"
                            />
                            <MenuButton
                                label="Import World"
                                onClick={handleImportWorld}
                                width="w-[185px]"
                            />
                        </div>
                    </div>
                </div>
            );
        }

        if (view === 'settings') {
            return (
                <div className="relative z-10 flex flex-col items-center w-[760px] h-full py-10">
                    <h1 className={submenuHeadingClass}>Panorama Settings</h1>

                    {panoramaSubmenu === 'manager' && (
                        <>
                            <div className="w-full bg-black/50 border-2 border-white/20 mb-4 p-2 text-xs text-gray-300 font-minecraft">
                                Capture from in-game using {panoramaCaptureHotkey}, import an existing panorama PNG, and open Settings for panorama tuning.
                            </div>

                            <div className="flex-1 w-full bg-black/50 border-2 border-white/20 mb-6 overflow-y-auto p-2 scrollbar-thin">
                                {panoramaEntries.length === 0 && (
                                    <div className="text-gray-500 text-center mt-20 italic">No panoramas saved yet.</div>
                                )}

                                {panoramaEntries.map((filePath) => {
                                    const isActive = activePanoramaPath === filePath;
                                    const isDefault = filePath === defaultPanoramaId;
                                    return (
                                        <div
                                            key={filePath}
                                            className={`p-3 mb-1 border-2 flex items-center justify-between gap-3 ${isActive ? 'bg-white/10 border-white' : 'bg-black/40 border-transparent'}`}
                                        >
                                            <div className="min-w-0">
                                                <div className="font-bold text-[#eee] truncate">{getPanoramaLabel(filePath)}</div>
                                                <div className="text-[10px] text-gray-400 truncate">{isDefault ? 'Built-in default panorama' : filePath.startsWith('web:') ? 'Stored in browser local storage' : filePath}</div>
                                            </div>
                                            <div className="flex gap-2 shrink-0">
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

                            <div className="flex gap-4 justify-center w-full">
                                <MenuButton
                                    label="Import Panorama"
                                    onClick={onImportPanorama}
                                    disabled={!canImportPanorama}
                                    tooltip={!canImportPanorama ? 'Desktop build only' : undefined}
                                    width="w-[220px]"
                                />
                                <MenuButton label="Settings" onClick={() => setPanoramaSubmenu('settings')} width="w-[220px]" />
                                <MenuButton label="Back" onClick={() => setView('main')} width="w-[220px]" />
                            </div>
                        </>
                    )}

                    {panoramaSubmenu === 'settings' && (
                        <>
                            <div className="w-full bg-black/50 border-2 border-white/20 mb-4 p-2 text-xs text-gray-300 font-minecraft">
                                Panorama appearance settings apply to menu and loading backgrounds.
                            </div>

                            <div className="flex gap-4 justify-center w-full mb-4">
                                <MenuButton
                                    label={`Background: ${usingPanorama ? 'Panorama' : 'Dirt'}`}
                                    onClick={onToggleBackground}
                                    disabled={!hasPanoramaBackground && backgroundMode === 'dirt'}
                                    tooltip={!hasPanoramaBackground && backgroundMode === 'dirt' ? `Capture panorama in-game (${panoramaCaptureHotkey})` : undefined}
                                    width="w-[320px]"
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-3 w-full mb-6 justify-items-center">
                                <MenuSlider
                                    label="Menu Panorama Blur"
                                    value={panoramaBlur}
                                    min={0}
                                    max={12}
                                    step={0.5}
                                    onChange={setPanoramaBlur}
                                    width="w-[460px]"
                                    formatValue={(v) => `${v.toFixed(1)} px`}
                                />
                                <MenuSlider
                                    label="Menu Gradient"
                                    value={panoramaGradient}
                                    min={0}
                                    max={0.9}
                                    step={0.05}
                                    onChange={setPanoramaGradient}
                                    width="w-[460px]"
                                    formatValue={(v) => `${Math.round(v * 100)}%`}
                                />
                                <MenuSlider
                                    label="Rotation Speed"
                                    value={panoramaRotationSpeed}
                                    min={0}
                                    max={4}
                                    step={0.1}
                                    onChange={setPanoramaRotationSpeed}
                                    width="w-[460px]"
                                    formatValue={(v) => (v <= 0 ? 'Rotation Off' : `${v.toFixed(1)}x`)}
                                />
                            </div>

                            <div className="flex gap-4 justify-center w-full">
                                <MenuButton label="Back to Panorama" onClick={() => setPanoramaSubmenu('manager')} width="w-[320px]" />
                            </div>
                        </>
                    )}
                </div>
            );
        }

        if (view === 'editors') {
            return (
                <div className="relative z-10 flex flex-col items-center">
                    <h1 className={submenuHeadingClass}>Editor Features</h1>
                    <div className="flex flex-col gap-4 w-[420px]">
                        <MenuButton label="World Editor" onClick={onChunkBase} width="w-full" variant="primary" />
                        <MenuButton label="Feature Editor" onClick={onFeatureEditor} disabled tooltip="Coming soon!" width="w-full" />
                        <MenuButton label="Back" onClick={() => setView('main')} width="w-full" />
                    </div>
                </div>
            );
        }

        return (
            <>
                <style>{`
                    .text-shadow-xl { text-shadow: 4px 4px 0px #3f3f3f; }
                    .text-shadow-md { text-shadow: 1px 1px 0px #3f3f3f; }
                    @keyframes pulse-scale {
                        0%, 100% { transform: scale(1) rotate(-20deg); }
                        50% { transform: scale(1.1) rotate(-20deg); }
                    }
                `}</style>

                <div className="flex flex-col items-center mb-16 relative">
                    <h1 className="text-7xl font-bold text-[#c6c6c6] text-shadow-xl tracking-tighter">Atlas</h1>
                    <div
                        className="absolute -right-24 bottom-0 text-yellow-300 font-bold drop-shadow-md whitespace-nowrap"
                        style={{ fontSize: `${splashFontSize}px`, animation: 'pulse-scale 0.5s infinite alternate ease-in-out' }}
                    >
                        {formattedSplash.map((segment, index) => (
                            <span key={`${index}-${segment.text}`} style={segment.style}>{segment.text}</span>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-4 w-[400px]">
                    <MenuButton label="Singleplayer" onClick={() => setView('select')} width="w-full" variant="primary" />
                    <MenuButton label="Editor Features" onClick={() => setView('editors')} width="w-full" />
                    <MenuButton label="Panorama Settings" onClick={() => setView('settings')} width="w-full" />
                    <MenuButton label="Multiplayer" disabled tooltip="Coming soon!" width="w-full" />
                    <div className="flex gap-4 w-full">
                        <MenuButton label="Options..." onClick={onOptions} width="w-[192px]" />
                        {isBrowserMode ? (
                            <MenuButton label="Tutorial..." onClick={() => onOptions({ openTutorial: true })} width="w-[192px]" />
                        ) : (
                            <MenuButton label="Quit Game" onClick={onQuit} disabled={!onQuit} tooltip={!onQuit ? "Cannot quit in browser" : undefined} width="w-[192px]" />
                        )}
                    </div>
                </div>

                <div className="absolute bottom-2 left-2 text-white text-shadow-md">Atlas {APP_DISPLAY_VERSION}</div>
                <div className="absolute bottom-2 right-2 text-white text-shadow-md">Copyright Ryno LLC. Do not distribute!</div>
            </>
        );
    };

    return (
        <div 
            className="absolute inset-0 flex flex-col items-center justify-center z-[200]"
        >
            {showBackground && (
                <MenuPanoramaBackground
                    backgroundMode={backgroundMode}
                    panoramaBackgroundDataUrl={panoramaBackgroundDataUrl}
                    panoramaFaceDataUrls={panoramaFaceDataUrls}
                    panoramaBlur={panoramaBlur}
                    panoramaGradient={panoramaGradient}
                    panoramaRotationSpeed={panoramaRotationSpeed}
                />
            )}
            {showSubmenuOverlay && <div className={`absolute inset-0 ${submenuOverlayClass} pointer-events-none`} />}
            {renderMenuContent()}

            {showTutorialPrompt && (
                <div className="absolute inset-0 z-[260] flex items-center justify-center bg-black/70">
                    <div className="w-[560px] bg-[#151515] border-2 border-white border-b-[#373737] border-r-[#373737] p-6">
                        <h2 className="text-white text-2xl font-bold text-shadow-md mb-2">First Time Here?</h2>
                        <p className="text-gray-200 font-minecraft text-sm leading-relaxed mb-6">
                            Atlas includes a built-in tutorial wiki for controls, mechanics, and core gameplay concepts.
                            Open it now?
                        </p>
                        <div className="flex gap-4 justify-center">
                            <MenuButton label="Yes, Show Tutorial" onClick={handleTutorialPromptAccept} width="w-[220px]" variant="primary" />
                            <MenuButton label="No, Thanks" onClick={handleTutorialPromptDecline} width="w-[220px]" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
