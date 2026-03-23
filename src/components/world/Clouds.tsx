
import React, { useRef, useEffect, useState, useLayoutEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GlobalNoise } from '../../utils/noise';
import { CHUNK_SIZE } from '../../constants';
import { registerCloudHandlers } from './cloudState';

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

// Separate materials for tiles leaving the view that fade out independently.
const leavingCloudBackMaterial = new THREE.MeshLambertMaterial({
    ...cloudMaterialSettings,
    side: THREE.BackSide
});

const leavingCloudFrontMaterial = new THREE.MeshLambertMaterial({
    ...cloudMaterialSettings,
    side: THREE.FrontSide
});

// Tracks the natural (day/night-adjusted) opacity before any fade multiplier
let cloudNaturalOpacity = 0.8;
// Animated 0→1 on first cloud appearance; stays at 1 when not fading
let cloudFadeMultiplier = 1.0;
// Animated 0→1 for newly-revealed cloud tiles; stays at 1 otherwise
let newCloudFadeMultiplier = 1.0;
// Animated 1→0 for tiles leaving the view; stays at 0 when nothing is leaving
let leavingCloudMultiplier = 0.0;

const updateCloudColor = (dayFactor: number) => {
    const nightColor = new THREE.Color(0x1a1a2e).multiplyScalar(0.4);
    const dayColor = new THREE.Color(0xFFFFFF);
    cloudBackMaterial.color.lerpColors(nightColor, dayColor, dayFactor);
    cloudFrontMaterial.color.copy(cloudBackMaterial.color);
    newCloudBackMaterial.color.copy(cloudBackMaterial.color);
    newCloudFrontMaterial.color.copy(cloudBackMaterial.color);
    leavingCloudBackMaterial.color.copy(cloudBackMaterial.color);
    leavingCloudFrontMaterial.color.copy(cloudBackMaterial.color);
    // Slight opacity adjustment based on time; respect the current fade multipliers
    cloudNaturalOpacity = 0.6 + (0.2 * dayFactor);
    cloudBackMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier;
    cloudFrontMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier;
    newCloudBackMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier * newCloudFadeMultiplier;
    newCloudFrontMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier * newCloudFadeMultiplier;
    leavingCloudBackMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier * leavingCloudMultiplier;
    leavingCloudFrontMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier * leavingCloudMultiplier;
};

// Event system for manual overrides
let onTextureUpdate: ((url: string) => void) | null = null;

const setCloudTexture = (url: string) => {
    if (onTextureUpdate) onTextureUpdate(url);
};

registerCloudHandlers({ setTexture: setCloudTexture, updateColor: updateCloudColor });

