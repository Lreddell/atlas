import React, { useEffect, useState } from 'react';
import { gameEvents } from '../../systems/events/GameEvents';
import { inputState } from '../../systems/player/playerInput';

// Shows the player's current magnetic polarity. Rendered only while polarity
// boots are equipped (controllable mode). Reacts to the R-key toggle via the
// ability:changed event.
export const PolarityIndicator: React.FC = () => {
    const [positive, setPositive] = useState(inputState.magneticPolarity > 0);

    useEffect(() => {
        setPositive(inputState.magneticPolarity > 0);
        return gameEvents.on('ability:changed', ({ abilityId, active }) => {
            if (abilityId === 'polarity') setPositive(active);
        });
    }, []);

    return (
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-[150] -translate-x-1/2 select-none text-center">
            <div
                className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-3xl font-bold text-white [text-shadow:1px_1px_0_#000] ${
                    positive ? 'border-red-300 bg-red-600/80' : 'border-blue-300 bg-blue-600/80'
                }`}
            >
                {positive ? '+' : '−'}
            </div>
            <div className="mt-1 font-minecraft text-xs text-white [text-shadow:1px_1px_0_#000]">Polarity (R)</div>
        </div>
    );
};
