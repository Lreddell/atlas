import React, { useEffect, useState } from 'react';
import { gameEvents } from '../../systems/events/GameEvents';
import { inputState } from '../../systems/player/playerInput';
import { getPolaritySoundEvent } from '../../systems/player/polarityFeedback';
import { soundManager } from '../../systems/sound/SoundManager';
import { motionStatus } from '../../systems/player/playerMotion';

/** Centered magnetic ability: sign is redundant with color, R is the only copy. */
export const PolarityIndicator: React.FC = () => {
    const [view, setView] = useState({ positive: inputState.magneticPolarity > 0, surge: false, fraction: 0 });
    useEffect(() => {
        const off = gameEvents.on('ability:changed', ({ abilityId, active }) => {
            if (abilityId === 'polarity') soundManager.play(getPolaritySoundEvent(active));
        });
        const poll = window.setInterval(() => {
            const next = { positive: inputState.magneticPolarity > 0, surge: motionStatus.surge, fraction: Math.round(motionStatus.surgeFraction * 40) / 40 };
            setView(old => old.positive === next.positive && old.surge === next.surge && old.fraction === next.fraction ? old : next);
        }, 40);
        return () => { off(); window.clearInterval(poll); };
    }, []);
    const color = view.positive ? '#ef7770' : '#79b9ee';
    return <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-black/75 shadow-lg" role="img"
        aria-label={`${view.positive ? 'Positive' : 'Negative'} polarity. R to switch.${view.surge ? ' Magnet slam ready.' : ''}`}>
        <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full" aria-hidden="true">
            {view.surge && <circle cx="24" cy="24" r="22" fill="none" stroke="#e5c477" strokeWidth="2" strokeDasharray={Math.PI * 44} strokeDashoffset={Math.PI * 44 * (1 - view.fraction)} transform="rotate(-90 24 24)" />}
            <path d="M15 15v12a9 9 0 0 0 18 0V15h-6v12a3 3 0 0 1-6 0V15Z" fill={color} />
            <path d="M15 18h6m6 0h6" stroke="#fff" strokeWidth="2" />
            <path d={view.positive ? 'M21 10h6m-3-3v6' : 'M21 10h6'} stroke={color} strokeWidth="2" />
        </svg>
        <kbd className="absolute -bottom-1 -right-1 rounded-sm border border-white/40 bg-[#20221f] px-1 font-sans text-[10px] leading-4 text-white">R</kbd>
        {view.surge && <svg viewBox="0 0 16 16" className="absolute -left-2 -top-1 h-5 w-5 rounded bg-black/80 text-[#e5c477]" aria-hidden="true"><path d="m3 13 9-10 1 1-9 10m-2-5 5 5M9 2h5v5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>}
    </div>;
};
