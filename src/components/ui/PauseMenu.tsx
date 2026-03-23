
import React, { useState, useEffect, useRef } from 'react';
import { soundManager } from '../../systems/sound/SoundManager';
import { musicController } from '../../systems/sound/MusicController';
import { SoundCategory } from '../../systems/sound/soundTypes';
import { setCloudTexture } from '../world/cloudState';
import { MenuPanoramaBackground } from './MenuPanoramaBackground';
import { TUTORIAL_SECTIONS } from '../../data/tutorial';
import { MenuButton } from './mainMenu/MainMenuControls';

const TUTORIAL_SCREEN_SEEN_KEY = 'atlas.tutorial.screenSeen.v2';

interface PauseMenuProps {
    onResume: () => void;
    onQuitToTitle?: () => void; // Callback for quitting to title
    renderDistance: number;
    setRenderDistance: (dist: number) => void;
    fov: number;
    setFov: (fov: number) => void;
    shadowsEnabled: boolean;
    setShadowsEnabled: (val: boolean) => void;
    cloudsEnabled: boolean;
    setCloudsEnabled: (val: boolean) => void;
    mipmapsEnabled: boolean;
    setMipmapsEnabled: (val: boolean) => void;
    antialiasing: boolean;
    setAntialiasing: (val: boolean) => void;
    chunkFadeEnabled: boolean;
    setChunkFadeEnabled: (val: boolean) => void;
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
    initialScreen?: 'main' | 'video' | 'audio' | 'tutorial';
    onTutorialClose?: () => void;
}

type MenuScreen = 'main' | 'video' | 'audio' | 'tutorial';

