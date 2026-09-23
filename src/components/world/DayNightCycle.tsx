
import { useRef, useState, useMemo, useImperativeHandle, forwardRef, useEffect, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHUNK_SIZE } from '../../constants';
import { updateChunkMaterials } from '../chunkLightingState';
import { updateCloudColor } from './cloudState';
import { worldManager } from '../../systems/WorldManager';
import { getBiome } from '../../systems/world/biomes';
import { MAGNETIC_FIELDS_BIOME_ID } from '../../systems/world/magneticFields';
import { bossSummon } from '../../systems/boss/bossSummon';
import { bossPhaseState } from '../../systems/boss/bossPhaseState';
import { getLunarNightEventState, getMoonCycleIndex } from '../../systems/world/celestialEvents';
import { SHADOW_QUALITY_SETTINGS, type ShadowQuality } from '../../systems/graphics/graphicsSettings';
import { createAtmosphereState, sampleAtmosphere, SUN_ORBIT_TILT } from '../../systems/graphics/atmosphere';
import { ATMOSPHERE_GLSL, ATMOSPHERE_UNIFORMS, applyAtmosphereUniforms, applyMediumUniforms } from '../../systems/graphics/atmosphereUniforms';
import { BlockType } from '../../types';
import { createPixelMoonTexture, createPixelSunTexture } from '../../systems/graphics/celestialSprites';
import { updateVoxelLighting } from '../../systems/graphics/materials/voxelMaterial';
import { packDynamicLights } from '../../systems/graphics/dynamicLights';
import { snapShadowCenter } from '../../systems/graphics/shadows';
import { TONE_MAPPING_EXPOSURE_TRIM } from '../../systems/graphics/pipeline/pipelinePlan';

// The sky, the sun and moon, the stars, and the scene's two lights, all driven
// by one sampled atmosphere (systems/graphics/atmosphere.ts) per frame.
//
// Everything here writes SCENE-LINEAR colour and ends in three's tone-mapping
// and colour-space chunks, exactly like lit materials. The fog of every
// material is the same atlasSkyRadiance the dome paints, so distant terrain
// dissolves into the sky behind it with no seam.

// Sky dome: the shared sky function, plus a faint galaxy band that turns with the stars.
const SKY_VERTEX = /* glsl */`
    varying vec3 vDir;
    void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const SKY_FRAGMENT = /* glsl */`
    ${ATMOSPHERE_GLSL}
    uniform mat3 uStarRotation;
    uniform float uStarVisibility;
    varying vec3 vDir;

    float hash31(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    // Smooth value noise, so the galaxy band is soft cloud rather than tiles.
    float valueNoise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
            mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y),
            f.z);
    }

    void main() {
        vec3 dir = normalize(vDir);
        vec3 color = atlasSkyRadiance(dir);
        if (uStarVisibility > 0.001 && dir.y > -0.1) {
            // A faint milky band around a tilted great circle, turning with the stars.
            vec3 local = uStarRotation * dir;
            float band = exp(-pow(dot(local, normalize(vec3(0.35, 0.2, 0.92))) / 0.16, 2.0));
            float cloud = valueNoise(local * 7.0) * 0.65 + valueNoise(local * 19.0) * 0.35;
            float horizonFade = smoothstep(-0.05, 0.3, dir.y);
            color += vec3(0.03, 0.034, 0.055) * band * smoothstep(0.25, 0.85, cloud) * uStarVisibility * horizonFade;
        }
        // Seen from inside water or lava, the sky is lost in that fluid's fog.
        color = mix(color, atlasMediumColor, atlasMediumParams.x);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }
