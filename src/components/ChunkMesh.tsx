import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { worldManager } from '../systems/WorldManager';
import { CHUNK_SIZE } from '../constants';
import { textureAtlasManager } from '../systems/textures/TextureAtlasManager';

// Use shared texture from manager
const getChunkTexture = () => textureAtlasManager.getTexture();

// Export global lighting values for entities/items
export let globalSunlightValue = 1.0;
export let globalBrightnessValue = 0.5;

/**
 * Shared uniforms object for all chunk materials.
 * Points all shader instances to the same memory location for lightning-fast global updates.
 */
const CHUNK_UNIFORMS = {
  uSunlight: { value: 1.0 },
  uBrightness: { value: 0.5 }
};

interface ChunkMeshProps {
  cx: number;
  cz: number;
  detailLevel?: 'full';
  shadowsEnabled?: boolean;
  fadeInEnabled?: boolean;
}

const setupMaterial = (
  mat: THREE.MeshLambertMaterial,
  options?: { alphaWeightSample?: boolean; binaryCutoutAlpha?: boolean; minLightBase?: number }
) => {
  const alphaWeightSample = options?.alphaWeightSample ?? false;
  const binaryCutoutAlpha = options?.binaryCutoutAlpha ?? false;
  const minLightBase = options?.minLightBase ?? 0.05;

  mat.onBeforeCompile = (shader) => {
    // Link material uniforms directly to the global shared objects
    shader.uniforms.uSunlight = CHUNK_UNIFORMS.uSunlight;
    shader.uniforms.uBrightness = CHUNK_UNIFORMS.uBrightness;

    shader.fragmentShader = `
uniform float uSunlight;
uniform float uBrightness;
vec3 myTorchBaseColor;
${shader.fragmentShader}
      `;

    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '');

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  ${binaryCutoutAlpha ? 'sampledDiffuseColor.a = sampledDiffuseColor.a >= 0.5 ? 1.0 : 0.0;' : ''}
  ${alphaWeightSample ? 'sampledDiffuseColor.rgb *= sampledDiffuseColor.a;' : ''}
  diffuseColor *= sampledDiffuseColor;
#endif

myTorchBaseColor = diffuseColor.rgb;

float minLight = ${minLightBase.toFixed(3)} + (uBrightness * 0.25);

// vColor.r carries skylight in [0..1]
float skyFactor = max(vColor.r * uSunlight, minLight); 
diffuseColor.rgb *= skyFactor;
`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>

// vColor.g carries block light (torch) in [0..1]
float torchIntensity = clamp(vColor.g, 0.0, 1.0);

float torchGlow = pow(torchIntensity, 1.8);

reflectedLight.directDiffuse += myTorchBaseColor * (torchGlow * 0.85);
`
    );
  };

  mat.needsUpdate = true;
};

// Singleton materials initialized with manager's shared texture
const chunkMaterialSolid = new THREE.MeshLambertMaterial({ 
    map: getChunkTexture(), 
    side: THREE.FrontSide,
    vertexColors: true 
});

const chunkMaterialCutout = new THREE.MeshLambertMaterial({ 
    map: getChunkTexture(), 
    transparent: false, 
    alphaTest: 0.5,
  side: THREE.DoubleSide,
    vertexColors: true 
});

const chunkMaterialTransparent = new THREE.MeshLambertMaterial({ 
    map: getChunkTexture(), 
    transparent: true, 
    opacity: 0.6, 
    side: THREE.DoubleSide,
    depthWrite: false,
    vertexColors: true 
});

setupMaterial(chunkMaterialSolid);
setupMaterial(chunkMaterialCutout, { alphaWeightSample: true, binaryCutoutAlpha: true });
setupMaterial(chunkMaterialTransparent, { minLightBase: 0.16 });

