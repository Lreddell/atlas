import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';

export const FPSLimiter = ({ limit }: { limit: number }) => {
  const { advance } = useThree();

  useLayoutEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let running = true;

    const clampedLimit = Math.max(10, Math.min(260, limit));
    const intervalMs = 1000 / clampedLimit;

    const runLoop = () => {
      if (!running) return;

      const frameStart = performance.now();
      advance(frameStart / 1000);

      const frameCost = performance.now() - frameStart;
      const delay = Math.max(0, intervalMs - frameCost);
      timeoutId = setTimeout(runLoop, delay);
    };

    timeoutId = setTimeout(runLoop, 0);

    return () => {
      running = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [limit, advance]);

  return null;
};
