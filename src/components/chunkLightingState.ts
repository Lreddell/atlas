export let globalSunlightValue = 1.0;
export let globalBrightnessValue = 0.5;

export const CHUNK_LIGHTING_UNIFORMS = {
    uSunlight: { value: 1.0 },
    uBrightness: { value: 0.5 },
};

export const updateChunkMaterials = (sunlight: number, brightness: number = 0.5) => {
    globalSunlightValue = sunlight;
    globalBrightnessValue = brightness;
    CHUNK_LIGHTING_UNIFORMS.uSunlight.value = sunlight;
    CHUNK_LIGHTING_UNIFORMS.uBrightness.value = brightness;
};
