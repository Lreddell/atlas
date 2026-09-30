import React, { useEffect, useState } from 'react';

// Hover hints in the kit's own tooltip, instead of the browser's grey box: an
// element with data-tip="..." shows it by the pointer after a moment, as a
// native title would. One host, mounted once at the root, serves them all.

const SHOW_DELAY_MS = 450;
const OFFSET_X = 16;
const OFFSET_Y = 22;
const MAX_WIDTH = 320;
const EDGE = 8;

interface Tip {
    text: string;
    x: number;
    y: number;
}

export const TooltipHost: React.FC = () => {
    const [tip, setTip] = useState<Tip | null>(null);

    useEffect(() => {
        let timer = 0;
        let target: Element | null = null;
        let pointer = { x: 0, y: 0 };

        const hide = () => {
            window.clearTimeout(timer);
            target = null;
            setTip(null);
        };
        const onOver = (event: PointerEvent) => {
            const element = (event.target as Element | null)?.closest?.('[data-tip]') ?? null;
            if (element === target) return;
            hide();
            if (!element) return;
            target = element;
            pointer = { x: event.clientX, y: event.clientY };
            timer = window.setTimeout(() => {
                const text = target?.isConnected ? target.getAttribute('data-tip') : null;
                if (text) setTip({ text, ...pointer });
            }, SHOW_DELAY_MS);
        };
        const onMove = (event: PointerEvent) => {
            pointer = { x: event.clientX, y: event.clientY };
            if (target && !target.isConnected) {
                hide();
                return;
            }
            setTip((current) => (current ? { ...current, ...pointer } : current));
        };

        document.addEventListener('pointerover', onOver, true);
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerdown', hide, true);
        document.addEventListener('keydown', hide, true);
        window.addEventListener('wheel', hide, { capture: true, passive: true });
        window.addEventListener('blur', hide);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('pointerover', onOver, true);
            document.removeEventListener('pointermove', onMove, true);
            document.removeEventListener('pointerdown', hide, true);
            document.removeEventListener('keydown', hide, true);
            window.removeEventListener('wheel', hide, { capture: true } as EventListenerOptions);
            window.removeEventListener('blur', hide);
        };
    }, []);

    if (!tip) return null;
    // Beside the pointer, kept on screen: to its left near the right edge,
    // above it near the bottom.
    const left = Math.max(EDGE, Math.min(tip.x + OFFSET_X, window.innerWidth - MAX_WIDTH - EDGE));
    const nearBottom = tip.y + OFFSET_Y + 48 > window.innerHeight;
    const top = nearBottom ? tip.y - OFFSET_Y - 32 : tip.y + OFFSET_Y;
    // Over every layer (the title screen is z-200, modals up to z-700): a hint
    // belongs to whatever the pointer is on, so it must never land behind it.
    return (
        <div
            role="tooltip"
            className="atlas-tooltip pointer-events-none fixed z-[1000] text-read text-parchment-100"
            style={{ left, top, maxWidth: MAX_WIDTH }}
        >
            {tip.text}
        </div>
    );
};
