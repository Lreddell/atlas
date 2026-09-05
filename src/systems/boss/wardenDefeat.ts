// Magnetic Warden defeat cinematic.
//
// A short self-driven (requestAnimationFrame) sequence, the bookend to the
// summon:
//   1. the camera cuts to a low angle as the Warden buckles, its core cracking
//   2. it orbits and pulls back while the cracks flare brighter and faster
//   3. the core detonates in a white flash, a polarity ring and a rain of shards
//   4. the camera rises over the arena as the light dies and the towers go dark
//   5. control returns where the player was standing, looking at the wreck
//
// Per-frame state (camera / core / flash) is read by <WardenDefeatCinematic/>
// in the Canvas and by the DOM <CinematicOverlay/>. Space skips to the end.

import * as THREE from 'three';
import { gameEvents } from '../events/GameEvents';
import { addTrauma } from '../player/cameraShake';
import { soundManager } from '../sound/SoundManager';
import { particleFx, FX_CHARGED, polarityFxColor } from '../fx/particleFx';

export interface WardenDefeatParams {
    /** Where the Warden fell (its feet). */
    x: number;
    y: number;
    z: number;
    /** Its body height, for framing. */
    height: number;
    /** Its last polarity, for the colour of the collapse. */
    polarity: number;
    /** The arena centre and floor, so the final rise frames the platform. */
    centerX: number;
    centerZ: number;
    floorY: number;
    /** The player's camera at the moment of the kill, restored on handback. */
    returnPitch: number;
    returnYaw: number;
}

// --- Timeline (seconds, cumulative) ---
const T_HOLD = 0.8;      // the buckle: a close, low, slow push
const T_ORBIT = 3.6;     // orbit + pull back while the core cracks
const T_RISE = 5.6;      // detonation, then the camera rises over the arena
const T_TOTAL = 6.0;

const ORBIT_RATE = 0.55;         // rad/s
const CRACK_INTERVAL = 0.32;     // seconds between crack flares

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const smooth = (t: number): number => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

function quatLookAt(eye: THREE.Vector3, target: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
    _m.lookAt(eye, target, UP);
    return out.setFromRotationMatrix(_m);
}

class WardenDefeat {
    active = false;      // is the cinematic camera driving?
    running = false;
    /** Black fade (unused here, kept for the shared overlay contract). */
    fade = 0;
    /** White detonation flash, 0..1. */
    flash = 0;
    /** 0..1 collapse of the core (1 = gone). */
    collapse = 0;
    /** Core scale multiplier while it shudders, then bursts. */
    coreScale = 1;
    polarity = 1;
    readonly camPos = new THREE.Vector3();
    readonly camQuat = new THREE.Quaternion();
    readonly corePos = new THREE.Vector3();

    private params: WardenDefeatParams | null = null;
    private t = 0;
    private lastMs = 0;
    private rafId: number | null = null;
    private startAngle = 0;
    private lastCrack = 0;
    private firedBurst = false;
    private firedEnd = false;
    private listeners = new Set<() => void>();
    private onKey: ((e: KeyboardEvent) => void) | null = null;

    subscribe(cb: () => void): () => void {
        this.listeners.add(cb);
        return () => { this.listeners.delete(cb); };
    }
    private notify(): void { this.listeners.forEach((cb) => cb()); }

    isActive(): boolean { return this.active; }

