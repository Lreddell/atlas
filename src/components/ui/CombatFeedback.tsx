import React, { useEffect, useState } from 'react';
import { gameEvents } from '../../systems/events/GameEvents';
import { motionStatus } from '../../systems/player/playerMotion';
import { climbSurfaces } from '../../systems/player/climbSurfaces';

// Centre-screen combat feedback, drawn around the crosshair where the player is
// already looking:
//
//   - a cooldown ring that sweeps closed as the dodge recharges, so "why did
//     nothing happen?" is answered without a permanent prompt on the HUD;
//   - a red flash when a press could not be answered;
//   - a brief DODGED flash when an invulnerability window ate a hit;
//   - the tower flip warning while clinging to one of the Warden's towers,
//     which is the one piece of text urgent enough to sit in the player's eyeline.
//
// The kit publishes plain mutable state, so this polls at HUD rate rather than
// re-rendering the scene.

const RING_RADIUS = 17;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface FeedbackView {
    cooldown: number;
    refusedAt: number;
    dodgedAt: number;
    shockedAt: number;
    flux: { remaining: number; total: number } | null;
}

export const CombatFeedback: React.FC = () => {
    const [view, setView] = useState<FeedbackView>({ cooldown: 0, refusedAt: 0, dodgedAt: 0, shockedAt: 0, flux: null });

    useEffect(() => {
        let dodgedAt = 0;
        let shockedAt = 0;
        const offDodged = gameEvents.on('player:dodged', () => { dodgedAt = Date.now(); });
        const offShocked = gameEvents.on('player:shocked', () => { shockedAt = Date.now(); });

        let last = '';
        const poll = window.setInterval(() => {
            const zone = climbSurfaces.attachedZone ? climbSurfaces.get(climbSurfaces.attachedZone) : null;
            const now = climbSurfaces.clock;
            const open = zone !== null && now >= zone.opensAt && now < zone.until;
            const next: FeedbackView = {
                cooldown: Math.round(motionStatus.cooldown * 40) / 40,
                refusedAt: motionStatus.refusedAt,
                dodgedAt,
                shockedAt,
                flux: open && zone
                    ? { remaining: Math.round((zone.until - now) * 20) / 20, total: Math.max(0.001, zone.until - zone.opensAt) }
                    : null,
            };
            const key = `${next.cooldown}|${next.refusedAt}|${next.dodgedAt}|${next.shockedAt}|${next.flux ? next.flux.remaining : 'x'}`;
            if (key === last) return;
            last = key;
            setView(next);
        }, 40);

        return () => { offDodged(); offShocked(); window.clearInterval(poll); };
    }, []);

    const now = Date.now();
    const refused = now - view.refusedAt < 400;
    const dodged = now - view.dodgedAt < 650;
    const shocked = now - view.shockedAt < 1400;
    const cooling = view.cooldown > 0.001;
    const fluxFraction = view.flux ? Math.max(0, Math.min(1, view.flux.remaining / view.flux.total)) : 0;

    return (
        <div className="pointer-events-none absolute inset-0 z-[145] select-none">
            {/* Dodge cooldown ring around the crosshair. Hidden once ready, so a
                clean screen means "the kit will answer". */}
            {(cooling || refused) && (
                <svg
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                    width="44" height="44" viewBox="0 0 44 44"
                >
                    <circle
                        cx="22" cy="22" r={RING_RADIUS}
                        fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="4"
                    />
                    <circle
                        cx="22" cy="22" r={RING_RADIUS}
                        fill="none"
                        stroke={refused ? '#ff5252' : '#b388ff'}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={RING_CIRCUMFERENCE}
                        strokeDashoffset={RING_CIRCUMFERENCE * (refused ? 0 : view.cooldown)}
                        transform="rotate(-90 22 22)"
                        opacity={refused ? 0.95 : 0.8}
                    />
                </svg>
            )}

            {/* The tower is flipping: the climber has this long to answer with R. */}
            {view.flux && (
                <div className="absolute left-1/2 top-[34%] w-[260px] -translate-x-1/2 text-center">
                    <div className="animate-pulse whitespace-nowrap font-pixel text-sm text-[#ffd166] [text-shadow:2px_2px_0_#000]">
                        TOWER FLIPPING · press R to hold on
                    </div>
                    <div className="mx-auto mt-1 h-[6px] w-[180px] border-2 border-black/80 bg-[#2b2338]">
                        <div className="h-full bg-[#ffd166] transition-[width] duration-75" style={{ width: `${fluxFraction * 100}%` }} />
                    </div>
                </div>
            )}

            {shocked && !view.flux && (
                <div className="absolute left-1/2 top-[34%] -translate-x-1/2 whitespace-nowrap font-pixel text-sm text-[#ff8a80] [text-shadow:2px_2px_0_#000]">
                    SHOCKED OFF · wrong polarity
                </div>
            )}

            {dodged && (
                <div className="absolute left-1/2 top-[56%] -translate-x-1/2 whitespace-nowrap font-pixel text-xs text-[#a5ffb8] [text-shadow:1px_1px_0_#000]">
                    DODGED
                </div>
            )}
        </div>
    );
};
