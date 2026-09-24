import type * as THREE from 'three';
import { advance } from '@react-three/fiber';
import { VISUAL_TOUR_SEED, VISUAL_TOUR_SHOTS, type VisualTourShot } from './visualTour';
import { graphicsSettings } from '../graphics/graphicsStore';
import type { GraphicsConfig, GraphicsPresetId } from '../graphics/graphicsSettings';
import { entityManager } from '../entities/EntityManager';

// DEV-only QA bridge for scripted screenshot and performance passes.
//
// An automated browser pane can't be granted pointer lock, so it can't look
// around, open the inventory or type commands the way a player does. The
// visual overhaul is verified by a repeatable tour of fixed shots instead, and
// this module exposes exactly the actions that tour needs on
// `window.__atlasQA`. App registers it behind `import.meta.env.DEV`, so none of
// it ships in production builds.

export interface StreamingStatus {
    desired: number;
    meshed: number;
    queued: number;
    inFlight: number;
}

/** What App hands over; each entry is optional so registration can be partial. */
export interface DevQaHandles {
    command: (cmd: string) => void;
    camera: (yaw: number, pitch: number) => void;
    tp: (x: number, y: number, z: number) => void;
    hud: (visible: boolean) => void;
    openInventory: () => void;
    closeContainers: () => void;
    streaming: () => StreamingStatus;
    position: () => { x: number; y: number; z: number };
    renderDistance: (chunks: number) => void;
    vsync: (enabled: boolean) => void;
    getBlock: (x: number, y: number, z: number) => number;
    setBlock: (x: number, y: number, z: number, type: number) => void;
    enterBoat: (entityId: number) => void;
}

export interface PerfReport {
    seconds: number;
    frames: number;
    fps: number;
    frameMsAvg: number;
    frameMsP95: number;
    frameMsMax: number;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
}

/** One scene render, timed synchronously (see renderCost). */
export interface RenderCostReport {
    /** Milliseconds a render, CPU submission plus GPU, waited out with a 1-pixel read. */
    medianMs: number;
    p10Ms: number;
    p90Ms: number;
    drawCalls: number;
    triangles: number;
}

/** What the chunk meshes in the scene hold, whether or not they are in view. */
export interface SceneStats {
    /** Chunk meshes drawing themselves. */
    chunkMeshes: number;
    /** Chunk meshes hidden because their region's merged mesh draws them (regionBatcher.ts). */
    batchedChunkMeshes: number;
    regionMeshes: number;
    /** Triangles the chunk meshes and region meshes would draw with everything in view. */
    triangles: number;
    /** The chunks' own vertex and index arrays, in MB (kept on the CPU for remounts and rebuilds). */
    geometryMB: number;
    /** The region meshes' buffers, in MB (on the GPU; only their indices stay on the CPU). */
    regionMB: number;
}

interface FrameSample {
    ms: number;
    calls: number;
    triangles: number;
}

const handles: Partial<DevQaHandles> = {};
let renderer: THREE.WebGLRenderer | null = null;
let sceneRef: THREE.Scene | null = null;
let cameraRef: THREE.Camera | null = null;
let recording: FrameSample[] | null = null;
let lastFrameAt = 0;
let lastRealFrameAt = 0;
let pumping = false;
let pumpedFrames = 0;
let pumpTimer: ReturnType<typeof setInterval> | null = null;

/** Called by App once its refs and callbacks exist. Later calls replace earlier ones. */
export function registerDevQaHandles(next: Partial<DevQaHandles>): void {
    Object.assign(handles, next);
}

/** Called every frame by DevQaProbe (inside the Canvas). */
export function recordDevQaFrame(gl: THREE.WebGLRenderer, scene?: THREE.Scene, camera?: THREE.Camera): void {
    renderer = gl;
    if (scene) sceneRef = scene;
    if (camera) cameraRef = camera;
    const now = performance.now();
    if (recording && lastFrameAt > 0) {
        recording.push({
            ms: now - lastFrameAt,
            calls: gl.info.render.calls,
            triangles: gl.info.render.triangles,
        });
    }
    lastFrameAt = now;
    if (!pumping) lastRealFrameAt = now;
}

