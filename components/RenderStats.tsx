
import { useFrame } from '@react-three/fiber';
import React, { useRef } from 'react';

// This component runs inside the Canvas and measures actual render loop frequency
export const RenderStats = ({ fpsRef }: { fpsRef: React.MutableRefObject<number> }) => {
    const frames = useRef(0);
    const lastTime = useRef(performance.now());

    useFrame(() => {
        const now = performance.now();
        frames.current++;
        
        if (now - lastTime.current >= 1000) {
            fpsRef.current = Math.round((frames.current * 1000) / (now - lastTime.current));
            frames.current = 0;
            lastTime.current = now;
        }
    });

    return null;
};
