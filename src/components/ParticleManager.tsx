
import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BlockType } from '../types';
import { BLOCKS } from '../data/blocks';
import { worldManager } from '../systems/WorldManager';
import { getAtlasDimensions } from '../utils/textures';
import { resolveTexture } from '../systems/world/textureResolver';
import { globalSunlightValue } from './ChunkMesh';
import { textureAtlasManager } from '../systems/textures/TextureAtlasManager';

interface Particle {
    id: string;
    type: BlockType;
    position: [number, number, number];
    velocity: [number, number, number];
    life: number;
    maxLife: number;
    scale: number;
    uvRegion?: [number, number, number, number]; // [u, v, w, h] for pixel particles
}

// Shader injection for Particles
const setupParticleMaterial = (mat: THREE.MeshLambertMaterial, is2D: boolean) => {
    mat.onBeforeCompile = (shader) => {
        // Uniforms for lighting control
        shader.uniforms.uSunlight = { value: 1.0 };
        shader.uniforms.uBrightness = { value: 0.5 };
        
        // --- Vertex Shader ---
        let vs = shader.vertexShader;
        
        // Add instance color support
        vs = vs.replace(
            '#include <color_vertex>',
            `#include <color_vertex>
            #ifdef USE_INSTANCING_COLOR
                vColor = instanceColor;
            #endif`
        );

        if (is2D) {
            // Inject custom attribute for Atlas Region
            vs = `
                attribute vec4 aAtlasRegion;
                varying vec4 vAtlasRegion;
                ${vs}
            `.replace('#include <uv_vertex>', `
                #include <uv_vertex>
                vAtlasRegion = aAtlasRegion;
            `);
        }

        shader.vertexShader = vs;

        // --- Fragment Shader ---
        let fs = shader.fragmentShader;
        
        fs = `
            uniform float uSunlight;
            uniform float uBrightness;
            vec3 myTorchBaseColor;
            ${is2D ? 'varying vec4 vAtlasRegion;' : ''}
            ${fs}
        `;

        fs = fs.replace('#include <color_fragment>', '');

        if (is2D) {
            // Use custom UV mapping for pixels
            // vAtlasRegion = [u, v, w, h]
            fs = fs.replace(
                '#include <map_fragment>',
                `
                // Default to center if region is invalid (prevents stripes)
                vec4 region = vAtlasRegion;
                if (region.z <= 0.00001) region = vec4(0.0, 0.0, 0.0, 0.0);

                vec2 cellUv = region.xy + vMapUv * region.zw;
                vec4 sampledDiffuseColor = texture2D( map, cellUv );
                diffuseColor *= sampledDiffuseColor;
                `
            );
        } else {
            // Standard mapping
            fs = fs.replace(
                '#include <map_fragment>',
                `#ifdef USE_MAP
                    vec4 sampledDiffuseColor = texture2D( map, vMapUv );
                    diffuseColor *= sampledDiffuseColor;
                #endif`
            );
        }

        // Apply Lighting & Torch Glow
        fs = fs.replace(
            '#include <lights_fragment_end>',
            `
            myTorchBaseColor = diffuseColor.rgb;

            float minLight = 0.05 + (uBrightness * 0.25);
            float skyFactor = max(vColor.r * uSunlight, minLight);
            diffuseColor.rgb *= skyFactor;

            #include <lights_fragment_end>
            
            float torchIntensity = clamp(vColor.g, 0.0, 1.0);
            float torchGlow = pow(torchIntensity, 1.8);
            reflectedLight.directDiffuse += myTorchBaseColor * (torchGlow * 0.85);
            `
        );

        shader.fragmentShader = fs;
        mat.userData.shader = shader;
    };
    
    // Ensure uniqueness so three.js recompiles this specific variant
    mat.customProgramCacheKey = () => is2D ? 'particle_2d' : 'particle_3d';
};

const MAX_PARTICLES_PER_GROUP = 300;

// Helper to reliably identify 2D blocks across both Spawner and Renderer
const is2DBlock = (type: BlockType): boolean => {
    const def = BLOCKS[type];
    if (!def) return false;
    return !!def.isItem || 
           type === BlockType.TORCH || 
           type === BlockType.BED_ITEM ||
           type === BlockType.DEAD_BUSH ||
           type === BlockType.GRASS_PLANT ||
           type === BlockType.ROSE ||
           type === BlockType.DANDELION ||
           type === BlockType.DEBUG_CROSS ||
           type === BlockType.WHEAT_SEEDS ||
           type === BlockType.PINK_FLOWER ||
           type === BlockType.SAPLING ||
           type === BlockType.SPRUCE_SAPLING ||
           type === BlockType.BIRCH_SAPLING ||
           type === BlockType.CHERRY_SAPLING;
};

