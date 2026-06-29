import React, { useEffect, useState } from 'react';
import { bossSummon } from '../../systems/boss/bossSummon';

// Black fade layer for the summon cutscene. Reads bossSummon.fade each time the
// controller ticks (via subscribe) so the fade is frame-accurate without its own
// animation loop. Sits below the HUD but above the world.
export const CinematicOverlay: React.FC = () => {
    const [fade, setFade] = useState(0);

    useEffect(() => bossSummon.subscribe(() => setFade(bossSummon.fade)), []);

    if (fade <= 0.001) return null;
    return (
        <div
            className="pointer-events-none absolute inset-0 z-[120] bg-black"
            style={{ opacity: Math.max(0, Math.min(1, fade)) }}
        />
    );
};