/**
 * A hidden automation pane stops requestAnimationFrame, so with VSync on the
 * game neither simulates nor renders and every scripted pass stalls. While the
 * pump is on, a timer steps R3F itself whenever no real frame has run for
 * 100 ms, and steps aside as soon as real frames resume, so a visible pane
 * never renders twice per frame. Timings taken while pumping mean nothing, so
 * perf() refuses to report them.
 */
function pump(enabled: boolean): void {
    if (!enabled) {
        if (pumpTimer) clearInterval(pumpTimer);
        pumpTimer = null;
        return;
    }
    if (pumpTimer) return;
    pumpTimer = setInterval(() => {
        if (performance.now() - lastRealFrameAt < 100) return;
        pumping = true;
        try {
            // Seconds, like FPSLimiter: frameloop 'never' clocks from it, 'always' ignores it.
            advance(performance.now() / 1000);
            pumpedFrames++;
        } finally {
            pumping = false;
        }
    }, 16);
}

/**
 * Opt-in with `?qaFrames` in the URL: requestAnimationFrame falls back to a
 * timer whenever the browser stops delivering frames (a hidden automation
 * pane), so boot, the menu and the world keep running for scripted passes.
 * While frames arrive normally the native callback always wins and the timer
 * is cancelled, so a visible pane behaves exactly as without the flag.
 */
function installHiddenPaneFrames(): void {
    if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('qaFrames')) return;
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const pending = new Map<number, { native: number; timer: ReturnType<typeof setTimeout> }>();
    let nextId = 1;
    let lastNativeFrameAt = performance.now();
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
        const id = nextId++;
        const fire = (time: number) => {
            const entry = pending.get(id);
            if (!entry) return;
            pending.delete(id);
            nativeCancel(entry.native);
            clearTimeout(entry.timer);
            callback(time);
        };
        const native = nativeRequest((time) => { lastNativeFrameAt = performance.now(); fire(time); });
        pending.set(id, { native, timer: setTimeout(() => fire(performance.now()), 33) });
        return id;
    };
    // A page that isn't rendering never delivers ResizeObserver callbacks either,
    // so the Canvas would never learn its size and never start. A window resize
    // event makes its measuring hook read the size directly.
    setInterval(() => {
        if (performance.now() - lastNativeFrameAt > 500) window.dispatchEvent(new Event('resize'));
    }, 500);
    window.cancelAnimationFrame = (id: number): void => {
        const entry = pending.get(id);
        if (!entry) return;
        pending.delete(id);
        nativeCancel(entry.native);
        clearTimeout(entry.timer);
    };
}

// Module scope, so it is in place before App's boot waits on its first frame.
if (import.meta.env.DEV) installHiddenPaneFrames();

const need = <K extends keyof DevQaHandles>(key: K): DevQaHandles[K] => {
    const handle = handles[key];
    if (!handle) throw new Error(`__atlasQA.${key} is not available yet (is a world loaded?)`);
    return handle as DevQaHandles[K];
};

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** BlockType.TORCH (kept as a number so this module stays free of the block tables). */
const TORCH_BLOCK_ID = 20;
let placedTorches: Array<[number, number, number]> = [];

function removePlacedTorches(): void {
    for (const [x, y, z] of placedTorches) {
        if (need('getBlock')(x, y, z) === TORCH_BLOCK_ID) need('setBlock')(x, y, z, 0);
    }
    placedTorches = [];
}

/**
 * Takes out any tour torch still standing (from a shot staged on its own, or
 * an interrupted run), so no other shot is lit by it. Only cells that hold a
 * torch at a tour torch spot are touched.
 */
