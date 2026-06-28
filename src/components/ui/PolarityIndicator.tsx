import React, { useEffect, useRef, useState } from 'react';
import { gameEvents } from '../../systems/events/GameEvents';
import { inputState } from '../../systems/player/playerInput';
import { getPolaritySoundEvent } from '../../systems/player/polarityFeedback';
import { soundManager } from '../../systems/sound/SoundManager';

export const PolarityIndicator: React.FC = () => {
    const [positive, setPositive] = useState(inputState.magneticPolarity > 0);
    const [switching, setSwitching] = useState(false);
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

        return () => {
            unsubscribe();
            if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
        };
    }, []);

    const texturePath = positive
        ? 'assets/textures/blocks/positive_magnet.png'
        : 'assets/textures/blocks/negative_magnet.png';

    return (
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-[150] h-[76px] w-[104px] -translate-x-1/2 select-none text-center">
            <div
                className={`mx-auto h-14 w-14 border-4 border-[#1a1a1a] bg-[#777] p-1 shadow-[inset_2px_2px_0_#d8d8d8,inset_-2px_-2px_0_#3a3a3a,2px_2px_0_#000] transition-[transform,filter] duration-150 ${
                    switching ? 'scale-125 brightness-150' : 'scale-100 brightness-100'
                }`}
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
        </div>
    );
};
