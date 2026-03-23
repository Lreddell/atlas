
import React, { useState, useEffect, useLayoutEffect, Suspense, useCallback, useRef, useMemo, startTransition } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Analytics } from '@vercel/analytics/react';

import { ChunkMesh } from './components/ChunkMesh';
import { Player, PlayerRefUpdater, PlayerHandle } from './components/Player';
import { DropManager } from './components/DropManager';
import { ParticleManager } from './components/ParticleManager';
import { DayNightCycle, DayNightCycleRef } from './components/world/DayNightCycle';
import { Clouds } from './components/world/Clouds';
import { InteractionController } from './components/controllers/InteractionController';
import { InventoryUI } from './components/ui/InventoryUI';
import { HUD } from './components/ui/HUD';
import { PauseMenu } from './components/ui/PauseMenu';
import { MainMenu } from './components/ui/MainMenu';
import { HeldItem } from './components/HeldItem';
import { Chat, ChatMessage } from './components/ui/Chat';
import { DeathScreen } from './components/ui/DeathScreen';
import { DebugScreen } from './components/ui/DebugScreen';
import { ErrorOverlay } from './components/ui/ErrorOverlay';
import { FireOverlay } from './components/ui/FireOverlay';
import { ChunkBase } from './components/ui/ChunkBase'; 
import { FeatureEditor } from './components/ui/FeatureEditor/FeatureEditor';
import { TextureAtlasViewer } from './components/ui/TextureAtlasViewer';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { MenuPanoramaBackground } from './components/ui/MenuPanoramaBackground';
import { CameraControls, CameraControlsHandle } from './components/CameraControls';
import { AudioListenerUpdater } from './components/AudioListenerUpdater';
import { shouldUseCaveMusic } from './systems/sound/caveMusic';
import { GameLoop } from './components/GameLoop';
import { FPSLimiter } from './components/FPSLimiter';
import { RenderStats } from './components/RenderStats';
import { isEditableElement } from './utils/dom';

import { worldManager } from './systems/WorldManager';
import { WorldStorage } from './systems/world/WorldStorage';
import { getBiome } from './systems/world/biomes';
import { textureAtlasManager } from './systems/textures/TextureAtlasManager';
import { RENDER_DISTANCE as DEFAULT_RENDER_DISTANCE, CHUNK_SIZE, WORKERS_ENABLED, DROP_LIFETIME_MS } from './constants';
import { MAX_BREATH } from './systems/player/playerConstants';
import {
  type BreakingVisual,
  type GameMode,
  type OpenContainerState,
  BlockType,
  ItemStack,
  Drop,
} from './types';
import { useInventoryController } from './hooks/useInventoryController';
import { createFoodState } from './systems/player/playerFood';
import { resetInputState } from './systems/player/playerInput';
import { BIOMES } from './systems/world/biomes';
import { loadGenConfig, resetGenConfig } from './systems/world/genConfig';
import { clearBloodMoonOverride, getLunarNightEventState, getMoonCycleIndex, hasBloodMoonOverride, isBloodMoonMusicActive, setBloodMoonOverride } from './systems/world/celestialEvents';
import { deleteWebPanoramaBlob, readWebPanoramaBlob, saveWebPanoramaBlob } from './systems/storage/webPanoramaBlobStore';
import { soundManager } from './systems/sound/SoundManager';
import { musicController } from './systems/sound/MusicController';
import { COMMANDS, SUBCOMMANDS, ARGUMENT_OPTIONS } from './data/commands';
import { getSpawnSearchCenter } from './utils/noise';
import type { WorldGenConfigSnapshot } from './systems/world/worldGenPresets';

type AppState = 'menu' | 'options' | 'loading' | 'game' | 'chunkbase' | 'featureEditor';
type RenderedChunk = { cx: number; cz: number };

const MENU_BACKGROUND_MODE_KEY = 'atlas.menu.backgroundMode';
const MENU_PANORAMA_PATH_KEY = 'atlas.menu.panoramaPath';
const MENU_PANORAMA_LIBRARY_KEY = 'atlas.menu.panoramaLibrary';
const MENU_PANORAMA_DATA_KEY = 'atlas.menu.panoramaDataUrl';
const MENU_PANORAMA_BLUR_KEY = 'atlas.menu.panoramaBlur';
const MENU_PANORAMA_GRADIENT_KEY = 'atlas.menu.panoramaGradient';
const MENU_PANORAMA_ROTATION_SPEED_KEY = 'atlas.menu.panoramaRotationSpeed';
const PANORAMA_CAPTURE_KEY = 'F8';
const WEB_PANORAMA_PREFIX = 'web:';
const DEFAULT_MENU_PANORAMA_URL = './assets/panoramas/alpha-1.0.1.png';
const DEFAULT_PANORAMA_ID = 'default:alpha-1.0.1';
const SETTINGS_RENDER_DISTANCE_KEY = 'atlas.settings.renderDistance';
const SETTINGS_FOV_KEY = 'atlas.settings.fov';
const SETTINGS_BRIGHTNESS_KEY = 'atlas.settings.brightness';
const SETTINGS_WORKERS_ENABLED_KEY = 'atlas.settings.workersEnabled';
const SETTINGS_SHADOWS_ENABLED_KEY = 'atlas.settings.shadowsEnabled';
const SETTINGS_CLOUDS_ENABLED_KEY = 'atlas.settings.cloudsEnabled';
const SETTINGS_MIPMAPS_ENABLED_KEY = 'atlas.settings.mipmapsEnabled';
const SETTINGS_ANTIALIASING_KEY = 'atlas.settings.antialiasing';
const SETTINGS_MAX_FPS_KEY = 'atlas.settings.maxFps';
const SETTINGS_VSYNC_KEY = 'atlas.settings.vsync';
const SETTINGS_CHUNK_FADE_ENABLED_KEY = 'atlas.settings.chunkFadeEnabled';

const readNumberSetting = (key: string, fallback: number, min?: number, max?: number) => {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(key);
    const parsed = raw == null ? fallback : Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    const lowerBounded = min == null ? parsed : Math.max(min, parsed);
    return max == null ? lowerBounded : Math.min(max, lowerBounded);
};

const readBooleanSetting = (key: string, fallback: boolean) => {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return raw === 'true';
};

// --- Streaming Loop Component ---
const ChunkStreamer: React.FC<{ active: boolean }> = React.memo(({ active }) => {
    useFrame(() => {
        if (!active) return;
        worldManager.processStreamingJobs();
    });
    return null;
});

function buildChunkOffsets(r: number) {
    const items: Array<{ dx: number; dz: number; d: number; a: number }> = [];

    for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
            const d = dx * dx + dz * dz;
            if (d > r * r) continue;
            items.push({ dx, dz, d, a: Math.atan2(dz, dx) });
        }
    }

    items.sort((p, q) => (p.d - q.d) || (p.a - q.a));
    return items.map(({ dx, dz }) => ({ dx, dz }));
}

function buildRenderOffsets(r: number) {
    const items: Array<{ dx: number; dz: number; d: number; a: number }> = [];

    for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
            const d = dx * dx + dz * dz;
            if (d > r * r) continue;
            items.push({ dx, dz, d, a: Math.atan2(dz, dx) });
        }
    }

    items.sort((a, b) => (a.d - b.d) || (a.a - b.a));
    return items.map(({ dx, dz }) => ({ dx, dz }));
}

