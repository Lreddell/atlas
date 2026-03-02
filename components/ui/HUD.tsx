
import React, { useEffect, useState } from 'react';
import { ItemStack, BlockType } from '../../types';
import { Slot } from './Slot';
import { BLOCKS } from '../../data/blocks';
import { MAX_BREATH } from '../../systems/player/playerConstants';

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
}

export const HUD: React.FC<HUDProps> = ({ health, hunger, saturation = 0, breath, inventory, selectedSlot, gameMode, lastDamageTime = 0 }) => {
    
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
                <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 flex gap-16 z-40 p-2 pointer-events-none">
                    <div className="flex flex-col gap-1 items-start">
                         {/* Health Bar */}
                        <div className="flex gap-1 h-6">
                            {Array.from({length: 10}).map((_, i) => {
                                const isHalf = i === Math.floor(health / 2);
                                const isFull = i < Math.floor(health / 2);
                                // Fix: Use 50% for half heart (1 HP), 100% for full (2 HP)
                                const fillHeight = isFull ? '100%' : (isHalf ? `${(health%2)*50}%` : '0%');
                                
                                // Shake offset for this specific heart
                                const offsetY = shakeOffset[i] || 0;
                                const flashClass = isFlashing ? 'brightness-150 contrast-125 sepia-[.3] grayscale-[.2]' : '';

                                return (
                                    <div 
                                        key={i} 
                                        className={`w-6 h-6 bg-black/40 border border-black/60 relative overflow-hidden rounded-sm transition-transform duration-75 ${flashClass}`}
                                        style={{ transform: `translateY(${offsetY}px)` }}
                                    >
                                        {/* Background (Empty Heart) */}
                                        <div className="absolute inset-0 bg-[#3a0b0b]" /> 
                                        
                                        {/* Fill (Full/Half Heart) */}
                                        <div className="absolute bottom-0 left-0 bg-[#c60000] shadow-[inset_0_2px_4px_rgba(255,100,100,0.3)]" 
                                             style={{ height: fillHeight, width: '100%' }}>
                                             {/* Shine detail */}
                                             <div className="absolute top-0.5 left-0.5 w-1.5 h-1.5 bg-white/30 rounded-full" />
                                        </div>

                                        {/* Flashing White Overlay (when damaged) */}
                                        {isFlashing && (fillHeight !== '0%') && (
                                            <div className="absolute inset-0 bg-white/40 mix-blend-overlay" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1 items-end relative">
                        {/* Breath Bar (Bubbles) - Positioned ABOVE hunger */}
                        {breath < MAX_BREATH && ( 
                            <div className="flex gap-1 justify-end absolute bottom-8 right-0">
                                {Array.from({length: 10}).map((_, i) => (
                                    <div key={i} className="w-6 h-6 bg-black/30 border border-black/50 relative overflow-hidden rounded-full">
                                        <div className="absolute inset-0 bg-blue-400/20" />
                                        <div className="absolute bottom-0 left-0 bg-blue-400 shadow-[0_0_5px_rgba(0,191,255,0.5)] transition-all duration-200" style={{ height: i < Math.floor(breath / 30) ? '100%' : (i === Math.floor(breath/30) ? `${(breath%30/30)*100}%` : '0%'), width: '100%' }}></div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Hunger Bar (Shanks) */}
                        <div className="flex gap-1 flex-row-reverse h-6">
                            {Array.from({length: 10}).map((_, i) => (
                                <div 
                                    key={i} 
                                    className="w-6 h-6 bg-black/30 border border-black/50 relative overflow-hidden rounded-sm transform transition-transform duration-75"
                                    style={{ transform: `translateY(${hungerShake[i] || 0}px)` }}
                                >
                                    <div className="absolute inset-0 bg-orange-700/20" />
                                    {/* Using flex-row-reverse, so this index 0 is actually the RIGHTMOST icon visually */}
                                    <div className="absolute bottom-0 left-0 bg-[#D35400] shadow-[0_0_5px_rgba(211,84,0,0.5)] transition-all duration-300" 
                                         style={{ height: i < Math.floor(hunger / 2) ? '100%' : (i === Math.floor(hunger/2) ? `${(hunger%2)*50}%` : '0%'), width: '100%' }}>
                                         {/* Bone Detail */}
                                         <div className="absolute top-0 right-1 w-1 h-2 bg-[#F5CBA7] rounded-full opacity-50"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Hotbar */}
            {gameMode !== 'spectator' && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-2 z-40">
                    {inventory[selectedSlot] && (
                        <div className="text-white font-bold text-shadow-md bg-black/40 px-3 py-1 rounded text-base mb-1 pointer-events-none transition-opacity duration-200">
                            {BLOCKS[inventory[selectedSlot]!.type].name}
                        </div>
                    )}
                    <div className="flex gap-1 bg-black/50 p-1.5 rounded-sm border-2 border-white/20">
                        {inventory.slice(0, 9).map((it, i) => <Slot key={i} item={it} selected={selectedSlot === i} />)}
                    </div>
                </div>
            )}
        </>
    );
};
