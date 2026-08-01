import type { BellTitanAction } from '../systems/entities/BellTitanEncounterCore';

export type BellTitanMaterialId = 'stone' | 'dark_stone' | 'bronze' | 'worn_bronze' | 'chain' | 'bell' | 'core';
export type BellTitanShellStage = 0 | 1 | 2;

export interface BellTitanPart {
    name: string;
    size: readonly [number, number, number];
    position: readonly [number, number, number];
    material: BellTitanMaterialId;
    rotation?: readonly [number, number, number];
    hiddenAtStage?: 1 | 2;
}

export interface BellTitanModelDefinition {
    height: number;
    parts: readonly BellTitanPart[];
}

const part = (
    name: string,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: BellTitanMaterialId,
    options: Pick<BellTitanPart, 'rotation' | 'hiddenAtStage'> = {},
): BellTitanPart => ({ name, size, position, material, ...options });

export const BELL_TITAN_MODEL: BellTitanModelDefinition = {
    height: 6.5,
    parts: [
        part('pelvis', [2.35, 0.72, 1.5], [0, 1.65, 0], 'dark_stone'),
        part('waist_bronze', [2.58, 0.32, 1.64], [0, 1.98, 0], 'worn_bronze', { hiddenAtStage: 2 }),
        part('torso', [2.9, 2.18, 1.72], [0, 3.16, 0], 'stone'),
        part('back_plate', [2.55, 1.72, 0.32], [0, 3.22, -1.01], 'dark_stone', { hiddenAtStage: 2 }),
        part('neck', [0.82, 0.48, 0.82], [0, 4.5, 0], 'worn_bronze'),
        part('head', [1.22, 0.92, 1.08], [0, 5.06, 0.06], 'stone'),
        part('brow', [1.44, 0.28, 1.16], [0, 5.24, 0.08], 'bronze', { hiddenAtStage: 2 }),
        part('crown_block', [0.58, 0.42, 0.64], [0, 5.7, -0.04], 'dark_stone'),
        part('crown_left', [0.42, 0.68, 0.52], [-0.48, 5.66, -0.03], 'worn_bronze', { rotation: [0, 0, -0.16], hiddenAtStage: 2 }),
        part('crown_right', [0.42, 0.68, 0.52], [0.48, 5.66, -0.03], 'worn_bronze', { rotation: [0, 0, 0.16], hiddenAtStage: 2 }),
        part('face_resonator', [0.64, 0.18, 0.14], [0, 5.03, 0.64], 'core'),

        part('left_thigh', [0.86, 1.38, 0.9], [-0.72, 0.95, 0], 'stone'),
        part('right_thigh', [0.86, 1.38, 0.9], [0.72, 0.95, 0], 'stone'),
        part('left_knee', [1, 0.42, 1.04], [-0.72, 0.52, 0.12], 'bronze', { hiddenAtStage: 2 }),
        part('right_knee', [1, 0.42, 1.04], [0.72, 0.52, 0.12], 'bronze', { hiddenAtStage: 2 }),
        part('left_foot', [1.12, 0.45, 1.65], [-0.72, 0.23, 0.28], 'dark_stone'),
        part('right_foot', [1.12, 0.45, 1.65], [0.72, 0.23, 0.28], 'dark_stone'),
        part('left_heel', [0.88, 0.34, 0.62], [-0.72, 0.26, -0.7], 'bronze', { hiddenAtStage: 2 }),
        part('right_heel', [0.88, 0.34, 0.62], [0.72, 0.26, -0.7], 'bronze', { hiddenAtStage: 2 }),

        part('left_shoulder', [1.18, 0.86, 1.18], [-1.8, 3.96, 0], 'stone'),
        part('right_shoulder', [1.42, 1.02, 1.34], [1.9, 4.02, 0], 'stone'),
        part('left_shoulder_shell', [1.54, 0.54, 1.46], [-1.86, 4.35, 0], 'bronze', { hiddenAtStage: 1 }),
        part('right_shoulder_shell', [1.82, 0.62, 1.58], [1.96, 4.48, 0], 'bronze', { hiddenAtStage: 1 }),
        part('left_pauldron_ridge', [1.76, 0.24, 0.48], [-1.86, 4.67, 0], 'dark_stone', { hiddenAtStage: 1 }),
        part('right_pauldron_ridge', [2.02, 0.26, 0.52], [1.96, 4.82, 0], 'dark_stone', { hiddenAtStage: 1 }),
        part('left_upper_arm', [0.76, 1.44, 0.82], [-1.86, 3.02, 0], 'dark_stone'),
        part('right_upper_arm', [0.9, 1.52, 0.9], [1.96, 3, 0], 'dark_stone'),
        part('left_elbow', [0.96, 0.5, 0.96], [-1.86, 2.28, 0], 'worn_bronze'),
        part('right_elbow', [1.08, 0.54, 1.08], [1.96, 2.2, 0], 'worn_bronze'),
        part('left_hammer', [1.24, 1.28, 1.58], [-1.86, 1.5, 0.18], 'worn_bronze'),
        part('right_hammer', [1.62, 1.46, 1.34], [1.96, 1.38, 0.12], 'bronze'),
        part('left_hammer_face', [1.48, 0.7, 1.82], [-1.86, 1.18, 0.28], 'dark_stone'),
        part('right_hammer_face', [1.9, 0.76, 1.58], [1.96, 1.02, 0.2], 'dark_stone'),
        part('left_hammer_band', [1.42, 0.28, 1.72], [-1.86, 1.62, 0.22], 'bronze'),
        part('right_hammer_band', [1.82, 0.3, 1.5], [1.96, 1.52, 0.15], 'worn_bronze'),
        part('left_hammer_spur', [0.52, 0.52, 2.08], [-1.86, 1.16, 0.26], 'bronze'),
        part('right_hammer_spur', [0.56, 0.56, 1.88], [1.96, 1, 0.18], 'bronze'),

        part('outer_shell_left', [0.62, 1.9, 1.94], [-1.2, 3.22, 0.08], 'bronze', { hiddenAtStage: 1 }),
        part('outer_shell_right', [0.62, 1.9, 1.94], [1.2, 3.22, 0.08], 'bronze', { hiddenAtStage: 1 }),
        part('outer_shell_keystone', [1.14, 0.6, 0.62], [0, 4.08, 0.92], 'bronze', { hiddenAtStage: 2 }),
        part('torso_rib_left', [0.28, 1.42, 0.34], [-1.12, 3.15, 0.92], 'worn_bronze', { hiddenAtStage: 2 }),
        part('torso_rib_right', [0.28, 1.42, 0.34], [1.12, 3.15, 0.92], 'worn_bronze', { hiddenAtStage: 2 }),
        part('torso_rib_top', [2.42, 0.28, 0.36], [0, 4.16, 0.86], 'dark_stone', { hiddenAtStage: 2 }),
        part('chest_cage_left', [0.22, 1.62, 0.28], [-0.86, 3.2, 1.02], 'chain'),
        part('chest_cage_right', [0.22, 1.62, 0.28], [0.86, 3.2, 1.02], 'chain'),
        part('chest_cage_top', [1.9, 0.22, 0.28], [0, 4.02, 1.02], 'chain'),
        part('chest_cage_bottom', [1.9, 0.22, 0.28], [0, 2.38, 1.02], 'chain'),
        part('left_chain', [0.18, 0.58, 0.18], [-0.46, 3.92, 1.08], 'chain', { rotation: [0, 0, -0.16] }),
        part('left_chain_lower', [0.18, 0.62, 0.18], [-0.38, 3.34, 1.08], 'chain', { rotation: [0, 0, 0.12] }),
        part('right_chain', [0.18, 0.58, 0.18], [0.46, 3.92, 1.08], 'chain', { rotation: [0, 0, 0.16] }),
        part('right_chain_lower', [0.18, 0.62, 0.18], [0.38, 3.34, 1.08], 'chain', { rotation: [0, 0, -0.12] }),
        part('rear_chain_left', [0.16, 1.06, 0.16], [-0.7, 3.54, 0.68], 'chain', { rotation: [0.12, 0, -0.24] }),
        part('rear_chain_right', [0.16, 1.06, 0.16], [0.7, 3.54, 0.68], 'chain', { rotation: [0.12, 0, 0.24] }),
        part('bell_crown', [1.18, 0.34, 1.18], [0, 3.68, 1.16], 'worn_bronze'),
        part('hanging_bell', [1.58, 1.34, 1.58], [0, 2.92, 1.16], 'bell'),
        part('bell_lower', [1.74, 0.42, 1.74], [0, 2.32, 1.16], 'bell'),
        part('bell_lip', [1.94, 0.28, 1.94], [0, 2.08, 1.16], 'worn_bronze'),
        part('bell_corner_left', [0.22, 1.04, 0.22], [-0.82, 2.76, 1.88], 'bronze'),
        part('bell_corner_right', [0.22, 1.04, 0.22], [0.82, 2.76, 1.88], 'bronze'),
        part('bell_crack', [0.18, 0.88, 0.14], [0.22, 2.86, 1.86], 'core'),
        part('bell_clapper_stem', [0.22, 0.62, 0.22], [0, 2.12, 1.16], 'chain'),
        part('bell_clapper', [0.44, 0.44, 0.44], [0, 1.78, 1.16], 'bell'),
    ],
};

