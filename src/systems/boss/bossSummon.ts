// Magnetic Warden summon cutscene controller.
//
// A self-driven (requestAnimationFrame) cinematic, deliberately dragged out:
//   1. fade to black (biome music keeps playing)
//   2. ORBIT the camera around the OUTSIDE of the arena (pivoting on the centre)
//   3. as the camera sweeps past each tower, that shield crystal SPAWNS with an
//      explosion + shake + sound (slow intervals)
//   4. thick humming beams grow slowly from every crystal to the altar
//   5. the camera pushes in slowly toward the altar as the beams arrive
//   6. the beams collapse into an ENERGY BALL at the altar — control returns to the
//      player here, and the ball swells (this is the grace window to run away)
//   7. the ball explodes with a rumble and the boss spawns AGGRO — the fight is on.
//
// Per-frame state (camera / beams / ball / fade) is read by the in-Canvas
// <BossCinematic/> and the DOM <CinematicOverlay/>. Block edits / particles /
// sounds fire as scheduled one-shot side effects.

import * as THREE from 'three';
import { worldManager } from '../WorldManager';
import { soundManager } from '../sound/SoundManager';
import { gameEvents } from '../events/GameEvents';
import { addTrauma } from '../player/cameraShake';
import { BlockType } from '../../types';
import { getShieldCrystalPositions, flattenArenaDais, flattenArenaBridges } from '../world/magneticArena';

export interface SummonParams {
    centerX: number;
    centerZ: number;
    baseY: number;
    /** The player's camera transform at summon time (the cutscene flies back through it). */
    startPos: THREE.Vector3;
    startQuat: THREE.Quaternion;
    /** Spawn the boss entity (App-specific: knows bossId/regionId). Called at the climax. */
    onSpawnBoss: () => void;
}

// --- Timeline (seconds, cumulative) ---
const FADE_OUT = 1.0;
const FADE_IN = 1.6;
const ORBIT_DUR = 9.5;    // crystals spawn during the orbit (2s apart)
const BEAM_DUR = 4.5;     // beams grow slowly
const PUSHIN_DUR = 3.5;   // camera moves in toward the altar
const FLYBACK_DUR = 3.4;  // camera flies all the way back to the player (slowed)
const GRACE_DUR = 4.0;    // ball keeps swelling after control returns (run-away window)

const T_ORBIT = FADE_OUT;                  // 1.0
const T_BEAM = T_ORBIT + ORBIT_DUR;        // 10.5
const T_PUSH = T_BEAM + BEAM_DUR;          // 15.0
const T_FLYBACK = T_PUSH + PUSHIN_DUR;     // 18.5  (beams collapse → energy ball forms)
const T_CONTROL = T_FLYBACK + FLYBACK_DUR; // 21.9  (camera back at the player → control returns)
const T_IMPACT = T_FLYBACK + FLYBACK_DUR + GRACE_DUR; // 25.9  (explosion + boss spawn)
const T_TOTAL = T_IMPACT + 0.3;

// Crystals spawn on a fixed 2-second cadence, in the orbit's sweep order.
const CRYSTAL_FIRST = 1.3;
const CRYSTAL_GAP = 2.0;

// --- Camera orbit (relative to the arena centre) ---
const ORBIT_RADIUS = 80;   // outside the wall (outer radius ~72)
const ORBIT_HEIGHT = 42;   // above the floor
const START_ANGLE = Math.PI / 4;     // matches tower 0's diagonal
const ORBIT_RATE = 0.40;             // rad/s (a touch slower)
const BALL_MAX_R = 3.6;

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const smooth = (t: number) => t * t * (3 - 2 * t);

function quatLookAt(eye: THREE.Vector3, target: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
    _m.lookAt(eye, target, UP);
    return out.setFromRotationMatrix(_m);
}

class BossSummon {
    active = false;     // is the cinematic CAMERA driving (vs. player control)?
    running = false;    // is the sequence still ticking (covers the post-handback ball)?
    fade = 0;
    beamProgress = 0;
    ballScale = 0;      // 0..1 energy-ball size at the altar
    crystalsShown = 0;
    readonly camPos = new THREE.Vector3();
    readonly camQuat = new THREE.Quaternion();
    crystals: { x: number; y: number; z: number }[] = [];
    readonly altar = new THREE.Vector3();
    readonly ballMaxRadius = BALL_MAX_R;
    /** The player's view orientation at summon time — restored on handback. */
    readonly playerStartQuat = new THREE.Quaternion();

    private params: SummonParams | null = null;
    private t = 0;
    private lastMs = 0;
    private rafId: number | null = null;
    private spawned = new Set<number>();
    private firedBeamHum = false;
    private firedBall = false;
    private firedHandback = false;
    private firedSpawn = false;
    private lastChargePulse = 0;
    private lastAmbientPulse = 0;
    private listeners = new Set<() => void>();

