// Heartwood creature models: pure data + a generic procedural animation
// sampler. No three.js import here so node tests can validate every model
// (all kinds covered, parts sane, clips resolve) without a renderer.
//
// Presentation contract: flat-tint lambert materials (no PNGs needed),
// readable silhouettes at combat range, distinct profiles per creature.
// Animation clips mirror the vault vocabulary: idle/alert/turn/move/
// anticipation/attack/recovery/block/hurt/stagger/death, driven by the
// entity's combatAction phase + locomotion.

export type HeartwoodMaterialId =
  | 'hide' | 'darkHide' | 'bone' | 'thorn' | 'leaf' | 'wood'
  | 'limestone' | 'bronze' | 'bell' | 'cream' | 'feather' | 'mothWing'
  | 'glow' | 'dark' | 'moss' | 'iron';

export const HEARTWOOD_MATERIAL_TINTS: Record<HeartwoodMaterialId, number> = {
  hide: 0x6a4a2a, darkHide: 0x4a2f1c, bone: 0xd8c8a8, thorn: 0x2e5d33,
  leaf: 0x4a8a4c, wood: 0x8a6242, limestone: 0xa8a294, bronze: 0x8a6d3b,
  bell: 0xc8a050, cream: 0xc8b898, feather: 0x7a9aaa, mothWing: 0xb89878,
  glow: 0xffca6a, dark: 0x2a2018, moss: 0x4a7a3c, iron: 0x8a8a92,
};

export type HeartwoodPartShape = 'box' | 'cylinder';
export type HeartwoodVec3 = readonly [number, number, number];

export interface HeartwoodPartDefinition {
  id: string;
  parent?: string;
  shape: HeartwoodPartShape;
  size: HeartwoodVec3;
  position: HeartwoodVec3;
  material: HeartwoodMaterialId;
  leg?: boolean;
  arm?: boolean;
}

export interface HeartwoodModelDefinition {
  kind: string;
  visualScale: HeartwoodVec3;
  parts: readonly HeartwoodPartDefinition[];
  /** Locomotion stride frequency + bob amplitude. */
  stride: number;
  bob: number;
}

export type HeartwoodClip =
  | 'idle' | 'alert' | 'turn' | 'move'
  | 'anticipation' | 'attack' | 'recovery' | 'block' | 'hurt' | 'stagger' | 'death';

export interface HeartwoodPose {
  rootY: number;
  lean: number;
  legSwing: number;
  armRaise: number;
  headTilt: number;
}

const box = (
  id: string, size: HeartwoodVec3, position: HeartwoodVec3, material: HeartwoodMaterialId,
  extra: Partial<HeartwoodPartDefinition> = {},
): HeartwoodPartDefinition => ({ id, shape: 'box', size, position, material, ...extra });
const cyl = (
  id: string, size: HeartwoodVec3, position: HeartwoodVec3, material: HeartwoodMaterialId,
  extra: Partial<HeartwoodPartDefinition> = {},
): HeartwoodPartDefinition => ({ id, shape: 'cylinder', size, position, material, ...extra });

function quadrupedLegs(prefix: string, y: number, fx: number, bx: number, w: number, mat: HeartwoodMaterialId): HeartwoodPartDefinition[] {
  return [
    box(`${prefix}FL`, [w, y, w], [-fx, y / 2, 0.3], mat, { leg: true }),
    box(`${prefix}FR`, [w, y, w], [fx, y / 2, 0.3], mat, { leg: true }),
    box(`${prefix}BL`, [w, y, w], [-fx, y / 2, bx], mat, { leg: true }),
    box(`${prefix}BR`, [w, y, w], [fx, y / 2, bx], mat, { leg: true }),
  ];
}

// --- Ordinary hostiles ---

const FURROWLING_PARTS: readonly HeartwoodPartDefinition[] = [
  box('body', [1.0, 0.62, 0.66], [0, 0.72, 0], 'hide'),
  box('shoulderHump', [0.6, 0.3, 0.6], [0, 1.05, 0.1], 'darkHide'),
  box('head', [0.55, 0.5, 0.55], [0, 0.72, 0.55], 'hide'),
  box('snout', [0.34, 0.26, 0.3], [0, 0.62, 0.95], 'darkHide'),
  box('tuskL', [0.1, 0.34, 0.12], [-0.24, 0.72, 1.0], 'bone'),
  box('tuskR', [0.1, 0.34, 0.12], [0.24, 0.72, 1.0], 'bone'),
  box('earL', [0.14, 0.22, 0.1], [-0.2, 1.05, 0.5], 'darkHide'),
  box('earR', [0.14, 0.22, 0.1], [0.2, 1.05, 0.5], 'darkHide'),
  box('tail', [0.1, 0.1, 0.4], [0, 0.8, -0.5], 'darkHide'),
  ...quadrupedLegs('leg', 0.5, 0.32, -0.35, 0.2, 'darkHide'),
];

