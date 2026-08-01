import type { VaultEnemyActionId, VaultEnemyKind } from '../systems/entities/resonantVaultEnemies';

export type VaultEnemyAnimationClip =
    | 'idle'
    | 'alert'
    | 'turn'
    | 'move'
    | 'anticipation'
    | 'attack'
    | 'recovery'
    | 'block'
    | 'hurt'
    | 'stagger'
    | 'death';

export type VaultEnemyMaterialId = 'stone' | 'darkStone' | 'bronze' | 'cloth' | 'bell' | 'accent';
export type VaultEnemyPartShape = 'box' | 'cylinder';
export type VaultEnemyBodyPlan = 'shield_bearer' | 'hooded_marksman' | 'bell_hound' | 'hammer_elite';
export type VaultEnemyVec3 = readonly [number, number, number];

export interface VaultEnemyPartDefinition {
    id: string;
    parent?: string;
    shape: VaultEnemyPartShape;
    /** Box width/height/depth, or cylinder top radius/bottom radius/height. */
    size: VaultEnemyVec3;
    position: VaultEnemyVec3;
    meshOffset: VaultEnemyVec3;
    rotation?: VaultEnemyVec3;
    material: VaultEnemyMaterialId;
    segments?: number;
}

export interface VaultEnemyModelDefinition {
    kind: VaultEnemyKind;
    bodyPlan: VaultEnemyBodyPlan;
    texture: string;
    /** Authored body-space correction that keeps the silhouette inside gameplay clearance. */
    visualScale: VaultEnemyVec3;
    parts: readonly VaultEnemyPartDefinition[];
}

export interface VaultEnemyAnimationPose {
    rootPosition: VaultEnemyVec3;
    rootRotation: VaultEnemyVec3;
    partRotations: Readonly<Record<string, VaultEnemyVec3>>;
    partPositions: Readonly<Record<string, VaultEnemyVec3>>;
    partScales: Readonly<Record<string, VaultEnemyVec3>>;
}

const v = (x = 0, y = 0, z = 0): VaultEnemyVec3 => [x, y, z];
const box = (
    id: string,
    size: VaultEnemyVec3,
    position: VaultEnemyVec3,
    material: VaultEnemyMaterialId,
    parent?: string,
    meshOffset: VaultEnemyVec3 = v(),
    rotation?: VaultEnemyVec3,
): VaultEnemyPartDefinition => ({ id, shape: 'box', size, position, meshOffset, material, parent, rotation });
const cylinder = (
    id: string,
    size: VaultEnemyVec3,
    position: VaultEnemyVec3,
    material: VaultEnemyMaterialId,
    parent?: string,
    meshOffset: VaultEnemyVec3 = v(),
    rotation?: VaultEnemyVec3,
    segments = 8,
): VaultEnemyPartDefinition => ({ id, shape: 'cylinder', size, position, meshOffset, material, parent, rotation, segments });

const GUARD_PARTS: readonly VaultEnemyPartDefinition[] = [
    box('pelvis', v(0.66, 0.34, 0.42), v(0, 0.68, 0), 'bronze'),
    box('torso', v(0.78, 0.76, 0.5), v(0, 1.16, 0), 'stone'),
    box('chestBand', v(0.86, 0.18, 0.56), v(0, 1.34, 0), 'bronze'),
    box('head', v(0.48, 0.42, 0.44), v(0, 1.77, 0.02), 'darkStone'),
    box('helmetBrow', v(0.58, 0.14, 0.5), v(0, 1.92, 0.02), 'bronze'),
    box('shieldArm', v(0.22, 0.7, 0.24), v(-0.55, 1.46, 0), 'bronze', undefined, v(0, -0.26, 0)),
    box('shield', v(0.72, 0.92, 0.13), v(0, -0.34, 0.32), 'darkStone', 'shieldArm'),
    box('shieldBoss', v(0.22, 0.22, 0.09), v(0, -0.34, 0.41), 'bell', 'shieldArm'),
    box('weaponArm', v(0.22, 0.68, 0.24), v(0.55, 1.46, 0), 'bronze', undefined, v(0, -0.25, 0)),
    cylinder('spearShaft', v(0.045, 0.045, 1.65), v(0, -0.82, 0.06), 'darkStone', 'weaponArm'),
    box('spearHead', v(0.16, 0.3, 0.12), v(0, -1.68, 0.06), 'bell', 'weaponArm'),
    box('leftLeg', v(0.28, 0.66, 0.32), v(-0.22, 0.52, 0), 'stone', undefined, v(0, -0.29, 0)),
    box('rightLeg', v(0.28, 0.66, 0.32), v(0.22, 0.52, 0), 'stone', undefined, v(0, -0.29, 0)),
    box('leftFoot', v(0.34, 0.2, 0.5), v(-0.22, 0.12, 0.09), 'bronze'),
    box('rightFoot', v(0.34, 0.2, 0.5), v(0.22, 0.12, 0.09), 'bronze'),
];