function clearTourTorches(): boolean {
    let removed = placedTorches.length > 0;
    removePlacedTorches();
    for (const shot of VISUAL_TOUR_SHOTS) {
        for (const [x, y, z] of shot.torches ?? []) {
            if (need('getBlock')(x, y, z) !== TORCH_BLOCK_ID) continue;
            need('setBlock')(x, y, z, 0);
            removed = true;
        }
    }
    return removed;
}

async function waitForChunks(timeoutMs = 20000): Promise<StreamingStatus> {
    const started = performance.now();
    let status = need('streaming')();
    // Ready on two polls in a row: right after a teleport the streamer can still
    // report the OLD area as complete before it recentres on the new one.
    let readyPolls = 0;
    while (performance.now() - started < timeoutMs) {
        status = need('streaming')();
        const ready = status.desired > 0 && status.meshed >= status.desired && status.queued === 0 && status.inFlight === 0;
        readyPolls = ready ? readyPolls + 1 : 0;
        if (readyPolls >= 2) break;
        await wait(250);
    }
    return status;
}

/** Teleports and waits until the player is actually there (the move lands on a later frame). */
async function teleport(x: number, y: number, z: number): Promise<void> {
    need('tp')(x, y, z);
    const started = performance.now();
    while (performance.now() - started < 3000) {
        const at = need('position')();
        if (Math.abs(at.x - x) < 2 && Math.abs(at.z - z) < 2) return;
        await wait(100);
    }
}

/**
 * Resolves with the next frame that reaches the canvas, read back in the same
 * task it was drawn (so it works without preserveDrawingBuffer). Wraps
 * `gl.render` for exactly one on-screen render: offscreen passes (render
 * targets) are ignored, and whichever pass finally draws to the canvas (R3F's
 * own render, motion blur, the post pipeline) is the one captured.
 */
function captureNextFrame(): Promise<string> {
    const gl = renderer;
    if (!gl) return Promise.reject(new Error('No renderer yet'));
    return new Promise((resolve, reject) => {
        const original = gl.render;
        const restore = () => { gl.render = original; };
        const timeout = setTimeout(() => { restore(); reject(new Error('No frame reached the canvas within 3s')); }, 3000);
        gl.render = function patched(scene: THREE.Object3D, camera: THREE.Camera) {
            original.call(gl, scene, camera);
            if (gl.getRenderTarget() !== null) return;
            restore();
            clearTimeout(timeout);
            resolve(gl.domElement.toDataURL('image/png'));
        };
    });
}

async function saveShot(phase: string, name: string, dataUrl: string): Promise<string> {
    const response = await fetch('/__atlas-qa/shot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phase, name, dataUrl }),
    });
    if (!response.ok) throw new Error(`Saving ${name} failed: ${response.status} ${await response.text()}`);
    const { file } = await response.json() as { file: string };
    return file;
}

/**
 * Renders the scene (shadow maps included, post-processing not) `count` times
 * back to back, each waited out with a 1-pixel read, and reports the median.
 * Unlike perf() it needs no real frames, so it works in a hidden pane, and it
 * compares like with like within one session (GPU clocks drift between them).
 */
function renderCost(count = 40): RenderCostReport {
    if (!renderer || !sceneRef || !cameraRef) throw new Error('renderCost() needs a running world');
    const gl = renderer;
    const context = gl.getContext();
    const pixel = new Uint8Array(4);
    const renderOnce = () => {
        gl.render(sceneRef!, cameraRef!);
        context.readPixels(0, 0, 1, 1, context.RGBA, context.UNSIGNED_BYTE, pixel);
    };
    for (let i = 0; i < 8; i++) renderOnce();
    const times: number[] = [];
    for (let i = 0; i < count; i++) {
        const started = performance.now();
        renderOnce();
        times.push(performance.now() - started);
    }
    times.sort((a, b) => a - b);
    const at = (q: number) => Number(times[Math.min(times.length - 1, Math.floor(times.length * q))].toFixed(2));
    return {
        medianMs: at(0.5),
        p10Ms: at(0.1),
        p90Ms: at(0.9),
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
    };
}