const SENTRY_PARTS: readonly HeartwoodPartDefinition[] = [
  box('pelvis', [0.6, 0.32, 0.4], [0, 0.66, 0], 'wood'),
  box('torso', [0.72, 0.7, 0.46], [0, 1.12, 0], 'thorn'),
  box('briarMantle', [0.8, 0.2, 0.52], [0, 1.32, 0], 'leaf'),
  box('head', [0.42, 0.38, 0.4], [0, 1.7, 0.02], 'wood'),
  box('helm', [0.5, 0.16, 0.46], [0, 1.86, 0.02], 'thorn'),
  box('shieldArm', [0.2, 0.64, 0.22], [-0.5, 1.4, 0], 'wood', { arm: true }),
  box('shield', [0.66, 0.86, 0.12], [0, -0.32, 0.3], 'thorn', { parent: 'shieldArm' }),
  box('shieldBoss', [0.2, 0.2, 0.08], [0, -0.32, 0.38], 'bone', { parent: 'shieldArm' }),
  box('spearArm', [0.2, 0.62, 0.22], [0.5, 1.4, 0], 'wood', { arm: true }),
  cyl('spear', [0.05, 0.05, 1.5], [0, -0.7, 0.1], 'bone', { parent: 'spearArm' }),
  box('leftLeg', [0.26, 0.62, 0.3], [-0.2, 0.5, 0], 'darkHide', { leg: true }),
  box('rightLeg', [0.26, 0.62, 0.3], [0.2, 0.5, 0], 'darkHide', { leg: true }),
];

const HARE_PARTS: readonly HeartwoodPartDefinition[] = [
  box('body', [0.5, 0.42, 0.7], [0, 0.5, 0], 'cream'),
  box('head', [0.34, 0.34, 0.38], [0, 0.78, 0.45], 'cream'),
  box('earL', [0.1, 0.5, 0.08], [-0.12, 1.2, 0.42], 'leaf'),
  box('earR', [0.1, 0.5, 0.08], [0.12, 1.2, 0.42], 'leaf'),
  box('tail', [0.18, 0.18, 0.18], [0, 0.55, -0.42], 'bone'),
  box('legFL', [0.14, 0.4, 0.16], [-0.16, 0.35, 0.22], 'cream', { leg: true }),
  box('legFR', [0.14, 0.4, 0.16], [0.16, 0.35, 0.22], 'cream', { leg: true }),
  box('legBL', [0.16, 0.46, 0.2], [-0.16, 0.38, -0.25], 'cream', { leg: true }),
  box('legBR', [0.16, 0.46, 0.2], [0.16, 0.38, -0.25], 'cream', { leg: true }),
];

const CANTOR_PARTS: readonly HeartwoodPartDefinition[] = [
  box('robe', [0.62, 0.9, 0.44], [0, 0.75, 0], 'limestone'),
  box('torso', [0.58, 0.55, 0.4], [0, 1.35, 0], 'limestone'),
  box('head', [0.38, 0.36, 0.36], [0, 1.75, 0.02], 'darkHide'),
  box('bellL', [0.22, 0.3, 0.22], [-0.42, 1.5, 0.1], 'bell', { arm: true }),
  box('bellR', [0.22, 0.3, 0.22], [0.42, 1.5, 0.1], 'bell', { arm: true }),
  box('chimeBar', [0.9, 0.08, 0.08], [0, 1.1, 0.25], 'bronze'),
  box('base', [0.7, 0.14, 0.5], [0, 0.28, 0], 'darkHide'),
];