`;

// Stars: seeded points that twinkle, in scene-linear HDR.
const StarShader = {
    vertexShader: /* glsl */`
        attribute float phase;
        attribute float speed;
        attribute float magnitude;
        varying float vAlpha;
        uniform float uTime;
        void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = max(1.5, (420.0 + magnitude * 360.0) / -mvPosition.z);
            float twinkle = speed > 0.0 ? 0.65 + 0.35 * sin(uTime * speed + phase) : 1.0;
            vAlpha = twinkle * (0.35 + 0.65 * magnitude);
        }
    `,
    fragmentShader: /* glsl */`
        varying float vAlpha;
        uniform float uOpacity;
        void main() {
            vec2 coord = gl_PointCoord - vec2(0.5);
            if (length(coord) > 0.5) discard;
            gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * 1.6 * vAlpha * uOpacity, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }
    `,
};

// Aurora curtain shaders – curves PlaneGeometry ribbons into sky-spanning arcs
const AuroraCurtainVertexShader = `
    uniform float uTime;
    uniform float uRadius;
    uniform float uArcLength;
    uniform float uRotation;
    uniform float uPhase;
    uniform float uTilt;      // tilt angle in radians (0 = vertical curtain, >0 = leans overhead)
    uniform float uElevation; // base elevation angle above horizon
    varying vec2 vUv;
    varying float vWave;

    void main() {
        vUv = uv;

        // Map uv.x to angle along the arc with slow rotational drift
        float angle = (uv.x - 0.5) * uArcLength + uRotation + uTime * (0.005 + uPhase * 0.0008);

        // Height parameter (0 at bottom, 1 at top of ribbon)
        float hNorm = (position.y / 1.0 + 0.5); // plane goes -0.5 to 0.5 in local Y

        // Base position on arc in XZ plane at uRadius
        float baseX = uRadius * cos(angle);
        float baseZ = uRadius * sin(angle);

        // Elevation: raise the arc above the horizon
        float baseY = uRadius * sin(uElevation);
        float horizScale = cos(uElevation);
        baseX *= horizScale;
        baseZ *= horizScale;

        // Curtain extends upward from base, tilting inward (overhead) via uTilt
        float curtainHeight = position.y; // raw local Y from plane geometry
        // Vertical component
        float vy = curtainHeight * cos(uTilt);
        // Inward component (toward center) for overhead lean
        float inward = curtainHeight * sin(uTilt);
        float dirX = -cos(angle); // direction toward center
        float dirZ = -sin(angle);

        float x = baseX + dirX * inward;
        float z = baseZ + dirZ * inward;
        float y = baseY + vy;

        // Gentle wave motion – subtle undulation, stronger toward top
        float hf = 0.05 + hNorm * 0.35;
        float w1 = sin(angle * 3.0 + uTime * 0.04 + uPhase) * 5.0;
        float w2 = sin(angle * 6.0 - uTime * 0.06 + uPhase * 0.6) * 2.5;
        float wave = (w1 + w2) * hf;
        y += wave;
        vWave = wave;

        // Very slight lateral sway
        float sway = sin(angle * 3.0 + uTime * 0.03 + uPhase) * 1.5 * hf;
        x += -sin(angle) * sway;
        z +=  cos(angle) * sway;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, z, 1.0);
    }
