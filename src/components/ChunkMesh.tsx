import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, startTransition } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { worldManager } from '../systems/WorldManager';
import { CHUNK_SIZE } from '../constants';
import { textureAtlasManager } from '../systems/textures/TextureAtlasManager';
import { regionBatcher } from '../systems/world/regionBatcher';
import { chunkView } from '../systems/world/chunkView';
import {
  getVoxelFadeMaterials,
  createCutoutDepthMaterial,
  createVoxelMaterials,
  type VoxelMaterials,
} from '../systems/graphics/materials/voxelMaterial';

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

// Shared singleton materials used by EVERY chunk that is not actively fading.
// Sharing matters at scale: with per-chunk clones the renderer re-uploaded the
// full uniform set on every draw call (material id changes between objects);
// with shared materials consecutive chunk draws skip that entirely, and we keep
// 3 materials alive instead of 3 per chunk (~21,000 at render distance 48).
// The voxel lighting itself lives in systems/graphics/materials/voxelMaterial.ts.
const sharedMaterials = createVoxelMaterials(getChunkTexture());
// Leaves and plants cast (and now receive) shadows through this, swaying with the wind.
const cutoutDepthMaterial = createCutoutDepthMaterial(getChunkTexture());

// ── Global fade ticker ──
// Previously every chunk registered its own useFrame callback to animate fades :
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

// Settled chunks draw through one merged mesh per region (regionBatcher.ts),
// which cuts the draw calls a frame by about an order of magnitude. This owns
// the region meshes' root and rebuilds at most one region a frame.
export const ChunkRegionBatches: React.FC<{ shadowsEnabled: boolean }> = ({ shadowsEnabled }) => {
  const rootRef = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    regionBatcher.setShadows(shadowsEnabled);
  }, [shadowsEnabled]);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    regionBatcher.attach(root, {
      opaque: sharedMaterials.solid,
      cutout: sharedMaterials.cutout,
      transparent: sharedMaterials.transparent,
      transparentBack: sharedMaterials.transparentBack,
      cutoutDepth: cutoutDepthMaterial,
    });
    return () => regionBatcher.detach();
  }, []);
  useFrame(({ camera }) => regionBatcher.update(performance.now(), camera.position.x, camera.position.z));
  return <group ref={rootRef} name="chunkRegions" matrixAutoUpdate={false} />;
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

