import type { BloomQuality, GraphicsConfig } from '../graphicsSettings';

// What the post pipeline does for a graphics config. Pure, so the rules are
// testable. With nothing to post-process (the Low preset, motion blur off) the
// pipeline stays unmounted and R3F renders straight to the canvas, with the
// renderer's own tone mapping and the context's MSAA: that path costs nothing
// extra.

/** The tone map the whole game uses: the composite in the pipeline, and the renderer when it draws directly. */
export const TONE_MAPPING = 'aces' as 'agx' | 'aces';

/**
 * Applied on top of the atmosphere's exposure. three's ACES carries its own
 * 1/0.6 lift; AgX needs the same lift written in to land at the same brightness.
 */
export const TONE_MAPPING_EXPOSURE_TRIM = TONE_MAPPING === 'agx' ? 1 / 0.6 : 1;

export interface PipelineCaps {
    /** Largest MSAA sample count a render target supports (0 = none). */
    maxSamples: number;
}

export interface PipelinePlan {
    active: boolean;
    /** MSAA samples on the HDR scene target; 0 = none. */
    msaaSamples: number;
    /** FXAA on the graded image (the FXAA/SMAA settings, or MSAA unavailable). */
    fxaa: boolean;
    bloom: BloomQuality;
    godRays: boolean;
    motionBlur: boolean;
    /** The Classic style: tone map only, no colour grade or vignette (the old look had none). */
    neutralGrade: boolean;
}

export function planPipeline(config: GraphicsConfig, caps: PipelineCaps): PipelinePlan {
    const active = config.bloom !== 'off' || config.godRays || config.motionBlur;
    const neutralGrade = config.visualStyle === 'classic';
    if (!active) {
        return { active: false, msaaSamples: 0, fxaa: false, bloom: 'off', godRays: false, motionBlur: false, neutralGrade };
    }
    const msaaSamples = config.antialiasing === 'msaa' && caps.maxSamples >= 2 ? Math.min(4, caps.maxSamples) : 0;
    const fxaa = config.antialiasing === 'fxaa' || config.antialiasing === 'smaa'
        || (config.antialiasing === 'msaa' && msaaSamples === 0);
    return { active, msaaSamples, fxaa, bloom: config.bloom, godRays: config.godRays, motionBlur: config.motionBlur, neutralGrade };
}

/**
 * The WebGL context's own MSAA only helps when R3F draws the scene straight to
 * the canvas; with the pipeline the canvas only ever receives a fullscreen
 * triangle, so the context is created without it.
 */
export function wantsContextAntialias(config: GraphicsConfig, plan: PipelinePlan): boolean {
    return !plan.active && config.antialiasing !== 'off';
}