/**
 * GPU time of `count` scene renders (shadow maps included, post-processing
 * not), from WebGL timer queries: the median in milliseconds, or null where
 * the browser offers no timer queries.
 */
async function gpuCost(count = 20): Promise<{ medianMs: number; p90Ms: number } | null> {
    if (!renderer || !sceneRef || !cameraRef) throw new Error('gpuCost() needs a running world');
    const gl = renderer;
    const context = gl.getContext() as WebGL2RenderingContext;
    const timer = context.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    if (!timer) return null;
    const queries: WebGLQuery[] = [];
    for (let i = 0; i < count + 4; i++) {
        const query = context.createQuery()!;
        context.beginQuery(timer.TIME_ELAPSED_EXT, query);
        gl.render(sceneRef, cameraRef);
        context.endQuery(timer.TIME_ELAPSED_EXT);
        if (i >= 4) queries.push(query);
        else context.deleteQuery(query);
    }
    // Results only arrive once control returns to the browser.
    const times: number[] = [];
    for (let tries = 0; tries < 100 && times.length < queries.length; tries++) {
        await wait(20);
        times.length = 0;
        if (context.getParameter(timer.GPU_DISJOINT_EXT)) continue;
        for (const query of queries) {
            if (!context.getQueryParameter(query, context.QUERY_RESULT_AVAILABLE)) break;
            times.push(context.getQueryParameter(query, context.QUERY_RESULT) / 1e6);
        }
    }
    for (const query of queries) context.deleteQuery(query);
    if (times.length === 0) return null;
    times.sort((a, b) => a - b);
    const at = (q: number) => Number(times[Math.min(times.length - 1, Math.floor(times.length * q))].toFixed(2));
    return { medianMs: at(0.5), p90Ms: at(0.9) };
}

function sceneStats(): SceneStats {
    if (!sceneRef) throw new Error('sceneStats() needs a running world');
    const stats: SceneStats = { chunkMeshes: 0, batchedChunkMeshes: 0, regionMeshes: 0, triangles: 0, geometryMB: 0, regionMB: 0 };
    let chunkBytes = 0;
    let regionBytes = 0;
    sceneRef.traverse((object) => {
        const mesh = object as THREE.Mesh;
        const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
        // Chunk meshes are the indexed ones carrying the 4-byte voxel colour (voxelVertex.ts).
        if (!mesh.isMesh || !geometry?.index || geometry.attributes.color?.itemSize !== 4) return;
        if (mesh.name === 'chunkRegion') {
            // A region's water back-face pass shares the front pass's geometry.
            if (mesh.renderOrder === -1) return;
            stats.regionMeshes++;
            stats.triangles += geometry.index.count / 3;
            regionBytes += geometry.userData.bytes ?? 0;
            return;
        }
        for (const attribute of Object.values(geometry.attributes)) chunkBytes += (attribute as THREE.BufferAttribute).array.byteLength;
        chunkBytes += geometry.index.array.byteLength;
        if (!mesh.visible) {
            stats.batchedChunkMeshes++;
            return;
        }
        stats.chunkMeshes++;
        stats.triangles += geometry.index.count / 3;
    });
    stats.geometryMB = Number((chunkBytes / 1048576).toFixed(1));
    stats.regionMB = Number((regionBytes / 1048576).toFixed(1));
    return stats;
}

