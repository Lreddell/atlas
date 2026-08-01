import * as THREE from 'three';
import { gameEvents } from '../events/GameEvents';
import { particleFx } from '../fx/particleFx';
import { addTrauma } from '../player/cameraShake';
import { soundManager } from '../sound/SoundManager';

export interface BellTitanCinematicParams {
    vaultId: string;
    target: { x: number; y: number; z: number };
    startPosition: THREE.Vector3;
    startQuaternion: THREE.Quaternion;
    onSpawn: () => void;
}

const FADE_OUT_END = 0.65;
const FADE_IN_END = 1.55;
const SPAWN_TIME = 5.2;
const RETURN_TIME = 6.15;
const TOTAL_TIME = 8.1;
const UP = new THREE.Vector3(0, 1, 0);
const LOOK_MATRIX = new THREE.Matrix4();

const ease = (value: number): number => {
    const clamped = Math.max(0, Math.min(1, value));
    return clamped * clamped * (3 - 2 * clamped);
};

function lookAt(eye: THREE.Vector3, target: THREE.Vector3, output: THREE.Quaternion): void {
    LOOK_MATRIX.lookAt(eye, target, UP);
    output.setFromRotationMatrix(LOOK_MATRIX);
}

/**
 * Vertical reveal for the Bell Titan. It follows the hanging chain down from
 * the vault ceiling, then holds on three physical toll rings before returning
 * to the exact player view. It deliberately shares no crystal, beam, orbit, or
 * energy-ball language with the Magnetic Warden summon.
 */
class BellTitanCinematic {
    active = false;
    fade = 0;
    chainDrop = 0;
    tollPulse = 0;
    readonly cameraPosition = new THREE.Vector3();
    readonly cameraQuaternion = new THREE.Quaternion();
    readonly target = new THREE.Vector3();

    private params: BellTitanCinematicParams | null = null;
    private elapsed = 0;
    private fired = new Set<string>();
    private listeners = new Set<() => void>();
    private readonly revealStart = new THREE.Vector3();
    private readonly revealEnd = new THREE.Vector3();
    private readonly returnStart = new THREE.Vector3();
    private readonly lookTarget = new THREE.Vector3();

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    private notify(): void {
        this.listeners.forEach((listener) => listener());
    }

    begin(params: BellTitanCinematicParams): boolean {
        if (this.active) return false;
        this.params = params;
        this.elapsed = 0;
        this.fade = 0;
        this.chainDrop = 0;
        this.tollPulse = 0;
        this.fired.clear();
        this.active = true;
        this.target.set(params.target.x, params.target.y, params.target.z);
        this.cameraPosition.copy(params.startPosition);
        this.cameraQuaternion.copy(params.startQuaternion);
        this.revealStart.set(this.target.x - 2, this.target.y + 25, this.target.z + 15);
        this.revealEnd.set(this.target.x + 10, this.target.y + 7.5, this.target.z + 14);
        this.returnStart.copy(this.revealEnd);
        this.returnStart.x += Math.sin(0.48) * 4;
        this.returnStart.z += Math.cos(0.48) * 2;
        this.lookTarget.set(this.target.x, this.target.y + 5, this.target.z);
        gameEvents.emit('cinematic:start', { source: 'bell_titan' });
        this.notify();
        return true;
    }

    tick(delta: number): void {
        const params = this.params;
        if (!this.active || !params) return;
        this.elapsed += Math.max(0, Math.min(0.1, delta));
        const time = this.elapsed;

        if (time < FADE_OUT_END) this.fade = time / FADE_OUT_END;
        else if (time < FADE_IN_END) this.fade = 1 - (time - FADE_OUT_END) / (FADE_IN_END - FADE_OUT_END);
        else this.fade = 0;

        if (time < FADE_OUT_END) {
            this.cameraPosition.copy(params.startPosition);
            this.cameraQuaternion.copy(params.startQuaternion);
        } else if (time < RETURN_TIME) {
            const descent = ease((time - FADE_OUT_END) / (RETURN_TIME - FADE_OUT_END));
            const angle = -0.42 + descent * 0.9;
            this.cameraPosition.lerpVectors(this.revealStart, this.revealEnd, descent);
            this.cameraPosition.x += Math.sin(angle) * 4;
            this.cameraPosition.z += Math.cos(angle) * 2;
            lookAt(this.cameraPosition, this.lookTarget, this.cameraQuaternion);
        } else {
            const returning = ease((time - RETURN_TIME) / (TOTAL_TIME - RETURN_TIME));
            this.cameraPosition.lerpVectors(this.returnStart, params.startPosition, returning);
            this.cameraQuaternion.slerpQuaternions(this.cameraQuaternion, params.startQuaternion, returning);
        }

        this.chainDrop = ease((time - 1.0) / 2.15);
        const tollAge = time - 3.55;
        this.tollPulse = tollAge >= 0 && tollAge <= 1.6 ? tollAge / 1.6 : 0;

        this.fireOnce('chain_one', 1.1, () => {
            soundManager.playAt('vault.titan_chain', this.target, { pitch: 0.82, volume: 0.82, fallback: false });
            addTrauma(0.12);
        });
        this.fireOnce('chain_two', 2.2, () => {
            soundManager.playAt('vault.titan_chain', this.target, { pitch: 0.94, volume: 0.9, fallback: false });
            particleFx.burst({ x: this.target.x, y: this.target.y + 10, z: this.target.z, color: [0.44, 0.39, 0.3], color2: [0.65, 0.56, 0.39], count: 36, speed: 4, upBias: -1, spread: 0.7, size: 0.16, life: 1.4, gravity: 3, drag: 1 });
            addTrauma(0.2);
        });
        this.fireOnce('toll', 3.55, () => {
            soundManager.playAt('vault.titan_toll', this.target, { volume: 1, pitch: 0.86, fallback: false });
            particleFx.burst({ x: this.target.x, y: this.target.y + 2, z: this.target.z, color: [0.62, 0.54, 0.37], color2: [0.35, 0.34, 0.31], count: 72, speed: 12, upBias: 1, spread: 1, size: 0.18, life: 1.25, gravity: 2, drag: 1.15 });
            addTrauma(0.65);
        });
        this.fireOnce('spawn', SPAWN_TIME, params.onSpawn);

        if (time >= TOTAL_TIME) this.finish();
        this.notify();
    }

    private fireOnce(id: string, at: number, action: () => void): void {
        if (this.elapsed < at || this.fired.has(id)) return;
        this.fired.add(id);
        action();
    }

    cancel(): void {
        if (!this.active || !this.params) return;
        this.finish();
    }

    private finish(): void {
        const params = this.params;
        if (!params) return;
        const euler = new THREE.Euler().setFromQuaternion(params.startQuaternion, 'YXZ');
        this.cameraPosition.copy(params.startPosition);
        this.cameraQuaternion.copy(params.startQuaternion);
        this.active = false;
        this.fade = 0;
        this.chainDrop = 0;
        this.tollPulse = 0;
        gameEvents.emit('cinematic:end', {
            source: 'bell_titan',
            returnPosition: {
                x: params.startPosition.x,
                y: params.startPosition.y - 1.62,
                z: params.startPosition.z,
            },
            returnPitch: euler.x,
            returnYaw: euler.y,
        });
        this.params = null;
        this.notify();
    }
}

export const bellTitanCinematic = new BellTitanCinematic();