export const BELL_TITAN_ACTIONS: readonly BellTitanAction[] = [
    'dormant', 'awaken', 'idle',
    'sweep_windup', 'sweep_active', 'sweep_recovery',
    'slam_windup', 'slam_active', 'slam_recovery',
    'advance_windup', 'advance_active', 'advance_recovery',
    'double_toll_windup', 'double_toll_active', 'double_toll_recovery',
    'hammer_combo_windup', 'hammer_combo_active', 'hammer_combo_recovery',
    'chain_lash_windup', 'chain_lash_active', 'chain_lash_recovery',
    'vaultbreaker_windup', 'vaultbreaker_active', 'vaultbreaker_recovery',
    'resonance_cage_windup', 'resonance_cage_active', 'resonance_cage_recovery',
    'bell_storm_windup', 'bell_storm_active', 'bell_storm_recovery',
    'core_open', 'shell_break', 'stagger', 'death',
];

export interface BellTitanPose {
    rootY: number;
    rootX: number;
    rootZ: number;
    torsoX: number;
    torsoYaw: number;
    headX: number;
    leftShoulderX: number;
    leftShoulderZ: number;
    rightShoulderX: number;
    rightShoulderZ: number;
    leftHammerX: number;
    leftHammerZ: number;
    rightHammerX: number;
    rightHammerZ: number;
    leftLegX: number;
    rightLegX: number;
    chestOpen: number;
    bellSwingX: number;
    bellSwingZ: number;
    clapperSwing: number;
    chainSway: number;
}