const MARKSMAN_PARTS: readonly VaultEnemyPartDefinition[] = [
    box('pelvis', v(0.58, 0.3, 0.38), v(0, 0.64, 0), 'darkStone'),
    box('robe', v(0.66, 0.72, 0.46), v(0, 0.94, -0.02), 'cloth'),
    box('torso', v(0.62, 0.62, 0.42), v(0, 1.38, 0), 'stone'),
    box('cloak', v(0.7, 0.78, 0.13), v(0, 1.25, -0.28), 'cloth'),
    box('head', v(0.4, 0.38, 0.38), v(0, 1.78, 0.03), 'darkStone'),
    box('hood', v(0.52, 0.46, 0.48), v(0, 1.83, -0.01), 'cloth'),
    box('faceSlit', v(0.28, 0.08, 0.05), v(0, 1.78, 0.245), 'accent'),
    box('leftArm', v(0.2, 0.66, 0.22), v(-0.43, 1.48, 0.04), 'bronze', undefined, v(0, -0.25, 0)),
    box('rightArm', v(0.2, 0.66, 0.22), v(0.43, 1.48, 0.04), 'bronze', undefined, v(0, -0.25, 0)),
    box('crossbowStock', v(0.74, 0.12, 0.18), v(0, -0.52, 0.35), 'darkStone', 'leftArm'),
    box('crossbowLeftLimb', v(0.52, 0.08, 0.12), v(-0.36, -0.52, 0.4), 'bronze', 'leftArm', v(), v(0, 0, 0.28)),
    box('crossbowRightLimb', v(0.52, 0.08, 0.12), v(0.36, -0.52, 0.4), 'bronze', 'leftArm', v(), v(0, 0, -0.28)),
    box('loadedBolt', v(0.06, 0.06, 0.78), v(0, -0.5, 0.66), 'bell', 'leftArm'),
    box('leftLeg', v(0.24, 0.58, 0.28), v(-0.18, 0.46, 0), 'darkStone', undefined, v(0, -0.25, 0)),
    box('rightLeg', v(0.24, 0.58, 0.28), v(0.18, 0.46, 0), 'darkStone', undefined, v(0, -0.25, 0)),
    box('quiver', v(0.2, 0.64, 0.2), v(0.35, 1.2, -0.34), 'bronze', undefined, v(), v(0.18, 0, -0.16)),
];

