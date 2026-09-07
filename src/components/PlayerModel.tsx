import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { playerPose, viewRig, playerModelOpacity } from '../systems/player/viewRig';
import { motionStatus } from '../systems/player/playerMotion';
import { gameEvents } from '../systems/events/GameEvents';
import { BlockType } from '../types';
import { createHeldItemGeometry } from '../systems/player/heldItemGeometry';
import { textureAtlasManager } from '../systems/textures/TextureAtlasManager';
import { isSpriteRenderedType } from '../data/spriteBlocks';
import { playerAttack, playerMining, playerInteraction, attackPose } from '../systems/combat/playerAttack';
import { PlayerArmor } from './PlayerArmor';
import type { Equipment } from '../systems/registry/equipment';
import { BLOCKS } from '../data/blocks';
import { inputState } from '../systems/player/playerInput';
import { getPlayerWeaponProfile } from '../systems/combat/vaultWeapons';
import { headLookPitch, eatingPose, crouchPose, airbornePose, placementPose } from '../systems/player/playerAnimation';
import { usePlayerSkin, type PlayerSkin } from '../systems/player/playerSkins';
import { MinecraftSkinPart } from './MinecraftSkinPart';
import { useSkinTexture } from '../hooks/useSkinTexture';
import { WALK_SPEED } from '../systems/player/playerConstants';

// The player's own body, drawn only in third person: a blocky explorer with
// jointed limbs, animated procedurally from the physics pose every frame (no
// React re-renders).
//
// Orientation: the figure is modelled facing -Z, three.js's forward, so the
// basis the frame builds (right, up, -forward) drops straight onto it. Getting
// this backwards is why an earlier pass ran the character in reverse.
//
// Animation: every clip writes into one target pose (a flat set of joint
// angles), and the rig damps the live pose toward it each frame. Nothing snaps
// between states; a sprint that becomes a roll that becomes a wall climb reads
// as one continuous body. The only un-damped channel is the roll tumble, which
// is an absolute spin rather than a target to ease toward.
//
// Clips: idle breathing, walk, sprint (longer stride, forward lean, pumping
// arms), sneak, rise/fall, landing squash, dodge roll (a real somersault about
// the axis across the roll), magnetic dash (arms forward, body flat along the
// pull), repel leap, magnetic wall walking, attack/placement swings, and a hurt flinch.

const POLARITY_RED = 0xe53935;
const POLARITY_BLUE = 0x1e88e5;

const _up = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _back = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _mat = new THREE.Matrix4();
const _axis = new THREE.Vector3();
const _rollDir = new THREE.Vector3();

/** Height (blocks) of the body's centre of mass: the tumble pivots here. */
const PIVOT_Y = 0.95;

/** Every joint angle the rig blends. Radians unless noted. */
interface Pose {
    /** Whole-body offsets. */
    bodyY: number;
    bodyZ: number;
    torsoLean: number;
    bodyLean: number;      // pitch: negative leans toward model forward (-Z)
    bodyRoll: number;      // bank into a turn
    bodyTwist: number;     // yaw of the chest against the hips
    squash: number;        // 1 = neutral, < 1 = compressed on landing
    headPitch: number;
    headYaw: number;
    // Upper limb (shoulder / hip) and lower limb (elbow / knee) angles.
    armLUpper: number; armLLower: number; armLOut: number;
    armRUpper: number; armRLower: number; armROut: number;
    legLUpper: number; legLLower: number; legLOut: number;
    legRUpper: number; legRLower: number; legROut: number;
}

const newPose = (): Pose => ({
    bodyY: 0, bodyZ: 0, torsoLean: 0, bodyLean: 0, bodyRoll: 0, bodyTwist: 0, squash: 1,
    headPitch: 0, headYaw: 0,
    armLUpper: 0, armLLower: 0, armLOut: -0.06,
    armRUpper: 0, armRLower: 0, armROut: 0.06,
    legLUpper: 0, legLLower: 0, legLOut: 0,
    legRUpper: 0, legRLower: 0, legROut: 0,
});

const POSE_KEYS = Object.keys(newPose()) as (keyof Pose)[];

/** Reset a pose in place (no per-frame allocation in the render loop). */
function resetPose(p: Pose): void {
    p.bodyY = 0; p.bodyZ = 0; p.torsoLean = 0; p.bodyLean = 0; p.bodyRoll = 0; p.bodyTwist = 0; p.squash = 1;
    p.headPitch = 0; p.headYaw = 0;
    p.armLUpper = 0; p.armLLower = 0; p.armLOut = -0.06;
    p.armRUpper = 0; p.armRLower = 0; p.armROut = 0.06;
    p.legLUpper = 0; p.legLLower = 0; p.legLOut = 0;
    p.legRUpper = 0; p.legRLower = 0; p.legROut = 0;
}

