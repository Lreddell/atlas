import type * as THREE from 'three';
import { VISUAL_TOUR_SHOTS, type VisualTourShot } from './visualTour';

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

interface FrameSample {
    ms: number;
    calls: number;
    triangles: number;
}

const handles: Partial<DevQaHandles> = {};
let renderer: THREE.WebGLRenderer | null = null;
let recording: FrameSample[] | null = null;
let lastFrameAt = 0;

/** Called by App once its refs and callbacks exist. Later calls replace earlier ones. */
export function registerDevQaHandles(next: Partial<DevQaHandles>): void {
    Object.assign(handles, next);
}

/** Called every frame by DevQaProbe (inside the Canvas). */
export function recordDevQaFrame(gl: THREE.WebGLRenderer): void {
    renderer = gl;
    const now = performance.now();
    if (recording && lastFrameAt > 0) {
        recording.push({
            ms: now - lastFrameAt,
            calls: gl.info.render.calls,
            triangles: gl.info.render.triangles,
        });
    }
    lastFrameAt = now;
}

const need = <K extends keyof DevQaHandles>(key: K): DevQaHandles[K] => {
    const handle = handles[key];
    if (!handle) throw new Error(`__atlasQA.${key} is not available yet (is a world loaded?)`);
    return handle as DevQaHandles[K];
};

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function waitForChunks(timeoutMs = 20000): Promise<StreamingStatus> {
    const started = performance.now();
    let status = need('streaming')();
    while (performance.now() - started < timeoutMs) {
        status = need('streaming')();
        if (status.desired > 0 && status.meshed >= status.desired && status.queued === 0 && status.inFlight === 0) break;
        await wait(250);
    }
    return status;
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

async function perf(seconds = 5): Promise<PerfReport> {
    recording = [];
    await wait(seconds * 1000);
    const samples = recording;
    recording = null;
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
async function enterWorld(worldName: string, timeoutMs = 60000): Promise<StreamingStatus> {
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
            if (el) { el.click(); return; }
            await wait(250);
        }
        throw new Error(`Menu item not found: ${text}`);
    };
    await click('Singleplayer');
    await wait(600);
    await click(worldName);
    await wait(300);
    await click('Play Selected World');
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
    return out;
}

/** Frames one tour shot: position, look, time of day, event overrides, then settle. */
async function stageShot(shot: VisualTourShot): Promise<StreamingStatus> {
    const command = need('command');
    need('closeContainers')();
    command(`/gamemode ${shot.gameMode ?? 'spectator'}`);
    command(`/time set ${shot.time}`);
    command(shot.bloodMoon ? '/bloodmoon force current' : '/bloodmoon clear current');
    if (shot.spawnAt) {
        need('tp')(shot.spawnAt[0], shot.spawnAt[1], shot.spawnAt[2]);
        await wait(300);
        await waitForChunks();
    }
    for (const extra of shot.commands ?? []) command(extra);
    need('tp')(shot.position[0], shot.position[1], shot.position[2]);
    need('camera')(shot.yaw, shot.pitch);
    need('hud')(shot.hud ?? false);
    await wait(300);
    const status = await waitForChunks();
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
    streaming(): StreamingStatus;
    waitForChunks(timeoutMs?: number): Promise<StreamingStatus>;
    snapshot(): Promise<string>;
    shot(phase: string, name: string): Promise<string>;
    perf(seconds?: number): Promise<PerfReport>;
    perfSweep(distances?: readonly number[], seconds?: number): Promise<Record<string, PerfReport>>;
    /** From the title screen: Singleplayer → the named world → Play, then waits for chunks. */
    enterWorld(worldName: string, timeoutMs?: number): Promise<StreamingStatus>;
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
        streaming: () => need('streaming')(),
        waitForChunks,
        snapshot: captureNextFrame,
        shot: async (phase, name) => saveShot(phase, name, await captureNextFrame()),
        perf,
        perfSweep,
        enterWorld,
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
