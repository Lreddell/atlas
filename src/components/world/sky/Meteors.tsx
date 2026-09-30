import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SKY_FAR_PLANE_GLSL, SKY_ORDER, skyFrame } from '../../../systems/graphics/skyObjects';
import { CLOUD_GLSL, CLOUD_UNIFORMS } from '../../../systems/graphics/cloudLayer';

// Meteors (shooting stars) across the night sky.
//
// As the original shooting stars were: long streaks gliding a good way across
// the sky over a couple of seconds, mostly sideways and a little downward, in
// cyan, pale cyan, thistle, aquamarine or lemon, and red under a blood moon.
// Drawn in the new style: each follows a great circle of the sky with a
// white-hot head that catches the bloom and a tapered tail in its colour,
// facing the camera wherever it runs (a flat plane could turn edge-on and
// vanish). It flares once more, its head burns out, and its glowing train
// lingers a moment, shrinking toward where the head vanished as it fades. Now
// and then one is a fireball: slower, longer and brighter. A small pool runs
// them with no React renders. They show once the sky is dark, add light, and
// sit at the far plane: in front of the stars and aurora, hidden by clouds.

const POOL = 5;
const RADIUS = 420;
/** Meteors a second in a fully dark sky (before the pool is full). */
const RATE = 0.15;
/** Seconds the train lingers after the head burns out. */
const AFTERGLOW = 0.7;

// The original shooting stars' colours.
const COLORS = ['#00ffff', '#e0ffff', '#d8bfd8', '#7fffd4', '#fffacd'];
const BLOOD_COLORS = ['#ff6b6b', '#ff4d4d', '#c62828', '#ff8a80', '#b71c1c'];

const VERTEX = /* glsl */`
uniform vec3 uStart;
uniform vec3 uAxis;
uniform vec2 uAngles;   // tail, head (radians along the great circle)
uniform float uWidth;
varying float vAlong;
varying float vSide;
varying float vClear;
${CLOUD_GLSL}
void main() {
    float along = position.x;
    float angle = mix( uAngles.x, uAngles.y, along );
    vec3 dir = uStart * cos( angle ) + cross( uAxis, uStart ) * sin( angle );
    // Across the travel and across the view ray (the camera is at the origin).
    vec3 across = normalize( cross( cross( uAxis, dir ), dir ) );
    vec3 p = dir * ${RADIUS.toFixed(1)} + across * position.y * uWidth * mix( 0.15, 1.0, along );
    vAlong = along;
    vSide = position.y;
    // Behind a cloud it is lost, like the stars.
    vClear = 1.0 - atlasCloudCoverAlong( dir );
    gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
    ${SKY_FAR_PLANE_GLSL}
}
`;

const FRAGMENT = /* glsl */`
uniform vec3 uColor;
uniform float uBrightness;
uniform float uHead;    // how bright the head still burns (0 once it has burnt out)
varying float vAlong;
varying float vSide;
varying float vClear;
void main() {
    float across = 1.0 - vSide * vSide;
    float tail = pow( vAlong, 2.6 );
    float head = smoothstep( 0.88, 1.0, vAlong ) * uHead;
    vec3 color = mix( uColor, vec3( 1.0, 0.98, 0.95 ), head ) * ( tail * across * ( 1.0 + 2.5 * head ) );
    gl_FragColor = vec4( color * ( uBrightness * vClear ), 1.0 );
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
    const fireball = Math.random() < 1 / 12;
    const material = meteor.material;
    // Somewhere between 20 and 75 degrees up, any bearing.
    const elevation = THREE.MathUtils.degToRad(20 + Math.random() * 55);
    const bearing = Math.random() * Math.PI * 2;
    const start = material.uniforms.uStart.value as THREE.Vector3;
    start.set(Math.cos(elevation) * Math.cos(bearing), Math.sin(elevation), Math.cos(elevation) * Math.sin(bearing));
    // Across the sky and a little down, as the originals ran: tipped from
    // "straight down" by 35 to 80 degrees, to either side.
    const down = new THREE.Vector3().copy(start).multiplyScalar(start.y).sub(_up).normalize();
    const side = new THREE.Vector3().crossVectors(start, down);
    const tip = THREE.MathUtils.degToRad(35 + Math.random() * 45) * (Math.random() < 0.5 ? -1 : 1);
    const travel = down.multiplyScalar(Math.cos(tip)).addScaledVector(side, Math.sin(tip)).normalize();
    (material.uniforms.uAxis.value as THREE.Vector3).crossVectors(start, travel).normalize();

    meteor.active = true;
    meteor.age = 0;
    // A long glide over a couple of seconds, its tail about ten degrees of sky.
    meteor.life = fireball ? 3 + Math.random() * 1.4 : 1.3 + Math.random() * 1.5;
    meteor.arc = THREE.MathUtils.degToRad(fireball ? 38 + Math.random() * 16 : 24 + Math.random() * 18);
    meteor.trail = THREE.MathUtils.degToRad(fireball ? 16 + Math.random() * 6 : 9 + Math.random() * 4);
    meteor.brightness = fireball ? 3.2 : 1.2 + Math.random() * 1.2;
    material.uniforms.uWidth.value = fireball ? 2.4 : 1.1 + Math.random() * 0.5;
    (material.uniforms.uColor.value as THREE.Color).set(skyFrame.bloodMoon ? pick(BLOOD_COLORS) : pick(COLORS));
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
                uHead: { value: 1 },
                ...CLOUD_UNIFORMS,
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
        const dark = THREE.MathUtils.smoothstep(skyFrame.night, 0.3, 0.8) * (1 - skyFrame.medium);
        // Frame-rate independent: a chance per second, not per frame.
        if (dark > 0 && Math.random() < RATE * dark * dt) {
            const free = meteors.find(m => !m.active);
            if (free) launch(free);
        }
        for (const meteor of meteors) {
            if (!meteor.active) continue;
            meteor.age += dt;
            // How far it has burnt (0..1), then how far its train has faded (0..1).
            const t = Math.min(1, meteor.age / meteor.life);
            const after = Math.max(0, (meteor.age - meteor.life) / AFTERGLOW);
            if (after >= 1) {
                meteor.active = false;
                if (meteor.mesh) meteor.mesh.visible = false;
                continue;
            }
            // A steady glide that eases a little as it burns; the tail stretches
            // out behind the head to its full length, and once the head has
            // burnt out the train shrinks back toward where it vanished.
            const head = meteor.arc * (1 - Math.pow(1 - t, 1.3));
            let tail = Math.max(0, head - meteor.trail * Math.min(1, t * 4));
            tail += (head - tail) * 0.45 * THREE.MathUtils.smoothstep(after, 0, 1);
            const uniforms = meteor.material.uniforms;
            uniforms.uAngles.value.set(tail, head);
            // In quickly, a last flare, the head burning out, then the train
            // fading away.
            const flare = 1 + 0.6 * Math.exp(-Math.pow((t - 0.72) / 0.07, 2));
            const burnOut = 1 - THREE.MathUtils.smoothstep(t, 0.74, 1);
            uniforms.uHead.value = burnOut;
            const train = (1 - after) * (1 - after);
            uniforms.uBrightness.value = meteor.brightness * Math.min(1, t * 10) * flare * (0.55 + 0.45 * burnOut) * train * Math.max(dark, 0.35);
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
