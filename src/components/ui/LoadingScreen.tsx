
import React, { useEffect, useState } from 'react';
import { getDirtBackground } from '../../utils/textures';
import { MenuPanoramaBackground } from './MenuPanoramaBackground';

// World loading tips. Add more entries here to expand the tip pool.
const LOADING_TIPS = [
    "Press E to open your inventory. Atlas includes both 2x2 and 3x3 crafting.",
    "Use the mouse wheel or number keys 1-9 to switch hotbar slots instantly.",
    "Press Q to drop the selected item. Ctrl+Q drops the whole stack.",
    "Press / to open command input with autocomplete for supported commands.",
    "Press F3 to toggle the debug screen.",
    "Press F4 to open the texture atlas viewer.",
    "Press F8 in-game to capture a panorama for the menu background.",
    "One log crafts into 4 planks, and 2 stacked planks craft into 4 sticks.",
    "A torch recipe uses 1 coal or charcoal over 1 stick and gives 4 torches.",
    "Eight cobblestone in a ring crafts a furnace.",
    "Eight planks in a ring crafts a chest.",
    "Three wool over three planks crafts a bed.",
    "Beds are usable in Atlas and sleeping advances to morning.",
    "In Survival, sprinting, jumping, swimming, mining, and combat all add hunger exhaustion.",
    "If your hunger reaches 0, starvation stops at 1 HP instead of killing you outright.",
    "Full hunger and saturation regenerate health faster than normal hunger regen.",
    "You only have about 15 seconds of breath underwater before drowning starts.",
    "Use /gamemode survival, /gamemode creative, or /gamemode spectator to switch modes.",
    "Use /time set day, /time set night, or /time add <value> to control the clock.",
    "Use /phase set 0-7 to change the moon phase.",
    "Use /tp <x> <y> <z> to teleport to exact coordinates.",
    "Use /locate biome <name> to search for biomes like cherry_grove or volcanic.",
    "In Creative, the inventory is organized into Building, Natural, Functional, Tools, Food, and Ingredients tabs.",
    "While hovering an item in the inventory, press 1-9 to swap it directly into a hotbar slot.",
    "Oak, spruce, birch, and cherry logs each craft into their own plank set.",
    "Raw iron, raw copper, and raw gold can all be smelted into ingots in a furnace.",
    "Atlas worlds include Plains, Forest, Desert, Tundra, Cherry Grove, Red Mesa, Mesa Bryce, and Volcanic Crags.",
    "Singleplayer worlds can be saved, imported, and exported from the main menu.",
    "Panorama Settings let you manage captured backgrounds and tune blur, gradient, and rotation.",
    "There is a built-in tutorial wiki under Options if you need a controls refresher.",
    "Moon phases run on an 8-day cycle, and each phase changes nighttime brightness.",
    "Volcanic Crags use lava in place of normal water, which makes them one of Atlas's harshest biomes.",
    "Coal and charcoal burn for the same amount of furnace time in Atlas.",
    "Logs can be smelted into charcoal, so torches are still possible even if you have not found coal yet.",
    "Apples restore 4 hunger and 2.4 saturation in Atlas.",
    "Dead bushes can drop sticks, which makes dry biomes useful for quick starter tools.",
    "Grass plants have a chance to drop wheat seeds when broken.",
    "Leaves can drop saplings, sticks, and sometimes apples depending on the tree type.",
    "The first version of this game was made in Google AI Studio. Crazy, right?",
    "Atlas is open source! Check out the GitHub repo at github.com/Lreddell/atlas.",
    "The world editor supports custom terrain generation, so you can create your own unique presets and share them with friends!",
];

// Mirrors the procedural drawing in utils/textures.ts for the grass block faces.
function buildGrassTextures(): { top: string; side: string; bottom: string } {
    const S = 16;
    const mk = (): HTMLCanvasElement => {
        const c = document.createElement('canvas');
        c.width = S; c.height = S;
        return c;
    };
    const addNoise = (ctx: CanvasRenderingContext2D, opacity: number, density: number) => {
        for (let py = 0; py < S; py++) {
            for (let px = 0; px < S; px++) {
                if (Math.random() > density) continue;
                const val = Math.random();
                ctx.fillStyle = val > 0.5 ? `rgba(255,255,255,${opacity})` : `rgba(0,0,0,${opacity / 2})`;
                ctx.fillRect(px, py, 1, 1);
            }
        }
    };

    // Slot 1: grass top
    const topC = mk(); const t = topC.getContext('2d')!;
    t.fillStyle = '#4caf50'; t.fillRect(0, 0, S, S);
    t.fillStyle = '#43a047';
    for (let i = 0; i < 30; i++) t.fillRect(Math.floor(Math.random() * S), Math.floor(Math.random() * S), 1, 1);
    t.fillStyle = '#81c784';
    for (let i = 0; i < 20; i++) t.fillRect(Math.floor(Math.random() * S), Math.floor(Math.random() * S), 1, 1);

    // Slot 12: grass side
    const sideC = mk(); const s = sideC.getContext('2d')!;
    s.fillStyle = '#5d4037'; s.fillRect(0, 0, S, S);
    s.fillStyle = '#66bb6a'; s.fillRect(0, 0, S, 4);
    for (let i = 0; i < S; i++) s.fillRect(i, 4, 1, Math.floor(Math.random() * 4));
    addNoise(s, 0.1, 0.1);

    // Slot 0: dirt (bottom)
    const botC = mk(); const b = botC.getContext('2d')!;
    b.fillStyle = '#5d4037'; b.fillRect(0, 0, S, S);
    addNoise(b, 0.2, 0.2);

    return { top: topC.toDataURL(), side: sideC.toDataURL(), bottom: botC.toDataURL() };
}

