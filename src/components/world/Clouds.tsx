
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

// Separate materials for newly-revealed cloud tiles that fade in independently.
const newCloudBackMaterial = new THREE.MeshLambertMaterial({
    ...cloudMaterialSettings,
    side: THREE.BackSide,
    opacity: 0
});

const newCloudFrontMaterial = new THREE.MeshLambertMaterial({
    ...cloudMaterialSettings,
    side: THREE.FrontSide,
    opacity: 0
});

// Tracks the natural (day/night-adjusted) opacity before any fade multiplier
let cloudNaturalOpacity = 0.8;
// Animated 0→1 on first cloud appearance; stays at 1 when not fading
let cloudFadeMultiplier = 1.0;
// Animated 0→1 for newly-revealed cloud tiles; stays at 1 otherwise
let newCloudFadeMultiplier = 1.0;

export const updateCloudColor = (dayFactor: number) => {
    const nightColor = new THREE.Color(0x1a1a2e).multiplyScalar(0.4); 
    const dayColor = new THREE.Color(0xFFFFFF);
    cloudBackMaterial.color.lerpColors(nightColor, dayColor, dayFactor);
    cloudFrontMaterial.color.copy(cloudBackMaterial.color);
    newCloudBackMaterial.color.copy(cloudBackMaterial.color);
    newCloudFrontMaterial.color.copy(cloudBackMaterial.color);
    // Slight opacity adjustment based on time; respect the current fade multipliers
    cloudNaturalOpacity = 0.6 + (0.2 * dayFactor);
    cloudBackMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier;
    cloudFrontMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier;
    newCloudBackMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier * newCloudFadeMultiplier;
    newCloudFrontMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier * newCloudFadeMultiplier;
};

// Event system for manual overrides
let onTextureUpdate: ((url: string) => void) | null = null;

export const setCloudTexture = (url: string) => {
    if (onTextureUpdate) onTextureUpdate(url);
};

