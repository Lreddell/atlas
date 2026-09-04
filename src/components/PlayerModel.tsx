import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { playerPose, viewRig } from '../systems/player/viewRig';
import { motionStatus } from '../systems/player/playerMotion';
import { gameEvents } from '../systems/events/GameEvents';
import { WALK_SPEED } from '../systems/player/playerConstants';

// The player's own body, drawn only in third person: a blocky explorer built
// from boxes, animated procedurally from the physics pose every frame (no
// React re-renders): a walk / sprint cycle from the horizontal speed, a crouch,
// a jump tuck, the dodge roll (a full somersault along the roll), the magnetic
// dash (arms forward, body flat along the pull), the wall climb (the body's up
// is the wall normal, limbs spread on the face), an arm swing for mining and
// attacking, a hurt flash, and Polarity Boots that glow in the chosen colour.

const SKIN = 0xe0ac8c;
const HAIR = 0x4a2f1f;
const JACKET = 0x3b5b8f;
const JACKET_DARK = 0x2c4470;
const TROUSERS = 0x2b2b35;
const BOOT = 0x1b1b22;
const POLARITY_RED = 0xe53935;
const POLARITY_BLUE = 0x1e88e5;

const _up = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _back = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _mat = new THREE.Matrix4();

const SWING_SECONDS = 0.28;

