
import React, { useState, useEffect, useRef } from 'react';
import { soundManager } from '../../systems/sound/SoundManager';
import { musicController } from '../../systems/sound/MusicController';
import { SoundCategory } from '../../systems/sound/soundTypes';
import { MenuPanoramaBackground } from './MenuPanoramaBackground';
import { TUTORIAL_SECTIONS } from '../../data/tutorial';
import { MenuButton, MenuSlider } from './mainMenu/MainMenuControls';
import { SkinsMenu } from './SkinsMenu';
import { controlSettings, useControlSettings } from '../../systems/player/controlStore';
import { MAX_SENSITIVITY, MIN_SENSITIVITY } from '../../systems/player/controlSettings';
import { keyBindingStore, useKeyBindings } from '../../systems/player/keyBindingStore';
import {
    FIXED_BINDINGS, KEY_ACTIONS, KEY_ACTION_GROUPS, UNBINDABLE_CODES,
    bindingLabel, conflictsOf, isDefaultBinding, keyActionLabel, type KeyAction,
} from '../../systems/player/keyBindings';
import { graphicsSettings, useGraphicsSettings } from '../../systems/graphics/graphicsStore';
import { MAX_RENDER_DISTANCE } from '../../systems/world/farTerrain';
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
        <div className="flex flex-col items-center gap-3">
            <h1 className="atlas-title mb-3">{isMainMenu ? 'Options' : 'Game Menu'}</h1>

            <div className="flex w-[400px] flex-col items-center gap-3">
                {!isMainMenu && <MenuButton label="Back to Game" onClick={onResume} width="w-full" variant="primary" />}
                <div className="grid w-full grid-cols-2 gap-3">
                    <MenuButton label="Video Settings..." onClick={() => setScreen('video')} width="w-full" />
                    <MenuButton label="Music & Sounds..." onClick={() => setScreen('audio')} width="w-full" />
                    <div className={worldOptions ? undefined : 'col-span-2'}>
                        <MenuButton label="Skins..." onClick={() => setScreen('skins')} width="w-full" />
                    </div>
                    {worldOptions && <MenuButton label="World Options..." onClick={() => setScreen('world')} width="w-full" />}
                    <MenuButton label="Controls..." onClick={() => setScreen('controls')} width="w-full" />
                    <MenuButton label="Tutorial..." onClick={() => setScreen('tutorial')} width="w-full" />
                </div>
                {isMainMenu && onOpenPanorama && <MenuButton label="Menu Background..." onClick={onOpenPanorama} width="w-full" />}
                {!isMainMenu && <MenuButton label="Save and Quit to Title" onClick={onQuitToTitle} width="w-full" />}
                {isMainMenu && <MenuButton label="Done" onClick={onResume} width="w-full" />}
            </div>
        </div>
    );

    // Video Settings
    const renderVideo = () => (
        <div className="flex w-[652px] flex-col items-center gap-2">
            <h1 className="atlas-title mb-3">Video Settings</h1>

            {/* Quality presets. Changing any option below switches to Custom. */}
            <div className="mb-3 flex w-full flex-col items-center gap-1">
                <MenuButton
                    label={`Graphics: ${QUALITY_LABELS[graphics.quality]}`}
                    onClick={() => graphicsSettings.setPreset(nextPresetAfter(graphics.quality === 'custom' ? graphics.state.preset : graphics.quality))}
                    width="w-[652px]"
                />
                <p className="atlas-hint mb-2 text-center">
                    {graphics.quality === 'custom'
                        ? `Custom, based on ${QUALITY_LABELS[graphics.state.preset]}. Click to pick a preset again.`
                        : 'Low, Medium, High or Ultra. Changing an option below switches to Custom.'}
                </p>
                {/* A look, not a cost: it sits beside the presets and never makes them Custom. */}
                <MenuButton
                    label={`Visual Style: ${VISUAL_STYLE_LABELS[gfx.visualStyle]}`}
                    tooltip="Luminous is the new lighting, sky and effects; Classic is how Atlas looked before them"
                    onClick={() => graphicsSettings.setOption('visualStyle', gfx.visualStyle === 'classic' ? 'luminous' : 'classic')}
                    width="w-[652px]"
                />
                <p className="atlas-hint text-center">
                    {gfx.visualStyle === 'classic'
                        ? 'The original look: flat light, the old sky and fog, no glow or post effects.'
                        : 'Warm light, cool shadows, sky-matched haze and glow.'}
                </p>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
                <MenuSlider
                    label="Brightness"
                    value={brightness} min={0} max={1} step={0.05}
                    onChange={setBrightness} width="w-80"
                    formatValue={(v) => v === 0 ? 'Moody' : (v === 1 ? 'Bright' : `+${Math.round(v*100)}%`)}
                />
                <MenuSlider
                    label="Render Distance"
                    value={renderDistance} min={8} max={MAX_RENDER_DISTANCE} step={1}
                    onChange={setRenderDistance} width="w-80"
                    formatValue={(v) => `${v} Chunks`}
                />
                <MenuSlider
                    label="FOV"
                    value={fov} min={30} max={110} step={1}
                    onChange={setFov} width="w-80"
                    formatValue={(v) => v === 70 ? 'Normal' : v.toString()}
                />

                <MenuSlider
                    label="Max Framerate"
                    value={maxFps} min={10} max={260} step={10}
                    onChange={setMaxFps} width="w-80"
                    disabled={vsync}
                    formatValue={(v) => `${v} fps`}
                />
                <MCToggle label="VSync" value={vsync} onChange={setVsync} width="w-80" />

                <MenuButton
                    label={`Shadows: ${SHADOW_LABELS[gfx.shadows]}`}
                    onClick={() => graphicsSettings.setOption('shadows', nextInCycle(gfx.shadowStyle === 'pixel' ? PIXEL_SHADOW_CYCLE : SHADOW_CYCLE, gfx.shadows))}
                    width="w-80"
                />
                <MenuButton
                    label={`Shadow Style: ${SHADOW_STYLE_LABELS[gfx.shadowStyle]}`}
                    tooltip="Soft edges, or crisp shadows stepped on the same 16-pixel grid as the textures"
                    onClick={() => graphicsSettings.setOption('shadowStyle', gfx.shadowStyle === 'pixel' ? 'soft' : 'pixel')}
                    width="w-80"
                    disabled={gfx.shadows === 'off'}
                />
                <MCToggle
                    label="Clouds" value={gfx.clouds !== 'off'} width="w-80"
                    onChange={(on) => graphicsSettings.setOption('clouds', on ? presetCloudsOrFancy(graphics.state.preset) : 'off')}
                />
                <MCToggle label="Antialiasing" value={gfx.antialiasing !== 'off'} width="w-80"
                    onChange={(on) => graphicsSettings.setOption('antialiasing', on ? 'msaa' : 'off')} />
                <MenuButton
                    label={`Resolution: ${gfx.maxPixelRatio}x`}
                    tooltip="Highest pixel density the world renders at on high-DPI screens"
                    onClick={() => graphicsSettings.setOption('maxPixelRatio', nextInCycle(PIXEL_RATIO_CYCLE, gfx.maxPixelRatio))}
                    width="w-80"
                />
                <MCToggle label="Mipmaps" value={gfx.mipmaps} width="w-80"
                    onChange={(on) => graphicsSettings.setOption('mipmaps', on)} />
                <MCToggle label="Chunk Fade-In" value={gfx.chunkFade} width="w-80"
                    onChange={(on) => graphicsSettings.setOption('chunkFade', on)} />
                {/* Scene only: the 3D world blurs, the HUD never does. Enabled by Ultra. */}
                <MCToggle label="Motion Blur" value={gfx.motionBlur} width="w-80"
                    onChange={(on) => graphicsSettings.setOption('motionBlur', on)} />
                <MCToggle label="View Bobbing" value={gfx.viewBobbing} width="w-80"
                    onChange={(on) => graphicsSettings.setOption('viewBobbing', on)} />

            </div>

            <MenuButton label="Done" onClick={() => setScreen('main')} width="w-80" />
        </div>
    );

    // Audio Settings
    const renderAudio = () => (
        <div className="flex w-[652px] flex-col items-center gap-2">
            <h1 className="atlas-title mb-3">Music &amp; Sounds</h1>

            <div className="mb-3 grid grid-cols-2 gap-3">
                <MenuSlider
                    label="Master Volume"
                    value={volumes.master} min={0} max={1}
                    onChange={(v) => updateVolume('master', v)} width="w-80"
                />
                <MenuSlider
                    label="Music Delay"
                    value={musicDelay} min={0} max={300} step={5}
                    onChange={updateMusicDelay} width="w-80"
                    formatValue={(v) => `${v}s`}
                />
            </div>

            <div className="mb-3 flex justify-center">
                <MCToggle label="Slow Music at Night" value={nightSlowdown} onChange={updateNightSlowdown} width="w-80" />
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3">
                {/* Each slider names what its category actually plays: 'ambient' is
                    lava and Vault events (there is no weather), 'ui' the menus and
                    HUD. Nothing plays as 'neutral' yet, so it has no slider. */}
                <MenuSlider label="Music" value={volumes.music} min={0} max={1} onChange={(v) => updateVolume('music', v)} width="w-80" />
                <MenuSlider label="Ambient & Events" value={volumes.ambient} min={0} max={1} onChange={(v) => updateVolume('ambient', v)} width="w-80" />
                <MenuSlider label="Blocks" value={volumes.blocks} min={0} max={1} onChange={(v) => updateVolume('blocks', v)} width="w-80" />
                <MenuSlider label="Enemies & Bosses" value={volumes.hostile} min={0} max={1} onChange={(v) => updateVolume('hostile', v)} width="w-80" />
                <MenuSlider label="Player" value={volumes.player} min={0} max={1} onChange={(v) => updateVolume('player', v)} width="w-80" />
                <MenuSlider label="Interface" value={volumes.ui} min={0} max={1} onChange={(v) => updateVolume('ui', v)} width="w-80" />
            </div>

            <MenuButton label="Done" onClick={() => setScreen('main')} width="w-80" />
        </div>
    );

    // Controls: mouse look settings, then every key the game listens for.
    const renderControls = () => (
        <div className="flex w-[760px] flex-col items-center gap-2">
            <h1 className="atlas-title mb-3">Controls</h1>

            <div className="mb-3 grid grid-cols-2 gap-3">
                <MenuSlider
                    label="Mouse Sensitivity"
                    value={controls.sensitivity} min={MIN_SENSITIVITY} max={MAX_SENSITIVITY} step={0.05}
                    onChange={(v) => controlSettings.set({ sensitivity: v })} width="w-80"
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                />
                <MCToggle label="Invert Mouse" value={controls.invertY} onChange={(on) => controlSettings.set({ invertY: on })} width="w-80" />
            </div>

            <div className="atlas-well mb-4 max-h-[360px] w-full overflow-y-auto px-4 py-3 scrollbar-thin">
                {KEY_ACTION_GROUPS.map((group) => (
                    <div key={group} className="mb-4">
                        <h2 className="atlas-heading mb-1">{group}</h2>
                        {KEY_ACTIONS.filter((action) => action.group === group).map((action) => {
                            const conflicts = conflictsOf(keys.bindings, action.id);
                            const waiting = listening === action.id;
                            return (
                                <div key={action.id} className="flex items-center justify-between gap-4 py-[2px]">
                                    <span
                                        className={`truncate text-px-2 text-shadow-md ${conflicts.length > 0 ? 'text-ember-300' : 'text-parchment-100'}`}
                                        data-tip={conflicts.length > 0 ? `Also bound to ${conflicts.map(keyActionLabel).join(', ')}` : undefined}
                                    >
                                        {action.label}
                                    </span>
                                    <div className="flex shrink-0 gap-2">
                                        <MenuButton
                                            small
                                            width="w-[280px]"
                                            pressed={waiting}
                                            label={waiting ? '> Press a key <' : bindingLabel(keys.bindings, action.id, keys.layout)}
                                            onClick={() => setListening(waiting ? null : action.id)}
                                        />
                                        <MenuButton
                                            small
                                            width="w-[92px]"
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
                    <h2 className="atlas-heading mb-1">Mouse &amp; Menus</h2>
                    {FIXED_BINDINGS.map(([key, action]) => (
                        <div key={key} className="flex items-baseline justify-between gap-6 py-[3px]">
                            <span className="text-px-2 text-parchment-100 text-shadow-md">{action}</span>
                            <span className="text-right text-px-2 text-parchment-400">{key}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <MenuButton label="Reset All Keys" onClick={() => { setListening(null); keyBindingStore.resetAll(); }} width="w-80" />
                <MenuButton label="Done" onClick={() => setScreen('main')} width="w-80" />
            </div>
        </div>
    );

    // World Options: this world's rules, and its seed to share.
    const renderWorld = () => worldOptions && (
        <div className="flex w-[480px] flex-col items-center gap-2">
            <h1 className="atlas-title">World Options</h1>
            <p className="mb-4 text-px-2 text-parchment-300 text-shadow-md">{worldOptions.name}</p>

            <MCToggle label="Allow Commands" value={worldOptions.allowCommands} onChange={worldOptions.onAllowCommands} width="w-[400px]" />
            <p className="atlas-hint mb-3 w-[400px] text-center">
                Cheat commands like /gamemode, /giveitem and /tp. /help, /sound and /music always work.
            </p>

            <MCToggle label="Keep Inventory" value={worldOptions.keepInventory} onChange={worldOptions.onKeepInventory} width="w-[400px]" />
            <p className="atlas-hint mb-3 w-[400px] text-center">
                Keep your items and armor when you die.
            </p>

            <MCToggle label="Show Coordinates" value={worldOptions.showCoordinates} onChange={worldOptions.onShowCoordinates} width="w-[400px]" />
            <p className="atlas-hint mb-3 w-[400px] text-center">
                Show your position in the corner of the screen.
            </p>

            <p className="mb-4 w-[400px] select-text text-center text-px-2 text-parchment-300 text-shadow-md">
                Seed: <span className="text-parchment-50">{worldOptions.seed}</span>
            </p>

            <MenuButton label="Done" onClick={() => setScreen('main')} width="w-80" />
        </div>
    );

    const renderTutorial = () => {
        const activeSection = TUTORIAL_SECTIONS.find((section) => section.id === tutorialTab) || TUTORIAL_SECTIONS[0];

        return (
            <div className="flex w-[900px] max-w-[calc(100vw-4rem)] flex-col items-center gap-2">
                <h1 className="atlas-title mb-2">Tutorial</h1>

                <div className="mb-2 grid w-full grid-cols-3 gap-2" role="tablist" aria-label="Tutorial sections">
                    {TUTORIAL_SECTIONS.map((section) => (
                        <MenuButton
                            key={section.id}
                            label={section.title}
                            onClick={() => setTutorialTab(section.id)}
                            pressed={section.id === activeSection.id}
                            width="w-full"
                            small
                        />
                    ))}
                </div>

                <div key={tutorialTab} className="atlas-well mb-4 max-h-[380px] w-full overflow-y-auto px-5 py-4 scrollbar-thin atlas-fade-in">
                    <h2 className="atlas-heading">{activeSection.title}</h2>
                    <p className="mb-3 text-read text-parchment-400">{activeSection.subtitle}</p>

                    <div className="mb-4 space-y-3">
                        {activeSection.paragraphs.map((paragraph) => (
                            <p key={paragraph} className="text-read text-parchment-100">{paragraph}</p>
                        ))}
                    </div>

                    <div className="border-t-2 border-ink-600 pt-3">
                        <h3 className="atlas-heading mb-2">Highlights</h3>
                        <ul className="list-disc space-y-1 pl-5 marker:text-brass-400">
                            {activeSection.bullets.map((bullet) => (
                                <li key={bullet} className="text-read text-parchment-200">{bullet}</li>
                            ))}
                        </ul>
                    </div>
                </div>

                <p className="atlas-hint mb-2">You can always come back here through Options &gt; Tutorial.</p>
                <MenuButton label="Done" onClick={() => onTutorialClose ? onTutorialClose() : setScreen('main')} width="w-80" />
            </div>
        );
    };

    return (
        <div
            className={`absolute inset-0 z-50 flex items-center justify-center pointer-events-auto ${!isMainMenu ? 'bg-ink-950/55 backdrop-blur-[2px] atlas-fade-in' : ''}`}
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
            {showMainMenuSubmenuOverlay && <div className="absolute inset-0 bg-ink-950/55 pointer-events-none" />}

            {/* One framed panel; each screen fades in as you move between them. */}
            <div className="atlas-panel flex max-h-[calc(100vh-2rem)] flex-col items-center atlas-panel-in">
                <div key={screen} className={`relative z-10 flex flex-col items-center overflow-y-auto atlas-fade-in ${screen === 'skins' ? 'p-5' : 'px-10 pb-7 pt-5'}`}>
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
