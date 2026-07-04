
import React, { useEffect, useState } from 'react';
import { ItemStack, BlockType, EquipmentSlot } from '../../types';
import { Slot } from './Slot';
import { BLOCKS } from '../../data/blocks';
import { MAX_BREATH } from '../../systems/player/playerConstants';
import { totalDefense, type Equipment } from '../../systems/registry/equipment';
import { getItemStats, getMaxDurability } from '../../systems/registry/itemStats';
import { summarizeItemStats } from '../../systems/registry/itemTooltips';

interface HUDProps {
    health: number;
    hunger: number;
    saturation?: number;
    breath: number;
    inventory: (ItemStack | null)[];
    selectedSlot: number;
    gameMode: 'survival' | 'creative' | 'spectator';
    headBlockType?: BlockType;
    lastDamageTime?: number;
    equipment?: Equipment;
}

// A single armor pip (chestplate silhouette). fill: 0 | 0.5 | 1.
const ArmorPip: React.FC<{ fill: number }> = ({ fill }) => (
    <div className="w-7 h-7 relative" aria-hidden>
        <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className="absolute inset-0 w-full h-full drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
            {/* empty outline */}
            <path d="M3 2 L6 2 L6 4 L10 4 L10 2 L13 2 L14 5 L12 7 L12 14 L4 14 L4 7 L2 5 Z" fill="#3a3a3a" stroke="#141414" strokeWidth="1" />
        </svg>
        {fill > 0 && (
            <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className="absolute inset-0 w-full h-full"
                style={fill === 0.5 ? { clipPath: 'inset(0 50% 0 0)' } : undefined}>
                <path d="M3 2 L6 2 L6 4 L10 4 L10 2 L13 2 L14 5 L12 7 L12 14 L4 14 L4 7 L2 5 Z" fill="#c9d2da" stroke="#5b6770" strokeWidth="1" />
                <path d="M4 3 L5 3 L5 5 L4 5 Z" fill="#eef3f7" />
            </svg>
        )}
    </div>
);

// Hearts and hunger shanks in the same angled, stylized, drop-shadowed style as
// the armor pips: a stroked vector silhouette drawn dark for the empty
// "container", then the filled colour + a highlight glint on top, clipped for
// half values. `shapes` can be several sub-paths (the drumstick is bone + meat).
type PipPath = { d: string; fill: string; stroke?: string };

// Heart: two angled lobes tapering to a point.
const HEART_D = 'M8 5 L5.5 3 L3 3 L2 5.5 L2 7 L8 13.5 L14 7 L14 5.5 L13 3 L10.5 3 Z';
const HEART_GLINT_D = 'M4 5 L5.5 4.6 L5 6.6 L4 6.6 Z';
// Drumstick: rounded meat (upper-right) with a knobbed bone to the lower-left.
const DRUM_BONE_D = 'M7 8 L9 10 L6 13 L6 14 L4 14 L4 12 L3 12 L3 10 L5 10 L5 8 Z';
const DRUM_MEAT_D = 'M9 2 L12 2 L14 4 L14 8 L12 10 L9 10 L7 8 L7 4 Z';
const DRUM_GLINT_D = 'M9.5 3.5 L11.5 3.5 L10.7 5.5 L9.3 5.5 Z';

const PipSvg: React.FC<{ paths: PipPath[]; style?: React.CSSProperties }> = ({ paths, style }) => (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" className="absolute inset-0 w-full h-full" style={style}>
        {paths.map((p, i) => (
            <path key={i} d={p.d} fill={p.fill} stroke={p.stroke} strokeWidth={p.stroke ? 1 : undefined} strokeLinejoin="round" />
        ))}
    </svg>
);