    begin(params: WardenDefeatParams): void {
        if (this.running) return;
        this.params = params;
        this.t = 0;
        this.flash = 0;
        this.fade = 0;
        this.collapse = 0;
        this.coreScale = 1;
        this.polarity = params.polarity;
        this.lastCrack = 0;
        this.firedBurst = false;
        this.firedEnd = false;
        this.active = true;
        this.running = true;

        this.corePos.set(params.x, params.y + params.height * 0.5, params.z);
        // Start the orbit on the side the arena centre is NOT, so the first
        // frame looks in across the platform rather than out into the pit.
        this.startAngle = Math.atan2(params.z - (params.centerZ + 0.5), params.x - (params.centerX + 0.5));
        this.step(0);

        gameEvents.emit('cinematic:start', { source: 'magnetic_warden' });
        this.onKey = (e: KeyboardEvent) => {
            if (e.code === 'Space') { e.preventDefault(); this.skip(); }
        };
        window.addEventListener('keydown', this.onKey);

        this.lastMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const loop = () => {
            if (!this.running) return;
            const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            const dt = Math.min(0.05, (now - this.lastMs) / 1000);
            this.lastMs = now;
            this.step(dt);
            this.rafId = (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame(loop) : null;
        };
        this.rafId = (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame(loop) : null;
    }

    private step(dt: number): void {
        const p = this.params;
        if (!p) return;
        this.t += dt;
        const t = this.t;

        if (t < T_HOLD) {
            // The buckle: low and close, pushing in slowly as it folds.
            const k = smooth(t / T_HOLD);
            const angle = this.startAngle;
            const radius = 9 - 2.2 * k;
            this.camPos.set(
                this.corePos.x + Math.cos(angle) * radius,
                p.floorY + 1.6 + 0.5 * k,
                this.corePos.z + Math.sin(angle) * radius,
            );
            this.collapse = 0.15 * k;
            this.coreScale = 1 - 0.12 * k + 0.03 * Math.sin(t * 30);
        } else if (t < T_ORBIT) {
            // Orbit and pull back; the cracks come faster as it comes apart.
            const k = smooth((t - T_HOLD) / (T_ORBIT - T_HOLD));
            const angle = this.startAngle + ORBIT_RATE * (t - T_HOLD);
            const radius = 6.8 + 9 * k;
            this.camPos.set(
                this.corePos.x + Math.cos(angle) * radius,
                p.floorY + 2.1 + 6 * k,
                this.corePos.z + Math.sin(angle) * radius,
            );
            this.collapse = 0.15 + 0.6 * k;
            this.coreScale = (1 - 0.3 * k) * (1 + 0.06 * Math.sin(t * (24 + 60 * k)));
            const interval = CRACK_INTERVAL * (1 - 0.6 * k);
            if (t - this.lastCrack > interval) {
                this.lastCrack = t;
                addTrauma(0.1 + 0.25 * k);
                soundManager.playAt('entity.magnetic_warden.hurt', this.corePos, { volume: 0.4 + 0.3 * k, pitch: 0.7 + 0.5 * k });
                particleFx.burst({
                    x: this.corePos.x, y: this.corePos.y, z: this.corePos.z,
                    color: polarityFxColor(this.polarity), color2: [1, 1, 1],
                    count: 14 + Math.round(20 * k), speed: 5 + 8 * k, upBias: 2, spread: 1,
                    size: 0.24, life: 0.7, gravity: 6, drag: 1,
                });
            }
        } else {
            // Detonation, then a slow rise looking down over the quiet arena.
            if (!this.firedBurst) {
                this.firedBurst = true;
                this.flash = 1;
                this.collapse = 1;
                this.coreScale = 0;
                addTrauma(1.0);
                soundManager.play('entity.magnetic_warden.defeat', { volume: 1.0 });
                const { x, y, z } = this.corePos;
                particleFx.burst({ x, y, z, color: [1, 1, 1], color2: FX_CHARGED, count: 150, speed: 22, upBias: 6, spread: 1, size: 0.42, life: 1.4, gravity: 9, drag: 0.6 });
                particleFx.burst({ x, y, z, color: polarityFxColor(this.polarity), color2: polarityFxColor(-this.polarity), count: 110, speed: 13, upBias: 8, spread: 1, size: 0.3, life: 2.2, gravity: 3, drag: 0.5 });
                // A last ring of the Warden's own colour sweeping the platform.
                particleFx.burst({ x, y: p.floorY + 0.4, z, color: polarityFxColor(this.polarity), color2: [1, 1, 1], count: 90, speed: 26, upBias: 0.2, spread: 1, size: 0.28, life: 1.1, gravity: 1, drag: 0.9 });
            }
            const k = smooth((t - T_ORBIT) / (T_RISE - T_ORBIT));
            this.flash = Math.max(0, 1 - (t - T_ORBIT) / 0.9);
            const angle = this.startAngle + ORBIT_RATE * (T_ORBIT - T_HOLD) + 0.25 * k;
            const radius = 15.8 + 10 * k;
            this.camPos.set(
                this.corePos.x + Math.cos(angle) * radius,
                p.floorY + 8.1 + 11 * k,
                this.corePos.z + Math.sin(angle) * radius,
            );
        }

        // Always framed on the wreck (drifting to the platform centre at the end).
        const look = this.t < T_ORBIT
            ? this.corePos
            : new THREE.Vector3(
                THREE.MathUtils.lerp(this.corePos.x, p.centerX + 0.5, smooth((t - T_ORBIT) / (T_RISE - T_ORBIT))),
                THREE.MathUtils.lerp(this.corePos.y, p.floorY + 1, smooth((t - T_ORBIT) / (T_RISE - T_ORBIT))),
                THREE.MathUtils.lerp(this.corePos.z, p.centerZ + 0.5, smooth((t - T_ORBIT) / (T_RISE - T_ORBIT))),
            );
        quatLookAt(this.camPos, look, this.camQuat);

        if (t >= T_RISE && !this.firedEnd) this.handBack();
        if (t >= T_TOTAL) this.stop();
        this.notify();
    }

    /** Space: cut straight to the end (the detonation still fires). */
    skip(): void {
        if (!this.running || this.firedEnd) return;
        if (!this.firedBurst) { this.t = T_ORBIT; this.step(0); }
        this.t = T_RISE;
        this.flash = 0;
        this.handBack();
        this.stop();
    }

    private handBack(): void {
        if (this.firedEnd) return;
        this.firedEnd = true;
        this.active = false;
        const p = this.params;
        gameEvents.emit('cinematic:end', {
            source: 'magnetic_warden',
            returnPitch: p?.returnPitch ?? 0,
            returnYaw: p?.returnYaw ?? 0,
        });
        this.notify();
    }

    /** Abort (world unload, death): hand control back without the flourish. */
    cancel(): void {
        if (!this.running) return;
        this.flash = 0;
        this.collapse = 1;
        this.handBack();
        this.stop();
        this.notify();
    }

    private stop(): void {
        this.active = false;
        this.running = false;
        if (this.onKey) { window.removeEventListener('keydown', this.onKey); this.onKey = null; }
        if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }
}

export const wardenDefeat = new WardenDefeat();
