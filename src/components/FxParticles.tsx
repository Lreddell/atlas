import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { particleFx, type FxBurst } from '../systems/fx/particleFx';
import { getBiome } from '../systems/world/biomes';
import { MAGNETIC_FIELDS_BIOME_ID } from '../systems/world/magneticFields';
import { bossPhaseState } from '../systems/boss/bossPhaseState';

// Renders the glowing additive "effect" particles fired through `particleFx`
// (combat sparks, slam rings, the summon cutscene) PLUS a steady drift of gray
// and purple ambient motes while the player stands in the Magnetic Fields biome
// — the nether-style "this place is charged" atmosphere.

const MAX_FX = 2600;

interface FxParticle {
    px: number; py: number; pz: number;
    vx: number; vy: number; vz: number;
    life: number; maxLife: number;
    size: number;
    r: number; g: number; b: number;
    gravity: number; drag: number;
    // Optional vortex: during the boss frenzy, ambient motes orbit a fixed
    // column center (cx,cz) at `swirl` rad/s while rising, forming a spiraling
    // updraft. Left undefined for normal free-drifting particles.
    swirl?: number; cx?: number; cz?: number;
}

// A soft round sprite (radial falloff) so each point reads as a glowing mote.
function makeSpriteTexture(): THREE.Texture {
    const s = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const ctx = cv.getContext('2d')!;
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.65)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    return tex;
}

const AMBIENT_GRAY: [number, number, number] = [0.5, 0.5, 0.56];
const AMBIENT_PURPLE: [number, number, number] = [0.6, 0.38, 0.85];