const BASE_POSE: BellTitanPose = {
    rootY: 0,
    rootX: 0,
    rootZ: 0,
    torsoX: 0,
    torsoYaw: 0,
    headX: 0,
    leftShoulderX: 0,
    leftShoulderZ: 0,
    rightShoulderX: 0,
    rightShoulderZ: 0,
    leftHammerX: 0,
    leftHammerZ: 0,
    rightHammerX: 0,
    rightHammerZ: 0,
    leftLegX: 0,
    rightLegX: 0,
    chestOpen: 0,
    bellSwingX: 0,
    bellSwingZ: 0,
    clapperSwing: 0,
    chainSway: 0,
};

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function ease(value: number): number {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
}

function dampedSwing(time: number, amplitude: number, decay = 0.22): number {
    return Math.sin(time * 5.1) * amplitude * Math.exp(-Math.max(0, time) * decay);
}

export function getBellTitanVisibleParts(stage: BellTitanShellStage): string[] {
    return BELL_TITAN_MODEL.parts
        .filter((modelPart) => modelPart.hiddenAtStage === undefined || stage < modelPart.hiddenAtStage)
        .map((modelPart) => modelPart.name);
}

export function sampleBellTitanPose(action: BellTitanAction, progress: number, time: number): BellTitanPose {
    const p = clamp01(progress);
    const e = ease(p);
    const breathing = Math.sin(time * 1.25) * 0.018;
    const pose: BellTitanPose = { ...BASE_POSE, rootY: breathing, bellSwingZ: dampedSwing(time, 0.025, 0.04) };

    switch (action) {
        case 'dormant':
            return { ...pose, rootY: -0.82, rootX: 0.12, headX: 0.28, leftHammerX: -0.24, rightHammerX: -0.18 };
        case 'awaken':
            return {
                ...pose,
                rootY: -0.82 + e * 0.82,
                rootX: 0.12 * (1 - e),
                headX: 0.28 * (1 - e),
                leftShoulderZ: Math.sin(p * Math.PI) * 0.12,
                rightShoulderZ: -Math.sin(p * Math.PI) * 0.12,
                bellSwingZ: Math.sin(p * Math.PI * 3) * 0.16 * e,
                clapperSwing: Math.sin(p * Math.PI * 3) * 0.2 * e,
            };
        case 'idle':
            return { ...pose, torsoYaw: Math.sin(time * 0.42) * 0.018, chainSway: Math.sin(time * 0.85) * 0.035 };
        case 'sweep_windup':
            return { ...pose, torsoYaw: -0.68 * e, rightShoulderX: -0.42 * e, rightShoulderZ: -0.72 * e, rightHammerX: -0.36 * e, rightHammerZ: -0.86 * e, bellSwingZ: -0.12 * e };
        case 'sweep_active': {
            const contact = ease(Math.min(1, p * 2));
            return { ...pose, torsoYaw: -0.68 + 1.52 * contact, rightShoulderZ: -0.72 + 1.5 * contact, rightHammerZ: -0.86 + 1.84 * contact, bellSwingZ: 0.28 * Math.sin(p * Math.PI) };
        }
        case 'sweep_recovery':
            return { ...pose, torsoYaw: 0.84 * (1 - e), rightShoulderZ: 0.78 * (1 - e), rightHammerZ: 0.98 * (1 - e), bellSwingZ: dampedSwing(time, 0.24) };
        case 'slam_windup':
            return { ...pose, torsoX: -0.18 * e, leftShoulderX: -1.32 * e, rightShoulderX: -1.44 * e, leftHammerX: -1.52 * e, rightHammerX: -1.68 * e, rootY: 0.12 * e, bellSwingX: -0.14 * e };
        case 'slam_active':
            return { ...pose, torsoX: -0.18 + 0.7 * e, leftShoulderX: -1.32 + 2.1 * e, rightShoulderX: -1.44 + 2.28 * e, leftHammerX: -1.52 + 2.52 * e, rightHammerX: -1.68 + 2.68 * e, rootY: 0.12 - 0.24 * e, bellSwingX: 0.42 * e };
        case 'slam_recovery':
            return { ...pose, torsoX: 0.52 * (1 - e), leftHammerX: 1 * (1 - e), rightHammerX: 1 * (1 - e), rootY: -0.12 * (1 - e), bellSwingX: dampedSwing(time, 0.36) };
        case 'advance_windup':
            return { ...pose, rootX: 0.34 * e, rootZ: -0.2 * e, leftLegX: -0.38 * e, rightLegX: 0.28 * e, rightHammerX: -0.48 * e };
        case 'advance_active':
            return { ...pose, rootX: 0.38, rootZ: 0.12 * Math.sin(p * Math.PI), leftLegX: -0.38 + 0.76 * e, rightLegX: 0.28 - 0.68 * e, rightHammerX: -0.48 + 1.1 * e, bellSwingX: -0.24 * Math.sin(p * Math.PI) };
        case 'advance_recovery':
            return { ...pose, rootX: 0.38 * (1 - e), leftLegX: 0.38 * (1 - e), rightLegX: -0.4 * (1 - e), rightHammerX: 0.62 * (1 - e), bellSwingX: dampedSwing(time, 0.22) };
        case 'double_toll_windup':
            return { ...pose, torsoX: -0.12 * e, leftShoulderX: -0.88 * e, rightShoulderX: -0.88 * e, leftHammerZ: -0.28 * e, rightHammerZ: 0.28 * e, chainSway: 0.16 * e, bellSwingX: -0.18 * e };
        case 'double_toll_active': {
            const strike = Math.sin(p * Math.PI * 2);
            return { ...pose, torsoX: 0.16 * Math.abs(strike), leftShoulderX: -0.88 + 1.36 * Math.abs(strike), rightShoulderX: -0.88 + 1.36 * Math.abs(strike), bellSwingX: 0.46 * strike, clapperSwing: -0.58 * strike, chainSway: 0.22 * strike };
        }
        case 'double_toll_recovery':
            return { ...pose, torsoX: 0.16 * (1 - e), leftShoulderX: 0.48 * (1 - e), rightShoulderX: 0.48 * (1 - e), bellSwingX: dampedSwing(time, 0.42), clapperSwing: dampedSwing(time + 0.16, -0.5) };
        case 'hammer_combo_windup':
            return { ...pose, torsoYaw: -0.38 * e, leftShoulderZ: 0.7 * e, rightShoulderZ: -0.7 * e, leftHammerZ: 0.78 * e, rightHammerZ: -0.78 * e, rootX: 0.12 * e };
        case 'hammer_combo_active': {
            const swing = Math.sin(p * Math.PI * 2);
            return { ...pose, torsoYaw: 0.58 * swing, leftShoulderZ: 0.82 * swing, rightShoulderZ: -0.82 * swing, leftHammerZ: 1.02 * swing, rightHammerZ: -1.02 * swing, bellSwingZ: -0.24 * swing };
        }
        case 'hammer_combo_recovery':
            return { ...pose, torsoYaw: 0.34 * (1 - e), leftHammerZ: -0.5 * (1 - e), rightHammerZ: 0.5 * (1 - e), bellSwingZ: dampedSwing(time, 0.28) };
        case 'chain_lash_windup':
            return { ...pose, rootX: 0.08 * e, torsoYaw: -0.92 * e, leftShoulderZ: 0.34 * e, rightShoulderZ: -1.04 * e, rightHammerZ: -1.28 * e, leftHammerX: -0.3 * e, bellSwingZ: -0.22 * e, chainSway: -0.3 * e };
        case 'chain_lash_active': {
            const whip = ease(Math.min(1, p * 1.45));
            return { ...pose, torsoYaw: -0.92 + 2.18 * whip, leftShoulderZ: 0.34 - 0.72 * whip, rightShoulderZ: -1.04 + 2.26 * whip, rightHammerZ: -1.28 + 2.76 * whip, rootZ: 0.12 * Math.sin(p * Math.PI), bellSwingZ: 0.48 * Math.sin(p * Math.PI), chainSway: 0.62 * Math.sin(p * Math.PI) };
        }
        case 'chain_lash_recovery':
            return { ...pose, torsoYaw: 1.26 * (1 - e), rightShoulderZ: 1.22 * (1 - e), rightHammerZ: 1.48 * (1 - e), bellSwingZ: dampedSwing(time, 0.46), chainSway: dampedSwing(time + 0.12, -0.34) };
        case 'vaultbreaker_windup':
            return { ...pose, rootY: 0.2 * e, rootX: -0.1 * e, torsoX: -0.26 * e, leftLegX: -0.32 * e, rightLegX: 0.24 * e, leftShoulderX: -1.5 * e, rightShoulderX: -1.64 * e, leftHammerX: -1.76 * e, rightHammerX: -1.92 * e, bellSwingX: -0.28 * e };
        case 'vaultbreaker_active':
            return { ...pose, rootY: 0.2 - 0.36 * e, rootX: -0.1 + 0.64 * e, rootZ: 0.32 * e, torsoX: -0.26 + 0.96 * e, leftShoulderX: -1.5 + 2.64 * e, rightShoulderX: -1.64 + 2.86 * e, leftHammerX: -1.76 + 3.08 * e, rightHammerX: -1.92 + 3.26 * e, bellSwingX: 0.56 * e };
        case 'vaultbreaker_recovery':
            return { ...pose, rootY: -0.16 * (1 - e), rootX: 0.54 * (1 - e), rootZ: 0.32 * (1 - e), torsoX: 0.7 * (1 - e), leftHammerX: 1.32 * (1 - e), rightHammerX: 1.34 * (1 - e), bellSwingX: dampedSwing(time, 0.54), clapperSwing: dampedSwing(time + 0.1, -0.58) };
        case 'resonance_cage_windup':
            return { ...pose, rootY: 0.22 * e, torsoX: -0.12 * e, leftShoulderZ: -1.08 * e, rightShoulderZ: 1.08 * e, leftHammerZ: -1.24 * e, rightHammerZ: 1.24 * e, chestOpen: 0.22 * e, bellSwingX: Math.sin(p * Math.PI * 4) * 0.08 * e, chainSway: Math.sin(p * Math.PI * 4) * 0.18 * e };
        case 'resonance_cage_active': {
            const pulse = Math.sin(p * Math.PI * 3);
            return { ...pose, rootY: 0.1 + Math.abs(pulse) * 0.16, torsoX: 0.16 * Math.abs(pulse), leftShoulderZ: -1.08 + 0.28 * pulse, rightShoulderZ: 1.08 - 0.28 * pulse, leftHammerZ: -1.24 + 0.38 * pulse, rightHammerZ: 1.24 - 0.38 * pulse, chestOpen: 0.3, bellSwingX: 0.62 * pulse, clapperSwing: -0.78 * pulse, chainSway: 0.36 * pulse };
        }
        case 'resonance_cage_recovery':
            return { ...pose, rootY: 0.1 * (1 - e), leftShoulderZ: -1.08 * (1 - e), rightShoulderZ: 1.08 * (1 - e), leftHammerZ: -1.24 * (1 - e), rightHammerZ: 1.24 * (1 - e), chestOpen: 0.3 * (1 - e), bellSwingX: dampedSwing(time, 0.6), clapperSwing: dampedSwing(time + 0.15, -0.72) };
        case 'bell_storm_windup':
            return { ...pose, rootY: 0.16 * e, torsoX: -0.16 * e, leftShoulderX: -1.04 * e, rightShoulderX: -1.04 * e, leftHammerX: -1.3 * e, rightHammerX: -1.3 * e, chainSway: 0.2 * e };
        case 'bell_storm_active': {
            const toll = Math.sin(p * Math.PI * 5);
            return { ...pose, rootY: 0.08 + Math.abs(toll) * 0.08, torsoX: 0.2 * Math.abs(toll), leftShoulderX: -0.8 + Math.abs(toll) * 1.42, rightShoulderX: -0.8 + Math.abs(toll) * 1.42, bellSwingX: 0.52 * toll, clapperSwing: -0.7 * toll, chainSway: 0.28 * toll };
        }
        case 'bell_storm_recovery':
            return { ...pose, torsoX: 0.2 * (1 - e), leftHammerX: 0.62 * (1 - e), rightHammerX: 0.62 * (1 - e), bellSwingX: dampedSwing(time, 0.52), clapperSwing: dampedSwing(time + 0.12, -0.62) };
        case 'core_open':
            return { ...pose, chestOpen: e, torsoX: -0.04, bellSwingZ: 0.11 + dampedSwing(time, 0.16, 0.08), clapperSwing: dampedSwing(time + 0.2, -0.24, 0.12), chainSway: dampedSwing(time, 0.08, 0.1) };
        case 'shell_break':
            return { ...pose, rootX: Math.sin(p * Math.PI * 8) * 0.08 * (1 - p), torsoYaw: Math.sin(p * Math.PI * 7) * 0.1 * (1 - p), leftShoulderZ: -0.2 * Math.sin(p * Math.PI), rightShoulderZ: 0.2 * Math.sin(p * Math.PI), bellSwingZ: 0.26 * Math.sin(p * Math.PI) };
        case 'stagger':
            return { ...pose, rootX: -0.18 * Math.sin(p * Math.PI), torsoYaw: 0.16 * Math.sin(p * Math.PI), leftHammerX: -0.24 * Math.sin(p * Math.PI), rightHammerX: -0.3 * Math.sin(p * Math.PI), bellSwingZ: -0.18 * Math.sin(p * Math.PI) };
        case 'death':
            return { ...pose, rootY: -2.05 * e, rootX: 1.26 * e, rootZ: 0.58 * e, torsoYaw: -0.2 * e, leftShoulderX: 0.7 * e, rightShoulderX: 0.82 * e, leftHammerZ: -0.5 * e, rightHammerZ: 0.62 * e, bellSwingX: dampedSwing(time, 0.32), clapperSwing: dampedSwing(time + 0.2, -0.4) };
    }
}