async function perf(seconds = 5): Promise<PerfReport> {
    const pumpedBefore = pumpedFrames;
    recording = [];
    await wait(seconds * 1000);
    const samples = recording;
    recording = null;
    if (pumpedFrames !== pumpedBefore) {
        throw new Error('perf() needs real frames, but the pane is hidden and frames were being pumped');
    }
    const frameTimes = samples.map(s => s.ms).sort((a, b) => a - b);
    const avg = (values: number[]) => values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
    const frameMsAvg = avg(frameTimes);
    const info = renderer?.info;
    return {
        seconds,
        frames: samples.length,
        fps: frameMsAvg > 0 ? Math.round(1000 / frameMsAvg) : 0,
        frameMsAvg: Number(frameMsAvg.toFixed(2)),
        frameMsP95: Number((frameTimes[Math.floor(frameTimes.length * 0.95)] ?? 0).toFixed(2)),
        frameMsMax: Number((frameTimes[frameTimes.length - 1] ?? 0).toFixed(2)),
        drawCalls: Math.round(avg(samples.map(s => s.calls))),
        triangles: Math.round(avg(samples.map(s => s.triangles))),
        geometries: info?.memory.geometries ?? 0,
        textures: info?.memory.textures ?? 0,
        programs: info?.programs?.length ?? 0,
    };
}