function waitForAnimationFrames(count: number) {
    return new Promise<void>((resolve) => {
        let ticks = 0;
        const tick = () => {
            ticks += 1;
            if (ticks >= count) {
                resolve();
                return;
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

async function waitForFovToSettle(getCurrentFov: () => number, targetFov: number, maxFrames = 120) {
    let stableFrames = 0;
    for (let frame = 0; frame < maxFrames; frame += 1) {
        await waitForAnimationFrames(1);
        const current = getCurrentFov();
        if (Math.abs(current - targetFov) < 0.25) {
            stableFrames += 1;
            if (stableFrames >= 3) return;
        } else {
            stableFrames = 0;
        }
    }
}

type CubeFaceKey = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

function buildPanoramaAtlas(faces: Record<CubeFaceKey, HTMLCanvasElement>, faceSize: number): string {
    const atlas = document.createElement('canvas');
    atlas.width = faceSize * 4;
    atlas.height = faceSize * 3;

    const ctx = atlas.getContext('2d');
    if (!ctx) throw new Error('Failed to initialize panorama atlas context.');

    const drawAt = (source: HTMLCanvasElement, cellX: number, cellY: number) => {
        ctx.drawImage(source, cellX * faceSize, cellY * faceSize, faceSize, faceSize);
    };

    // Minecraft-like panorama layout:
    // row 0:      [ ][4][ ][ ]
    // row 1:      [0][1][2][3]
    // row 2:      [ ][5][ ][ ]
    // face mapping from capture:
    // 0=front(+Z), 1=right(+X), 2=back(-Z), 3=left(-X), 4=up(+Y), 5=down(-Y)
    drawAt(faces.pz, 0, 1);
    drawAt(faces.px, 1, 1);
    drawAt(faces.nz, 2, 1);
    drawAt(faces.nx, 3, 1);
    drawAt(faces.py, 1, 0);
    drawAt(faces.ny, 1, 2);

    return atlas.toDataURL('image/png');
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('menu');
    const [bootReady, setBootReady] = useState(false);
  const [loadingState, setLoadingState] = useState({ phase: '', percent: 0, details: '' });
  
  const [chunks, setChunks] = useState<{ cx: number; cz: number }[]>([]);
        const [, setPlayerChunkCenter] = useState({ cx: 0, cz: 0 });
  const [drops, setDrops] = useState<Drop[]>([]);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isPaused, setIsPaused] = useState(false); 
  const [health, setHealth] = useState(20);
  const [hunger, setHunger] = useState(20);
  const [saturation, setSaturation] = useState(5);
  const [breath, setBreath] = useState(MAX_BREATH);
  const [gameMode, setGameMode] = useState<GameMode>('survival');
  const [headBlockType, setHeadBlockType] = useState<BlockType>(BlockType.AIR);
  const [isOnFire, setIsOnFire] = useState(false);
  const [respawnKey, setRespawnKey] = useState(0);
  const [lastDamageTime, setLastDamageTime] = useState(0);
  const [showDeathScreen, setShowDeathScreen] = useState(false);
  const [isSleeping, setIsSleeping] = useState(false);
    const pendingBedSpawnRef = useRef<{ x: number, y: number, z: number } | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showAtlasViewer, setShowAtlasViewer] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
    const [openOptionsInHelp, setOpenOptionsInHelp] = useState(false);

    const [, setAmbientIntensity] = useState(0.6);
    const [, setDirectionalIntensity] = useState(0.8);
  const [breakingVisual, setBreakingVisual] = useState<BreakingVisual | null>(null);
    const [renderDistance, setRenderDistance] = useState(() => readNumberSetting(SETTINGS_RENDER_DISTANCE_KEY, DEFAULT_RENDER_DISTANCE, 4, 48));
    const [fov, setFov] = useState(() => readNumberSetting(SETTINGS_FOV_KEY, 70, 30, 110));
    const [brightness, setBrightness] = useState(() => readNumberSetting(SETTINGS_BRIGHTNESS_KEY, 0.5, 0, 1)); 
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showCommandInput, setShowCommandInput] = useState(false);
  const [commandValue, setCommandValue] = useState('');
  
    const [workersEnabled] = useState(() => readBooleanSetting(SETTINGS_WORKERS_ENABLED_KEY, WORKERS_ENABLED));
    const [shadowsEnabled, setShadowsEnabled] = useState(() => readBooleanSetting(SETTINGS_SHADOWS_ENABLED_KEY, false));
    const [cloudsEnabled, setCloudsEnabled] = useState(() => readBooleanSetting(SETTINGS_CLOUDS_ENABLED_KEY, true));
    const [mipmapsEnabled, setMipmapsEnabled] = useState(() => readBooleanSetting(SETTINGS_MIPMAPS_ENABLED_KEY, true));
    const [antialiasing, setAntialiasing] = useState(() => readBooleanSetting(SETTINGS_ANTIALIASING_KEY, true));
    const [chunkFadeEnabled, setChunkFadeEnabled] = useState(() => readBooleanSetting(SETTINGS_CHUNK_FADE_ENABLED_KEY, true));
  
    const [maxFps, setMaxFps] = useState(() => readNumberSetting(SETTINGS_MAX_FPS_KEY, 260, 10, 260)); 
    const [vsync, setVsync] = useState(() => readBooleanSetting(SETTINGS_VSYNC_KEY, true)); 
    const [menuBackgroundMode, setMenuBackgroundMode] = useState<'dirt' | 'panorama'>('panorama');
  const [menuPanoramaPath, setMenuPanoramaPath] = useState<string | null>(() => {
      if (typeof window === 'undefined') return null;
      return window.localStorage.getItem(MENU_PANORAMA_PATH_KEY);
  });
  const [menuPanoramaLibrary, setMenuPanoramaLibrary] = useState<string[]>(() => {
      if (typeof window === 'undefined') return [];
      try {
          const raw = window.localStorage.getItem(MENU_PANORAMA_LIBRARY_KEY);
          if (!raw) return [];
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
      } catch {
          return [];
      }
  });
        const [menuPanoramaDataUrl, setMenuPanoramaDataUrl] = useState<string | null>(() => {
            if (typeof window === 'undefined') return DEFAULT_MENU_PANORAMA_URL;
            return window.localStorage.getItem(MENU_PANORAMA_DATA_KEY) || DEFAULT_MENU_PANORAMA_URL;
        });
        const [menuPanoramaBlur, setMenuPanoramaBlur] = useState<number>(() => {
            if (typeof window === 'undefined') return 3;
            const raw = window.localStorage.getItem(MENU_PANORAMA_BLUR_KEY);
            const parsed = raw == null ? 3 : Number(raw);
            if (!Number.isFinite(parsed)) return 3;
            return Math.max(0, Math.min(12, parsed));
        });
        const [menuPanoramaGradient, setMenuPanoramaGradient] = useState<number>(() => {
            if (typeof window === 'undefined') return 0.35;
            const raw = window.localStorage.getItem(MENU_PANORAMA_GRADIENT_KEY);
            const parsed = raw == null ? 0.35 : Number(raw);
            if (!Number.isFinite(parsed)) return 0.35;
            return Math.max(0, Math.min(0.9, parsed));
        });
    const [menuPanoramaRotationSpeed, setMenuPanoramaRotationSpeed] = useState<number>(() => {
        if (typeof window === 'undefined') return 1;
        const raw = window.localStorage.getItem(MENU_PANORAMA_ROTATION_SPEED_KEY);
        const parsed = raw == null ? 1 : Number(raw);
        if (!Number.isFinite(parsed)) return 1;
        return Math.max(0, Math.min(4, parsed));
    });
    const [menuPanoramaFaceDataUrls, setMenuPanoramaFaceDataUrls] = useState<string[] | null>(null);
  const [isCapturingPanorama, setIsCapturingPanorama] = useState(false);
    const webPanoramaObjectUrlRef = useRef<string | null>(null);

  const activeWorldIdRef = useRef<string | null>(null); // Track active world ID for auto-save
  const activeWorldGenConfigRef = useRef<WorldGenConfigSnapshot | null>(null); // Store active world's GenConfig to restore after World Editor
    const keyboardLockActiveRef = useRef(false);

  const isNativeLoop = vsync;
  const canvasFrameloop = isNativeLoop ? 'always' : 'never';
  // Include antialiasing in the key to force WebGL context recreation when changed
  const canvasKey = `${canvasFrameloop}-${antialiasing}`;
  const effectiveMaxFps = maxFps;

  const dayNightRef = useRef<DayNightCycleRef>(null);
  const foodStateRef = useRef(createFoodState());
  const playerRef = useRef<PlayerHandle>(null);
  
  const fpsRef = useRef(0);
  
  const [acCandidates, setAcCandidates] = useState<string[]>([]);
  const [acIndex, setAcIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const commandHistoryRef = useRef<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

    const desiredChunkOffsets = useMemo(() => buildChunkOffsets(renderDistance), [renderDistance]);
    const renderChunkOffsets = useMemo(() => buildRenderOffsets(renderDistance), [renderDistance]);

  const isDead = health <= 0;
  const worldPaused = isPaused || isSleeping || appState !== 'game' || isCapturingPanorama;
  const renderedChunks = useMemo<RenderedChunk[]>(() => {
      if (chunks.length === 0) return [];
      return chunks.map((chunk) => ({ ...chunk }));
  }, [chunks]);

  // ── Chunk fade-out tracking ──
  // We keep departing chunks in the render list so their ChunkMesh can animate out.
  // Using refs mutated inside useMemo guarantees no one-frame gap where a chunk
  // vanishes and then reappears as fading (which would unmount+remount and lose geometry).
  const prevRenderedKeysRef = useRef<Map<string, RenderedChunk>>(new Map());
  const fadingOutMapRef = useRef<Map<string, RenderedChunk>>(new Map());
  const [fadingVersion, setFadingVersion] = useState(0);

  const allDisplayedChunks = useMemo(() => {
      void fadingVersion;
      const currentKeys = new Set(renderedChunks.map(c => `${c.cx},${c.cz}`));

      // Detect newly departed chunks
      if (chunkFadeEnabled) {
          for (const [key, chunk] of prevRenderedKeysRef.current) {
              if (!currentKeys.has(key) && !fadingOutMapRef.current.has(key)) {
                  fadingOutMapRef.current.set(key, chunk);
              }
          }
      }

      // Remove fading chunks that returned to active, or all if fade disabled
      if (!chunkFadeEnabled) {
          fadingOutMapRef.current.clear();
      } else {
          for (const key of fadingOutMapRef.current.keys()) {
              if (currentKeys.has(key)) {
                  fadingOutMapRef.current.delete(key);
              }
          }
      }

      prevRenderedKeysRef.current = new Map(renderedChunks.map(c => [`${c.cx},${c.cz}`, c]));

      const result: (RenderedChunk & { fadingOut: boolean })[] = [
          ...renderedChunks.map(c => ({ ...c, fadingOut: false })),
          ...[...fadingOutMapRef.current.values()].map(c => ({ ...c, fadingOut: true }))
      ];
      return result;
  }, [renderedChunks, chunkFadeEnabled, fadingVersion]);

  const handleChunkFadeOutComplete = useCallback((cx: number, cz: number) => {
      fadingOutMapRef.current.delete(`${cx},${cz}`);
      setFadingVersion(v => v + 1);
  }, []);

    const isElectron = useMemo(() => {
        return typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;
    }, []);

  const unlockBrowserShortcuts = useCallback(() => {
      if (isElectron) return;
      if (!keyboardLockActiveRef.current) return;

      try {
          navigator.keyboard?.unlock?.();
      } catch {}

      keyboardLockActiveRef.current = false;
  }, [isElectron]);

  const lockBrowserShortcuts = useCallback(async () => {
      if (isElectron) return false;
      if (!navigator.keyboard?.lock) return false;

      try {
          await navigator.keyboard.lock();
          keyboardLockActiveRef.current = true;
          return true;
      } catch {
          keyboardLockActiveRef.current = false;
          return false;
      }
  }, [isElectron]);

  // Initial dummy position, will be replaced by handleStartGame
  const [currentSpawnPos, setCurrentSpawnPos] = useState(new THREE.Vector3(0, 150, 0));

  const playerPosRef = useRef(currentSpawnPos.clone());
  const controlsRef = useRef<CameraControlsHandle>(null);
  
  const {
      inventory, setInventory,
      cursorStack, setCursorStack,
      openContainer, setOpenContainer,
      craftingGrid2x2, setCraftingGrid2x2,
      craftingGrid3x3, setCraftingGrid3x3,
      craftingOutput,
      handleInventoryAction,
      addToInventory
  } = useInventoryController({ 
      gameMode, 
      setDrops, 
      playerPosRef, 
      cameraRef: controlsRef 
  });

  const isInventoryOpenRef = useRef(false);
  const isCommandOpenRef = useRef(false);
  const isAtlasViewerOpenRef = useRef(false);
  const relockWantedRef = useRef(false);
  const deathScreenActiveRef = useRef(false);
  const lockRequestInFlightRef = useRef(false);
  const wantsGameplayRef = useRef(false);
  const escapeHeldRef = useRef(false);
  const suppressAutoPauseUntilMsRef = useRef(0);
    const pointerLockRetryTimersRef = useRef<number[]>([]);
    const pendingCameraRotationRef = useRef<{ x: number; y: number } | null>(null);
    const lastAppliedChunkKeyRef = useRef<string | null>(null);

    const applyChunkCenter = useCallback((cx: number, cz: number, force = false) => {
            if (!Number.isFinite(cx) || !Number.isFinite(cz)) return;

            const key = `${cx},${cz}`;
            if (!force && lastAppliedChunkKeyRef.current === key) return;
            lastAppliedChunkKeyRef.current = key;

                const nextDesired = desiredChunkOffsets.map(({ dx, dz }) => ({ cx: cx + dx, cz: cz + dz }));
                const nextRender = renderChunkOffsets.map(({ dx, dz }) => ({ cx: cx + dx, cz: cz + dz }));

                worldManager.setDesiredChunks(nextDesired);

                startTransition(() => {
                    setPlayerChunkCenter({ cx, cz });
                    setChunks(nextRender);
                });
            }, [desiredChunkOffsets, renderChunkOffsets]);

  // Sync currentSpawnPos with Player logic for safe reloading of Canvas
  const safeSetSetting = useCallback(<T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
      if (appState === 'game' && playerPosRef.current && Number.isFinite(playerPosRef.current.x)) {
          setCurrentSpawnPos(playerPosRef.current.clone());
      }
      setter(value);
  }, [appState]);

  useEffect(() => {
      if (appState === 'game' && playerPosRef.current && Number.isFinite(playerPosRef.current.x)) {
          setCurrentSpawnPos(playerPosRef.current.clone());
      }
  }, [appState]);

  useEffect(() => {
      if (appState !== 'game') return;
      if (!pendingCameraRotationRef.current) return;

      const rotation = pendingCameraRotationRef.current;
      const id = requestAnimationFrame(() => {
          if (controlsRef.current && rotation) {
              controlsRef.current.setRotation(rotation.x, rotation.y);
          }
          pendingCameraRotationRef.current = null;
      });

      return () => cancelAnimationFrame(id);
  }, [appState, respawnKey]);

  // --- AUTO SAVE LOGIC ---
  const saveGame = useCallback(async () => {
      if (!activeWorldIdRef.current) return;
      
      const meta = await WorldStorage.getWorldMeta(activeWorldIdRef.current);
      if (meta) {
          meta.lastPlayed = Date.now();
          meta.time = worldManager.getTime();

          const currentRotation = controlsRef.current?.getRotation() || { x: 0, y: 0 };
          
          // Persist the current game mode to the top-level metadata
          // This ensures that if the user changed gamemode via commands, it persists on reload.
          meta.gameMode = gameMode;

          meta.player = {
              position: { x: playerPosRef.current.x, y: playerPosRef.current.y, z: playerPosRef.current.z },
              rotation: { x: currentRotation.x, y: currentRotation.y },
              inventory: inventory,
              health: health,
              hunger: hunger,
              saturation: saturation,
              breath: breath,
              gameMode: gameMode,
              selectedSlot: selectedSlot
          };
          meta.spawnPoint = worldManager.getSpawnPoint();
          meta.worldSpawn = worldManager.getWorldSpawn();
          await WorldStorage.saveWorldMeta(meta);
          await worldManager.forceSave(); // Save chunks
          console.log(`[AutoSave] World ${meta.name} saved.`);
      }
  }, [inventory, health, hunger, saturation, breath, gameMode, selectedSlot]);

  // Auto-save timer
  useEffect(() => {
      if (appState === 'game') {
          const interval = setInterval(() => {
              saveGame();
          }, 10000); // 10 seconds
          return () => clearInterval(interval);
      }
  }, [appState, saveGame]);

  useEffect(() => {
      const handleError = (event: ErrorEvent) => {
          console.error("Global Error:", event.error);
          setFatalError(event.message || "Unknown Error");
      };
      const handleRejection = (event: PromiseRejectionEvent) => {
          console.error("Unhandled Rejection:", event.reason);
          setFatalError(typeof event.reason === 'string' ? event.reason : (event.reason?.message || "Promise Rejected"));
      };
      window.addEventListener('error', handleError);
      window.addEventListener('unhandledrejection', handleRejection);
      return () => {
          window.removeEventListener('error', handleError);
          window.removeEventListener('unhandledrejection', handleRejection);
      };
  }, []);

  useEffect(() => {
      let cancelled = false;
      let doneTimeout: number | null = null;

      const boot = async () => {
          setLoadingState({ phase: 'Initializing', percent: 15, details: 'Loading textures' });

          textureAtlasManager.getTexture();

          await new Promise<void>((resolve) => {
              requestAnimationFrame(() => resolve());
          });

          if (cancelled) return;
          setLoadingState({ phase: 'Ready', percent: 100, details: 'Opening menu' });

          doneTimeout = window.setTimeout(() => {
              if (!cancelled) {
                  setBootReady(true);
                  setLoadingState({ phase: '', percent: 0, details: '' });
              }
          }, 120);
      };

      boot();

      return () => {
          cancelled = true;
          if (doneTimeout !== null) {
              clearTimeout(doneTimeout);
          }
      };
  }, []);

  useEffect(() => {
      soundManager.init().catch(e => console.warn("Sound init warning:", e));

      if (soundManager.isPlaybackReady() && (appState === 'menu' || appState === 'options' || appState === 'chunkbase' || appState === 'featureEditor')) {
          musicController.update(true, 'survival', 'plains');
      }

      const interval = setInterval(() => {
          if (soundManager.isPlaybackReady() && (appState === 'menu' || appState === 'options' || appState === 'chunkbase' || appState === 'featureEditor')) {
              musicController.update(true, 'survival', 'plains');
          }
      }, 1000);
      return () => clearInterval(interval);
  }, [appState]);

  useEffect(() => {
      const tryUnlockAudio = async () => {
          const resumed = await soundManager.resume();
          if (!resumed) return;

          if (appState === 'menu' || appState === 'options' || appState === 'chunkbase' || appState === 'featureEditor') {
              musicController.update(true, 'survival', 'plains');
          }
      };

      const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'keydown'];
      events.forEach((eventName) => {
          window.addEventListener(eventName, tryUnlockAudio, { capture: true, passive: true });
      });

      return () => {
          events.forEach((eventName) => {
              window.removeEventListener(eventName, tryUnlockAudio, { capture: true } as EventListenerOptions);
          });
      };
  }, [appState]);

  useLayoutEffect(() => {
      wantsGameplayRef.current = appState === 'game' && !isPaused && !openContainer && !showCommandInput && !isDead && !isSleeping && !showAtlasViewer;
  }, [appState, isPaused, openContainer, showCommandInput, isDead, isSleeping, showAtlasViewer]);

  useEffect(() => {
      textureAtlasManager.updateFilters(mipmapsEnabled);
  }, [mipmapsEnabled]);

  useEffect(() => {
      worldManager.setWorkersEnabled(workersEnabled);
  }, [workersEnabled]);

  useEffect(() => {
      if (isSleeping) {
          const timeout = setTimeout(() => {
              const current = worldManager.getTime();
              const nextMorning = (Math.floor(current / 24000) + 1) * 24000 + 1000;
              worldManager.setTime(nextMorning);
              if (pendingBedSpawnRef.current) {
                  const { x, y, z } = pendingBedSpawnRef.current;
                  worldManager.setSpawnPoint(x, y, z, false);
                  worldManager.log('Spawn point set to your bed.', 'success');
                  pendingBedSpawnRef.current = null;
              }
              setIsSleeping(false);
          }, 3000); 
          return () => clearTimeout(timeout);
      }
  }, [isSleeping]);

  useEffect(() => {
      const handleContextMenu = (e: MouseEvent) => {
          e.preventDefault();
      };
      window.addEventListener('contextmenu', handleContextMenu);
      return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  useEffect(() => {
      const interval = setInterval(() => {
          if (worldPaused) return;
          const now = Date.now();
          setDrops(currentDrops => {
              const remaining = currentDrops.filter(d => now - d.createdAt < DROP_LIFETIME_MS);
              if (remaining.length !== currentDrops.length) return remaining;
              return currentDrops;
          });
      }, 1000);
      return () => clearInterval(interval);
  }, [worldPaused]);

  useEffect(() => {
      const unsub = worldManager.subscribeToDrops((type, x, y, z) => {
          setDrops(p => [...p, {
                id: Math.random().toString(), 
                type: type, 
                count: 1,
                position: [x+0.5, y+0.5, z+0.5], 
                velocity: [(Math.random()-0.5)*2, 4, (Math.random()-0.5)*2], 
                createdAt: Date.now(), 
                pickupDelay: Date.now() + 500 
          }]);
      });
      return unsub;
  }, []);

  useEffect(() => {
    if (health <= 0) {
        const hasItems = inventory.some(i => i !== null) || cursorStack !== null || craftingGrid2x2.some(i => i !== null) || craftingGrid3x3.some(i => i !== null);
        if (hasItems) {
            setDrops(prev => {
                const newDrops = [...prev];
                const dropItem = (item: ItemStack) => {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 2 + Math.random() * 3;
                    newDrops.push({
                         id: Math.random().toString(),
                         type: item.type,
                         count: item.count,
                         position: [playerPosRef.current.x, playerPosRef.current.y + 1.0, playerPosRef.current.z],
                         velocity: [Math.cos(angle) * speed, 3 + Math.random() * 2, Math.sin(angle) * speed],
                         createdAt: Date.now(),
                         pickupDelay: Date.now() + 1500 
                    });
                };
                
                inventory.forEach(item => { if (item) dropItem(item); });
                if (cursorStack) dropItem(cursorStack);
                craftingGrid2x2.forEach(item => { if(item) dropItem(item); });
                craftingGrid3x3.forEach(item => { if(item) dropItem(item); });
                
                return newDrops;
            });

            setInventory(Array(36).fill(null));
            setCursorStack(null);
            setCraftingGrid2x2(Array(4).fill(null));
            setCraftingGrid3x3(Array(9).fill(null));
            if (openContainer) {
                setOpenContainer(null);
                isInventoryOpenRef.current = false;
            }
        }
    }
  }, [health, inventory, cursorStack, craftingGrid2x2, craftingGrid3x3, openContainer, setInventory, setCursorStack, setCraftingGrid2x2, setCraftingGrid3x3, setOpenContainer]); 

  useEffect(() => {
      const unsubscribe = worldManager.subscribeToMessages((msg, type, clickAction) => {
          setMessages(prev => [
              ...prev.slice(-19), 
              { id: Date.now() + Math.random(), text: msg, type, timestamp: Date.now(), clickAction }
          ]);
      });
      return () => { unsubscribe(); };
  }, []);

  // Update Chunks & Stream
  useEffect(() => {
      if (appState !== 'game') return;
      
      const px = playerPosRef.current.x;
      const pz = playerPosRef.current.z;
      
      if (!Number.isFinite(px) || !Number.isFinite(pz)) return;

      const cx = Math.floor(px / CHUNK_SIZE);
      const cz = Math.floor(pz / CHUNK_SIZE);

            applyChunkCenter(cx, cz, true);

    }, [renderDistance, appState, applyChunkCenter]);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
        if (openContainer || isPaused || !isLocked || showCommandInput || isDead || isSleeping || appState !== 'game') return;
                if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        return;
                }
        if (e.deltaY > 0) setSelectedSlot(s => (s + 1) % 9);
        if (e.deltaY < 0) setSelectedSlot(s => (s - 1 + 9) % 9);
    };
        window.addEventListener('wheel', onWheel, { passive: false });
        return () => window.removeEventListener('wheel', onWheel, { passive: false } as EventListenerOptions);
  }, [openContainer, isPaused, isLocked, showCommandInput, isDead, isSleeping, appState]);

  const handleCollect = useCallback((id: string, type: BlockType, count: number) => {
    if (health <= 0) return; 
    addToInventory(type, count);
    soundManager.play("entity.item.pickup"); 
    setDrops(prev => prev.filter(d => d.id !== id));
  }, [addToInventory, health]);

  const handleDestroy = useCallback((id: string) => {
    setDrops(prev => prev.filter(d => d.id !== id));
  }, []);

  const consumeItem = useCallback((slot: number) => {
    if (gameMode === 'creative' || gameMode === 'spectator') return; 
    setInventory(prev => {
        const next = [...prev];
        const it = next[slot];
        if (it) {
            if (it.count > 1) next[slot] = { ...it, count: it.count - 1 };
            else next[slot] = null;
        }
        return next;
    });
  }, [gameMode, setInventory]);

  const requestPointerLockNow = useCallback(() => {
      lockRequestInFlightRef.current = true;
      if (controlsRef.current && controlsRef.current.lock) controlsRef.current.lock();
      else document.body.requestPointerLock();
  }, []);

  const clearPointerLockRetryTimers = useCallback(() => {
      if (pointerLockRetryTimersRef.current.length === 0) return;
      for (const id of pointerLockRetryTimersRef.current) {
          window.clearTimeout(id);
      }
      pointerLockRetryTimersRef.current = [];
  }, []);

  const requestPointerLockBurst = useCallback((reason: string, opts?: { force?: boolean }) => {
      void reason;
      clearPointerLockRetryTimers();
      const tryLock = () => {
          if (!opts?.force && !wantsGameplayRef.current) return;
          if (document.pointerLockElement) return;
          requestPointerLockNow();
      };
      tryLock();
      if (typeof queueMicrotask === 'function') { queueMicrotask(tryLock); queueMicrotask(tryLock); }
      const retryDelays = [32, 96, 180, 320];
      pointerLockRetryTimersRef.current = retryDelays.map((delay) => window.setTimeout(tryLock, delay));
  }, [requestPointerLockNow, clearPointerLockRetryTimers]);

  const exitPointerLockNow = useCallback(() => document.exitPointerLock(), []);
  const enterUIMode = useCallback(() => {
      clearPointerLockRetryTimers();
      relockWantedRef.current = false;
      wantsGameplayRef.current = false;
      exitPointerLockNow();
  }, [clearPointerLockRetryTimers, exitPointerLockNow]);
  const suppressAutoPauseFor = useCallback((ms: number) => { suppressAutoPauseUntilMsRef.current = performance.now() + ms; }, []);

  useEffect(() => () => clearPointerLockRetryTimers(), [clearPointerLockRetryTimers]);

  useEffect(() => {
      const onKeyUp = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
              escapeHeldRef.current = false;
              if (appState !== 'game') return; 
              if (document.pointerLockElement) return;
              if (!wantsGameplayRef.current && !relockWantedRef.current) return;
              relockWantedRef.current = true;
              suppressAutoPauseFor(350);
              requestPointerLockBurst('escape-up', { force: true });
          }
      };
      window.addEventListener('keyup', onKeyUp);
      return () => window.removeEventListener('keyup', onKeyUp);
  }, [requestPointerLockBurst, suppressAutoPauseFor, appState]);

  const resumeFromUserGesture = useCallback((reason: 'escape' | 'button' | 'respawn') => {
      soundManager.resume(); 
      soundManager.preload(['ui.click', 'ui.open', 'ui.close', 'entity.player.hurt', 'block.grass.step', 'block.stone.step', 'block.wood.step']);
      void lockBrowserShortcuts();
      setIsPaused(false);
      setOpenContainer(null);
      setShowCommandInput(false);
      setShowAtlasViewer(false);
      isInventoryOpenRef.current = false;
      isCommandOpenRef.current = false;
      isAtlasViewerOpenRef.current = false;
      wantsGameplayRef.current = true;
      relockWantedRef.current = true;
      requestPointerLockBurst(reason, { force: true });
    }, [requestPointerLockBurst, lockBrowserShortcuts, setOpenContainer]);

  const resumeGame = useCallback((opts?: { deferPointerLock?: boolean }) => {
      setOpenContainer(null);
      setShowCommandInput(false);
      isInventoryOpenRef.current = false;
      isCommandOpenRef.current = false;
      setIsPaused(false);
      wantsGameplayRef.current = true;
      relockWantedRef.current = true;
      if (opts?.deferPointerLock) return;
      requestPointerLockBurst('resumeGame', { force: true });
  }, [requestPointerLockBurst, setOpenContainer]);

  const onLock = useCallback(() => { 
      soundManager.resume();
      void lockBrowserShortcuts();
      clearPointerLockRetryTimers();
      relockWantedRef.current = false;
      lockRequestInFlightRef.current = false;
      setIsLocked(true); 
      setIsPaused(false);
  }, [clearPointerLockRetryTimers, lockBrowserShortcuts]);

  const onUnlock = useCallback(() => { 
      setIsLocked(false); 
      if (lockRequestInFlightRef.current) { lockRequestInFlightRef.current = false; return; }
      if (performance.now() < suppressAutoPauseUntilMsRef.current) return;
      if (relockWantedRef.current) return;
      if (deathScreenActiveRef.current) return;
      if (isInventoryOpenRef.current || isCommandOpenRef.current || isDead || isSleeping || isAtlasViewerOpenRef.current) return;
      setIsPaused(true); 
  }, [isDead, isSleeping]);

  const handleGameClick = useCallback((e: React.MouseEvent) => {
      void e;
      soundManager.resume();
      void lockBrowserShortcuts();
      if (appState === 'game' && !isPaused && !isLocked && !openContainer && !showCommandInput && !isDead && !isSleeping && !showAtlasViewer) {
          resumeFromUserGesture('button');
      }
  }, [isPaused, isLocked, openContainer, showCommandInput, isDead, isSleeping, showAtlasViewer, resumeFromUserGesture, appState, lockBrowserShortcuts]);

  const tryRecoverPointerLock = useCallback((reason: string) => {
      if (appState !== 'game') return;
      if (isPaused || openContainer || showCommandInput || isDead || isSleeping || showAtlasViewer || isCapturingPanorama) return;
      if (!wantsGameplayRef.current) return;
      if (document.pointerLockElement) return;
      relockWantedRef.current = true;
      requestPointerLockBurst(reason);
  }, [appState, isPaused, openContainer, showCommandInput, isDead, isSleeping, showAtlasViewer, isCapturingPanorama, requestPointerLockBurst]);

  useEffect(() => {
      const onMouseUp = () => tryRecoverPointerLock('mouse-up');
      const onClick = () => tryRecoverPointerLock('click');
      const onMouseMove = (e: MouseEvent) => {
          if (Math.abs(e.movementX) + Math.abs(e.movementY) <= 0) return;
          tryRecoverPointerLock('mouse-move');
      };

      window.addEventListener('mouseup', onMouseUp, true);
      window.addEventListener('click', onClick, true);
      window.addEventListener('mousemove', onMouseMove, true);
      return () => {
          window.removeEventListener('mouseup', onMouseUp, true);
          window.removeEventListener('click', onClick, true);
          window.removeEventListener('mousemove', onMouseMove, true);
      };
  }, [tryRecoverPointerLock]);

  const closeInventory = useCallback((opts?: { deferPointerLock?: boolean }) => {
    soundManager.play("ui.close"); 
    const grids = [...craftingGrid2x2, ...craftingGrid3x3];
    grids.forEach(item => { if (item) addToInventory(item.type, item.count); });
    if (cursorStack && gameMode !== 'creative') addToInventory(cursorStack.type, cursorStack.count);
    setCraftingGrid2x2(Array(4).fill(null)); setCraftingGrid3x3(Array(9).fill(null));
    setCursorStack(null); 
    resumeGame(opts);
  }, [craftingGrid2x2, craftingGrid3x3, cursorStack, addToInventory, gameMode, resumeGame, setCraftingGrid2x2, setCraftingGrid3x3, setCursorStack]);

  const openInventory = useCallback(() => {
    soundManager.play("ui.open"); 
    if (gameMode === 'creative') setOpenContainer({ type: 'creative' }); else setOpenContainer({ type: 'inventory' });
    isInventoryOpenRef.current = true; 
    enterUIMode();
  }, [gameMode, enterUIMode, setOpenContainer]);

  const logMsg = useCallback((text: string, type: 'info' | 'error' | 'success' = 'info', clickAction?: string) => { 
      setMessages(prev => [...prev.slice(-19), { id: Date.now() + Math.random(), text: text, type, timestamp: Date.now(), clickAction }]);
  }, []);

    const capturePanoramaDataUrl = useCallback(async () => {
      const controls = controlsRef.current;
      const sourceCanvas = document.querySelector('canvas') as HTMLCanvasElement | null;

      if (!controls || !sourceCanvas) {
          throw new Error('Camera or render canvas unavailable.');
      }

      if (sourceCanvas.width <= 0 || sourceCanvas.height <= 0) {
          throw new Error('Render canvas is not ready yet.');
      }

      const captureSize = Math.min(sourceCanvas.width, sourceCanvas.height);
      const cropX = Math.floor((sourceCanvas.width - captureSize) / 2);
      const cropY = Math.floor((sourceCanvas.height - captureSize) / 2);
      const previousFov = fov;
      if (previousFov !== 90) {
          setFov(90);
          await waitForFovToSettle(() => controls.getFov(), 90);
      }

      const makeFaceCanvas = () => {
          const canvas = document.createElement('canvas');
          canvas.width = captureSize;
          canvas.height = captureSize;
          return canvas;
      };

      const faces: Record<CubeFaceKey, HTMLCanvasElement> = {
          px: makeFaceCanvas(),
          nx: makeFaceCanvas(),
          py: makeFaceCanvas(),
          ny: makeFaceCanvas(),
          pz: makeFaceCanvas(),
          nz: makeFaceCanvas(),
      };

      const drawFace = (face: CubeFaceKey) => {
          const ctx = faces[face].getContext('2d');
          if (!ctx) throw new Error('Failed to initialize face canvas context.');
          ctx.drawImage(sourceCanvas, cropX, cropY, captureSize, captureSize, 0, 0, captureSize, captureSize);
      };

    const originalRotation = controls.getRotation();
      const baseYaw = originalRotation.y;
      const basePitch = 0;
      try {
          controls.setRotation(basePitch, baseYaw + Math.PI / 2);
          await waitForAnimationFrames(3);
          drawFace('px');

          controls.setRotation(basePitch, baseYaw - Math.PI / 2);
          await waitForAnimationFrames(3);
          drawFace('nx');

          controls.setRotation(-Math.PI / 2, baseYaw);
          await waitForAnimationFrames(3);
          drawFace('py');

          controls.setRotation(Math.PI / 2, baseYaw);
          await waitForAnimationFrames(3);
          drawFace('ny');

          controls.setRotation(basePitch, baseYaw + Math.PI);
          await waitForAnimationFrames(3);
          drawFace('pz');

          controls.setRotation(basePitch, baseYaw);
          await waitForAnimationFrames(3);
          drawFace('nz');
      } finally {
          controls.setRotation(originalRotation.x, originalRotation.y);
          await waitForAnimationFrames(2);
          if (previousFov !== 90) {
              setFov(previousFov);
              await waitForFovToSettle(() => controls.getFov(), previousFov);
          }
      }

      const orderedFaceDataUrls = [
          faces.pz.toDataURL('image/png'),
          faces.px.toDataURL('image/png'),
          faces.nz.toDataURL('image/png'),
          faces.nx.toDataURL('image/png'),
          faces.py.toDataURL('image/png'),
          faces.ny.toDataURL('image/png'),
      ];

      return {
          atlasDataUrl: buildPanoramaAtlas(faces, captureSize),
          cubeFaces: orderedFaceDataUrls,
      };
  }, [fov]);

  const captureAndSavePanorama = useCallback(async () => {
      const desktopApi = window.atlasDesktop;
      if (isElectron && !desktopApi?.savePanorama) {
          logMsg('Desktop panorama API is unavailable.', 'error');
          return;
      }

      if (isCapturingPanorama) return;

      const suggestedName = `panorama-${new Date().toISOString().replace(/[T:.]/g, '-').slice(0, 19)}`;

      setIsCapturingPanorama(true);
      logMsg('Capturing panorama...', 'info');

      try {
          const captureResult = await capturePanoramaDataUrl();
          if (isElectron) {
              const savePanorama = desktopApi?.savePanorama;
              if (!savePanorama) {
                  throw new Error('Desktop panorama API is unavailable.');
              }

              const result = await savePanorama({
                  dataUrl: captureResult.atlasDataUrl,
                  cubeFaces: captureResult.cubeFaces,
                  suggestedName
              });

              if (result?.canceled) {
                  if (result?.error) logMsg(`Panorama save failed: ${result.error}`, 'error');
                  else logMsg('Panorama save canceled.', 'info');
                  return;
              }

              if (!result?.filePath) {
                  throw new Error('No file path returned from save dialog.');
              }

              const filePath = result.filePath;
              setMenuPanoramaPath(filePath);
              setMenuPanoramaLibrary(prev => prev.includes(filePath) ? prev : [filePath, ...prev]);
              setMenuPanoramaDataUrl(captureResult.atlasDataUrl);
              setMenuBackgroundMode('panorama');
              logMsg('Panorama saved and set as menu background.', 'success');
          } else {
              const webEntryId = `${WEB_PANORAMA_PREFIX}${suggestedName}.png`;
              const blob = await (await fetch(captureResult.atlasDataUrl)).blob();
              await saveWebPanoramaBlob(webEntryId, blob);
              setMenuPanoramaPath(webEntryId);
              setMenuPanoramaLibrary(prev => prev.includes(webEntryId) ? prev : [webEntryId, ...prev]);
              setMenuBackgroundMode('panorama');

              try {
                  const downloadUrl = URL.createObjectURL(blob);
                  const anchor = document.createElement('a');
                  anchor.href = downloadUrl;
                  anchor.download = `${suggestedName}.png`;
                  document.body.appendChild(anchor);
                  anchor.click();
                  anchor.remove();
                  URL.revokeObjectURL(downloadUrl);
              } catch {
                  // Ignore download failures in restricted browser contexts.
              }

              logMsg('Panorama captured, stored as blob, and downloaded as PNG.', 'success');
          }
      } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          logMsg(`Panorama capture failed: ${message}`, 'error');
      } finally {
          setIsCapturingPanorama(false);
      }
  }, [isElectron, isCapturingPanorama, capturePanoramaDataUrl, logMsg]);

  const setActivePanorama = useCallback((filePath: string) => {
      if (filePath === DEFAULT_PANORAMA_ID) {
          setMenuPanoramaPath(null);
          setMenuBackgroundMode('panorama');
          return;
      }
      setMenuPanoramaPath(filePath);
      setMenuBackgroundMode('panorama');
      setMenuPanoramaLibrary(prev => prev.includes(filePath) ? prev : [filePath, ...prev]);
  }, []);

  const removePanoramaFromLibrary = useCallback((filePath: string) => {
      setMenuPanoramaLibrary(prev => prev.filter(item => item !== filePath));
      setMenuPanoramaPath(prev => {
          if (prev !== filePath) return prev;
          setMenuPanoramaDataUrl(DEFAULT_MENU_PANORAMA_URL);
          setMenuBackgroundMode('panorama');
          return null;
      });
  }, []);

  const importPanoramaFromDisk = useCallback(async () => {
      if (!isElectron) {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/png,image/*';
          input.onchange = () => {
              const file = input.files?.[0];
              if (!file) return;

              const safeName = file.name.replace(/[\\/:*?"<>|]+/g, '_');
              const webEntryId = `${WEB_PANORAMA_PREFIX}${Date.now()}-${safeName}`;
              saveWebPanoramaBlob(webEntryId, file).then(() => {
                  setMenuPanoramaPath(webEntryId);
                  setMenuPanoramaLibrary(prev => prev.includes(webEntryId) ? prev : [webEntryId, ...prev]);
                  setMenuBackgroundMode('panorama');
                  logMsg('Panorama imported into blob storage.', 'success');
              }).catch(() => {
                  alert('Failed to import panorama file.');
              });
          };
          input.click();
          return;
      }
      const desktopApi = window.atlasDesktop;
      if (!desktopApi?.pickPanorama) {
          alert('Desktop panorama picker API is unavailable.');
          return;
      }

      const result = await desktopApi.pickPanorama();
      if (result?.canceled) return;
      if (result?.error) {
          alert(`Failed to pick panorama: ${result.error}`);
          return;
      }
      if (!result?.filePath) return;

      setActivePanorama(result.filePath);
  }, [isElectron, setActivePanorama, logMsg]);

  const deletePanoramaFromDisk = useCallback(async (filePath: string) => {
      if (!isElectron) {
          const fileName = filePath.replace(/^web:/, '');
          const confirmDelete = window.confirm(`Remove panorama from browser storage?\n\n${fileName}`);
          if (!confirmDelete) return;

          await deleteWebPanoramaBlob(filePath);
          removePanoramaFromLibrary(filePath);
          logMsg('Panorama removed from browser storage.', 'success');
          return;
      }

      const desktopApi = window.atlasDesktop;
      if (!desktopApi?.deletePanorama) {
          alert('Desktop delete API is unavailable.');
          return;
      }

      const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
      const confirmDelete = window.confirm(`Delete panorama file from disk?\n\n${fileName}`);
      if (!confirmDelete) return;

      const result = await desktopApi.deletePanorama(filePath);
      if (!result?.ok) {
          alert(`Failed to delete panorama: ${result?.error || 'Unknown error'}`);
          return;
      }

      removePanoramaFromLibrary(filePath);
      logMsg('Panorama deleted from disk.', 'success');
  }, [isElectron, removePanoramaFromLibrary, logMsg]);

  const toggleMenuBackgroundMode = useCallback(() => {
      if (menuBackgroundMode === 'dirt') {
          if (!menuPanoramaDataUrl) {
              alert(`No panorama is available yet. Capture one in-game with ${PANORAMA_CAPTURE_KEY}.`);
              return;
          }
          setMenuBackgroundMode('panorama');
          return;
      }
      setMenuBackgroundMode('dirt');
  }, [menuBackgroundMode, menuPanoramaDataUrl]);

  const executeCommand = useCallback((cmd: string) => {
      const parts = cmd.trim().split(' ');
      logMsg(`> ${cmd}`, 'info');
      
      if (parts[0] === '/gamemode' && parts[1]) {
          const mode = parts[1].toLowerCase();
          if (['creative', 'c', '1'].includes(mode)) { setGameMode('creative'); logMsg("Set game mode to Creative", 'success'); } 
          else if (['survival', 's', '0'].includes(mode)) { setGameMode('survival'); logMsg("Set game mode to Survival", 'success'); } 
          else if (['spectator', 'sp', '3'].includes(mode)) { setGameMode('spectator'); logMsg("Set game mode to Spectator", 'success'); } 
          else { logMsg("Unknown gamemode. Use survival/creative/spectator", 'error'); }
      } else if (parts[0] === '/music') {
          if (parts[1] === 'skip') {
              const skipped = musicController.skipTrack();
              if (skipped) {
                  logMsg('Skipping to the next song', 'success');
              } else {
                  logMsg('No music track available for the current context', 'error');
              }
          } else {
              logMsg('Usage: /music skip', 'error');
          }
      } else if (parts[0] === '/sound') {
          if (parts[1] === 'reload') {
              soundManager.init();
              logMsg("Reloaded sound manifest", 'success');
          } else if (parts[1] === 'volume') {
              const v = parseFloat(parts[2]);
              if (!isNaN(v)) {
                  soundManager.setVolume('master', v);
                  logMsg(`Set master volume to ${v}`, 'success');
              }
          }
      } else if (parts[0] === '/playsound' && parts[1]) {
          const id = parts[1];
          let pos = playerPosRef.current;
          if (parts.length >= 5) {
              const x = parseFloat(parts[2]);
              const y = parseFloat(parts[3]);
              const z = parseFloat(parts[4]);
              if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                  pos = new THREE.Vector3(x,y,z);
              }
          }
          soundManager.playAt(id, pos);
          logMsg(`Played ${id}`, 'info');
      } else if (parts[0] === '/time' && parts[1]) {
          const mode = parts[1];
          const val = parts[2];
          
          if (mode === 'set' && val) {
              let t = -1;
              if (val === 'day') t = 1000;
              else if (val === 'noon') t = 6000;
              else if (val === 'sunset') t = 12000;
              else if (val === 'night') t = 13000;
              else if (val === 'midnight') t = 18000;
              else if (val === 'sunrise') t = 23000;
              else t = parseInt(val);
              
              if (!isNaN(t) && t >= 0) {
                  worldManager.setTime(t);
                  logMsg(`Set time to ${t}`, 'success');
              } else {
                  logMsg(`Invalid time value: ${val}`, 'error');
              }
          } else if (mode === 'add' && val) {
              const add = parseInt(val);
              if (!isNaN(add)) {
                  worldManager.setTime(worldManager.getTime() + add);
                  logMsg(`Added ${add} to time`, 'success');
              } else {
                  logMsg(`Invalid amount: ${val}`, 'error');
              }
          } else if (mode === 'query') {
               logMsg(`Time is ${worldManager.getTime()}`, 'info');
          } else {
              logMsg("Usage: /time set <value|day|night> or /time add <value>", 'error');
          }
      } else if (parts[0] === '/phase' && parts[1] === 'set' && parts[2]) {
          const phase = parseInt(parts[2]);
          if (!isNaN(phase) && phase >= 0 && phase <= 7 && dayNightRef.current) {
              dayNightRef.current.setPhase(phase);
              logMsg(`Set moon phase to ${phase}`, 'success');
          } else {
              logMsg("Usage: /phase set <0-7>", 'error');
          }
      } else if (parts[0] === '/tp' && parts.length === 4) {
          const x = parseFloat(parts[1]);
          const y = parseFloat(parts[2]);
          const z = parseFloat(parts[3]);
          if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
              if (playerRef.current) {
                  playerRef.current.teleport(new THREE.Vector3(x, y, z));
                  logMsg(`Teleported to ${x}, ${y}, ${z}`, 'success');
              }
          } else {
              logMsg("Usage: /tp <x> <y> <z>", 'error');
          }
      } else if (parts[0] === '/locate') {
          if (parts[1] === 'biome' && parts[2]) {
              worldManager.locateBiome(parts[2], playerPosRef.current.x, playerPosRef.current.z);
          } else {
              logMsg("Usage: /locate biome <biomeName>", 'error');
          }
      } else if (parts[0] === '/shootingstar') {
          if (parts[1] === 'spawn') {
              if (typeof window !== 'undefined') {
                  window.dispatchEvent(new Event('atlas:shootingstar:spawn'));
              }
              logMsg('Spawned a shooting star', 'success');
          } else {
              logMsg('Usage: /shootingstar spawn', 'error');
          }
      } else if (parts[0] === '/bloodmoon') {
          const targetCycle = (() => {
              const mode = parts[2] === 'next' ? 'next' : 'current';
              const cycle = getMoonCycleIndex(worldManager.getTime());
              return mode === 'next' ? cycle + 1 : cycle;
          })();

          if (parts[1] === 'force') {
              setBloodMoonOverride(targetCycle, true);
              const scope = targetCycle === getMoonCycleIndex(worldManager.getTime()) ? 'current' : 'next';
              logMsg(`Forced a blood moon for the ${scope} lunar cycle`, 'success');
          } else if (parts[1] === 'clear') {
              clearBloodMoonOverride(targetCycle);
              const scope = targetCycle === getMoonCycleIndex(worldManager.getTime()) ? 'current' : 'next';
              logMsg(`Cleared blood moon override for the ${scope} lunar cycle`, 'success');
          } else if (parts[1] === 'query') {
              const currentCycle = getMoonCycleIndex(worldManager.getTime());
              const currentEvent = getLunarNightEventState(worldManager.getTime(), 24000, worldManager.getSeed());
              const nextTicks = (currentCycle + 1) * 24000;
              const nextEvent = getLunarNightEventState(nextTicks, 24000, worldManager.getSeed());
              const currentOverride = hasBloodMoonOverride(currentCycle) ? 'override' : 'natural';
              const nextOverride = hasBloodMoonOverride(currentCycle + 1) ? 'override' : 'natural';
              logMsg(`Current cycle: ${currentEvent.eventId} (${currentOverride}), next cycle: ${nextEvent.eventId} (${nextOverride})`, 'info');
          } else {
              logMsg('Usage: /bloodmoon <force|clear|query> [current|next]', 'error');
          }
      } else { logMsg(`Unknown command: ${parts[0]}`, 'error'); }
      if (commandValue.trim()) {
          commandHistoryRef.current = [commandValue.trim(), ...commandHistoryRef.current];
          setHistoryIndex(-1);
      }
      setCommandValue(''); 
      setShowSuggestions(false);
      resumeGame();
  }, [commandValue, logMsg, resumeGame]);

  const updateAutocomplete = useCallback((input: string) => {
      const parts = input.trim().split(' ');
      let newCandidates: string[] = [];
      
      if (input.trim() === '' || (parts.length === 1 && !input.endsWith(' '))) {
          const prefix = input.trim();
          newCandidates = COMMANDS.filter(c => c.startsWith(prefix));
      } 
      else if ((parts.length === 1 && input.endsWith(' ')) || (parts.length === 2 && !input.endsWith(' '))) {
          const cmd = parts[0];
          const prefix = parts[1] || '';
          if (SUBCOMMANDS[cmd]) {
              newCandidates = SUBCOMMANDS[cmd].filter(sc => sc.startsWith(prefix));
          }
      }
      else if ((parts.length === 2 && input.endsWith(' ')) || (parts.length === 3 && !input.endsWith(' '))) {
          const cmdContext = `${parts[0]} ${parts[1]}`;
          const prefix = parts[2] || '';
          
          if (parts[0] === '/locate' && parts[1] === 'biome') {
              newCandidates = Object.keys(BIOMES).map(k => BIOMES[k].id).filter(id => id.startsWith(prefix));
          } else if (ARGUMENT_OPTIONS[cmdContext]) {
              newCandidates = ARGUMENT_OPTIONS[cmdContext].filter(opt => opt.startsWith(prefix));
          }
      }

      setAcCandidates(newCandidates);
      setAcIndex(0);
      setShowSuggestions(newCandidates.length > 0);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isEditableTarget = isEditableElement(e.target);

    if (e.code === 'F3') { e.preventDefault(); setShowDebug(prev => !prev); return; }
    if (e.code === 'F4') { 
        e.preventDefault(); 
        if (showAtlasViewer) {
            setShowAtlasViewer(false);
            isAtlasViewerOpenRef.current = false;
            resumeGame();
        } else {
            setShowAtlasViewer(true);
            isAtlasViewerOpenRef.current = true;
            enterUIMode();
        }
        return; 
    }
    
    if (showCommandInput) {
        if (isEditableTarget && !['ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Escape'].includes(e.key)) {
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (showSuggestions && acCandidates.length > 0) { setAcIndex(prev => (prev + 1) % acCandidates.length); return; }
            const hist = commandHistoryRef.current;
            if (hist.length > 0) {
                const newIdx = Math.min(historyIndex + 1, hist.length - 1);
                setHistoryIndex(newIdx);
                setCommandValue(hist[newIdx]);
            }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (showSuggestions && acCandidates.length > 0) { setAcIndex(prev => (prev - 1 + acCandidates.length) % acCandidates.length); return; }
            if (historyIndex > 0) {
                const newIdx = historyIndex - 1;
                setHistoryIndex(newIdx);
                setCommandValue(commandHistoryRef.current[newIdx]);
            } else {
                setHistoryIndex(-1);
                setCommandValue('');
            }
            return;
        }
        if (e.key === 'Tab') {
            e.preventDefault();
            if (showSuggestions && acCandidates.length > 0) {
                const candidate = acCandidates[acIndex];
                const parts = commandValue.trim().split(' ');
                
                if (commandValue.endsWith(' ')) {
                    parts.push(candidate);
                } else {
                    parts[parts.length - 1] = candidate;
                }
                
                setCommandValue(parts.join(' ') + ' ');
                updateAutocomplete(parts.join(' ') + ' ');
            }
            return;
        }
    }

    if (appState !== 'game') return;
    if (isEditableTarget && e.key !== 'Escape') return;

    if (e.code === PANORAMA_CAPTURE_KEY) {
        e.preventDefault();
        if (!isPaused && !openContainer && !showCommandInput && !isDead && !isSleeping && !showAtlasViewer) {
            void captureAndSavePanorama();
        } else {
            logMsg('Panorama capture only works while actively in-game.', 'error');
        }
        return;
    }

    if (isCapturingPanorama) {
        e.preventDefault();
        return;
    }

    if (relockWantedRef.current && wantsGameplayRef.current && e.key !== 'Escape') { requestPointerLockBurst('any-key'); }
    if (e.key === 'Escape') {
        if (escapeHeldRef.current) { e.preventDefault(); e.stopPropagation(); return; }
        escapeHeldRef.current = true;
        e.preventDefault(); e.stopPropagation();
        if (isDead || deathScreenActiveRef.current) return;
        
        if (showAtlasViewer) {
            setShowAtlasViewer(false);
            isAtlasViewerOpenRef.current = false;
            resumeGame({ deferPointerLock: true });
            return;
        }

        if (showCommandInput) {
            if (showSuggestions) { setShowSuggestions(false); return; }
            setShowCommandInput(false); setCommandValue(''); isCommandOpenRef.current = false; resumeGame({ deferPointerLock: true }); return; 
        }

        if (openContainer) { closeInventory({ deferPointerLock: true }); return; }
        if (isSleeping) { setIsSleeping(false); return; } 
        if (isPaused) { setIsPaused(false); wantsGameplayRef.current = true; relockWantedRef.current = true; suppressAutoPauseFor(350); requestPointerLockBurst('pause-escape', { force: true }); return; }
        
        // PAUSE: Save Immediately
        saveGame();
        
        setIsPaused(true); enterUIMode(); return;
    }
    if (showCommandInput) { 
        if (e.key === 'Enter') { e.preventDefault(); if (commandValue.trim()) executeCommand(commandValue); else resumeGame(); } 
        return; 
    }
    if ((e.key === '/' || e.key === 't' || e.key === 'T') && !openContainer && !isPaused && !isDead && !isSleeping && !showAtlasViewer) { e.preventDefault(); setShowCommandInput(true); setCommandValue(e.key === '/' ? '/' : ''); setHistoryIndex(-1); isCommandOpenRef.current = true; enterUIMode(); return; }
    if (e.code.startsWith('Digit') && !isDead && !openContainer) { const val = parseInt(e.code.replace('Digit', '')) - 1; if (val >= 0 && val < 9) { setSelectedSlot(val); soundManager.play("ui.click", { pitch: 1.5 }); } }
    if (e.code === 'KeyQ' && !isDead && !openContainer && !showCommandInput) { if (inventory[selectedSlot] && controlsRef.current) { const dropAll = e.ctrlKey || e.metaKey; handleInventoryAction('drop_key', 'inventory', selectedSlot, { dropAll }); } }
    if (e.code === 'KeyE' && !isDead) { if (openContainer) { e.preventDefault(); closeInventory(); } else if (isLocked && !isPaused && gameMode !== 'spectator' && !isSleeping) { e.preventDefault(); openInventory(); } }
  }, [showCommandInput, openContainer, isPaused, isDead, isSleeping, showAtlasViewer, closeInventory, resumeGame, enterUIMode, openInventory, commandValue, gameMode, isLocked, requestPointerLockBurst, suppressAutoPauseFor, inventory, selectedSlot, handleInventoryAction, acCandidates, acIndex, showSuggestions, appState, saveGame, captureAndSavePanorama, isCapturingPanorama, historyIndex, executeCommand, updateAutocomplete, logMsg]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(MENU_BACKGROUND_MODE_KEY, menuBackgroundMode);
  }, [menuBackgroundMode]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      if (menuPanoramaPath) {
          window.localStorage.setItem(MENU_PANORAMA_PATH_KEY, menuPanoramaPath);
      } else {
          window.localStorage.removeItem(MENU_PANORAMA_PATH_KEY);
      }
  }, [menuPanoramaPath]);

  // On first launch (no saved panorama), seed the default built-in panorama path
  useEffect(() => {
      if (!isElectron) return;
      const desktopApi = window.atlasDesktop;
      if (!desktopApi?.getDefaultPanoramaPath) return;
      if (window.localStorage.getItem(MENU_PANORAMA_PATH_KEY)) return;
      desktopApi.getDefaultPanoramaPath().then((result: { filePath: string | null }) => {
          if (result?.filePath) {
              setMenuPanoramaPath(result.filePath);
          }
      });
  }, [isElectron]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(MENU_PANORAMA_LIBRARY_KEY, JSON.stringify(menuPanoramaLibrary));
  }, [menuPanoramaLibrary]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      try {
          if (menuPanoramaPath?.startsWith(WEB_PANORAMA_PREFIX)) {
              window.localStorage.removeItem(MENU_PANORAMA_DATA_KEY);
              return;
          }
          if (menuPanoramaDataUrl) {
              window.localStorage.setItem(MENU_PANORAMA_DATA_KEY, menuPanoramaDataUrl);
          } else {
              window.localStorage.removeItem(MENU_PANORAMA_DATA_KEY);
          }
      } catch {
          // Ignore storage quota or browser storage failures.
      }
  }, [menuPanoramaDataUrl, menuPanoramaPath]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(MENU_PANORAMA_BLUR_KEY, String(menuPanoramaBlur));
  }, [menuPanoramaBlur]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(MENU_PANORAMA_GRADIENT_KEY, String(menuPanoramaGradient));
  }, [menuPanoramaGradient]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(MENU_PANORAMA_ROTATION_SPEED_KEY, String(menuPanoramaRotationSpeed));
  }, [menuPanoramaRotationSpeed]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(SETTINGS_RENDER_DISTANCE_KEY, String(renderDistance));
  }, [renderDistance]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(SETTINGS_FOV_KEY, String(fov));
  }, [fov]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(SETTINGS_BRIGHTNESS_KEY, String(brightness));
  }, [brightness]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(SETTINGS_WORKERS_ENABLED_KEY, String(workersEnabled));
  }, [workersEnabled]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(SETTINGS_SHADOWS_ENABLED_KEY, String(shadowsEnabled));
  }, [shadowsEnabled]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(SETTINGS_CLOUDS_ENABLED_KEY, String(cloudsEnabled));
  }, [cloudsEnabled]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(SETTINGS_MIPMAPS_ENABLED_KEY, String(mipmapsEnabled));
  }, [mipmapsEnabled]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(SETTINGS_ANTIALIASING_KEY, String(antialiasing));
  }, [antialiasing]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(SETTINGS_MAX_FPS_KEY, String(maxFps));
  }, [maxFps]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(SETTINGS_VSYNC_KEY, String(vsync));
  }, [vsync]);

  useEffect(() => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(SETTINGS_CHUNK_FADE_ENABLED_KEY, String(chunkFadeEnabled));
  }, [chunkFadeEnabled]);

  useEffect(() => {
      let disposed = false;
      const desktopApi = window.atlasDesktop;

      const revokeCurrentWebObjectUrl = () => {
          if (webPanoramaObjectUrlRef.current) {
              URL.revokeObjectURL(webPanoramaObjectUrlRef.current);
              webPanoramaObjectUrlRef.current = null;
          }
      };

      if (!menuPanoramaPath) {
          revokeCurrentWebObjectUrl();
          setMenuPanoramaDataUrl(DEFAULT_MENU_PANORAMA_URL);
          setMenuPanoramaFaceDataUrls(null);
          return;
      }

      if (!isElectron) {
          if (menuPanoramaPath.startsWith(WEB_PANORAMA_PREFIX)) {
              setMenuPanoramaFaceDataUrls(null);
              void (async () => {
                  try {
                      const blob = await readWebPanoramaBlob(menuPanoramaPath);
                      if (disposed) return;

                      revokeCurrentWebObjectUrl();

                      if (!blob) {
                          setMenuPanoramaDataUrl(DEFAULT_MENU_PANORAMA_URL);
                          setMenuPanoramaLibrary(prev => prev.filter((entry) => entry !== menuPanoramaPath));
                          setMenuPanoramaPath(prev => (prev === menuPanoramaPath ? null : prev));
                          setMenuBackgroundMode('panorama');
                          return;
                      }

                      const objectUrl = URL.createObjectURL(blob);
                      webPanoramaObjectUrlRef.current = objectUrl;
                      setMenuPanoramaDataUrl(objectUrl);
                  } catch {
                      if (!disposed) {
                          revokeCurrentWebObjectUrl();
                          setMenuPanoramaDataUrl(DEFAULT_MENU_PANORAMA_URL);
                      }
                  }
              })();
          } else {
              revokeCurrentWebObjectUrl();
              setMenuPanoramaDataUrl(DEFAULT_MENU_PANORAMA_URL);
          }
          return;
      }

      if (!desktopApi?.readPanorama) {
          return;
      }
      const readPanorama = desktopApi.readPanorama;

      const normalized = menuPanoramaPath.replace(/\\/g, '/');
      const slash = normalized.lastIndexOf('/');
      const directory = slash >= 0 ? normalized.slice(0, slash) : '';
      const fileName = slash >= 0 ? normalized.slice(slash + 1) : normalized;
      const dot = fileName.lastIndexOf('.');
      const baseName = dot > 0 ? fileName.slice(0, dot) : fileName;
      const sidecarBase = directory ? `${directory}/${baseName}_panorama` : `${baseName}_panorama`;
      const facePaths = Array.from({ length: 6 }, (_, i) => `${sidecarBase}/panorama_${i}.png`);

      (async () => {
          try {
              const [atlasRead, faceReads] = await Promise.all([
                  readPanorama(menuPanoramaPath),
                  Promise.all(facePaths.map((facePath) => readPanorama(facePath))).catch(() => null)
              ]);

              if (disposed) return;

              if (atlasRead?.ok && atlasRead?.dataUrl) {
                  setMenuPanoramaDataUrl(atlasRead.dataUrl);
              }

              if (faceReads && faceReads.every((face) => face?.ok && face?.dataUrl)) {
                  setMenuPanoramaFaceDataUrls(faceReads.map((face) => face.dataUrl!));
              } else {
                  setMenuPanoramaFaceDataUrls(null);
              }
          } catch {
              if (!disposed) setMenuPanoramaFaceDataUrls(null);
          }
      })();

      return () => {
          disposed = true;
          if (!isElectron) {
              revokeCurrentWebObjectUrl();
          }
      };
    }, [isElectron, menuPanoramaPath]);

  useEffect(() => {
      return () => {
          if (webPanoramaObjectUrlRef.current) {
              URL.revokeObjectURL(webPanoramaObjectUrlRef.current);
              webPanoramaObjectUrlRef.current = null;
          }
      };
  }, []);

  useEffect(() => { window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }, [handleKeyDown]);

  useEffect(() => {
      if (isElectron) return;

      const shouldBlockBrowserShortcuts = appState === 'game'
          && !openContainer
          && !isPaused
          && isLocked
          && !showCommandInput
          && !isDead
          && !isSleeping
          && !showAtlasViewer
          && !isCapturingPanorama;

      if (!shouldBlockBrowserShortcuts) return;

      const blockBrowserShortcut = (event: KeyboardEvent) => {
          if (!(event.ctrlKey || event.metaKey || event.altKey)) return;

          event.preventDefault();
      };

      const blockZoomWheel = (event: WheelEvent) => {
          if (!(event.ctrlKey || event.metaKey)) return;
          event.preventDefault();
      };

      window.addEventListener('keydown', blockBrowserShortcut, { capture: true });
      window.addEventListener('wheel', blockZoomWheel, { capture: true, passive: false });

      return () => {
          window.removeEventListener('keydown', blockBrowserShortcut, { capture: true } as EventListenerOptions);
          window.removeEventListener('wheel', blockZoomWheel, { capture: true } as EventListenerOptions);
      };
  }, [appState, openContainer, isPaused, isLocked, showCommandInput, isDead, isSleeping, showAtlasViewer, isCapturingPanorama, isElectron]);

  useEffect(() => {
      const shouldHoldShortcutLock = !isElectron
          && appState === 'game'
          && !openContainer
          && !isPaused
          && isLocked
          && !showCommandInput
          && !isDead
          && !isSleeping
          && !showAtlasViewer
          && !isCapturingPanorama;

      if (!shouldHoldShortcutLock) {
          unlockBrowserShortcuts();
      }

      return () => {
          if (!shouldHoldShortcutLock) {
              unlockBrowserShortcuts();
          }
      };
  }, [appState, openContainer, isPaused, isLocked, showCommandInput, isDead, isSleeping, showAtlasViewer, isCapturingPanorama, isElectron, unlockBrowserShortcuts]);

  useEffect(() => () => unlockBrowserShortcuts(), [unlockBrowserShortcuts]);

  useEffect(() => {
      if (!isCapturingPanorama) return;

      resetInputState();

      const block = (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
      };

      const eventTypes: Array<keyof WindowEventMap> = [
          'keydown',
          'keyup',
          'mousedown',
          'mouseup',
          'mousemove',
          'wheel',
          'click',
          'dblclick',
          'contextmenu',
          'pointerdown',
          'pointerup',
          'pointermove',
      ];

      for (const type of eventTypes) {
          window.addEventListener(type, block as EventListener, { capture: true, passive: false });
      }

      return () => {
          for (const type of eventTypes) {
              window.removeEventListener(type, block as EventListener, { capture: true });
          }
          resetInputState();
      };
  }, [isCapturingPanorama]);

  const handleRespawn = () => {
    soundManager.play("ui.click");
    setShowDeathScreen(false);
    deathScreenActiveRef.current = false;
    setHealth(20); setHunger(20); setSaturation(5); foodStateRef.current = createFoodState(); setBreath(MAX_BREATH); setRespawnKey(prev => prev + 1); setIsOnFire(false);
    
    // 1. Try Bed Spawn
    let spawn = null as { x: number, y: number, z: number } | null;
    const bedSpawn = worldManager.getSpawnPoint();
    if (bedSpawn) {
        worldManager.ensureChunk(Math.floor(bedSpawn.x / CHUNK_SIZE), Math.floor(bedSpawn.z / CHUNK_SIZE));
        const bedType = worldManager.getBlock(Math.floor(bedSpawn.x), Math.floor(bedSpawn.y), Math.floor(bedSpawn.z), false);
        if (bedType === BlockType.BED_FOOT || bedType === BlockType.BED_HEAD) {
            spawn = worldManager.findSafeSpawnPosition(bedSpawn.x, bedSpawn.z);
        } else {
            worldManager.clearSpawnPoint();
        }
    }
    
    // 2. Try World Spawn (Safe Surface)
    if (!spawn) {
        const worldSpawn = worldManager.getWorldSpawn();
        if (worldSpawn) {
            spawn = worldManager.findSafeSpawnPosition(worldSpawn.x, worldSpawn.z);
        }
    }

    // 3. Fallback: use seed-derived center instead of (0,0)
    if (!spawn) {
        const center = getSpawnSearchCenter(worldManager.getSeed());
        const safe = worldManager.findSafeSpawnPosition(center.x, center.z);
        spawn = { x: safe.x, y: safe.y, z: safe.z };
        worldManager.setWorldSpawn(safe.x, safe.y, safe.z);
    }

    // Ensure the chunk exists so we don't fall through
    if (spawn) {
        const cx = Math.floor(spawn.x / CHUNK_SIZE);
        const cz = Math.floor(spawn.z / CHUNK_SIZE);
        worldManager.ensureChunk(cx, cz);
    }

    const spawnVec = new THREE.Vector3(spawn!.x, spawn!.y, spawn!.z);
    
    setCurrentSpawnPos(spawnVec);
    playerPosRef.current.copy(spawnVec);
    resumeFromUserGesture('respawn');
  };

  const handleQuitToTitle = useCallback(() => {
      saveGame().then(() => {
          soundManager.setGamePaused(false, 2.5);
          setAppState('menu');
          setOpenContainer(null);
          setShowCommandInput(false);
          setShowAtlasViewer(false);
          setIsPaused(false);
          lastAppliedChunkKeyRef.current = null;
          activeWorldIdRef.current = null;
          activeWorldGenConfigRef.current = null;
          worldManager.reset();
          musicController.update(true, 'survival', 'plains');
          soundManager.play("ui.click");
      });
  }, [saveGame, setOpenContainer]);

  // --- Start Game with Preloading & Restore ---
  const handleStartGame = useCallback(async (worldId: string) => {
      soundManager.play("ui.click");
      
      setAppState('loading');
      setLoadingState({ phase: 'Loading Metadata...', percent: 0, details: '' });

      // 1. Load Metadata
      const meta = await WorldStorage.getWorldMeta(worldId);
      if (!meta) {
          alert("Failed to load world");
          setAppState('menu');
          return;
      }

      activeWorldIdRef.current = worldId;

      resetGenConfig();
      if (meta.worldGenConfig) {
          const loaded = loadGenConfig(meta.worldGenConfig);
          if (!loaded) {
              console.warn('[WorldGen] Failed to load world generation config preset; using defaults.');
          }
      }
      
      // Store the world's GenConfig so it can be restored after World Editor visits
      activeWorldGenConfigRef.current = meta.worldGenConfig ? JSON.parse(JSON.stringify(meta.worldGenConfig)) : null;
      
      // 2. Configure World Manager
      worldManager.reset();
      worldManager.setWorldContext(worldId, meta.seedNum);

      if (meta.worldSpawn) {
          worldManager.setWorldSpawn(meta.worldSpawn.x, meta.worldSpawn.y, meta.worldSpawn.z);
      }
      if (meta.spawnPoint) {
          worldManager.setSpawnPoint(meta.spawnPoint.x, meta.spawnPoint.y, meta.spawnPoint.z, false);
      }
      
      setGameMode(meta.gameMode);
      worldManager.setTime(meta.time);

      // 3. Restore Player State (if exists)
      if (meta.player) {
          setHealth(meta.player.health);
          setHunger(meta.player.hunger);
          setSaturation(meta.player.saturation);
          setBreath(meta.player.breath);
          setInventory(meta.player.inventory);
          setSelectedSlot(meta.player.selectedSlot);
          
          const pos = meta.player.position;
          const spawnVec = new THREE.Vector3(pos.x, pos.y, pos.z);

          if (meta.player.rotation) {
              pendingCameraRotationRef.current = {
                  x: meta.player.rotation.x,
                  y: meta.player.rotation.y
              };
          }
          
          setCurrentSpawnPos(spawnVec);
          playerPosRef.current.copy(spawnVec);
      } else {
          // New World Logic
          setInventory(Array(36).fill(null)); 
          setCursorStack(null);
          setHealth(20); setHunger(20); setSaturation(5); setBreath(MAX_BREATH);
          
          // Use seed-aware spawn search
          const safePos = worldManager.findBestInitialSpawn();
          const safeVec = new THREE.Vector3(safePos.x, safePos.y, safePos.z);
          worldManager.setWorldSpawn(safePos.x, safePos.y, safePos.z);
          
          setCurrentSpawnPos(safeVec);
          playerPosRef.current.copy(safeVec);
          pendingCameraRotationRef.current = null;
      }

      // 4. Trigger Preload of surrounding chunks
      const px = playerPosRef.current.x;
      const pz = playerPosRef.current.z;
      const cx = Math.floor(px / CHUNK_SIZE);
      const cz = Math.floor(pz / CHUNK_SIZE);
      
      const preloadRadius = Math.min(renderDistance, 8);
      await worldManager.preloadSpawnArea(cx, cz, preloadRadius, (phase, done, total, percent) => {
          setLoadingState({ phase, percent, details: `${done} / ${total} chunks` });
      });

      // 5. Finalize
      {
          const bx = Math.floor(playerPosRef.current.x);
          const by = Math.floor(playerPosRef.current.y);
          const bz = Math.floor(playerPosRef.current.z);
          const biome = getBiome(bx, bz);
          const inCaves = shouldUseCaveMusic(bx, by, bz);
          const inBloodMoon = isBloodMoonMusicActive(worldManager.getTime(), 24000, worldManager.getSeed());
          musicController.forcePlayForWorldEntry(meta.gameMode, biome.id, inCaves, inBloodMoon);
      }

      setAppState('game');
      setIsPaused(false);
      wantsGameplayRef.current = true;
      relockWantedRef.current = true;
      suppressAutoPauseFor(500);
      requestPointerLockBurst('start-game', { force: true });
    }, [requestPointerLockBurst, suppressAutoPauseFor, renderDistance, setCursorStack, setInventory]);

  useEffect(() => {
      if (appState !== 'game') return;
      if (isLocked) return;
      if (isPaused || openContainer || showCommandInput || isDead || isSleeping || showAtlasViewer || isCapturingPanorama) return;
      if (!relockWantedRef.current && !wantsGameplayRef.current) return;
      requestPointerLockBurst('gameplay-auto', { force: true });
  }, [appState, isLocked, isPaused, openContainer, showCommandInput, isDead, isSleeping, showAtlasViewer, isCapturingPanorama, requestPointerLockBurst]);

  const quitApp = useCallback(() => {
    if (isElectron) {
      window.close();
    }
  }, [isElectron]);

  const handleInventoryContainerChange = useCallback((val: OpenContainerState) => {
      if (val === null) {
          closeInventory();
          return;
      }
      setOpenContainer(val);
      isInventoryOpenRef.current = true;
      enterUIMode();
  }, [closeInventory, enterUIMode, setOpenContainer]);

  const handleInteractionContainerOpen = useCallback((val: OpenContainerState) => {
      setOpenContainer(val);
      isInventoryOpenRef.current = !!val;
      if (val) {
          enterUIMode();
      }
  }, [enterUIMode, setOpenContainer]);

  const handleSpawnDrop = useCallback((type: BlockType, x: number, y: number, z: number) => {
      worldManager.spawnDrop(type, x, y, z);
  }, []);

  let overlayColor = 'transparent';
  if (headBlockType === BlockType.WATER) overlayColor = 'rgba(0, 0, 100, 0.4)';
  else if (headBlockType === BlockType.LAVA) overlayColor = 'rgba(255, 50, 0, 0.8)';

      const hideGameplayCursor =
          appState === 'game' &&
          !isPaused &&
          !openContainer &&
          !showCommandInput &&
          !showAtlasViewer &&
          !isDead &&
          !showDeathScreen &&
          !isSleeping;

  return (
        <div className={`w-full h-full relative font-sans text-white select-none outline-none ${hideGameplayCursor ? 'cursor-none' : 'cursor-auto'}`} tabIndex={0} autoFocus onClick={handleGameClick}>
      {fatalError && <ErrorOverlay error={fatalError} playerPos={playerPosRef.current} />}

      {!bootReady && (
          <LoadingScreen 
              phase={loadingState.phase || 'Initializing'}
              percent={loadingState.percent}
              details={loadingState.details || 'Preparing game'}
              backgroundMode={menuBackgroundMode}
              panoramaBackgroundDataUrl={menuPanoramaDataUrl}
              panoramaFaceDataUrls={menuPanoramaFaceDataUrls}
              panoramaBlur={menuPanoramaBlur}
              panoramaGradient={menuPanoramaGradient}
              panoramaRotationSpeed={menuPanoramaRotationSpeed}
          />
      )}

      {bootReady && (appState === 'menu' || appState === 'options' || appState === 'chunkbase' || appState === 'featureEditor') && (
          <div className="absolute inset-0 z-[10] pointer-events-none">
              <MenuPanoramaBackground
                  backgroundMode={menuBackgroundMode}
                  panoramaBackgroundDataUrl={menuPanoramaDataUrl}
                  panoramaFaceDataUrls={menuPanoramaFaceDataUrls}
                  panoramaBlur={menuPanoramaBlur}
                  panoramaGradient={menuPanoramaGradient}
                  panoramaRotationSpeed={menuPanoramaRotationSpeed}
              />
          </div>
      )}

      {bootReady && appState === 'menu' && (
          <MainMenu 
              onStart={handleStartGame}
              onChunkBase={() => setAppState('chunkbase')}
              onFeatureEditor={() => setAppState('featureEditor')}
              onOptions={(opts) => {
                  setOpenOptionsInHelp(!!opts?.openTutorial);
                  setAppState('options');
              }}
              onQuit={isElectron ? quitApp : undefined}
              backgroundMode={menuBackgroundMode}
              panoramaBackgroundDataUrl={menuPanoramaDataUrl}
              panoramaFaceDataUrls={menuPanoramaFaceDataUrls}
              hasPanoramaBackground={!!menuPanoramaDataUrl}
              onToggleBackground={toggleMenuBackgroundMode}
              panoramaCaptureHotkey={PANORAMA_CAPTURE_KEY}
              panoramaEntries={[...menuPanoramaLibrary, DEFAULT_PANORAMA_ID]}
              activePanoramaPath={menuPanoramaPath ?? DEFAULT_PANORAMA_ID}
              defaultPanoramaId={DEFAULT_PANORAMA_ID}
              onUsePanorama={setActivePanorama}
              onImportPanorama={importPanoramaFromDisk}
              canImportPanorama={true}
              onDeletePanoramaFromDisk={deletePanoramaFromDisk}
              canDeletePanoramaFromDisk={true}
              panoramaBlur={menuPanoramaBlur}
              panoramaGradient={menuPanoramaGradient}
              setPanoramaBlur={setMenuPanoramaBlur}
              setPanoramaGradient={setMenuPanoramaGradient}
              panoramaRotationSpeed={menuPanoramaRotationSpeed}
              setPanoramaRotationSpeed={setMenuPanoramaRotationSpeed}
              showBackground={false}
          />
      )}

      {bootReady && appState === 'featureEditor' && (
          <FeatureEditor onBack={() => setAppState('menu')} />
      )}

      {bootReady && appState === 'loading' && (
          <LoadingScreen 
              phase={loadingState.phase} 
              percent={loadingState.percent} 
              details={loadingState.details} 
              backgroundMode={menuBackgroundMode}
              panoramaBackgroundDataUrl={menuPanoramaDataUrl}
              panoramaFaceDataUrls={menuPanoramaFaceDataUrls}
              panoramaBlur={menuPanoramaBlur}
              panoramaGradient={menuPanoramaGradient}
              panoramaRotationSpeed={menuPanoramaRotationSpeed}
          />
      )}

      {bootReady && appState === 'options' && (
          <PauseMenu
              isMainMenu={true}
              onResume={() => {
                  setOpenOptionsInHelp(false);
                  setAppState('menu');
              }} 
              renderDistance={renderDistance} setRenderDistance={setRenderDistance} fov={fov} setFov={setFov}
              shadowsEnabled={shadowsEnabled} setShadowsEnabled={setShadowsEnabled} mipmapsEnabled={mipmapsEnabled} setMipmapsEnabled={setMipmapsEnabled}
              cloudsEnabled={cloudsEnabled} setCloudsEnabled={setCloudsEnabled}
              antialiasing={antialiasing} setAntialiasing={(val) => safeSetSetting(setAntialiasing, val)}
              chunkFadeEnabled={chunkFadeEnabled} setChunkFadeEnabled={setChunkFadeEnabled}
              maxFps={maxFps} setMaxFps={setMaxFps} vsync={vsync} setVsync={(val) => safeSetSetting(setVsync, val)} brightness={brightness} setBrightness={setBrightness}
              initialScreen={openOptionsInHelp ? 'tutorial' : 'main'}
              onTutorialClose={openOptionsInHelp ? () => { setOpenOptionsInHelp(false); setAppState('menu'); } : undefined}
              panoramaBlur={menuPanoramaBlur}
              panoramaGradient={menuPanoramaGradient}
              panoramaRotationSpeed={menuPanoramaRotationSpeed}
              backgroundMode={menuBackgroundMode}
              panoramaBackgroundDataUrl={menuPanoramaDataUrl}
              panoramaFaceDataUrls={menuPanoramaFaceDataUrls}
              showMenuBackground={false}
          />
      )}

    {bootReady && appState === 'chunkbase' && <ChunkBase onBack={() => {
        // Always restore or reset GenConfig when closing World Editor
        if (activeWorldIdRef.current && activeWorldGenConfigRef.current) {
            // Restore the active world's custom config
            resetGenConfig();
            loadGenConfig(activeWorldGenConfigRef.current);
            console.log('[WorldEditor] Restored active world\'s GenConfig');
        } else if (activeWorldIdRef.current && !activeWorldGenConfigRef.current) {
            // Active world has no custom config, reset to defaults
            resetGenConfig();
            console.log('[WorldEditor] Reset to defaults for active world');
        } else {
            // No world loaded - reset to defaults to prevent parameter pollution
            resetGenConfig();
            console.log('[WorldEditor] Reset to defaults (no world loaded)');
        }
        setAppState('menu');
    }} />}

      {/* Game Scene (Visible during Loading to run Preload, but hidden by overlay) */}
      {(appState === 'game' || appState === 'loading') && (
          <>
            {appState === 'game' && (
                <>
                    <div className="absolute inset-0 z-30 pointer-events-none transition-colors duration-300" style={{ backgroundColor: overlayColor }} />
                    {isOnFire && !isDead && <FireOverlay />}
                    {showDeathScreen && <DeathScreen onRespawn={handleRespawn} />}
                    {isSleeping && <div className="absolute inset-0 z-[100] bg-black animate-in fade-in duration-[3000ms] flex items-center justify-center"><span className="text-white text-2xl font-bold animate-pulse">Sleeping...</span></div>}
                    {showDebug && <DebugScreen playerPosRef={playerPosRef} cameraRef={controlsRef} dropsCount={drops.length} chunksCount={renderedChunks.length} renderDistance={renderDistance} fpsRef={fpsRef} />}
                    {showAtlasViewer && <TextureAtlasViewer onClose={() => { setShowAtlasViewer(false); isAtlasViewerOpenRef.current = false; resumeGame(); }} />}
                    {!openContainer && !showCommandInput && !showDeathScreen && !showAtlasViewer && <HUD health={health} hunger={hunger} saturation={saturation} breath={breath} inventory={inventory} selectedSlot={selectedSlot} gameMode={gameMode} headBlockType={headBlockType} lastDamageTime={lastDamageTime} />}
                    {isPaused && !isDead && !showDeathScreen && !isSleeping && <PauseMenu onResume={() => { suppressAutoPauseFor(350); resumeFromUserGesture('button'); }} onQuitToTitle={handleQuitToTitle} renderDistance={renderDistance} setRenderDistance={setRenderDistance} fov={fov} setFov={setFov} shadowsEnabled={shadowsEnabled} setShadowsEnabled={setShadowsEnabled} cloudsEnabled={cloudsEnabled} setCloudsEnabled={setCloudsEnabled} mipmapsEnabled={mipmapsEnabled} setMipmapsEnabled={setMipmapsEnabled} antialiasing={antialiasing} setAntialiasing={(val) => safeSetSetting(setAntialiasing, val)} chunkFadeEnabled={chunkFadeEnabled} setChunkFadeEnabled={setChunkFadeEnabled} maxFps={maxFps} setMaxFps={setMaxFps} vsync={vsync} setVsync={(val) => safeSetSetting(setVsync, val)} brightness={brightness} setBrightness={setBrightness} panoramaBlur={menuPanoramaBlur} panoramaGradient={menuPanoramaGradient} panoramaRotationSpeed={menuPanoramaRotationSpeed} backgroundMode={menuBackgroundMode} panoramaBackgroundDataUrl={menuPanoramaDataUrl} panoramaFaceDataUrls={menuPanoramaFaceDataUrls} />}
                    {openContainer && <InventoryUI inventory={inventory} openContainer={openContainer} setOpenContainer={handleInventoryContainerChange} selectedSlot={selectedSlot} craftingGrid2x2={craftingGrid2x2} craftingGrid3x3={craftingGrid3x3} craftingOutput={craftingOutput} cursorStack={cursorStack} setCursorStack={setCursorStack} handleInventoryAction={handleInventoryAction} />}
                    <Chat 
                        messages={messages} 
                        showInput={showCommandInput} 
                        inputValue={commandValue} 
                        setInputValue={(val) => {
                            setCommandValue(val);
                            updateAutocomplete(val);
                        }} 
                        acCandidates={acCandidates} 
                        acIndex={acIndex} 
                        onMessageClick={(action) => executeCommand(action)} 
                        showSuggestions={showSuggestions} 
                    />
                </>
            )}

            <Canvas 
                key={canvasKey} 
                shadows={shadowsEnabled ? { type: THREE.BasicShadowMap } : false} 
                gl={{ antialias: antialiasing, preserveDrawingBuffer: isElectron }}
                camera={{ fov: 70, near: 0.1, far: 1000, position: [currentSpawnPos.x, currentSpawnPos.y, currentSpawnPos.z] }} 
                frameloop={canvasFrameloop}
            >
                {!isNativeLoop && <FPSLimiter limit={effectiveMaxFps} />}
                {!isCapturingPanorama && <RenderStats fpsRef={fpsRef} />}
                {/* Streamer runs logic loop for loading */}
                <ChunkStreamer active={appState === 'game' || appState === 'loading'} />
                <AudioListenerUpdater isPaused={isPaused} gameMode={gameMode} keepMenuMusicContext={appState !== 'game'} />
                <GameLoop isPaused={worldPaused} foodStateRef={foodStateRef} setHealth={setHealth} setHunger={setHunger} setSaturation={setSaturation} health={health} gameMode={gameMode} isDead={isDead} />
                <DayNightCycle ref={dayNightRef} setAmbientIntensity={setAmbientIntensity} setDirectionalIntensity={setDirectionalIntensity} isPaused={worldPaused} renderDistance={renderDistance} shadowsEnabled={shadowsEnabled} brightness={brightness} />
                <Clouds isPaused={worldPaused} renderDistance={renderDistance} fadeInEnabled={chunkFadeEnabled} visible={cloudsEnabled} />
                
                <Suspense fallback={null}>
                    {allDisplayedChunks.map(c => <ChunkMesh key={`${c.cx},${c.cz}`} cx={c.cx} cz={c.cz} shadowsEnabled={shadowsEnabled} fadeInEnabled={chunkFadeEnabled} fadingOut={c.fadingOut} onFadeOutComplete={c.fadingOut ? () => handleChunkFadeOutComplete(c.cx, c.cz) : undefined} />)}
                    <DropManager drops={drops} playerPos={playerPosRef.current} onCollect={handleCollect} onDestroy={handleDestroy} isPaused={worldPaused} brightness={brightness} />
                    {/* Add Particle Manager to the Scene */}
                    <ParticleManager isPaused={worldPaused} brightness={brightness} />
                </Suspense>

                <InteractionController 
                    isLocked={isLocked && !isDead && appState === 'game' && !isCapturingPanorama} selectedSlot={selectedSlot} inventory={inventory} consumeItem={consumeItem} 
                    spawnDrop={handleSpawnDrop} setBreakingVisual={setBreakingVisual} 
                    setOpenContainer={handleInteractionContainerOpen} 
                    openContainer={openContainer} gameMode={gameMode} setInventory={setInventory} isDead={isDead} foodStateRef={foodStateRef} setIsSleeping={setIsSleeping} onSleepInBed={(x:number, y:number, z:number) => { pendingBedSpawnRef.current = { x, y, z }; }}
                />
                
                {!isCapturingPanorama && breakingVisual && <group position={[breakingVisual.pos[0]+0.5, breakingVisual.pos[1]+0.5, breakingVisual.pos[2]+0.5]}><mesh><boxGeometry args={[1.01, 1.01, 1.01]} /><meshBasicMaterial color={breakingVisual.noDrop ? '#4b0000' : 'black'} transparent opacity={breakingVisual.progress * 0.7} depthTest={true} depthWrite={false} /></mesh></group>}

                {/* Only mount Player when game is Active to ensure physics starts with correct spawn position */}
                {appState === 'game' && (
                    <>
                        <Player 
                            ref={playerRef} key={respawnKey} position={currentSpawnPos} 
                            isLocked={isLocked && !openContainer && !isPaused && !showCommandInput && !isDead && !isSleeping && appState === 'game' && !isCapturingPanorama} 
                            isPaused={worldPaused} gameMode={gameMode} baseFov={fov} setHeadBlock={setHeadBlockType}
                            forcedFov={isCapturingPanorama ? 90 : null}
                            onChunkChange={(cx, cz) => { 
                                applyChunkCenter(cx, cz);
                            }} 
                            onTakeDamage={d => { 
                                if(gameMode === 'survival') {
                                    setHealth(h => {
                                        const newHealth = Math.max(0, h-d);
                                        if (newHealth <= 0 && h > 0) {
                                            soundManager.play("entity.player.death"); setShowDeathScreen(true); deathScreenActiveRef.current = true; setOpenContainer(null); setShowCommandInput(false); isInventoryOpenRef.current = false; isCommandOpenRef.current = false; relockWantedRef.current = false; wantsGameplayRef.current = false; enterUIMode();
                                        } else if (newHealth > 0) {
                                            soundManager.play("entity.player.hurt"); setLastDamageTime(Date.now());
                                        }
                                        return newHealth;
                                    }); 
                                }
                            }} 
                            setBreath={setBreath} setIsOnFire={setIsOnFire} foodStateRef={foodStateRef} isDead={isDead}
                        />
                        <PlayerRefUpdater playerPosRef={playerPosRef} />
                    </>
                )}
                
                {gameMode !== 'spectator' && !isDead && !isCapturingPanorama && <HeldItem selectedSlot={selectedSlot} inventory={inventory} isLocked={isLocked && !openContainer && !isPaused && !showCommandInput && !isSleeping} brightness={brightness} />}
                
                <CameraControls ref={controlsRef} onLock={onLock} onUnlock={onUnlock} disableMouseLook={isCapturingPanorama} />
            </Canvas>

            {isCapturingPanorama && (
                <div className="absolute inset-0 z-[450] pointer-events-auto cursor-wait bg-black/30 flex items-center justify-center">
                    <div className="px-4 py-2 bg-black/70 border border-white/20 text-white font-minecraft text-sm">
                        Capturing panorama… input locked
                    </div>
                </div>
            )}
          </>
      )}
      <Analytics />
    </div>
  );
};
export default App;
