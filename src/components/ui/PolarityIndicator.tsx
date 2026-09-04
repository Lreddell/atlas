import React, { useEffect, useRef, useState } from 'react';
import { gameEvents } from '../../systems/events/GameEvents';
import { inputState } from '../../systems/player/playerInput';
import { getPolaritySoundEvent } from '../../systems/player/polarityFeedback';
import { soundManager } from '../../systems/sound/SoundManager';
import { motionStatus } from '../../systems/player/playerMotion';
import { climbSurfaces } from '../../systems/player/climbSurfaces';

// The player's polarity (the magnet block icon + label) with the F kit beneath
// it: what F does right now (roll / dash / leap / launch), its cooldown, an
// armed Magnet Slam, a dodged hit, and, while clinging to one of the Warden's
// towers, the flip warning with its countdown ("flip R to hold"). The kit state
// is plain mutable data, polled at HUD rate.

const PROMPTS: Record<string, string> = {
    roll: 'ROLL',
    dash: 'MAGNETIC DASH',
    leap: 'REPEL LEAP',
    'jump-off': 'LAUNCH',
    none: '',
};

interface KitView {
    prompt: string;
    cooldown: number;
    surge: boolean;
    surgeFraction: number;
    flux: { remaining: number; total: number } | null;
}

export const PolarityIndicator: React.FC = () => {
    const [positive, setPositive] = useState(inputState.magneticPolarity > 0);
    const [switching, setSwitching] = useState(false);
    const [kit, setKit] = useState<KitView>({ prompt: 'roll', cooldown: 0, surge: false, surgeFraction: 0, flux: null });
    const [dodged, setDodged] = useState(0);
    const [shocked, setShocked] = useState(0);
    const resetTimerRef = useRef<number | null>(null);

    useEffect(() => {
        setPositive(inputState.magneticPolarity > 0);
        const unsubscribe = gameEvents.on('ability:changed', ({ abilityId, active }) => {
            if (abilityId !== 'polarity') return;

            setPositive(active);
            setSwitching(true);
            soundManager.play(getPolaritySoundEvent(active));

            if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
            resetTimerRef.current = window.setTimeout(() => {
                setSwitching(false);
                resetTimerRef.current = null;
            }, 180);
        });
        const offDodged = gameEvents.on('player:dodged', () => setDodged(Date.now()));
        const offShocked = gameEvents.on('player:shocked', () => setShocked(Date.now()));

        let last = '';
        const poll = window.setInterval(() => {
            const zone = climbSurfaces.attachedZone ? climbSurfaces.get(climbSurfaces.attachedZone) : null;
            const now = climbSurfaces.clock;
            const flux = zone && now >= zone.opensAt && now < zone.until
                ? { remaining: zone.until - now, total: Math.max(0.001, zone.until - zone.opensAt) }
                : null;
            const next: KitView = {
                prompt: motionStatus.prompt,
                cooldown: Math.round(motionStatus.cooldown * 20) / 20,
                surge: motionStatus.surge,
                surgeFraction: Math.round(motionStatus.surgeFraction * 20) / 20,
                flux: flux ? { remaining: Math.round(flux.remaining * 20) / 20, total: flux.total } : null,
            };
            const key = `${next.prompt}|${next.cooldown}|${next.surge}|${next.surgeFraction}|${next.flux ? next.flux.remaining : 'x'}`;
            if (key === last) return;
            last = key;
            setKit(next);
        }, 50);

        return () => {
            unsubscribe();
            offDodged();
            offShocked();
            window.clearInterval(poll);
            if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
        };
    }, []);

    const texturePath = positive
        ? 'assets/textures/blocks/positive_magnet.png'
        : 'assets/textures/blocks/negative_magnet.png';
    const prompt = PROMPTS[kit.prompt] ?? '';
    const showDodged = Date.now() - dodged < 700;
    const showShocked = Date.now() - shocked < 1200;
    const fluxFraction = kit.flux ? Math.max(0, Math.min(1, kit.flux.remaining / kit.flux.total)) : 0;

    return (
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-[150] w-[220px] -translate-x-1/2 select-none text-center">
            {kit.flux && (
                <div className="mx-auto mb-2 w-[200px] border-2 border-[#1a1a1a] bg-black/70 px-2 py-1 shadow-[2px_2px_0_#000]">
                    <div className="animate-pulse whitespace-nowrap font-pixel text-[11px] text-[#ffd166] [text-shadow:1px_1px_0_#000]">
                        TOWER FLIPPING · flip (R) to hold
                    </div>
                    <div className="mt-1 h-[6px] w-full border border-black/80 bg-[#2b2338]">
                        <div className="h-full bg-[#ffd166]" style={{ width: `${fluxFraction * 100}%` }} />
                    </div>
                </div>
            )}
            {showShocked && !kit.flux && (
                <div className="mx-auto mb-2 whitespace-nowrap font-pixel text-[11px] text-[#ff8a80] [text-shadow:1px_1px_0_#000]">
                    SHOCKED OFF · wrong polarity
                </div>
            )}
            <div
                className={`mx-auto h-14 w-14 border-4 border-[#1a1a1a] bg-[#777] p-1 shadow-[inset_2px_2px_0_#d8d8d8,inset_-2px_-2px_0_#3a3a3a,2px_2px_0_#000] transition-[transform,filter,box-shadow] duration-150 ${
                    switching ? 'scale-125 brightness-150' : 'scale-100 brightness-100'
                } ${kit.surge ? 'shadow-[0_0_14px_4px_rgba(255,255,255,0.75)]' : ''}`}
            >
                <img
                    src={texturePath}
                    alt=""
                    className="h-full w-full"
                    style={{ imageRendering: 'pixelated' }}
                />
            </div>
            <div className="mt-1 whitespace-nowrap font-pixel text-xs text-white [text-shadow:1px_1px_0_#000,-1px_-1px_0_#000]">
                {positive ? 'Positive (R)' : 'Negative (R)'}
            </div>
            {prompt && (
                <div className="mt-1 flex flex-col items-center">
                    <div className={`whitespace-nowrap font-pixel text-[10px] [text-shadow:1px_1px_0_#000] ${kit.cooldown > 0 ? 'text-[#8a8a99]' : kit.prompt === 'dash' ? 'text-[#c9a3ff]' : 'text-[#e6d8ff]'}`}>
                        F · {prompt}
                    </div>
                    <div className="mt-[2px] h-[4px] w-[84px] border border-black/80 bg-[#2b2338]">
                        <div className="h-full bg-[#b388ff]" style={{ width: `${(1 - kit.cooldown) * 100}%` }} />
                    </div>
                </div>
            )}
            {kit.surge && (
                <div className="mt-1 flex flex-col items-center">
                    <div className="animate-pulse whitespace-nowrap font-pixel text-[10px] text-white [text-shadow:1px_1px_0_#000]">
                        MAGNET SLAM READY · strike
                    </div>
                    <div className="mt-[2px] h-[4px] w-[84px] border border-black/80 bg-[#2b2338]">
                        <div className="h-full bg-white" style={{ width: `${kit.surgeFraction * 100}%` }} />
                    </div>
                </div>
            )}
            {showDodged && (
                <div className="mt-1 whitespace-nowrap font-pixel text-[10px] text-[#a5ffb8] [text-shadow:1px_1px_0_#000]">
                    DODGED
                </div>
            )}
        </div>
    );
};
