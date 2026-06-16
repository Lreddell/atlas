import React, { useCallback, useEffect, useRef, useState } from 'react';
import { inputState, resetInputState } from '../../systems/player/playerInput';
import { mobileInput, resetMobileInput } from '../../systems/player/mobileInput';
import { soundManager } from '../../systems/sound/SoundManager';

interface MobileControlsProps {
    gameMode: 'survival' | 'creative' | 'spectator';
    onPause: () => void;
    onToggleInventory: () => void;
}

// Tuning.
const JOY_RADIUS = 56;       // px from joystick center to knob max
const JOY_DEADZONE = 0.22;   // ignore tiny wobble (anti-drift)
const JOY_DIR = 0.38;        // ~sin(22.5°): when a component passes this, that direction is pressed (enables diagonals)
const JOY_SPRINT = 0.92;     // push to the rim to sprint

/**
 * Touch overlay: a virtual movement joystick, a drag-to-look surface, and
 * break/use/jump/sneak/inventory/pause buttons. Everything writes into the existing
 * inputState (movement) and the mobileInput scratch (look + actions) — no parallel
 * movement pipeline and no per-frame React state. Rendered only on touch devices
 * while actively playing; unmounting clears all input it owns.
 */
export const MobileControls: React.FC<MobileControlsProps> = ({ gameMode, onPause, onToggleInventory }) => {
    const [sneakOn, setSneakOn] = useState(false);

    // Joystick refs (no re-render while dragging).
    const joyBaseRef = useRef<HTMLDivElement>(null);
    const joyKnobRef = useRef<HTMLDivElement>(null);
    const joyPointerId = useRef<number | null>(null);
    const joyCenter = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    // Look surface refs.
    const lookPointerId = useRef<number | null>(null);
    const lookLast = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const firstGesture = useRef(false);
    const onFirstGesture = () => {
        if (firstGesture.current) return;
        firstGesture.current = true;
        soundManager.resume(); // browsers require a gesture before audio can play
    };

    const clearMovement = () => {
        inputState.forward = inputState.backward = inputState.left = inputState.right = false;
        inputState.sprint = false;
    };

    // Reset everything this overlay owns when it unmounts (e.g. pause / inventory).
    useEffect(() => () => { resetInputState(); resetMobileInput(); }, []);

    // ---- Joystick ----
    const setKnob = (dx: number, dy: number) => {
        if (joyKnobRef.current) joyKnobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const applyJoystick = (px: number, py: number) => {
        const dx = px - joyCenter.current.x;
        const dy = py - joyCenter.current.y;
        const len = Math.hypot(dx, dy) || 1;
        const mag = Math.min(len / JOY_RADIUS, 1);
        const clampLen = Math.min(len, JOY_RADIUS);
        setKnob((dx / len) * clampLen, (dy / len) * clampLen);
        if (mag < JOY_DEADZONE) { clearMovement(); return; }
        const nx = dx / len, ny = dy / len; // screen space: +y is down
        inputState.forward = ny < -JOY_DIR;
        inputState.backward = ny > JOY_DIR;
        inputState.left = nx < -JOY_DIR;
        inputState.right = nx > JOY_DIR;
        inputState.sprint = mag > JOY_SPRINT && ny < -JOY_DIR; // only sprint while heading forward
    };
    const onJoyDown = (e: React.PointerEvent) => {
        if (joyPointerId.current !== null) return;
        onFirstGesture();
        e.preventDefault();
        const base = joyBaseRef.current;
        if (base) { const r = base.getBoundingClientRect(); joyCenter.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
        joyPointerId.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        applyJoystick(e.clientX, e.clientY);
    };
    const onJoyMove = (e: React.PointerEvent) => {
        if (e.pointerId !== joyPointerId.current) return;
        e.preventDefault();
        applyJoystick(e.clientX, e.clientY);
    };
    const onJoyUp = (e: React.PointerEvent) => {
        if (e.pointerId !== joyPointerId.current) return;
        e.preventDefault();
        joyPointerId.current = null;
        clearMovement();
        setKnob(0, 0);
    };

    // ---- Look surface ----
    const onLookDown = (e: React.PointerEvent) => {
        if (lookPointerId.current !== null) return;
        onFirstGesture();
        e.preventDefault();
        lookPointerId.current = e.pointerId;
        lookLast.current = { x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
    const onLookMove = (e: React.PointerEvent) => {
        if (e.pointerId !== lookPointerId.current) return;
        e.preventDefault();
        mobileInput.lookDX += e.clientX - lookLast.current.x;
        mobileInput.lookDY += e.clientY - lookLast.current.y;
        lookLast.current = { x: e.clientX, y: e.clientY };
    };
    const onLookUp = (e: React.PointerEvent) => {
        if (e.pointerId !== lookPointerId.current) return;
        lookPointerId.current = null;
    };

    // ---- Action buttons (hold semantics) ----
    const holdHandlers = (onDown: () => void, onUp: () => void) => ({
        onPointerDown: (e: React.PointerEvent) => { onFirstGesture(); e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); onDown(); },
        onPointerUp: (e: React.PointerEvent) => { e.preventDefault(); onUp(); },
        onPointerCancel: () => { onUp(); },
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    });

    const tapHandler = (fn: () => void) => ({
        onPointerDown: (e: React.PointerEvent) => { onFirstGesture(); e.preventDefault(); fn(); },
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    });

    const toggleSneak = useCallback(() => {
        setSneakOn(prev => { const next = !prev; inputState.sneak = next; return next; });
    }, []);

    const btnBase = 'pointer-events-auto select-none flex items-center justify-center rounded-full bg-black/40 border-2 border-white/30 text-white font-bold backdrop-blur-sm active:bg-white/30';

    return (
      <>
        {/* Look surface — its own layer at z-30, BELOW the HUD hotbar (z-40) so the
            hotbar stays tappable, and below the control buttons. Captures drags
            anywhere not on a control. */}
        <div
            className="fixed inset-0 z-30 pointer-events-auto"
            style={{ touchAction: 'none' }}
            onPointerDown={onLookDown}
            onPointerMove={onLookMove}
            onPointerUp={onLookUp}
            onPointerCancel={onLookUp}
            onContextMenu={(e) => e.preventDefault()}
        />

        {/* Controls layer — above the HUD so buttons/joystick are always tappable. */}
        <div className="fixed inset-0 z-[55] pointer-events-none" style={{ touchAction: 'none' }} onContextMenu={(e) => e.preventDefault()}>
            {/* Movement joystick (bottom-left) */}
            <div
                ref={joyBaseRef}
                className="absolute pointer-events-auto rounded-full bg-black/30 border-2 border-white/25"
                style={{ left: 'calc(env(safe-area-inset-left, 0px) + 18px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)', width: JOY_RADIUS * 2, height: JOY_RADIUS * 2, touchAction: 'none' }}
                onPointerDown={onJoyDown}
                onPointerMove={onJoyMove}
                onPointerUp={onJoyUp}
                onPointerCancel={onJoyUp}
            >
                <div ref={joyKnobRef} className="absolute rounded-full bg-white/40 border border-white/50" style={{ width: JOY_RADIUS, height: JOY_RADIUS, left: JOY_RADIUS / 2, top: JOY_RADIUS / 2, willChange: 'transform' }} />
            </div>

            {/* Right-side action cluster */}
            <div className="absolute flex flex-col items-end gap-3" style={{ right: 'calc(env(safe-area-inset-right, 0px) + 18px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
                <div className="flex items-end gap-3">
                    {/* Break (hold) */}
                    <button className={`${btnBase} w-16 h-16 text-2xl`} aria-label="Break" {...holdHandlers(() => { mobileInput.attack = true; }, () => { mobileInput.attack = false; })}>⛏</button>
                    {/* Use / place (tap = single use, hold = continuous) */}
                    <button
                        className={`${btnBase} w-20 h-20 text-3xl`}
                        aria-label="Use"
                        {...holdHandlers(() => { mobileInput.use = true; mobileInput.useTriggered = true; }, () => { mobileInput.use = false; })}
                    >✋</button>
                </div>
                <div className="flex items-end gap-3">
                    {/* Sneak (toggle) */}
                    <button className={`${btnBase} w-16 h-16 text-xl ${sneakOn ? 'bg-white/40' : ''}`} aria-label="Sneak" {...tapHandler(toggleSneak)}>⬇</button>
                    {/* Jump (hold) */}
                    <button className={`${btnBase} w-20 h-20 text-3xl`} aria-label="Jump" {...holdHandlers(() => { inputState.jump = true; }, () => { inputState.jump = false; })}>⤒</button>
                </div>
            </div>

            {/* Top-right utility buttons */}
            <div className="absolute flex gap-2" style={{ right: 'calc(env(safe-area-inset-right, 0px) + 12px)', top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
                {gameMode !== 'spectator' && (
                    <button className={`${btnBase} w-12 h-12 text-xl`} aria-label="Inventory" {...tapHandler(onToggleInventory)}>🎒</button>
                )}
                <button className={`${btnBase} w-12 h-12 text-xl`} aria-label="Pause" {...tapHandler(onPause)}>⏸</button>
            </div>
        </div>
      </>
    );
};
