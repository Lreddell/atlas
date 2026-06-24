// Magnetic Warden summon cutscene controller.
//
// A self-driven (requestAnimationFrame) cinematic sequence: fade to black, swing
// the camera to an overhead view by the arena walls, fade back in, spawn the four
// shield crystals one at a time with bursts + sound, grow humming beams from each
// crystal to the altar, fly the camera back to the player, then — all at once —
// shake the screen, explode the altar, flatten the dais and spawn the boss (its
// music + bar come up with it). The boss then has a 1s grace before it aggros.
//
// State is mutable and read each frame by the in-Canvas <BossCinematic/> (camera +
// beams) and the DOM <CinematicOverlay/> (black fade). Block edits / particles /
// sounds are fired as one-shot side effects at their scheduled times.

import * as THREE from 'three';
import { worldManager } from '../WorldManager';
import { soundManager } from '../sound/SoundManager';
import { gameEvents } from '../events/GameEvents';
import { addTrauma } from '../player/cameraShake';
import { BlockType } from '../../types';
import { getShieldCrystalPositions, flattenArenaDais } from '../world/magneticArena';

export interface SummonParams {
    centerX: number;
    centerZ: number;
    baseY: number;
    /** The player's camera transform at summon time (the cutscene flies back to it). */
    startPos: THREE.Vector3;
    startQuat: THREE.Quaternion;
    /** Spawn the boss entity (App-specific: knows bossId/regionId). Called at impact. */
    onSpawnBoss: () => void;
}

// --- Timeline (seconds) ---
const T_FADE_OUT = 1.0;
const T_BLACK = 0.4;          // camera repositions while black
const T_FADE_IN = 1.0;
const T_REVEAL = T_FADE_OUT + T_BLACK + T_FADE_IN; // 2.4 — arena visible
const CRYSTAL_GAP = 0.85;
const T_CRYSTAL0 = T_REVEAL + 0.3;                 // 2.7
const T_BEAM_START = T_CRYSTAL0 + 4 * CRYSTAL_GAP + 0.4; // ~6.5
const T_BEAM_END = T_BEAM_START + 2.2;             // ~8.7
const T_FLY_START = T_BEAM_END;                    // fly back as beams finish
const T_FLY_END = T_FLY_START + 1.3;               // ~10.0
const T_IMPACT = T_FLY_END;
const T_TOTAL = T_IMPACT + 0.25;

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();

function quatLookAt(eye: THREE.Vector3, target: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
    _m.lookAt(eye, target, UP);
    return out.setFromRotationMatrix(_m);
}

const smooth = (t: number) => t * t * (3 - 2 * t); // smoothstep

class BossSummon {
    active = false;
    fade = 0;          // 0..1 black overlay opacity
    beamProgress = 0;  // 0..1 beam growth
    crystalsShown = 0; // 0..4
    readonly camPos = new THREE.Vector3();
    readonly camQuat = new THREE.Quaternion();
    /** The four crystal world positions (for the beam renderer). */
    crystals: { x: number; y: number; z: number }[] = [];
    /** Altar world point the beams converge on. */
    readonly altar = new THREE.Vector3();

    private params: SummonParams | null = null;
    private t = 0;
    private lastMs = 0;
    private rafId: number | null = null;
    private spawned = new Set<number>();
    private firedBeamHum = false;
    private firedSpawn = false;
    private listeners = new Set<() => void>();

    // Overhead keyframes (relative to arena centre), resolved in begin().
    private readonly kfOverhead = new THREE.Vector3();
    private readonly kfPushIn = new THREE.Vector3();
    private readonly lookTarget = new THREE.Vector3();
    private readonly _eye = new THREE.Vector3();
    private readonly _q = new THREE.Quaternion();

    /** Subscribe to per-frame state changes (the DOM fade overlay). */
    subscribe(cb: () => void): () => void {
        this.listeners.add(cb);
        return () => { this.listeners.delete(cb); };
    }
    private notify(): void { this.listeners.forEach((cb) => cb()); }

    isActive(): boolean { return this.active; }