const BAILIFF_PARTS: readonly HeartwoodPartDefinition[] = [
  box('pelvis', [0.8, 0.36, 0.5], [0, 0.72, 0], 'darkHide'),
  box('torso', [0.95, 0.85, 0.6], [0, 1.25, 0], 'moss'),
  box('mossBack', [1.0, 0.3, 0.65], [0, 1.55, -0.05], 'leaf'),
  box('head', [0.5, 0.44, 0.46], [0, 1.9, 0.03], 'darkHide'),
  box('browPlate', [0.6, 0.16, 0.52], [0, 2.06, 0.03], 'iron'),
  box('shieldArm', [0.26, 0.8, 0.28], [-0.66, 1.6, 0], 'moss', { arm: true }),
  box('towerShield', [0.9, 1.15, 0.14], [0, -0.4, 0.34], 'wood', { parent: 'shieldArm' }),
  box('shieldBand', [0.96, 0.16, 0.16], [0, -0.4, 0.34], 'iron', { parent: 'shieldArm' }),
  box('cudgelArm', [0.26, 0.75, 0.28], [0.66, 1.6, 0], 'moss', { arm: true }),
  box('cudgel', [0.24, 0.85, 0.24], [0, -0.7, 0.1], 'wood', { parent: 'cudgelArm' }),
  box('leftLeg', [0.32, 0.68, 0.36], [-0.26, 0.55, 0], 'darkHide', { leg: true }),
  box('rightLeg', [0.32, 0.68, 0.36], [0.26, 0.55, 0], 'darkHide', { leg: true }),
];

// --- Passives ---

const DEER_PARTS: readonly HeartwoodPartDefinition[] = [
  box('body', [0.62, 0.62, 1.15], [0, 0.95, 0], 'cream'),
  box('neck', [0.3, 0.55, 0.32], [0, 1.35, 0.6], 'cream'),
  box('head', [0.3, 0.34, 0.5], [0, 1.62, 0.8], 'cream'),
  box('antlerL', [0.08, 0.4, 0.3], [-0.16, 1.95, 0.75], 'bone'),
  box('antlerR', [0.08, 0.4, 0.3], [0.16, 1.95, 0.75], 'bone'),
  box('tail', [0.12, 0.2, 0.12], [0, 1.0, -0.62], 'bone'),
  ...quadrupedLegs('leg', 0.68, 0.2, -0.42, 0.15, 'cream'),
];

const FINCH_PARTS: readonly HeartwoodPartDefinition[] = [
  box('body', [0.26, 0.26, 0.4], [0, 0.3, 0], 'feather'),
  box('head', [0.22, 0.22, 0.24], [0, 0.48, 0.22], 'feather'),
  box('beak', [0.08, 0.08, 0.14], [0, 0.46, 0.4], 'bone'),
  box('wingL', [0.06, 0.2, 0.34], [-0.16, 0.32, 0], 'leaf'),
  box('wingR', [0.06, 0.2, 0.34], [0.16, 0.32, 0], 'leaf'),
  box('tail', [0.1, 0.08, 0.22], [0, 0.3, -0.28], 'feather'),
];

const MOTH_PARTS: readonly HeartwoodPartDefinition[] = [
  box('body', [0.14, 0.14, 0.34], [0, 0.5, 0], 'darkHide'),
  box('wingL', [0.34, 0.04, 0.4], [-0.22, 0.52, 0], 'mothWing'),
  box('wingR', [0.34, 0.04, 0.4], [0.22, 0.52, 0], 'mothWing'),
  box('glowDot', [0.1, 0.06, 0.1], [0, 0.56, 0.05], 'glow'),
  box('antennaL', [0.03, 0.16, 0.03], [-0.05, 0.62, 0.14], 'darkHide'),
  box('antennaR', [0.03, 0.16, 0.03], [0.05, 0.62, 0.14], 'darkHide'),
];

export const HEARTWOOD_MODELS: Record<string, HeartwoodModelDefinition> = {
  furrowling: { kind: 'furrowling', visualScale: [1, 1, 1], parts: FURROWLING_PARTS, stride: 7, bob: 0.05 },
  briar_sentry: { kind: 'briar_sentry', visualScale: [1, 1, 1], parts: SENTRY_PARTS, stride: 5, bob: 0.03 },
  crown_hare: { kind: 'crown_hare', visualScale: [1, 1, 1], parts: HARE_PARTS, stride: 9, bob: 0.07 },
  heartwood_cantor: { kind: 'heartwood_cantor', visualScale: [1, 1, 1], parts: CANTOR_PARTS, stride: 3, bob: 0.02 },
  mossback_bailiff: { kind: 'mossback_bailiff', visualScale: [1.1, 1.05, 1.1], parts: BAILIFF_PARTS, stride: 4, bob: 0.04 },
  field_deer: { kind: 'field_deer', visualScale: [1, 1, 1], parts: DEER_PARTS, stride: 8, bob: 0.05 },
  bellfinch: { kind: 'bellfinch', visualScale: [1, 1, 1], parts: FINCH_PARTS, stride: 10, bob: 0.04 },
  resin_moth: { kind: 'resin_moth', visualScale: [1, 1, 1], parts: MOTH_PARTS, stride: 6, bob: 0.09 },
};