export const FxParticles: React.FC<{ isPaused: boolean }> = ({ isPaused }) => {
    const { camera } = useThree();
    const pointsRef = useRef<THREE.Points>(null);
    const pool = useRef<FxParticle[]>([]);
    const ambientTimer = useRef(0);

    const sprite = useMemo(makeSpriteTexture, []);

    const geometry = useMemo(() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_FX * 3), 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX_FX * 3), 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_FX), 1).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(MAX_FX), 1).setUsage(THREE.DynamicDrawUsage));
        g.setDrawRange(0, 0);
        return g;
    }, []);

    const material = useMemo(() => new THREE.ShaderMaterial({
        uniforms: { uTex: { value: sprite } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
            attribute vec3 aColor;
            attribute float aSize;
            attribute float aAlpha;
            varying vec3 vColor;
            varying float vAlpha;
            void main() {
                vColor = aColor;
                vAlpha = aAlpha;
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = aSize * (320.0 / -mv.z);
                gl_Position = projectionMatrix * mv;
            }
        `,
        fragmentShader: `
            uniform sampler2D uTex;
            varying vec3 vColor;
            varying float vAlpha;
            void main() {
                float a = texture2D(uTex, gl_PointCoord).a;
                if (a < 0.01) discard;
                gl_FragColor = vec4(vColor * (0.6 + vAlpha), a * vAlpha);
            }
        `,
    }), [sprite]);

    useEffect(() => {
        const spawn = (b: FxBurst) => {
            const arr = pool.current;
            for (let i = 0; i < b.count && arr.length < MAX_FX; i++) {
                // Random direction, blended from the bias dir toward a full sphere.
                let dx = (Math.random() - 0.5) * 2;
                let dy = (Math.random() - 0.5) * 2;
                let dz = (Math.random() - 0.5) * 2;
                const dl = Math.hypot(dx, dy, dz) || 1;
                dx /= dl; dy /= dl; dz /= dl;
                if (b.dir) {
                    const [bx, by, bz] = b.dir;
                    const bl = Math.hypot(bx, by, bz) || 1;
                    const s = b.spread;
                    dx = (bx / bl) * (1 - s) + dx * s;
                    dy = (by / bl) * (1 - s) + dy * s;
                    dz = (bz / bl) * (1 - s) + dz * s;
                }
                const sp = b.speed * (0.5 + Math.random() * 0.7);
                const t = b.color2 ? Math.random() : 0;
                const c2 = b.color2 ?? b.color;
                arr.push({
                    px: b.x, py: b.y, pz: b.z,
                    vx: dx * sp, vy: dy * sp + b.upBias * Math.random(), vz: dz * sp,
                    life: b.life * (0.75 + Math.random() * 0.5),
                    maxLife: b.life,
                    size: b.size * (0.6 + Math.random() * 0.8),
                    r: b.color[0] * (1 - t) + c2[0] * t,
                    g: b.color[1] * (1 - t) + c2[1] * t,
                    b: b.color[2] * (1 - t) + c2[2] * t,
                    gravity: b.gravity, drag: b.drag,
                });
            }
        };
        return particleFx.subscribe(spawn);
    }, []);

    useFrame((_, delta) => {
        if (isPaused || !pointsRef.current) return;
        const dt = Math.min(delta, 0.05);
        const arr = pool.current;

        // Ambient motes while standing in the Magnetic Fields biome — they whip up
        // into a denser, faster, more purple "polarity storm" per boss phase.
        ambientTimer.current -= dt;
        if (ambientTimer.current <= 0) {
            const storm = bossPhaseState.intensity;
            const frenzy = bossPhaseState.isFrenzy;
            ambientTimer.current = 0.08 - 0.055 * storm; // spawn faster during the storm
            const biome = getBiome(camera.position.x, camera.position.z) as { id?: string } | undefined;
            if (biome?.id === MAGNETIC_FIELDS_BIOME_ID && arr.length < MAX_FX - 16) {
                const count = 4 + Math.round((frenzy ? 12 : 8) * storm);
                const cx = camera.position.x, cz = camera.position.z;
                for (let i = 0; i < count; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const purple = Math.random() < 0.5 + 0.4 * storm; // more purple in the storm
                    const col = purple ? AMBIENT_PURPLE : AMBIENT_GRAY;
                    if (frenzy) {
                        // Frenzy: motes draw into a tight, fast-spinning column that
                        // spirals straight up — and rise noticeably faster than the
                        // earlier drift.
                        const rad = 2.5 + Math.random() * 9;
                        arr.push({
                            px: cx + Math.cos(ang) * rad,
                            py: camera.position.y - 6 + Math.random() * 16,
                            pz: cz + Math.sin(ang) * rad,
                            vx: 0, vy: (0.9 + Math.random() * 1.1) * 2.2, vz: 0,
                            life: 2.5 + Math.random() * 3,
                            maxLife: 5.5,
                            size: (0.09 + Math.random() * 0.09) * 1.6,
                            r: col[0], g: col[1], b: col[2],
                            gravity: -0.7, drag: 0.04,
                            swirl: 2.0 + Math.random() * 1.6, cx, cz,
                        });
                    } else {
                        const rad = 4 + Math.random() * 18;
                        arr.push({
                            px: cx + Math.cos(ang) * rad,
                            py: camera.position.y - 3 + Math.random() * 12,
                            pz: cz + Math.sin(ang) * rad,
                            vx: (Math.random() - 0.5) * (0.3 + storm * 1.5),
                            vy: (0.25 + Math.random() * 0.5) * (1 + storm),
                            vz: (Math.random() - 0.5) * (0.3 + storm * 1.5),
                            life: 2.5 + Math.random() * 3,
                            maxLife: 5.5,
                            size: (0.07 + Math.random() * 0.08) * (1 + 0.5 * storm),
                            r: col[0], g: col[1], b: col[2],
                            gravity: -0.4, drag: 0.2,
                        });
                    }
                }
            }
        }

        const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
        const colAttr = pointsRef.current.geometry.attributes.aColor as THREE.BufferAttribute;
        const sizeAttr = pointsRef.current.geometry.attributes.aSize as THREE.BufferAttribute;
        const alphaAttr = pointsRef.current.geometry.attributes.aAlpha as THREE.BufferAttribute;
        const posA = posAttr.array as Float32Array;
        const colA = colAttr.array as Float32Array;
        const sizeA = sizeAttr.array as Float32Array;
        const alphaA = alphaAttr.array as Float32Array;

        let n = 0;
        for (let i = arr.length - 1; i >= 0; i--) {
            const p = arr[i];
            p.life -= dt;
            if (p.life <= 0) { arr.splice(i, 1); continue; }
            const damp = Math.max(0, 1 - p.drag * dt);
            p.vx *= damp; p.vz *= damp;
            p.vy = (p.vy - p.gravity * dt) * damp;
            p.px += p.vx * dt; p.py += p.vy * dt; p.pz += p.vz * dt;
            // Vortex motes rotate their horizontal position around the column
            // center each frame, so the upward velocity traces a rising spiral.
            if (p.swirl) {
                const ox = p.px - p.cx!, oz = p.pz - p.cz!;
                const a = p.swirl * dt;
                const c = Math.cos(a), s = Math.sin(a);
                p.px = p.cx! + ox * c - oz * s;
                p.pz = p.cz! + ox * s + oz * c;
            }

            if (n < MAX_FX) {
                const o3 = n * 3;
                posA[o3] = p.px; posA[o3 + 1] = p.py; posA[o3 + 2] = p.pz;
                colA[o3] = p.r; colA[o3 + 1] = p.g; colA[o3 + 2] = p.b;
                sizeA[n] = p.size;
                // Fade in fast, out slow over the back half of its life.
                alphaA[n] = Math.min(1, (p.life / p.maxLife) * 1.6);
                n++;
            }
        }

        pointsRef.current.geometry.setDrawRange(0, n);
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;
        alphaAttr.needsUpdate = true;
    });

    return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />;
};
