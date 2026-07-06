import React, { useEffect, useMemo, useState } from 'react';
import { FUTURE_SPLASH_TEASERS_A } from './futureSplashTeasersA';
import { FUTURE_SPLASH_TEASERS_B } from './futureSplashTeasersB';
import { useSplashAnimation as useBaseSplashAnimation } from './useSplashAnimationBase';
import type { FormattedSplashSegment } from './useSplashAnimationBase';

export type { FormattedSplashSegment } from './useSplashAnimationBase';

const EXTRA_SPLASH_INTERVAL_MS = 10000;
const EXTRA_SPLASH_CHANCE = 0.28;
const EXTRA_SPLASH_COLOR = '#fde047';

const EXTRA_SPLASHES = [
    'Build. Break. Explore.',
    'The field is pulling...',
    'Same repels. Opposite attracts.',
    'Find the sealed regions.',
    'Break the shield crystals.',
    'The Warden is waiting.',
    'Climb the magnetic walls.',
    'Bring better armor.',
    'The coast keeps going.',
    'Caves go deeper now.',
    'Mind the spike blocks.',
    'One more ridge.',
    'One more cave.',
    'One more boss.',
    'The compass is lying again.',
    'The Magnetic Fields are closer than they look.',
    'Somewhere, a sealed region is waiting.',
    'The Warden heard that.',
    'Do not trust the quiet cave.',
    'There is always another chunk.',
    'The next seed might be the one.',
    'The arena is waiting.',
    'Polarity check!',
    'Boots on. Gravity optional.',
    'Follow the pylons.',
    'The seal remembers.',
    ...FUTURE_SPLASH_TEASERS_A,
    ...FUTURE_SPLASH_TEASERS_B,
];

const isIrrelevantBaseSplash = (value: string) =>
    value === 'Open source!' || value.includes('@') || value.includes('wrote this splash');

const pickExtraSplash = () => EXTRA_SPLASHES[Math.floor(Math.random() * EXTRA_SPLASHES.length)] ?? null;

const getSplashFontSize = (value: string) => {
    const baseSize = 20;
    const threshold = 20;
    const scale = Math.max(0.5, Math.min(1, threshold / Math.max(1, value.length)));
    return baseSize * scale;
};

export const useSplashAnimation = (isActive: boolean) => {
    const baseSplash = useBaseSplashAnimation(isActive);
    const [extraSplash, setExtraSplash] = useState<string | null>(null);

    useEffect(() => {
        if (!isActive) {
            setExtraSplash(null);
            return undefined;
        }

        const chooseSplash = () => {
            setExtraSplash(Math.random() < EXTRA_SPLASH_CHANCE ? pickExtraSplash() : null);
        };

        chooseSplash();
        const interval = window.setInterval(chooseSplash, EXTRA_SPLASH_INTERVAL_MS);
        return () => window.clearInterval(interval);
    }, [isActive]);

    const baseSplashText = baseSplash.formattedSplash.map((segment) => segment.text).join('');
    const displayedExtraSplash = extraSplash || (isIrrelevantBaseSplash(baseSplashText) ? pickExtraSplash() : null);

    const formattedSplash = useMemo<FormattedSplashSegment[]>(() => {
        if (!displayedExtraSplash) return baseSplash.formattedSplash;
        return [{
            text: displayedExtraSplash,
            style: {
                color: EXTRA_SPLASH_COLOR,
                fontWeight: 700,
            },
        }];
    }, [baseSplash.formattedSplash, displayedExtraSplash]);

    return {
        formattedSplash,
        splashFontSize: displayedExtraSplash ? getSplashFontSize(displayedExtraSplash) : baseSplash.splashFontSize,
    };
};
