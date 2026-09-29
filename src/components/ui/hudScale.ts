import { useEffect, useState } from 'react';

// The HUD's pixel scale: how many screen pixels one art pixel of the hotbar,
// the vitals and the readouts stacked above them takes. That part of the HUD is
// drawn on an art-pixel grid (a slot is 24 art pixels, the item in it 16, a
// heart 11), so every piece keeps the same proportions at every scale and pixel
// art stays on whole pixels. 2 is its original size. The scale is picked from
// the window like Minecraft's automatic GUI scale: 2 on small windows, 3 at
// 1920x1080, where the hotbar is 720px across (Minecraft's is 728px), and more
// on larger screens.
export const hudScaleFor = (width: number, height: number): number =>
    Math.max(2, Math.min(Math.floor(width / 560), Math.floor(height / 300)));

const windowHudScale = (): number =>
    typeof window === 'undefined' ? 2 : hudScaleFor(window.innerWidth, window.innerHeight);

export function useHudScale(): number {
    const [scale, setScale] = useState(windowHudScale);
    useEffect(() => {
        const update = () => setScale(windowHudScale());
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);
    return scale;
}
