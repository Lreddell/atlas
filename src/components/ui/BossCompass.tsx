import React, { useEffect, useState } from 'react';
import { bossCompassState } from '../../systems/boss/bossCompassState';

// An off-screen boss indicator: an arrow riding the edge of a ring around the
// crosshair, pointing the way to turn, tinted the boss's current polarity and
// labelled with the distance (and an up-marker when it hovers above you).
// Polls the tracker state at HUD rate; hidden while the boss is in view.

const RING_RADIUS = 150;

export const BossCompass: React.FC = () => {
    const [view, setView] = useState({ visible: false, angle: 0, distance: 0, polarity: 1, above: false });

    useEffect(() => {
        let last = '';
        const id = window.setInterval(() => {
            const s = bossCompassState;
            const visible = s.active && !s.onScreen;
            const next = { visible, angle: visible ? s.angle : 0, distance: Math.round(s.distance), polarity: s.polarity, above: s.above };
            const key = `${next.visible}|${next.angle.toFixed(2)}|${next.distance}|${next.polarity}|${next.above}`;
            if (key === last) return;
            last = key;
            setView(next);
        }, 40);
        return () => window.clearInterval(id);
    }, []);

    if (!view.visible) return null;
    const colour = view.polarity < 0 ? '#5ab0ff' : '#ff6a6a';
    const x = Math.sin(view.angle) * RING_RADIUS;
    const y = -Math.cos(view.angle) * RING_RADIUS;
    const degrees = (view.angle * 180) / Math.PI;

    return (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[140] select-none">
            <div
                className="absolute flex flex-col items-center"
                style={{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%)` }}
            >
                <svg width="34" height="34" viewBox="0 0 34 34" style={{ transform: `rotate(${degrees}deg)` }} shapeRendering="crispEdges">
                    <polygon points="17,2 30,28 17,21 4,28" fill={colour} stroke="#000" strokeWidth="2" />
                </svg>
                <div className="mt-[2px] whitespace-nowrap font-pixel text-[11px] text-white [text-shadow:1px_1px_0_#000,-1px_-1px_0_#000]">
                    {view.above ? '▲ ' : ''}{view.distance}m
                </div>
            </div>
        </div>
    );
};
