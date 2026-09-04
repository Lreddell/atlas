import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { entityManager } from '../systems/entities/EntityManager';
import { magneticWardenEncounter } from '../systems/boss/MagneticWardenEncounter';
import { WARDEN_TIMING } from '../systems/boss/magneticWardenCore';

// The Magnetic Warden's body, its three forms, and every telegraph of its fight,
// driven from the encounter snapshot each frame (no React re-renders):
//
//   Form I  WARDEN  a magnetite golem: torso, head with an emissive eye slit,
//                   two arms that raise for a Volley and reach for a Draw, and a
//                   halo of four shards that swings for a Lash and contracts for a
//                   Draw. Polarity tints the plates and lights the core.
//   Form II AEGIS   the bare core with two wing plates, hovering; the tether beam
//                   runs from its tower crystal, wings droop when it lies stunned.
//   Form III STORM  the core on the ground behind its orbiting shards (drawn at the
//                   same positions the hit test uses) with a contracting countdown
//                   ring that shows the colour of the coming beat.
//
// Ground telegraphs share their geometry with the core's hit tests: the Lash
// sector is the Lash cone, the Draw disc is the Repel radius, the plunge disc is
// the impact radius, and the beat ring counts the metronome down.

const POLARITY_RED = 0xe53935;
const POLARITY_BLUE = 0x1e88e5;
const MAGNETITE = 0x4a3d63;
const MAGNETITE_DARK = 0x2a2238;
const CHISELED = 0x6f5f94;
const CHARGED = 0xb388ff;
const SHIELD = 0x9c6bff;
const BEAT_LEAD = 1.2;

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _color = new THREE.Color();
const _polarity = new THREE.Color();

const ease = (t: number): number => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
const polarityHex = (p: number): number => (p > 0 ? POLARITY_RED : POLARITY_BLUE);

function drawBeam(m: THREE.Mesh, fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, thickness: number, opacity: number): void {
    _dir.set(tx - fx, ty - fy, tz - fz);
    const len = _dir.length() || 1;
    _dir.multiplyScalar(1 / len);
    _mid.set(fx, fy, fz).addScaledVector(_dir, len * 0.5);
    m.visible = true;
    m.position.copy(_mid);
    m.quaternion.setFromUnitVectors(_up, _dir);
    m.scale.set(thickness, len, thickness);
    (m.material as THREE.MeshBasicMaterial).opacity = opacity;
}