// Cache for scanning pixel data
const validPixelsCache: Record<number, [number, number, number, number][]> = {};

// Helper to pick random pixel region
const getPixelRegion = (type: BlockType): [number, number, number, number] => {
    // If we already scanned this block type, use cache
    if (validPixelsCache[type]) {
        const opts = validPixelsCache[type];
        return opts[Math.floor(Math.random() * opts.length)];
    }

    // Determine UV bounds of the item in the atlas from registry
    const { uvs } = resolveTexture(type, 'right', 0, 0, 0, 0);
    // uvs = [BL, BR, TR, TL] or similar. Find min/max.
    let uMin = 1, uMax = 0, vMin = 1, vMax = 0;
    for (let i = 0; i < 8; i+=2) {
       uMin = Math.min(uMin, uvs[i]);
       uMax = Math.max(uMax, uvs[i]);
       vMin = Math.min(vMin, uvs[i+1]);
       vMax = Math.max(vMax, uvs[i+1]);
    }
    
    const uvW = (uMax - uMin);
    const uvH = (vMax - vMin);
    // A single pixel width/height in UV space (assuming 16x16 block)
    const pxW = uvW / 16;
    const pxH = uvH / 16;
    
    // Inset UVs slightly (10%) to avoid bleeding
    const inset = pxW * 0.1; 

    // Try to populate cache by reading the atlas canvas
    try {
        const tex = textureAtlasManager.getTexture();
        const image = tex.image;
        
        if (image && (image instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas))) {
             const ctx = (image as any).getContext('2d');
             if (ctx) {
                 const { width, height } = getAtlasDimensions();
                 
                 // Convert UV bounds to Canvas Pixel coordinates
                 // Note: UV V=1 is Top, Canvas Y=0 is Top.
                 const x0 = Math.floor(uMin * width);
                 const y0 = Math.floor((1.0 - vMax) * height);
                 
                 // Read the 16x16 block
                 const idata = ctx.getImageData(x0, y0, 16, 16);
                 const valid: [number, number, number, number][] = [];
                 
                 for(let y=0; y<16; y++) {
                     for(let x=0; x<16; x++) {
                         // Check alpha
                         const alpha = idata.data[(y*16+x)*4 + 3];
                         if (alpha > 10) { 
                             const u = uMin + x * pxW + inset;
                             // Canvas Y goes down, UV V goes up. 
                             // y=0 (top) corresponds to vMax.
                             // The bottom of the pixel at y=0 is (vMax - 1*pxH).
                             // The top of the pixel at y=0 is vMax.
                             // We want the bottom-left corner of the pixel for UV start?
                             // Shader: cellUv = region.xy + ...
                             // So we need origin (u, v).
                             // If we assume origin is bottom-left of the pixel:
                             const v = vMax - (y + 1) * pxH + inset;
                             
                             valid.push([u, v, pxW - 2*inset, pxH - 2*inset]);
                         }
                     }
                 }
                 
                 if (valid.length > 0) {
                     validPixelsCache[type] = valid;
                     return valid[Math.floor(Math.random() * valid.length)];
                 }
             }
        }
    } catch {
        // console.warn("Failed to read particle pixels", e);
    }

    // Fallback: Pick a random pixel in the grid blindly
    const px = Math.floor(Math.random() * 10) + 3; // Stay central to avoid edges
    const py = Math.floor(Math.random() * 10) + 3;
    
    const u = uMin + px * pxW + inset;
    const v = vMin + py * pxH + inset; // vMin is bottom
    
    return [u, v, pxW - 2*inset, pxH - 2*inset];
};

