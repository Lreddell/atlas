import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { gameEvents } from '../../systems/events/GameEvents';
import { motionStatus, ROLL_STAMINA_COST } from '../../systems/player/playerMotion';
import { climbSurfaces } from '../../systems/player/climbSurfaces';
import { inputState } from '../../systems/player/playerInput';
import { PolarityIndicator } from './PolarityIndicator';

const CIRCUMFERENCE = 2 * Math.PI * 17;

/** Contextual gauges share the HUD's layout with the item name and vitals. */
export const CombatFeedback: React.FC<{ magnetic?: boolean }> = ({ magnetic = false }) => {
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
                refused: now - motionStatus.refusedAt < 500, dodged: now - dodgedAt < 500, shocked: now - shockedAt < 1200,
                flux: open ? Math.max(0, Math.min(1, (zone.until - climbSurfaces.clock) / Math.max(0.001, zone.until - zone.opensAt))) : 0,
                aligned: !!open && inputState.magneticPolarity !== 0 && Math.sign(inputState.magneticPolarity) !== Math.sign(zone.polarity) };
            const key = JSON.stringify(next);
            if (key !== last) { last = key; setView(next); }
        }, 40);
        return () => { offDodge(); offShock(); window.clearInterval(poll); };
    }, []);

    const low = view.stamina < ROLL_STAMINA_COST;
    const active = view.stamina < 100 || view.cooldown > 0 || view.refused;
    const move = view.action !== 'none' ? view.action : view.prompt;
    const label = move === 'dash' ? 'Magnetic dash' : move === 'leap' ? 'Repel leap' : 'Dodge roll';
    const status = view.ready ? 'Ready' : view.recoverySeconds > 0 ? `${view.recoverySeconds.toFixed(1)} seconds recovery` : low ? 'Not enough stamina' : 'Unavailable';
    const iconColor = view.ready ? '#b9d99e' : view.recoverySeconds <= 0 ? '#e4ae55' : '#e4e5df';

    return <div className="pointer-events-none flex w-full flex-col items-center gap-2 select-none">
        {active && <div className={`flex ${view.stamina < 100 ? 'w-[280px]' : 'w-[100px]'} max-w-full items-center gap-3 rounded border px-3 py-2 shadow-lg ${view.refused ? 'border-amber-400/80 bg-black/80' : 'border-white/20 bg-black/70'}`}>
            <div className="relative h-10 w-10 shrink-0" role="img" aria-label={`${label}: ${status}`}>
                <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden="true">
                    <circle cx="20" cy="20" r="17" fill="none" stroke="#ffffff30" strokeWidth="2" />
                    <circle cx="20" cy="20" r="17" fill="none" stroke={iconColor} strokeWidth="2"
                        strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * view.cooldown} transform="rotate(-90 20 20)" />
                    <g fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {move === 'dash' || move === 'leap' ? <path d="m13 14 7 6-7 6m8-12 7 6-7 6M8 20h12" /> : <><circle cx="22" cy="13" r="2" /><path d="m20 18-6 3 2 6h7l4-5-5-3-3 6m-9-9 3-3M9 22H6" /></>}
                    </g>
                </svg>
                <kbd className="absolute -bottom-1 -right-1 rounded-sm border border-white/40 bg-[#20221f] px-1 font-sans text-[10px] leading-4 text-white">C</kbd>
            </div>
            <div className="min-w-0 flex-1">
                {view.stamina < 100 && <div role="meter" aria-label="Stamina" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(view.stamina)} aria-valuetext={`${Math.floor(view.stamina / ROLL_STAMINA_COST)} rolls available`}>
                    <div className="relative h-3 overflow-hidden rounded-sm border border-white/25 bg-black/80">
                        <div className="h-full transition-[width] duration-75 motion-reduce:transition-none" style={{ width: `${view.stamina}%`, background: low ? '#e4ae55' : '#83bd63', boxShadow: 'inset 0 2px 0 #ffffff30' }} />
                        {[30, 60, 90].map(at => <span key={at} className="absolute inset-y-0 w-px bg-black/70" style={{ left: `${at}%` }} />)}
                    </div>
                </div>}
                <div className="mt-1 flex h-3 items-center justify-between text-[10px] tabular-nums text-white/70" aria-hidden="true">
                    <span>{low ? '△' : view.ready ? '✓' : view.recoverySeconds > 0 ? '↻' : '×'}</span>
                    <span>{view.recoverySeconds > 0 ? `${view.recoverySeconds.toFixed(1)}s` : view.ready ? '✓' : '×'}</span>
                </div>
            </div>
        </div>}
        {magnetic && <PolarityIndicator />}
        {createPortal(<div className="pointer-events-none fixed inset-0 z-[145] select-none">
            {view.flux > 0 && <div className={`absolute left-1/2 top-[34%] flex -translate-x-1/2 items-center gap-2 rounded border bg-black/80 px-3 py-2 ${view.aligned ? 'border-green-300/50 text-green-200' : 'border-amber-300/60 text-amber-200'}`} role="status" aria-label={view.aligned ? 'Polarity aligned: hold on' : 'Tower flipping: press R to hold on'}>
                <span aria-hidden="true" className="text-xl">{view.aligned ? '✓' : '↔'}</span>
                {!view.aligned && <kbd className="rounded border border-current px-1.5 font-sans text-sm">R</kbd>}
                <div className="h-1 w-16 bg-white/15"><div className="h-full bg-current" style={{ width: `${view.flux * 100}%` }} /></div>
            </div>}
            {view.shocked && !view.flux && <div className="absolute left-1/2 top-[34%] -translate-x-1/2 rounded bg-black/75 px-2 text-xl text-amber-200" role="status" aria-label="Shocked off: wrong polarity">⚡</div>}
            {view.dodged && <div className="absolute left-1/2 top-[55%] -translate-x-1/2 text-lg text-white drop-shadow-[0_1px_2px_#000]" role="status" aria-label="Attack dodged">✓</div>}
        </div>, document.body)}
    </div>;
};