export const Clouds: React.FC<{ isPaused: boolean, renderDistance: number, fadeInEnabled?: boolean, visible?: boolean }> = ({ isPaused, renderDistance, fadeInEnabled = true, visible = true }) => {
    const { camera } = useThree();
    const [cloudData, setCloudData] = useState<{ width: number, height: number, data: Uint8Array } | null>(null);

    // Cloud state bundles all three geometry sets with their common origin (u, v).
    // existingGeo: cloud tiles already in view (stable full opacity).
    // newGeo: newly-revealed cloud tiles at the edges (fade in independently).
    // leavingGeo: tiles that have just left the view (fade out independently).
    const [cloudState, setCloudState] = useState<{
        existingGeo: THREE.BufferGeometry | null,
        newGeo: THREE.BufferGeometry | null,
        leavingGeo: THREE.BufferGeometry | null,
        u: number, v: number
    }>({ existingGeo: null, newGeo: null, leavingGeo: null, u: 0, v: 0 });

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

    // Fade state for newly-revealed tiles only (0→1)
    const newTileFadeRef = useRef({
        active: false,
        startMs: 0,
        duration: 0.8
    });

    // Fade state for tiles leaving the view (1→0)
    const leavingTileFadeRef = useRef({
        active: false,
        startMs: 0,
        duration: 0.5
    });

    // Pending per-tile fade setup deferred to useLayoutEffect so it applies only
    // after the new geometry is committed — preventing the old geometry from
    // flashing at the wrong opacity for one frame.
    const pendingFadeSetupRef = useRef<{
        setupNewTileFade: boolean;
        setupLeavingTileFade: boolean;
        clearLeavingTileFade: boolean;
    } | null>(null);

    const prevVisibleRef = useRef(visible);

    // Initialize multipliers on mount
    const didInitRef = useRef(false);
    if (!didInitRef.current) {
        didInitRef.current = true;
        if (visible) {
            cloudFadeMultiplier = 1.0; // Start at full opacity, no global fade
            cloudBackMaterial.opacity = cloudNaturalOpacity;
            cloudFrontMaterial.opacity = cloudNaturalOpacity;
            newCloudFadeMultiplier = 1.0;
            newCloudBackMaterial.opacity = cloudNaturalOpacity;
            newCloudFrontMaterial.opacity = cloudNaturalOpacity;
            leavingCloudMultiplier = 0.0;
            leavingCloudBackMaterial.opacity = 0;
            leavingCloudFrontMaterial.opacity = 0;
        }
    }

    // Tracks the grid position currently requested/processing
    const lastRequestedGridPos = useRef({ u: -99999, v: -99999 });

    // Tracks the grid position currently RENDERED (committed to the mesh)
    const renderedGridPosRef = useRef({ u: 0, v: 0 });

    // Tracks the exact rendered bounds so we can identify new and leaving tiles on the next rebuild.
    const renderedBoundsRef = useRef<{ minU: number; maxU: number; minV: number; maxV: number } | null>(null);

    // Sync the ref with state immediately after render commit
    useLayoutEffect(() => {
        if (cloudState.existingGeo || cloudState.newGeo) {
            renderedGridPosRef.current = { u: cloudState.u, v: cloudState.v };
        }

        // Apply deferred per-tile fade setup now that the new geometry is in the scene.
        // Doing this here (post-commit) instead of in rebuildGeometry prevents the
        // still-rendered old geometry from flashing at the wrong opacity for one frame.
        const pending = pendingFadeSetupRef.current;
        if (pending) {
            pendingFadeSetupRef.current = null;
            if (pending.setupNewTileFade) {
                newCloudFadeMultiplier = 0;
                newCloudBackMaterial.opacity = 0;
                newCloudFrontMaterial.opacity = 0;
                const ntf = newTileFadeRef.current;
                ntf.active = true;
                ntf.startMs = performance.now();
                ntf.duration = 0.8;
            }
            if (pending.setupLeavingTileFade) {
                leavingCloudMultiplier = 1.0;
                leavingCloudBackMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier;
                leavingCloudFrontMaterial.opacity = cloudNaturalOpacity * cloudFadeMultiplier;
                const ltf = leavingTileFadeRef.current;
                ltf.active = true;
                ltf.startMs = performance.now();
                ltf.duration = 0.5;
            } else if (pending.clearLeavingTileFade) {
                leavingCloudMultiplier = 0.0;
                leavingCloudBackMaterial.opacity = 0;
                leavingCloudFrontMaterial.opacity = 0;
                leavingTileFadeRef.current.active = false;
            }
        }

        // Cleanup old geometry when state changes
        return () => {
            cloudState.existingGeo?.dispose();
            cloudState.newGeo?.dispose();
            cloudState.leavingGeo?.dispose();
        };
    }, [cloudState]);

    const generateProceduralClouds = useCallback(() => {
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
    }, []);

    const processImage = useCallback((img: HTMLImageElement) => {
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
    }, [generateProceduralClouds]);

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
    }, [generateProceduralClouds, processImage]);

    // 2. Force Rebuild on Settings Change
    useEffect(() => {
        lastRequestedGridPos.current = { u: -99999, v: -99999 };
        renderedBoundsRef.current = null;
    }, [renderDistance, cloudData]);

    // 3. Handle visibility changes; only control per-tile fades
    useEffect(() => {
        const wasVisible = prevVisibleRef.current;
        prevVisibleRef.current = visible;

        // Only act on actual transitions, not initial mount
        if (visible === wasVisible) return;

        if (visible) {
            // Became visible (was hidden).
            // Cancel per-tile fades
            newTileFadeRef.current.active = false;
            leavingTileFadeRef.current.active = false;
            newCloudFadeMultiplier = 1.0;
            leavingCloudMultiplier = 0.0;

            // Force a geometry rebuild so clouds appear at current position
            lastRequestedGridPos.current = { u: -99999, v: -99999 };
            cloudFadeMultiplier = 1.0;
            cloudBackMaterial.opacity = cloudNaturalOpacity;
            cloudFrontMaterial.opacity = cloudNaturalOpacity;
            newCloudBackMaterial.opacity = cloudNaturalOpacity;
            newCloudFrontMaterial.opacity = cloudNaturalOpacity;
            leavingCloudBackMaterial.opacity = 0;
            leavingCloudFrontMaterial.opacity = 0;
        } else {
            // Became hidden (was visible).
            // Cancel per-tile fades and hide immediately
            newTileFadeRef.current.active = false;
            leavingTileFadeRef.current.active = false;
            cloudFadeMultiplier = 0;
            cloudBackMaterial.opacity = 0;
            cloudFrontMaterial.opacity = 0;
            newCloudFadeMultiplier = 1.0;
            newCloudBackMaterial.opacity = 0;
            newCloudFrontMaterial.opacity = 0;
            leavingCloudMultiplier = 0.0;
            leavingCloudBackMaterial.opacity = 0;
            leavingCloudFrontMaterial.opacity = 0;
        }
    }, [visible]);

    // 4. Per-tile fades are independent of fadeInEnabled; only control visibility state
    useEffect(() => {
        if (!visible) {
            leavingCloudBackMaterial.opacity = 0;
            leavingCloudFrontMaterial.opacity = 0;
        }
    }, [visible]);

    // Helper: build a BufferGeometry from pre-filled vertex/normal/index arrays.
    const buildGeo = (verts: number[], norms: number[], idxs: number[]): THREE.BufferGeometry => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
        geo.setIndex(idxs);
        geo.computeBoundingSphere();
        return geo;
    };

    const rebuildGeometry = (centerU: number, centerV: number) => {
        if (!cloudData) return;

        const { width, height, data } = cloudData;

        // Scale coverage based on 2x Render Distance
        const viewDist = (renderDistance * 2) * CHUNK_SIZE;
        const radius = Math.ceil(viewDist / CLOUD_SCALE) + 1; // +1 buffer

        const minU = centerU - radius;
        const maxU = centerU + radius;
        const minV = centerV - radius;
        const maxV = centerV + radius;

        // Capture previous bounds, then record the new bounds for the next rebuild.
        const prevBounds = renderedBoundsRef.current;
        renderedBoundsRef.current = { minU, maxU, minV, maxV };

        const h = CLOUD_HEIGHT;

        // Vertex/index buffers for each geometry category.
        const existingVerts: number[] = [], existingNorms: number[] = [], existingIdxs: number[] = [];
        const newVerts: number[] = [], newNorms: number[] = [], newIdxs: number[] = [];
        const leavingVerts: number[] = [], leavingNorms: number[] = [], leavingIdxs: number[] = [];
        let existingVC = 0, newVC = 0, leavingVC = 0;

        const pushExisting = (
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

        const pushNew = (
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

        const pushLeaving = (
            x1: number, y1: number, z1: number,
            x2: number, y2: number, z2: number,
            x3: number, y3: number, z3: number,
            x4: number, y4: number, z4: number,
            nx: number, ny: number, nz: number
        ) => {
            leavingVerts.push(x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4);
            leavingNorms.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
            leavingIdxs.push(leavingVC, leavingVC + 1, leavingVC + 2, leavingVC, leavingVC + 2, leavingVC + 3);
            leavingVC += 4;
        };

        // --- Pass 1: Build existing + new tiles (tiles in the NEW bounds) ---
        for (let u = minU; u <= maxU; u++) {
            for (let v = minV; v <= maxV; v++) {
                const du = ((u % width) + width) % width;
                const dv = ((v % height) + height) % height;
                if (data[dv * width + du] === 0) continue;

                // Local coords relative to the centerU/V origin
                const lx = (u - centerU) * CLOUD_SCALE;
                const lz = (v - centerV) * CLOUD_SCALE;
                const x0 = lx, x1 = lx + CLOUD_SCALE;
                const y0 = 0, y1 = h;
                const z0 = lz, z1 = lz + CLOUD_SCALE;

                // Classify by whether the tile was within the previous rendered bounds.
                // (Tiles at the old edges were rendered before and should stay stable.)
                // On first load, all tiles are "existing" (no previous bounds).
                const isExisting = prevBounds === null || (
                    u >= prevBounds.minU && u <= prevBounds.maxU &&
                    v >= prevBounds.minV && v <= prevBounds.maxV
                );
                const push = isExisting ? pushExisting : pushNew;

                // Top (Y+)
                push(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0);
                // Bottom (Y-)
                push(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0);

                // Right (X+)
                if (u === maxU) {
                    push(x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0, -1, 0, 0);
                } else if (data[dv * width + ((du + 1) % width)] === 0) {
                    push(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0);
                }

                // Left (X-)
                if (u === minU) {
                    push(x0, y0, z1, x0, y0, z0, x0, y1, z0, x0, y1, z1, 1, 0, 0);
                } else if (data[dv * width + ((du - 1 + width) % width)] === 0) {
                    push(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0);
                }

                // Front (Z+)
                if (v === maxV) {
                    push(x1, y0, z1, x0, y0, z1, x0, y1, z1, x1, y1, z1, 0, 0, -1);
                } else if (data[((dv + 1) % height) * width + du] === 0) {
                    push(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1);
                }

                // Back (Z-)
                if (v === minV) {
                    push(x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, 0, 0, 1);
                } else if (data[((dv - 1 + height) % height) * width + du] === 0) {
                    push(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1);
                }
            }
        }

        // --- Pass 2: Build leaving tiles (in prevBounds but NOT in the new bounds) ---
        if (prevBounds !== null && visible && !fadeRef.current.isOut) {
            // Iterate only the regions of prevBounds that fall outside the new bounds.
            for (let u = prevBounds.minU; u <= prevBounds.maxU; u++) {
                for (let v = prevBounds.minV; v <= prevBounds.maxV; v++) {
                    // Skip tiles that are still in the new bounds (they're in existingGeo)
                    if (u >= minU && u <= maxU && v >= minV && v <= maxV) continue;

                    const du = ((u % width) + width) % width;
                    const dv = ((v % height) + height) % height;
                    if (data[dv * width + du] === 0) continue;

                    // Local coords relative to the NEW centerU/V origin
                    const lx = (u - centerU) * CLOUD_SCALE;
                    const lz = (v - centerV) * CLOUD_SCALE;
                    const x0 = lx, x1 = lx + CLOUD_SCALE;
                    const y0 = 0, y1 = h;
                    const z0 = lz, z1 = lz + CLOUD_SCALE;

                    // Top (Y+)
                    pushLeaving(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0);
                    // Bottom (Y-)
                    pushLeaving(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0);

                    // Sides — no boundary caps for leaving tiles
                    if (data[dv * width + ((du + 1) % width)] === 0) {
                        pushLeaving(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0);
                    }
                    if (data[dv * width + ((du - 1 + width) % width)] === 0) {
                        pushLeaving(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0);
                    }
                    if (data[((dv + 1) % height) * width + du] === 0) {
                        pushLeaving(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1);
                    }
                    if (data[((dv - 1 + height) % height) * width + du] === 0) {
                        pushLeaving(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1);
                    }
                }
            }
        }

        // Build geometry objects from the filled buffers.
        const existingGeo = existingVerts.length > 0 ? buildGeo(existingVerts, existingNorms, existingIdxs) : null;
        const newGeo = newVerts.length > 0 ? buildGeo(newVerts, newNorms, newIdxs) : null;
        const leavingGeo = leavingVerts.length > 0 ? buildGeo(leavingVerts, leavingNorms, leavingIdxs) : null;

        if (!existingGeo && !newGeo && !leavingGeo) {
            setCloudState({ existingGeo: null, newGeo: null, leavingGeo: null, u: centerU, v: centerV });
            return;
        }

        // Defer per-tile fade setup to useLayoutEffect so it only takes effect after
        // the new geometry is committed.
        const setupNewTileFade = !!(newGeo && visible && fadeInEnabled);
        const setupLeavingTileFade = !!(leavingGeo && visible && fadeInEnabled);
        pendingFadeSetupRef.current = {
            setupNewTileFade,
            setupLeavingTileFade,
            clearLeavingTileFade: !setupLeavingTileFade,
        };

        // Update State
        setCloudState({ existingGeo, newGeo, leavingGeo, u: centerU, v: centerV });
    };

    useFrame((_, delta) => {
        // New-tile fade animation (0→1, only newly-revealed tiles)
        const ntf = newTileFadeRef.current;
        if (ntf.active) {
            const elapsed = (performance.now() - ntf.startMs) / 1000;
            const progress = THREE.MathUtils.clamp(elapsed / ntf.duration, 0, 1);
            const eased = progress * progress * (3 - 2 * progress);
            newCloudFadeMultiplier = eased;
            newCloudBackMaterial.opacity = cloudNaturalOpacity * eased;
            newCloudFrontMaterial.opacity = cloudNaturalOpacity * eased;

            if (progress >= 1) {
                ntf.active = false;
                newCloudFadeMultiplier = 1.0;
                newCloudBackMaterial.opacity = cloudNaturalOpacity;
                newCloudFrontMaterial.opacity = cloudNaturalOpacity;
            }
        }

        // Leaving-tile fade animation (1→0, tiles going out of range)
        const ltf = leavingTileFadeRef.current;
        if (ltf.active) {
            const elapsed = (performance.now() - ltf.startMs) / 1000;
            const progress = THREE.MathUtils.clamp(elapsed / ltf.duration, 0, 1);
            const eased = progress * progress * (3 - 2 * progress);
            leavingCloudMultiplier = 1.0 - eased;
            leavingCloudBackMaterial.opacity = cloudNaturalOpacity * leavingCloudMultiplier;
            leavingCloudFrontMaterial.opacity = cloudNaturalOpacity * leavingCloudMultiplier;

            if (progress >= 1) {
                ltf.active = false;
                leavingCloudMultiplier = 0.0;
                leavingCloudBackMaterial.opacity = 0;
                leavingCloudFrontMaterial.opacity = 0;
                // Clear the leaving geometry now that it has fully faded out.
                setCloudState(prev => {
                    prev.leavingGeo?.dispose();
                    return { ...prev, leavingGeo: null };
                });
            }
        }

        // Skip movement/rebuild when fully hidden
        if (!visible || isPaused || !cloudData) return;

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

    const anyGeo = cloudState.existingGeo || cloudState.newGeo || cloudState.leavingGeo;
    if (!anyGeo) return null;
    // Hide when not visible and not animating per-tile fades
    if (!visible && !newTileFadeRef.current.active && !leavingTileFadeRef.current.active) return null;

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
            {cloudState.leavingGeo && <>
                <mesh
                    geometry={cloudState.leavingGeo}
                    material={leavingCloudBackMaterial}
                    renderOrder={-101}
                    frustumCulled={false}
                />
                <mesh
                    geometry={cloudState.leavingGeo}
                    material={leavingCloudFrontMaterial}
                    renderOrder={-100}
                    frustumCulled={false}
                />
            </>}
        </group>
    );
};
