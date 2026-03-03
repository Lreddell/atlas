
import { useRef, useState, useMemo, useImperativeHandle, forwardRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHUNK_SIZE } from '../../constants';
import { createSunTexture, createMoonPhaseTexture, createGlowTexture } from '../../utils/textures';
import { updateChunkMaterials } from '../ChunkMesh';
import { updateCloudColor } from './Clouds';
import { worldManager } from '../../systems/WorldManager';
import { getBiome } from '../../systems/world/biomes';

// Shader for the skybox gradient with Directional Sunset
const SkyMaterial = {
    uniforms: {
        uHorizonColorSun: { value: new THREE.Color() },
        uHorizonColorMoon: { value: new THREE.Color() },
        uZenithColor: { value: new THREE.Color() },
        uSunDirection: { value: new THREE.Vector3(0, 1, 0) }
    },
    vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
    `,
    fragmentShader: `
        uniform vec3 uHorizonColorSun;
        uniform vec3 uHorizonColorMoon;
        uniform vec3 uZenithColor;
        uniform vec3 uSunDirection;
        varying vec3 vWorldPosition;
        
        void main() {
            vec3 dir = normalize(vWorldPosition);
            
            // 1. Vertical Gradient (Horizon to Zenith)
            float verticalFactor = max(0.0, dir.y);
            verticalFactor = pow(verticalFactor, 0.5); // easing
            
            // 2. Horizontal Gradient (Sun Side vs Moon Side)
            // dot product is 1.0 facing sun, -1.0 facing away
            float sunDot = dot(dir, normalize(uSunDirection));
            
            // Map [-1, 1] to [0, 1] with a smooth transition
            // We shift the midpoint slightly so the sunset color wraps around a bit
            float horizontalFactor = smoothstep(-0.4, 0.8, sunDot);
            
            // Mix the two horizon colors first
            vec3 currentHorizon = mix(uHorizonColorMoon, uHorizonColorSun, horizontalFactor);
            
            // Then mix horizon with zenith based on height
            gl_FragColor = vec4(mix(currentHorizon, uZenithColor, verticalFactor), 1.0);
        }
    `
};

// Shader for twinkling stars
const StarShader = {
    uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 }
    },
    vertexShader: `
        attribute float phase;
        attribute float speed;
        varying float vAlpha;
        uniform float uTime;
        void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            
            // Increased scale factor and minimum size to prevent aliasing flickering
            float size = 600.0 / -mvPosition.z; 
            gl_PointSize = max(1.5, size); 
            
            // Twinkle logic
            float brightness = 1.0;
            if (speed > 0.0) {
                 // Ultra slow sine wave based on speed attribute
                 float twinkle = sin(uTime * speed + phase);
                 // Map -1..1 to 0.4..1.0 for a subtle breathing effect
                 brightness = 0.7 + 0.3 * twinkle;
            }
            vAlpha = brightness;
        }
    `,
    fragmentShader: `
        varying float vAlpha;
        uniform float uOpacity;
        void main() {
            // Circular particle
            vec2 coord = gl_PointCoord - vec2(0.5);
            if(length(coord) > 0.5) discard;
            
            gl_FragColor = vec4(1.0, 1.0, 1.0, vAlpha * uOpacity);
        }
    `
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

        // Dynamic colour shift along the ribbon length — stronger effect
        float cShift = sin(vUv.x * 5.0 + uTime * 0.035 + uPhase) * 0.5 + 0.5;
        col = mix(col, mix(uColorB, uColorC, cShift), 0.25);

        float alpha = (vertMask + core * 0.6) * hIntensity * edgeFade * uOpacity;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
    }
`;