interface LoadingScreenProps {
    phase: string;
    percent: number;
    details: string;
    backgroundMode?: 'dirt' | 'panorama';
    panoramaBackgroundDataUrl?: string | null;
    panoramaFaceDataUrls?: string[] | null;
    panoramaBlur?: number;
    panoramaGradient?: number;
    panoramaRotationSpeed?: number;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
    phase,
    percent,
    details: _details,
    backgroundMode = 'dirt',
    panoramaBackgroundDataUrl = null,
    panoramaFaceDataUrls = null,
    panoramaBlur = 0,
    panoramaGradient = 0.4,
    panoramaRotationSpeed = 1,
}) => {
    const [bgPattern, setBgPattern] = useState('');
    const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * LOADING_TIPS.length));
    const [grassTex, setGrassTex] = useState<{ top: string; side: string; bottom: string } | null>(null);
    const clampedPercent = Math.max(0, Math.min(100, Math.floor(percent)));

    useEffect(() => {
        setBgPattern(getDirtBackground());
        setGrassTex(buildGrassTextures());
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setTipIndex(prev => (prev + 1) % LOADING_TIPS.length);
        }, 6000);
        return () => clearInterval(interval);
    }, []);

    const faceStyle = (url: string, brightness: number): React.CSSProperties => ({
        backgroundImage: `url(${url})`,
        backgroundSize: '80px 80px',
        imageRendering: 'pixelated',
        filter: `brightness(${brightness})`,
    });

    return (
        <div
            className="absolute inset-0 flex flex-col items-center justify-center z-[500]"
            style={backgroundMode === 'panorama' ? undefined : {
                backgroundImage: `url(${bgPattern})`,
                backgroundSize: '64px',
                imageRendering: 'pixelated',
            }}
        >
            <style>{`
                .text-shadow-lg { text-shadow: 2px 2px 0px #3f3f3f; }
                .text-shadow-md { text-shadow: 1px 1px 0px #3f3f3f; }
                @keyframes ls-cube-spin {
                    from { transform: rotateX(25deg) rotateY(0deg); }
                    to   { transform: rotateX(25deg) rotateY(360deg); }
                }
                .ls-scene { perspective: 320px; width: 80px; height: 80px; }
                .ls-cube {
                    width: 80px; height: 80px;
                    position: relative;
                    transform-style: preserve-3d;
                    animation: ls-cube-spin 9s linear infinite;
                }
                .ls-face { position: absolute; width: 80px; height: 80px; image-rendering: pixelated; }
                .ls-top    { transform: rotateX(90deg)  translateZ(40px); }
                .ls-bottom { transform: rotateX(-90deg) translateZ(40px); }
                .ls-front  { transform:                 translateZ(40px); }
                .ls-back   { transform: rotateY(180deg) translateZ(40px); }
                .ls-left   { transform: rotateY(-90deg) translateZ(40px); }
                .ls-right  { transform: rotateY(90deg)  translateZ(40px); }
            `}</style>

            {backgroundMode === 'panorama' && (
                <MenuPanoramaBackground
                    backgroundMode={backgroundMode}
                    panoramaBackgroundDataUrl={panoramaBackgroundDataUrl}
                    panoramaFaceDataUrls={panoramaFaceDataUrls}
                    panoramaBlur={panoramaBlur}
                    panoramaGradient={panoramaGradient}
                    panoramaRotationSpeed={panoramaRotationSpeed}
                />
            )}

            {/* Panel styling matches the pause-menu overlay treatment. */}
            <div className="relative flex flex-col items-center">
                <div className="absolute inset-0 bg-[#151515] opacity-90 border-2 border-white/10" />
                <div className="relative z-10 flex flex-col items-center gap-5 py-8 px-10 w-[440px]">

                    {/* Spinning grass block */}
                    <div className="ls-scene">
                        <div className="ls-cube">
                            <div className="ls-face ls-top"    style={grassTex ? faceStyle(grassTex.top,  1.2)  : { background: '#4caf50' }} />
                            <div className="ls-face ls-bottom" style={grassTex ? faceStyle(grassTex.bottom, 0.65) : { background: '#5d4037' }} />
                            <div className="ls-face ls-front"  style={grassTex ? faceStyle(grassTex.side, 1.0)  : { background: '#5d4037' }} />
                            <div className="ls-face ls-back"   style={grassTex ? faceStyle(grassTex.side, 0.6)  : { background: '#5d4037' }} />
                            <div className="ls-face ls-left"   style={grassTex ? faceStyle(grassTex.side, 0.75) : { background: '#5d4037' }} />
                            <div className="ls-face ls-right"  style={grassTex ? faceStyle(grassTex.side, 0.75) : { background: '#5d4037' }} />
                        </div>
                    </div>

                    {/* Phase title */}
                    <h1 className="text-white font-minecraft text-xl text-shadow-md">
                        {phase || 'Loading World...'}
                    </h1>

                    {/* Progress bar */}
                    <div className="w-full bg-[#111] border-2 border-white/30 h-8 relative">
                        <div
                            className="h-full bg-[#2e7d32] transition-all duration-100 ease-linear"
                            style={{ width: `${clampedPercent}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center text-white font-minecraft text-xs text-shadow-md pointer-events-none">
                            {clampedPercent}%
                        </div>
                    </div>

                    {/* Tips section */}
                    <div className="w-full bg-black/40 border-2 border-white/20 px-4 py-3 min-h-[76px] flex flex-col gap-1">
                        <span className="text-yellow-300 font-minecraft text-xs text-shadow-md tracking-wide">
                            DID YOU KNOW...
                        </span>
                        <p className="text-gray-200 font-minecraft text-sm leading-relaxed text-shadow-md">
                            {LOADING_TIPS[tipIndex]}
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
};
