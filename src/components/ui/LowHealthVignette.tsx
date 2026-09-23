import React, { useEffect, useRef, useState } from 'react';
import { gameEvents } from '../../systems/events/GameEvents';
import { lowHealthState } from '../../systems/player/lowHealthState';

// A crimson screen-edge rim that beats with the player's heart.
//
// LAYERING (this is the whole reason it is a separate component rather than a
// mode of PolarityVignette): it renders at z-20, one layer BELOW the polarity
// rim at z-30, and the ordering is explicit rather than left to DOM order.
// Polarity is information the player has to read during the Warden fight — red
// is positive, blue is negative — so a red damage rim must never sit on top of a
// blue one and make the player think they have the wrong polarity. Underneath,
// it darkens and broadens the edge without recolouring the sharp inner rim.
//
// There is deliberately no per-polarity special casing. A design that has to ask
// "what colour is the polarity right now" is a design that will read wrong on
// some frame; instead the pulse is broad, dark and low, so it coexists with
// either colour above it. The fire overlay and the water/lava head tint also sit
// at z-30, so they read over this too.

// The rim is deliberately heavy: at four hearts the player should feel hunted,
// not gently reminded. The blur radius still carries the falloff, so the middle
// of the screen stays readable however dark the edge gets.

/** The resting rim, before any beat: wider and darker as health falls. */
const restingSpread = (severity: number) => 62 + severity * 58;
const restingAlpha = (severity: number) => 0.30 + severity * 0.24;
/** How much a beat adds on top, at its peak. */
const pulseSpread = (severity: number) => 74 + severity * 86;
const pulseAlpha = (severity: number) => 0.26 + severity * 0.28;

/** A beat's visual decay. Short attack, longer falloff: a thump, not a blink. */
const PULSE_DECAY_MS = 460;

export const LowHealthVignette: React.FC = () => {
    const [active, setActive] = useState(() => lowHealthState.isActive());
    const [severity, setSeverity] = useState(() => lowHealthState.getSeverity());
    // The pulse is animated on rAF rather than by React state per frame: a
    // setState every ~16 ms for half a second, several times a minute, is a lot
    // of reconciliation for one box-shadow.
    const rimRef = useRef<HTMLDivElement>(null);
    const beatAt = useRef(0);
    const severityRef = useRef(severity);
    const activeRef = useRef(active);

    useEffect(() => { severityRef.current = severity; }, [severity]);
    useEffect(() => { activeRef.current = active; }, [active]);

    useEffect(() => {
        const offLow = gameEvents.on('player:low-health', (e) => {
            setActive(e.active);
            setSeverity(e.severity);
            if (!e.active) beatAt.current = 0;
        });
        // The pulse rides the exact scheduler event that fires the cue, so the
        // flash and the thump are the same instant by construction.
        const offBeat = gameEvents.on('player:heartbeat', (e) => {
            setSeverity(e.severity);
            beatAt.current = performance.now();
        });
        return () => { offLow(); offBeat(); };
    }, []);

    useEffect(() => {
        if (!active) return;
        let raf = 0;
        const draw = () => {
            const rim = rimRef.current;
            if (rim) {
                const s = severityRef.current;
                const since = performance.now() - beatAt.current;
                // Cubic falloff from the beat, clamped to nothing between beats.
                const t = beatAt.current === 0 ? 0 : Math.max(0, 1 - since / PULSE_DECAY_MS);
                const pulse = t * t * t;
                const spread = restingSpread(s) + pulseSpread(s) * pulse;
                const alpha = restingAlpha(s) + pulseAlpha(s) * pulse;
                rim.style.boxShadow = `inset 0 0 ${170 + spread * 1.5}px ${spread}px rgba(134, 9, 13, ${alpha.toFixed(3)})`;
            }
            raf = window.requestAnimationFrame(draw);
        };
        raf = window.requestAnimationFrame(draw);
        return () => window.cancelAnimationFrame(raf);
    }, [active]);

    if (!active) return null;
    return (
        <div
            ref={rimRef}
            className="pointer-events-none absolute inset-0 z-20"
            aria-hidden="true"
            style={{ boxShadow: `inset 0 0 ${170 + restingSpread(severity) * 1.5}px ${restingSpread(severity)}px rgba(134, 9, 13, ${restingAlpha(severity)})` }}
        />
    );
};
