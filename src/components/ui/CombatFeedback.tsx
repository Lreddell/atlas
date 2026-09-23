import React, { useEffect, useState } from 'react';
import { gameEvents } from '../../systems/events/GameEvents';
import { motionStatus } from '../../systems/player/playerMotion';
import { climbSurfaces } from '../../systems/player/climbSurfaces';
import { inputState } from '../../systems/player/playerInput';
import { PolarityIndicator } from './PolarityIndicator';

const CIRCUMFERENCE = 2 * Math.PI * 17;

/**
 * The live kit state, sampled off the physics rather than pushed, and coarsened
 * so React only re-renders when something visibly changed.
 */
function useCombatView() {
    const [view, setView] = useState(() => ({ ...motionStatus, dodged: false, shocked: false, refused: false, flux: 0, aligned: false }));
    useEffect(() => {
        let dodgedAt = 0, shockedAt = 0;
        const offDodge = gameEvents.on('player:dodged', () => { dodgedAt = Date.now(); });
        const offShock = gameEvents.on('player:shocked', () => { shockedAt = Date.now(); });
        let last = '';
        const poll = window.setInterval(() => {
            const zone = climbSurfaces.attachedZone ? climbSurfaces.get(climbSurfaces.attachedZone) : null;
            const open = zone && !zone.retiring && climbSurfaces.clock >= zone.opensAt && climbSurfaces.clock < zone.until;
            const now = Date.now();
            const next = { ...motionStatus, stamina: Math.floor(motionStatus.stamina * 10) / 10,
                cooldown: Math.round(motionStatus.cooldown * 40) / 40,
                recoverySeconds: Math.max(0, Math.ceil((motionStatus.recoverySeconds - 1e-6) * 10) / 10),
                refused: now - motionStatus.refusedAt < 400, dodged: now - dodgedAt < 500, shocked: now - shockedAt < 1200,
                flux: open ? Math.max(0, Math.min(1, (zone.until - climbSurfaces.clock) / Math.max(0.001, zone.until - zone.opensAt))) : 0,
                aligned: !!open && inputState.magneticPolarity !== 0 && Math.sign(inputState.magneticPolarity) !== Math.sign(zone.polarity) };
            const key = JSON.stringify(next);
            if (key !== last) { last = key; setView(next); }
        }, 40);
        return () => { offDodge(); offShock(); window.clearInterval(poll); };
    }, []);
    return view;
}

/** Contextual gauges share the HUD's layout with the item name and vitals. */
export const CombatFeedback: React.FC<{ magnetic?: boolean }> = ({ magnetic = false }) => {
    const view = useCombatView();
    return <div className="pointer-events-none flex w-full flex-col items-center gap-2 select-none">
        {view.stamina < 100 && <div className="h-2 w-[180px] max-w-full border border-black bg-black/60" role="meter" aria-label="Roll stamina" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(view.stamina)}>
            <div className="h-full bg-[#83bd63] transition-[width] duration-75 motion-reduce:transition-none" style={{ width: `${view.stamina}%` }} />
        </div>}
        {magnetic && <PolarityIndicator />}
    </div>;
};

/**
 * The parts of the kit readout that belong to the middle of the screen rather
 * than the HUD's bottom stack: the dodge dial around the crosshair, the
 * tower-flip prompt, and the hit flashes.
 *
 * A plain layer inside the HUD, NOT a portal to <body>. A portal escapes the
 * app's stacking context, so these floated over the pause menu and the
 * inventory, unblurred, while the hotbar and the hearts sat behind them. At
 * z-40, alongside the hotbar, they are covered and blurred by exactly the same
 * things the rest of the HUD is.
 */
export const CombatOverlay: React.FC = () => {
    const view = useCombatView();
    return <div className="pointer-events-none absolute inset-0 z-40 select-none">
        {(view.cooldown > 0.001 || view.refused) && <svg
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            width="44" height="44" viewBox="0 0 44 44" role="img" aria-label="Dodge recovery"
        >
            <circle cx="22" cy="22" r="17" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="4" />
            <circle cx="22" cy="22" r="17" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (view.refused ? 0 : view.cooldown)}
                transform="rotate(-90 22 22)" opacity={view.refused ? 0.95 : 0.8} />
        </svg>}
        {view.flux > 0 && !view.aligned && <div className="absolute left-1/2 top-[34%] w-[92px] -translate-x-1/2" role="status" aria-label="Tower flipping: press R to hold on">
            <div className="mb-1 text-center font-pixel text-xs text-white [text-shadow:1px_1px_0_#000]">R SWITCH</div>
            <div className="h-1 border border-black bg-black/60"><div className="h-full bg-white" style={{ width: `${view.flux * 100}%` }} /></div>
        </div>}
        {view.shocked && !view.flux && <div className="absolute left-1/2 top-[34%] -translate-x-1/2 font-pixel text-xs text-white [text-shadow:1px_1px_0_#000]" role="status" aria-label="Shocked off: wrong polarity">SHOCKED OFF</div>}
        {view.dodged && <div className="absolute left-1/2 top-[55%] -translate-x-1/2 text-lg text-white drop-shadow-[0_1px_2px_#000]" role="status" aria-label="Attack dodged">✓</div>}
    </div>;
};