`;

const AuroraCurtainFragmentShader = `
    uniform float uTime;
    uniform float uOpacity;
    uniform float uPhase;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform vec3 uColorC;
    varying vec2 vUv;
    varying float vWave;

    void main() {
        // Vertical mask: thin bright band at base, long soft fade upward
        float bottom = smoothstep(0.0, 0.08, vUv.y);
        float top    = 1.0 - smoothstep(0.15, 0.92, vUv.y);
        float vertMask = bottom * top;

        // Bright narrow core near the base (like real aurora)
        float core = exp(-pow((vUv.y - 0.10) * 8.0, 2.0));

        // Horizontal edge fade (no hard cutoffs at ribbon ends)
        float edgeFade = smoothstep(0.0, 0.06, vUv.x) * (1.0 - smoothstep(0.94, 1.0, vUv.x));

        // Vertical ray streaks – irregular columns via layered frequencies
        float r1 = sin(vUv.x * 47.0 + uPhase * 2.0 + uTime * 0.025);
        float r2 = sin(vUv.x * 23.0 - uPhase * 1.3 + uTime * 0.04);
        float r3 = sin(vUv.x * 73.0 + uPhase * 0.7);
        float rays = 0.35 + 0.65 * clamp(r1 * r2 + r3 * 0.3, 0.0, 1.0);

        // Horizontal intensity variation
        float s1 = 0.6 + 0.4 * sin(vUv.x * 9.0 + uTime * 0.06 + uPhase);
        float hIntensity = s1 * rays;

        // Colours: green base -> cyan mid -> purple/violet top with strong transitions
        vec3 col = mix(uColorA, uColorB, smoothstep(0.04, 0.20, vUv.y));
        col = mix(col, uColorC, smoothstep(0.25, 0.70, vUv.y));

        // Whitish-green brightening at core
        col = mix(col, vec3(0.85, 1.0, 0.90), core * 0.5);

        // Dynamic colour shift along the ribbon length, stronger effect
        float cShift = sin(vUv.x * 5.0 + uTime * 0.035 + uPhase) * 0.5 + 0.5;
        col = mix(col, mix(uColorB, uColorC, cShift), 0.25);

        float alpha = (vertMask + core * 0.6) * hIntensity * edgeFade * uOpacity;
        // Scene-linear and additive: premultiply, then tone map like everything else.
        gl_FragColor = vec4(col * 1.8 * clamp(alpha, 0.0, 1.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }
`;

// Shooting Star Component
const ShootingStar = ({ dayFactor, isPaused, isBloodMoon }: { dayFactor: number, isPaused: boolean, isBloodMoon: boolean }) => {
    const groupRef = useRef<THREE.Group>(null);
    const [active, setActive] = useState(false);
    const progress = useRef(0);
    const speed = useRef(0.3); // Controls animation duration
    const startPos = useRef(new THREE.Vector3());
    const endPos = useRef(new THREE.Vector3());

    // Custom shader for the trail
    const material = useMemo(() => new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color('#d4f1f9') }, uOpacity: { value: 1.0 } },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uOpacity;
            varying vec2 vUv;
            void main() {
                // Horizontal gradient for trail (tail at x=0, head at x=1)
                // pow(vUv.x, 4.0) makes the tail fade out gracefully
                float alpha = pow(vUv.x, 4.0) * uOpacity;
                // Additive with SRC_ALPHA: the blend applies alpha once.
                gl_FragColor = vec4(uColor * 2.0, alpha);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    }), []);

    const spawnStar = useCallback(() => {
        setActive(true);
        progress.current = 0;

        speed.current = 0.15 + Math.random() * 0.25;

        const r = 350;
        const u = 0.3 + Math.random() * 0.7;
        const y = r * u;
        const rXZ = Math.sqrt(r*r - y*y);
        const theta = Math.random() * Math.PI * 2;

        startPos.current.set(
            rXZ * Math.cos(theta),
            y,
            rXZ * Math.sin(theta)
        );

        const moveDist = 200 + Math.random() * 100;

        const moveDir = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            -Math.random() * 0.5,
            (Math.random() - 0.5) * 2
        ).normalize();

        endPos.current.copy(startPos.current).add(moveDir.multiplyScalar(moveDist));

        const colors = isBloodMoon
            ? ['#ff6b6b', '#ff4d4d', '#c62828', '#ff8a80', '#b71c1c']
            : ['#00ffff', '#e0ffff', '#d8bfd8', '#7fffd4', '#fffacd'];
        const col = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
        material.uniforms.uColor.value = col;

        if (groupRef.current) {
            groupRef.current.position.copy(startPos.current);
            groupRef.current.lookAt(endPos.current);
            groupRef.current.visible = true;
        }
    }, [isBloodMoon, material]);

    useEffect(() => {
        const onSpawn = () => {
            if (isPaused) return;
            spawnStar();
        };

        window.addEventListener('atlas:shootingstar:spawn', onSpawn);
        return () => window.removeEventListener('atlas:shootingstar:spawn', onSpawn);
    }, [isPaused, isBloodMoon, spawnStar]);

    useFrame((_, delta) => {
        if (isPaused) return;

        // Only spawn at night (dayFactor < 0.1 implies very dark/night)
        if (!active && dayFactor < 0.1) {
            // Very rare: about once every ~40 seconds, independent of frame rate.
            if (Math.random() < 0.096 * delta) {
                spawnStar();
            }
        }

        if (active && groupRef.current) {
            // Update using the randomized speed
            progress.current += delta * speed.current;

            if (progress.current >= 1) {
                setActive(false);
                groupRef.current.visible = false;
            } else {
                // Lerp position
                groupRef.current.position.lerpVectors(startPos.current, endPos.current, progress.current);

                // Fade In AND Out
                // Fade In over the first 10% of travel
                const fadeIn = Math.min(1.0, progress.current * 10.0);
                // Fade Out over the last 20%
                const fadeOut = 1.0 - Math.pow(progress.current, 5.0);

                material.uniforms.uOpacity.value = fadeIn * fadeOut;
            }
        }
    });

    return (
        // renderOrder -960: Behind Terrain (0), In front of Sun/Moon (-970/-980), In front of Stars (-990)
        <group ref={groupRef} visible={false} renderOrder={-960}>
            {/*
                Rotate -90 deg on Y so the Plane's X-axis (length) aligns with the Group's Z-axis (lookAt direction).
                Plane is 60 units long (X), 1.2 units wide (Y).
            */}
            <mesh rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[60, 1.2]} />
                <primitive object={material} />
            </mesh>
        </group>
    );
};

export interface DayNightCycleRef {
    setTime: (timeTicks: number) => void;
    setPhase: (phaseIndex: number) => void;
}

const COL_WHITE = new THREE.Color(0xffffff);
// Sun and moon discs, scene-linear HDR (they will feed bloom once the post
// pipeline exists; tone mapping keeps them from clipping today).
const SUN_DISC_COLOR = new THREE.Color(3.0, 2.7, 2.2);
const MOON_DISC_COLOR = new THREE.Color(1.25, 1.3, 1.45);
const BLOOD_MOON_DISC_COLOR = new THREE.Color(0.5, 0.03, 0.02);

// The stars turn about the axis the sun's tilted orbit turns about.
const STAR_AXIS = new THREE.Vector3(0, -Math.sin(SUN_ORBIT_TILT), Math.cos(SUN_ORBIT_TILT)).normalize();
const scratchStarQuat = new THREE.Quaternion();
const scratchStarMatrix = new THREE.Matrix4();
const scratchKeyDir = new THREE.Vector3();
const scratchBackground = new THREE.Color();
const scratchMedium: [number, number, number] = [0, 0, 0];
// Under water, the fog is the sky's ambient light filtered through blue-green water.
const WATER_MEDIUM_TINT: readonly number[] = [0.07, 0.3, 0.38];
const LAVA_MEDIUM_COLOR: readonly number[] = [1.5, 0.36, 0.03];
const scratchCameraCenter: [number, number, number] = [0, 0, 0];
const scratchShadowCenter: [number, number, number] = [0, 0, 0];

// Moon-phase color themes (phaseIndex 0-7: 0=new, 4=full)
// [hueA, satA, lightA, hueB, satB, lightB, hueC, satC, lightC]
const AURORA_PHASE_THEMES: [number,number,number,number,number,number,number,number,number][] = [
    [0.36, 0.95, 0.50,  0.46, 0.90, 0.55,  0.52, 0.80, 0.50], // 0: new moon – classic green
    [0.38, 0.90, 0.52,  0.48, 0.85, 0.56,  0.56, 0.75, 0.52], // 1: waxing crescent
    [0.35, 0.85, 0.48,  0.50, 0.80, 0.54,  0.62, 0.78, 0.50], // 2: first quarter – teal shift
    [0.33, 0.88, 0.50,  0.52, 0.82, 0.55,  0.68, 0.80, 0.52], // 3: waxing gibbous
    [0.44, 0.80, 0.52,  0.58, 0.85, 0.56,  0.78, 0.85, 0.55], // 4: full moon – cyan/blue/magenta
    [0.42, 0.82, 0.50,  0.55, 0.80, 0.54,  0.75, 0.82, 0.53], // 5: waning gibbous
    [0.34, 0.90, 0.48,  0.50, 0.78, 0.52,  0.82, 0.80, 0.50], // 6: last quarter – green/purple
    [0.36, 0.92, 0.50,  0.48, 0.80, 0.54,  0.80, 0.78, 0.52], // 7: waning crescent
];
const AURORA_BLOOD_MOON_THEME: [number,number,number,number,number,number,number,number,number] = [
    0.995, 0.92, 0.24,
    0.975, 0.88, 0.36,
    0.94, 0.58, 0.46,
];

/** Deterministic PRNG so the night sky is the same every time a world loads. */
function mulberry32(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const BIOME_SAMPLE_INTERVAL = 0.25; // seconds between biome lookups for haze/aurora

export const DayNightCycle = forwardRef<DayNightCycleRef, {
    isPaused: boolean,
    renderDistance: number,
    shadowQuality: ShadowQuality,
    brightness: number // Add Brightness prop
}>(({
    isPaused, renderDistance, shadowQuality, brightness
}, ref) => {
    const shadowsEnabled = shadowQuality !== 'off';
    const shadowSettings = SHADOW_QUALITY_SETTINGS[shadowQuality === 'off' ? 'low' : shadowQuality];
    const shadowMapSize = shadowSettings.mapSize;
    const { scene, camera, gl } = useThree();
    const starsRef = useRef<THREE.Group>(null);
    const auroraGroupRef = useRef<THREE.Group>(null);
    // The scene's only two lights, mounted for the Canvas's whole life so the
    // light count (and with it every lit shader) never changes at dawn or dusk.
    const keyLightRef = useRef<THREE.DirectionalLight>(null);
    const hemiLightRef = useRef<THREE.HemisphereLight>(null);

    // Groups for positioning
    const sunGroupRef = useRef<THREE.Group>(null);
    const moonGroupRef = useRef<THREE.Group>(null);

    // Meshes for material updates
    const sunCoreRef = useRef<THREE.Mesh>(null);
    const moonCoreRef = useRef<THREE.Mesh>(null);
    const skyMeshRef = useRef<THREE.Mesh>(null);

    // Internal tracking
    const [currentDayFactor, setCurrentDayFactor] = useState(1.0);
    const [bloodMoonActive, setBloodMoonActive] = useState(false);
    const daysPassedRef = useRef(0);
    const auroraBiomeBlendRef = useRef(0);
    const magneticFogBlendRef = useRef(0);
    // Smoothed boss-phase intensity so the fog thickens/thins gradually across a
    // phase change instead of snapping to the new density in a single frame.
    const stormBlendRef = useRef(0);
    const biomeSampleRef = useRef({ age: Infinity, inMagnetic: false, snowy: false });
    const atmosphere = useMemo(() => createAtmosphereState(), []);
    const mediumBlendRef = useRef(0);
    const mediumIsLavaRef = useRef(false);

    const TICK_CYCLE = 24000;

    // Performance: shadows reach a fixed distance per quality (48/80/112 blocks),
    // never past the render distance.
    const shadowDist = Math.min(renderDistance * CHUNK_SIZE, shadowSettings.distance);

    // three allocates a light's shadow map once; a new size only takes effect
    // after the old map is released.
    useEffect(() => {
        const light = keyLightRef.current;
        if (!light?.shadow.map) return;
        light.shadow.map.dispose();
        light.shadow.map = null;
    }, [shadowMapSize]);

    // Built-in materials only get fog while the scene has one; our fog chunks
    // ignore its colour and distances (they read the atmosphere uniforms).
    useEffect(() => {
        const fog = new THREE.Fog(0x000000, 1, 2);
        scene.fog = fog;
        return () => { if (scene.fog === fog) scene.fog = null; };
    }, [scene]);

    // Restore the renderer's exposure if the sky unmounts (e.g. back to the menu).
    useEffect(() => () => { gl.toneMappingExposure = 1; }, [gl]);

    // Boss and arena lights (systems/graphics/dynamicLights.ts) are packed into
    // their shared uniforms right before each render of the world, after every
    // useFrame has moved them.
    useEffect(() => {
        const previous = scene.onBeforeRender;
        scene.onBeforeRender = function onBeforeRender(renderer, renderScene, renderCamera, ...rest) {
            packDynamicLights(renderCamera);
            previous.call(this, renderer, renderScene, renderCamera, ...rest);
        };
        return () => { scene.onBeforeRender = previous; };
    }, [scene]);

    const sunTexture = useMemo(() => createPixelSunTexture(), []);

    const skyMat = useMemo(() => new THREE.ShaderMaterial({
        uniforms: {
            ...ATMOSPHERE_UNIFORMS,
            uStarRotation: { value: new THREE.Matrix3() },
            uStarVisibility: { value: 0 },
        },
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false, // Background
        depthTest: false   // Always draw behind everything
    }), []);

    const starMaterial = useMemo(() => new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
        vertexShader: StarShader.vertexShader,
        fragmentShader: StarShader.fragmentShader,
        transparent: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }), []);

    const auroraCurtainConfigs = useMemo(() => [
        // Low horizon sweep – main visible ribbon
        { radius: 400, arc: Math.PI * 1.1,  rotation: 0,              phase: 0,    tilt: 0.05,  elevation: 0.12 },
        // Mid-sky ribbon from a different direction
        { radius: 390, arc: Math.PI * 0.85, rotation: Math.PI * 0.55, phase: 1.7,  tilt: 0.15,  elevation: 0.28 },
        // Opposite horizon
        { radius: 410, arc: Math.PI * 1.0,  rotation: Math.PI * 1.25, phase: 3.4,  tilt: 0.08,  elevation: 0.16 },
        // High overhead ribbon – crosses zenith
        { radius: 370, arc: Math.PI * 0.7,  rotation: Math.PI * 0.30, phase: 5.1,  tilt: 0.55,  elevation: 0.45 },
        // Another low accent from yet another angle
        { radius: 420, arc: Math.PI * 0.6,  rotation: Math.PI * 1.70, phase: 2.5,  tilt: 0.04,  elevation: 0.10 },
        // Mid-high ribbon crossing overhead from a different direction
        { radius: 380, arc: Math.PI * 0.75, rotation: Math.PI * 1.05, phase: 4.0,  tilt: 0.40,  elevation: 0.38 },
    ], []);

    const auroraMaterials = useMemo(() => auroraCurtainConfigs.map(c => new THREE.ShaderMaterial({
        uniforms: {
            uTime:      { value: 0 },
            uOpacity:   { value: 0 },
            uRadius:    { value: c.radius },
            uArcLength: { value: c.arc },
            uRotation:  { value: c.rotation },
            uPhase:     { value: c.phase },
            uTilt:      { value: c.tilt },
            uElevation: { value: c.elevation },
            uColorA:    { value: new THREE.Color('#44ff88') },
            uColorB:    { value: new THREE.Color('#88ffcc') },
            uColorC:    { value: new THREE.Color('#9966ff') },
        },
        vertexShader: AuroraCurtainVertexShader,
        fragmentShader: AuroraCurtainFragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,   // Occluded by terrain in depth buffer
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
    })), [auroraCurtainConfigs]);

    useImperativeHandle(ref, () => ({
        setTime: (timeTicks: number) => {
            worldManager.setTime(timeTicks);
        },
        setPhase: (targetPhase: number) => {
            const currentTicks = worldManager.getTime();
            const currentMoonCycle = getMoonCycleIndex(currentTicks, TICK_CYCLE);
            const currentPhase = (currentMoonCycle % 8 + 8) % 8;

            let diff = targetPhase - currentPhase;
            while (diff < 0) diff += 8;

            // Advance by full days to shift the phase cycle.
            const ticksToAdd = diff * TICK_CYCLE;

            worldManager.setTime(currentTicks + ticksToAdd);
        }
    }));

    // Seeded star field: same sky every load. A handful twinkle; magnitude varies.
    const starData = useMemo(() => {
        const random = mulberry32(0xa71a5 ^ (worldManager.getSeed() | 0));
        const count = 1800;
        const positions = new Float32Array(count * 3);
        const phases = new Float32Array(count);
        const speeds = new Float32Array(count);
        const magnitudes = new Float32Array(count);

        for(let i=0; i<count; i++) {
            const r = 400;
            const theta = 2 * Math.PI * random();
            const phi = Math.acos(2 * random() - 1);
            positions[i*3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i*3+2] = r * Math.cos(phi);
            phases[i] = random() * Math.PI * 2;
            speeds[i] = random() < 0.08 ? 0.4 + random() * 1.4 : 0;
            magnitudes[i] = Math.pow(random(), 3);
        }
        return { positions, phases, speeds, magnitudes };
    }, []);

    useFrame(({ clock }, delta) => {
        if (isPaused) return;

        // Read time directly from WorldManager (synced with game ticks)
        const ticks = worldManager.getTime();
        const dayTime = ticks % TICK_CYCLE;
        const phi = (dayTime / TICK_CYCLE) * Math.PI * 2;
        daysPassedRef.current = Math.floor(ticks / TICK_CYCLE);

        // Moon phase cycle: increments later at noon rather than sunrise, so
        // the visible lunar phase persists through the morning and rolls over midday.
        const lunarEvent = getLunarNightEventState(ticks, TICK_CYCLE, worldManager.getSeed());
        const phaseIndex = lunarEvent.phaseIndex;
        const isBloodMoon = lunarEvent.isBloodMoon;
        if (isBloodMoon !== bloodMoonActive) setBloodMoonActive(isBloodMoon);

        // A blood moon always shows a full red disc, whatever the phase.
        const shownPhase = isBloodMoon ? 4 : phaseIndex;
        if (moonCoreRef.current && moonCoreRef.current.userData.lastPhase !== shownPhase) {
            moonCoreRef.current.userData.lastPhase = shownPhase;
            const material = moonCoreRef.current.material as THREE.MeshBasicMaterial;
            material.map = createPixelMoonTexture(shownPhase);
            material.needsUpdate = true;
        }

        // Biome-driven effects (Magnetic Fields haze, snowy aurora) sample the
        // biome a few times a second rather than every frame.
        const biomeSample = biomeSampleRef.current;
        biomeSample.age += delta;
        if (biomeSample.age >= BIOME_SAMPLE_INTERVAL) {
            biomeSample.age = 0;
            const biome = getBiome(camera.position.x, camera.position.z) as { id?: string; tags?: string[] } | undefined;
            biomeSample.inMagnetic = biome?.id === MAGNETIC_FIELDS_BIOME_ID;
            biomeSample.snowy = (Array.isArray(biome?.tags) && biome.tags.includes('snowy'))
                || biome?.id === 'tundra' || biome?.id === 'frozen_ocean' || biome?.id === 'frozen_river';
        }

        // The Magnetic Fields biome is hazy and charged. Damped so crossing the
        // border eases in/out. The haze is fully suppressed during the summon
        // cutscene (the orbit looks at the arena from far away, thick fog would hide
        // it) and fades back in the moment the player regains control.
        if (bossSummon.isActive()) {
            magneticFogBlendRef.current = 0;
        } else {
            magneticFogBlendRef.current = THREE.MathUtils.damp(magneticFogBlendRef.current, biomeSample.inMagnetic ? 1 : 0, 1.2, delta);
        }
        // Polarity storm: the haze thickens further per boss phase (slam → frenzy),
        // closing in for drama as the fight escalates.
        const stormTarget = bossSummon.isActive() ? 0 : bossPhaseState.intensity;
        stormBlendRef.current = THREE.MathUtils.damp(stormBlendRef.current, stormTarget, 1.2, delta);

        // --- One sampled atmosphere drives the sky, fog, lights and exposure. ---
        const state = sampleAtmosphere({
            ticks,
            lunar: { phaseIndex, isBloodMoon },
            magnetic: magneticFogBlendRef.current,
            storm: stormBlendRef.current,
            renderDistanceChunks: renderDistance,
            chunkSize: CHUNK_SIZE,
        }, atmosphere);
        applyAtmosphereUniforms(state);
        const exposure = state.exposure * TONE_MAPPING_EXPOSURE_TRIM;
        gl.toneMappingExposure = exposure;

        // --- The fluid the camera is in (water or lava) fogs everything in its colour. ---
        const cellType = worldManager.getBlock(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z), false);
        const inLava = cellType === BlockType.LAVA;
        const inFluid = inLava || cellType === BlockType.WATER;
        if (inFluid) mediumIsLavaRef.current = inLava;
        mediumBlendRef.current = THREE.MathUtils.damp(mediumBlendRef.current, inFluid ? 1 : 0, 14, delta);
        const medium = mediumBlendRef.current < 0.001 ? 0 : mediumBlendRef.current;
        if (mediumIsLavaRef.current) {
            applyMediumUniforms(medium, LAVA_MEDIUM_COLOR, 0.9);
        } else {
            // Water takes the sky's light: bright teal by day, deep navy at night, murky red under a blood moon.
            scratchMedium[0] = state.hemiSky[0] * WATER_MEDIUM_TINT[0];
            scratchMedium[1] = state.hemiSky[1] * WATER_MEDIUM_TINT[1];
            scratchMedium[2] = state.hemiSky[2] * WATER_MEDIUM_TINT[2];
            applyMediumUniforms(medium, scratchMedium, 0.06);
        }

        const dayFactor = state.dayFactor;
        if (Math.abs(dayFactor - currentDayFactor) > 0.01) setCurrentDayFactor(dayFactor);

        // Chunks now take day and night from the scene lights; the legacy sunlight
        // factor stays at 1 and only the Brightness floor passes through.
        updateChunkMaterials(1.0, brightness);
        updateVoxelLighting(brightness, exposure, clock.elapsedTime);
        updateCloudColor(dayFactor);

        scene.background = scratchBackground.setRGB(state.skyHorizon[0], state.skyHorizon[1], state.skyHorizon[2]);

        if (skyMeshRef.current) {
            skyMeshRef.current.position.copy(camera.position);
        }

        const radius = 400;
        const sunDir = state.sunDir;
        const moonDir = state.moonDir;
        const sunFade = THREE.MathUtils.smoothstep(sunDir[1], -0.08, 0.06) * (1 - medium);

        if (sunGroupRef.current && sunCoreRef.current) {
            sunGroupRef.current.position.set(
                camera.position.x + sunDir[0] * radius,
                camera.position.y + sunDir[1] * radius,
                camera.position.z + sunDir[2] * radius,
            );
            sunGroupRef.current.lookAt(camera.position);
            (sunCoreRef.current.material as THREE.MeshBasicMaterial).color.copy(SUN_DISC_COLOR).multiplyScalar(sunFade);
            sunGroupRef.current.visible = sunFade > 0.001;
        }

        const moonFade = state.moonVisibility * (1 - medium);
        if (moonGroupRef.current && moonCoreRef.current) {
            moonGroupRef.current.position.set(
                camera.position.x + moonDir[0] * radius,
                camera.position.y + moonDir[1] * radius,
                camera.position.z + moonDir[2] * radius,
            );
            moonGroupRef.current.lookAt(camera.position);
            // A blood moon hangs larger and burns red.
            moonGroupRef.current.scale.setScalar(isBloodMoon ? 1.45 : 1);
            (moonCoreRef.current.material as THREE.MeshBasicMaterial).color
                .copy(isBloodMoon ? BLOOD_MOON_DISC_COLOR : MOON_DISC_COLOR).multiplyScalar(moonFade);
            moonGroupRef.current.visible = moonFade > 0.001;
        }

        // --- Lights: one key (sun or moon) and one hemisphere ---
        const shadowSize = shadowDist;
        const lightDistance = shadowSize + 50;
        // Snap the shadow camera to whole texels in the light's own frame, so
        // shadow edges hold still while the player moves.
        scratchCameraCenter[0] = camera.position.x;
        scratchCameraCenter[1] = camera.position.y;
        scratchCameraCenter[2] = camera.position.z;
        const snapped = snapShadowCenter(scratchCameraCenter, state.keyDir, (shadowSize * 2) / shadowMapSize, scratchShadowCenter);
        const snappedX = snapped[0];
        const snappedY = snapped[1];
        const snappedZ = snapped[2];

        const key = keyLightRef.current;
        if (key) {
            const keyDir = scratchKeyDir.set(state.keyDir[0], state.keyDir[1], state.keyDir[2]);
            key.target.position.set(snappedX, snappedY, snappedZ);
            key.target.updateMatrixWorld();
            key.position.set(snappedX + keyDir.x * lightDistance, snappedY + keyDir.y * lightDistance, snappedZ + keyDir.z * lightDistance);
            key.up.set(0, 0, 1);
            key.updateMatrixWorld();
            key.color.setRGB(state.keyColor[0], state.keyColor[1], state.keyColor[2]);
            key.intensity = 1;
        }
        const hemi = hemiLightRef.current;
        if (hemi) {
            hemi.color.setRGB(state.hemiSky[0], state.hemiSky[1], state.hemiSky[2]);
            hemi.groundColor.setRGB(state.hemiGround[0], state.hemiGround[1], state.hemiGround[2]);
            hemi.intensity = 1;
        }

        if (starsRef.current) {
            starsRef.current.position.copy(camera.position);
            starsRef.current.quaternion.copy(scratchStarQuat.setFromAxisAngle(STAR_AXIS, phi));
            starMaterial.uniforms.uOpacity.value = state.starVisibility;
            starMaterial.uniforms.uTime.value = clock.elapsedTime;
            starsRef.current.visible = state.starVisibility > 0.01;
            // The galaxy band turns with the stars: sky shader samples in star space.
            skyMat.uniforms.uStarRotation.value.setFromMatrix4(
                scratchStarMatrix.makeRotationFromQuaternion(starsRef.current.quaternion).invert(),
            );
            skyMat.uniforms.uStarVisibility.value = state.starVisibility;
        }

        // Fast path: full daylight with the biome blend already settled at zero.
        if (auroraGroupRef.current && dayFactor >= 0.2 && auroraBiomeBlendRef.current < 0.001) {
            auroraGroupRef.current.visible = false;
        } else if (auroraGroupRef.current) {
            const nightFactor = THREE.MathUtils.clamp((0.2 - dayFactor) / 0.2, 0, 1);
            const targetBiomeBlend = biomeSample.snowy ? 1 : 0;
            auroraBiomeBlendRef.current = THREE.MathUtils.damp(auroraBiomeBlendRef.current, targetBiomeBlend, 0.75, delta);

            const intensityPulse = 0.75 + 0.25 * Math.sin(clock.elapsedTime * 0.05);
            const auroraOpacity = nightFactor * auroraBiomeBlendRef.current * 0.35 * intensityPulse;

            const theme = isBloodMoon ? AURORA_BLOOD_MOON_THEME : (AURORA_PHASE_THEMES[phaseIndex] || AURORA_PHASE_THEMES[0]);

            const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.07);
            const pulse2 = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.03 + 1.2);
            for (let i = 0; i < auroraMaterials.length; i++) {
                const mat = auroraMaterials[i];
                const p = auroraCurtainConfigs[i].phase;
                const localPulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.04 + p);
                mat.uniforms.uTime.value = clock.elapsedTime;
                mat.uniforms.uOpacity.value = auroraOpacity * (0.6 + 0.4 * localPulse);
                // Apply moon-phase color theme with slow per-ribbon variation
                if (isBloodMoon) {
                    mat.uniforms.uColorA.value.setHSL(theme[0] + pulse * 0.008 + p * 0.002, theme[1], theme[2]);
                    mat.uniforms.uColorB.value.setHSL(theme[3] + pulse2 * 0.01 + p * 0.002, theme[4], theme[5]);
                    mat.uniforms.uColorC.value.setHSL(theme[6] + pulse * 0.012 + p * 0.002, theme[7], theme[8]);
                } else {
                    mat.uniforms.uColorA.value.setHSL(theme[0] + pulse * 0.03 + p * 0.008, theme[1], theme[2]);
                    mat.uniforms.uColorB.value.setHSL(theme[3] + pulse2 * 0.04 + p * 0.006, theme[4], theme[5]);
                    mat.uniforms.uColorC.value.setHSL(theme[6] + pulse * 0.05 + p * 0.005, theme[7], theme[8]);
                }
            }

            auroraGroupRef.current.position.set(camera.position.x, camera.position.y, camera.position.z);
            auroraGroupRef.current.visible = auroraOpacity > 0.01;
        }
    });

    return (
        <>
            <mesh ref={skyMeshRef} renderOrder={-1000}>
                <sphereGeometry args={[450, 48, 32]} />
                <primitive object={skyMat} attach="material" />
            </mesh>

            <group ref={starsRef}>
                <points renderOrder={-990} material={starMaterial}>
                    <bufferGeometry>
                        <bufferAttribute attach="attributes-position" count={starData.positions.length / 3} array={starData.positions} itemSize={3} />
                        <bufferAttribute attach="attributes-phase" count={starData.phases.length} array={starData.phases} itemSize={1} />
                        <bufferAttribute attach="attributes-speed" count={starData.speeds.length} array={starData.speeds} itemSize={1} />
                        <bufferAttribute attach="attributes-magnitude" count={starData.magnitudes.length} array={starData.magnitudes} itemSize={1} />
                    </bufferGeometry>
                </points>
            </group>

            <group ref={auroraGroupRef} visible={false} renderOrder={-988}>
                {/* Low horizon sweep */}
                <mesh>
                    <planeGeometry args={[1, 90, 160, 8]} />
                    <primitive object={auroraMaterials[0]} />
                </mesh>
                {/* Mid-sky ribbon */}
                <mesh>
                    <planeGeometry args={[1, 80, 128, 8]} />
                    <primitive object={auroraMaterials[1]} />
                </mesh>
                {/* Opposite horizon */}
                <mesh>
                    <planeGeometry args={[1, 85, 140, 8]} />
                    <primitive object={auroraMaterials[2]} />
                </mesh>
                {/* Overhead crossing */}
                <mesh>
                    <planeGeometry args={[1, 70, 96, 6]} />
                    <primitive object={auroraMaterials[3]} />
                </mesh>
                {/* Low accent */}
                <mesh>
                    <planeGeometry args={[1, 60, 80, 6]} />
                    <primitive object={auroraMaterials[4]} />
                </mesh>
                {/* Mid-high crossing */}
                <mesh>
                    <planeGeometry args={[1, 75, 100, 6]} />
                    <primitive object={auroraMaterials[5]} />
                </mesh>
            </group>

            {/* Shooting Star effect attached to camera location but rendered independently */}
            <group position={camera.position}>
                <ShootingStar dayFactor={currentDayFactor} isPaused={isPaused} isBloodMoon={bloodMoonActive} />
            </group>

            {/* Sun and moon: pixel discs facing the camera. Their glow is part of the
                sky function (Mie halo), so there are no extra sprites. */}
            <group ref={sunGroupRef}>
                <mesh ref={sunCoreRef} renderOrder={-970}>
                    <planeGeometry args={[34, 34]} />
                    <meshBasicMaterial map={sunTexture} fog={false} transparent depthWrite={false} />
                </mesh>
            </group>

            <group ref={moonGroupRef}>
                <mesh ref={moonCoreRef} renderOrder={-970}>
                    <planeGeometry args={[26, 26]} />
                    <meshBasicMaterial fog={false} transparent depthWrite={false} color={COL_WHITE} />
                </mesh>
            </group>

            <hemisphereLight ref={hemiLightRef} />

            <directionalLight
                ref={keyLightRef} castShadow={shadowsEnabled}
                shadow-mapSize={[shadowMapSize, shadowMapSize]} shadow-bias={-0.0002} shadow-normalBias={0.045}
                shadow-camera-left={-shadowDist} shadow-camera-right={shadowDist}
                shadow-camera-top={shadowDist} shadow-camera-bottom={-shadowDist}
                shadow-camera-near={0.1} shadow-camera-far={shadowDist * 2 + 100}
            />
        </>
    );
});