const HOUND_PARTS: readonly VaultEnemyPartDefinition[] = [
    box('body', v(1.1, 0.54, 0.58), v(0, 0.68, 0), 'stone'),
    box('backPlate', v(0.72, 0.14, 0.64), v(0, 1.0, -0.03), 'bronze'),
    box('neck', v(0.4, 0.46, 0.42), v(0, 0.82, 0.46), 'darkStone', undefined, v(), v(-0.25, 0, 0)),
    box('head', v(0.54, 0.46, 0.58), v(0, 0.92, 0.79), 'stone'),
    box('snout', v(0.34, 0.26, 0.42), v(0, 0.82, 1.22), 'darkStone'),
    box('leftEar', v(0.15, 0.34, 0.16), v(-0.18, 1.23, 0.73), 'bronze', undefined, v(), v(0, 0, -0.2)),
    box('rightEar', v(0.15, 0.34, 0.16), v(0.18, 1.23, 0.73), 'bronze', undefined, v(), v(0, 0, 0.2)),
    cylinder('collarBell', v(0.15, 0.2, 0.28), v(0, 0.55, 0.73), 'bell', undefined, v(), v(Math.PI / 2, 0, 0)),
    box('frontLeftLeg', v(0.2, 0.6, 0.22), v(-0.38, 0.55, 0.34), 'bronze', undefined, v(0, -0.25, 0)),
    box('frontRightLeg', v(0.2, 0.6, 0.22), v(0.38, 0.55, 0.34), 'bronze', undefined, v(0, -0.25, 0)),
    box('backLeftLeg', v(0.23, 0.62, 0.25), v(-0.38, 0.56, -0.35), 'darkStone', undefined, v(0, -0.26, 0)),
    box('backRightLeg', v(0.23, 0.62, 0.25), v(0.38, 0.56, -0.35), 'darkStone', undefined, v(0, -0.26, 0)),
    box('frontLeftPaw', v(0.26, 0.14, 0.36), v(-0.38, 0.1, 0.44), 'stone'),
    box('frontRightPaw', v(0.26, 0.14, 0.36), v(0.38, 0.1, 0.44), 'stone'),
    box('backLeftPaw', v(0.28, 0.14, 0.38), v(-0.38, 0.1, -0.26), 'stone'),
    box('backRightPaw', v(0.28, 0.14, 0.38), v(0.38, 0.1, -0.26), 'stone'),
    box('tail', v(0.16, 0.16, 0.76), v(0, 0.82, -0.66), 'bronze', undefined, v(0, 0, -0.3), v(-0.34, 0, 0)),
];

const TOLLKEEPER_PARTS: readonly VaultEnemyPartDefinition[] = [
    box('pelvis', v(0.94, 0.42, 0.62), v(0, 0.9, 0), 'bronze'),
    box('torso', v(1.16, 1.06, 0.74), v(0, 1.64, 0), 'stone'),
    box('chestBell', v(0.56, 0.7, 0.18), v(0, 1.7, 0.47), 'bell'),
    box('bellCrack', v(0.08, 0.44, 0.04), v(0.08, 1.68, 0.58), 'accent', undefined, v(), v(0, 0, 0.24)),
    box('head', v(0.62, 0.5, 0.54), v(0, 2.44, 0), 'darkStone'),
    box('headCrown', v(0.76, 0.18, 0.64), v(0, 2.68, 0), 'bronze'),
    box('leftShoulder', v(0.68, 0.5, 0.72), v(-0.83, 1.98, 0), 'bronze'),
    box('rightShoulder', v(0.68, 0.5, 0.72), v(0.83, 1.98, 0), 'bronze'),
    box('leftArm', v(0.34, 0.82, 0.38), v(-0.9, 1.68, 0), 'stone', undefined, v(0, -0.34, 0)),
    box('rightArm', v(0.34, 0.82, 0.38), v(0.9, 1.68, 0), 'stone', undefined, v(0, -0.34, 0)),
    box('leftFist', v(0.46, 0.42, 0.48), v(0, -0.76, 0), 'darkStone', 'leftArm'),
    box('rightFist', v(0.46, 0.42, 0.48), v(0, -0.76, 0), 'darkStone', 'rightArm'),
    cylinder('hammerShaft', v(0.08, 0.08, 1.88), v(0, -1.12, 0.05), 'darkStone', 'rightArm'),
    box('hammerHead', v(1.08, 0.58, 0.64), v(0, -2.02, 0.05), 'bell', 'rightArm'),
    box('leftThigh', v(0.4, 0.82, 0.46), v(-0.34, 0.73, 0), 'stone', undefined, v(0, -0.34, 0)),
    box('rightThigh', v(0.4, 0.82, 0.46), v(0.34, 0.73, 0), 'stone', undefined, v(0, -0.34, 0)),
    box('leftShin', v(0.46, 0.68, 0.5), v(-0.34, 0.3, 0), 'darkStone', undefined, v(0, -0.25, 0)),
    box('rightShin', v(0.46, 0.68, 0.5), v(0.34, 0.3, 0), 'darkStone', undefined, v(0, -0.25, 0)),
    box('leftFoot', v(0.54, 0.24, 0.72), v(-0.34, 0.13, 0.12), 'bronze'),
    box('rightFoot', v(0.54, 0.24, 0.72), v(0.34, 0.13, 0.12), 'bronze'),
];

