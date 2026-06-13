import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { worldManager } from '../systems/WorldManager';
import { CHUNK_SIZE } from '../constants';
import { textureAtlasManager } from '../systems/textures/TextureAtlasManager';
import { CHUNK_LIGHTING_UNIFORMS } from './chunkLightingState';

// Use shared texture from manager
const getChunkTexture = () => textureAtlasManager.getTexture();

interface ChunkMeshProps {
  cx: number;
  cz: number;
  shadowsEnabled?: boolean;
  fadeInEnabled?: boolean;
  fadingOut?: boolean;
  onFadeOutComplete?: () => void;
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
    shader.uniforms.uSunlight = CHUNK_LIGHTING_UNIFORMS.uSunlight;
    shader.uniforms.uBrightness = CHUNK_LIGHTING_UNIFORMS.uBrightness;

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

// Shared singleton materials used by EVERY chunk that is not actively fading.
// Sharing matters at scale: with per-chunk clones the renderer re-uploaded the
// full uniform set on every draw call (material id changes between objects);
// with shared materials consecutive chunk draws skip that entirely, and we keep
// 3 materials alive instead of 3 per chunk (~21,000 at render distance 48).
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

interface FadeMaterials {
  opaque: THREE.MeshLambertMaterial;
  cutout: THREE.MeshLambertMaterial;
  transparent: THREE.MeshLambertMaterial;
}

const createFadeMaterials = (startOpacity: number): FadeMaterials => {
  const opaque = chunkMaterialSolid.clone();
  setupMaterial(opaque);
  const cutout = chunkMaterialCutout.clone();
  setupMaterial(cutout, { alphaWeightSample: true, binaryCutoutAlpha: true });
  const transparent = chunkMaterialTransparent.clone();
  setupMaterial(transparent, { minLightBase: 0.16 });

  opaque.transparent = true;
  opaque.depthWrite = false;
  opaque.opacity = startOpacity;
  cutout.transparent = true;
  cutout.depthWrite = false;
  cutout.opacity = startOpacity;
  transparent.transparent = true;
  transparent.depthWrite = false;
  transparent.opacity = 0.6 * startOpacity;
  return { opaque, cutout, transparent };
};

const disposeFadeMaterials = (mats: FadeMaterials) => {
  mats.opaque.dispose();
  mats.cutout.dispose();
  mats.transparent.dispose();
};

// ── Global fade ticker ──
// Previously every chunk registered its own useFrame callback to animate fades —
// ~7,200 per-frame callbacks at render distance 48, almost all idle. Instead,
// fading chunks register here and a single ticker (mounted once in App's Canvas)
// drives only the handful of active animations.
interface FadeAnimation {
  update(nowMs: number): void;
}

const activeFadeAnimations = new Set<FadeAnimation>();

export const ChunkFadeTicker: React.FC = () => {
  useFrame(() => {
    if (activeFadeAnimations.size === 0) return;
    const now = performance.now();
    // Copy: update() may unregister the animation.
    for (const anim of [...activeFadeAnimations]) anim.update(now);
  });
  return null;
};

const CHUNK_FADE_DURATION_MS = 400;
const CHUNK_FADE_RETRIGGER_GUARD_MS = 450;
const CHUNK_FAST_RELOAD_NO_FADE_MS = 800;

type Geometries = {
  opaque: THREE.BufferGeometry | null;
  cutout: THREE.BufferGeometry | null;
  transparent: THREE.BufferGeometry | null;
};

const EMPTY_GEOMETRIES: Geometries = { opaque: null, cutout: null, transparent: null };

// Release the CPU copy of attribute data once it has been uploaded to the GPU.
// Halves geometry memory (multi-GB at high render distances). Safe because chunk
// geometry is never mutated after build and block targeting uses voxel raycasting,
// not mesh raycasting.
function releaseArray(this: THREE.BufferAttribute) {
  (this as { array: unknown }).array = null;
}

const ChunkMeshImpl: React.FC<ChunkMeshProps> = ({ cx, cz, shadowsEnabled = false, fadeInEnabled = true, fadingOut = false, onFadeOutComplete }) => {
  const [geometries, setGeometries] = useState<Geometries>(EMPTY_GEOMETRIES);
  const [fadeMats, setFadeMats] = useState<FadeMaterials | null>(null);

  const geometriesRef = useRef(geometries);
  const fadeMatsRef = useRef<FadeMaterials | null>(null);
  const fadeAnimRef = useRef<FadeAnimation | null>(null);
  const fadeModeRef = useRef<'none' | 'in' | 'out'>('none');
  const fadeStartedAtRef = useRef(0);
  const fadingOutRef = useRef(fadingOut);
  const onFadeOutCompleteRef = useRef(onFadeOutComplete);
  const lastFadeStartMsRef = useRef(0);
  const lastClearedMsRef = useRef(-Infinity);
  const hasRenderedMeshRef = useRef(false);

  useEffect(() => {
    geometriesRef.current = geometries;
  }, [geometries]);

  useEffect(() => { fadingOutRef.current = fadingOut; }, [fadingOut]);
  useEffect(() => { onFadeOutCompleteRef.current = onFadeOutComplete; }, [onFadeOutComplete]);

  const disposeGeometries = (value: Geometries) => {
    value.opaque?.dispose();
    value.cutout?.dispose();
    value.transparent?.dispose();
  };

  const stopFade = useCallback(() => {
    if (fadeAnimRef.current) {
      activeFadeAnimations.delete(fadeAnimRef.current);
      fadeAnimRef.current = null;
    }
    fadeModeRef.current = 'none';
    if (fadeMatsRef.current) {
      disposeFadeMaterials(fadeMatsRef.current);
      fadeMatsRef.current = null;
      setFadeMats(null);
    }
  }, []);

  const startFade = useCallback((mode: 'in' | 'out') => {
    // Reuse existing clones if a fade is already running (e.g. in → out switch)
    let mats = fadeMatsRef.current;
    if (!mats) {
      mats = createFadeMaterials(mode === 'in' ? 0 : 1);
      fadeMatsRef.current = mats;
      setFadeMats(mats);
    }
    fadeModeRef.current = mode;
    fadeStartedAtRef.current = performance.now();
    if (mode === 'in') lastFadeStartMsRef.current = fadeStartedAtRef.current;

    if (!fadeAnimRef.current) {
      const anim: FadeAnimation = {
        update: (now: number) => {
          const m = fadeMatsRef.current;
          if (!m) return;
          const progress = THREE.MathUtils.clamp((now - fadeStartedAtRef.current) / CHUNK_FADE_DURATION_MS, 0, 1);
          const smooth = progress * progress * (3 - 2 * progress);
          const eased = fadeModeRef.current === 'out' ? 1.0 - smooth : smooth;

          m.opaque.opacity = eased;
          m.cutout.opacity = eased;
          m.transparent.opacity = 0.6 * eased;

          if (progress >= 1) {
            const wasOut = fadeModeRef.current === 'out';
            stopFade();
            if (wasOut) {
              disposeGeometries(geometriesRef.current);
              geometriesRef.current = EMPTY_GEOMETRIES;
              setGeometries(EMPTY_GEOMETRIES);
              onFadeOutCompleteRef.current?.();
            }
          }
        }
      };
      fadeAnimRef.current = anim;
      activeFadeAnimations.add(anim);
    }
  }, [stopFade]);

  // Prop-driven fade-out (chunk left the render set)
  useEffect(() => {
    if (fadingOut) {
      if (!fadeInEnabled) {
        onFadeOutCompleteRef.current?.();
        return;
      }
      const hasAny = !!(geometriesRef.current.opaque || geometriesRef.current.cutout || geometriesRef.current.transparent);
      if (!hasAny) {
        onFadeOutCompleteRef.current?.();
        return;
      }
      if (fadeModeRef.current !== 'out') {
        startFade('out');
      }
    } else if (fadeModeRef.current === 'out') {
      // Chunk returned to active — cancel fade-out, back to shared materials
      stopFade();
    }
  }, [fadingOut, fadeInEnabled, startFade, stopFade]);

  // Fade disabled — drop any running animation
  useEffect(() => {
    if (fadeInEnabled) return;
    stopFade();
  }, [fadeInEnabled, stopFade]);

  useEffect(() => {
    // Subscribe to mesh updates from the streaming world manager.
    const unsubscribe = worldManager.subscribeMesh(cx, cz, (data) => {
        if (!data) {
          if (fadeModeRef.current === 'out') return;
          if (fadingOutRef.current) return;
          const hasAny = !!(geometriesRef.current.opaque || geometriesRef.current.cutout || geometriesRef.current.transparent);
          if (fadeInEnabled && hasAny) {
            lastClearedMsRef.current = performance.now();
            startFade('out'); // geometry stays until fade-out completes
            return;
          }
          // Instant clear (no geometry or fade disabled)
          lastClearedMsRef.current = performance.now();
          stopFade();
          disposeGeometries(geometriesRef.current);
          geometriesRef.current = EMPTY_GEOMETRIES;
          setGeometries(EMPTY_GEOMETRIES);
          return;
        }

        // Prop-driven fade-out in progress: ignore fresh mesh data entirely and let the
        // fade finish so onFadeOutComplete always fires.
        if (fadingOutRef.current) return;

        const buildGeo = (buff: any) => {
            if (!buff || buff.positions.length === 0) return null;
            const geo = new THREE.BufferGeometry();
            // Buffers arrive transferred from the worker and are never mutated again —
            // wrap directly (no copy) and free the CPU side after GPU upload.
            geo.setAttribute('position', new THREE.BufferAttribute(buff.positions, 3).onUpload(releaseArray));
            geo.setAttribute('normal', new THREE.BufferAttribute(buff.normals, 3).onUpload(releaseArray));
            geo.setAttribute('uv', new THREE.BufferAttribute(buff.uvs, 2).onUpload(releaseArray));
            geo.setAttribute('color', new THREE.BufferAttribute(buff.colors, 3).onUpload(releaseArray));
            if (buff.indices && buff.indices.length > 0) {
                geo.setIndex(new THREE.BufferAttribute(buff.indices, 1).onUpload(releaseArray));
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
          // New data while a data-driven fade-out runs: cancel it, treat as clean start
          if (fadeModeRef.current === 'out') {
            stopFade();
            disposeGeometries(geometriesRef.current);
            geometriesRef.current = EMPTY_GEOMETRIES;
          }

          const hadAny = !!(geometriesRef.current.opaque || geometriesRef.current.cutout || geometriesRef.current.transparent);
          const hasAny = !!(next.opaque || next.cutout || next.transparent);

          if (hasAny && !hadAny) {
            const now = performance.now();
            const quickReload = hasRenderedMeshRef.current && (now - lastClearedMsRef.current) <= CHUNK_FAST_RELOAD_NO_FADE_MS;
            const retriggerGuarded = now - lastFadeStartMsRef.current < CHUNK_FADE_RETRIGGER_GUARD_MS;
            if (!quickReload && !retriggerGuarded) {
              startFade('in');
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
        stopFade();
        disposeGeometries(geometriesRef.current);
        geometriesRef.current = EMPTY_GEOMETRIES;
        hasRenderedMeshRef.current = false;
    };
  }, [cx, cz, fadeInEnabled, startFade, stopFade]);

  const matOpaque = fadeMats ? fadeMats.opaque : chunkMaterialSolid;
  const matCutout = fadeMats ? fadeMats.cutout : chunkMaterialCutout;
  const matTransparent = fadeMats ? fadeMats.transparent : chunkMaterialTransparent;

  return (
    // Static transforms: freeze matrices so Three doesn't recompose thousands of
    // chunk matrices every frame. onUpdate runs after props apply, baking the matrix once.
    <group
      position={[cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE]}
      matrixAutoUpdate={false}
      onUpdate={(g) => g.updateMatrix()}
    >
        {geometries.opaque && <mesh name="chunk" matrixAutoUpdate={false} geometry={geometries.opaque} material={matOpaque} castShadow={shadowsEnabled} receiveShadow={shadowsEnabled} />}
        {geometries.cutout && <mesh name="chunk" matrixAutoUpdate={false} geometry={geometries.cutout} material={matCutout} castShadow={shadowsEnabled} receiveShadow={false} />}
        {geometries.transparent && <mesh name="chunk" matrixAutoUpdate={false} geometry={geometries.transparent} material={matTransparent} castShadow={false} receiveShadow={false} />}
    </group>
  );
};

export const ChunkMesh = React.memo(
    ChunkMeshImpl,
    (prev, next) =>
        prev.cx === next.cx &&
        prev.cz === next.cz &&
        prev.shadowsEnabled === next.shadowsEnabled &&
        prev.fadeInEnabled === next.fadeInEnabled &&
        prev.fadingOut === next.fadingOut
);