const ChunkMeshImpl: React.FC<ChunkMeshProps> = ({ cx, cz, shadowsEnabled = false, fadeInEnabled = true, fadingOut = false, onFadeOutComplete }) => {
  const [geometries, setGeometries] = useState<Geometries>(EMPTY_GEOMETRIES);
  // True while fading in or out: the meshes wear a dissolve step's materials
  // then (getVoxelFadeMaterials), put on by the fade itself, not by a render.
  const [fading, setFading] = useState(false);

  const geometriesRef = useRef(geometries);
  const fadeAnimRef = useRef<FadeAnimation | null>(null);
  const fadeModeRef = useRef<'none' | 'in' | 'out'>('none');
  const fadeStartedAtRef = useRef(0);
  const fadingOutRef = useRef(fadingOut);
  const onFadeOutCompleteRef = useRef(onFadeOutComplete);
  const lastFadeStartMsRef = useRef(0);
  const lastClearedMsRef = useRef(-Infinity);
  const hasRenderedMeshRef = useRef(false);
  const opaqueMeshRef = useRef<THREE.Mesh>(null);
  const cutoutMeshRef = useRef<THREE.Mesh>(null);
  const transparentMeshRef = useRef<THREE.Mesh>(null);
  const transparentBackMeshRef = useRef<THREE.Mesh>(null);

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

  // Replaced geometries are disposed only AFTER the new state commits. Disposing
  // before commit let Three render the disposed geometry for one frame, silently
  // re-uploading its GPU buffers, a leak (and a crash if arrays were released).
  const pendingDisposeRef = useRef<Geometries[]>([]);
  const queueDispose = useCallback((value: Geometries) => {
    if (value.opaque || value.cutout || value.transparent) {
      pendingDisposeRef.current.push(value);
    }
  }, []);

  useEffect(() => {
    if (pendingDisposeRef.current.length > 0) {
      for (const g of pendingDisposeRef.current) disposeGeometries(g);
      pendingDisposeRef.current = [];
    }
  }, [geometries]);

  // Puts a set of materials on this chunk's meshes: a dissolve step, or the shared set.
  const applyMaterials = useCallback((materials: VoxelMaterials) => {
    if (opaqueMeshRef.current) opaqueMeshRef.current.material = materials.solid;
    if (cutoutMeshRef.current) cutoutMeshRef.current.material = materials.cutout;
    if (transparentMeshRef.current) transparentMeshRef.current.material = materials.transparent;
    if (transparentBackMeshRef.current) transparentBackMeshRef.current.material = materials.transparentBack;
  }, []);

  // Ends a fade. The meshes go back to the shared materials, except at the end
  // of a fade-out: they stay dissolved there until they unmount, or they would
  // flash back for the frame before.
  const stopFade = useCallback((restore = true) => {
    if (fadeAnimRef.current) {
      activeFadeAnimations.delete(fadeAnimRef.current);
      fadeAnimRef.current = null;
    }
    if (fadeModeRef.current === 'none') return;
    fadeModeRef.current = 'none';
    if (restore) applyMaterials(sharedMaterials);
    setFading(false);
  }, [applyMaterials]);

  const startFade = useCallback((mode: 'in' | 'out') => {
    if (fadeModeRef.current === 'none') setFading(true);
    fadeModeRef.current = mode;
    fadeStartedAtRef.current = performance.now();
    if (mode === 'in') lastFadeStartMsRef.current = fadeStartedAtRef.current;
    applyMaterials(getVoxelFadeMaterials(sharedMaterials, mode === 'in' ? 0 : 1));

    if (!fadeAnimRef.current) {
      const anim: FadeAnimation = {
        update: (now: number) => {
          if (fadeModeRef.current === 'none') return;
          const progress = THREE.MathUtils.clamp((now - fadeStartedAtRef.current) / CHUNK_FADE_DURATION_MS, 0, 1);
          const smooth = progress * progress * (3 - 2 * progress);
          const eased = fadeModeRef.current === 'out' ? 1.0 - smooth : smooth;

          // Every frame, which also dresses meshes mounted since the last one
          // (the ticker runs before the frame renders).
          applyMaterials(getVoxelFadeMaterials(sharedMaterials, eased));

          if (progress >= 1) {
            const wasOut = fadeModeRef.current === 'out';
            stopFade(!wasOut);
            if (wasOut) {
              queueDispose(geometriesRef.current);
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
  }, [stopFade, queueDispose, applyMaterials]);

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
      // Chunk returned to active, cancel fade-out, back to shared materials
      stopFade();
    }
  }, [fadingOut, fadeInEnabled, startFade, stopFade]);

  // Fade disabled, drop any running animation
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
          queueDispose(geometriesRef.current);
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
            // Buffers arrive transferred from the worker and are never mutated again :
            // wrap them directly (Float32BufferAttribute would copy every array).
            // NOTE: do NOT release the CPU arrays after GPU upload, WorldManager's
            // meshCache hands these same buffers to chunks that remount later.
            geo.setAttribute('position', new THREE.BufferAttribute(buff.positions, 3));
            // Signed bytes, x y z and a pad (geometry.ts): four bytes a vertex instead of twelve.
            geo.setAttribute('normal', new THREE.BufferAttribute(buff.normals, 4, true));
            geo.setAttribute('uv', new THREE.BufferAttribute(buff.uvs, 2));
            geo.setAttribute('color', new THREE.BufferAttribute(buff.colors, 4, true));
            // How each face is textured: an atlas UV as is, or a tile repeated per block (geometry.ts).
            geo.setAttribute('atlasTile', new THREE.BufferAttribute(buff.tiles, 1));
            if (buff.indices && buff.indices.length > 0) {
                geo.setIndex(new THREE.BufferAttribute(buff.indices, 1));
            }
            if (buff.bounds) {
                // Worked out in the worker (geometry.ts). Padded for wind sway,
                // like the region meshes' bounds.
                const [minX, minY, minZ, maxX, maxY, maxZ] = buff.bounds;
                geo.boundingBox = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ)).expandByScalar(0.5);
                geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
            } else {
                geo.computeBoundingSphere();
            }
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
            queueDispose(geometriesRef.current);
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

        queueDispose(geometriesRef.current);
        geometriesRef.current = next;
        setGeometries(next);
        if (next.opaque || next.cutout || next.transparent) {
          hasRenderedMeshRef.current = true;
        }
    });

    return () => {
        unsubscribe();
        stopFade();
        // Unmounting: dispose immediately, including anything still pending.
        for (const g of pendingDisposeRef.current) disposeGeometries(g);
        pendingDisposeRef.current = [];
        disposeGeometries(geometriesRef.current);
        geometriesRef.current = EMPTY_GEOMETRIES;
        hasRenderedMeshRef.current = false;
    };
  }, [cx, cz, fadeInEnabled, startFade, stopFade, queueDispose]);

  // Once its geometry is on screen and not fading, the chunk offers it to its
  // region's merged mesh; whatever changes next (new geometry, a fade, leaving)
  // takes it back in this same commit, so it is never missing or drawn twice.
  const batchable = !fading && !fadingOut;
  useLayoutEffect(() => {
    if (!batchable || (!geometries.opaque && !geometries.cutout && !geometries.transparent)) return;
    regionBatcher.offer(cx, cz, {
      geometries,
      meshes: { opaque: opaqueMeshRef.current, cutout: cutoutMeshRef.current, transparent: transparentMeshRef.current },
    });
    return () => regionBatcher.withdraw(cx, cz);
  }, [cx, cz, geometries, batchable]);

  // A chunk never moves: work out its world matrices once per change of
  // meshes, then have three skip the whole group in its per-frame matrix walk.
  // It shows only while one of its meshes does (the region batcher hides them
  // as it draws them), so three's render and shadow walks skip it too.
  const groupRef = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.updateMatrixWorld(true);
    group.matrixWorldAutoUpdate = false;
    group.visible = group.children.some((child) => child.visible);
  }, [cx, cz, geometries]);

  return (
    // onUpdate runs after props apply, baking the matrix once.
    <group
      ref={groupRef}
      position={[cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE]}
      matrixAutoUpdate={false}
      onUpdate={(g) => g.updateMatrix()}
    >
        {/* Always the shared materials here: a fade swaps its own onto the meshes. */}
        {geometries.opaque && <mesh ref={opaqueMeshRef} name="chunk" matrixAutoUpdate={false} geometry={geometries.opaque} material={sharedMaterials.solid} castShadow={shadowsEnabled} receiveShadow={shadowsEnabled} />}
        {geometries.cutout && <mesh ref={cutoutMeshRef} name="chunk" matrixAutoUpdate={false} geometry={geometries.cutout} material={sharedMaterials.cutout} customDepthMaterial={cutoutDepthMaterial} castShadow={shadowsEnabled} receiveShadow={shadowsEnabled} />}
        {/* Water and glass: the front faces, with the back faces as a child
            over the same geometry. The back faces draw before any front face
            (renderOrder -1), as the merged regions' do: drawn chunk by chunk,
            a nearer chunk's undersides landed over the next chunk's surface
            and drew a line along every chunk border on ice and water. */}
        {geometries.transparent && (
          <mesh ref={transparentMeshRef} name="chunk" matrixAutoUpdate={false} geometry={geometries.transparent} material={sharedMaterials.transparent} castShadow={false} receiveShadow={false}>
            <mesh ref={transparentBackMeshRef} name="chunk" matrixAutoUpdate={false} renderOrder={-1} geometry={geometries.transparent} material={sharedMaterials.transparentBack} castShadow={false} receiveShadow={false} />
          </mesh>
        )}
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

type ChunkCoords = { cx: number; cz: number };
type DisplayedChunk = ChunkCoords & { fadingOut: boolean };

// Chunks are grouped into tiles of TILE x TILE on a fixed world grid. Crossing
// into a new chunk changes only the tiles along the edges of the view; every
// other tile keeps its very list, so React skips it without looking at its
// chunks one by one.
const TILE_SHIFT = 3; // 8 chunks
const tileKeyOf = (c: ChunkCoords) => `${c.cx >> TILE_SHIFT},${c.cz >> TILE_SHIFT}`;

interface ChunkTileProps {
  chunks: readonly DisplayedChunk[];
  shadowsEnabled: boolean;
  fadeEnabled: boolean;
  onFadeOutComplete: (cx: number, cz: number) => void;
}

const ChunkTileImpl: React.FC<ChunkTileProps> = ({ chunks, shadowsEnabled, fadeEnabled, onFadeOutComplete }) => (
  <>
    {chunks.map(c => (
      <ChunkMesh
        key={`${c.cx},${c.cz}`}
        cx={c.cx}
        cz={c.cz}
        shadowsEnabled={shadowsEnabled}
        fadeInEnabled={fadeEnabled}
        fadingOut={c.fadingOut}
        onFadeOutComplete={c.fadingOut ? () => onFadeOutComplete(c.cx, c.cz) : undefined}
      />
    ))}
  </>
);

const ChunkTile = React.memo(ChunkTileImpl);

interface ChunkFieldProps {
  shadowsEnabled: boolean;
  fadeEnabled: boolean;
}

const keyOf = (cx: number, cz: number) => `${cx},${cz}`;

/**
 * Every chunk's mesh, plus the ones fading out after leaving the view. It
 * mounts a chunk only once the chunk has a mesh, and keeps its chunks in tiles
 * rebuilt only where something changed:
 * - the view (chunkView.ts) changing on a border crossing touches only the
 *   tiles along its edges, instead of all of the view's chunks at once;
 * - chunks coming into view mount as their meshes arrive, a few a frame (the
 *   world's per-frame budget), not all together on the crossing;
 * - it re-renders as a transition, which React may spread over frames.
 */
const ChunkFieldImpl: React.FC<ChunkFieldProps> = ({ shadowsEnabled, fadeEnabled }) => {
  const [, setVersion] = useState(0);
  const fadeEnabledRef = useRef(fadeEnabled);
  const model = useRef({
    /** Chunks in view. */
    inView: new Set<string>(),
    /** Their coordinates, and those of chunks still fading out. */
    coords: new Map<string, ChunkCoords>(),
    /** Chunks drawn: in view with a mesh, or fading out. */
    shown: new Map<string, DisplayedChunk>(),
    /** Each tile's shown chunks, and the list its ChunkTile draws. */
    tileMembers: new Map<string, Set<string>>(),
    tiles: new Map<string, DisplayedChunk[]>(),
  });

  const handlers = useMemo(() => {
    const m = model.current;
    let dirty = new Set<string>();
    const tileOf = (key: string) => {
      const c = m.coords.get(key)!;
      return tileKeyOf(c);
    };
    const show = (key: string, fadingOut: boolean) => {
      const c = m.coords.get(key);
      if (!c) return;
      const current = m.shown.get(key);
      if (current && current.fadingOut === fadingOut) return;
      m.shown.set(key, { cx: c.cx, cz: c.cz, fadingOut });
      const tile = tileKeyOf(c);
      let members = m.tileMembers.get(tile);
      if (!members) m.tileMembers.set(tile, members = new Set());
      members.add(key);
      dirty.add(tile);
    };
    const hide = (key: string) => {
      if (!m.shown.delete(key)) return;
      const tile = tileOf(key);
      m.tileMembers.get(tile)?.delete(key);
      dirty.add(tile);
    };
    // Rebuilds the changed tiles' lists, then renders (as a transition).
    const flush = () => {
      if (dirty.size === 0) return;
      for (const tile of dirty) {
        const members = m.tileMembers.get(tile);
        if (!members || members.size === 0) {
          m.tileMembers.delete(tile);
          m.tiles.delete(tile);
          continue;
        }
        m.tiles.set(tile, [...members].map(key => m.shown.get(key)!));
      }
      dirty = new Set();
      startTransition(() => setVersion(v => v + 1));
    };

    return {
      /** The view changed: chunks leaving fade out (or go), chunks joining show once meshed. */
      setView(list: readonly ChunkCoords[]) {
        const next = new Set<string>();
        for (const c of list) {
          const key = keyOf(c.cx, c.cz);
          next.add(key);
          if (!m.inView.has(key)) m.coords.set(key, c);
        }
        for (const key of m.inView) {
          if (next.has(key)) continue;
          if (fadeEnabledRef.current && m.shown.has(key)) show(key, true);
          else { hide(key); m.coords.delete(key); }
        }
        m.inView = next;
        for (const key of next) {
          if (worldManager.hasMesh(key)) show(key, false);
          else hide(key);
        }
        flush();
      },
      /** A chunk got its first mesh or lost it (null: every chunk's changed). */
      meshPresence(key: string | null, present: boolean) {
        if (key === null) {
          for (const k of m.inView) {
            if (worldManager.hasMesh(k)) show(k, false);
            else hide(k);
          }
        } else if (m.inView.has(key)) {
          if (present) show(key, false);
          else hide(key);
        }
        flush();
      },
      /** A chunk finished fading out. */
      fadedOut(cx: number, cz: number) {
        const key = keyOf(cx, cz);
        if (m.inView.has(key)) return;
        hide(key);
        m.coords.delete(key);
        flush();
      },
      /** Fades turned off: whatever is fading out goes now. */
      dropFading() {
        for (const [key, chunk] of [...m.shown]) {
          if (!chunk.fadingOut) continue;
          hide(key);
          m.coords.delete(key);
        }
        flush();
      },
    };
  }, []);

  useEffect(() => {
    handlers.setView(chunkView.get());
    const stopView = chunkView.subscribe(() => handlers.setView(chunkView.get()));
    const stopMeshes = worldManager.subscribeMeshPresence(handlers.meshPresence);
    return () => {
      stopView();
      stopMeshes();
    };
  }, [handlers]);

  useEffect(() => {
    fadeEnabledRef.current = fadeEnabled;
    if (!fadeEnabled) handlers.dropFading();
  }, [fadeEnabled, handlers]);

  return (
    <>
      {[...model.current.tiles].map(([key, chunks]) => (
        <ChunkTile
          key={key}
          chunks={chunks}
          shadowsEnabled={shadowsEnabled}
          fadeEnabled={fadeEnabled}
          onFadeOutComplete={handlers.fadedOut}
        />
      ))}
    </>
  );
};

export const ChunkField = React.memo(ChunkFieldImpl);
