
import { useRef, useMemo, useImperativeHandle, forwardRef, useEffect } from 'react';
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
import { SHADOW_QUALITY_SETTINGS, type ShadowQuality, type VisualStyle } from '../../systems/graphics/graphicsSettings';
import { createAtmosphereState, sampleAtmosphere, SUN_ORBIT_AXIS, SUN_ORBIT_TILT } from '../../systems/graphics/atmosphere';
import { CLASSIC_ORBIT_AXIS, sampleClassicAtmosphere } from '../../systems/graphics/classicAtmosphere';
import { ATMOSPHERE_GLSL, ATMOSPHERE_UNIFORMS, applyAtmosphereUniforms, applyMediumUniforms } from '../../systems/graphics/atmosphereUniforms';
import { BlockType } from '../../types';
import { createGlowTexture, createMoonPhaseTexture, createSunTexture } from '../../utils/textures';
import { updateVoxelLighting } from '../../systems/graphics/materials/voxelMaterial';
import { setClassicLighting, setClassicLightLevels } from '../../systems/graphics/materials/worldLighting';
import { packDynamicLights } from '../../systems/graphics/dynamicLights';
import { createShadowSnap, snapShadowCenter } from '../../systems/graphics/shadows';
import { TONE_MAPPING_EXPOSURE_TRIM } from '../../systems/graphics/pipeline/pipelinePlan';
import { SKY_FAR_PLANE_GLSL, SKY_ORDER, drawAtFarPlane, skyFrame } from '../../systems/graphics/skyObjects';
import { Aurora } from './sky/Aurora';
import { Meteors } from './sky/Meteors';

