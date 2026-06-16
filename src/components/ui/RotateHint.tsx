import { useEffect, useState } from 'react';

/**
 * Full-screen "please rotate" hint shown on phones held in portrait, where the
 * touch controls would crowd the HUD. Landscape is the intended play orientation.
 * Renders nothing in landscape, so it never affects desktop or rotated phones.
 */
export const RotateHint = () => {
    const [portrait, setPortrait] = useState(false);

    useEffect(() => {
        const check = () => setPortrait(window.innerHeight > window.innerWidth);
        check();
        window.addEventListener('resize', check);
        window.addEventListener('orientationchange', check);
        return () => {
            window.removeEventListener('resize', check);
            window.removeEventListener('orientationchange', check);
        };
    }, []);

    if (!portrait) return null;

    return (
        <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center text-white text-center px-8 select-none" style={{ touchAction: 'none' }}>
            <div className="text-5xl mb-4">⟳</div>
            <div className="text-xl font-bold mb-2">Rotate your device</div>
            <div className="text-sm opacity-80">Atlas plays best in landscape.</div>
        </div>
    );
};