export const VAULT_ENEMY_MODELS: Readonly<Record<VaultEnemyKind, VaultEnemyModelDefinition>> = Object.freeze({
    vault_guard: { kind: 'vault_guard', bodyPlan: 'shield_bearer', texture: '/assets/rvx/textures/entities/vault_guard.png', visualScale: [1, 0.9, 1], parts: GUARD_PARTS },
    vault_marksman: { kind: 'vault_marksman', bodyPlan: 'hooded_marksman', texture: '/assets/rvx/textures/entities/vault_marksman.png', visualScale: [1, 0.86, 1], parts: MARKSMAN_PARTS },
    bell_hound: { kind: 'bell_hound', bodyPlan: 'bell_hound', texture: '/assets/rvx/textures/entities/bell_hound.png', visualScale: [1, 0.66, 1], parts: HOUND_PARTS },
    tollkeeper: { kind: 'tollkeeper', bodyPlan: 'hammer_elite', texture: '/assets/rvx/textures/entities/tollkeeper.png', visualScale: [1, 0.98, 1], parts: TOLLKEEPER_PARTS },
});

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smooth = (value: number): number => {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
};
const emptyPose = (): {
    rootPosition: VaultEnemyVec3;
    rootRotation: VaultEnemyVec3;
    partRotations: Record<string, VaultEnemyVec3>;
    partPositions: Record<string, VaultEnemyVec3>;
    partScales: Record<string, VaultEnemyVec3>;
} => ({ rootPosition: v(), rootRotation: v(), partRotations: {}, partPositions: {}, partScales: {} });

function applyLocomotion(kind: VaultEnemyKind, pose: ReturnType<typeof emptyPose>, amount: number, time: number): void {
    const gait = Math.sin(time * (kind === 'bell_hound' ? 10.5 : kind === 'tollkeeper' ? 4.6 : 7.2)) * amount;
    if (kind === 'bell_hound') {
        pose.rootPosition = v(0, Math.abs(gait) * 0.035, 0);
        pose.rootRotation = v(gait * 0.025, 0, -gait * 0.025);
        pose.partRotations.frontLeftLeg = v(gait * 0.72, 0, 0);
        pose.partRotations.backRightLeg = v(gait * 0.72, 0, 0);
        pose.partRotations.frontRightLeg = v(-gait * 0.72, 0, 0);
        pose.partRotations.backLeftLeg = v(-gait * 0.72, 0, 0);
        pose.partRotations.tail = v(-0.34, gait * 0.42, 0);
        return;
    }
    const leftLeg = kind === 'tollkeeper' ? 'leftThigh' : 'leftLeg';
    const rightLeg = kind === 'tollkeeper' ? 'rightThigh' : 'rightLeg';
    pose.rootPosition = v(0, Math.abs(gait) * (kind === 'tollkeeper' ? 0.045 : 0.025), 0);
    pose.rootRotation = v(0, 0, gait * (kind === 'tollkeeper' ? 0.025 : 0.04));
    pose.partRotations[leftLeg] = v(gait * 0.48, 0, 0);
    pose.partRotations[rightLeg] = v(-gait * 0.48, 0, 0);
    if (kind === 'vault_guard') {
        pose.partRotations.shieldArm = v(-gait * 0.22, 0, -0.08);
        // The spear stays couched and levelled while closing distance so its
        // threat range reads before the first sweep.
        pose.partRotations.weaponArm = v(-1.24 + gait * 0.12, 0, 0.08);
    } else if (kind === 'vault_marksman') {
        pose.partRotations.leftArm = v(-0.45 + gait * 0.08, 0, -0.12);
        pose.partRotations.rightArm = v(-0.42 - gait * 0.08, 0, 0.12);
    } else {
        pose.partRotations.leftArm = v(gait * 0.18, 0, -0.08);
        pose.partRotations.rightArm = v(-gait * 0.14, 0, 0.08);
    }
}