export function isHeartwoodModelKind(kind: string): boolean {
  return Object.prototype.hasOwnProperty.call(HEARTWOOD_MODELS, kind);
}

/**
 * Generic procedural pose: locomotion swings legs, anticipation crouches and
 * raises arms, attacks lunge, recovery settles, stagger wobbles, death folds.
 * progress is 0..1 through the current clip; locoTime advances with speed.
 */
export function sampleHeartwoodAnimation(
  kind: string,
  clip: HeartwoodClip,
  progress: number,
  locoTime: number,
): HeartwoodPose {
  const model = HEARTWOOD_MODELS[kind];
  const freq = model?.stride ?? 6;
  const amp = model?.bob ?? 0.05;
  const swing = Math.sin(locoTime * freq) * amp * 8;
  switch (clip) {
    case 'anticipation':
      return { rootY: -0.08 * progress, lean: -0.18 * progress, legSwing: 0, armRaise: 0.9 * progress, headTilt: -0.1 * progress };
    case 'attack':
      return { rootY: 0.06 * Math.sin(progress * Math.PI), lean: 0.32 * Math.sin(progress * Math.PI), legSwing: swing * 0.4, armRaise: 1.2 * Math.sin(progress * Math.PI), headTilt: 0.12 * Math.sin(progress * Math.PI) };
    case 'recovery':
      return { rootY: -0.04 * (1 - progress), lean: -0.1 * (1 - progress), legSwing: swing * 0.3, armRaise: 0.25 * (1 - progress), headTilt: 0 };
    case 'block':
      return { rootY: -0.05, lean: -0.22, legSwing: 0, armRaise: 1.0, headTilt: -0.12 };
    case 'hurt':
      return { rootY: 0.03, lean: -0.14, legSwing: 0, armRaise: 0.3, headTilt: 0.2 };
    case 'stagger':
      return { rootY: -0.12 * Math.abs(Math.sin(progress * Math.PI * 2)), lean: -0.3 * Math.abs(Math.sin(progress * Math.PI)), legSwing: 0, armRaise: 0.5, headTilt: 0.25 };
    case 'death':
      return { rootY: -0.45 * progress, lean: -1.2 * progress, legSwing: 0, armRaise: 0.2 * (1 - progress), headTilt: 0.4 * progress };
    case 'move':
      return { rootY: Math.abs(Math.sin(locoTime * freq)) * amp, lean: 0.08, legSwing: swing, armRaise: 0, headTilt: 0 };
    case 'alert':
      return { rootY: 0.02, lean: 0.05, legSwing: 0, armRaise: 0.15, headTilt: -0.08 };
    case 'turn':
      return { rootY: 0, lean: 0.1 * progress, legSwing: swing * 0.5, armRaise: 0, headTilt: 0.15 * progress };
    case 'idle':
    default:
      return { rootY: Math.sin(locoTime * 1.7) * amp * 0.4, lean: 0, legSwing: 0, armRaise: 0, headTilt: Math.sin(locoTime * 0.9) * 0.05 };
  }
}

/** Map a combatAction phase to a clip (mirrors the vault vocabulary). */
export function heartwoodActionClip(actionId: string | undefined, phase: string | undefined): HeartwoodClip | null {
  if (!actionId) return null;
  if (actionId === 'brace' || actionId === 'hold_ground') return 'block';
  if (actionId === 'channel_hold') return 'stagger';
  if (phase === 'anticipation') return 'anticipation';
  if (phase === 'active') return 'attack';
  return 'recovery';
}

/** Kinds with bespoke Heartwood renderers (not the generic entity box). */
export const HEARTWOOD_RENDERED_KINDS: readonly string[] = [
  'furrowling',
  'briar_sentry',
  'crown_hare',
  'heartwood_cantor',
  'mossback_bailiff',
  'field_deer',
  'bellfinch',
  'resin_moth',
];