/** The menu flow a player clicks through, driven through the DOM: Singleplayer → world → Play. */
async function enterWorld(worldName: string, timeoutMs = 180000): Promise<StreamingStatus> {
    const visible = (el: Element) => (el as HTMLElement).offsetParent !== null;
    const byText = (text: string): HTMLElement | undefined => {
        // Prefer the real <button>: MenuButton wraps it in a div with the same text,
        // and a click on the wrapper never reaches the button's handler.
        const button = [...document.querySelectorAll('button')].find(el => el.textContent?.trim() === text && visible(el));
        if (button) return button;
        const matches = [...document.querySelectorAll('div, span, p, h1, h2, h3')]
            .filter(el => el.textContent?.trim() === text && visible(el));
        return matches[matches.length - 1] as HTMLElement | undefined;
    };
    const click = async (text: string) => {
        const started = performance.now();
        while (performance.now() - started < timeoutMs) {
            const el = byText(text);
            // A button that exists but is still disabled (e.g. Play before the
            // selection lands) would swallow the click: wait for it to enable.
            if (el && !(el instanceof HTMLButtonElement && el.disabled)) { el.click(); return; }
            await wait(250);
        }
        throw new Error(`Menu item not found or never enabled: ${text}`);
    };
    await click('Singleplayer');
    // The list loads asynchronously; give it a moment before deciding the world is missing.
    let row: HTMLElement | undefined;
    for (let i = 0; i < 20 && !row; i++) {
        await wait(250);
        row = byText(worldName);
    }
    if (row) {
        row.click();
        await wait(300);
        await click('Play Selected World');
    } else {
        // The browser-pane profile doesn't always keep saves: recreate the world from
        // its seed (worldgen is deterministic, so every tour position still holds).
        await click('Create New World');
        await wait(400);
        const inputs = [...document.querySelectorAll('input[type="text"]')] as HTMLInputElement[];
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        const fill = (input: HTMLInputElement | undefined, value: string) => {
            if (!input || !setValue) throw new Error('Create World form not found');
            setValue.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        fill(inputs[0], worldName);
        fill(inputs[1], VISUAL_TOUR_SEED);
        await wait(200);
        await click('Create World');
    }
    const started = performance.now();
    while (!handles.streaming && performance.now() - started < timeoutMs) await wait(250);
    await wait(1000);
    return waitForChunks(timeoutMs);
}

/** Frame cost at several render distances from the day-vista viewpoint, vsync off. */
async function perfSweep(distances: readonly number[] = [8, 16, 32], seconds = 8): Promise<Record<string, PerfReport>> {
    const vista = VISUAL_TOUR_SHOTS.find(s => s.id === 'day_vista') ?? VISUAL_TOUR_SHOTS[0];
    need('vsync')(false);
    await wait(5000);
    const out: Record<string, PerfReport> = {};
    for (const chunks of distances) {
        need('renderDistance')(chunks);
        need('command')('/gamemode spectator');
        need('command')(`/time set ${vista.time}`);
        need('tp')(vista.position[0], vista.position[1], vista.position[2]);
        need('camera')(vista.yaw, vista.pitch);
        need('hud')(false);
        await wait(1500);
        await waitForChunks(120000);
        await wait(3000);
        need('camera')(vista.yaw, vista.pitch);
        out[`rd${chunks}`] = await perf(seconds);
    }
    need('renderDistance')(8);
    need('hud')(true);
    need('vsync')(true);
    return out;
}

function ride(): number | null {
    const at = need('position')();
    const near = entityManager.getEntities().find(e => e.kind === 'boat' && !e.ridden && Math.hypot(e.pos.x - at.x, e.pos.z - at.z) < 3);
    const boat = near ?? entityManager.spawn('boat', at.x, at.y + 0.1, at.z);
    if (!boat) return null;
    need('enterBoat')(boat.id);
    return boat.id;
}

/** Frames one tour shot: position, look, time of day, event overrides, then settle. */
async function stageShot(shot: VisualTourShot): Promise<StreamingStatus> {
    const command = need('command');
    need('closeContainers')();
    command(`/gamemode ${shot.gameMode ?? 'spectator'}`);
    command(`/time set ${shot.time}`);
    command(shot.bloodMoon ? '/bloodmoon force current' : '/bloodmoon clear current');
    if (shot.spawnAt) {
        await teleport(shot.spawnAt[0], shot.spawnAt[1], shot.spawnAt[2]);
        await wait(300);
        await waitForChunks();
    }
    for (const extra of shot.commands ?? []) command(extra);
    await teleport(shot.position[0], shot.position[1], shot.position[2]);
    need('camera')(shot.yaw, shot.pitch);
    need('hud')(shot.hud ?? false);
    await wait(300);
    let status = await waitForChunks();
    // Once the scene's chunks are loaded: take out any tour torch left standing,
    // then light this shot. Torches go only into empty cells (nothing is ever
    // overwritten) and runTour takes them out again after the capture.
    let changed = clearTourTorches();
    for (const [x, y, z] of shot.torches ?? []) {
        if (need('getBlock')(x, y, z) !== 0) continue;
        need('setBlock')(x, y, z, TORCH_BLOCK_ID);
        placedTorches.push([x, y, z]);
        changed = true;
    }
    if (changed) {
        await wait(300);
        status = await waitForChunks();
    }
    // Let chunk fade-ins, light and the atmosphere settle before capturing.
    await wait(shot.settleMs ?? 1500);
    need('camera')(shot.yaw, shot.pitch);
    if (shot.inventory) {
        need('openInventory')();
        await wait(400);
    }
    return status;
}

async function runTour(phase: string, only?: string[]): Promise<Array<{ id: string; file?: string; error?: string }>> {
    const results: Array<{ id: string; file?: string; error?: string }> = [];
    for (const shot of VISUAL_TOUR_SHOTS) {
        if (only && !only.includes(shot.id)) continue;
        if (shot.capture === 'pane') continue;
        try {
            await stageShot(shot);
            const file = await saveShot(phase, shot.id, await captureNextFrame());
            results.push({ id: shot.id, file });
        } catch (error) {
            results.push({ id: shot.id, error: String(error) });
        }
        for (const undo of shot.cleanup ?? []) need('command')(undo);
        removePlacedTorches();
    }
    need('closeContainers')();
    need('command')('/bloodmoon clear current');
    need('hud')(true);
    return results;
}

export interface AtlasQaApi {
    command(cmd: string): void;
    camera(yaw: number, pitch: number): void;
    tp(x: number, y: number, z: number): void;
    hud(visible: boolean): void;
    openInventory(): void;
    closeContainers(): void;
    position(): { x: number; y: number; z: number };
    renderDistance(chunks: number): void;
    /** VSync off also lifts the frame cap to 260 so perf() measures real frame cost. */
    vsync(enabled: boolean): void;
    getBlock(x: number, y: number, z: number): number;
    setBlock(x: number, y: number, z: number, type: number): void;
    /**
     * Boards the nearest free boat within 3 blocks, or launches one at the
     * player's feet (stand in or over water) and boards it; the boat's id.
     * Paddle by setting inputState's movement keys.
     */
    ride(): number | null;
    streaming(): StreamingStatus;
    waitForChunks(timeoutMs?: number): Promise<StreamingStatus>;
    snapshot(): Promise<string>;
    shot(phase: string, name: string): Promise<string>;
    perf(seconds?: number): Promise<PerfReport>;
    /** Synchronous render timing that works in a hidden pane: see renderCost above. */
    renderCost(count?: number): RenderCostReport;
    /** GPU time of scene renders from timer queries (null without the extension). */
    gpuCost(count?: number): Promise<{ medianMs: number; p90Ms: number } | null>;
    /** Triangles, vertices and memory of every chunk mesh in the scene. */
    sceneStats(): SceneStats;
    perfSweep(distances?: readonly number[], seconds?: number): Promise<Record<string, PerfReport>>;
    /** From the title screen: Singleplayer → the named world → Play (creating it from the tour seed if it is missing), then waits for chunks. */
    enterWorld(worldName: string, timeoutMs?: number): Promise<StreamingStatus>;
    /** Keeps frames coming while the pane is hidden (requestAnimationFrame stops there). */
    pump(enabled: boolean): void;
    /** Cache keys of every compiled shader program: a changed list means something recompiled. */
    programKeys(): string[];
    /** Switches the graphics preset, as the Video Settings cycler does. */
    preset(id: GraphicsPresetId): void;
    /** Changes one graphics option, as the Video Settings list does. */
    option<K extends keyof GraphicsConfig>(key: K, value: GraphicsConfig[K]): void;
    tour: {
        shots: readonly VisualTourShot[];
        stage(id: string): Promise<StreamingStatus>;
        run(phase: string, only?: string[]): Promise<Array<{ id: string; file?: string; error?: string }>>;
    };
}

export function createDevQaApi(): AtlasQaApi {
    return {
        command: cmd => need('command')(cmd),
        camera: (yaw, pitch) => need('camera')(yaw, pitch),
        tp: (x, y, z) => need('tp')(x, y, z),
        hud: visible => need('hud')(visible),
        openInventory: () => need('openInventory')(),
        closeContainers: () => need('closeContainers')(),
        position: () => need('position')(),
        renderDistance: chunks => need('renderDistance')(chunks),
        vsync: enabled => need('vsync')(enabled),
        getBlock: (x, y, z) => need('getBlock')(x, y, z),
        setBlock: (x, y, z, type) => need('setBlock')(x, y, z, type),
        ride,
        streaming: () => need('streaming')(),
        waitForChunks,
        snapshot: captureNextFrame,
        shot: async (phase, name) => saveShot(phase, name, await captureNextFrame()),
        perf,
        renderCost,
        gpuCost,
        sceneStats,
        perfSweep,
        enterWorld,
        pump,
        programKeys: () => (renderer?.info.programs ?? []).map(program => program.cacheKey),
        preset: id => graphicsSettings.setPreset(id),
        option: (key, value) => graphicsSettings.setOption(key, value),
        tour: {
            shots: VISUAL_TOUR_SHOTS,
            stage: async (id) => {
                const shot = VISUAL_TOUR_SHOTS.find(s => s.id === id);
                if (!shot) throw new Error(`Unknown tour shot: ${id}`);
                return stageShot(shot);
            },
            run: runTour,
        },
    };
}

declare global {
    interface Window {
        __atlasQA?: AtlasQaApi;
    }
}

/**
 * Installs `window.__atlasQA`. DEV builds only; callers gate on
 * import.meta.env.DEV. Always replaces the previous object so a hot-reloaded
 * copy of this module is the one scripts talk to.
 */
export function installDevQa(): void {
    if (typeof window === 'undefined') return;
    window.__atlasQA = createDevQaApi();
}