function applyCombatClip(
    kind: VaultEnemyKind,
    clip: VaultEnemyAnimationClip,
    progress: number,
    pose: ReturnType<typeof emptyPose>,
    actionId?: VaultEnemyActionId,
): void {
    const t = smooth(progress);
    const recoil = Math.sin(clamp01(progress) * Math.PI);
    if (clip === 'hurt' || clip === 'stagger') {
        const strength = clip === 'stagger' ? 1 : 0.55;
        pose.rootPosition = v(0, recoil * 0.08 * strength, -recoil * 0.12 * strength);
        pose.rootRotation = v(-recoil * 0.18 * strength, 0, Math.sin(progress * Math.PI * 5) * recoil * 0.08 * strength);
        return;
    }
    if (clip === 'death') {
        pose.rootPosition = v(0, -t * (kind === 'bell_hound' ? 0.28 : 0.5), 0);
        pose.rootRotation = kind === 'bell_hound' ? v(0.18 * t, 0, 1.18 * t) : v(1.32 * t, 0, -0.24 * t);
        return;
    }

    if (kind === 'vault_guard') {
        if (actionId === 'shield_bash' && clip === 'anticipation') {
            pose.rootPosition = v(0, -0.08 * t, -0.08 * t);
            pose.rootRotation = v(-0.08 * t, 0.22 * t, -0.08 * t);
            pose.partRotations.shieldArm = v(-0.62 * t, 0.8 * t, -1.12 * t);
            pose.partPositions.shieldArm = v(-0.48 + 0.12 * t, 1.46, -0.18 * t);
            pose.partRotations.weaponArm = v(-1.05, 0, 0.28);
        } else if (actionId === 'shield_bash' && clip === 'attack') {
            pose.rootPosition = v(0, -0.05, recoil * 0.48);
            pose.rootRotation = v(0.16 * recoil, -0.18 * recoil, 0.08 * recoil);
            pose.partRotations.shieldArm = v(-0.94 + t * 0.24, 0.24, -1.18);
            pose.partPositions.shieldArm = v(-0.22, 1.5, 0.5 * recoil);
            pose.partRotations.weaponArm = v(-0.72, 0, 0.34);
        } else if (actionId === 'shield_bash' && clip === 'recovery') {
            pose.rootPosition = v(0, -0.05 * (1 - t), 0.18 * (1 - t));
            pose.partRotations.shieldArm = v(-0.7 * (1 - t), 0.28 * (1 - t), -0.92 * (1 - t));
            pose.partPositions.shieldArm = v(-0.28 - 0.27 * t, 1.5 - 0.04 * t, 0.24 * (1 - t));
            pose.partRotations.weaponArm = v(-0.72 - 0.52 * t, 0, 0.34 - 0.18 * t);
        } else if (clip === 'anticipation') {
            // Draw the levelled spear back past the hip - the pull-back IS the
            // wind-up telegraph for the extended-reach thrust.
            pose.rootRotation = v(-0.08 * t, -0.24 * t, 0);
            pose.partRotations.shieldArm = v(-0.28 * t, -0.18 * t, -0.72 * t);
            pose.partRotations.weaponArm = v(-1.24 + 0.74 * t, 0.18 * t, 0.16 * t);
            pose.partPositions.weaponArm = v(0.55, 1.46, -0.16 * t);
        } else if (clip === 'attack') {
            // Full-extension thrust: the arm drives forward and the whole body
            // lunges so the spear tip reaches its authored gameplay range.
            pose.rootPosition = v(0, 0, recoil * 0.22);
            pose.rootRotation = v(0.1 * recoil, -0.24 + t * 0.5, 0.06 * recoil);
            pose.partRotations.shieldArm = v(-0.28, 0, -0.78);
            pose.partRotations.weaponArm = v(-0.5 - t * 1.12, 0, 0.16 - t * 0.3);
            pose.partPositions.weaponArm = v(0.42, 1.42, 0.34 * recoil);
        } else if (clip === 'recovery') {
            pose.rootRotation = v(0.1 * (1 - t), 0.26 * (1 - t), 0);
            pose.partRotations.shieldArm = v(-0.2 * (1 - t), 0, -0.62 * (1 - t));
            pose.partRotations.weaponArm = v(-1.62 + 0.38 * t, 0, -0.14 * (1 - t));
        } else if (clip === 'block') {
            // Square-on raised shield: unmistakably "wait it out or break it".
            pose.rootPosition = v(0, -0.05, 0);
            pose.rootRotation = v(-0.06, 0.3, 0);
            pose.partRotations.shieldArm = v(-0.45, 0.62, -0.95);
            pose.partPositions.shieldArm = v(-0.28, 1.5, 0.16);
            pose.partRotations.weaponArm = v(-0.55, 0, 0.3);
        }
    } else if (kind === 'vault_marksman') {
        const volley = actionId === 'crossbow_volley';
        if (clip === 'anticipation') {
            pose.rootPosition = v(0, volley ? -0.08 * t : 0, 0);
            pose.rootRotation = v((volley ? 0.12 : 0.04) * t, 0, volley ? 0.04 * Math.sin(progress * Math.PI * 2) : 0);
            pose.partRotations.leftArm = v((volley ? -1.34 : -1.18) * t, 0, -0.18 * t);
            pose.partRotations.rightArm = v((volley ? -1.3 : -1.12) * t, 0, 0.18 * t);
            pose.partPositions.loadedBolt = v(0, -0.5, 0.66 - t * (volley ? 0.2 : 0.12));
        } else if (clip === 'attack') {
            pose.rootPosition = v(0, 0, -recoil * (volley ? 0.13 : 0.07));
            pose.rootRotation = v(-recoil * (volley ? 0.14 : 0.08), 0, volley ? Math.sin(progress * Math.PI * 3) * 0.04 : 0);
            pose.partRotations.leftArm = v(-1.18 + recoil * 0.16, 0, -0.18);
            pose.partRotations.rightArm = v(-1.12 + recoil * 0.2, 0, 0.18);
            pose.partScales.loadedBolt = v(1 - t, 1 - t, 1 - t);
        } else if (clip === 'recovery') {
            pose.partRotations.leftArm = v(-1.02 + t * 0.57, 0, -0.15);
            pose.partRotations.rightArm = v(-0.5 + Math.sin(progress * Math.PI) * 0.74, 0, 0.36);
            pose.partPositions.loadedBolt = v(0, -0.5, 0.46 + t * 0.2);
            pose.partScales.loadedBolt = v(t, t, t);
        }
    } else if (kind === 'bell_hound') {
        if (actionId === 'hound_rake' && clip === 'anticipation') {
            pose.rootPosition = v(-0.08 * t, -0.06 * t, -0.04 * t);
            pose.rootRotation = v(0.08 * t, -0.42 * t, -0.1 * t);
            pose.partRotations.neck = v(-0.38, -0.28 * t, 0.12 * t);
            pose.partRotations.frontLeftLeg = v(-0.72 * t, 0, -0.24 * t);
        } else if (actionId === 'hound_rake' && clip === 'attack') {
            pose.rootPosition = v(0.1 * recoil, 0.06 * recoil, 0.18 * recoil);
            pose.rootRotation = v(-0.08 * recoil, -0.42 + t * 0.92, 0.12 * recoil);
            pose.partRotations.neck = v(-0.38 + t * 0.3, 0.32 * Math.sin(progress * Math.PI), 0);
            pose.partRotations.frontLeftLeg = v(-0.72 + t * 1.35, 0, -0.24 + t * 0.48);
            pose.partRotations.frontRightLeg = v(-0.28 + t * 0.65, 0, 0.18 * t);
        } else if (actionId === 'hound_rake' && clip === 'recovery') {
            pose.rootRotation = v(0, 0.5 * (1 - t), -0.08 * (1 - t));
            pose.partRotations.neck = v(-0.25, 0.22 * (1 - t), 0);
            pose.partRotations.frontLeftLeg = v(0.63 * (1 - t), 0, 0.24 * (1 - t));
        } else if (clip === 'anticipation') {
            pose.rootPosition = v(0, -0.13 * t, -0.15 * t);
            pose.rootRotation = v(0.18 * t, 0, 0);
            pose.partRotations.neck = v(-0.25 - 0.46 * t, 0, 0);
            pose.partRotations.backLeftLeg = v(-0.56 * t, 0, 0);
            pose.partRotations.backRightLeg = v(-0.56 * t, 0, 0);
        } else if (clip === 'attack') {
            pose.rootPosition = v(0, Math.sin(progress * Math.PI) * 0.42, t * 0.2);
            pose.rootRotation = v(-0.22 + t * 0.38, 0, 0);
            for (const leg of ['frontLeftLeg', 'frontRightLeg', 'backLeftLeg', 'backRightLeg']) {
                pose.partRotations[leg] = v(-0.84 + recoil * 0.34, 0, 0);
            }
            pose.partRotations.neck = v(-0.42 + t * 0.52, 0, 0);
        } else if (clip === 'recovery') {
            pose.rootPosition = v(0, -recoil * 0.11, t * 0.08);
            pose.rootRotation = v(recoil * 0.22, 0, 0);
            pose.partRotations.neck = v(-0.25 + recoil * 0.2, 0, 0);
        }
    } else if (kind === 'tollkeeper') {
        if (actionId === 'bell_toll' && clip === 'anticipation') {
            pose.rootPosition = v(0, -0.14 * t, 0);
            pose.rootRotation = v(-0.18 * t, 0, Math.sin(progress * Math.PI * 4) * 0.025 * t);
            pose.partRotations.leftArm = v(-1.08 * t, 0, -0.58 * t);
            pose.partRotations.rightArm = v(-1.08 * t, 0, 0.58 * t);
            pose.partPositions.leftArm = v(-0.74 + 0.22 * t, 1.78, 0.18 * t);
            pose.partPositions.rightArm = v(0.74 - 0.22 * t, 1.78, 0.18 * t);
            pose.partScales.chestBell = v(1 + 0.08 * t, 1 + 0.08 * t, 1 + 0.18 * t);
        } else if (actionId === 'bell_toll' && clip === 'attack') {
            const pulse = 1 + Math.sin(progress * Math.PI * 3) * (1 - t) * 0.18;
            pose.rootPosition = v(0, recoil * 0.08, -recoil * 0.1);
            pose.rootRotation = v(-0.18 + recoil * 0.24, 0, Math.sin(progress * Math.PI * 6) * 0.035);
            pose.partRotations.leftArm = v(-1.08 + t * 0.72, 0, -0.58 + t * 0.28);
            pose.partRotations.rightArm = v(-1.08 + t * 0.72, 0, 0.58 - t * 0.28);
            pose.partScales.chestBell = v(pulse, pulse, pulse);
        } else if (actionId === 'bell_toll' && clip === 'recovery') {
            pose.rootRotation = v(-0.08 * (1 - t), 0, 0);
            pose.partRotations.leftArm = v(-0.36 * (1 - t), 0, -0.3 * (1 - t));
            pose.partRotations.rightArm = v(-0.36 * (1 - t), 0, 0.3 * (1 - t));
        } else if (actionId === 'breaker_charge' && clip === 'anticipation') {
            pose.rootPosition = v(0, -0.22 * t, -0.18 * t);
            pose.rootRotation = v(0.42 * t, 0, -0.05 * t);
            pose.partRotations.leftArm = v(-0.82 * t, 0, -0.24 * t);
            pose.partRotations.rightArm = v(-0.64 * t, 0, 0.18 * t);
        } else if (actionId === 'breaker_charge' && clip === 'attack') {
            pose.rootPosition = v(0, -0.2, 0.38 * t);
            pose.rootRotation = v(0.42 - 0.18 * t, 0, Math.sin(progress * Math.PI * 4) * 0.04);
            pose.partRotations.leftArm = v(-0.82 + 0.22 * t, 0, -0.24);
            pose.partRotations.rightArm = v(-0.64 - 0.36 * t, 0, 0.18);
        } else if (actionId === 'breaker_charge' && clip === 'recovery') {
            pose.rootPosition = v(0, -0.2 * (1 - t), 0.24 * (1 - t));
            pose.rootRotation = v(0.24 * (1 - t), 0, 0);
            pose.partRotations.leftArm = v(-0.6 * (1 - t), 0, -0.24 * (1 - t));
            pose.partRotations.rightArm = v(-1 * (1 - t), 0, 0.18 * (1 - t));
        } else if (clip === 'anticipation') {
            pose.rootPosition = v(0, -0.12 * t, 0);
            pose.rootRotation = v(-0.13 * t, -0.28 * t, -0.06 * t);
            pose.partRotations.leftArm = v(-0.42 * t, 0, -0.36 * t);
            pose.partRotations.rightArm = v(1.26 * t, 0, 0.62 * t);
        } else if (clip === 'attack') {
            pose.rootPosition = v(0, -recoil * 0.16, t * 0.12);
            pose.rootRotation = v(-0.13 + t * 0.42, -0.28 + t * 0.44, -0.06 + recoil * 0.1);
            pose.partRotations.leftArm = v(-0.42 + t * 1.18, 0, -0.36 + t * 0.22);
            pose.partRotations.rightArm = v(1.26 - t * 2.42, 0, 0.62 - t * 0.78);
        } else if (clip === 'recovery') {
            pose.rootPosition = v(0, -0.12 * (1 - t), 0.1 * (1 - t));
            pose.rootRotation = v(0.29 * (1 - t), 0.16 * (1 - t), 0.04 * recoil);
            pose.partRotations.leftArm = v(0.76 * (1 - t), 0, -0.14 * (1 - t));
            pose.partRotations.rightArm = v(-1.16 * (1 - t), 0, -0.16 * (1 - t));
        } else if (clip === 'block') {
            // The hammer haft comes up crosswise like a bar - a wall, not a swing.
            pose.rootPosition = v(0, -0.1, 0);
            pose.rootRotation = v(-0.1, 0, 0);
            pose.partRotations.leftArm = v(-1.05, 0, 0.5);
            pose.partRotations.rightArm = v(-1.15, 0, -0.55);
        }
    }
}

