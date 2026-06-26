import React, { useEffect, useState } from 'react';
import { gameEvents } from '../../systems/events/GameEvents';
import { inputState } from '../../systems/player/playerInput';

// A screen-edge colour rim showing the player's current magnetic polarity
// (red = positive, blue = negative). Ambient, no-HUD feedback — it pulses
// brighter for a moment on each polarity flip.
export const PolarityVignette: React.FC = () => {
    const [positive, setPositive] = useState(inputState.magneticPolarity > 0);
    const [pulse, setPulse] = useState(false);

    useEffect(() => {
        setPositive(inputState.magneticPolarity > 0);
        let timer: number | undefined;
        const off = gameEvents.on('ability:changed', ({ abilityId, active }) => {
            if (abilityId !== 'polarity') return;
            setPositive(active);
            setPulse(true);
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(() => setPulse(false), 260);
        });
        return () => { off(); if (timer) window.clearTimeout(timer); };
    }, []);

    const rgb = positive ? '229, 57, 53' : '30, 136, 229';
    const spread = pulse ? 72 : 44;
    const alpha = pulse ? 0.52 : 0.3;

    return (
        <div
            className="pointer-events-none fixed inset-0 z-[110] transition-[box-shadow] duration-200"
            style={{ boxShadow: `inset 0 0 150px ${spread}px rgba(${rgb}, ${alpha})` }}
        />
    );
};