export const MagneticWardenRenderer: React.FC = () => {
    const rootRef = useRef<THREE.Group>(null);
    const bodyRef = useRef<THREE.Group>(null);
    const leftArmRef = useRef<THREE.Group>(null);
    const rightArmRef = useRef<THREE.Group>(null);
    const haloRef = useRef<THREE.Group>(null);
    const haloShardRefs = useRef<Array<THREE.Mesh | null>>([]);
    const coreRef = useRef<THREE.Group>(null);
    const coreInnerRef = useRef<THREE.Mesh>(null);
    const wingsRef = useRef<THREE.Group>(null);
    const leftWingRef = useRef<THREE.Mesh>(null);
    const rightWingRef = useRef<THREE.Mesh>(null);
    const stormShardRefs = useRef<Array<THREE.Mesh | null>>([]);
    const groundGlowRef = useRef<THREE.Mesh>(null);
    const sectorRef = useRef<THREE.Mesh>(null);
    const drawDiscRef = useRef<THREE.Mesh>(null);
    const drawRangeRef = useRef<THREE.Mesh>(null);
    const plungeDiscRef = useRef<THREE.Mesh>(null);
    const beatRingRef = useRef<THREE.Mesh>(null);
    const beatRing2Ref = useRef<THREE.Mesh>(null);
    const shieldRef = useRef<THREE.Mesh>(null);
    const auraRef = useRef<THREE.Mesh>(null);
    const tetherRef = useRef<THREE.Mesh>(null);
    const coreLightRef = useRef<THREE.PointLight>(null);
    const lastPolarity = useRef(0);
    const auraFlashUntil = useRef(0);
    const tetherFadeUntil = useRef(0);
    const tetherLast = useRef<{ x: number; y: number; z: number } | null>(null);

    const materials = useMemo(() => ({
        plate: new THREE.MeshLambertMaterial({ color: MAGNETITE }),
        dark: new THREE.MeshLambertMaterial({ color: MAGNETITE_DARK }),
        chiseled: new THREE.MeshLambertMaterial({ color: CHISELED }),
        shard: new THREE.MeshLambertMaterial({ color: CHISELED, emissive: new THREE.Color(CHARGED), emissiveIntensity: 0.35 }),
        core: new THREE.MeshLambertMaterial({ color: 0x1a1426, emissive: new THREE.Color(POLARITY_RED), emissiveIntensity: 1.2 }),
        eye: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    }), []);
    useEffect(() => () => { for (const m of Object.values(materials)) m.dispose(); }, [materials]);

    useFrame(({ clock }) => {
        const root = rootRef.current;
        if (!root) return;
        const snap = magneticWardenEncounter.getSnapshot();
        const entity = snap.entityId !== null ? entityManager.getEntity(snap.entityId) : undefined;
        const hideAll = () => {
            root.visible = false;
            for (const ref of [sectorRef, drawDiscRef, drawRangeRef, plungeDiscRef, beatRingRef, beatRing2Ref, shieldRef, auraRef, tetherRef, groundGlowRef]) {
                if (ref.current) ref.current.visible = false;
            }
            for (const shard of stormShardRefs.current) if (shard) shard.visible = false;
            if (coreLightRef.current) coreLightRef.current.intensity = 0;
        };
        if (!entity || entity.hp <= 0) { hideAll(); return; }
        root.visible = true;

        const now = Date.now();
        const t = clock.elapsedTime;
        const p = ease(snap.actionTime / Math.max(0.001, snap.actionDuration));
        const raw = Math.max(0, Math.min(1, snap.actionTime / Math.max(0.001, snap.actionDuration)));
        const hurt = now < entity.hurtUntil;
        const action = snap.action;
        const stunned = snap.stunned;

        // --- Colour: polarity tints the plates and lights the core. A swap
        //     telegraph flickers between the two colours faster and faster.
        let polarity: number = snap.polarity;
        if (action === 'swap_windup' && Math.sin(t * (8 + 40 * raw)) > 0.2) polarity = -polarity;
        _polarity.setHex(polarityHex(polarity));
        _color.setHex(MAGNETITE).lerp(_polarity, hurt ? 1 : 0.5);
        if (hurt) _color.setHex(0xffffff);
        materials.plate.color.copy(_color);
        materials.core.emissive.copy(_polarity);
        const corePulse = 0.85 + 0.35 * Math.sin(t * (action === 'spiral' ? 9 : 4));
        materials.core.emissiveIntensity = stunned ? 0.25 + 0.2 * (Math.sin(t * 23) > 0 ? 1 : 0) : corePulse * (snap.drawActive ? 1.6 : 1);
        materials.shard.emissive.copy(_polarity);
        materials.shard.emissiveIntensity = action === 'spiral' ? 0.9 : 0.35;
        if (coreLightRef.current) {
            coreLightRef.current.color.copy(_polarity);
            coreLightRef.current.intensity = stunned ? 0.6 : 2.4 + corePulse * 0.8;
        }

        // --- Root: the entity's feet, yawed to its facing.
        root.position.set(entity.pos.x, entity.pos.y, entity.pos.z);
        root.rotation.y = entity.yaw;

        // --- Form I body.
        const body = bodyRef.current;
        if (body) {
            const showBody = snap.form === 1;
            body.visible = showBody;
            if (showBody) {
                const breathe = Math.sin(t * 1.4) * 0.03;
                body.position.set(0, breathe, 0);
                body.rotation.set(0, 0, 0);
                body.scale.setScalar(1);
                if (action === 'stagger') {
                    body.rotation.z = 0.35 * Math.sin(raw * Math.PI);
                    body.position.y = -0.25 * Math.sin(raw * Math.PI);
                } else if (action === 'shatter') {
                    // The duel body comes apart as the core rises out of it.
                    body.scale.setScalar(Math.max(0.001, 1 - p));
                    body.position.y = -p * 1.5;
                } else if (action === 'volley_windup' || action === 'draw_windup') {
                    body.rotation.x = -0.12 * p;
                } else if (action === 'lash_windup') {
                    body.rotation.y = -0.45 * p;
                } else if (action === 'lash_active') {
                    body.rotation.y = -0.45 + 1.2 * ease(Math.min(1, raw * 1.4));
                } else if (action === 'lash_recovery') {
                    body.rotation.y = 0.75 * (1 - p);
                }
                const left = leftArmRef.current, right = rightArmRef.current;
                if (left && right) {
                    const sway = Math.sin(t * 1.3) * 0.06;
                    let l = sway, r = -sway;
                    if (action === 'volley_windup') r = -1.7 * p;
                    else if (action === 'volley_active') r = -1.9;
                    else if (action === 'volley_recovery') r = -1.6 * (1 - p);
                    else if (action === 'draw_windup') { l = -1.25 * p; r = -1.25 * p; }
                    else if (action === 'draw_active') { l = -1.25 + 0.08 * Math.sin(t * 12); r = -1.25 - 0.08 * Math.sin(t * 12); }
                    else if (action === 'draw_recovery') { l = -1.25 * (1 - p); r = -1.25 * (1 - p); }
                    else if (action === 'stagger') { l = 0.6 * Math.sin(raw * Math.PI); r = 0.6 * Math.sin(raw * Math.PI); }
                    left.rotation.x = l;
                    right.rotation.x = r;
                }
            }
        }

        // --- The halo of four shards (Form I): swings for the Lash, contracts
        //     for the Draw, and flies apart in the shatter.
        const halo = haloRef.current;
        if (halo) {
            const showHalo = snap.form === 1;
            halo.visible = showHalo;
            if (showHalo) {
                let radius = 1.5, spin = t * 0.9, offset = 0, y = 2.35, alpha = 1;
                if (action === 'lash_windup') { offset = -1.3 * p; radius = 1.9; }
                else if (action === 'lash_active') { offset = -1.3 + 3.4 * ease(Math.min(1, raw * 1.3)); radius = 2.1; }
                else if (action === 'lash_recovery') { offset = 2.1 * (1 - p); }
                else if (action === 'draw_windup') { radius = 1.5 - 0.65 * p; spin = t * (0.9 + 5 * p); }
                else if (action === 'draw_active') { radius = 0.8; spin = t * 7; }
                else if (action === 'draw_recovery') { radius = 0.8 + 0.7 * p; spin = t * (7 - 6 * p); }
                else if (action === 'shatter') { radius = 1.5 + 9 * p; y = 2.35 + 4 * p; alpha = 1 - p; }
                halo.position.y = y;
                halo.rotation.y = spin + offset;
                halo.rotation.x = 0;
                haloShardRefs.current.forEach((shard, index) => {
                    if (!shard) return;
                    const a = (index / 4) * Math.PI * 2;
                    shard.position.set(Math.cos(a) * radius, Math.sin(t * 2 + index) * 0.12, Math.sin(a) * radius);
                    shard.rotation.set(0, -a, 0.35);
                    shard.scale.setScalar(Math.max(0.001, alpha));
                });
            }
        }

        // --- The core: the one part of the Warden that persists across forms.
        const core = coreRef.current;
        if (core) {
            let y = 1.6, scale = 0.55, spinRate = 0.8;
            if (snap.form === 1 && action === 'shatter') { y = 1.6 + 1.2 * p; scale = 0.55 + 0.55 * p; }
            else if (snap.form === 2) { y = entity.height * 0.5; scale = 1.05; spinRate = stunned ? 0.15 : 1.1; }
            else if (snap.form === 3) { y = entity.height * 0.5; scale = 1.35; spinRate = action === 'spiral' ? 3.2 : 1.2; }
            core.position.set(0, y, snap.form === 1 && action !== 'shatter' ? 0.55 : 0);
            core.rotation.set(t * spinRate * 0.7 + Math.PI / 4, t * spinRate, Math.PI / 4);
            core.scale.setScalar(scale);
            if (stunned) core.position.x = (Math.random() - 0.5) * 0.08;
            if (coreInnerRef.current) coreInnerRef.current.rotation.set(-t * spinRate * 1.6, t * spinRate * 0.4, 0);
        }

        // --- Form II wings.
        const wings = wingsRef.current;
        if (wings) {
            const showWings = snap.form === 2;
            wings.visible = showWings;
            if (showWings) {
                wings.position.y = entity.height * 0.5;
                let spread = snap.tether ? 0.4 : 0.15;
                if (action === 'plunge_windup' || action === 'plunge_drop') spread = -0.9;
                else if (stunned || action === 'crash') spread = -0.6;
                else if (action === 'recover') spread = -0.6 + 1.0 * p;
                spread += Math.sin(t * 2.2) * 0.05;
                if (leftWingRef.current) leftWingRef.current.rotation.z = spread;
                if (rightWingRef.current) rightWingRef.current.rotation.z = -spread;
            }
        }

        // --- Form III shard barrier: drawn where the hit test samples them.
        stormShardRefs.current.forEach((shard, index) => {
            if (!shard) return;
            const world = snap.shards[index];
            shard.visible = !!world;
            if (world) {
                shard.position.set(world.x, world.y, world.z);
                shard.rotation.set(t * 3 + index, t * 2.1, 0.5);
            }
        });
        const glow = groundGlowRef.current;
        if (glow) {
            glow.visible = snap.form === 3 && action !== 'storm_rise';
            if (glow.visible) {
                glow.position.set(entity.pos.x, snap.floorY + 0.04, entity.pos.z);
                glow.scale.setScalar(WARDEN_TIMING.form3.shardRadius + 0.6);
                const gm = glow.material as THREE.MeshBasicMaterial;
                gm.color.setHex(polarityHex(snap.polarity));
                gm.opacity = 0.12 + 0.08 * Math.sin(t * 5);
            }
        }

        // --- Telegraphs.
        const sector = sectorRef.current;
        if (sector) {
            sector.visible = action === 'lash_windup' || action === 'lash_active';
            if (sector.visible) {
                sector.position.set(entity.pos.x, snap.floorY + 0.05, entity.pos.z);
                sector.rotation.set(-Math.PI / 2, 0, entity.yaw);
                sector.scale.setScalar(WARDEN_TIMING.lash.range);
                const sm = sector.material as THREE.MeshBasicMaterial;
                sm.color.setHex(polarityHex(snap.polarity));
                sm.opacity = action === 'lash_active' ? 0.7 : 0.18 + 0.4 * raw + 0.05 * Math.sin(t * 14);
            }
        }
        const drawDisc = drawDiscRef.current, drawRange = drawRangeRef.current;
        if (drawDisc && drawRange) {
            const showDraw = action === 'draw_windup' || action === 'draw_active';
            drawDisc.visible = showDraw;
            drawRange.visible = showDraw;
            if (showDraw) {
                const pulse = 0.5 + 0.5 * Math.sin(t * (action === 'draw_active' ? 16 : 6));
                drawDisc.position.set(entity.pos.x, snap.floorY + 0.05, entity.pos.z);
                drawDisc.scale.setScalar(WARDEN_TIMING.draw.repelRadius);
                const dm = drawDisc.material as THREE.MeshBasicMaterial;
                dm.color.setHex(polarityHex(snap.polarity));
                dm.opacity = action === 'draw_active' ? 0.3 + 0.35 * pulse : 0.12 + 0.3 * raw;
                drawRange.position.set(entity.pos.x, snap.floorY + 0.06, entity.pos.z);
                // The field's reach contracts toward the Repel radius as the pull runs out.
                const reach = action === 'draw_active'
                    ? WARDEN_TIMING.draw.range - (WARDEN_TIMING.draw.range - WARDEN_TIMING.draw.repelRadius) * raw
                    : WARDEN_TIMING.draw.range;
                drawRange.scale.setScalar(reach);
                const rm = drawRange.material as THREE.MeshBasicMaterial;
                rm.color.setHex(polarityHex(snap.polarity));
                rm.opacity = 0.22 + 0.15 * pulse;
            }
        }
        const plungeDisc = plungeDiscRef.current;
        if (plungeDisc) {
            const showPlunge = !!snap.plungeTarget && (action === 'plunge_windup' || action === 'plunge_drop');
            plungeDisc.visible = showPlunge;
            if (showPlunge && snap.plungeTarget) {
                plungeDisc.position.set(snap.plungeTarget.x, snap.floorY + 0.05, snap.plungeTarget.z);
                plungeDisc.scale.setScalar(WARDEN_TIMING.plunge.impactRadius);
                const pm = plungeDisc.material as THREE.MeshBasicMaterial;
                pm.color.setHex(polarityHex(snap.polarity));
                const flash = 0.5 + 0.5 * Math.sin(t * (8 + 30 * raw));
                pm.opacity = action === 'plunge_drop' ? 0.85 : 0.2 + 0.5 * raw * flash;
            }
        }
        const beatRing = beatRingRef.current, beatRing2 = beatRing2Ref.current;
        if (beatRing && beatRing2) {
            const showBeat = snap.form === 3 && action !== 'storm_rise' && snap.beatRemaining <= BEAT_LEAD;
            beatRing.visible = showBeat;
            if (showBeat) {
                const k = snap.beatRemaining / BEAT_LEAD;
                beatRing.position.set(entity.pos.x, snap.floorY + 0.06, entity.pos.z);
                beatRing.scale.setScalar(2 + 4.5 * k);
                const bm = beatRing.material as THREE.MeshBasicMaterial;
                bm.color.setHex(polarityHex(snap.nextPolarity));
                bm.opacity = 0.3 + 0.6 * (1 - k);
            }
            const showSecond = snap.form === 3 && snap.doublePending;
            beatRing2.visible = showSecond;
            if (showSecond) {
                const k = snap.doubleRemaining / WARDEN_TIMING.form3.doubleGap;
                beatRing2.position.set(entity.pos.x, snap.floorY + 0.07, entity.pos.z);
                beatRing2.scale.setScalar(2 + 4.5 * k);
                const bm = beatRing2.material as THREE.MeshBasicMaterial;
                bm.color.setHex(polarityHex(snap.nextPolarity));
                bm.opacity = 0.35 + 0.6 * (1 - k);
            }
        }

        // --- Shield shimmer (a live tether or a form change) and the field aura.
        const shield = shieldRef.current;
        if (shield) {
            shield.visible = snap.shielded;
            if (shield.visible) {
                shield.position.set(entity.pos.x, entity.pos.y + entity.height * 0.5, entity.pos.z);
                shield.rotation.y += 0.02;
                shield.scale.setScalar(Math.max(entity.width, entity.height) * 0.62 + 0.25);
                (shield.material as THREE.MeshBasicMaterial).opacity = now < entity.shieldHitUntil ? 0.85 : 0.28;
            }
        }
        const aura = auraRef.current;
        if (aura) {
            const showAura = !!entity.field && (snap.form !== 2);
            aura.visible = showAura;
            if (showAura) {
                if (lastPolarity.current !== 0 && lastPolarity.current !== snap.polarity) auraFlashUntil.current = now + 420;
                lastPolarity.current = snap.polarity;
                aura.position.set(entity.pos.x, snap.floorY + 0.06, entity.pos.z);
                aura.rotation.z += 0.01;
                const flash = Math.max(0, auraFlashUntil.current - now) / 420;
                const base = snap.drawActive ? 3.4 : entity.width * 1.5;
                aura.scale.setScalar(base * (1 + 0.06 * Math.sin(t * 5) + flash * 0.7));
                const am = aura.material as THREE.MeshBasicMaterial;
                am.color.setHex(polarityHex(snap.polarity));
                am.opacity = 0.2 + flash * 0.4;
            }
        }

        // --- The tether: crystal to core while it holds, whipping away when it snaps.
        const tether = tetherRef.current;
        if (tether) {
            const cx = entity.pos.x, cy = entity.pos.y + entity.height * 0.5, cz = entity.pos.z;
            if (snap.tether) {
                const c = snap.tether;
                tetherLast.current = { x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 };
                tetherFadeUntil.current = 0;
                const life = c.remaining / Math.max(0.001, c.total);
                drawBeam(tether, c.x + 0.5, c.y + 0.5, c.z + 0.5, cx, cy, cz, 0.55 + 0.85 * life, 0.4 + 0.3 * Math.sin(t * 9) * life + 0.2 * (1 - life) * (Math.sin(t * 30) > 0 ? 1 : 0));
                (tether.material as THREE.MeshBasicMaterial).color.setHex(CHARGED);
            } else if (tetherLast.current) {
                if (tetherFadeUntil.current === 0) tetherFadeUntil.current = now + 320;
                const left = tetherFadeUntil.current - now;
                if (left > 0) {
                    const c = tetherLast.current;
                    drawBeam(tether, c.x, c.y, c.z, cx, cy, cz, 0.4, 0.7 * (left / 320));
                } else {
                    tether.visible = false;
                    tetherLast.current = null;
                }
            } else {
                tether.visible = false;
            }
        }
    });

    return (
        <>
            <group ref={rootRef} visible={false}>
                {/* Form I body */}
                <group ref={bodyRef}>
                    <mesh position={[0, 1.55, 0]} material={materials.plate} castShadow><boxGeometry args={[1.5, 1.5, 1.0]} /></mesh>
                    <mesh position={[0, 0.78, 0]} material={materials.dark} castShadow><boxGeometry args={[1.2, 0.35, 0.8]} /></mesh>
                    <mesh position={[-0.42, 0.42, 0]} material={materials.dark} castShadow><boxGeometry args={[0.5, 0.85, 0.5]} /></mesh>
                    <mesh position={[0.42, 0.42, 0]} material={materials.dark} castShadow><boxGeometry args={[0.5, 0.85, 0.5]} /></mesh>
                    <mesh position={[0, 2.6, 0]} material={materials.chiseled} castShadow><boxGeometry args={[0.8, 0.7, 0.8]} /></mesh>
                    <mesh position={[0, 2.62, 0.41]} material={materials.eye}><boxGeometry args={[0.5, 0.1, 0.04]} /></mesh>
                    <mesh position={[0, 3.0, 0]} material={materials.chiseled} castShadow><boxGeometry args={[0.3, 0.35, 0.3]} /></mesh>
                    <group ref={leftArmRef} position={[-1.05, 2.15, 0]}>
                        <mesh position={[0, -0.65, 0]} material={materials.plate} castShadow><boxGeometry args={[0.45, 1.3, 0.45]} /></mesh>
                        <mesh position={[0, -1.35, 0]} material={materials.chiseled} castShadow><boxGeometry args={[0.55, 0.3, 0.55]} /></mesh>
                    </group>
                    <group ref={rightArmRef} position={[1.05, 2.15, 0]}>
                        <mesh position={[0, -0.65, 0]} material={materials.plate} castShadow><boxGeometry args={[0.45, 1.3, 0.45]} /></mesh>
                        <mesh position={[0, -1.35, 0]} material={materials.chiseled} castShadow><boxGeometry args={[0.55, 0.3, 0.55]} /></mesh>
                    </group>
                </group>
                {/* Halo shards (Form I) */}
                <group ref={haloRef} position={[0, 2.35, 0]}>
                    {[0, 1, 2, 3].map((index) => (
                        <mesh key={`halo-${index}`} ref={(m) => { haloShardRefs.current[index] = m; }} material={materials.shard} castShadow>
                            <boxGeometry args={[0.3, 0.7, 0.3]} />
                        </mesh>
                    ))}
                </group>
                {/* The core */}
                <group ref={coreRef} position={[0, 1.6, 0.55]}>
                    <mesh material={materials.dark}><boxGeometry args={[1, 1, 1]} /></mesh>
                    <mesh ref={coreInnerRef} material={materials.core}><boxGeometry args={[0.62, 0.62, 0.62]} /></mesh>
                    <pointLight ref={coreLightRef} color={POLARITY_RED} intensity={0} distance={11} decay={1.6} />
                </group>
                {/* Form II wings */}
                <group ref={wingsRef} visible={false}>
                    <mesh ref={leftWingRef} position={[-0.95, 0, 0]} material={materials.plate} castShadow><boxGeometry args={[1.5, 0.22, 0.7]} /></mesh>
                    <mesh ref={rightWingRef} position={[0.95, 0, 0]} material={materials.plate} castShadow><boxGeometry args={[1.5, 0.22, 0.7]} /></mesh>
                </group>
            </group>
            {/* Form III shard barrier (world space, where the hit test samples them) */}
            {[0, 1, 2, 3].map((index) => (
                <mesh key={`storm-shard-${index}`} ref={(m) => { stormShardRefs.current[index] = m; }} material={materials.shard} visible={false} castShadow>
                    <boxGeometry args={[0.45, 0.9, 0.45]} />
                </mesh>
            ))}
            <mesh ref={groundGlowRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                <circleGeometry args={[1, 40]} />
                <meshBasicMaterial color={POLARITY_RED} transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            {/* Ground telegraphs */}
            <mesh ref={sectorRef} visible={false} renderOrder={3}>
                <ringGeometry args={[0, 1, 48, 1, -Math.PI / 2 - WARDEN_TIMING.lash.halfAngle, WARDEN_TIMING.lash.halfAngle * 2]} />
                <meshBasicMaterial color={POLARITY_RED} transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh ref={drawDiscRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={3}>
                <circleGeometry args={[1, 48]} />
                <meshBasicMaterial color={POLARITY_RED} transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh ref={drawRangeRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={3}>
                <ringGeometry args={[0.965, 1, 72]} />
                <meshBasicMaterial color={POLARITY_RED} transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh ref={plungeDiscRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={3}>
                <circleGeometry args={[1, 40]} />
                <meshBasicMaterial color={POLARITY_RED} transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh ref={beatRingRef} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={3}>
                <ringGeometry args={[0.9, 1, 64]} />
                <meshBasicMaterial color={POLARITY_RED} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh ref={beatRing2Ref} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={3}>
                <ringGeometry args={[0.9, 1, 64]} />
                <meshBasicMaterial color={POLARITY_RED} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            {/* Shield shimmer, field aura, tether */}
            <mesh ref={shieldRef} visible={false}>
                <sphereGeometry args={[1, 16, 12]} />
                <meshBasicMaterial color={SHIELD} wireframe transparent opacity={0.3} />
            </mesh>
            <mesh ref={auraRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                <ringGeometry args={[0.82, 1, 40]} />
                <meshBasicMaterial color={POLARITY_RED} transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh ref={tetherRef} visible={false}>
                <cylinderGeometry args={[0.32, 0.32, 1, 10, 1, true]} />
                <meshBasicMaterial color={CHARGED} transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
        </>
    );
};
