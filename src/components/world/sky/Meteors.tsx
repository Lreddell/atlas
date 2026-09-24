import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SKY_FAR_PLANE_GLSL, SKY_ORDER, skyFrame } from '../../../systems/graphics/skyObjects';

// Meteors (shooting stars) across the night sky.
//
// Each is a streak along a great circle of the sky: a white-hot head that
// catches the bloom and a tapered tail tinted by what burns, facing the camera
// wherever it runs (a flat plane could turn edge-on and vanish). It flares
// once more just before it burns out. About one in ten is a fireball: slower,
// longer, brighter, green or orange. A small pool runs them with no React
// renders. They show on dark nights, redden under a blood moon, add light,
// and sit at the far plane: in front of the stars and aurora, behind clouds.

const POOL = 4;
const RADIUS = 420;
/** Meteors a second at full dark (before the pool is full). */
const RATE = 0.1;

const COLORS = ['#f4f7ff', '#dfe8ff', '#d6ffe4', '#fff1c9', '#e6d8ff'];
const FIREBALL_COLORS = ['#9dffb6', '#ffb36b'];
const BLOOD_COLORS = ['#ff6b6b', '#ff4d4d', '#c62828', '#ff8a80', '#b71c1c'];

const VERTEX = /* glsl */`
uniform vec3 uStart;
uniform vec3 uAxis;
uniform vec2 uAngles;   // tail, head (radians along the great circle)
uniform float uWidth;
varying float vAlong;
varying float vSide;
void main() {
    float along = position.x;
    float angle = mix( uAngles.x, uAngles.y, along );
    vec3 dir = uStart * cos( angle ) + cross( uAxis, uStart ) * sin( angle );
    // Across the travel and across the view ray (the camera is at the origin).
    vec3 across = normalize( cross( cross( uAxis, dir ), dir ) );
    vec3 p = dir * ${RADIUS.toFixed(1)} + across * position.y * uWidth * mix( 0.15, 1.0, along );
    vAlong = along;
    vSide = position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
    ${SKY_FAR_PLANE_GLSL}
}
`;

