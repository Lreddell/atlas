// Gate 0: Crests, keystones, Atlas navigation, and world memories.
// Data-driven progression definitions so region prompts declare boss/site,
// prerequisite crest, granted crest/keystone, physical unlock, transform,
// Atlas sketch/bearing, memory trigger, waystone, and rematch/Frenzy.
//
// Bound-crest safety: crests/keystones are physical artifacts in presentation
// but progression must not break on inventory accidents. First clear grants
// persistent ownership exactly once; gates check ownership, never consume the
// only copy; required relics survive fire/lava/despawn/death/migration.

export interface ProgressionDefinition {
  bossId: string;
  siteId: string;
  region: string;
  /** Crest required to enter (undefined for first boss in each region). */
  prerequisiteCrest?: string;
  grantedCrest?: string;
  grantedKeystone?: string;
  signatureReward?: string;
  physicalUnlock: string;
  regionTransform?: string;
  atlasSketch: string;
  memoryDurationSeconds: number;
}

export interface CrestOwnership {
  crests: string[];
  keystones: string[];
  /** Relics that must survive even if inventory is lost. */
  boundRelics: string[];
}

export function grantFirstClearReward(
  ownership: CrestOwnership,
  def: ProgressionDefinition,
): { ownership: CrestOwnership; granted: string[]; duplicate: boolean } {
  const granted: string[] = [];
  const next: CrestOwnership = {
    crests: [...ownership.crests],
    keystones: [...ownership.keystones],
    boundRelics: [...ownership.boundRelics],
  };
  const grantOnce = (id: string | undefined, bucket: 'crest' | 'keystone') => {
    if (!id) return;
    const list = bucket === 'crest' ? next.crests : next.keystones;
    if (!list.includes(id)) {
      list.push(id);
      granted.push(id);
    }
    if (!next.boundRelics.includes(id)) next.boundRelics.push(id);
  };
  const before = next.crests.length + next.keystones.length;
  grantOnce(def.grantedCrest, 'crest');
  grantOnce(def.grantedKeystone, 'keystone');
  if (def.signatureReward && !next.boundRelics.includes(def.signatureReward)) {
    next.boundRelics.push(def.signatureReward);
    granted.push(def.signatureReward);
  }
  return { ownership: next, granted, duplicate: before === next.crests.length + next.keystones.length };
}

/** Gates check persistent ownership and perform a visible artifact
 * interaction. They never consume the only copy. */
export function canEnterSite(
  ownership: CrestOwnership,
  def: ProgressionDefinition,
): boolean {
  if (!def.prerequisiteCrest) return true;
  return ownership.crests.includes(def.prerequisiteCrest) || ownership.boundRelics.includes(def.prerequisiteCrest);
}

export interface AtlasBearing {
  label: string;
  /** Bearing in radians from spawn/origin. */
  bearing: number;
  /** Distance in blocks. */
  distance: number;
  hint: string;
}

export interface AtlasMemory {
  id: string;
  bossId: string;
  /** 10-20 second environmental memory, 1-2 lines of text max. */
  caption: string;
  durationSeconds: number;
}

export function createVictoryMemory(bossId: string, caption: string): AtlasMemory {
  return {
    id: `memory-${bossId}`,
    bossId,
    caption,
    durationSeconds: 15,
  };
}

/** Soft-linear guidance: recommended keystone count vs strongest clear. */
export function sequenceBreakHint(
  ownedKeystones: number,
  recommendedKeystones: number,
): string {
  if (ownedKeystones >= recommendedKeystones) return 'You walk the intended road.';
  const gap = recommendedKeystones - ownedKeystones;
  return `This land expects ${recommendedKeystones} keystones. You carry ${ownedKeystones} — skill and preparation can close a gap of ${gap}, but the way will punish mistakes.`;
}
