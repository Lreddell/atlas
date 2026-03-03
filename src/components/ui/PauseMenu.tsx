
import React, { useState, useEffect, useRef } from 'react';
import { soundManager } from '../../systems/sound/SoundManager';
import { musicController } from '../../systems/sound/MusicController';
import { SoundCategory } from '../../systems/sound/soundTypes';
import { setCloudTexture } from '../world/Clouds';
import { MenuPanoramaBackground } from './MenuPanoramaBackground';
import { TUTORIAL_SECTIONS } from '../../data/tutorial';

interface PauseMenuProps {
    onResume: () => void;
    onQuitToTitle?: () => void; // Callback for quitting to title
    renderDistance: number;
    setRenderDistance: (dist: number) => void;
    fov: number;
    setFov: (fov: number) => void;
    workersEnabled: boolean;
    setWorkersEnabled: (val: boolean) => void;
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
}

type MenuScreen = 'main' | 'video' | 'audio' | 'help';

// Minecraft Button Component
const MCButton: React.FC<{
    label: string;
    onClick?: () => void;
    width?: string;
    disabled?: boolean;
}> = ({ label, onClick, width = 'w-96', disabled = false }) => {
    return (
        <button 
            onClick={(e) => { 
                e.stopPropagation(); 
                if (!disabled && onClick) {
                    soundManager.play("ui.click");
                    onClick(); 
                }
            }}
            onMouseEnter={() => {
                if (!disabled) {
                    soundManager.play("ui.hover", { volume: 0.2, pitch: 2.0 });
                }
            }}
            onMouseLeave={() => {}}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            className={`
                ${width} h-10 relative bg-[#8b8b8b] border-2 border-white border-b-[#373737] border-r-[#373737]
                text-white font-minecraft text-shadow-md select-none outline-none group
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#a0a0a0] active:border-[#373737] active:border-b-white active:border-r-white'}
            `}
        >
            {/* Inner border effect */}
            <div className={`absolute inset-[2px] border-2 border-transparent ${!disabled && 'group-active:border-[#6f6f6f]'} pointer-events-none`} />
            <span className="relative top-0 group-active:top-[1px]">{label}</span>
        </button>
    );
};

// Minecraft Slider Component
const MCSlider: React.FC<{
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
    <MCButton 
        label={`${label}: ${value ? 'ON' : 'OFF'}`} 
        onClick={() => onChange(!value)}
        width={width}
    />
);