    private readonly _center = new THREE.Vector3();
    private readonly _look = new THREE.Vector3();
    private readonly _eye = new THREE.Vector3();
    private readonly _pushTarget = new THREE.Vector3();
    private readonly _q = new THREE.Quaternion();
    private readonly _q2 = new THREE.Quaternion();

    subscribe(cb: () => void): () => void {
        this.listeners.add(cb);
        return () => { this.listeners.delete(cb); };
    }
    private notify(): void { this.listeners.forEach((cb) => cb()); }

    isActive(): boolean { return this.active; }

    begin(params: SummonParams): void {
        if (this.running) return;
        this.params = params;
        this.t = 0;
        this.fade = 0;
        this.beamProgress = 0;
        this.ballScale = 0;
        this.crystalsShown = 0;
        this.spawned.clear();
        this.firedBeamHum = false;
        this.firedBall = false;
        this.firedHandback = false;
        this.firedSpawn = false;
        this.lastChargePulse = 0;
        this.lastAmbientPulse = 0;
        this.active = true;
        this.running = true;

        const { centerX, centerZ, baseY } = params;
        this._center.set(centerX + 0.5, baseY, centerZ + 0.5);
        this.crystals = getShieldCrystalPositions(centerX, centerZ, baseY);
        // Clear any leftover crystals (batched) so we always spawn a clean set.
        worldManager.setBlocks(this.crystals.map((c) => ({ x: c.x, y: c.y, z: c.z, type: BlockType.AIR })));
        this.altar.set(centerX + 0.5, baseY + 4.5, centerZ + 0.5);
        this._look.set(centerX + 0.5, baseY + 6, centerZ + 0.5);

        this.camPos.copy(params.startPos);
        this.camQuat.copy(params.startQuat);
        this.playerStartQuat.copy(params.startQuat);

        gameEvents.emit('cinematic:start', {});
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

    private orbitPos(angle: number, out: THREE.Vector3): THREE.Vector3 {
        return out.set(
            this._center.x + ORBIT_RADIUS * Math.cos(angle),
            (this.params?.baseY ?? 0) + ORBIT_HEIGHT,
            this._center.z + ORBIT_RADIUS * Math.sin(angle),
        );
    }

    private step(dt: number): void {
        const p = this.params;
        if (!p) return;
        this.t += dt;
        const t = this.t;

        // --- Fade ---
        if (t < FADE_OUT) this.fade = t / FADE_OUT;
        else if (t < FADE_OUT + FADE_IN) this.fade = 1 - (t - FADE_OUT) / FADE_IN;
        else this.fade = 0;

        // --- Camera (while the cinematic owns it) ---
        if (this.active) {
            if (t < T_ORBIT) {
                this.camPos.copy(p.startPos);
                this.camQuat.copy(p.startQuat);
            } else if (t < T_PUSH) {
                // Orbit around the centre.
                const angle = START_ANGLE + ORBIT_RATE * (t - T_ORBIT);
                this.orbitPos(angle, this.camPos);
                quatLookAt(this.camPos, this._look, this.camQuat);
            } else if (t < T_FLYBACK) {
                // Push in toward the altar from where the orbit left off.
                this.orbitPos(START_ANGLE + ORBIT_RATE * (T_PUSH - T_ORBIT), this._eye);
                this._pushTarget.set(this._center.x + 11, p.baseY + 9, this._center.z + 11);
                const k = smooth(Math.min(1, (t - T_PUSH) / PUSHIN_DUR));
                this.camPos.lerpVectors(this._eye, this._pushTarget, k);
                quatLookAt(this._eye, this._look, this._q);          // orbit-exit look
                quatLookAt(this._pushTarget, this.altar, this._q2);  // close altar look
                this.camQuat.copy(this._q).slerp(this._q2, k);
            } else {
                // Fly all the way back to the player's EXACT position + angle (slowed);
                // at k=1 the camera sits precisely where control resumes — no snap.
                this._pushTarget.set(this._center.x + 11, p.baseY + 9, this._center.z + 11);
                quatLookAt(this._pushTarget, this.altar, this._q2);
                const k = smooth(Math.min(1, (t - T_FLYBACK) / FLYBACK_DUR));
                this.camPos.lerpVectors(this._pushTarget, p.startPos, k);
                this.camQuat.copy(this._q2).slerp(p.startQuat, k);
            }
        }

        // --- Crystal spawns: fixed 2s cadence, in the orbit's sweep order ---
        if (t >= T_ORBIT && t < T_BEAM) {
            for (let i = 0; i < 4; i++) {
                if (!this.spawned.has(i) && t - T_ORBIT >= CRYSTAL_FIRST + i * CRYSTAL_GAP) {
                    this.spawnCrystal(i);
                }
            }
            // Ambient magnetic energy gathering at the centre as crystals appear.
            this.ambientPulse(t, BlockType.MAGNETITE_SHARD);
        }

        // --- Beams + hum (energy streaming to the altar) ---
        if (t >= T_BEAM && t < T_FLYBACK) {
            if (!this.firedBeamHum) { this.firedBeamHum = true; soundManager.play('entity.magnetic_warden.hum', { volume: 0.7 }); }
            this.beamProgress = Math.min(1, (t - T_BEAM) / BEAM_DUR);
            this.ambientPulse(t, BlockType.CHARGED_MAGNETITE);
        } else if (t >= T_FLYBACK) {
            this.beamProgress = 0; // collapsed into the ball
        }

        // --- Energy ball: forms when the beams collapse, swells until impact ---
        if (t >= T_FLYBACK && t < T_IMPACT) {
            if (!this.firedBall) {
                this.firedBall = true;
                soundManager.play('entity.magnetic_warden.charge', { volume: 0.85 });
            }
            this.ballScale = (t - T_FLYBACK) / (T_IMPACT - T_FLYBACK);
            // Building rumble + crackle — but NOT a jolt right as control returns.
            if (t > T_CONTROL + 0.4 && t - this.lastChargePulse > 0.4) {
                this.lastChargePulse = t;
                addTrauma(0.04 + 0.18 * this.ballScale);
                const ax = Math.floor(this.altar.x), ay = Math.floor(this.altar.y), az = Math.floor(this.altar.z);
                worldManager.spawnParticles(BlockType.CHARGED_MAGNETITE, ax, ay, az);
                worldManager.spawnParticles(BlockType.MAGNETITE_SHARD, ax, ay, az);
            }
        }

        // --- Control returns the instant the camera arrives back at the player ---
        if (t >= T_CONTROL && !this.firedHandback) {
            this.firedHandback = true;
            this.active = false;
            gameEvents.emit('cinematic:end', {}); // no shake here
        }

        // --- Impact: explode the orb, flatten the dais, spawn the boss (aggro) ---
        if (t >= T_IMPACT && !this.firedSpawn) {
            this.firedSpawn = true;
            this.ballScale = 0;
            addTrauma(1.0);
            soundManager.play('entity.magnetic_warden.summon', { volume: 1.0 });
            const ax = Math.floor(this.altar.x), ay = p.baseY, az = Math.floor(this.altar.z);
            for (const [b, dy] of [[BlockType.CHARGED_MAGNETITE, 1], [BlockType.MAGNETITE_SHARD, 2], [BlockType.CHISELED_MAGNETITE, 0], [BlockType.POSITIVE_MAGNET, 1], [BlockType.NEGATIVE_MAGNET, 2]] as const) {
                worldManager.spawnParticles(b, ax, ay + dy, az);
            }
            flattenArenaDais(p.centerX, p.centerZ, p.baseY, (edits) => worldManager.setBlocks(edits));
            // Drop the four causeways into the lava — the player is now sealed on
            // the central island for the duration of the fight.
            flattenArenaBridges(p.centerX, p.centerZ, p.baseY, (edits) => worldManager.setBlocks(edits));
            p.onSpawnBoss();
        }

        if (t >= T_TOTAL) this.stop();
        this.notify();
    }

    private ambientPulse(t: number, block: BlockType): void {
        if (t - this.lastAmbientPulse < 0.55) return;
        this.lastAmbientPulse = t;
        worldManager.spawnParticles(block, Math.floor(this.altar.x), Math.floor(this.altar.y), Math.floor(this.altar.z));
    }

    private spawnCrystal(i: number): void {
        this.spawned.add(i);
        this.crystalsShown = this.spawned.size;
        const c = this.crystals[i];
        worldManager.setBlock(c.x, c.y, c.z, BlockType.MAGNETIC_SHIELD_CRYSTAL);
        // An explosion of light at the tower: several bursts + a shake + sound.
        worldManager.spawnParticles(BlockType.CHARGED_MAGNETITE, c.x, c.y, c.z);
        worldManager.spawnParticles(BlockType.MAGNETITE_SHARD, c.x, c.y, c.z);
        worldManager.spawnParticles(BlockType.MAGNETIC_SHIELD_CRYSTAL, c.x, c.y, c.z);
        worldManager.spawnParticles(BlockType.MAGNETITE_SHARD, c.x, c.y + 1, c.z);
        soundManager.play('entity.magnetic_warden.crystal_spawn', { volume: 0.85 });
        addTrauma(0.35);
    }

    /** Abort the cutscene (e.g. world unload). Does NOT spawn the boss. */
    cancel(): void {
        if (!this.running) return;
        this.stop();
        this.fade = 0;
        this.beamProgress = 0;
        this.ballScale = 0;
        if (this.active || !this.firedHandback) gameEvents.emit('cinematic:end', {});
        this.active = false;
        this.notify();
    }

    private stop(): void {
        this.active = false;
        this.running = false;
        if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }
}

export const bossSummon = new BossSummon();
