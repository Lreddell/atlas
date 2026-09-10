import React, { useEffect, useState } from 'react';
import { bossSummon } from '../../systems/boss/bossSummon';
import { bellTitanCinematic } from '../../systems/boss/bellTitanCinematic';
import { wardenDefeat } from '../../systems/boss/wardenDefeat';

// Full-screen layers for the cutscenes: the summon's black fade, and the white
// blow-out of the Warden's core when it dies. Both read their controller's value
// on each tick (via subscribe) so they are frame-accurate without an animation
// loop of their own. Sits below the HUD but above the world.
export const CinematicOverlay: React.FC = () => {
    const [fade, setFade] = useState(0);
    const [flash, setFlash] = useState(0);

    useEffect(() => {
        const update = () => {
            setFade(Math.max(bossSummon.fade, bellTitanCinematic.fade, wardenDefeat.fade));
            setFlash(wardenDefeat.flash);
        };
        const offBoss = bossSummon.subscribe(update);
        const offTitan = bellTitanCinematic.subscribe(update);
        const offDefeat = wardenDefeat.subscribe(update);
        return () => { offBoss(); offTitan(); offDefeat(); };
    }, []);

    if (fade <= 0.001 && flash <= 0.001) return null;
    return (
        <>
            {fade > 0.001 && (
                <div
                    className="pointer-events-none absolute inset-0 z-[120] bg-black"
                    style={{ opacity: Math.max(0, Math.min(1, fade)) }}
                />
            )}
            {flash > 0.001 && (
                <div
                    className="pointer-events-none absolute inset-0 z-[121] bg-white"
                    style={{ opacity: Math.max(0, Math.min(1, flash)) }}
                />
            )}
        </>
    );
};
