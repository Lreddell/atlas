
import { useRef, useState, useMemo, useImperativeHandle, forwardRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHUNK_SIZE } from '../../constants';
import { createSunTexture, createMoonPhaseTexture, createGlowTexture } from '../../utils/textures';
import { updateChunkMaterials } from '../ChunkMesh';
import { updateCloudColor } from './Clouds';
import { worldManager } from '../../systems/WorldManager';

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

// Shooting Star Component
const ShootingStar = ({ dayFactor, isPaused }: { dayFactor: number, isPaused: boolean }) => {
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
                // pow(vUv.x, 3.0) makes the tail fade out gracefully
                float alpha = pow(vUv.x, 4.0) * uOpacity; 
                gl_FragColor = vec4(uColor, alpha);
            }
        `,
        // Opaque queue but additive blending to prevent occlusion bugs while keeping effect
        transparent: false, 
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    }), []);

    useFrame((_, delta) => {
        if (isPaused) return;

        // Only spawn at night (dayFactor < 0.1 implies very dark/night)
        if (!active && dayFactor < 0.1) {
            // Very rare chance: approx once every ~40 seconds at 60fps
            if (Math.random() < 0.0004) {
                setActive(true);
                progress.current = 0;
                
                // VARIABLE SPEED: Random range between 0.15 (slow) and 0.4 (fast)
                speed.current = 0.15 + Math.random() * 0.25;

                // Spawn logic: Constrain to upper hemisphere
                const r = 350;
                // Vertical range: Top 70% of the dome (0.3 to 1.0) to ensure they are high in the sky
                const u = 0.3 + Math.random() * 0.7; 
                const y = r * u;
                const rXZ = Math.sqrt(r*r - y*y);
                const theta = Math.random() * Math.PI * 2;
                
                startPos.current.set(
                    rXZ * Math.cos(theta),
                    y,
                    rXZ * Math.sin(theta)
                );
                
                // End position: Move significantly across the sky
                const moveDist = 200 + Math.random() * 100;
                
                // Movement direction: 
                // Bias Y slightly negative (-0.5 to 0) so they tend to fall or go straight, never shoot straight up
                const moveDir = new THREE.Vector3(
                    (Math.random() - 0.5) * 2, 
                    -Math.random() * 0.5, 
                    (Math.random() - 0.5) * 2
                ).normalize();
                
                endPos.current.copy(startPos.current).add(moveDir.multiplyScalar(moveDist));
                
                // Random Color for variety
                const colors = ['#00ffff', '#e0ffff', '#d8bfd8', '#7fffd4', '#fffacd'];
                const col = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
                material.uniforms.uColor.value = col;

                if (groupRef.current) {
                    groupRef.current.position.copy(startPos.current);
                    groupRef.current.lookAt(endPos.current);
                    groupRef.current.visible = true;
                }
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
        const phaseIntensity = 0.65 + (0.2 * factor);

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
            moonLightRef.current.intensity = (NIGHT_DIRECTIONAL_MAX * factor) * (1 - dayFactor);
        }

        const DAY_AMBIENT = 0.6;
        const NIGHT_AMBIENT_BASE = 0.2; 
        const NIGHT_AMBIENT_VAR = 0.1;
        const nightAmbient = NIGHT_AMBIENT_BASE + (NIGHT_AMBIENT_VAR * factor);
        
        const currentAmbient = THREE.MathUtils.lerp(nightAmbient, DAY_AMBIENT, dayFactor);
        const currentDirectional = THREE.MathUtils.lerp(NIGHT_DIRECTIONAL_MAX * factor, DAY_DIRECTIONAL_INTENSITY, dayFactor);
        
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