export const PlayerModel: React.FC<{ itemType: BlockType | null; equipment: Equipment; skin?: PlayerSkin; preview?: boolean }> = ({ itemType, equipment, skin: previewSkin, preview = false }) => {
    const equippedSkin = usePlayerSkin();
    const skin = previewSkin ?? equippedSkin;
    const skinTexture = useSkinTexture(skin);
    const heldGeometry = useMemo(() => createHeldItemGeometry(itemType), [itemType]);
    const heldMaterial = useMemo(() => new THREE.MeshLambertMaterial({ map: preview ? null : textureAtlasManager.getTexture(), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }), [preview]);
    useEffect(() => () => heldGeometry?.dispose(), [heldGeometry]);
    useEffect(() => () => heldMaterial.dispose(), [heldMaterial]);
    const rootRef = useRef<THREE.Group>(null);
    const pivotRef = useRef<THREE.Group>(null);
    const bodyRef = useRef<THREE.Group>(null);
    const torsoRef = useRef<THREE.Group>(null);
    const headRef = useRef<THREE.Group>(null);
    const armLRef = useRef<THREE.Group>(null);
    const armLLowerRef = useRef<THREE.Group>(null);
    const armRRef = useRef<THREE.Group>(null);
    const armRLowerRef = useRef<THREE.Group>(null);
    const legLRef = useRef<THREE.Group>(null);
    const legLLowerRef = useRef<THREE.Group>(null);
    const legRRef = useRef<THREE.Group>(null);
    const legRLowerRef = useRef<THREE.Group>(null);

    const live = useRef<Pose>(newPose());
    const target = useRef<Pose>(newPose());
    /** Roll direction, latched when the roll starts (its velocity decays to nothing). */
    const rollAxis = useRef({ along: 0, across: 0 });
    const wasRolling = useRef(false);
    const walkPhase = useRef(0);
    const fadeMaterials = useRef(new WeakMap<THREE.Material, { opacity: number; transparent: boolean; depthWrite: boolean; alphaTest: number }>());
    const hurtUntil = useRef(0);
    const landUntil = useRef(0);
    const landStrength = useRef(0);
    const wasGrounded = useRef(true);
    const fallSpeed = useRef(0);

    const materials = useMemo(() => ({
        skin: new THREE.MeshLambertMaterial({ color: skin.palette.skin }),
        hair: new THREE.MeshLambertMaterial({ color: skin.palette.hair }),
        jacket: new THREE.MeshLambertMaterial({ color: skin.palette.jacket }),
        jacketDark: new THREE.MeshLambertMaterial({ color: skin.palette.jacketDark }),
        trousers: new THREE.MeshLambertMaterial({ color: skin.palette.trousers }),
        boot: new THREE.MeshLambertMaterial({ color: skin.palette.boot }),
        // Only a thin band on the boot carries the polarity glow, so the feet
        // read as charged trim rather than two solid blocks of colour.
        bootGlow: new THREE.MeshBasicMaterial({ color: POLARITY_RED, transparent: true, opacity: 0 }),
        eye: new THREE.MeshBasicMaterial({ color: 0x1a1a1a }),
    }), [skin.palette]);
    useEffect(() => () => { for (const m of Object.values(materials)) m.dispose(); }, [materials]);

    useEffect(() => {
        if (preview) return;
        const offDamaged = gameEvents.on('player:damaged', () => { hurtUntil.current = Date.now() + 260; });
        return offDamaged;
    }, [preview]);

    useFrame(({ clock }, delta) => {
        const root = rootRef.current;
        const pivot = pivotRef.current;
        const body = bodyRef.current;
        const torso = torsoRef.current;
        const head = headRef.current;
        if (!root || !pivot || !body || !torso || !head) return;
        if (preview) {
            const t = clock.elapsedTime;
            root.visible = true;
            body.position.y = Math.sin(t * 1.5) * 0.012;
            head.rotation.y = Math.sin(t * 0.7) * 0.08;
            if (armLRef.current) armLRef.current.rotation.set(Math.sin(t * 1.5) * 0.04, 0, 0.06);
            if (armRRef.current) armRRef.current.rotation.set(-Math.sin(t * 1.5) * 0.04, 0, -0.06);
            return;
        }
        const opacity = playerModelOpacity(viewRig.camera, playerPose, playerPose.up);
        root.visible = viewRig.showModel && opacity > 0.001;
        // Keep the pose advancing while hidden, so switching views resumes the current action.

        const dt = Math.min(0.1, delta);
        const t = playerPose.time;
        const pose = playerPose;
        const speed = Math.hypot(pose.vx, pose.attached ? pose.vy : 0, pose.vz);
        const now = Date.now();
        const hurt = now < hurtUntil.current;

        // --- Orientation. The body's up is the wall normal while latched, so a
        //     climber stands on the tower face instead of hanging off it.
        if (pose.attached) {
            _up.set(pose.up.x, pose.up.y, pose.up.z);
            _forward.set(pose.wallForward.x, pose.wallForward.y, pose.wallForward.z);
        } else {
            _up.set(0, 1, 0);
            _forward.set(-Math.sin(pose.yaw), 0, -Math.cos(pose.yaw));
        }
        _right.crossVectors(_forward, _up).normalize();
        _forward.crossVectors(_up, _right).normalize();
        _back.copy(_forward).negate();
        // The figure is modelled facing -Z, so local +Z is its back.
        _mat.makeBasis(_right, _up, _back);
        _quat.setFromRotationMatrix(_mat);
        root.quaternion.copy(_quat);
        root.position.set(pose.x, pose.y, pose.z);

        // --- Colour: the boots glow in the chosen polarity; a hit whitens the body.
        const polarityHex = pose.polarity < 0 ? POLARITY_BLUE : POLARITY_RED;
        materials.bootGlow.color.setHex(polarityHex);
        materials.bootGlow.opacity = pose.polarity === 0 ? 0 : 0.7 + 0.3 * Math.sin(t * 6);
        const flash = hurt ? 0.75 : 0;
        for (const m of [materials.skin, materials.jacket, materials.jacketDark, materials.trousers, materials.hair]) {
            m.emissive.setHex(0xffffff);
            m.emissiveIntensity = flash;
        }

        // --- Landing squash: remember the impact speed as the feet touch down.
        if (!pose.grounded && !pose.attached && !pose.inWater) fallSpeed.current = Math.max(fallSpeed.current, -pose.vy);
        if (pose.grounded && !pose.attached && !pose.inWater && !wasGrounded.current) {
            const impact = Math.min(1, fallSpeed.current / 18);
            if (impact > 0.12) { landUntil.current = now + 260; landStrength.current = impact; }
            fallSpeed.current = 0;
        }
        wasGrounded.current = pose.grounded || pose.attached || pose.inWater;
        if (pose.attached || pose.inWater) { fallSpeed.current = 0; landUntil.current = 0; }

        const p = target.current;
        resetPose(p);
        const action = pose.attached ? 'none' : motionStatus.action;
        const progress = motionStatus.progress;
        // Most joints ease; a few clips want to arrive almost immediately.
        let blendRate = 14;

        if (action === 'roll') {
            // A tuck: knees and elbows in, chin down. The tumble itself is applied
            // to the pivot below as an absolute spin.
            const tuck = Math.sin(Math.min(1, progress) * Math.PI);
            p.bodyY = -0.18 * tuck;
            p.squash = 1 - 0.18 * tuck;
            p.headPitch = 0.7 * tuck;
            p.armLUpper = -2.3 * tuck; p.armRUpper = -2.3 * tuck;
            p.armLLower = 1.9 * tuck; p.armRLower = 1.9 * tuck;
            p.armLOut = 0.35 * tuck; p.armROut = -0.35 * tuck;
            p.legLUpper = 1.7 * tuck; p.legRUpper = 1.7 * tuck;
            p.legLLower = -2.0 * tuck; p.legRLower = -2.0 * tuck;
            blendRate = 26;
        } else if (action === 'dash') {
            // Pulled by the field: arms speared forward, legs trailed, body flat.
            p.bodyLean = -1.05;
            p.bodyY = 0.12;
            p.headPitch = 0.75;
            p.armLUpper = 2.85; p.armRUpper = 2.85;
            p.armLLower = 0.15; p.armRLower = 0.15;
            p.armLOut = 0.16; p.armROut = -0.16;
            p.legLUpper = 0.35; p.legRUpper = 0.2;
            p.legLLower = -0.5; p.legRLower = -0.8;
            blendRate = 22;
        } else if (action === 'leap') {
            // Kicked away from a matching pole: arms up, knees drawn in.
            p.bodyLean = -0.3;
            p.armLUpper = 0.6; p.armRUpper = 0.45;
            p.armLOut = -0.35; p.armROut = 0.35;
            p.legLUpper = 1.0; p.legRUpper = 0.5;
            p.legLLower = -1.2; p.legRLower = -0.7;
            blendRate = 20;
        } else if (pose.inWater && !pose.grounded) {
            // Tread/kick in water rather than hanging in the jump pose.
            const stroke = Math.sin(t * 3);
            p.bodyLean = -0.2;
            p.armLUpper = 0.35 + stroke * 0.15; p.armRUpper = 0.35 - stroke * 0.15;
            p.armLLower = 0.3; p.armRLower = 0.3;
            p.armLOut = -0.3; p.armROut = 0.3;
            p.legLUpper = stroke * 0.22; p.legRUpper = -stroke * 0.22;
            p.legLLower = -0.2; p.legRLower = -0.2;
        } else if (!pose.grounded && !pose.attached) {
            const air = airbornePose(pose.vy);
            p.armLUpper = air.shoulder; p.armRUpper = air.shoulder + 0.12;
            p.armLLower = air.elbow; p.armRLower = air.elbow;
            p.armLOut = -air.outward; p.armROut = air.outward;
            p.legLUpper = air.hip; p.legRUpper = air.hip * 0.4;
            p.legLLower = air.knee; p.legRLower = air.knee * 0.5;
        } else {
            // Ground and magnetic-wall walking share a gait in the body's local plane.
            // Boots stand on the wall: an overhead climbing/jump pose contradicts that orientation.
            const stride = Math.min(1.4, speed / WALK_SPEED);
            const along = speed > 0.1 ? (pose.vx * _forward.x + pose.vy * _forward.y + pose.vz * _forward.z) / speed : 0;
            const across = speed > 0.1 ? (pose.vx * _right.x + pose.vy * _right.y + pose.vz * _right.z) / speed : 0;
            walkPhase.current += speed * dt * (pose.sprint ? 2.6 : 2.2) * (along < -0.2 ? -1 : 1);
            const swing = Math.sin(walkPhase.current);
            const lift = Math.cos(walkPhase.current);
            const amp = (pose.sprint ? 1.15 : 0.8) * stride;
            p.legLUpper = swing * amp * Math.max(0.25, Math.abs(along));
            p.legRUpper = -p.legLUpper;
            p.legLOut = swing * amp * across * 0.45;
            p.legROut = -p.legLOut;
            // Knees only bend on the back half of the stride (a real gait).
            p.legLLower = -Math.max(0, -swing) * amp * 1.5;
            p.legRLower = -Math.max(0, swing) * amp * 1.5;
            p.armLUpper = -swing * amp * 0.85;
            p.armRUpper = swing * amp * 0.85;
            p.armLLower = Math.max(0, -swing) * amp * 0.7 + 0.15 * stride;
            p.armRLower = Math.max(0, swing) * amp * 0.7 + 0.15 * stride;
            p.bodyY = Math.abs(lift) * 0.045 * stride;
            p.bodyTwist = -swing * 0.16 * stride;
            p.bodyLean = -(pose.sprint ? 0.22 : 0.06 * stride) * along;
            p.bodyRoll = -across * stride * 0.06;

            if (pose.sneak) {
                const crouch = crouchPose();
                p.bodyY = crouch.bodyY; p.bodyZ = crouch.bodyZ;
                p.bodyLean = 0; p.torsoLean = crouch.torsoLean;
                p.squash = 1;
                p.legLUpper = crouch.hip + p.legLUpper * 0.4;
                p.legRUpper = crouch.hip + p.legRUpper * 0.4;
                p.legLLower = crouch.knee + p.legLLower * 0.3;
                p.legRLower = crouch.knee + p.legRLower * 0.3;
                p.legLOut = 0; p.legROut = 0;
                p.armLUpper = crouch.shoulder + p.armLUpper * 0.3;
                p.armRUpper = crouch.shoulder + p.armRUpper * 0.3;
                p.armLLower = crouch.elbow; p.armRLower = crouch.elbow;
                p.armLOut = -0.07; p.armROut = 0.07;
            }

            if (speed < 0.25 && !pose.sneak) {
                // Idle: breathing, a slow weight shift, arms hanging.
                const breathe = Math.sin(t * 1.5);
                p.bodyY = breathe * 0.018;
                p.bodyRoll = Math.sin(t * 0.6) * 0.03;
                p.armLUpper = breathe * 0.05; p.armRUpper = -breathe * 0.05;
                p.armLLower = 0.12; p.armRLower = 0.12;
                p.armLOut = -0.08; p.armROut = 0.08;
            }
        }

        // Landing squash rides on top of whatever clip is playing.
        if (now < landUntil.current && action !== 'roll') {
            const k = (landUntil.current - now) / 260;
            const dip = Math.sin(k * Math.PI) * landStrength.current;
            p.bodyY -= dip * 0.34;
            p.squash -= dip * 0.16;
            p.legLLower -= dip * 1.1; p.legRLower -= dip * 1.1;
            p.legLUpper += dip * 0.5; p.legRUpper += dip * 0.5;
            p.legLOut += dip * 0.2; p.legROut -= dip * 0.2;
            p.armLUpper -= dip * 0.6; p.armRUpper -= dip * 0.6;
        }

        // The head tracks the look pitch in every clip that has not claimed it.
        p.headPitch += action === 'roll' ? -pose.pitch * 0.55 : headLookPitch(pose.pitch, p.bodyLean + p.torsoLean);

        // A hit knocks the chest back for a beat.
        if (hurt) {
            const k = (hurtUntil.current - now) / 260;
            p.bodyLean += 0.3 * k;
            p.bodyRoll += 0.12 * k;
            p.armLOut += 0.3 * k; p.armROut -= 0.3 * k;
        }

        // Carry the selected item in a relaxed forward grip. Combat takes priority
        // over locomotion in the upper body; evade poses remain untouched.
        if (action === 'none') {
            if (itemType !== null && !pose.sneak) { p.armRUpper = Math.max(0.18, p.armRUpper * 0.35); p.armRLower = 0.28; }
            const attack = attackPose(playerAttack);
            if (attack.weight && getPlayerWeaponProfile(itemType) && playerAttack.kind === 'crossbow') {
                const recoil = Math.sin(Math.max(0, (playerAttack.elapsed / playerAttack.duration - 0.5) * 2) * Math.PI);
                p.armRUpper = 1.25 - p.torsoLean - recoil * 0.12;
                p.armRLower = 0.15 + recoil * 0.15;
                p.armROut = -0.05;
                p.armLUpper = 1.1 - p.torsoLean;
                p.armLLower = 0.65;
                p.armLOut = 0.1;
                blendRate = 24;
            } else if (attack.weight && getPlayerWeaponProfile(itemType)) {
                p.armRUpper = attack.shoulder - p.torsoLean;
                p.armRLower = attack.elbow;
                p.armROut = -0.15 - attack.sweep * 0.5;
                p.bodyTwist += attack.twist;
                p.armLUpper = 0.3 + attack.shoulder * 0.25;
                p.armLLower = 0.5;
                blendRate = 32;
            } else if (placementPose(playerInteraction.placementElapsed).weight > 0) {
                const place = placementPose(playerInteraction.placementElapsed);
                p.armRUpper = place.shoulder - p.torsoLean;
                p.armRLower = place.elbow;
                p.armROut = -0.08;
                blendRate = 24;
            } else if (playerMining.active || (playerInteraction.leftHeld && !getPlayerWeaponProfile(itemType))) {
                const arc = 0.5 + Math.sin((playerMining.active ? playerMining.elapsed : t) * 12) * 0.5;
                p.armRUpper = 0.45 + arc * 1.25 - p.torsoLean;
                p.armRLower = 0.25 + arc * 0.4;
                p.bodyTwist += arc * 0.12;
            }
        }

        if (action === 'none' && inputState.eating && itemType !== null && BLOCKS[itemType]?.nutrition) {
            const eat = eatingPose(t);
            p.armRUpper = eat.shoulder - p.torsoLean;
            p.armRLower = eat.elbow;
            p.armROut = eat.inward;
            p.headPitch += eat.head;
            blendRate = 20;
        }

        // --- Blend the live pose toward the target and write it to the rig.
        const k = 1 - Math.exp(-blendRate * dt);
        const l = live.current;
        for (const key of POSE_KEYS) l[key] += (p[key] - l[key]) * k;

        pivot.position.set(0, PIVOT_Y, 0);
        body.position.set(0, -PIVOT_Y + l.bodyY, l.bodyZ);
        body.scale.set(1, Math.max(0.35, l.squash), 1);

        if (action === 'roll') {
            // A real somersault about the axis lying across the roll direction,
            // pivoting on the body's centre so it tumbles rather than pinwheeling
            // around the feet. The direction is latched at the start because the
            // roll's own velocity eases to nothing by the end.
            if (!wasRolling.current) {
                _rollDir.set(pose.vx, 0, pose.vz);
                if (_rollDir.lengthSq() < 1e-6) _rollDir.copy(_forward);
                _rollDir.normalize();
                rollAxis.current.along = _rollDir.dot(_forward);
                rollAxis.current.across = _rollDir.dot(_right);
            }
            // Local frame: +X is right, +Y is up, -Z is forward. The tumble axis
            // is up × direction, so a forward roll pitches head-over-heels and a
            // sideways roll banks over that shoulder.
            _axis.set(-rollAxis.current.along, 0, -rollAxis.current.across);
            if (_axis.lengthSq() < 1e-6) _axis.set(-1, 0, 0);
            _axis.normalize();
            pivot.quaternion.setFromAxisAngle(_axis, Math.min(1, progress) * Math.PI * 2);
        } else {
            pivot.rotation.set(l.bodyLean, 0, l.bodyRoll);
        }
        wasRolling.current = action === 'roll';

        torso.rotation.set(l.torsoLean, l.bodyTwist, 0);
        head.rotation.set(l.headPitch, l.headYaw, 0);
        if (armLRef.current) armLRef.current.rotation.set(l.armLUpper, 0, l.armLOut);
        if (armRRef.current) armRRef.current.rotation.set(l.armRUpper, 0, l.armROut);
        if (armLLowerRef.current) armLLowerRef.current.rotation.x = l.armLLower;
        if (armRLowerRef.current) armRLowerRef.current.rotation.x = l.armRLower;
        if (legLRef.current) legLRef.current.rotation.set(l.legLUpper, 0, l.legLOut);
        if (legRRef.current) legRRef.current.rotation.set(l.legRUpper, 0, l.legROut);
        if (legLLowerRef.current) legLLowerRef.current.rotation.x = l.legLLower;
        if (legRLowerRef.current) legRLowerRef.current.rotation.x = l.legRLower;
        root.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            const list = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of list) {
                let original = fadeMaterials.current.get(material);
                if (!original) {
                    original = { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite, alphaTest: material.alphaTest };
                    fadeMaterials.current.set(material, original);
                }
                const fading = opacity < 0.999;
                if (material.alphaHash !== fading) {
                    material.alphaHash = fading;
                    material.transparent = fading ? false : original.transparent;
                    material.depthWrite = fading || original.depthWrite;
                    material.needsUpdate = true;
                }
                const baseOpacity = material === materials.bootGlow ? (pose.polarity === 0 ? 0 : 0.7 + 0.3 * Math.sin(t * 6)) : original.opacity;
                material.opacity = baseOpacity * opacity;
                material.alphaTest = original.alphaTest * opacity;
            }
        });
    });

    // Geometry faces -Z (three.js forward): eyes and jacket front at negative z.
    return (
        <group ref={rootRef} visible={false}>
            <group ref={pivotRef}>
                <group ref={bodyRef}>
                    {skin.model !== 'atlas' ? <>
                    <PlayerArmor item={equipment.leggings} part="hips" />
                    <group ref={legLRef} position={[-0.125, 0.75, 0]}>
                        <MinecraftSkinPart skin={skin} texture={skinTexture} part="leftLeg" half="upper" position={[0, -0.1875, 0]} />
                        <group scale={[1.1, 1, 1.1]}><PlayerArmor item={equipment.leggings} part="thigh" /></group>
                        <group ref={legLLowerRef} position={[0, -0.375, 0]}>
                            <MinecraftSkinPart skin={skin} texture={skinTexture} part="leftLeg" half="lower" position={[0, -0.1875, 0]} />
                            <group scale={[1.2, 1, 1.2]}><PlayerArmor item={equipment.leggings} part="shin" /></group>
                            <group position={[0, 0.1, 0]}><PlayerArmor item={equipment.boots} part="boot" /></group>
                            <mesh position={[0, -0.25, -0.02]} material={materials.bootGlow}><boxGeometry args={[0.285, 0.05, 0.355]} /></mesh>
                        </group>
                    </group>
                    <group ref={legRRef} position={[0.125, 0.75, 0]}>
                        <MinecraftSkinPart skin={skin} texture={skinTexture} part="rightLeg" half="upper" position={[0, -0.1875, 0]} />
                        <group scale={[1.1, 1, 1.1]}><PlayerArmor item={equipment.leggings} part="thigh" /></group>
                        <group ref={legRLowerRef} position={[0, -0.375, 0]}>
                            <MinecraftSkinPart skin={skin} texture={skinTexture} part="rightLeg" half="lower" position={[0, -0.1875, 0]} />
                            <group scale={[1.2, 1, 1.2]}><PlayerArmor item={equipment.leggings} part="shin" /></group>
                            <group position={[0, 0.1, 0]}><PlayerArmor item={equipment.boots} part="boot" /></group>
                            <mesh position={[0, -0.25, -0.02]} material={materials.bootGlow}><boxGeometry args={[0.285, 0.05, 0.355]} /></mesh>
                        </group>
                    </group>
                    <group ref={torsoRef} position={[0, 0.75, 0]}>
                        <MinecraftSkinPart skin={skin} texture={skinTexture} part="body" position={[0, 0.375, 0]} />
                        <PlayerArmor item={equipment.chestplate} part="chest" />
                        <group ref={headRef} position={[0, 0.75, 0]}>
                            <MinecraftSkinPart skin={skin} texture={skinTexture} part="head" position={[0, 0.25, 0]} />
                            <PlayerArmor item={equipment.helmet} part="helmet" />
                        </group>
                        <group ref={armLRef} position={[-1 * (skin.model === 'slim' ? 0.34375 : 0.375), 0.75, 0]}>
                            <MinecraftSkinPart skin={skin} texture={skinTexture} part="leftArm" half="upper" position={[0, -0.1875, 0]} />
                            <group scale={[1.1, 1, 1.1]}><PlayerArmor item={equipment.chestplate} part="shoulder" /></group>
                            <group ref={armLLowerRef} position={[0, -0.375, 0]}>
                                <MinecraftSkinPart skin={skin} texture={skinTexture} part="leftArm" half="lower" position={[0, -0.1875, 0]} />
                            </group>
                        </group>
                        <group ref={armRRef} position={[1 * (skin.model === 'slim' ? 0.34375 : 0.375), 0.75, 0]}>
                            <MinecraftSkinPart skin={skin} texture={skinTexture} part="rightArm" half="upper" position={[0, -0.1875, 0]} />
                            <group scale={[1.1, 1, 1.1]}><PlayerArmor item={equipment.chestplate} part="shoulder" /></group>
                            <group ref={armRLowerRef} position={[0, -0.375, 0]}>
                                <MinecraftSkinPart skin={skin} texture={skinTexture} part="rightArm" half="lower" position={[0, -0.1875, 0]} />
                                {heldGeometry && itemType !== null && <group position={[0, -0.38, -0.06]}>
                                    <mesh geometry={heldGeometry} material={heldMaterial} castShadow
                                        position={isSpriteRenderedType(itemType) ? [0, 0.16, -0.14] : [0, -0.02, -0.18]}
                                        rotation={isSpriteRenderedType(itemType) ? [0, Math.PI / 2, -Math.PI / 4] : [0, 0, 0]}
                                        scale={isSpriteRenderedType(itemType) ? 1.5 : 0.8} />
                                </group>}
                            </group>
                        </group>
                    </group>
                    </> : <>
                    <PlayerArmor item={equipment.leggings} part="hips" />
                    {/* Hips + legs (each: thigh pivoting at the hip, shin at the knee) */}
                    <mesh position={[0, 0.76, 0]} material={materials.jacketDark} castShadow><boxGeometry args={[0.5, 0.16, 0.26]} /></mesh>
                    <group ref={legLRef} position={[-0.13, 0.74, 0]}>
                        <PlayerArmor item={equipment.leggings} part="thigh" />
                        <mesh position={[0, -0.17, 0]} material={materials.trousers} castShadow><boxGeometry args={[0.22, 0.34, 0.22]} /></mesh>
                        <group ref={legLLowerRef} position={[0, -0.34, 0]}>
                            <PlayerArmor item={equipment.leggings} part="shin" />
                            <PlayerArmor item={equipment.boots} part="boot" />
                            <mesh position={[0, -0.17, 0]} material={materials.trousers} castShadow><boxGeometry args={[0.2, 0.34, 0.2]} /></mesh>
                            <mesh position={[0, -0.4, -0.02]} material={materials.boot} castShadow><boxGeometry args={[0.24, 0.18, 0.28]} /></mesh>
                            <mesh position={[0, -0.34, -0.02]} material={materials.bootGlow}><boxGeometry args={[0.285, 0.05, 0.355]} /></mesh>
                        </group>
                    </group>
                    <group ref={legRRef} position={[0.13, 0.74, 0]}>
                        <PlayerArmor item={equipment.leggings} part="thigh" />
                        <mesh position={[0, -0.17, 0]} material={materials.trousers} castShadow><boxGeometry args={[0.22, 0.34, 0.22]} /></mesh>
                        <group ref={legRLowerRef} position={[0, -0.34, 0]}>
                            <PlayerArmor item={equipment.leggings} part="shin" />
                            <PlayerArmor item={equipment.boots} part="boot" />
                            <mesh position={[0, -0.17, 0]} material={materials.trousers} castShadow><boxGeometry args={[0.2, 0.34, 0.2]} /></mesh>
                            <mesh position={[0, -0.4, -0.02]} material={materials.boot} castShadow><boxGeometry args={[0.24, 0.18, 0.28]} /></mesh>
                            <mesh position={[0, -0.34, -0.02]} material={materials.bootGlow}><boxGeometry args={[0.285, 0.05, 0.355]} /></mesh>
                        </group>
                    </group>
                    {/* Chest (twists against the hips), head and arms */}
                    <group ref={torsoRef} position={[0, 0.76, 0]}>
                        <PlayerArmor item={equipment.chestplate} part="chest" />
                        <mesh position={[0, 0.37, 0]} material={materials.jacket} castShadow><boxGeometry args={[0.5, 0.74, 0.26]} /></mesh>
                        <mesh position={[0, 0.6, -0.14]} material={materials.jacketDark} castShadow><boxGeometry args={[0.44, 0.28, 0.02]} /></mesh>
                        {skin.detail === 'scarf' && <group>
                            <mesh position={[0, 0.69, 0]} material={materials.jacketDark}><boxGeometry args={[0.54, 0.12, 0.3]} /></mesh>
                            <mesh position={[0.12, 0.46, -0.16]} material={materials.jacketDark}><boxGeometry args={[0.13, 0.38, 0.04]} /></mesh>
                        </group>}
                        {skin.detail === 'vest' && [-1, 1].map(side => <mesh key={side} position={[side * 0.17, 0.3, -0.15]} material={materials.jacketDark}><boxGeometry args={[0.14, 0.38, 0.04]} /></mesh>)}
                        <group ref={headRef} position={[0, 0.74, 0]}>
                            {skin.detail === 'goggles' && <group>
                                <mesh position={[0, 0.32, -0.27]} material={materials.jacketDark}><boxGeometry args={[0.48, 0.14, 0.04]} /></mesh>
                                {[-1, 1].map(side => <mesh key={side} position={[side * 0.12, 0.32, -0.3]}><boxGeometry args={[0.15, 0.08, 0.02]} /><meshLambertMaterial color="#a9d1d0" /></mesh>)}
                            </group>}
                            <PlayerArmor item={equipment.helmet} part="helmet" />
                            <mesh position={[0, 0.25, 0]} material={materials.skin} castShadow><boxGeometry args={[0.5, 0.5, 0.5]} /></mesh>
                            <mesh position={[0, 0.44, 0.02]} material={materials.hair}><boxGeometry args={[0.52, 0.14, 0.52]} /></mesh>
                            <mesh position={[0, 0.3, 0.26]} material={materials.hair}><boxGeometry args={[0.52, 0.22, 0.04]} /></mesh>
                            <mesh position={[-0.11, 0.27, -0.26]} material={materials.eye}><boxGeometry args={[0.07, 0.07, 0.02]} /></mesh>
                            <mesh position={[0.11, 0.27, -0.26]} material={materials.eye}><boxGeometry args={[0.07, 0.07, 0.02]} /></mesh>
                        </group>
                        <group ref={armLRef} position={[-0.36, 0.66, 0]}>
                            <PlayerArmor item={equipment.chestplate} part="shoulder" />
                            <mesh position={[0, -0.18, 0]} material={materials.jacket} castShadow><boxGeometry args={[0.2, 0.36, 0.2]} /></mesh>
                            <group ref={armLLowerRef} position={[0, -0.36, 0]}>
                                <mesh position={[0, -0.17, 0]} material={materials.jacket} castShadow><boxGeometry args={[0.19, 0.34, 0.19]} /></mesh>
                                <mesh position={[0, -0.38, 0]} material={materials.skin}><boxGeometry args={[0.18, 0.12, 0.18]} /></mesh>
                            </group>
                        </group>
                        <group ref={armRRef} position={[0.36, 0.66, 0]}>
                            <PlayerArmor item={equipment.chestplate} part="shoulder" />
                            <mesh position={[0, -0.18, 0]} material={materials.jacket} castShadow><boxGeometry args={[0.2, 0.36, 0.2]} /></mesh>
                            <group ref={armRLowerRef} position={[0, -0.36, 0]}>
                                <mesh position={[0, -0.17, 0]} material={materials.jacket} castShadow><boxGeometry args={[0.19, 0.34, 0.19]} /></mesh>
                                <mesh position={[0, -0.38, 0]} material={materials.skin}><boxGeometry args={[0.18, 0.12, 0.18]} /></mesh>
                                {heldGeometry && itemType !== null && <group position={[0, -0.38, -0.06]}>
                                    <mesh geometry={heldGeometry} material={heldMaterial} castShadow
                                        position={isSpriteRenderedType(itemType) ? [0, 0.16, -0.14] : [0, -0.02, -0.18]}
                                        rotation={isSpriteRenderedType(itemType) ? [0, Math.PI / 2, -Math.PI / 4] : [0, 0, 0]}
                                        scale={isSpriteRenderedType(itemType) ? 1.5 : 0.8} />
                                </group>}
                            </group>
                        </group>
                    </group>
                    </>}
                </group>
            </group>
        </group>
    );
};
