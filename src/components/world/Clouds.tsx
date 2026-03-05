
import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GlobalNoise } from '../../utils/noise';
import { CHUNK_SIZE } from '../../constants';

const CLOUD_LEVEL = 192;
const CLOUD_HEIGHT = 4;
const CLOUD_SCALE = 12; // 1 pixel = 12x12 blocks
const CLOUD_SPEED = 1.0;

// Two-pass transparent materials: backfaces first, then frontfaces.
const cloudMaterialSettings: THREE.MeshLambertMaterialParameters = {
    color: 0xFFFFFF,
    transparent: true,
    opacity: 0.8,
    depthWrite: true,
    depthTest: true
};

const cloudBackMaterial = new THREE.MeshLambertMaterial({
    ...cloudMaterialSettings,
    side: THREE.BackSide
});

const cloudFrontMaterial = new THREE.MeshLambertMaterial({
    ...cloudMaterialSettings,
    side: THREE.FrontSide
});

// Tracks the natural (day/night-adjusted) opacity before any fade multiplier
let cloudNaturalOpacity = 0.8;
// Animated 0→1 on first cloud appearance; stays at 1 when not fading
let cloudFadeMultiplier = 1.0;

export const updateCloudColor = (dayFactor: number) => {
    const nightColor = new THREE.Color(0x1a1a2e).multiplyScalar(0.4); 
    const dayColor = new THREE.Color(0xFFFFFF);
    cloudBackMaterial.color.lerpColors(nightColor, dayColor, dayFactor);
    cloudFrontMaterial.color.copy(cloudBackMaterial.color);
    // Slight opacity adjustment based on time; respect the current fade multiplier
    cloudNaturalOpacity = 0.6 + (0.2 * dayFactor);
    cloudBackMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier;
    cloudFrontMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier;
};

// Event system for manual overrides
let onTextureUpdate: ((url: string) => void) | null = null;

export const setCloudTexture = (url: string) => {
    if (onTextureUpdate) onTextureUpdate(url);
};