const ParticleGroup: React.FC<{ type: BlockType, particles: Particle[], isPaused: boolean, brightness: number }> = ({ type, particles, isPaused, brightness }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const [texture, setTexture] = useState<THREE.Texture | null>(null);
    const colorScratch = useMemo(() => new THREE.Color(), []);

    useEffect(() => {
        setTexture(textureAtlasManager.getTexture());
    }, []);

    const is2D = is2DBlock(type);

    const geometry = useMemo(() => {
        if (is2D) {
            // Flat particle for pixels
            const geo = new THREE.PlaneGeometry(1, 1);
            // Allocate buffer for UV regions (u, v, w, h)
            const uvAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES_PER_GROUP * 4), 4);
            uvAttr.setUsage(THREE.DynamicDrawUsage);
            geo.setAttribute('aAtlasRegion', uvAttr);
            return geo;
        } else {
            // 3D Block debris
            const geo = new THREE.BoxGeometry(1, 1, 1); 
            const uvAttribute = geo.attributes.uv;
            
            const directions = ['right', 'left', 'top', 'bottom', 'front', 'back'] as const;
            const vectors = [[1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]];

            directions.forEach((dir, i) => {
                const vec = vectors[i];
                const { uvs } = resolveTexture(type, dir, vec[0], vec[1], vec[2], 0);
                
                const uMin = uvs[0];
                const uMax = uvs[2];
                const vMin = uvs[1];
                const vMax = uvs[5];
                
                const uW = uMax - uMin;
                const vH = vMax - vMin;
                
                // "Zoom in" to the texture to make it look like a fragment
                const crop = 0.4; 
                
                const offsetU = (i % 2) * 0.2;
                const offsetV = ((i >> 1) % 2) * 0.2;

                const cU0 = uMin + (uW * offsetU) + (uW * 0.1); 
                const cU1 = cU0 + (uW * crop);
                
                const cV0 = vMin + (vH * offsetV) + (vH * 0.1);
                const cV1 = cV0 + (vH * crop);

                const base = i * 4;
                uvAttribute.setXY(base + 0, cU0, cV1); // TL
                uvAttribute.setXY(base + 1, cU1, cV1); // TR
                uvAttribute.setXY(base + 2, cU0, cV0); // BL
                uvAttribute.setXY(base + 3, cU1, cV0); // BR
            });

            uvAttribute.needsUpdate = true;
            return geo;
        }
    }, [type, is2D]);
    
    const material = useMemo(() => {
        if (!texture) return null;
        const mat = new THREE.MeshLambertMaterial({ 
            map: texture, 
            transparent: true, 
            alphaTest: 0.1, 
            side: THREE.DoubleSide,
            vertexColors: true 
        });
        setupParticleMaterial(mat, is2D);
        return mat;
    }, [texture, is2D]);

    useFrame((_, _delta) => {
        if (isPaused || !meshRef.current || !material) return;
        
        if (material.userData.shader) {
            if (material.userData.shader.uniforms.uSunlight) {
                material.userData.shader.uniforms.uSunlight.value = globalSunlightValue;
            }
            if (material.userData.shader.uniforms.uBrightness) {
                material.userData.shader.uniforms.uBrightness.value = brightness;
            }
        }

        let i = 0;
        const regionAttr = is2D ? (meshRef.current.geometry.attributes.aAtlasRegion as THREE.InstancedBufferAttribute) : null;

        // Cap at Max
        const count = Math.min(particles.length, MAX_PARTICLES_PER_GROUP);

        for (let j = 0; j < count; j++) {
             const p = particles[j];
             
             dummy.position.set(p.position[0], p.position[1], p.position[2]);
             dummy.scale.setScalar(p.scale);
             
             // Rotate pixels randomly for confetti effect
             dummy.rotation.set(
                 p.id.charCodeAt(0) + p.life * 5, 
                 p.id.charCodeAt(1) + p.life * 5, 
                 p.id.charCodeAt(2) + p.life * 5
             );
             
             dummy.updateMatrix();
             meshRef.current!.setMatrixAt(i, dummy.matrix);
             
             // Update UV Region attribute if 2D
             if (regionAttr && p.uvRegion) {
                 regionAttr.setXYZW(i, p.uvRegion[0], p.uvRegion[1], p.uvRegion[2], p.uvRegion[3]);
             }

             const bx = Math.floor(p.position[0]);
             const by = Math.floor(p.position[1]); 
             const bz = Math.floor(p.position[2]);
             
             const light = worldManager.getLight(bx, by, bz);
             const r = light.sky / 15.0;
             const g = light.block / 15.0;
             
             colorScratch.setRGB(r, g, 1.0);
             meshRef.current!.setColorAt(i, colorScratch);
             i++;
        }
        
        meshRef.current.count = count;
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
        if (regionAttr) regionAttr.needsUpdate = true;
    });

    if (!material) return null;

    return (
        <instancedMesh ref={meshRef} args={[geometry, undefined, MAX_PARTICLES_PER_GROUP]} frustumCulled={false} material={material}>
        </instancedMesh>
    );
};

