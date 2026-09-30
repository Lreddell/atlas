import type { GraphicsPresetId } from '../graphics/graphicsSettings';

// How far the world is drawn: the render distance (full chunks, each about
// 0.6 MB of memory: blocks, light and mesh) and the Horizon Distance past it
// (simplified distant terrain, horizon/, a small fraction of that).

/** Render distance limits, in chunks. */
export const MIN_RENDER_DISTANCE = 4;
export const MAX_RENDER_DISTANCE = 48;

/** The Horizon Distance settings, in chunks (0 is off). */
export const HORIZON_STOPS: readonly number[] = [0, 64, 96, 128, 192, 256, 384, 512, 768, 1024];
export const MAX_HORIZON_DISTANCE = HORIZON_STOPS[HORIZON_STOPS.length - 1];

/** How far the horizon reaches with this render distance: nothing when it is off or inside it. */
export const effectiveHorizon = (renderDistance: number, horizon: number): number => (horizon > renderDistance ? horizon : 0);

/** How far anything is drawn, in chunks. */
export const viewDistance = (renderDistance: number, horizon: number): number => Math.max(renderDistance, effectiveHorizon(renderDistance, horizon));

/** How much detail the horizon keeps with distance, by graphics preset (horizonTiles.ts levelRanges). */
export const HORIZON_QUALITY: Readonly<Record<GraphicsPresetId, number>> = { low: 192, medium: 256, high: 320, ultra: 384 };