export const updateChunkMaterials = (sunlight: number, brightness: number = 0.5) => {
  globalSunlightValue = sunlight;
  globalBrightnessValue = brightness;
  
  // Update the single shared uniform source. 
  // All materials referencing these uniforms will update instantly in the next draw call.
  CHUNK_UNIFORMS.uSunlight.value = sunlight;
  CHUNK_UNIFORMS.uBrightness.value = brightness;
};

export const ChunkMesh: React.FC<ChunkMeshProps> = ({ cx, cz, shadowsEnabled = false, fadeInEnabled = true }) => {
  const [geometries, setGeometries] = useState<{ 
      opaque: THREE.BufferGeometry | null, 
      cutout: THREE.BufferGeometry | null,
      transparent: THREE.BufferGeometry | null 
  }>({ opaque: null, cutout: null, transparent: null });
  const hideTransparent = false;
  const geometriesRef = useRef(geometries);
  const fadeStartedAtRef = useRef(0);
  const fadeActiveRef = useRef(false);
  const lastFadeStartMsRef = useRef(0);
  const lastClearedMsRef = useRef(-Infinity);
  const hasRenderedMeshRef = useRef(false);

  const CHUNK_FADE_DURATION_SEC = 0.4;
  const CHUNK_FADE_RETRIGGER_GUARD_MS = 450;
  const CHUNK_FAST_RELOAD_NO_FADE_MS = 800;

  const materialOpaque = useMemo(() => {
    const mat = chunkMaterialSolid.clone();
    setupMaterial(mat);
    return mat;
  }, []);

  const materialCutout = useMemo(() => {
    const mat = chunkMaterialCutout.clone();
    setupMaterial(mat, { alphaWeightSample: true, binaryCutoutAlpha: true });
    return mat;
  }, []);

  const materialTransparent = useMemo(() => {
    const mat = chunkMaterialTransparent.clone();
    setupMaterial(mat, { minLightBase: 0.16 });
    return mat;
  }, []);

  const disposeGeometries = (value: typeof geometriesRef.current) => {
    value.opaque?.dispose();
    value.cutout?.dispose();
    value.transparent?.dispose();
  };

  useEffect(() => {
    geometriesRef.current = geometries;
  }, [geometries]);

  useEffect(() => {
    return () => {
      materialOpaque.dispose();
      materialCutout.dispose();
      materialTransparent.dispose();
    };
  }, [materialOpaque, materialCutout, materialTransparent]);

  useEffect(() => {
    if (fadeInEnabled) return;
    fadeActiveRef.current = false;
    materialOpaque.transparent = false;
    materialOpaque.depthWrite = true;
    materialOpaque.opacity = 1;

    materialCutout.transparent = false;
    materialCutout.depthWrite = true;
    materialCutout.opacity = 1;

    materialTransparent.transparent = true;
    materialTransparent.depthWrite = false;
    materialTransparent.opacity = 0.6;
  }, [fadeInEnabled, materialOpaque, materialCutout, materialTransparent]);

  const applyFinalMaterialState = () => {
    fadeActiveRef.current = false;

    materialOpaque.transparent = false;
    materialOpaque.depthWrite = true;
    materialOpaque.opacity = 1;

    materialCutout.transparent = false;
    materialCutout.depthWrite = true;
    materialCutout.opacity = 1;

    materialTransparent.transparent = true;
    materialTransparent.depthWrite = false;
    materialTransparent.opacity = 0.6;
  };

  useEffect(() => {
    // Subscribe to Mesh updates from the new Streaming system
    const unsubscribe = worldManager.subscribeMesh(cx, cz, (data) => {
        if (!data) {
          lastClearedMsRef.current = performance.now();
          disposeGeometries(geometriesRef.current);
          const cleared = { opaque: null, cutout: null, transparent: null };
          geometriesRef.current = cleared;
          setGeometries(cleared);
            return;
        }

        const buildGeo = (buff: any) => {
            if (!buff || buff.positions.length === 0) return null;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(buff.positions, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(buff.normals, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(buff.uvs, 2));
            geo.setAttribute('color', new THREE.Float32BufferAttribute(buff.colors, 3)); 
            if (buff.indices && buff.indices.length > 0) {
                geo.setIndex(new THREE.BufferAttribute(buff.indices, 1));
            }
            geo.computeBoundingSphere();
            return geo;
        };
        
        const next = {
          opaque: buildGeo(data.opaque),
          cutout: buildGeo(data.cutout),
          transparent: buildGeo(data.transparent)
        };

        if (fadeInEnabled) {
          const hadAny = !!(geometriesRef.current.opaque || geometriesRef.current.cutout || geometriesRef.current.transparent);
          const hasAny = !!(next.opaque || next.cutout || next.transparent);

          if (hasAny && !hadAny) {
            const now = performance.now();
            const quickReload = hasRenderedMeshRef.current && (now - lastClearedMsRef.current) <= CHUNK_FAST_RELOAD_NO_FADE_MS;
            if (now - lastFadeStartMsRef.current < CHUNK_FADE_RETRIGGER_GUARD_MS) {
              disposeGeometries(geometriesRef.current);
              geometriesRef.current = next;
              setGeometries(next);
              hasRenderedMeshRef.current = true;
              return;
            }

            if (quickReload) {
              applyFinalMaterialState();
            } else {
              lastFadeStartMsRef.current = now;
              fadeActiveRef.current = true;
              fadeStartedAtRef.current = now;

              materialOpaque.transparent = true;
              materialOpaque.depthWrite = false;
              materialOpaque.opacity = 0;

              materialCutout.transparent = true;
              materialCutout.depthWrite = false;
              materialCutout.opacity = 0;

              materialTransparent.transparent = true;
              materialTransparent.depthWrite = false;
              materialTransparent.opacity = 0;
            }
          }
        }

        disposeGeometries(geometriesRef.current);
        geometriesRef.current = next;
        setGeometries(next);
        if (next.opaque || next.cutout || next.transparent) {
          hasRenderedMeshRef.current = true;
        }
    });

    return () => { 
        unsubscribe(); 
        disposeGeometries(geometriesRef.current);
        geometriesRef.current = { opaque: null, cutout: null, transparent: null };
        fadeActiveRef.current = false;
        hasRenderedMeshRef.current = false;
    };
        }, [cx, cz, fadeInEnabled, materialOpaque, materialCutout, materialTransparent]);

  useFrame(() => {
    if (!fadeInEnabled) return;

    if (fadeActiveRef.current) {
      const elapsedSec = (performance.now() - fadeStartedAtRef.current) / 1000;
      const progress = THREE.MathUtils.clamp(elapsedSec / CHUNK_FADE_DURATION_SEC, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);

      materialOpaque.opacity = eased;
      materialCutout.opacity = eased;
      materialTransparent.opacity = 0.6 * eased;

      if (progress >= 1) {
        fadeActiveRef.current = false;
        materialOpaque.transparent = false;
        materialOpaque.depthWrite = true;
        materialOpaque.opacity = 1;

        materialCutout.transparent = false;
        materialCutout.depthWrite = true;
        materialCutout.opacity = 1;

        materialTransparent.transparent = true;
        materialTransparent.depthWrite = false;
        materialTransparent.opacity = 0.6;
      }
    }
  });

  return (
    <group position={[cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE]}>
        {geometries.opaque && <mesh name="chunk" geometry={geometries.opaque} material={materialOpaque} castShadow={shadowsEnabled} receiveShadow={shadowsEnabled} />}
        {geometries.cutout && <mesh name="chunk" geometry={geometries.cutout} material={materialCutout} castShadow={shadowsEnabled} receiveShadow={false} />}
        {!hideTransparent && geometries.transparent && <mesh name="chunk" geometry={geometries.transparent} material={materialTransparent} castShadow={false} receiveShadow={false} />}
    </group>
  );
};