export const PauseMenu: React.FC<PauseMenuProps> = ({ 
    onResume, onQuitToTitle, renderDistance, setRenderDistance, fov, setFov, 
    workersEnabled, setWorkersEnabled, shadowsEnabled, setShadowsEnabled,
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
}) => {
    const [screen, setScreen] = useState<MenuScreen>('main');
    const [tutorialTab, setTutorialTab] = useState(() => TUTORIAL_SECTIONS[0]?.id ?? 'concept');
    const showMainMenuSubmenuOverlay = isMainMenu && screen !== 'main';
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
    
    const [musicDelay, setMusicDelay] = useState(15);

    useEffect(() => {
        // Load initial volumes
        const newVols = { ...volumes };
        (['master', 'music', 'ambient', 'blocks', 'player', 'ui', 'hostile', 'neutral'] as const).forEach(cat => {
            newVols[cat] = soundManager.getVolume(cat);
        });
        setVolumes(newVols);
        
        // Load initial delay
        const range = musicController.getDelayRange();
        setMusicDelay(range.min);
    }, []);

    const updateVolume = (cat: string, val: number) => {
        setVolumes(p => ({...p, [cat]: val}));
        soundManager.setVolume(cat as SoundCategory | 'master', val);
    };
    
    const updateMusicDelay = (val: number) => {
        setMusicDelay(val);
        musicController.setDelayRange(val, val + 45); // Set Max to val + 45s
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
                {!isMainMenu && <MCButton label="Back to Game" onClick={onResume} width="w-80" />}
                <div className="flex gap-3">
                    <MCButton label="Video Settings..." onClick={() => setScreen('video')} width="w-[9.5rem]" />
                    <MCButton label="Music & Sounds..." onClick={() => setScreen('audio')} width="w-[9.5rem]" />
                </div>
                <div className="flex gap-3">
                    <MCButton label="Controls..." disabled width="w-[9.5rem]" />
                    <MCButton label="Help..." onClick={() => setScreen('help')} width="w-[9.5rem]" />
                </div>
                {!isMainMenu && <MCButton label="Save and Quit to Title" onClick={onQuitToTitle} width="w-80" />}
                {isMainMenu && <MCButton label="Done" onClick={onResume} width="w-80" />}
            </div>
        </div>
    );

    // Video Settings
    const renderVideo = () => (
        <div className="flex flex-col gap-2 items-center w-[600px]">
            <h1 className="text-white text-xl mb-4 font-bold text-shadow-lg">Video Settings</h1>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
                <MCSlider 
                    label="Brightness" 
                    value={brightness} min={0} max={1} step={0.05} 
                    onChange={setBrightness} width="w-64"
                    formatValue={(v) => v === 0 ? 'Moody' : (v === 1 ? 'Bright' : `+${Math.round(v*100)}%`)}
                />
                <MCSlider 
                    label="Render Distance" 
                    value={renderDistance} min={4} max={48} step={1} 
                    onChange={setRenderDistance} width="w-64"
                    formatValue={(v) => `${v} Chunks`}
                />
                <MCSlider 
                    label="FOV" 
                    value={fov} min={30} max={110} step={1} 
                    onChange={setFov} width="w-64"
                    formatValue={(v) => v === 70 ? 'Normal' : v.toString()}
                />
                
                <MCSlider 
                    label="Max Framerate" 
                    value={maxFps} min={10} max={260} step={10}
                    onChange={setMaxFps} width="w-64"
                    disabled={vsync}
                    formatValue={(v) => `${v} fps`}
                />
                <MCToggle label="VSync" value={vsync} onChange={setVsync} width="w-64" />

                <MCToggle label="Sun Shadows" value={shadowsEnabled} onChange={setShadowsEnabled} width="w-64" />
                <MCToggle label="Clouds" value={cloudsEnabled} onChange={setCloudsEnabled} width="w-64" />
                <MCToggle label="Web Workers" value={workersEnabled} onChange={setWorkersEnabled} width="w-64" />
                <MCToggle label="Mipmap Levels" value={mipmapsEnabled} onChange={setMipmapsEnabled} width="w-64" />
                <MCToggle label="Antialiasing" value={antialiasing} onChange={setAntialiasing} width="w-64" />
                <MCToggle label="Chunk Fade In" value={chunkFadeEnabled} onChange={setChunkFadeEnabled} width="w-64" />
                
                {/* Custom Environment */}
                <div className="col-span-2 flex justify-center mt-2 pt-2 border-t border-white/10 w-full">
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleCloudUpload} />
                    <MCButton label="Load Custom Clouds..." onClick={() => fileInputRef.current?.click()} width="w-64" disabled={!cloudsEnabled} />
                </div>
            </div>

            <MCButton label="Done" onClick={() => setScreen('main')} width="w-64" />
        </div>
    );

    // Audio Settings
    const renderAudio = () => (
        <div className="flex flex-col gap-2 items-center w-[600px]">
            <h1 className="text-white text-xl mb-4 font-bold text-shadow-lg">Music & Sounds</h1>
            
            <div className="mb-4 flex gap-4">
                <MCSlider 
                    label="Master Volume" 
                    value={volumes.master} min={0} max={1} 
                    onChange={(v) => updateVolume('master', v)} width="w-64"
                />
                <MCSlider 
                    label="Music Delay" 
                    value={musicDelay} min={0} max={300} step={5}
                    onChange={updateMusicDelay} width="w-64"
                    formatValue={(v) => `${v}s`}
                />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
                <MCSlider label="Music" value={volumes.music} min={0} max={1} onChange={(v) => updateVolume('music', v)} width="w-64" />
                <MCSlider label="Weather" value={volumes.ambient} min={0} max={1} onChange={(v) => updateVolume('ambient', v)} width="w-64" />
                <MCSlider label="Blocks" value={volumes.blocks} min={0} max={1} onChange={(v) => updateVolume('blocks', v)} width="w-64" />
                <MCSlider label="Hostile Creatures" value={volumes.hostile} min={0} max={1} onChange={(v) => updateVolume('hostile', v)} width="w-64" />
                <MCSlider label="Friendly Creatures" value={volumes.neutral} min={0} max={1} onChange={(v) => updateVolume('neutral', v)} width="w-64" />
                <MCSlider label="Players" value={volumes.player} min={0} max={1} onChange={(v) => updateVolume('player', v)} width="w-64" />
                <MCSlider label="Voice/Speech" value={volumes.ui} min={0} max={1} onChange={(v) => updateVolume('ui', v)} width="w-64" />
            </div>

            <MCButton label="Done" onClick={() => setScreen('main')} width="w-64" />
        </div>
    );

    const renderHelp = () => {
        const activeSection = TUTORIAL_SECTIONS.find((section) => section.id === tutorialTab) || TUTORIAL_SECTIONS[0];

        return (
            <div className="flex flex-col gap-2 items-center w-[820px]">
                <h1 className="text-white text-xl mb-2 font-bold text-shadow-lg">Help</h1>

                <div className="w-full bg-black/40 border-2 border-white/20 mb-2 p-2 text-xs text-gray-300 font-minecraft">
                    Tutorial wiki. You can always return here through Options &gt; Help.
                </div>

                <div className="w-full flex flex-wrap justify-center gap-2 mb-2">
                    {TUTORIAL_SECTIONS.map((section) => (
                        <MCButton
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
                        <ul className="space-y-1">
                            {activeSection.bullets.map((bullet) => (
                                <li key={bullet} className="text-gray-200 text-sm font-minecraft">• {bullet}</li>
                            ))}
                        </ul>
                    </div>
                </div>

                <MCButton label="Done" onClick={() => setScreen('main')} width="w-64" />
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
                    {screen === 'help' && renderHelp()}
                </div>
            </div>
        </div>
    );
};
