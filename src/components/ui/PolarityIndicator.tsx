import React, { useEffect, useRef, useState } from 'react';
import { gameEvents } from '../../systems/events/GameEvents';
import { inputState } from '../../systems/player/playerInput';
import { getPolaritySoundEvent } from '../../systems/player/polarityFeedback';
import { soundManager } from '../../systems/sound/SoundManager';
import { motionStatus } from '../../systems/player/playerMotion';

// The player's current polarity: the magnet block icon, its label, and (during
// the Warden fight) the armed Magnet Slam. It sits in the bottom-right corner,
// clear of the hotbar's item-name label, the hearts and the armor readout, all
// of which live along the bottom centre and bottom left.
//
// The dodge key deliberately has no prompt here: rolling is always available,
// and its cooldown is shown on the crosshair (see CombatFeedback) rather than
// as another box of text.

export const PolarityIndicator: React.FC = () => {
    const [positive, setPositive] = useState(inputState.magneticPolarity > 0);
    const [switching, setSwitching] = useState(false);
    const [surge, setSurge] = useState({ armed: false, fraction: 0 });
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

        let last = '';
        const poll = window.setInterval(() => {
            const next = { armed: motionStatus.surge, fraction: Math.round(motionStatus.surgeFraction * 20) / 20 };
            const key = `${next.armed}|${next.fraction}`;
            if (key === last) return;
            last = key;
            setSurge(next);
        }, 60);

        return () => {
            unsubscribe();
            window.clearInterval(poll);
            if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
        };
    }, []);

    const texturePath = positive
        ? 'assets/textures/blocks/positive_magnet.png'
        : 'assets/textures/blocks/negative_magnet.png';

    return (
        <div className="pointer-events-none absolute bottom-4 right-4 z-[150] flex select-none flex-col items-center gap-1">
            {surge.armed && (
                <div className="flex w-[92px] flex-col items-center">
                    <div className="animate-pulse whitespace-nowrap font-pixel text-[10px] text-white [text-shadow:1px_1px_0_#000]">
                        SLAM READY
                    </div>
                    <div className="mt-[2px] h-[4px] w-full border border-black/80 bg-[#2b2338]">
                        <div className="h-full bg-white" style={{ width: `${surge.fraction * 100}%` }} />
                    </div>
                </div>
            )}
            <div
                className={`h-12 w-12 border-4 border-[#1a1a1a] bg-[#777] p-1 shadow-[inset_2px_2px_0_#d8d8d8,inset_-2px_-2px_0_#3a3a3a,2px_2px_0_#000] transition-[transform,filter,box-shadow] duration-150 ${
                    switching ? 'scale-125 brightness-150' : 'scale-100 brightness-100'
                } ${surge.armed ? 'shadow-[0_0_14px_4px_rgba(255,255,255,0.75)]' : ''}`}
            >
                <img
                    src={texturePath}
                    alt=""
                    className="h-full w-full"
                    style={{ imageRendering: 'pixelated' }}
                />
            </div>
            <div className="whitespace-nowrap font-pixel text-[10px] text-white [text-shadow:1px_1px_0_#000,-1px_-1px_0_#000]">
                {positive ? 'Positive (R)' : 'Negative (R)'}
            </div>
        </div>
    );
};