export const ParticleManager: React.FC<{ isPaused: boolean, brightness: number }> = ({ isPaused, brightness }) => {
    const particlesRef = useRef<Particle[]>([]);
    const [renderTrigger, setRenderTrigger] = useState(0);

    useEffect(() => {
        const unsub = worldManager.subscribeToParticles((type, x, y, z) => {
            const count = 12 + Math.floor(Math.random() * 12);
            const is2D = is2DBlock(type);

            for (let i = 0; i < count; i++) {
                // Unified scale for both 2D and 3D particles to ensure consistent look
                const scale = 0.05 + Math.random() * 0.07;

                // Precompute UV region for 2D particles
                const region = is2D ? getPixelRegion(type) : undefined;

                particlesRef.current.push({
                    id: Math.random().toString(),
                    type,
                    position: [
                        x + 0.2 + Math.random() * 0.6, 
                        y + 0.2 + Math.random() * 0.6, 
                        z + 0.2 + Math.random() * 0.6
                    ],
                    velocity: [
                        (Math.random() - 0.5) * 4,
                        Math.random() * 3 + 2, 
                        (Math.random() - 0.5) * 4
                    ],
                    life: 0.5 + Math.random() * 0.5,
                    maxLife: 1.0,
                    scale: scale,
                    uvRegion: region
                });
            }
            // Trigger render to ensure new groups are created if needed
            setRenderTrigger(prev => prev + 1);
        });
        return unsub;
    }, []);

    useFrame((_, delta) => {
        if (isPaused) return;
        const dt = Math.min(delta, 0.1);
        const GRAVITY = 24.0;
        
        let died = false;
        
        for (let i = particlesRef.current.length - 1; i >= 0; i--) {
            const p = particlesRef.current[i];
            
            p.life -= dt;
            if (p.life <= 0) {
                particlesRef.current.splice(i, 1);
                died = true;
                continue;
            }

            p.velocity[1] -= GRAVITY * dt;
            
            const nextX = p.position[0] + p.velocity[0] * dt;
            const nextY = p.position[1] + p.velocity[1] * dt;
            const nextZ = p.position[2] + p.velocity[2] * dt;
            
            const bx = Math.floor(nextX);
            const by = Math.floor(nextY);
            const bz = Math.floor(nextZ);
            const block = worldManager.getBlock(bx, by, bz, false);
            
            const def = BLOCKS[block];
            const isSolid = block !== BlockType.AIR && 
                            block !== BlockType.WATER && 
                            block !== BlockType.LAVA && 
                            (!def || !def.noCollision);

            if (isSolid) {
                if (p.velocity[1] < 0 && Math.abs(p.position[1] - (by + 1)) < 0.3) {
                    p.velocity[1] = -p.velocity[1] * 0.1; 
                    p.velocity[0] *= 0.6;
                    p.velocity[2] *= 0.6;
                    p.position[1] = by + 1.02;
                    if (Math.abs(p.velocity[1]) < 0.5) p.velocity[1] = 0;
                } else {
                    p.position[0] = nextX;
                    p.position[1] = nextY;
                    p.position[2] = nextZ;
                }
            } else {
                p.position[0] = nextX;
                p.position[1] = nextY;
                p.position[2] = nextZ;
            }
        }
        
        if (died) {
             setRenderTrigger(prev => prev + 1);
        }
    });

    const particlesByType = useMemo(() => {
        const groups: Record<number, Particle[]> = {};
        particlesRef.current.forEach(p => {
            if (!groups[p.type]) groups[p.type] = [];
            groups[p.type].push(p);
        });
        return groups;
    }, [renderTrigger]); 

    return (
        <group>
            {Object.keys(particlesByType).map(t => (
                <ParticleGroup 
                    key={t} 
                    type={Number(t)} 
                    particles={particlesByType[Number(t)]} 
                    isPaused={isPaused} 
                    brightness={brightness} 
                />
            ))}
        </group>
    );
};
