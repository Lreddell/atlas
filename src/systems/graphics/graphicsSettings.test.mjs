import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

const {
    GRAPHICS_PRESETS, GRAPHICS_PRESET_ORDER, DEFAULT_GRAPHICS_STATE, resolveGraphicsConfig,
    graphicsQuality, withPreset, withOption, parseGraphicsState, migrateLegacyGraphics,
    detectPreset, lowerPreset,
} = await loadTs(`export * from './src/systems/graphics/graphicsSettings';`);

const caps = (renderer, extra = {}) => ({ renderer, webgl2: true, cores: 16, memoryGb: 8, coarsePointer: false, ...extra });

test('every preset defines every option, and quality rises monotonically', () => {
    const keys = Object.keys(GRAPHICS_PRESETS.medium).sort();
    for (const id of GRAPHICS_PRESET_ORDER) assert.deepEqual(Object.keys(GRAPHICS_PRESETS[id]).sort(), keys, id);
    const shadowRank = ['off', 'low', 'medium', 'high'];
    const ranks = GRAPHICS_PRESET_ORDER.map(id => shadowRank.indexOf(GRAPHICS_PRESETS[id].shadows));
    assert.deepEqual([...ranks].sort((a, b) => a - b), ranks);
    // Motion blur is a taste option: off in every preset, only the player turns it on.
    for (const id of GRAPHICS_PRESET_ORDER) assert.equal(GRAPHICS_PRESETS[id].motionBlur, false, id);
    // Low is the pre-overhaul cost: no shadows, bloom, god rays or ambient particles.
    assert.equal(GRAPHICS_PRESETS.low.shadows, 'off');
    assert.equal(GRAPHICS_PRESETS.low.bloom, 'off');
    assert.equal(GRAPHICS_PRESETS.low.godRays, false);
    assert.equal(GRAPHICS_PRESETS.low.ambientParticles, 'off');
});

test('overrides sit on top of the preset, and matching the preset drops them', () => {
    let state = withPreset(DEFAULT_GRAPHICS_STATE, 'high');
    assert.equal(graphicsQuality(state), 'high');
    state = withOption(state, 'shadows', 'off');
    assert.equal(graphicsQuality(state), 'custom');
    assert.equal(resolveGraphicsConfig(state).shadows, 'off');
    assert.equal(resolveGraphicsConfig(state).godRays, true);
    state = withOption(state, 'shadows', GRAPHICS_PRESETS.high.shadows);
    assert.equal(graphicsQuality(state), 'high');
    assert.deepEqual(state.overrides, {});
    // Choosing a preset discards every override.
    state = withPreset(withOption(state, 'clouds', 'off'), 'low');
    assert.deepEqual(state.overrides, {});
});

test('stored state is validated field by field', () => {
    assert.equal(parseGraphicsState(null), null);
    assert.equal(parseGraphicsState('not json'), null);
    assert.equal(parseGraphicsState(JSON.stringify({ version: 2, preset: 'low' })), null);
    const parsed = parseGraphicsState(JSON.stringify({
        version: 1, preset: 'bogus', detected: true,
        overrides: { shadows: 'high', bloom: 'blinding', maxPixelRatio: 3, chunkFade: false, extra: 1 },
    }));
    assert.equal(parsed.preset, DEFAULT_GRAPHICS_STATE.preset);
    assert.deepEqual(parsed.overrides, { shadows: 'high', chunkFade: false });
    assert.equal(parsed.detected, true);
});

test('old Video Settings toggles carry over only where the player changed them', () => {
    const legacy = (values) => (key) => values[key] ?? null;
    assert.deepEqual(migrateLegacyGraphics(legacy({}), 'medium'), {});
    // The old defaults (shadows off, clouds/mipmaps/AA/fade on, blur off) mean "untouched".
    assert.deepEqual(migrateLegacyGraphics(legacy({
        'atlas.settings.shadowsEnabled': 'false', 'atlas.settings.cloudsEnabled': 'true',
        'atlas.settings.motionBlur': 'false',
    }), 'medium'), {});
    assert.deepEqual(migrateLegacyGraphics(legacy({
        'atlas.settings.cloudsEnabled': 'false', 'atlas.settings.mipmapsEnabled': 'false',
        'atlas.settings.antialiasing': 'false', 'atlas.settings.chunkFadeEnabled': 'false',
        'atlas.settings.motionBlur': 'true',
    }), 'medium'), { clouds: 'off', mipmaps: false, antialiasing: 'off', chunkFade: false, motionBlur: true });
    // Shadows the player had switched on survive a Low detection, but never downgrade a preset.
    assert.deepEqual(migrateLegacyGraphics(legacy({ 'atlas.settings.shadowsEnabled': 'true' }), 'low'), { shadows: 'low' });
    assert.deepEqual(migrateLegacyGraphics(legacy({ 'atlas.settings.shadowsEnabled': 'true' }), 'high'), {});
});

test('first-launch detection is conservative and never picks Ultra', () => {
    assert.equal(detectPreset(caps('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)')), 'high');
    assert.equal(detectPreset(caps('ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0)')), 'high');
    assert.equal(detectPreset(caps('ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11)')), 'medium');
    assert.equal(detectPreset(caps('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)')), 'medium');
    assert.equal(detectPreset(caps('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)')), 'low');
    assert.equal(detectPreset(caps('Google SwiftShader')), 'low');
    assert.equal(detectPreset(caps('ANGLE (NVIDIA, RTX 4090)', { webgl2: false })), 'low');
    assert.equal(detectPreset(caps('Mali-G78', { coarsePointer: true })), 'low');
    // Unknown GPUs: desktop-class machines get Medium, small ones Low.
    assert.equal(detectPreset(caps('Mystery GPU')), 'medium');
    assert.equal(detectPreset(caps('Mystery GPU', { cores: 4 })), 'low');
    for (const renderer of ['RTX 4090', 'Radeon RX 7900 XTX', 'Apple M3 Max']) {
        assert.notEqual(detectPreset(caps(renderer)), 'ultra', renderer);
    }
});

test('the low-frame-rate hint suggests exactly one step down', () => {
    assert.equal(lowerPreset('ultra'), 'high');
    assert.equal(lowerPreset('medium'), 'low');
    assert.equal(lowerPreset('low'), null);
});