// The sky, the sun and moon, the stars, and the scene's two lights, all driven
// by one sampled atmosphere (systems/graphics/atmosphere.ts) per frame.
//
// Everything here writes SCENE-LINEAR colour and ends in three's tone-mapping
// and colour-space chunks, exactly like lit materials. The fog of every
// material is the same atlasSkyRadiance the dome paints, so distant terrain
// dissolves into the sky behind it with no seam.
//
// The Classic visual style swaps in the pre-overhaul sky, fog and lights
// (classicAtmosphere.ts); the square sun and moon are the originals in both.

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
        if (uStarVisibility > 0.001 && dir.y > -0.1 && atlasClassicSky.w < 0.5) {
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
            ${SKY_FAR_PLANE_GLSL}
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

export interface DayNightCycleRef {
    setTime: (timeTicks: number) => void;
    setPhase: (phaseIndex: number) => void;
}

// The original sun and moon: tilted pixel squares with a soft glow. Their cores
// run bright enough in Luminous to catch the bloom; Classic keeps them level
// with the old look. They fade in and out by opacity: fading by colour left an
// opaque dark square (a black moon rising into the dusk sky). Opaque, the
// moon's unlit side still hides the stars behind it.
const SUN_CORE_LUMINOUS = 2.4;
const SUN_CORE_CLASSIC = 1.35;
const MOON_CORE_LUMINOUS = 1.5;
const MOON_CORE_CLASSIC = 1.1;
const CELESTIAL_TILT = Math.PI / 8;
const scratchGlowColor = new THREE.Color();

// The old moon textures, one per phase (drawn once, not on every phase change).
const moonPhaseTextures = new Map<number, THREE.Texture>();
function moonPhaseTexture(phase: number): THREE.Texture | null {
    const cached = moonPhaseTextures.get(phase);
    if (cached) return cached;
    const texture = createMoonPhaseTexture(phase);
    if (!texture) return null;
    texture.colorSpace = THREE.SRGBColorSpace;
    moonPhaseTextures.set(phase, texture);
    return texture;
}

function srgbCanvasTexture(texture: THREE.Texture | null): THREE.Texture | null {
    if (texture) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

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
const shadowSnap = createShadowSnap();

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

/** A sun or moon disc: opaque texels, faded by opacity, drawn at the far plane. */
function createDiscMaterial(): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({ fog: false, transparent: true, depthWrite: false });
    drawAtFarPlane(material);
    return material;
}

/** A sun or moon glow: additive, drawn at the far plane. */
function createGlowMaterial(map: THREE.Texture | null): THREE.SpriteMaterial {
    const material = new THREE.SpriteMaterial({ map, fog: false, transparent: false, blending: THREE.AdditiveBlending, depthWrite: false });
    drawAtFarPlane(material);
    return material;
}

export const DayNightCycle = forwardRef<DayNightCycleRef, {
    isPaused: boolean,
    renderDistance: number,
    shadowQuality: ShadowQuality,
    brightness: number,
    visualStyle?: VisualStyle,
}>(({
    isPaused, renderDistance, shadowQuality, brightness, visualStyle = 'luminous'
}, ref) => {
    const shadowsEnabled = shadowQuality !== 'off';
    const shadowSettings = SHADOW_QUALITY_SETTINGS[shadowQuality === 'off' ? 'low' : shadowQuality];
    const shadowMapSize = shadowSettings.mapSize;
    const { scene, camera, gl } = useThree();
    const starsRef = useRef<THREE.Group>(null);
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

    const sunTexture = useMemo(() => srgbCanvasTexture(createSunTexture()), []);
    const sunGlowTexture = useMemo(() => srgbCanvasTexture(createGlowTexture('#FFD54F')), []);
    const moonGlowTexture = useMemo(() => srgbCanvasTexture(createGlowTexture('#FFFFFF')), []);
    const sunGlowRef = useRef<THREE.Sprite>(null);
    const moonGlowRef = useRef<THREE.Sprite>(null);
    const sunDiscMaterial = useMemo(() => { const m = createDiscMaterial(); m.map = sunTexture; return m; }, [sunTexture]);
    const moonDiscMaterial = useMemo(() => createDiscMaterial(), []);
    const sunGlowMaterial = useMemo(() => createGlowMaterial(sunGlowTexture), [sunGlowTexture]);
    const moonGlowMaterial = useMemo(() => createGlowMaterial(moonGlowTexture), [moonGlowTexture]);

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
        skyFrame.paused = isPaused;
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
        skyFrame.bloodMoon = isBloodMoon;
        skyFrame.moonPhase = phaseIndex;

        // The moon shows its phase; a blood moon is always full, its whole face burning red.
        const shownPhase = isBloodMoon ? 4 : phaseIndex;
        if (moonCoreRef.current && moonCoreRef.current.userData.lastPhase !== shownPhase) {
            moonCoreRef.current.userData.lastPhase = shownPhase;
            const material = moonCoreRef.current.material as THREE.MeshBasicMaterial;
            material.map = moonPhaseTexture(shownPhase);
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
        const classic = visualStyle === 'classic';
        const state = classic
            ? sampleClassicAtmosphere({
                ticks,
                lunar: lunarEvent,
                magnetic: magneticFogBlendRef.current,
                storm: stormBlendRef.current,
                renderDistanceChunks: renderDistance,
                chunkSize: CHUNK_SIZE,
            }, atmosphere)
            : sampleAtmosphere({
                ticks,
                lunar: { phaseIndex, isBloodMoon },
                magnetic: magneticFogBlendRef.current,
                storm: stormBlendRef.current,
                renderDistanceChunks: renderDistance,
                chunkSize: CHUNK_SIZE,
            }, atmosphere);
        applyAtmosphereUniforms(state);
        setClassicLighting(classic);
        setClassicLightLevels(state.classicSunlight, brightness);
        const exposure = state.exposure * TONE_MAPPING_EXPOSURE_TRIM;
        gl.toneMappingExposure = exposure;

        // --- The fluid the camera is in (water or lava) fogs everything in its colour. ---
        const cellType = worldManager.getBlock(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z), false);
        const inLava = cellType === BlockType.LAVA;
        const inFluid = inLava || cellType === BlockType.WATER;
        if (inFluid) mediumIsLavaRef.current = inLava;
        mediumBlendRef.current = THREE.MathUtils.damp(mediumBlendRef.current, inFluid && !classic ? 1 : 0, 14, delta);
        const medium = mediumBlendRef.current < 0.001 ? 0 : mediumBlendRef.current;
        if (classic) {
            // Classic tints the screen instead (App's overlay), as it always did.
            applyMediumUniforms(0, scratchMedium, 0.06);
        } else if (mediumIsLavaRef.current) {
            applyMediumUniforms(medium, LAVA_MEDIUM_COLOR, 0.9);
        } else {
            // Water takes the sky's light: bright teal by day, deep navy at night, murky red under a blood moon.
            scratchMedium[0] = state.hemiSky[0] * WATER_MEDIUM_TINT[0];
            scratchMedium[1] = state.hemiSky[1] * WATER_MEDIUM_TINT[1];
            scratchMedium[2] = state.hemiSky[2] * WATER_MEDIUM_TINT[2];
            applyMediumUniforms(medium, scratchMedium, 0.06);
        }

        const dayFactor = state.dayFactor;
        skyFrame.medium = medium;

        // Chunks now take day and night from the scene lights; the legacy sunlight
        // factor stays at 1 and only the Brightness floor passes through.
        updateChunkMaterials(1.0, brightness);
        updateVoxelLighting(brightness, exposure, clock.elapsedTime);
        updateCloudColor(dayFactor, classic);

        scene.background = scratchBackground.setRGB(state.skyHorizon[0], state.skyHorizon[1], state.skyHorizon[2]);

        if (skyMeshRef.current) {
            skyMeshRef.current.position.copy(camera.position);
        }

        const radius = 400;
        const sunDir = state.sunDir;
        const moonDir = state.moonDir;
        const sunFade = state.sunVisibility * (1 - medium);

        if (sunGroupRef.current && sunCoreRef.current) {
            sunGroupRef.current.position.set(
                camera.position.x + sunDir[0] * radius,
                camera.position.y + sunDir[1] * radius,
                camera.position.z + sunDir[2] * radius,
            );
            // Face the camera, tilted an eighth of a turn: the original square sun.
            sunGroupRef.current.up.set(0, 0, 1);
            sunGroupRef.current.lookAt(camera.position);
            sunGroupRef.current.rotateZ(CELESTIAL_TILT);
            sunDiscMaterial.color.setScalar(classic ? SUN_CORE_CLASSIC : SUN_CORE_LUMINOUS);
            sunDiscMaterial.opacity = sunFade;
            // A soft glow (the old one was mostly lost in its fog); Luminous leaves the rest to the bloom.
            if (sunGlowRef.current) (sunGlowRef.current.material as THREE.SpriteMaterial).color.setScalar((classic ? 0.3 : 0.22) * sunFade);
            sunGroupRef.current.visible = sunFade > 0.001;
        }

        const moonFade = state.moonVisibility * (1 - medium);
        if (moonGroupRef.current && moonCoreRef.current) {
            moonGroupRef.current.position.set(
                camera.position.x + moonDir[0] * radius,
                camera.position.y + moonDir[1] * radius,
                camera.position.z + moonDir[2] * radius,
            );
            moonGroupRef.current.up.set(0, 0, 1);
            moonGroupRef.current.lookAt(camera.position);
            moonGroupRef.current.rotateZ(CELESTIAL_TILT);
            // Tinted by the night's lunar event: white, or the blood moon's deep red.
            moonDiscMaterial.color.set(lunarEvent.moonColorHex).multiplyScalar(classic ? MOON_CORE_CLASSIC : MOON_CORE_LUMINOUS);
            moonDiscMaterial.opacity = moonFade;
            if (moonGlowRef.current) {
                // Only the lit part of the moon glows: none at new moon, softest at full.
                const lit = isBloodMoon ? 1 : 1 - Math.abs(phaseIndex - 4) / 4;
                (moonGlowRef.current.material as THREE.SpriteMaterial).color
                    .copy(scratchGlowColor.set(lunarEvent.moonGlowHex)).multiplyScalar((classic ? 0.16 : 0.12) * lit * moonFade);
            }
            moonGroupRef.current.visible = moonFade > 0.001;
        }

        // --- Lights: one key (sun or moon) and one hemisphere ---
        const shadowSize = shadowDist;
        const lightDistance = shadowSize + 50;
        // Snap the shadow camera to whole texels in the light's own frame, turning
        // about the player, so shadow edges hold still while the player moves and
        // only creep as the sun does (shadows.ts). Its up is the orbit axis.
        scratchCameraCenter[0] = camera.position.x;
        scratchCameraCenter[1] = camera.position.y;
        scratchCameraCenter[2] = camera.position.z;
        const orbitAxis = state.classic ? CLASSIC_ORBIT_AXIS : SUN_ORBIT_AXIS;
        const snapped = snapShadowCenter(scratchCameraCenter, state.keyDir, orbitAxis, (shadowSize * 2) / shadowMapSize, shadowSnap, scratchShadowCenter);
        const snappedX = snapped[0];
        const snappedY = snapped[1];
        const snappedZ = snapped[2];

        const key = keyLightRef.current;
        if (key) {
            const keyDir = scratchKeyDir.set(state.keyDir[0], state.keyDir[1], state.keyDir[2]);
            key.target.position.set(snappedX, snappedY, snappedZ);
            key.target.updateMatrixWorld();
            key.position.set(snappedX + keyDir.x * lightDistance, snappedY + keyDir.y * lightDistance, snappedZ + keyDir.z * lightDistance);
            // three aims the shadow camera with its own up, which must match the snap's frame.
            key.shadow.camera.up.set(orbitAxis[0], orbitAxis[1], orbitAxis[2]);
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
            starMaterial.uniforms.uOpacity.value = state.starVisibility * (1 - medium);
            starMaterial.uniforms.uTime.value = clock.elapsedTime;
            starsRef.current.visible = state.starVisibility * (1 - medium) > 0.01;
            // The galaxy band turns with the stars: sky shader samples in star space.
            skyMat.uniforms.uStarRotation.value.setFromMatrix4(
                scratchStarMatrix.makeRotationFromQuaternion(starsRef.current.quaternion).invert(),
            );
            skyMat.uniforms.uStarVisibility.value = state.starVisibility;
        }
        skyFrame.night = state.starVisibility;

        // The aurora (sky/Aurora): at night in snowy biomes, breathing slowly, in
        // the moon phase's colours (or the blood moon's).
        const targetBiomeBlend = biomeSample.snowy ? 1 : 0;
        auroraBiomeBlendRef.current = THREE.MathUtils.damp(auroraBiomeBlendRef.current, targetBiomeBlend, 0.75, delta);
        const auroraNight = THREE.MathUtils.clamp((0.2 - dayFactor) / 0.2, 0, 1);
        skyFrame.aurora = auroraNight * auroraBiomeBlendRef.current * (0.75 + 0.25 * Math.sin(clock.elapsedTime * 0.05));
        if (skyFrame.aurora > 0.005) {
            const theme = isBloodMoon ? AURORA_BLOOD_MOON_THEME : (AURORA_PHASE_THEMES[phaseIndex] || AURORA_PHASE_THEMES[0]);
            const drift = isBloodMoon ? 0.3 : 1;
            const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.07);
            const pulse2 = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.03 + 1.2);
            skyFrame.auroraLow.setHSL(theme[0] + pulse * 0.03 * drift, theme[1], theme[2]);
            skyFrame.auroraMid.setHSL(theme[3] + pulse2 * 0.04 * drift, theme[4], theme[5]);
            skyFrame.auroraHigh.setHSL(theme[6] + pulse * 0.05 * drift, theme[7], theme[8]);
        }
    });

    return (
        <>
            <mesh ref={skyMeshRef} renderOrder={SKY_ORDER.dome}>
                <sphereGeometry args={[450, 48, 32]} />
                <primitive object={skyMat} attach="material" />
            </mesh>

            <group ref={starsRef}>
                <points renderOrder={SKY_ORDER.stars} material={starMaterial}>
                    <bufferGeometry>
                        <bufferAttribute attach="attributes-position" count={starData.positions.length / 3} array={starData.positions} itemSize={3} />
                        <bufferAttribute attach="attributes-phase" count={starData.phases.length} array={starData.phases} itemSize={1} />
                        <bufferAttribute attach="attributes-speed" count={starData.speeds.length} array={starData.speeds} itemSize={1} />
                        <bufferAttribute attach="attributes-magnitude" count={starData.magnitudes.length} array={starData.magnitudes} itemSize={1} />
                    </bufferGeometry>
                </points>
            </group>

            <Aurora />
            <Meteors />

            {/* The original sun and moon: tilted pixel squares facing the camera,
                each over a soft additive glow drawn just before it. */}
            <group ref={sunGroupRef}>
                <sprite ref={sunGlowRef} scale={[120, 120, 1]} renderOrder={SKY_ORDER.glow} material={sunGlowMaterial} />
                <mesh ref={sunCoreRef} renderOrder={SKY_ORDER.disc} material={sunDiscMaterial}>
                    <planeGeometry args={[40, 40]} />
                </mesh>
            </group>

            <group ref={moonGroupRef}>
                <sprite ref={moonGlowRef} scale={[140, 140, 1]} renderOrder={SKY_ORDER.glow} material={moonGlowMaterial} />
                <mesh ref={moonCoreRef} renderOrder={SKY_ORDER.disc} material={moonDiscMaterial}>
                    <planeGeometry args={[30, 30]} />
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