export const Clouds: React.FC<{ isPaused: boolean, renderDistance: number, fadeInEnabled?: boolean, visible?: boolean }> = ({ isPaused, renderDistance, fadeInEnabled = true, visible = true }) => {
    const { camera } = useThree();
    const [cloudData, setCloudData] = useState<{ width: number, height: number, data: Uint8Array } | null>(null);
    
    // We bundle geometry and its origin together to ensure they stay in sync during React updates.
    // existingGeo: cloud tiles already in view (stable opacity).
    // newGeo: newly-revealed cloud tiles that fade in independently.
    const [cloudState, setCloudState] = useState<{
        existingGeo: THREE.BufferGeometry | null,
        newGeo: THREE.BufferGeometry | null,
        u: number, v: number, radius: number
    }>({ existingGeo: null, newGeo: null, u: 0, v: 0, radius: 0 });
    
    const cloudGroupRef = useRef<THREE.Group>(null);
    const offsetRef = useRef(0);

    // Unified fade state (global: initial load, show/hide)
    const fadeRef = useRef({
        active: false,
        startMs: 0,
        isOut: false,    // true = fading out (1→0), false = fading in (0→1)
        duration: 0.8,
        hasLoaded: false // set true after the first geometry is built
    });

    // Fade state for newly-revealed tiles only
    const newTileFadeRef = useRef({
        active: false,
        startMs: 0,
        duration: 0.8
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
            newCloudFadeMultiplier = 1.0; // on first load all tiles are existingGeo; new tiles are not expected yet
            newCloudBackMaterial.opacity = 0;
            newCloudFrontMaterial.opacity = 0;
        }
    }
    
    // Tracks the grid position currently requested/processing
    const lastRequestedGridPos = useRef({ u: -99999, v: -99999 });
    
    // Tracks the grid position and radius currently RENDERED (committed to the mesh)
    const renderedGridPosRef = useRef({ u: 0, v: 0, radius: 0 });

    // Sync the ref with state immediately after render commit
    useLayoutEffect(() => {
        if (cloudState.existingGeo || cloudState.newGeo) {
            renderedGridPosRef.current = { u: cloudState.u, v: cloudState.v, radius: cloudState.radius };
        }
        // Cleanup old geometry when state changes (React handles the new one)
        return () => {
            cloudState.existingGeo?.dispose();
            cloudState.newGeo?.dispose();
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
            // Became visible (was hidden).
            // Cancel any in-progress new-tile fade so all clouds follow cloudFadeMultiplier.
            newTileFadeRef.current.active = false;
            newCloudFadeMultiplier = 1.0;

            f.isOut = false;
            if (f.hasLoaded) {
                // Force a geometry rebuild so clouds appear at current position
                lastRequestedGridPos.current = { u: -99999, v: -99999 };
                if (fadeInEnabled) {
                    cloudFadeMultiplier = 0;
                    cloudBackMaterial.opacity = 0;
                    cloudFrontMaterial.opacity = 0;
                    newCloudBackMaterial.opacity = 0;
                    newCloudFrontMaterial.opacity = 0;
                    f.active = true;
                    f.startMs = performance.now();
                    f.duration = 0.8;
                } else {
                    cloudFadeMultiplier = 1.0;
                    cloudBackMaterial.opacity = cloudNaturalOpacity;
                    cloudFrontMaterial.opacity = cloudNaturalOpacity;
                    newCloudBackMaterial.opacity = cloudNaturalOpacity;
                    newCloudFrontMaterial.opacity = cloudNaturalOpacity;
                }
            }
        } else {
            // Became hidden (was visible).
            // Cancel new-tile fade — the global fade-out handles all clouds.
            newTileFadeRef.current.active = false;
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
                newCloudFadeMultiplier = 1.0;
                newCloudBackMaterial.opacity = 0;
                newCloudFrontMaterial.opacity = 0;
            }
        }
    }, [visible, fadeInEnabled]);

    // 4. Reset instantly if fade is disabled mid-session
    useEffect(() => {
        if (!fadeInEnabled) {
            const f = fadeRef.current;
            f.active = false;
            newTileFadeRef.current.active = false;
            cloudFadeMultiplier = visible ? 1.0 : 0;
            newCloudFadeMultiplier = 1.0;
            cloudBackMaterial.opacity = visible ? cloudNaturalOpacity : 0;
            cloudFrontMaterial.opacity = visible ? cloudNaturalOpacity : 0;
            newCloudBackMaterial.opacity = visible ? cloudNaturalOpacity : 0;
            newCloudFrontMaterial.opacity = visible ? cloudNaturalOpacity : 0;
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

        const f = fadeRef.current;
        const isFirstLoad = !f.hasLoaded;

        // Old rendered bounds — used to classify tiles as existing (already visible) vs new.
        const oldCenter = renderedGridPosRef.current;
        const oldMinU = oldCenter.u - oldCenter.radius;
        const oldMaxU = oldCenter.u + oldCenter.radius;
        const oldMinV = oldCenter.v - oldCenter.radius;
        const oldMaxV = oldCenter.v + oldCenter.radius;

        // Separate vertex/index buffers for existing tiles (stable opacity) and new tiles (fade-in).
        const existingVerts: number[] = [];
        const existingNorms: number[] = [];
        const existingIdxs: number[] = [];
        let existingVC = 0;

        const newVerts: number[] = [];
        const newNorms: number[] = [];
        const newIdxs: number[] = [];
        let newVC = 0;

        const h = CLOUD_HEIGHT;

        const pushQuadExisting = (
            x1: number, y1: number, z1: number,
            x2: number, y2: number, z2: number,
            x3: number, y3: number, z3: number,
            x4: number, y4: number, z4: number,
            nx: number, ny: number, nz: number
        ) => {
            existingVerts.push(x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4);
            existingNorms.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
            existingIdxs.push(existingVC, existingVC + 1, existingVC + 2, existingVC, existingVC + 2, existingVC + 3);
            existingVC += 4;
        };

        const pushQuadNew = (
            x1: number, y1: number, z1: number,
            x2: number, y2: number, z2: number,
            x3: number, y3: number, z3: number,
            x4: number, y4: number, z4: number,
            nx: number, ny: number, nz: number
        ) => {
            newVerts.push(x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4);
            newNorms.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
            newIdxs.push(newVC, newVC + 1, newVC + 2, newVC, newVC + 2, newVC + 3);
            newVC += 4;
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

                // On first load all tiles are "existing" (fade in with cloudFadeMultiplier).
                // On subsequent rebuilds, classify by whether the tile was within the previous rendered
                // bounds (inclusive: tiles at the old edges were rendered before and should stay stable).
                const isExisting = isFirstLoad || (
                    u >= oldMinU && u <= oldMaxU &&
                    v >= oldMinV && v <= oldMaxV
                );
                const pushQuad = isExisting ? pushQuadExisting : pushQuadNew;

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

        // Build existingGeo (stable, already-visible tiles)
        let existingGeo: THREE.BufferGeometry | null = null;
        if (existingVerts.length > 0) {
            existingGeo = new THREE.BufferGeometry();
            existingGeo.setAttribute('position', new THREE.Float32BufferAttribute(existingVerts, 3));
            existingGeo.setAttribute('normal', new THREE.Float32BufferAttribute(existingNorms, 3));
            existingGeo.setIndex(existingIdxs);
            existingGeo.computeBoundingSphere();
        }

        // Build newGeo (newly-revealed tiles that will fade in)
        let newGeo: THREE.BufferGeometry | null = null;
        if (newVerts.length > 0) {
            newGeo = new THREE.BufferGeometry();
            newGeo.setAttribute('position', new THREE.Float32BufferAttribute(newVerts, 3));
            newGeo.setAttribute('normal', new THREE.Float32BufferAttribute(newNorms, 3));
            newGeo.setIndex(newIdxs);
            newGeo.computeBoundingSphere();
        }

        if (!existingGeo && !newGeo) {
            setCloudState({ existingGeo: null, newGeo: null, u: centerU, v: centerV, radius });
            return;
        }

        // Trigger fade-in on geometry builds.
        // Must happen before setCloudState so materials are already at the right opacity
        // when R3F draws the first frame that includes this geometry.
        if (isFirstLoad) {
            // First ever build: fade in everything via cloudFadeMultiplier.
            f.hasLoaded = true;
            if (visible && fadeInEnabled) {
                cloudFadeMultiplier = 0;
                cloudBackMaterial.opacity = 0;
                cloudFrontMaterial.opacity = 0;
                newCloudBackMaterial.opacity = 0;
                newCloudFrontMaterial.opacity = 0;
                f.active = true;
                f.isOut = false;
                f.startMs = performance.now();
                f.duration = 0.8;
            }
        } else if (newGeo && visible && fadeInEnabled && !f.isOut) {
            // Subsequent rebuild: only fade in the newly-revealed tiles.
            // Existing tiles remain at full opacity — no global flash.
            const ntf = newTileFadeRef.current;
            ntf.active = true;
            ntf.startMs = performance.now();
            ntf.duration = 0.8;
            newCloudFadeMultiplier = 0;
            newCloudBackMaterial.opacity = 0;
            newCloudFrontMaterial.opacity = 0;
        }
        
        // Update State
        setCloudState({ existingGeo, newGeo, u: centerU, v: centerV, radius });
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
            // New-cloud materials also follow the global multiplier
            newCloudBackMaterial.opacity = cloudNaturalOpacity * multiplier * newCloudFadeMultiplier;
            newCloudFrontMaterial.opacity = cloudNaturalOpacity * multiplier * newCloudFadeMultiplier;

            if (progress >= 1) {
                f.active = false;
                if (!f.isOut) {
                    // Fade-in complete: restore full opacity via updateCloudColor path
                    cloudFadeMultiplier = 1.0;
                    cloudBackMaterial.opacity = cloudNaturalOpacity;
                    cloudFrontMaterial.opacity = cloudNaturalOpacity;
                    newCloudBackMaterial.opacity = cloudNaturalOpacity * newCloudFadeMultiplier;
                    newCloudFrontMaterial.opacity = cloudNaturalOpacity * newCloudFadeMultiplier;
                }
            }
        }

        // New-tile fade animation (only affects newly-revealed cloud tiles)
        const ntf = newTileFadeRef.current;
        if (ntf.active) {
            const elapsed = (performance.now() - ntf.startMs) / 1000;
            const progress = THREE.MathUtils.clamp(elapsed / ntf.duration, 0, 1);
            const eased = progress * progress * (3 - 2 * progress);
            newCloudFadeMultiplier = eased;
            newCloudBackMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier * eased;
            newCloudFrontMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier * eased;

            if (progress >= 1) {
                ntf.active = false;
                newCloudFadeMultiplier = 1.0;
                newCloudBackMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier;
                newCloudFrontMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier;
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

    if (!cloudState.existingGeo && !cloudState.newGeo) return null;
    // Keep rendering during fade-out; hide only when fully invisible and not animating
    if (!visible && !fadeRef.current.active) return null;

    return (
        <group ref={cloudGroupRef}>
            {cloudState.existingGeo && <>
                <mesh
                    geometry={cloudState.existingGeo}
                    material={cloudBackMaterial}
                    renderOrder={-101}
                    frustumCulled={false}
                />
                <mesh
                    geometry={cloudState.existingGeo}
                    material={cloudFrontMaterial}
                    renderOrder={-100}
                    frustumCulled={false}
                />
            </>}
            {cloudState.newGeo && <>
                <mesh
                    geometry={cloudState.newGeo}
                    material={newCloudBackMaterial}
                    renderOrder={-101}
                    frustumCulled={false}
                />
                <mesh
                    geometry={cloudState.newGeo}
                    material={newCloudFrontMaterial}
                    renderOrder={-100}
                    frustumCulled={false}
                />
            </>}
        </group>
    );
};