export const PlayerModel: React.FC = () => {
    const rootRef = useRef<THREE.Group>(null);
    const bodyRef = useRef<THREE.Group>(null);
    const headRef = useRef<THREE.Group>(null);
    const leftArmRef = useRef<THREE.Group>(null);
    const rightArmRef = useRef<THREE.Group>(null);
    const leftLegRef = useRef<THREE.Group>(null);
    const rightLegRef = useRef<THREE.Group>(null);
    const walkPhase = useRef(0);
    const swingStart = useRef(-1);
    const hurtUntil = useRef(0);
    const clockRef = useRef(0);

    const materials = useMemo(() => ({
        skin: new THREE.MeshLambertMaterial({ color: SKIN }),
        hair: new THREE.MeshLambertMaterial({ color: HAIR }),
        jacket: new THREE.MeshLambertMaterial({ color: JACKET }),
        jacketDark: new THREE.MeshLambertMaterial({ color: JACKET_DARK }),
        trousers: new THREE.MeshLambertMaterial({ color: TROUSERS }),
        boot: new THREE.MeshLambertMaterial({ color: BOOT, emissive: new THREE.Color(POLARITY_RED), emissiveIntensity: 0 }),
        eye: new THREE.MeshBasicMaterial({ color: 0x1a1a1a }),
    }), []);
    useEffect(() => () => { for (const m of Object.values(materials)) m.dispose(); }, [materials]);

    useEffect(() => {
        // A mining / attack swing follows the same left-click the held item does;
        // authored weapon uses have their own event. The body flashes on damage.
        const onMouseDown = (e: MouseEvent) => {
            if (e.button === 0 && document.pointerLockElement) swingStart.current = clockRef.current;
        };
        const onWeapon = () => { swingStart.current = clockRef.current; };
        const offDamaged = gameEvents.on('player:damaged', () => { hurtUntil.current = Date.now() + 180; });
        window.addEventListener('mousedown', onMouseDown);
        window.addEventListener('atlas:weapon-used', onWeapon as EventListener);
        return () => {
            offDamaged();
            window.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('atlas:weapon-used', onWeapon as EventListener);
        };
    }, []);

    useFrame(({ clock }, delta) => {
        const root = rootRef.current;
        if (!root) return;
        clockRef.current = clock.elapsedTime;
        root.visible = viewRig.showModel;
        if (!root.visible) return;

        const t = clock.elapsedTime;
        const pose = playerPose;
        const speed = Math.hypot(pose.vx, pose.vz);
        const hurt = Date.now() < hurtUntil.current;

        // --- Orientation: yaw to the look, and the body's up is the wall normal while attached.
        _forward.set(-Math.sin(pose.yaw), 0, -Math.cos(pose.yaw));
        if (pose.attached) {
            _up.set(pose.up.x, pose.up.y, pose.up.z);
            _forward.set(pose.wallForward.x, pose.wallForward.y, pose.wallForward.z);
        } else {
            _up.set(0, 1, 0);
        }
        _right.crossVectors(_forward, _up).normalize();
        _forward.crossVectors(_up, _right).normalize();
        _back.copy(_forward).negate();
        _mat.makeBasis(_right, _up, _back);
        _quat.setFromRotationMatrix(_mat);
        root.quaternion.copy(_quat);
        root.position.set(pose.x, pose.y, pose.z);

        // --- Colour: the boots glow in the chosen polarity, the whole body flashes when hurt.
        const polarityHex = pose.polarity < 0 ? POLARITY_BLUE : POLARITY_RED;
        materials.boot.emissive.setHex(polarityHex);
        materials.boot.emissiveIntensity = pose.polarity === 0 ? 0 : 0.55 + 0.25 * Math.sin(t * 6);
        for (const m of [materials.skin, materials.jacket, materials.jacketDark, materials.trousers, materials.hair]) {
            m.emissive.setHex(hurt ? 0xffffff : 0x000000);
            m.emissiveIntensity = hurt ? 0.8 : 0;
        }

        const body = bodyRef.current, head = headRef.current;
        const la = leftArmRef.current, ra = rightArmRef.current, ll = leftLegRef.current, rl = rightLegRef.current;
        if (!body || !head || !la || !ra || !ll || !rl) return;

        // Defaults every frame (each pose overrides what it needs).
        body.position.set(0, 0, 0);
        body.rotation.set(0, 0, 0);
        body.scale.set(1, 1, 1);
        head.rotation.set(-pose.pitch * 0.6, 0, 0);
        la.rotation.set(0, 0, 0.05); ra.rotation.set(0, 0, -0.05);
        ll.rotation.set(0, 0, 0); rl.rotation.set(0, 0, 0);

        const action = motionStatus.action;
        const progress = motionStatus.progress;

        if (action === 'roll') {
            // A somersault along the roll: tuck low and turn a full circle.
            const tuck = Math.sin(Math.min(1, progress) * Math.PI);
            body.position.y = 0.55 - 0.25 * tuck;
            body.scale.set(1, 1 - 0.25 * tuck, 1);
            body.rotation.x = progress * Math.PI * 2;
            la.rotation.x = -2.2 * tuck; ra.rotation.x = -2.2 * tuck;
            ll.rotation.x = 1.6 * tuck; rl.rotation.x = 1.6 * tuck;
            head.rotation.x = 0.6 * tuck;
        } else if (action === 'dash') {
            // Pulled through the air: arms out, body leaning into the dash.
            const lean = 0.5 + 0.3 * Math.sin(t * 40) * 0.1;
            body.rotation.x = lean;
            la.rotation.x = -2.9; ra.rotation.x = -2.9;
            ll.rotation.x = 0.4; rl.rotation.x = -0.3;
            head.rotation.x = -0.6;
        } else if (pose.attached) {
            // On the wall: limbs spread, hands and feet working across the face.
            walkPhase.current += speed * delta * 2.4;
            const cycle = Math.sin(walkPhase.current) * Math.min(1, speed / 3);
            body.position.y = 0.05;
            la.rotation.set(-2.4 + cycle * 0.5, 0, 0.9);
            ra.rotation.set(-2.4 - cycle * 0.5, 0, -0.9);
            ll.rotation.set(-0.6 - cycle * 0.5, 0, 0.35);
            rl.rotation.set(-0.6 + cycle * 0.5, 0, -0.35);
            head.rotation.x = -0.35;
        } else if (!pose.grounded) {
            if (action === 'leap' || pose.vy > 2) {
                // Rising: arms up, one leg tucked.
                la.rotation.x = -2.6; ra.rotation.x = -2.6;
                ll.rotation.x = -0.9; rl.rotation.x = 0.4;
            } else {
                // Falling: arms out for balance, legs trailing.
                la.rotation.set(-1.2, 0, 1.1); ra.rotation.set(-1.2, 0, -1.1);
                ll.rotation.x = 0.3; rl.rotation.x = -0.4;
            }
            body.rotation.x = Math.max(-0.2, Math.min(0.2, -pose.vy * 0.02));
        } else {
            // Walk / sprint cycle from the horizontal speed.
            const stride = Math.min(1.35, speed / WALK_SPEED);
            walkPhase.current += speed * delta * 2.2;
            const swing = Math.sin(walkPhase.current) * stride;
            const amplitude = pose.sprint ? 1.1 : 0.75;
            ll.rotation.x = swing * amplitude;
            rl.rotation.x = -swing * amplitude;
            la.rotation.x = -swing * amplitude * 0.8;
            ra.rotation.x = swing * amplitude * 0.8;
            body.position.y = Math.abs(Math.sin(walkPhase.current)) * 0.04 * stride;
            if (pose.sprint) body.rotation.x = 0.18;
            if (pose.sneak) {
                body.position.y -= 0.3;
                body.rotation.x = 0.35;
                body.scale.y = 0.88;
            }
            if (speed < 0.2) {
                // Idle: a slow breath.
                const breathe = Math.sin(t * 1.6) * 0.02;
                body.position.y = breathe;
                la.rotation.z = 0.08 + breathe; ra.rotation.z = -0.08 - breathe;
            }
        }

        // Arm swing (mining / attacking) on top of anything else.
        if (swingStart.current >= 0) {
            const k = (t - swingStart.current) / SWING_SECONDS;
            if (k >= 1) swingStart.current = -1;
            else ra.rotation.x = -1.4 * Math.sin(k * Math.PI) - 0.4;
        }
    });

    return (
        <group ref={rootRef} visible={false}>
            <group ref={bodyRef}>
                {/* Torso */}
                <mesh position={[0, 1.1, 0]} material={materials.jacket} castShadow><boxGeometry args={[0.5, 0.74, 0.26]} /></mesh>
                <mesh position={[0, 0.78, 0]} material={materials.jacketDark} castShadow><boxGeometry args={[0.52, 0.1, 0.28]} /></mesh>
                {/* Head */}
                <group ref={headRef} position={[0, 1.5, 0]}>
                    <mesh position={[0, 0.25, 0]} material={materials.skin} castShadow><boxGeometry args={[0.5, 0.5, 0.5]} /></mesh>
                    <mesh position={[0, 0.44, -0.02]} material={materials.hair}><boxGeometry args={[0.52, 0.14, 0.52]} /></mesh>
                    <mesh position={[0, 0.3, -0.26]} material={materials.hair}><boxGeometry args={[0.52, 0.22, 0.04]} /></mesh>
                    <mesh position={[-0.11, 0.27, 0.26]} material={materials.eye}><boxGeometry args={[0.07, 0.07, 0.02]} /></mesh>
                    <mesh position={[0.11, 0.27, 0.26]} material={materials.eye}><boxGeometry args={[0.07, 0.07, 0.02]} /></mesh>
                </group>
                {/* Arms (pivot at the shoulder) */}
                <group ref={leftArmRef} position={[-0.37, 1.42, 0]}>
                    <mesh position={[0, -0.34, 0]} material={materials.jacket} castShadow><boxGeometry args={[0.22, 0.7, 0.22]} /></mesh>
                    <mesh position={[0, -0.72, 0]} material={materials.skin}><boxGeometry args={[0.2, 0.12, 0.2]} /></mesh>
                </group>
                <group ref={rightArmRef} position={[0.37, 1.42, 0]}>
                    <mesh position={[0, -0.34, 0]} material={materials.jacket} castShadow><boxGeometry args={[0.22, 0.7, 0.22]} /></mesh>
                    <mesh position={[0, -0.72, 0]} material={materials.skin}><boxGeometry args={[0.2, 0.12, 0.2]} /></mesh>
                </group>
                {/* Legs (pivot at the hip) with Polarity Boots */}
                <group ref={leftLegRef} position={[-0.13, 0.74, 0]}>
                    <mesh position={[0, -0.3, 0]} material={materials.trousers} castShadow><boxGeometry args={[0.22, 0.56, 0.22]} /></mesh>
                    <mesh position={[0, -0.64, 0.02]} material={materials.boot} castShadow><boxGeometry args={[0.24, 0.2, 0.28]} /></mesh>
                </group>
                <group ref={rightLegRef} position={[0.13, 0.74, 0]}>
                    <mesh position={[0, -0.3, 0]} material={materials.trousers} castShadow><boxGeometry args={[0.22, 0.56, 0.22]} /></mesh>
                    <mesh position={[0, -0.64, 0.02]} material={materials.boot} castShadow><boxGeometry args={[0.24, 0.2, 0.28]} /></mesh>
                </group>
            </group>
        </group>
    );
};