// Minecraft Slider Component
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
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 text-white font-minecraft text-shadow-md">
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
    shadowsEnabled, setShadowsEnabled,
    cloudsEnabled, setCloudsEnabled,
    mipmapsEnabled, setMipmapsEnabled, antialiasing, setAntialiasing, 
    chunkFadeEnabled, setChunkFadeEnabled,
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
}) => {
    const [screen, setScreen] = useState<MenuScreen>(initialScreen);
    const [tutorialTab, setTutorialTab] = useState(() => TUTORIAL_SECTIONS[0]?.id ?? 'concept');
    const showMainMenuSubmenuOverlay = isMainMenu && screen !== 'main';
    const isBrowserMode = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().indexOf(' electron/') === -1;
    const fileInputRef = useRef<HTMLInputElement>(null);
    
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

    const updateVolume = (cat: string, val: number) => {
        setVolumes(p => ({...p, [cat]: val}));
        soundManager.setVolume(cat as SoundCategory | 'master', val);
    };
    
    const updateMusicDelay = (val: number) => {
        setMusicDelay(val);
        // Keep configured and displayed delay values aligned.
        musicController.setDelayRange(val, val);
    };

    const handleCloudUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            if (evt.target?.result) {
                setCloudTexture(evt.target.result as string);
                soundManager.play("ui.click");
                alert("Clouds updated!");
            }
        };
        reader.readAsDataURL(file);
    };

    // Main Menu
    const renderMain = () => (
        <div className="flex flex-col gap-3 items-center">
            <h1 className="text-white text-xl mb-4 font-bold text-shadow-lg">{isMainMenu ? 'Options' : 'Game Menu'}</h1>
            
            <div className="flex flex-col gap-3 w-full items-center">
                {!isMainMenu && <MenuButton label="Back to Game" onClick={onResume} width="w-80" />}
                <div className="flex gap-3">
                    <MenuButton label="Video Settings..." onClick={() => setScreen('video')} width="w-[9.5rem]" />
                    <MenuButton label="Music & Sounds..." onClick={() => setScreen('audio')} width="w-[9.5rem]" />
                </div>
                <div className="flex gap-3">
                    <MenuButton label="Controls..." disabled width={isBrowserMode ? 'w-80' : 'w-[9.5rem]'} />
                    {!isBrowserMode && <MenuButton label="Tutorial..." onClick={() => setScreen('tutorial')} width="w-[9.5rem]" />}
                </div>
                {!isMainMenu && <MenuButton label="Save and Quit to Title" onClick={onQuitToTitle} width="w-80" />}
                {isMainMenu && <MenuButton label="Done" onClick={onResume} width="w-80" />}
            </div>
        </div>
    );

    // Video Settings
    const renderVideo = () => (
        <div className="flex flex-col gap-2 items-center w-[600px]">
            <h1 className="text-white text-xl mb-4 font-bold text-shadow-lg">Video Settings</h1>
            
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

                <MCToggle label="Sun Shadows" value={shadowsEnabled} onChange={setShadowsEnabled} width="w-64" />
                <MCToggle label="Clouds" value={cloudsEnabled} onChange={setCloudsEnabled} width="w-64" />
                <MCToggle label="Mipmap Levels" value={mipmapsEnabled} onChange={setMipmapsEnabled} width="w-64" />
                <MCToggle label="Antialiasing" value={antialiasing} onChange={setAntialiasing} width="w-64" />
                <MCToggle label="Fade In" value={chunkFadeEnabled} onChange={setChunkFadeEnabled} width="w-64" />
                
                {/* Custom Environment */}
                <div className="col-span-2 flex justify-center mt-2 pt-2 border-t border-white/10 w-full">
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleCloudUpload} />
                    <MenuButton label="Load Custom Clouds..." onClick={() => fileInputRef.current?.click()} width="w-64" disabled={!cloudsEnabled} />
                </div>
            </div>

            <MenuButton label="Done" onClick={() => setScreen('main')} width="w-64" />
        </div>
    );

    // Audio Settings
    const renderAudio = () => (
        <div className="flex flex-col gap-2 items-center w-[600px]">
            <h1 className="text-white text-xl mb-4 font-bold text-shadow-lg">Music & Sounds</h1>
            
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

            <div className="grid grid-cols-2 gap-4 mb-6">
                <MenuSlider label="Music" value={volumes.music} min={0} max={1} onChange={(v) => updateVolume('music', v)} width="w-64" />
                <MenuSlider label="Weather" value={volumes.ambient} min={0} max={1} onChange={(v) => updateVolume('ambient', v)} width="w-64" />
                <MenuSlider label="Blocks" value={volumes.blocks} min={0} max={1} onChange={(v) => updateVolume('blocks', v)} width="w-64" />
                <MenuSlider label="Hostile Creatures" value={volumes.hostile} min={0} max={1} onChange={(v) => updateVolume('hostile', v)} width="w-64" />
                <MenuSlider label="Friendly Creatures" value={volumes.neutral} min={0} max={1} onChange={(v) => updateVolume('neutral', v)} width="w-64" />
                <MenuSlider label="Players" value={volumes.player} min={0} max={1} onChange={(v) => updateVolume('player', v)} width="w-64" />
                <MenuSlider label="Voice/Speech" value={volumes.ui} min={0} max={1} onChange={(v) => updateVolume('ui', v)} width="w-64" />
            </div>

            <MenuButton label="Done" onClick={() => setScreen('main')} width="w-64" />
        </div>
    );

    const renderTutorial = () => {
        const activeSection = TUTORIAL_SECTIONS.find((section) => section.id === tutorialTab) || TUTORIAL_SECTIONS[0];

        return (
            <div className="flex flex-col gap-2 items-center w-[820px]">
                <h1 className="text-white text-xl mb-2 font-bold text-shadow-lg">Tutorial</h1>

                <div className="w-full bg-black/40 border-2 border-white/20 mb-2 p-2 text-xs text-gray-300 font-minecraft">
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

                <div className="w-full max-h-[360px] overflow-y-auto bg-black/35 border-2 border-white/20 p-4 mb-4">
                    <h2 className="text-white text-lg font-bold text-shadow-md mb-1">{activeSection.title}</h2>
                    <p className="text-blue-200 text-sm font-minecraft mb-3">{activeSection.subtitle}</p>

                    <div className="space-y-3 mb-4">
                        {activeSection.paragraphs.map((paragraph) => (
                            <p key={paragraph} className="text-gray-100 text-sm leading-relaxed font-minecraft">{paragraph}</p>
                        ))}
                    </div>

                    <div className="border-t border-white/15 pt-3">
                        <h3 className="text-white text-sm font-bold mb-2 font-minecraft">Highlights</h3>
                        <ul className="space-y-1 pl-4 list-disc">
                            {activeSection.bullets.map((bullet) => (
                                <li key={bullet} className="text-gray-200 text-sm font-minecraft">{bullet}</li>
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
            className={`absolute inset-0 z-50 flex items-center justify-center pointer-events-auto ${!isMainMenu ? 'bg-[#000000a0] backdrop-blur-[2px]' : ''}`}
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
            <div className="relative flex flex-col items-center p-2">
                {!isMainMenu && <div className="absolute inset-0 bg-[#151515] opacity-90 border-2 border-white/10" />}
                
                <div className="relative z-10 flex flex-col items-center py-6 px-10 min-w-[400px]">
                    {screen === 'main' && renderMain()}
                    {screen === 'video' && renderVideo()}
                    {screen === 'audio' && renderAudio()}
                    {screen === 'tutorial' && renderTutorial()}
                </div>
            </div>
        </div>
    );
};
