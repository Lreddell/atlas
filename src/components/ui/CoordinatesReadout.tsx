import React, { useEffect, useState } from 'react';

// The player's block position, top-left, when the world's Show Coordinates
// option is on (World Options). Polled ten times a second rather than every
// frame: it only needs to keep up with walking.

interface CoordinatesReadoutProps {
    positionRef: React.MutableRefObject<{ x: number; y: number; z: number }>;
}

export const CoordinatesReadout: React.FC<CoordinatesReadoutProps> = ({ positionRef }) => {
    const [position, setPosition] = useState(() => ({ x: 0, y: 0, z: 0 }));

    useEffect(() => {
        const read = () => {
            const p = positionRef.current;
            const next = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
            setPosition((prev) => (prev.x === next.x && prev.y === next.y && prev.z === next.z ? prev : next));
        };
        read();
        const timer = window.setInterval(read, 100);
        return () => window.clearInterval(timer);
    }, [positionRef]);

    return (
        <div
            className="pointer-events-none absolute left-2 top-2 z-40 select-none bg-black/40 px-2 py-1 font-pixel text-sm text-white [text-shadow:1px_1px_0_#000]"
            aria-label={`Position ${position.x}, ${position.y}, ${position.z}`}
        >
            Position: {position.x}, {position.y}, {position.z}
        </div>
    );
};
