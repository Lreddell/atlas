import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';

export const FPSLimiter = ({ limit }: { limit: number }) => {
  const { advance } = useThree();

  useLayoutEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let running = true;

    const clampedLimit = Math.max(10, Math.min(260, limit));
    const intervalMs = 1000 / clampedLimit;

    // Schedule against an absolute timeline so setTimeout overshoot doesn't
    // accumulate — the previous frame-cost-only compensation consistently
    // undershot the target FPS.
    let nextFrameAt = performance.now();

    const runLoop = () => {
      if (!running) return;

      advance(performance.now() / 1000);

      nextFrameAt += intervalMs;
      const now = performance.now();
      // If we fell more than one frame behind (tab hidden, long frame), resync
      // instead of bursting to catch up.
      if (now > nextFrameAt + intervalMs) nextFrameAt = now;
      timeoutId = setTimeout(runLoop, Math.max(0, nextFrameAt - now));
    };

    timeoutId = setTimeout(runLoop, 0);

    return () => {
      running = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [limit, advance]);

  return null;
};
