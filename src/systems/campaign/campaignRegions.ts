// Gate 0: Campaign region + boss registry contracts.
// Region files declare content here; no central switch edits per asset.

import type { CampaignRegionType } from './campaignGraph';
import type { ProgressionDefinition } from './progression';
import type { FrenzyModifierPackage } from './bloodMoon';

export interface OrdinaryEnemyDef {
  id: string;
  name: string;
  lesson: string;
}

export interface GuardianDef {
  id: string;
  name: string;
  difficulty: number;
}

export interface CampaignRegionDef {
  type: CampaignRegionType;
  displayName: string;
  difficultyRange: [number, number];
  targetFirstClearHours: [number, number];
  requiredBosses: ProgressionDefinition[];
  optionalGuardians: GuardianDef[];
  ordinaryEnemies: OrdinaryEnemyDef[];
  keystoneId: string;
  previewRefillItemId: string;
  frenzyPackages: FrenzyModifierPackage[];
}

const regionRegistry = new Map<CampaignRegionType, CampaignRegionDef>();

export function registerCampaignRegion(def: CampaignRegionDef): void {
  if (regionRegistry.has(def.type)) {
    throw new Error(`Duplicate campaign region: ${def.type}`);
  }
  if (def.requiredBosses.length !== 4) {
    throw new Error(`Region ${def.type} must declare exactly 4 required bosses.`);
  }
  if (def.optionalGuardians.length !== 2) {
    throw new Error(`Region ${def.type} must declare exactly 2 optional guardians.`);
  }
  regionRegistry.set(def.type, def);
}

export function getCampaignRegion(type: CampaignRegionType): CampaignRegionDef | undefined {
  return regionRegistry.get(type);
}

export function listCampaignRegions(): CampaignRegionDef[] {
  return Array.from(regionRegistry.values());
}

export function validateRegionRegistry(): string[] {
  const issues: string[] = [];
  const required: CampaignRegionType[] = [
    'heartwood',
    'sunscar',
    'frostbound',
    'tidelost',
    'shattered_meridian',
  ];
  for (const type of required) {
    const def = regionRegistry.get(type);
    if (!def) {
      issues.push(`Missing region: ${type}`);
      continue;
    }
    if (def.requiredBosses.length !== 4) issues.push(`${type}: needs 4 required bosses`);
    if (def.optionalGuardians.length !== 2) issues.push(`${type}: needs 2 guardians`);
    if (!def.keystoneId) issues.push(`${type}: missing keystone`);
  }
  return issues;
}

export function clearRegionRegistryForTests(): void {
  regionRegistry.clear();
}