const FRAGMENT = /* glsl */`
uniform vec3 uColor;
uniform float uBrightness;
varying float vAlong;
varying float vSide;
void main() {
    float across = 1.0 - vSide * vSide;
    float tail = pow( vAlong, 2.2 );
    float head = smoothstep( 0.88, 1.0, vAlong );
    vec3 color = mix( uColor, vec3( 1.0, 0.98, 0.95 ), head ) * ( tail * across * ( 1.0 + 2.5 * head ) );
    gl_FragColor = vec4( color * uBrightness, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

interface Meteor {
    active: boolean;
    age: number;
    life: number;
    /** Radians it travels, and its tail's length (radians). */
    arc: number;
    trail: number;
    brightness: number;
    material: THREE.ShaderMaterial;
    mesh: THREE.Mesh | null;
}

/** A strip from tail (x = 0) to head (x = 1), y = -1..1 across. */
function streakGeometry(): THREE.BufferGeometry {
    const segments = 16;
    const positions = new Float32Array((segments + 1) * 2 * 3);
    const indices: number[] = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        positions.set([t, -1, 0, t, 1, 0], i * 6);
        if (i < segments) {
            const a = i * 2;
            indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return geometry;
}

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const _up = new THREE.Vector3(0, 1, 0);

function launch(meteor: Meteor): void {
    const fireball = Math.random() < 0.1;
    const material = meteor.material;
    // Somewhere between 25 and 70 degrees up, any bearing.
    const elevation = THREE.MathUtils.degToRad(25 + Math.random() * 45);
    const bearing = Math.random() * Math.PI * 2;
    const start = material.uniforms.uStart.value as THREE.Vector3;
    start.set(Math.cos(elevation) * Math.cos(bearing), Math.sin(elevation), Math.cos(elevation) * Math.sin(bearing));
    // Heading mostly downward across the sky: tip "straight down" by up to 60 degrees.
    const down = new THREE.Vector3().copy(start).multiplyScalar(start.y).sub(_up).normalize();
    const side = new THREE.Vector3().crossVectors(start, down);
    const tip = (Math.random() - 0.5) * THREE.MathUtils.degToRad(120);
    const travel = down.multiplyScalar(Math.cos(tip)).addScaledVector(side, Math.sin(tip)).normalize();
    (material.uniforms.uAxis.value as THREE.Vector3).crossVectors(start, travel).normalize();

    meteor.active = true;
    meteor.age = 0;
    meteor.life = fireball ? 1.6 + Math.random() * 1.0 : 0.45 + Math.random() * 0.65;
    meteor.arc = THREE.MathUtils.degToRad(fireball ? 18 + Math.random() * 14 : 8 + Math.random() * 16);
    meteor.trail = meteor.arc * (fireball ? 0.55 : 0.4);
    meteor.brightness = fireball ? 3.2 : 1.2 + Math.random() * 1.4;
    material.uniforms.uWidth.value = fireball ? 2.6 : 1.1 + Math.random() * 0.6;
    (material.uniforms.uColor.value as THREE.Color).set(
        skyFrame.bloodMoon ? pick(BLOOD_COLORS) : fireball ? pick(FIREBALL_COLORS) : pick(COLORS),
    );
    if (meteor.mesh) meteor.mesh.visible = true;
}

export const Meteors: React.FC = () => {
    const { camera } = useThree();
    const geometry = useMemo(() => streakGeometry(), []);
    const meteors = useMemo<Meteor[]>(() => Array.from({ length: POOL }, () => ({
        active: false, age: 0, life: 1, arc: 0, trail: 0, brightness: 1, mesh: null,
        material: new THREE.ShaderMaterial({
            uniforms: {
                uStart: { value: new THREE.Vector3(0, 1, 0) },
                uAxis: { value: new THREE.Vector3(1, 0, 0) },
                uAngles: { value: new THREE.Vector2() },
                uWidth: { value: 1 },
                uColor: { value: new THREE.Color() },
                uBrightness: { value: 0 },
            },
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
        }),
    })), []);
    const groupRef = useRef<THREE.Group>(null);

    // The /shootingstar command asks for one straight away.
    useEffect(() => {
        const onSpawn = () => {
            if (skyFrame.paused) return;
            const free = meteors.find(m => !m.active);
            if (free) launch(free);
        };
        window.addEventListener('atlas:shootingstar:spawn', onSpawn);
        return () => window.removeEventListener('atlas:shootingstar:spawn', onSpawn);
    }, [meteors]);

    useFrame((_, delta) => {
        const group = groupRef.current;
        if (!group) return;
        group.position.copy(camera.position);
        if (skyFrame.paused) return;
        const dt = Math.min(delta, 0.1);
        const dark = THREE.MathUtils.smoothstep(skyFrame.night, 0.6, 0.95) * (1 - skyFrame.medium);
        // Frame-rate independent: a chance per second, not per frame.
        if (dark > 0 && Math.random() < RATE * dark * dt) {
            const free = meteors.find(m => !m.active);
            if (free) launch(free);
        }
        for (const meteor of meteors) {
            if (!meteor.active) continue;
            meteor.age += dt;
            const t = meteor.age / meteor.life;
            if (t >= 1) {
                meteor.active = false;
                if (meteor.mesh) meteor.mesh.visible = false;
                continue;
            }
            // Fast at first, slowing as it burns; the tail stretches out behind the head.
            const head = meteor.arc * (1 - Math.pow(1 - t, 1.6));
            const tail = Math.max(0, head - meteor.trail * Math.min(1, t * 3));
            meteor.material.uniforms.uAngles.value.set(tail, head);
            // In quickly, a last flare near the end, then out.
            const flare = 1 + 0.8 * Math.exp(-Math.pow((t - 0.82) / 0.06, 2));
            const fade = Math.min(1, t * 8) * (1 - THREE.MathUtils.smoothstep(t, 0.86, 1));
            meteor.material.uniforms.uBrightness.value = meteor.brightness * flare * fade * Math.max(dark, 0.35);
        }
    });

    return (
        <group ref={groupRef}>
            {meteors.map((meteor, index) => (
                <mesh
                    key={index}
                    ref={(mesh) => { meteor.mesh = mesh; }}
                    geometry={geometry}
                    material={meteor.material}
                    renderOrder={SKY_ORDER.meteors}
                    frustumCulled={false}
                    visible={false}
                />
            ))}
        </group>
    );
};