// Shooting Star Component
const ShootingStar = ({ dayFactor, isPaused }: { dayFactor: number, isPaused: boolean }) => {
    const groupRef = useRef<THREE.Group>(null);
    const [active, setActive] = useState(false);
    const progress = useRef(0);
    const speed = useRef(0.3); // Controls animation duration
    const startPos = useRef(new THREE.Vector3());
    const endPos = useRef(new THREE.Vector3());

    const spawnStar = () => {
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

        const colors = ['#00ffff', '#e0ffff', '#d8bfd8', '#7fffd4', '#fffacd'];
        const col = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
        material.uniforms.uColor.value = col;

        if (groupRef.current) {
            groupRef.current.position.copy(startPos.current);
            groupRef.current.lookAt(endPos.current);
            groupRef.current.visible = true;
        }
    };

    useEffect(() => {
        const onSpawn = () => {
            if (isPaused) return;
            spawnStar();
        };

        window.addEventListener('atlas:shootingstar:spawn', onSpawn);
        return () => window.removeEventListener('atlas:shootingstar:spawn', onSpawn);
    }, [isPaused]);

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
                // pow(vUv.x, 3.0) makes the tail fade out gracefully
                float alpha = pow(vUv.x, 4.0) * uOpacity; 
                gl_FragColor = vec4(uColor, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    }), []);

    useFrame((_, delta) => {
        if (isPaused) return;

        // Only spawn at night (dayFactor < 0.1 implies very dark/night)
        if (!active && dayFactor < 0.1) {
            // Very rare chance: approx once every ~40 seconds at 60fps
            if (Math.random() < 0.0016) {
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

export const DayNightCycle = forwardRef<DayNightCycleRef, { 
    setAmbientIntensity: any, 
    setDirectionalIntensity: any, 
    isPaused: boolean, 
    renderDistance: number,
    shadowsEnabled: boolean,
    brightness: number // Add Brightness prop
}>(({ 
    setAmbientIntensity, setDirectionalIntensity, isPaused, renderDistance, shadowsEnabled, brightness 
}, ref) => {
    const { scene, camera } = useThree();
    const starsRef = useRef<THREE.Group>(null);
    const auroraGroupRef = useRef<THREE.Group>(null);
    const sunLightRef = useRef<THREE.DirectionalLight>(null);
    const moonLightRef = useRef<THREE.DirectionalLight>(null);
    const ambientLightRef = useRef<THREE.AmbientLight>(null);
    
    // Groups for positioning
    const sunGroupRef = useRef<THREE.Group>(null);
    const moonGroupRef = useRef<THREE.Group>(null);
    
    // Meshes for material updates
    const sunCoreRef = useRef<THREE.Mesh>(null);
    const moonCoreRef = useRef<THREE.Mesh>(null);
    const skyMeshRef = useRef<THREE.Mesh>(null);
    
    // Internal tracking
    const [currentDayFactor, setCurrentDayFactor] = useState(1.0);
    const daysPassedRef = useRef(0);
    const auroraBiomeBlendRef = useRef(0);
    
    const TICK_CYCLE = 24000;

    // Performance: Limit shadows to 8 chunks max, regardless of render distance
    const MAX_SHADOW_CHUNKS = 8;
    const shadowDist = Math.min(renderDistance, MAX_SHADOW_CHUNKS) * CHUNK_SIZE;

    const sunTexture = useMemo(() => createSunTexture(), []);
    const sunGlow = useMemo(() => createGlowTexture('#FFD54F'), []);
    const moonGlow = useMemo(() => createGlowTexture('#FFFFFF'), []);
    
    const skyMat = useMemo(() => new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(SkyMaterial.uniforms),
        vertexShader: SkyMaterial.vertexShader,
        fragmentShader: SkyMaterial.fragmentShader,
        side: THREE.BackSide,
        depthWrite: false, // Background
        depthTest: false   // Always draw behind everything
    }), []);

    const starMaterial = useMemo(() => new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(StarShader.uniforms),
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
        toneMapped: false,
    })), [auroraCurtainConfigs]);

    useImperativeHandle(ref, () => ({
        setTime: (timeTicks: number) => {
            worldManager.setTime(timeTicks);
        },
        setPhase: (targetPhase: number) => {
            const currentTicks = worldManager.getTime();
            // Calculate current moon cycle based on noon-change rule (see below)
            const currentMoonCycle = Math.floor((currentTicks - 6000) / TICK_CYCLE);
            const currentPhase = (currentMoonCycle % 8 + 8) % 8;
            
            let diff = targetPhase - currentPhase;
            while (diff < 0) diff += 8;
            
            // Advance by full days to shift the phase cycle
            const ticksToAdd = diff * TICK_CYCLE;
            
            worldManager.setTime(currentTicks + ticksToAdd);
        }
    }));

    // Generate custom star positions and phases for twinkling
    const starData = useMemo(() => {
        // Reduced from 5000 to 1500 for a cleaner sky
        const count = 1500;
        const positions = new Float32Array(count * 3);
        const phases = new Float32Array(count);
        const speeds = new Float32Array(count);
        
        for(let i=0; i<count; i++) {
            const r = 400;
            const theta = 2 * Math.PI * Math.random();
            const phi = Math.acos(2 * Math.random() - 1);
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);
            positions[i*3] = x;
            positions[i*3+1] = y;
            positions[i*3+2] = z;
            phases[i] = Math.random() * Math.PI * 2;
            
            // 1% of stars twinkle
            if (Math.random() < 0.01) {
                speeds[i] = 0.05 + Math.random() * 0.2;
            } else {
                speeds[i] = 0; // Steady star
            }
        }
        return { positions, phases, speeds };
    }, []);

    useFrame(({ clock }) => {
        if (isPaused) return;

        // Read time directly from WorldManager (synced with game ticks)
        const ticks = worldManager.getTime();
        const dayTime = ticks % TICK_CYCLE;
        
        // 0 ticks = Sunrise. 6000 ticks = Noon (PI/2).
        const phi = (dayTime / TICK_CYCLE) * Math.PI * 2;

        // Standard days passed (increments at sunrise, 0 ticks)
        const daysPassed = Math.floor(ticks / TICK_CYCLE);
        daysPassedRef.current = daysPassed;

        // Moon phase cycle: Increments at Noon (6000 ticks) so the visible change happens when moon is invisible/nadir.
        const moonCycle = Math.floor((ticks - 6000) / TICK_CYCLE);
        // Handle negative cycles for early game ticks < 6000
        const phaseIndex = (moonCycle % 8 + 8) % 8;
        
        const distFromNew = Math.abs(phaseIndex - 4); 
        const factor = 1 - (distFromNew / 4);
        const phaseBrightnessFactor = factor * 0.72;
        const phaseIntensity = 0.63 + (0.2 * phaseBrightnessFactor);

        if (moonCoreRef.current && (!moonCoreRef.current.userData.lastPhase || moonCoreRef.current.userData.lastPhase !== phaseIndex)) {
             moonCoreRef.current.userData.lastPhase = phaseIndex;
             const tex = createMoonPhaseTexture(phaseIndex);
             if (tex) {
                 if (!Array.isArray(moonCoreRef.current.material)) {
                    (moonCoreRef.current.material as THREE.MeshBasicMaterial).map = tex;
                    (moonCoreRef.current.material as THREE.MeshBasicMaterial).needsUpdate = true;
                 }
             }
        }

        // --- Orbit Logic ---
        const radius = 400;
        const sunDir = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0).normalize();
        const moonDir = new THREE.Vector3(-Math.cos(phi), -Math.sin(phi), 0).normalize();
        const h = sunDir.y;
        
        // Use -0.05 for transition to full darkness instead of -0.15
        const dayFactor = THREE.MathUtils.smoothstep(h, -0.05, 0.2);
        if (Math.abs(dayFactor - currentDayFactor) > 0.01) setCurrentDayFactor(dayFactor);

        const effectiveSunlight = THREE.MathUtils.lerp(phaseIntensity, 1.0, dayFactor);
        
        // Push both Sunlight and Brightness to Chunk Materials
        updateChunkMaterials(effectiveSunlight, brightness);
        
        updateCloudColor(dayFactor);

        // --- Sky Gradient Logic ---
        const colNightZenith = new THREE.Color(0x000005); 
        // Darkened horizon to better match the black zenith, reducing "glowing mountain" artifacts
        const colNightHorizon = new THREE.Color(0x080815); 
        
        const colDayZenith = new THREE.Color(0x4a90e2); 
        const colDayHorizon = new THREE.Color(0x87CEEB); 
        
        const colSunsetZenith = new THREE.Color(0x2c3e50); 
        const colSunsetHorizonSun = new THREE.Color(0xff6b35);
        const colSunsetHorizonMoon = new THREE.Color(0x0d0d26);
        
        let targetZenith = new THREE.Color();
        let targetHorizonSun = new THREE.Color();
        let targetHorizonMoon = new THREE.Color();
        let targetFog = new THREE.Color();

        // Start sunset earlier (when sun is at 0.4 height instead of 0.2)
        if (h > 0.4) {
            targetZenith.copy(colDayZenith);
            targetHorizonSun.copy(colDayHorizon);
            targetHorizonMoon.copy(colDayHorizon);
            targetFog.copy(colDayHorizon);
        } else if (h > -0.05) { // Transition phase: 0.4 down to -0.05
            const t = 1.0 - (h - (-0.05)) / 0.45;
            targetZenith.lerpColors(colDayZenith, colSunsetZenith, t);
            targetHorizonSun.lerpColors(colDayHorizon, colSunsetHorizonSun, t);
            targetHorizonMoon.lerpColors(colDayHorizon, colSunsetHorizonMoon, t);
            targetFog.lerpColors(colDayHorizon, colSunsetHorizonMoon, t * 0.8);
            
            // Accelerate the darkening at the very end of sunset
            if (t > 0.8) {
                 const tNight = (t - 0.8) / 0.2;
                 targetZenith.lerp(colNightZenith, tNight);
                 targetHorizonSun.lerp(colNightHorizon, tNight);
                 targetHorizonMoon.lerp(colNightHorizon, tNight);
                 targetFog.lerp(colNightHorizon, tNight);
            }
        } else {
            targetZenith.copy(colNightZenith);
            targetHorizonSun.copy(colNightHorizon);
            targetHorizonMoon.copy(colNightHorizon);
            targetFog.copy(colNightHorizon);
        }

        skyMat.uniforms.uZenithColor.value.copy(targetZenith);
        skyMat.uniforms.uHorizonColorSun.value.copy(targetHorizonSun);
        skyMat.uniforms.uHorizonColorMoon.value.copy(targetHorizonMoon);
        skyMat.uniforms.uSunDirection.value.copy(sunDir);
        
        scene.background = targetFog;

        // Push fog start distance back to prevent wash-out at close range
        const fogNear = Math.max(30, renderDistance * CHUNK_SIZE * 0.3);
        const fogFar = renderDistance * CHUNK_SIZE - 5;

        if (scene.fog) {
            (scene.fog as THREE.Fog).color.copy(targetFog);
            (scene.fog as THREE.Fog).near = fogNear;
            (scene.fog as THREE.Fog).far = fogFar;
        } else {
             scene.fog = new THREE.Fog(targetFog, fogNear, fogFar);
        }
        
        if (skyMeshRef.current) {
            skyMeshRef.current.position.copy(camera.position);
        }

        const sunFade = THREE.MathUtils.smoothstep(h, -0.2, 0.1);
        
        if (sunGroupRef.current && sunCoreRef.current) {
            sunGroupRef.current.position.copy(camera.position).add(sunDir.clone().multiplyScalar(radius));
            sunGroupRef.current.up.set(0, 0, 1);
            sunGroupRef.current.lookAt(camera.position); 
            sunGroupRef.current.rotation.z = Math.PI / 8;
            
            // Use Color for fading because transparent=false ignores opacity on MeshBasicMaterial
            (sunCoreRef.current.material as THREE.MeshBasicMaterial).color.setScalar(sunFade);
            
            const sprite = sunGroupRef.current.children[0] as THREE.Sprite;
            if (sprite) (sprite.material as THREE.SpriteMaterial).color.setScalar(0.6 * sunFade);
            
            sunGroupRef.current.visible = sunFade > 0;
        }

        const moonH = -h;
        const moonFade = THREE.MathUtils.smoothstep(moonH, -0.2, 0.1);

        if (moonGroupRef.current && moonCoreRef.current) {
            moonGroupRef.current.position.copy(camera.position).add(moonDir.clone().multiplyScalar(radius));
            moonGroupRef.current.up.set(0, 0, 1);
            moonGroupRef.current.lookAt(camera.position);
            moonGroupRef.current.rotation.z = Math.PI / 8;
            
            // Fade using color
            (moonCoreRef.current.material as THREE.MeshBasicMaterial).color.setScalar(moonFade);
            
            const sprite = moonGroupRef.current.children[0] as THREE.Sprite;
            if (sprite) (sprite.material as THREE.SpriteMaterial).color.setScalar(0.4 * moonFade);

            moonGroupRef.current.visible = moonFade > 0;
        }

        // --- Shadows & Lights ---
        const shadowSize = shadowDist;
        const lightDistance = shadowSize + 50; 
        const TEXEL_SIZE = (shadowSize * 2) / 2048;
        
        const snappedX = Math.floor(camera.position.x / TEXEL_SIZE) * TEXEL_SIZE;
        const snappedY = Math.floor(camera.position.y / TEXEL_SIZE) * TEXEL_SIZE;
        const snappedZ = Math.floor(camera.position.z / TEXEL_SIZE) * TEXEL_SIZE;
        
        const DAY_DIRECTIONAL_INTENSITY = 0.8;
        const NIGHT_DIRECTIONAL_MAX = 0.5; 

        if (sunLightRef.current) {
            sunLightRef.current.target.position.set(snappedX, snappedY, snappedZ);
            sunLightRef.current.target.updateMatrixWorld();
            sunLightRef.current.position.set(snappedX + sunDir.x * lightDistance, snappedY + sunDir.y * lightDistance, snappedZ + sunDir.z * lightDistance);
            sunLightRef.current.up.set(0, 0, 1);
            sunLightRef.current.updateMatrixWorld();
            sunLightRef.current.intensity = Math.max(0, Math.sin(phi)) * DAY_DIRECTIONAL_INTENSITY * dayFactor;
        }
        if (moonLightRef.current) {
            moonLightRef.current.target.position.set(snappedX, snappedY, snappedZ);
            moonLightRef.current.target.updateMatrixWorld();
            moonLightRef.current.position.set(snappedX + moonDir.x * lightDistance, snappedY + moonDir.y * lightDistance, snappedZ + moonDir.z * lightDistance);
            moonLightRef.current.up.set(0, 0, 1);
            moonLightRef.current.updateMatrixWorld();
            moonLightRef.current.intensity = (NIGHT_DIRECTIONAL_MAX * phaseBrightnessFactor) * (1 - dayFactor);
        }

        const DAY_AMBIENT = 0.6;
        const NIGHT_AMBIENT_BASE = 0.2; 
        const NIGHT_AMBIENT_VAR = 0.1;
        const nightAmbient = NIGHT_AMBIENT_BASE + (NIGHT_AMBIENT_VAR * phaseBrightnessFactor);
        
        const currentAmbient = THREE.MathUtils.lerp(nightAmbient, DAY_AMBIENT, dayFactor);
        const currentDirectional = THREE.MathUtils.lerp(NIGHT_DIRECTIONAL_MAX * phaseBrightnessFactor, DAY_DIRECTIONAL_INTENSITY, dayFactor);
        
        // Update local ambient light directly for performance
        if (ambientLightRef.current) {
            ambientLightRef.current.intensity = currentAmbient;
        }
        
        // Propagate state upwards mostly for UI if needed, but not for rendering
        setAmbientIntensity(currentAmbient);
        setDirectionalIntensity(currentDirectional);

        if (starsRef.current) { 
            starsRef.current.position.copy(camera.position); 
            starsRef.current.rotation.z = phi;
            
            const starOpacity = THREE.MathUtils.clamp(1.0 - (dayFactor * 1.5), 0, 1);
            starMaterial.uniforms.uOpacity.value = starOpacity;
            starMaterial.uniforms.uTime.value = clock.elapsedTime;
            
            starsRef.current.visible = starOpacity > 0.01;
        }

        if (auroraGroupRef.current) {
            const biome = getBiome(camera.position.x, camera.position.z) as any;
            const hasSnowyTag = Array.isArray(biome?.tags) && biome.tags.includes('snowy');
            const isSnowyId = biome?.id === 'tundra' || biome?.id === 'frozen_ocean' || biome?.id === 'frozen_river';
            const isSnowyBiome = hasSnowyTag || isSnowyId;

            const nightFactor = THREE.MathUtils.clamp((0.2 - dayFactor) / 0.2, 0, 1);
            const targetBiomeBlend = isSnowyBiome ? 1 : 0;
            auroraBiomeBlendRef.current = THREE.MathUtils.lerp(auroraBiomeBlendRef.current, targetBiomeBlend, 0.015);

            const intensityPulse = 0.75 + 0.25 * Math.sin(clock.elapsedTime * 0.05);
            const auroraOpacity = nightFactor * auroraBiomeBlendRef.current * 0.35 * intensityPulse;

            // Moon-phase color themes (phaseIndex 0-7: 0=new, 4=full)
            // 0-1 New/Waxing Crescent: vivid green-cyan
            // 2-3 First Quarter/Waxing Gibbous: green-teal-blue
            // 4-5 Full/Waning Gibbous: cyan-blue-magenta (most colorful at full moon)
            // 6-7 Last Quarter/Waning Crescent: green-purple-pink
            const phaseThemes: [number,number,number,number,number,number,number,number,number][] = [
                // [hueA, satA, lightA, hueB, satB, lightB, hueC, satC, lightC]
                [0.36, 0.95, 0.50,  0.46, 0.90, 0.55,  0.52, 0.80, 0.50], // 0: new moon – classic green
                [0.38, 0.90, 0.52,  0.48, 0.85, 0.56,  0.56, 0.75, 0.52], // 1: waxing crescent
                [0.35, 0.85, 0.48,  0.50, 0.80, 0.54,  0.62, 0.78, 0.50], // 2: first quarter – teal shift
                [0.33, 0.88, 0.50,  0.52, 0.82, 0.55,  0.68, 0.80, 0.52], // 3: waxing gibbous
                [0.44, 0.80, 0.52,  0.58, 0.85, 0.56,  0.78, 0.85, 0.55], // 4: full moon – cyan/blue/magenta
                [0.42, 0.82, 0.50,  0.55, 0.80, 0.54,  0.75, 0.82, 0.53], // 5: waning gibbous
                [0.34, 0.90, 0.48,  0.50, 0.78, 0.52,  0.82, 0.80, 0.50], // 6: last quarter – green/purple
                [0.36, 0.92, 0.50,  0.48, 0.80, 0.54,  0.80, 0.78, 0.52], // 7: waning crescent
            ];
            const theme = phaseThemes[phaseIndex] || phaseThemes[0];

            const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.07);
            const pulse2 = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.03 + 1.2);
            for (let i = 0; i < auroraMaterials.length; i++) {
                const mat = auroraMaterials[i];
                const p = auroraCurtainConfigs[i].phase;
                const localPulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.04 + p);
                mat.uniforms.uTime.value = clock.elapsedTime;
                mat.uniforms.uOpacity.value = auroraOpacity * (0.6 + 0.4 * localPulse);
                // Apply moon-phase color theme with slow per-ribbon variation
                mat.uniforms.uColorA.value.setHSL(theme[0] + pulse * 0.03 + p * 0.008, theme[1], theme[2]);
                mat.uniforms.uColorB.value.setHSL(theme[3] + pulse2 * 0.04 + p * 0.006, theme[4], theme[5]);
                mat.uniforms.uColorC.value.setHSL(theme[6] + pulse * 0.05 + p * 0.005, theme[7], theme[8]);
            }

            auroraGroupRef.current.position.set(camera.position.x, camera.position.y, camera.position.z);
            auroraGroupRef.current.visible = auroraOpacity > 0.01;
        }
    });

    return (
        <>
            <mesh ref={skyMeshRef} renderOrder={-1000}>
                <sphereGeometry args={[450, 32, 32]} />
                <primitive object={skyMat} attach="material" />
            </mesh>
            
            <group ref={starsRef}>
                <points renderOrder={-990} material={starMaterial}>
                    <bufferGeometry>
                        <bufferAttribute attach="attributes-position" count={starData.positions.length / 3} array={starData.positions} itemSize={3} />
                        <bufferAttribute attach="attributes-phase" count={starData.phases.length} array={starData.phases} itemSize={1} />
                        <bufferAttribute attach="attributes-speed" count={starData.speeds.length} array={starData.speeds} itemSize={1} />
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
                <ShootingStar dayFactor={currentDayFactor} isPaused={isPaused} />
            </group>
            
            <group ref={sunGroupRef}>
                {/* Sun Glow: Opaque Queue (-980), Additive Blending. Drawn BEFORE core. */}
                <sprite scale={[120, 120, 1]} renderOrder={-980}>
                    <spriteMaterial 
                        map={sunGlow} 
                        transparent={false} 
                        blending={THREE.AdditiveBlending} 
                        depthWrite={false}
                    />
                </sprite>
                {/* Sun Core: Opaque Queue (-970). Drawn AFTER glow to appear on top. Normal blending replaces additive white. */}
                <mesh ref={sunCoreRef} renderOrder={-970}>
                    <boxGeometry args={[40, 40, 40]} />
                    <meshBasicMaterial 
                        map={sunTexture} 
                        toneMapped={false} 
                        fog={false} 
                        transparent={false}
                        alphaTest={0.5}
                        depthWrite={false}
                    />
                </mesh>
            </group>

            <group ref={moonGroupRef}>
                {/* Moon Glow: Opaque Queue (-980), Additive. Drawn BEFORE core. 
                    Scaled up to 140 for better visibility.
                */}
                <sprite scale={[140, 140, 1]} renderOrder={-980}>
                    <spriteMaterial 
                        map={moonGlow} 
                        transparent={false} 
                        blending={THREE.AdditiveBlending} 
                        depthWrite={false} 
                    />
                </sprite>
                {/* Moon Core: Opaque Queue (-970). Drawn AFTER glow. */}
                <mesh ref={moonCoreRef} renderOrder={-970}>
                    <boxGeometry args={[30, 30, 30]} />
                    <meshBasicMaterial 
                        toneMapped={false} 
                        fog={false} 
                        color={0xFFFFFF} 
                        transparent={false}
                        alphaTest={0.5}
                        depthWrite={false} 
                    />
                </mesh>
            </group>

            {/* Local Ambient Light managed via ref */}
            <ambientLight ref={ambientLightRef} />

            <directionalLight 
                ref={sunLightRef} castShadow={shadowsEnabled}
                shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001}
                shadow-camera-left={-shadowDist} shadow-camera-right={shadowDist}
                shadow-camera-top={shadowDist} shadow-camera-bottom={-shadowDist}
                shadow-camera-near={0.1} shadow-camera-far={shadowDist * 2 + 100}
            />

            <directionalLight 
                ref={moonLightRef} castShadow={shadowsEnabled}
                shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001}
                shadow-camera-left={-shadowDist} shadow-camera-right={shadowDist}
                shadow-camera-top={shadowDist} shadow-camera-bottom={-shadowDist}
                shadow-camera-near={0.1} shadow-camera-far={shadowDist * 2 + 100}
            />
        </>
    );
});