export const Clouds: React.FC<{ isPaused: boolean, renderDistance: number, fadeInEnabled?: boolean, visible?: boolean }> = ({ isPaused, renderDistance, fadeInEnabled = true, visible = true }) => {
    const { camera } = useThree();
    const [cloudData, setCloudData] = useState<{ width: number, height: number, data: Uint8Array } | null>(null);
    
    // We bundle geometry and its origin together to ensure they stay in sync during React updates
    const [cloudState, setCloudState] = useState<{ geometry: THREE.BufferGeometry | null, u: number, v: number }>({ 
        geometry: null, u: 0, v: 0 
    });
    
    const cloudGroupRef = useRef<THREE.Group>(null);
    const offsetRef = useRef(0);

    // Unified fade state
    const fadeRef = useRef({
        active: false,
        startMs: 0,
        isOut: false,    // true = fading out (1→0), false = fading in (0→1)
        duration: 0.8,
        hasLoaded: false // set true after the first geometry is built
    });
    const prevVisibleRef = useRef(visible);

    // Guarantee materials start at zero opacity on mount so there's no flash
    // before the fade-in animation begins.  Runs synchronously during the first
    // render — before any useEffect, useFrame, or DayNightCycle updateCloudColor.
    const didInitRef = useRef(false);
    if (!didInitRef.current) {
        didInitRef.current = true;
        if (fadeInEnabled && visible) {
            cloudFadeMultiplier = 0;
            cloudBackMaterial.opacity = 0;
            cloudFrontMaterial.opacity = 0;
        }
    }
    
    // Tracks the grid position currently requested/processing
    const lastRequestedGridPos = useRef({ u: -99999, v: -99999 });
    
    // Tracks the grid position currently RENDERED (committed to the mesh)
    const renderedGridPosRef = useRef({ u: 0, v: 0 });

    // Sync the ref with state immediately after render commit
    useLayoutEffect(() => {
        if (cloudState.geometry) {
            renderedGridPosRef.current = { u: cloudState.u, v: cloudState.v };
        }
        // Cleanup old geometry when state changes (React handles the new one)
        return () => {
            if (cloudState.geometry) {
                cloudState.geometry.dispose();
            }
        };
    }, [cloudState]);

    const processImage = (img: HTMLImageElement) => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                const pixels = imageData.data;
                
                const data = new Uint8Array(img.width * img.height);
                let validPixels = 0;

                for (let i = 0; i < img.width * img.height; i++) {
                    const r = pixels[i * 4];
                    const a = pixels[i * 4 + 3];
                    if (a > 50 && r > 100) {
                        data[i] = 255;
                        validPixels++;
                    } else {
                        data[i] = 0;
                    }
                }
                
                if (validPixels > 0) {
                    setCloudData({ width: img.width, height: img.height, data });
                    console.log(`[Clouds] Texture processed: ${img.width}x${img.height}`);
                } else {
                    generateProceduralClouds();
                }
            }
        } catch (e) {
            generateProceduralClouds();
        }
    };

    const generateProceduralClouds = () => {
        console.log("[Clouds] Generating procedural cloud pattern...");
        const width = 256; 
        const height = 256;
        const data = new Uint8Array(width * height);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let n = GlobalNoise.terrain.noise2D(x * 0.03, y * 0.03);
                n += GlobalNoise.terrain.noise2D(x * 0.1, y * 0.1) * 0.5;
                data[y * width + x] = n > 0.4 ? 255 : 0; 
            }
        }
        setCloudData({ width, height, data });
    };

    // 1. Initial Load & Listeners
    useEffect(() => {
        onTextureUpdate = (url) => {
            const img = new Image();
            img.onload = () => processImage(img);
            img.src = url;
        };

        (async () => {
            const rawPath = 'assets/textures/environment/clouds.png';
            const candidates = [`/${rawPath}`, rawPath];
            let loaded = false;
            
            for (const url of candidates) {
                try {
                    const response = await fetch(url);
                    if (!response.ok) continue;
                    const blob = await response.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    await new Promise<void>((resolve, reject) => {
                        const img = new Image();
                        img.onload = () => {
                            processImage(img);
                            URL.revokeObjectURL(objectUrl);
                            resolve();
                        };
                        img.onerror = () => {
                            URL.revokeObjectURL(objectUrl);
                            reject(new Error('Failed to load cloud texture image'));
                        };
                        img.src = objectUrl;
                    });
                    loaded = true;
                    break;
                } catch {}
            }

            if (!loaded) generateProceduralClouds();
        })();

        return () => { onTextureUpdate = null; };
    }, []);

    // 2. Force Rebuild on Settings Change
    useEffect(() => {
        lastRequestedGridPos.current = { u: -99999, v: -99999 };
    }, [renderDistance, cloudData]);

    // 3. Handle visibility changes (fade-in when re-shown, fade-out when hidden)
    //    Initial appearance fade-in is handled inside rebuildGeometry, NOT here.
    useEffect(() => {
        const wasVisible = prevVisibleRef.current;
        prevVisibleRef.current = visible;

        // Only act on actual transitions, not initial mount or geometry rebuilds
        if (visible === wasVisible) return;

        const f = fadeRef.current;

        if (visible) {
            // Became visible (was hidden)
            f.isOut = false;
            if (f.hasLoaded) {
                // Force a geometry rebuild so clouds appear at current position
                lastRequestedGridPos.current = { u: -99999, v: -99999 };
                if (fadeInEnabled) {
                    cloudFadeMultiplier = 0;
                    cloudBackMaterial.opacity = 0;
                    cloudFrontMaterial.opacity = 0;
                    f.active = true;
                    f.startMs = performance.now();
                    f.duration = 0.8;
                } else {
                    cloudFadeMultiplier = 1.0;
                    cloudBackMaterial.opacity = cloudNaturalOpacity;
                    cloudFrontMaterial.opacity = cloudNaturalOpacity;
                }
            }
        } else {
            // Became hidden (was visible)
            if (fadeInEnabled && f.hasLoaded) {
                f.active = true;
                f.isOut = true;
                f.startMs = performance.now();
                f.duration = 0.5;
            } else {
                f.active = false;
                cloudFadeMultiplier = 0;
                cloudBackMaterial.opacity = 0;
                cloudFrontMaterial.opacity = 0;
            }
        }
    }, [visible, fadeInEnabled]);

    // 4. Reset instantly if fade is disabled mid-session
    useEffect(() => {
        if (!fadeInEnabled) {
            const f = fadeRef.current;
            f.active = false;
            cloudFadeMultiplier = visible ? 1.0 : 0;
            cloudBackMaterial.opacity = visible ? cloudNaturalOpacity : 0;
            cloudFrontMaterial.opacity = visible ? cloudNaturalOpacity : 0;
        }
    }, [fadeInEnabled, visible]);

    const rebuildGeometry = (centerU: number, centerV: number) => {
        if (!cloudData) return;

        const { width, height, data } = cloudData;
        
        // Scale coverage based on 2x Render Distance
        // Ensure the cloud radius covers the full view distance
        const viewDist = (renderDistance * 2) * CHUNK_SIZE;
        const radius = Math.ceil(viewDist / CLOUD_SCALE) + 1; // +1 buffer

        const minU = centerU - radius;
        const maxU = centerU + radius;
        const minV = centerV - radius;
        const maxV = centerV + radius;

        const vertices: number[] = [];
        const normals: number[] = [];
        const indices: number[] = [];
        let vertCount = 0;
        const h = CLOUD_HEIGHT;

        const pushQuad = (
            x1: number, y1: number, z1: number,
            x2: number, y2: number, z2: number,
            x3: number, y3: number, z3: number,
            x4: number, y4: number, z4: number,
            nx: number, ny: number, nz: number
        ) => {
            vertices.push(x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4);
            normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
            indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
            vertCount += 4;
        };

        for (let u = minU; u <= maxU; u++) {
            for (let v = minV; v <= maxV; v++) {
                // Wrap coords for data lookup
                const du = ((u % width) + width) % width;
                const dv = ((v % height) + height) % height;

                if (data[dv * width + du] === 0) continue;

                // Local coords relative to the centerU/V origin
                const lx = (u - centerU) * CLOUD_SCALE;
                const lz = (v - centerV) * CLOUD_SCALE;
                
                const x0 = lx, x1 = lx + CLOUD_SCALE;
                const y0 = 0, y1 = h;
                const z0 = lz, z1 = lz + CLOUD_SCALE;

                // Top (Y+)
                pushQuad(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0);
                // Bottom (Y-)
                pushQuad(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0);

                // Right (X+)
                if (u == maxU) {
                    // Boundary Cap
                    pushQuad(x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0, -1, 0, 0);
                } else if (data[dv * width + ((du + 1) % width)] === 0) {
                    // Standard Outward Face
                    pushQuad(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0);
                }

                // Left (X-)
                if (u == minU) {
                    // Boundary Cap
                    pushQuad(x0, y0, z1, x0, y0, z0, x0, y1, z0, x0, y1, z1, 1, 0, 0);
                } else if (data[dv * width + ((du - 1 + width) % width)] === 0) {
                    // Standard Outward Face
                    pushQuad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0);
                }

                // Front (Z+)
                if (v == maxV) {
                    // Boundary Cap
                    pushQuad(x1, y0, z1, x0, y0, z1, x0, y1, z1, x1, y1, z1, 0, 0, -1);
                } else if (data[((dv + 1) % height) * width + du] === 0) {
                    // Standard Outward Face
                    pushQuad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1);
                }

                // Back (Z-)
                if (v == minV) {
                    // Boundary Cap
                    pushQuad(x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, 0, 0, 1);
                } else if (data[((dv - 1 + height) % height) * width + du] === 0) {
                    // Standard Outward Face
                    pushQuad(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1);
                }
            }
        }

        if (vertices.length === 0) {
            setCloudState({ geometry: null, u: centerU, v: centerV });
            return;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geo.setIndex(indices);
        geo.computeBoundingSphere();

        // Trigger fade-in on geometry builds.
        // Must happen before setCloudState so the material is already at opacity 0
        // when R3F draws the first frame that includes this geometry.
        const f = fadeRef.current;
        if (!f.hasLoaded) {
            f.hasLoaded = true;
            if (visible && fadeInEnabled) {
                cloudFadeMultiplier = 0;
                cloudBackMaterial.opacity = 0;
                cloudFrontMaterial.opacity = 0;
                f.active = true;
                f.isOut = false;
                f.startMs = performance.now();
                f.duration = 0.8;
            }
        }
        
        // Update State
        setCloudState({ geometry: geo, u: centerU, v: centerV });
    };

    useFrame((_, delta) => {
        // Fade animation runs every frame regardless of pause state
        const f = fadeRef.current;
        if (f.active) {
            const elapsed = (performance.now() - f.startMs) / 1000;
            const progress = THREE.MathUtils.clamp(elapsed / f.duration, 0, 1);
            const eased = progress * progress * (3 - 2 * progress);
            const multiplier = f.isOut ? (1.0 - eased) : eased;

            cloudFadeMultiplier = multiplier;
            cloudBackMaterial.opacity = cloudNaturalOpacity * multiplier;
            cloudFrontMaterial.opacity = cloudNaturalOpacity * multiplier;

            if (progress >= 1) {
                f.active = false;
                if (!f.isOut) {
                    // Fade-in complete: restore full opacity via updateCloudColor path
                    cloudFadeMultiplier = 1.0;
                    cloudBackMaterial.opacity = cloudNaturalOpacity;
                    cloudFrontMaterial.opacity = cloudNaturalOpacity;
                }
            }
        }

        // Skip movement/rebuild when fully hidden and not animating
        if ((!visible && !f.active) || isPaused || !cloudData) return;

        offsetRef.current += delta * CLOUD_SPEED;
        const worldWidth = cloudData.width * CLOUD_SCALE;
        // Wrap offset to keep precision
        if (offsetRef.current > worldWidth) offsetRef.current -= worldWidth;

        // Use Quantized Chunk position to prevent excessive updates
        const chunkX = Math.floor(camera.position.x / CHUNK_SIZE) * CHUNK_SIZE;
        const chunkZ = Math.floor(camera.position.z / CHUNK_SIZE) * CHUNK_SIZE;

        // Determine TARGET center in cloud grid coords based on Quantized Position
        const targetU = Math.floor((chunkX - offsetRef.current) / CLOUD_SCALE);
        const targetV = Math.floor(chunkZ / CLOUD_SCALE);

        // If we moved to a new grid cell, trigger a rebuild
        if (lastRequestedGridPos.current.u !== targetU || lastRequestedGridPos.current.v !== targetV) {
            lastRequestedGridPos.current = { u: targetU, v: targetV };
            rebuildGeometry(targetU, targetV);
        }

        if (cloudGroupRef.current) {
            // Position cloud group based on the GEOMETRY's origin (renderedU/V)
            const { u, v } = renderedGridPosRef.current;
            
            cloudGroupRef.current.position.set(
                u * CLOUD_SCALE + offsetRef.current,
                CLOUD_LEVEL,
                v * CLOUD_SCALE
            );
        }
    });

    if (!cloudState.geometry) return null;
    // Keep rendering during fade-out; hide only when fully invisible and not animating
    if (!visible && !fadeRef.current.active) return null;

    return (
        <group ref={cloudGroupRef}>
            <mesh
                geometry={cloudState.geometry}
                material={cloudBackMaterial}
                renderOrder={-101}
                frustumCulled={false}
            />
            <mesh
                geometry={cloudState.geometry}
                material={cloudFrontMaterial}
                renderOrder={-100} // Render AFTER backfaces and BEFORE terrain/water (0).
                frustumCulled={false}
            />
        </group>
    );
};