    begin(params: SummonParams): void {
        if (this.active) return;
        this.params = params;
        this.t = 0;
        this.fade = 0;
        this.beamProgress = 0;
        this.crystalsShown = 0;
        this.spawned.clear();
        this.firedBeamHum = false;
        this.firedSpawn = false;
        this.active = true;

        const { centerX, centerZ, baseY } = params;
        this.crystals = getShieldCrystalPositions(centerX, centerZ, baseY);
        // Clear any leftover crystals so we always spawn a clean set.
        for (const c of this.crystals) worldManager.setBlock(c.x, c.y, c.z, BlockType.AIR);
        this.altar.set(centerX + 0.5, baseY + 2, centerZ + 0.5);

        this.lookTarget.set(centerX + 0.5, baseY + 6, centerZ + 0.5);
        this.kfOverhead.set(centerX + 56, baseY + 42, centerZ + 56);
        this.kfPushIn.set(centerX + 30, baseY + 26, centerZ + 34);

        // Start the cutscene at the player's own view, then snap overhead behind
        // the fade so the reveal lands on the arena.
        this.camPos.copy(params.startPos);
        this.camQuat.copy(params.startQuat);

        gameEvents.emit('cinematic:start', {});
        this.lastMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const loop = () => {
            if (!this.active) return;
            const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            const dt = Math.min(0.05, (now - this.lastMs) / 1000);
            this.lastMs = now;
            this.step(dt);
            this.rafId = (typeof requestAnimationFrame !== 'undefined')
                ? requestAnimationFrame(loop) : null;
        };
        this.rafId = (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame(loop) : null;
    }

    private step(dt: number): void {
        const p = this.params;
        if (!p) return;
        this.t += dt;
        const t = this.t;

        // --- Fade ---
        if (t < T_FADE_OUT) this.fade = t / T_FADE_OUT;
        else if (t < T_FADE_OUT + T_BLACK) this.fade = 1;
        else if (t < T_REVEAL) this.fade = 1 - (t - T_FADE_OUT - T_BLACK) / T_FADE_IN;
        else this.fade = 0;

        // --- Camera ---
        if (t < T_FADE_OUT) {
            // Hold on the player while fading out.
            this.camPos.copy(p.startPos);
            this.camQuat.copy(p.startQuat);
        } else if (t < T_FLY_START) {
            // Behind the black, snap overhead; then slowly push in toward the arena.
            const k = smooth(Math.min(1, Math.max(0, (t - T_REVEAL) / (T_FLY_START - T_REVEAL))));
            this._eye.lerpVectors(this.kfOverhead, this.kfPushIn, k);
            this.camPos.copy(this._eye);
            quatLookAt(this._eye, this.lookTarget, this.camQuat);
        } else {
            // Fly back to the player's view.
            const k = smooth(Math.min(1, (t - T_FLY_START) / (T_FLY_END - T_FLY_START)));
            this._eye.copy(this.kfPushIn);
            this.camPos.lerpVectors(this._eye, p.startPos, k);
            quatLookAt(this.kfPushIn, this.lookTarget, this._q); // start orientation
            this.camQuat.copy(this._q).slerp(p.startQuat, k);
        }

        // --- Crystal spawns (one at a time, with a burst + sound) ---
        for (let i = 0; i < 4; i++) {
            const at = T_CRYSTAL0 + i * CRYSTAL_GAP;
            if (t >= at && !this.spawned.has(i)) {
                this.spawned.add(i);
                this.crystalsShown = this.spawned.size;
                const c = this.crystals[i];
                worldManager.setBlock(c.x, c.y, c.z, BlockType.MAGNETIC_SHIELD_CRYSTAL);
                // Burst of light: shards + the crystal itself.
                worldManager.spawnParticles(BlockType.MAGNETITE_SHARD, c.x, c.y, c.z);
                worldManager.spawnParticles(BlockType.MAGNETIC_SHIELD_CRYSTAL, c.x, c.y, c.z);
                soundManager.play('entity.magnetic_warden.crystal_spawn', { volume: 0.8 });
                addTrauma(0.18);
            }
        }

        // --- Beams + hum ---
        if (t >= T_BEAM_START) {
            if (!this.firedBeamHum) {
                this.firedBeamHum = true;
                soundManager.play('entity.magnetic_warden.hum', { volume: 0.7 });
            }
            this.beamProgress = Math.min(1, (t - T_BEAM_START) / (T_BEAM_END - T_BEAM_START));
        }

        // --- Impact: shake, explode the altar, flatten the dais, spawn the boss ---
        if (t >= T_IMPACT && !this.firedSpawn) {
            this.firedSpawn = true;
            this.beamProgress = 0;
            // Hand the camera back to the player just before the bang.
            this.active = false;
            gameEvents.emit('cinematic:end', {});
            addTrauma(1.0);
            const ax = Math.floor(this.altar.x), ay = p.baseY, az = Math.floor(this.altar.z);
            worldManager.spawnParticles(BlockType.CHARGED_MAGNETITE, ax, ay, az);
            worldManager.spawnParticles(BlockType.MAGNETITE_SHARD, ax, ay + 1, az);
            worldManager.spawnParticles(BlockType.CHISELED_MAGNETITE, ax, ay, az);
            flattenArenaDais(p.centerX, p.centerZ, p.baseY, (x, y, z, type) => worldManager.setBlock(x, y, z, type));
            p.onSpawnBoss();
        }

        if (t >= T_TOTAL) this.stop();
        this.notify();
    }

    /** Abort the cutscene (e.g. world unload). Does NOT spawn the boss. */
    cancel(): void {
        if (!this.active && !this.firedSpawn) return;
        this.stop();
        this.fade = 0;
        this.beamProgress = 0;
        gameEvents.emit('cinematic:end', {});
        this.notify();
    }

    private stop(): void {
        this.active = false;
        if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }
}

export const bossSummon = new BossSummon();
