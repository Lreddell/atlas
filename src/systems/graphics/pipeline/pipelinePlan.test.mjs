import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../../world/storage/bundleTs.mjs';

const { planPipeline, wantsContextAntialias, TONE_MAPPING, TONE_MAPPING_EXPOSURE_TRIM } = await loadTs(
    `export * from './src/systems/graphics/pipeline/pipelinePlan';`,
);
const { resolveGraphicsConfig, GRAPHICS_PRESET_ORDER } = await loadTs(`export * from './src/systems/graphics/graphicsSettings';`);

const caps = { maxSamples: 4 };
const configFor = (preset, overrides = {}) => resolveGraphicsConfig({ version: 1, preset, overrides, detected: false });

test('Low draws straight to the canvas; every other preset runs the pipeline', () => {
    const low = planPipeline(configFor('low'), caps);
    assert.equal(low.active, false);
    assert.equal(wantsContextAntialias(configFor('low'), low), true, 'Low keeps the context MSAA');
    for (const preset of GRAPHICS_PRESET_ORDER.filter(id => id !== 'low')) {
        const plan = planPipeline(configFor(preset), caps);
        assert.equal(plan.active, true, preset);
        assert.equal(plan.motionBlur, preset === 'ultra', `${preset}: only Ultra enables motion blur by default`);
        assert.equal(wantsContextAntialias(configFor(preset), plan), false, `${preset}: the pipeline brings its own AA`);
    }
});

test('motion blur alone is enough to need the pipeline, even on Low', () => {
    const plan = planPipeline(configFor('low', { motionBlur: true }), caps);
    assert.equal(plan.active, true);
    assert.equal(plan.motionBlur, true);
    assert.equal(plan.bloom, 'off');
    assert.equal(plan.godRays, false);
});

test('anti-aliasing: MSAA on the HDR target when available, FXAA otherwise', () => {
    const msaa = planPipeline(configFor('high'), caps);
    assert.equal(msaa.msaaSamples, 4);
    assert.equal(msaa.fxaa, false);
    const noSamples = planPipeline(configFor('high'), { maxSamples: 0 });
    assert.equal(noSamples.msaaSamples, 0);
    assert.equal(noSamples.fxaa, true, 'falls back to FXAA rather than no AA');
    const fxaa = planPipeline(configFor('high', { antialiasing: 'fxaa' }), caps);
    assert.deepEqual([fxaa.msaaSamples, fxaa.fxaa], [0, true]);
    const off = planPipeline(configFor('high', { antialiasing: 'off' }), caps);
    assert.deepEqual([off.msaaSamples, off.fxaa], [0, false]);
});

test('Classic runs no Luminous effects, and a pipeline it needs (motion blur) leaves colours ungraded', () => {
    const classic = (preset, overrides = {}) => resolveGraphicsConfig({ version: 1, preset, overrides, preferences: { visualStyle: 'classic' }, detected: false });
    const unblurred = classic('ultra', { motionBlur: false });
    const ultra = planPipeline(unblurred, caps);
    assert.equal(ultra.active, false, 'no bloom, god rays or blur, so no pipeline');
    assert.equal(wantsContextAntialias(unblurred, ultra), true);
    const blurred = planPipeline(classic('ultra'), caps);
    assert.equal(blurred.active, true);
    assert.equal(blurred.motionBlur, true, 'Ultra enables blur in Classic as well');
    assert.equal(blurred.neutralGrade, true);
    assert.equal(blurred.bloom, 'off');
    assert.equal(planPipeline(configFor('ultra'), caps).neutralGrade, false);
});

test('one tone map for the whole game, at the same brightness either way', () => {
    assert.ok(TONE_MAPPING === 'aces' || TONE_MAPPING === 'agx');
    assert.equal(TONE_MAPPING_EXPOSURE_TRIM, TONE_MAPPING === 'agx' ? 1 / 0.6 : 1);
});
