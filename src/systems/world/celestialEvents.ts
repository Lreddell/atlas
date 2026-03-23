const DEFAULT_TICK_CYCLE = 24000;
const BLOOD_MOON_CHANCE = 1 / 96;
const bloodMoonOverrides = new Map<number, boolean>();
const LUNAR_NOON_OFFSET = DEFAULT_TICK_CYCLE / 4;
export const BLOOD_MOON_MUSIC_START_TICK = 11900;
export const BLOOD_MOON_MUSIC_END_TICK = 23850;

export const BLOOD_MOON_TAG = 'blood_moon';

export interface LunarNightEventState {
    eventId: 'normal_night' | 'blood_moon';
    cycleIndex: number;
    phaseIndex: number;
    isBloodMoon: boolean;
    moonColorHex: string;
    moonGlowHex: string;
    skyTintHex: string;
    fogTintHex: string;
    moonLightHex: string;
    ambientLightHex: string;
    nightBrightnessMultiplier: number;
    moonLightMultiplier: number;
    gameplayTags: readonly string[];
    gameplayModifiers: {
        hostileSpawnRateMultiplier: number;
        hostileDetectionRangeMultiplier: number;
        ambientLootLuckMultiplier: number;
    };
}

function hashInteger(value: number) {
    let hashed = value | 0;
    hashed = Math.imul(hashed ^ 0x9e3779b9, 0x85ebca6b);
    hashed ^= hashed >>> 13;
    hashed = Math.imul(hashed, 0xc2b2ae35);
    hashed ^= hashed >>> 16;
    return hashed >>> 0;
}

function hashToUnitFloat(value: number) {
    return hashInteger(value) / 0xffffffff;
}

export function getMoonCycleIndex(ticks: number, tickCycle: number = DEFAULT_TICK_CYCLE) {
    const noonOffset = tickCycle === DEFAULT_TICK_CYCLE ? LUNAR_NOON_OFFSET : tickCycle / 4;
    return Math.floor((ticks - noonOffset) / tickCycle);
}

export function getMoonPhaseIndex(ticks: number, tickCycle: number = DEFAULT_TICK_CYCLE) {
    const cycleIndex = getMoonCycleIndex(ticks, tickCycle);
    return (cycleIndex % 8 + 8) % 8;
}

export function isBloodMoonCycle(cycleIndex: number, worldSeed: number = 0) {
    const override = bloodMoonOverrides.get(cycleIndex);
    if (override !== undefined) {
        return override;
    }

    const roll = hashToUnitFloat(cycleIndex ^ (worldSeed + 0x51f15e));
    return roll < BLOOD_MOON_CHANCE;
}

export function setBloodMoonOverride(cycleIndex: number, enabled: boolean) {
    bloodMoonOverrides.set(cycleIndex, enabled);
}

export function clearBloodMoonOverride(cycleIndex: number) {
    bloodMoonOverrides.delete(cycleIndex);
}

export function hasBloodMoonOverride(cycleIndex: number) {
    return bloodMoonOverrides.has(cycleIndex);
}

export function getBloodMoonMusicTicksRemaining(ticks: number, tickCycle: number = DEFAULT_TICK_CYCLE) {
    const time = ((ticks % tickCycle) + tickCycle) % tickCycle;
    if (time < BLOOD_MOON_MUSIC_START_TICK || time > BLOOD_MOON_MUSIC_END_TICK) {
        return 0;
    }

    return BLOOD_MOON_MUSIC_END_TICK - time + 1;
}

export function isBloodMoonMusicActive(ticks: number, tickCycle: number = DEFAULT_TICK_CYCLE, worldSeed: number = 0) {
    return getBloodMoonMusicTicksRemaining(ticks, tickCycle) > 0
        && getLunarNightEventState(ticks, tickCycle, worldSeed).isBloodMoon;
}

export function getLunarNightEventState(ticks: number, tickCycle: number = DEFAULT_TICK_CYCLE, worldSeed: number = 0): LunarNightEventState {
    const cycleIndex = getMoonCycleIndex(ticks, tickCycle);
    const phaseIndex = getMoonPhaseIndex(ticks, tickCycle);
    const isBloodMoon = isBloodMoonCycle(cycleIndex, worldSeed);

    if (isBloodMoon) {
        return {
            eventId: 'blood_moon',
            cycleIndex,
            phaseIndex,
            isBloodMoon,
            moonColorHex: '#7a0c0c',
            moonGlowHex: '#7a1c18',
            skyTintHex: '#481012',
            fogTintHex: '#3c0c10',
            moonLightHex: '#ff8a72',
            ambientLightHex: '#d85a54',
            nightBrightnessMultiplier: 1,
            moonLightMultiplier: 1,
            gameplayTags: [BLOOD_MOON_TAG],
            gameplayModifiers: {
                hostileSpawnRateMultiplier: 1.5,
                hostileDetectionRangeMultiplier: 1.2,
                ambientLootLuckMultiplier: 1.1,
            },
        };
    }

    return {
        eventId: 'normal_night',
        cycleIndex,
        phaseIndex,
        isBloodMoon,
        moonColorHex: '#ffffff',
        moonGlowHex: '#ffffff',
        skyTintHex: '#000000',
        fogTintHex: '#000000',
        moonLightHex: '#ffffff',
        ambientLightHex: '#ffffff',
        nightBrightnessMultiplier: 1,
        moonLightMultiplier: 1,
        gameplayTags: [],
        gameplayModifiers: {
            hostileSpawnRateMultiplier: 1,
            hostileDetectionRangeMultiplier: 1,
            ambientLootLuckMultiplier: 1,
        },
    };
}