// One stat pip (heart or shank). fill: 0 | 0.5 | 1. `half` picks which side the
// half-value keeps so the icon's main mass stays visible.
const StatPip: React.FC<{
    empty: PipPath[]; filled: PipPath[]; fill: number; half: 'left' | 'right';
}> = ({ empty, filled, fill, half }) => (
    <div className="w-7 h-7 relative drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]" aria-hidden>
        <PipSvg paths={empty} />
        {fill > 0 && (
            <div className="absolute inset-0"
                style={fill === 0.5 ? { clipPath: half === 'left' ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)' } : undefined}>
                <PipSvg paths={filled} />
            </div>
        )}
    </div>
);

const HEART_EMPTY: PipPath[] = [{ d: HEART_D, fill: '#491316', stroke: '#6a1a1a' }];
const HEART_FILLED: PipPath[] = [
    { d: HEART_D, fill: '#d81f1f', stroke: '#7a0d0d' },
    { d: HEART_GLINT_D, fill: '#ff9a9a' },
];
const HUNGER_EMPTY: PipPath[] = [
    { d: DRUM_BONE_D, fill: '#413528', stroke: '#2c2318' },
    { d: DRUM_MEAT_D, fill: '#4a3320', stroke: '#2c2318' },
];
const HUNGER_FILLED: PipPath[] = [
    { d: DRUM_BONE_D, fill: '#f3ead0', stroke: '#b0a078' },
    { d: DRUM_MEAT_D, fill: '#c96b2a', stroke: '#6e3410' },
    { d: DRUM_GLINT_D, fill: '#f0a35a' },
];

const statFill = (value: number, index: number) => {
    const full = index < Math.floor(value / 2);
    if (full) return 1;
    return index === Math.floor(value / 2) && value % 2 === 1 ? 0.5 : 0;
};

// Equipped-armor readout: one mini slot per worn piece with its durability bar
// (via Slot) plus a red pulse when a piece is nearly broken. Tooltips carry the
// exact numbers.
const ARMOR_HUD_SLOTS: EquipmentSlot[] = ['helmet', 'chestplate', 'leggings', 'boots'];
const ArmorReadout: React.FC<{ equipment: Equipment }> = ({ equipment }) => {
    const pieces = ARMOR_HUD_SLOTS.map((slot) => ({ slot, item: equipment[slot] }));
    if (!pieces.some((p) => p.item)) return null;
    return (
        <div className="absolute bottom-4 left-4 z-40 flex flex-col gap-1 pointer-events-none">
            {pieces.map(({ slot, item }) => {
                if (!item) return null;
                const stats = getItemStats(item);
                const max = getMaxDurability(item.type);
                const cur = item.instance?.durability ?? max;
                const frac = max !== undefined && cur !== undefined ? cur / max : 1;
                const low = max !== undefined && frac < 0.15;
                const title = `${BLOCKS[item.type].name} — ${stats?.defense ?? 0} defense`
                    + (max !== undefined ? `, ${cur}/${max} durability` : ', unbreakable');
                return (
                    <div key={slot} title={title}
                        className={`relative ${low ? 'animate-pulse ring-2 ring-red-500 rounded-sm' : ''}`}>
                        <Slot item={item} size="small" />
                    </div>
                );
            })}
        </div>
    );
};

export const HUD: React.FC<HUDProps> = ({ health, hunger, saturation = 0, breath, inventory, selectedSlot, gameMode, lastDamageTime = 0, equipment }) => {
    
    const [shakeOffset, setShakeOffset] = useState<number[]>(Array(10).fill(0));
    const [isFlashing, setIsFlashing] = useState(false);
    const [hungerShake, setHungerShake] = useState<number[]>(Array(10).fill(0));

    useEffect(() => {
        if (lastDamageTime > 0) {
            setIsFlashing(true);
            
            // Generate random shakes for hearts
            const interval = setInterval(() => {
                if (Date.now() - lastDamageTime > 250) {
                    setShakeOffset(Array(10).fill(0));
                    setIsFlashing(false);
                    clearInterval(interval);
                } else {
                    setShakeOffset(prev => prev.map(() => Math.floor(Math.random() * 3) - 1)); // Random -1, 0, 1
                }
            }, 50);

            return () => clearInterval(interval);
        }
    }, [lastDamageTime]);

    // Saturation Shake (Jitter Hunger Bar when Saturation is 0)
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (saturation <= 0 && gameMode === 'survival' && hunger < 20) {
             interval = setInterval(() => {
                 setHungerShake(prev => prev.map(() => (Math.random() < 0.2 ? (Math.random() > 0.5 ? 1 : -1) : 0)));
             }, 50);
        } else {
             setHungerShake(Array(10).fill(0));
        }
        return () => clearInterval(interval);
    }, [saturation, gameMode, hunger]);

    return (
        <>
            {gameMode === 'spectator' ? (
                 <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/40 px-3 py-1 rounded text-white font-bold text-shadow-sm z-40">
                    Spectator Mode
                </div>
            ) : (
                 <div id="crosshair" className="border-2 border-white opacity-60 rounded-full mix-blend-difference z-50"></div>
            )}
            
            {/* Health/Hunger - Only in Survival */}
            {gameMode === 'survival' && (
                <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 flex items-end gap-16 z-40 p-2 pointer-events-none">
                    <div className="flex flex-col gap-1 items-start">
                        {/* Armor (defense) pips — shown above the hearts while any
                            armor is worn; 1 pip = 2 defense points, matching the
                            applyArmor() reduction the pips represent. */}
                        {equipment && totalDefense(equipment) > 0 && (
                            <div className="flex gap-1 h-7" title={`${totalDefense(equipment)} armor — reduces combat damage (not falls, fire, or drowning)`}>
                                {Array.from({ length: 10 }).map((_, i) => {
                                    const def = Math.min(20, totalDefense(equipment));
                                    const fill = def >= (i + 1) * 2 ? 1 : (def === i * 2 + 1 ? 0.5 : 0);
                                    return <ArmorPip key={i} fill={fill} />;
                                })}
                            </div>
                        )}
                         {/* Health Bar */}
                        <div className="flex gap-1 h-7">
                            {Array.from({length: 10}).map((_, i) => {
                                const offsetY = shakeOffset[i] || 0;
                                const flashClass = isFlashing ? 'brightness-150 contrast-125' : '';
                                return (
                                    <div
                                        key={i}
                                        className={`transition-transform duration-75 ${flashClass}`}
                                        style={{ transform: `translateY(${offsetY}px)` }}
                                    >
                                        <StatPip empty={HEART_EMPTY} filled={HEART_FILLED} fill={statFill(health, i)} half="left" />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1 items-end relative">
                        {/* Breath Bar (Bubbles) - Positioned ABOVE hunger */}
                        {breath < MAX_BREATH && ( 
                            <div className="flex gap-1 justify-end absolute bottom-9 right-0">
                                {Array.from({length: 10}).map((_, i) => (
                                    <div key={i} className="w-7 h-7 bg-black/30 border border-black/50 relative overflow-hidden rounded-full">
                                        <div className="absolute inset-0 bg-blue-400/20" />
                                        <div className="absolute bottom-0 left-0 bg-blue-400 shadow-[0_0_5px_rgba(0,191,255,0.5)] transition-all duration-200" style={{ height: i < Math.floor(breath / 30) ? '100%' : (i === Math.floor(breath/30) ? `${(breath%30/30)*100}%` : '0%'), width: '100%' }}></div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Hunger Bar (Shanks) — flex-row-reverse, so index 0 is
                            the RIGHTMOST shank and depletes from the left. */}
                        <div className="flex gap-1 flex-row-reverse h-7">
                            {Array.from({length: 10}).map((_, i) => (
                                <div
                                    key={i}
                                    className="transition-transform duration-75"
                                    style={{ transform: `translateY(${hungerShake[i] || 0}px)` }}
                                >
                                    <StatPip empty={HUNGER_EMPTY} filled={HUNGER_FILLED} fill={statFill(hunger, i)} half="right" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Equipped armor readout (icons + durability bars, bottom-left) */}
            {gameMode === 'survival' && equipment && <ArmorReadout equipment={equipment} />}

            {/* Hotbar */}
            {gameMode !== 'spectator' && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-2 z-40">
                    {inventory[selectedSlot] && (
                        <div className="flex flex-col items-center bg-black/40 px-3 py-1 rounded mb-1 pointer-events-none transition-opacity duration-200">
                            <div className="text-white font-bold text-shadow-md text-base">
                                {BLOCKS[inventory[selectedSlot]!.type].name}
                            </div>
                            {(() => {
                                const summary = summarizeItemStats(inventory[selectedSlot]!);
                                return summary
                                    ? <div className="text-[11px] text-gray-300 text-shadow-sm font-pixel">{summary}</div>
                                    : null;
                            })()}
                        </div>
                    )}
                    <div className="flex gap-1 bg-black/50 p-1.5 rounded-sm border-2 border-white/20">
                        {inventory.slice(0, 9).map((it, i) => <Slot key={i} item={it} selected={selectedSlot === i} animateChanges />)}
                    </div>
                </div>
            )}
        </>
    );
};