export function sampleVaultEnemyAnimation(
    kind: VaultEnemyKind,
    clip: VaultEnemyAnimationClip,
    normalizedTime: number,
    elapsedSeconds = normalizedTime,
    actionId?: VaultEnemyActionId,
): VaultEnemyAnimationPose {
    const progress = clamp01(normalizedTime);
    const pose = emptyPose();
    if (clip === 'idle') {
        const breath = Math.sin(elapsedSeconds * (kind === 'bell_hound' ? 2.8 : 1.8));
        pose.rootPosition = v(0, breath * 0.012, 0);
        pose.rootRotation = v(0, Math.sin(elapsedSeconds * 0.43) * 0.025, breath * 0.008);
        if (kind === 'bell_hound') pose.partRotations.tail = v(-0.34, Math.sin(elapsedSeconds * 1.7) * 0.18, 0);
    } else if (clip === 'alert') {
        const settle = Math.sin(elapsedSeconds * 2.2) * 0.018;
        pose.rootRotation = v(-0.045 + settle, 0, 0);
        if (kind === 'vault_guard') {
            pose.partRotations.shieldArm = v(-0.16, 0, -0.42);
            pose.partRotations.weaponArm = v(-1.24, 0.04, 0.1);
        }
        if (kind === 'vault_marksman') {
            pose.partRotations.leftArm = v(-0.42, 0, -0.12);
            pose.partRotations.rightArm = v(-0.38, 0, 0.12);
        }
        if (kind === 'bell_hound') pose.partRotations.neck = v(-0.42, 0, 0);
        if (kind === 'tollkeeper') pose.partRotations.rightArm = v(0.18, 0, 0.12);
    } else if (clip === 'turn') {
        pose.rootRotation = v(0, 0, Math.sin(progress * Math.PI) * 0.08);
        const head = kind === 'bell_hound' ? 'neck' : 'head';
        pose.partRotations[head] = v(0, (0.5 - progress) * 0.42, 0);
    } else if (clip === 'move') {
        applyLocomotion(kind, pose, 1, elapsedSeconds);
    } else {
        applyCombatClip(kind, clip, progress, pose, actionId);
    }
    return pose;
}
