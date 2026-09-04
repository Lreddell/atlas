import React, { useEffect, useRef, useState } from 'react';
import { gameEvents } from '../../systems/events/GameEvents';
import { inputState } from '../../systems/player/playerInput';
import { getPolaritySoundEvent } from '../../systems/player/polarityFeedback';
import { soundManager } from '../../systems/sound/SoundManager';

// The player's polarity (the magnet block icon + label) and, during the
// Magnetic Warden fight, the boots' Flux meter beneath it: bolts repelled off a
// matching polarity charge it, and when it is full the next flip (R) discharges
// a Flux Burst. The meter only appears once there is charge to show.
export const PolarityIndicator: React.FC = () => {
    const [positive, setPositive] = useState(inputState.magneticPolarity > 0);
    const [switching, setSwitching] = useState(false);
    const [flux, setFlux] = useState<{ value: number; max: number; full: boolean }>({ value: 0, max: 10, full: false });
    const resetTimerRef = useRef<number | null>(null);

    useEffect(() => {
        setPositive(inputState.magneticPolarity > 0);
        const unsubscribe = gameEvents.on('ability:changed', ({ abilityId, active }) => {
            if (abilityId !== 'polarity') return;

            setPositive(active);
            setSwitching(true);
            soundManager.play(getPolaritySoundEvent(active));

            if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
            resetTimerRef.current = window.setTimeout(() => {
                setSwitching(false);
                resetTimerRef.current = null;
            }, 180);
        });
        const offFlux = gameEvents.on('flux:changed', ({ value, max, full }) => setFlux({ value, max, full }));

        return () => {
            unsubscribe();
            offFlux();
            if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
        };
    }, []);

    const texturePath = positive
        ? 'assets/textures/blocks/positive_magnet.png'
        : 'assets/textures/blocks/negative_magnet.png';
    const showFlux = flux.value > 0 || flux.full;
    const pips = Math.max(1, flux.max);

    return (
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-[150] w-[132px] -translate-x-1/2 select-none text-center">
            <div
                className={`mx-auto h-14 w-14 border-4 border-[#1a1a1a] bg-[#777] p-1 shadow-[inset_2px_2px_0_#d8d8d8,inset_-2px_-2px_0_#3a3a3a,2px_2px_0_#000] transition-[transform,filter,box-shadow] duration-150 ${
                    switching ? 'scale-125 brightness-150' : 'scale-100 brightness-100'
                } ${flux.full ? 'animate-pulse shadow-[0_0_14px_4px_rgba(230,216,255,0.85)]' : ''}`}
            >
                <img
                    src={texturePath}
                    alt=""
                    className="h-full w-full"
                    style={{ imageRendering: 'pixelated' }}
                />
            </div>
            <div className="mt-1 whitespace-nowrap font-pixel text-xs text-white [text-shadow:1px_1px_0_#000,-1px_-1px_0_#000]">
                {positive ? 'Positive (R)' : 'Negative (R)'}
            </div>
            {showFlux && (
                <div className="mt-1 flex flex-col items-center" title="Flux: bolts repelled off a matching polarity charge your boots. Full: the next flip bursts.">
                    <div className="flex gap-[2px]">
                        {Array.from({ length: pips }).map((_, i) => (
                            <div
                                key={i}
                                className="h-2 w-[10px] border border-black/80"
                                style={{
                                    background: i < flux.value
                                        ? (flux.full ? '#f3ecff' : '#b388ff')
                                        : '#2b2338',
                                    boxShadow: i < flux.value && flux.full ? '0 0 6px rgba(230,216,255,0.9)' : undefined,
                                }}
                            />
                        ))}
                    </div>
                    <div className={`mt-[2px] whitespace-nowrap font-pixel text-[10px] [text-shadow:1px_1px_0_#000] ${flux.full ? 'text-[#f3ecff]' : 'text-[#c9a3ff]'}`}>
                        {flux.full ? 'FLUX READY · flip (R) to burst' : 'Flux'}
                    </div>
                </div>
            )}
        </div>
    );
};
