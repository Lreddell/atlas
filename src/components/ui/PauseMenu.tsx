
import React, { useState, useEffect, useRef } from 'react';
import { soundManager } from '../../systems/sound/SoundManager';
import { musicController } from '../../systems/sound/MusicController';
import { SoundCategory } from '../../systems/sound/soundTypes';
import { MenuPanoramaBackground } from './MenuPanoramaBackground';
import { TUTORIAL_SECTIONS } from '../../data/tutorial';
import { MenuButton } from './mainMenu/MainMenuControls';
import { SkinsMenu } from './SkinsMenu';
import { controlSettings, useControlSettings } from '../../systems/player/controlStore';
import { MAX_SENSITIVITY, MIN_SENSITIVITY } from '../../systems/player/controlSettings';
import { keyBindingStore, useKeyBindings } from '../../systems/player/keyBindingStore';
import {
    FIXED_BINDINGS, KEY_ACTIONS, KEY_ACTION_GROUPS, UNBINDABLE_CODES,
    bindingLabel, conflictsOf, isDefaultBinding, keyActionLabel, type KeyAction,
} from '../../systems/player/keyBindings';
import { graphicsSettings, useGraphicsSettings } from '../../systems/graphics/graphicsStore';
import {
    GRAPHICS_PRESET_ORDER, GRAPHICS_PRESETS,
    type CloudQuality, type GraphicsConfig, type GraphicsPresetId, type GraphicsQuality, type ShadowQuality,
    type ShadowStyle, type VisualStyle,
} from '../../systems/graphics/graphicsSettings';

const TUTORIAL_SCREEN_SEEN_KEY = 'atlas.tutorial.screenSeen.v2';

const QUALITY_LABELS: Record<GraphicsQuality, string> = {
    low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra', custom: 'Custom',
};
const SHADOW_LABELS: Record<ShadowQuality, string> = { off: 'OFF', low: 'Low', medium: 'Medium', high: 'High' };
const SHADOW_CYCLE: readonly ShadowQuality[] = ['off', 'low', 'medium', 'high'];
const PIXEL_SHADOW_CYCLE: readonly ShadowQuality[] = ['off', 'low'];
const PIXEL_RATIO_CYCLE: readonly GraphicsConfig['maxPixelRatio'][] = [1, 1.5, 2];
const VISUAL_STYLE_LABELS: Record<VisualStyle, string> = { luminous: 'Luminous', classic: 'Classic' };
const SHADOW_STYLE_LABELS: Record<ShadowStyle, string> = { soft: 'Soft', pixel: 'Pixel' };

const nextInCycle = <T,>(cycle: readonly T[], current: T): T => cycle[(cycle.indexOf(current) + 1) % cycle.length];
const nextPresetAfter = (preset: GraphicsPresetId): GraphicsPresetId => nextInCycle(GRAPHICS_PRESET_ORDER, preset);
/** Turning clouds back on restores the preset's cloud quality. */
const presetCloudsOrFancy = (preset: GraphicsPresetId): CloudQuality =>
    GRAPHICS_PRESETS[preset].clouds === 'off' ? 'fancy' : GRAPHICS_PRESETS[preset].clouds;

interface PauseMenuProps {
    onResume: () => void;
    onQuitToTitle?: () => void; // Callback for quitting to title
    renderDistance: number;
    setRenderDistance: (dist: number) => void;
    fov: number;
    setFov: (fov: number) => void;
    maxFps: number;
    setMaxFps: (val: number) => void;
    vsync: boolean;
    setVsync: (val: boolean) => void;
    brightness: number;
    setBrightness: (val: number) => void;
    panoramaBlur: number;
    panoramaGradient: number;
    panoramaRotationSpeed: number;
    backgroundMode: 'dirt' | 'panorama';
    panoramaBackgroundDataUrl: string | null;
    panoramaFaceDataUrls?: string[] | null;
    isMainMenu?: boolean;
    showMenuBackground?: boolean;
    initialScreen?: 'main' | 'video' | 'audio' | 'controls' | 'skins' | 'tutorial';
    onTutorialClose?: () => void;
    /** The open world's rules, shown in-game as World Options. */
    worldOptions?: WorldOptions;
    /** From the title screen: open the menu background (panorama) settings. */
    onOpenPanorama?: () => void;
}

export interface WorldOptions {
    name: string;
    seed: string;
    gameMode: 'survival' | 'creative' | 'spectator';
    allowCommands: boolean;
    onAllowCommands: (on: boolean) => void;
    keepInventory: boolean;
    onKeepInventory: (on: boolean) => void;
    showCoordinates: boolean;
    onShowCoordinates: (on: boolean) => void;
}

type MenuScreen = 'main' | 'video' | 'audio' | 'controls' | 'skins' | 'tutorial' | 'world';

// Menu Slider Component
const MenuSlider: React.FC<{
    label: string;
    value: number; // 0 to 1 usually, or range
    min: number;
    max: number;
    step?: number;
    onChange: (val: number) => void;
    width?: string;
    formatValue?: (val: number) => string;
    disabled?: boolean;
}> = ({ label, value, min, max, step = 0.01, onChange, width = 'w-96', formatValue, disabled = false }) => {
    
    const percentage = ((value - min) / (max - min)) * 100;
    
    return (
        <div 
            className={`
                ${width} h-10 relative bg-[#000000] border-2 border-white border-b-[#373737] border-r-[#373737] select-none
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
            onMouseDown={(e) => { if (!disabled) e.stopPropagation(); }}
            onMouseUp={(e) => { 
                e.stopPropagation(); 
                if(!disabled) soundManager.play("ui.slider"); 
            }}
        >
            {/* Range Input (Invisible but handles interaction) */}
            <input 
                type="range"
                min={min} max={max} step={step}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer disabled:cursor-not-allowed"
            />
            
            {/* Visual Button Face (Draggable part) */}
            <div className="absolute inset-0 bg-[#8b8b8b] border border-[#555] pointer-events-none">
                <div 
                    className="absolute top-0 bottom-0 bg-[#a0a0a0] border-r-2 border-black/20"
                    style={{ width: `${percentage}%` }}
                />
            </div>

            {/* Text Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 text-white font-pixel text-shadow-md">
                {label}: {formatValue ? formatValue(value) : Math.round(percentage) + '%'}
            </div>
        </div>
    );
};

// Checkbox simulation (Toggle Button)
const MCToggle: React.FC<{
    label: string;
    value: boolean;
    onChange: (val: boolean) => void;
    width?: string;
}> = ({ label, value, onChange, width = 'w-72' }) => (
    <MenuButton 
        label={`${label}: ${value ? 'ON' : 'OFF'}`} 
        onClick={() => onChange(!value)}
        width={width}
    />
);

export const PauseMenu: React.FC<PauseMenuProps> = ({ 
    onResume, onQuitToTitle, renderDistance, setRenderDistance, fov, setFov,
    maxFps, setMaxFps, vsync, setVsync,
    brightness, setBrightness,
    panoramaBlur,
    panoramaGradient,
    panoramaRotationSpeed,
    backgroundMode,
    panoramaBackgroundDataUrl,
    panoramaFaceDataUrls,
    isMainMenu = false,
    showMenuBackground = true,
    initialScreen = 'main',
    onTutorialClose,
    worldOptions,
    onOpenPanorama,
}) => {
    const [screen, setScreen] = useState<MenuScreen>(initialScreen);
    const graphics = useGraphicsSettings();
    const gfx = graphics.config;
    const controls = useControlSettings();
    const keys = useKeyBindings();
    // The action waiting for a key press on the Controls screen, if any.
    const [listening, setListening] = useState<KeyAction | null>(null);
    const listeningRef = useRef<KeyAction | null>(null);
    listeningRef.current = listening;
    const [tutorialTab, setTutorialTab] = useState(() => TUTORIAL_SECTIONS[0]?.id ?? 'concept');
    const showMainMenuSubmenuOverlay = isMainMenu && screen !== 'main';
    
    // Audio State
    const [volumes, setVolumes] = useState<Record<string, number>>({
        master: 1.0,
        music: 1.0,
        ambient: 1.0,
        blocks: 1.0,
        player: 1.0,
        ui: 1.0,
        hostile: 1.0,
        neutral: 1.0
    });
    
    const [musicDelay, setMusicDelay] = useState(() => musicController.getDelayRange().min);
    const [nightSlowdown, setNightSlowdown] = useState(() => musicController.getNightSlowdownEnabled());

    useEffect(() => {
        // Load initial volumes
        const newVols = {} as typeof volumes;
        (['master', 'music', 'ambient', 'blocks', 'player', 'ui', 'hostile', 'neutral'] as const).forEach(cat => {
            newVols[cat] = soundManager.getVolume(cat);
        });
        setVolumes(newVols);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (screen === 'tutorial') {
            window.localStorage.setItem(TUTORIAL_SCREEN_SEEN_KEY, 'true');
        }
    }, [screen]);

    useEffect(() => {
        if (screen === 'main') return;
        const handleSubmenuEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            // Esc while a key is being bound cancels the binding, not the screen.
            if (listeningRef.current) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (screen === 'tutorial' && onTutorialClose) onTutorialClose();
            else setScreen('main');
        };
        window.addEventListener('keydown', handleSubmenuEscape, true);
        return () => window.removeEventListener('keydown', handleSubmenuEscape, true);
    }, [onTutorialClose, screen]);

    // Binding a key: the next key pressed becomes the action's key. Esc cancels.
    useEffect(() => {
        if (!listening) return;
        const onKey = (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.code === 'Escape') { setListening(null); return; }
            if (UNBINDABLE_CODES.has(event.code)) return;
            keyBindingStore.bind(listening, event.code);
            soundManager.play('ui.click');
            setListening(null);
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [listening]);

    useEffect(() => { if (screen !== 'controls') setListening(null); }, [screen]);

    const updateVolume = (cat: string, val: number) => {
        setVolumes(p => ({...p, [cat]: val}));
        soundManager.setVolume(cat as SoundCategory | 'master', val);
    };
    
    const updateMusicDelay = (val: number) => {
        setMusicDelay(val);
        // Keep configured and displayed delay values aligned.
        musicController.setDelayRange(val, val);
    };

    const updateNightSlowdown = (val: boolean) => {
        setNightSlowdown(val);
        musicController.setNightSlowdownEnabled(val);
    };

    // Main Menu
    const renderMain = () => (
        <div className="flex flex-col gap-3 items-center">
            <h1 className="text-white text-xl mb-4 font-bold font-pixel text-shadow-lg">{isMainMenu ? 'Options' : 'Game Menu'}</h1>
            
            <div className="flex flex-col gap-3 w-full items-center">
                {!isMainMenu && <MenuButton label="Back to Game" onClick={onResume} width="w-80" />}
                <div className="flex gap-3">
                    <MenuButton label="Video Settings..." onClick={() => setScreen('video')} width="w-[9.5rem]" />
                    <MenuButton label="Music & Sounds..." onClick={() => setScreen('audio')} width="w-[9.5rem]" />
                </div>
                {worldOptions ? (
                    <div className="flex gap-3">
                        <MenuButton label="Skins..." onClick={() => setScreen('skins')} width="w-[9.5rem]" />
                        <MenuButton label="World Options..." onClick={() => setScreen('world')} width="w-[9.5rem]" />
                    </div>
                ) : (
                    <MenuButton label="Skins..." onClick={() => setScreen('skins')} width="w-80" />
                )}
                <div className="flex gap-3">
                    <MenuButton label="Controls..." onClick={() => setScreen('controls')} width="w-[9.5rem]" />
                    <MenuButton label="Tutorial..." onClick={() => setScreen('tutorial')} width="w-[9.5rem]" />
                </div>
                {isMainMenu && onOpenPanorama && <MenuButton label="Menu Background..." onClick={onOpenPanorama} width="w-80" />}
                {!isMainMenu && <MenuButton label="Save and Quit to Title" onClick={onQuitToTitle} width="w-80" />}
                {isMainMenu && <MenuButton label="Done" onClick={onResume} width="w-80" />}
            </div>
        </div>
    );

    // Video Settings
    const renderVideo = () => (
        <div className="flex flex-col gap-2 items-center w-[600px]">
            <h1 className="text-white text-xl mb-4 font-bold font-pixel text-shadow-lg">Video Settings</h1>

            {/* Quality presets. Changing any option below switches to Custom. */}
            <div className="flex flex-col items-center gap-1 mb-3">
                <MenuButton
                    label={`Graphics: ${QUALITY_LABELS[graphics.quality]}`}
                    onClick={() => graphicsSettings.setPreset(nextPresetAfter(graphics.quality === 'custom' ? graphics.state.preset : graphics.quality))}
                    width="w-[33rem]"
                />
                <p className="text-xs font-pixel text-gray-300 text-shadow-md">
                    {graphics.quality === 'custom'
                        ? `Custom, based on ${QUALITY_LABELS[graphics.state.preset]}. Click to pick a preset again.`
                        : 'Low, Medium, High or Ultra. Changing an option below switches to Custom.'}
                </p>
                {/* A look, not a cost: it sits beside the presets and never makes them Custom. */}
                <MenuButton
                    label={`Visual Style: ${VISUAL_STYLE_LABELS[gfx.visualStyle]}`}
                    tooltip="Luminous is the new lighting, sky and effects; Classic is how Atlas looked before them"
                    onClick={() => graphicsSettings.setOption('visualStyle', gfx.visualStyle === 'classic' ? 'luminous' : 'classic')}
                    width="w-[33rem]"
                />
                <p className="text-xs font-pixel text-gray-300 text-shadow-md">
                    {gfx.visualStyle === 'classic'
                        ? 'The original look: flat light, the old sky and fog, no glow or post effects.'
                        : 'Warm light, cool shadows, sky-matched haze and glow.'}
                </p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
                <MenuSlider 
                    label="Brightness" 
                    value={brightness} min={0} max={1} step={0.05} 
                    onChange={setBrightness} width="w-64"
                    formatValue={(v) => v === 0 ? 'Moody' : (v === 1 ? 'Bright' : `+${Math.round(v*100)}%`)}
                />
                <MenuSlider 
                    label="Render Distance" 
                    value={renderDistance} min={4} max={48} step={1} 
                    onChange={setRenderDistance} width="w-64"
                    formatValue={(v) => `${v} Chunks`}
                />
                <MenuSlider 
                    label="FOV" 
                    value={fov} min={30} max={110} step={1} 
                    onChange={setFov} width="w-64"
                    formatValue={(v) => v === 70 ? 'Normal' : v.toString()}
                />
                
                <MenuSlider 
                    label="Max Framerate" 
                    value={maxFps} min={10} max={260} step={10}
                    onChange={setMaxFps} width="w-64"
                    disabled={vsync}
                    formatValue={(v) => `${v} fps`}
                />
                <MCToggle label="VSync" value={vsync} onChange={setVsync} width="w-64" />

                <MenuButton
                    label={`Shadows: ${SHADOW_LABELS[gfx.shadows]}`}
                    onClick={() => graphicsSettings.setOption('shadows', nextInCycle(gfx.shadowStyle === 'pixel' ? PIXEL_SHADOW_CYCLE : SHADOW_CYCLE, gfx.shadows))}
                    width="w-64"
                />
                <MenuButton
                    label={`Shadow Style: ${SHADOW_STYLE_LABELS[gfx.shadowStyle]}`}
                    tooltip="Soft edges, or crisp shadows stepped on the same 16-pixel grid as the textures"
                    onClick={() => graphicsSettings.setOption('shadowStyle', gfx.shadowStyle === 'pixel' ? 'soft' : 'pixel')}
                    width="w-64"
                    disabled={gfx.shadows === 'off'}
                />
                <MCToggle
                    label="Clouds" value={gfx.clouds !== 'off'} width="w-64"
                    onChange={(on) => graphicsSettings.setOption('clouds', on ? presetCloudsOrFancy(graphics.state.preset) : 'off')}
                />
                <MCToggle label="Antialiasing" value={gfx.antialiasing !== 'off'} width="w-64"
                    onChange={(on) => graphicsSettings.setOption('antialiasing', on ? 'msaa' : 'off')} />
                <MenuButton
                    label={`Resolution: ${gfx.maxPixelRatio}x`}
                    tooltip="Highest pixel density the world renders at on high-DPI screens"
                    onClick={() => graphicsSettings.setOption('maxPixelRatio', nextInCycle(PIXEL_RATIO_CYCLE, gfx.maxPixelRatio))}
                    width="w-64"
                />
                <MCToggle label="Mipmaps" value={gfx.mipmaps} width="w-64"
                    onChange={(on) => graphicsSettings.setOption('mipmaps', on)} />
                <MCToggle label="Chunk Fade-In" value={gfx.chunkFade} width="w-64"
                    onChange={(on) => graphicsSettings.setOption('chunkFade', on)} />
                {/* Scene only: the 3D world blurs, the HUD never does. Enabled by Ultra. */}
                <MCToggle label="Motion Blur" value={gfx.motionBlur} width="w-64"
                    onChange={(on) => graphicsSettings.setOption('motionBlur', on)} />
                <MCToggle label="View Bobbing" value={gfx.viewBobbing} width="w-64"
                    onChange={(on) => graphicsSettings.setOption('viewBobbing', on)} />

            </div>

            <MenuButton label="Done" onClick={() => setScreen('main')} width="w-64" />
        </div>
    );

    // Audio Settings
    const renderAudio = () => (
        <div className="flex flex-col gap-2 items-center w-[600px]">
            <h1 className="text-white text-xl mb-4 font-bold font-pixel text-shadow-lg">Music & Sounds</h1>
            
            <div className="mb-4 flex gap-4">
                <MenuSlider 
                    label="Master Volume" 
                    value={volumes.master} min={0} max={1} 
                    onChange={(v) => updateVolume('master', v)} width="w-64"
                />
                <MenuSlider
                    label="Music Delay"
                    value={musicDelay} min={0} max={300} step={5}
                    onChange={updateMusicDelay} width="w-64"
                    formatValue={(v) => `${v}s`}
                />
            </div>

            <div className="mb-4 flex gap-4 justify-center">
                <MCToggle label="Slow Music at Night" value={nightSlowdown} onChange={updateNightSlowdown} width="w-64" />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
                {/* Each slider names what its category actually plays: 'ambient' is
                    lava and Vault events (there is no weather), 'ui' the menus and
                    HUD. Nothing plays as 'neutral' yet, so it has no slider. */}
                <MenuSlider label="Music" value={volumes.music} min={0} max={1} onChange={(v) => updateVolume('music', v)} width="w-64" />
                <MenuSlider label="Ambient & Events" value={volumes.ambient} min={0} max={1} onChange={(v) => updateVolume('ambient', v)} width="w-64" />
                <MenuSlider label="Blocks" value={volumes.blocks} min={0} max={1} onChange={(v) => updateVolume('blocks', v)} width="w-64" />
                <MenuSlider label="Enemies & Bosses" value={volumes.hostile} min={0} max={1} onChange={(v) => updateVolume('hostile', v)} width="w-64" />
                <MenuSlider label="Player" value={volumes.player} min={0} max={1} onChange={(v) => updateVolume('player', v)} width="w-64" />
                <MenuSlider label="Interface" value={volumes.ui} min={0} max={1} onChange={(v) => updateVolume('ui', v)} width="w-64" />
            </div>

            <MenuButton label="Done" onClick={() => setScreen('main')} width="w-64" />
        </div>
    );

    // Controls: mouse look settings, then every key the game listens for.
    const renderControls = () => (
        <div className="flex flex-col gap-2 items-center w-[640px]">
            <h1 className="text-white text-xl mb-4 font-bold font-pixel text-shadow-lg">Controls</h1>

            <div className="mb-3 flex gap-4">
                <MenuSlider
                    label="Mouse Sensitivity"
                    value={controls.sensitivity} min={MIN_SENSITIVITY} max={MAX_SENSITIVITY} step={0.05}
                    onChange={(v) => controlSettings.set({ sensitivity: v })} width="w-64"
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                />
                <MCToggle label="Invert Mouse" value={controls.invertY} onChange={(on) => controlSettings.set({ invertY: on })} width="w-64" />
            </div>

            <div className="w-full max-h-[340px] overflow-y-auto bg-black/35 border-2 border-white/20 px-4 py-3 mb-4">
                {KEY_ACTION_GROUPS.map((group) => (
                    <div key={group} className="mb-3">
                        <h2 className="text-blue-200 text-sm font-pixel mb-1">{group}</h2>
                        {KEY_ACTIONS.filter((action) => action.group === group).map((action) => {
                            const conflicts = conflictsOf(keys.bindings, action.id);
                            const waiting = listening === action.id;
                            return (
                                <div key={action.id} className="flex items-center justify-between gap-4 py-[2px]">
                                    <span
                                        className={`text-sm font-pixel ${conflicts.length > 0 ? 'text-red-300' : 'text-gray-100'}`}
                                        title={conflicts.length > 0 ? `Also bound to ${conflicts.map(keyActionLabel).join(', ')}` : undefined}
                                    >
                                        {action.label}
                                    </span>
                                    <div className="flex shrink-0 gap-2">
                                        <MenuButton
                                            small
                                            width="w-44"
                                            pressed={waiting}
                                            label={waiting ? '> Press a key <' : bindingLabel(keys.bindings, action.id, keys.layout)}
                                            onClick={() => setListening(waiting ? null : action.id)}
                                        />
                                        <MenuButton
                                            small
                                            width="w-16"
                                            label="Reset"
                                            disabled={isDefaultBinding(keys.bindings, action.id)}
                                            onClick={() => keyBindingStore.reset(action.id)}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
                <div>
                    <h2 className="text-blue-200 text-sm font-pixel mb-1">Mouse & Menus</h2>
                    {FIXED_BINDINGS.map(([key, action]) => (
                        <div key={key} className="flex items-baseline justify-between gap-6 py-[3px]">
                            <span className="text-gray-100 text-sm font-pixel">{action}</span>
                            <span className="text-right text-gray-400 text-sm font-pixel">{key}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex gap-3">
                <MenuButton label="Reset All Keys" onClick={() => { setListening(null); keyBindingStore.resetAll(); }} width="w-64" />
                <MenuButton label="Done" onClick={() => setScreen('main')} width="w-64" />
            </div>
        </div>
    );

    // World Options: this world's rules, and its seed to share.
    const renderWorld = () => worldOptions && (
        <div className="flex flex-col gap-2 items-center w-[480px]">
            <h1 className="text-white text-xl mb-1 font-bold font-pixel text-shadow-lg">World Options</h1>
            <p className="mb-4 text-sm font-pixel text-gray-300 text-shadow-md">{worldOptions.name}</p>

            <MCToggle label="Allow Commands" value={worldOptions.allowCommands} onChange={worldOptions.onAllowCommands} width="w-80" />
            <p className="mb-3 w-80 text-center text-xs font-pixel text-gray-400 text-shadow-md">
                Cheat commands like /gamemode, /giveitem and /tp. /help, /sound and /music always work.
            </p>

            <MCToggle label="Keep Inventory" value={worldOptions.keepInventory} onChange={worldOptions.onKeepInventory} width="w-80" />
            <p className="mb-3 w-80 text-center text-xs font-pixel text-gray-400 text-shadow-md">
                Keep your items and armor when you die.
            </p>

            <MCToggle label="Show Coordinates" value={worldOptions.showCoordinates} onChange={worldOptions.onShowCoordinates} width="w-80" />
            <p className="mb-3 w-80 text-center text-xs font-pixel text-gray-400 text-shadow-md">
                Show your position in the corner of the screen.
            </p>

            <p className="mb-4 w-80 select-text text-center text-xs font-pixel text-gray-300 text-shadow-md">
                Seed: <span className="text-white">{worldOptions.seed}</span>
            </p>

            <MenuButton label="Done" onClick={() => setScreen('main')} width="w-64" />
        </div>
    );

    const renderTutorial = () => {
        const activeSection = TUTORIAL_SECTIONS.find((section) => section.id === tutorialTab) || TUTORIAL_SECTIONS[0];

        return (
            <div className="flex flex-col gap-2 items-center w-[820px]">
                <h1 className="text-white text-xl mb-2 font-bold font-pixel text-shadow-lg">Tutorial</h1>

                <div className="w-full bg-black/40 border-2 border-white/20 mb-2 p-2 text-xs text-gray-300 font-pixel">
                    Tutorial wiki. You can always return here through Options &gt; Tutorial.
                </div>

                <div className="w-full flex flex-wrap justify-center gap-2 mb-2">
                    {TUTORIAL_SECTIONS.map((section) => (
                        <MenuButton
                            key={section.id}
                            label={section.title}
                            onClick={() => setTutorialTab(section.id)}
                            width="w-[152px]"
                        />
                    ))}
                </div>

                <div key={tutorialTab} className="w-full max-h-[360px] overflow-y-auto bg-black/35 border-2 border-white/20 p-4 mb-4 atlas-fade-in">
                    <h2 className="text-white text-lg font-bold font-pixel text-shadow-md mb-1">{activeSection.title}</h2>
                    <p className="text-blue-200 text-sm font-pixel mb-3">{activeSection.subtitle}</p>

                    <div className="space-y-3 mb-4">
                        {activeSection.paragraphs.map((paragraph) => (
                            <p key={paragraph} className="text-gray-100 text-sm leading-relaxed font-pixel">{paragraph}</p>
                        ))}
                    </div>

                    <div className="border-t border-white/15 pt-3">
                        <h3 className="text-white text-sm font-bold mb-2 font-pixel">Highlights</h3>
                        <ul className="space-y-1 pl-4 list-disc">
                            {activeSection.bullets.map((bullet) => (
                                <li key={bullet} className="text-gray-200 text-sm font-pixel">{bullet}</li>
                            ))}
                        </ul>
                    </div>
                </div>

                <MenuButton label="Done" onClick={() => onTutorialClose ? onTutorialClose() : setScreen('main')} width="w-64" />
            </div>
        );
    };

    return (
        <div 
            className={`absolute inset-0 z-50 flex items-center justify-center pointer-events-auto ${!isMainMenu ? 'bg-[#000000a0] backdrop-blur-[2px] atlas-fade-in' : ''}`}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
        >
            {isMainMenu && showMenuBackground && (
                <MenuPanoramaBackground
                    backgroundMode={backgroundMode}
                    panoramaBackgroundDataUrl={panoramaBackgroundDataUrl}
                    panoramaFaceDataUrls={panoramaFaceDataUrls}
                    panoramaBlur={panoramaBlur}
                    panoramaGradient={panoramaGradient}
                    panoramaRotationSpeed={panoramaRotationSpeed}
                />
            )}
            {showMainMenuSubmenuOverlay && <div className="absolute inset-0 bg-black/60 pointer-events-none" />}
            <style>{`
                .text-shadow-lg { text-shadow: 2px 2px 0px #3f3f3f; }
                .text-shadow-md { text-shadow: 1px 1px 0px #3f3f3f; }
            `}</style>
            
            {/* Dirt Background Container only if NOT Main Menu (pause menu style) */}
            <div className="relative flex flex-col items-center p-2 atlas-panel-in">
                {!isMainMenu && <div className="absolute inset-0 bg-[#151515] opacity-90 border-2 border-white/10" />}

                {/* Each screen fades in as you move between them. */}
                <div key={screen} className={`relative z-10 flex flex-col items-center atlas-fade-in ${screen === 'skins' ? 'p-4' : 'py-6 px-10 min-w-[400px]'}`}>
                    {screen === 'main' && renderMain()}
                    {screen === 'video' && renderVideo()}
                    {screen === 'audio' && renderAudio()}
                    {screen === 'controls' && renderControls()}
                    {screen === 'world' && renderWorld()}
                    {screen === 'skins' && <SkinsMenu onDone={() => setScreen('main')} />}
                    {screen === 'tutorial' && renderTutorial()}
                </div>
            </div>
        </div>
    );
};
