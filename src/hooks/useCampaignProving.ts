// Gate 0 proving driver hook: implements every `/campaign` subcommand and
// feeds the CampaignAtlasPanel. All world edits go through the production
// WorldManager; all progression goes through the ProgressionStore; layout is
// re-derived deterministically from the world spawn so no extra persistence
// is needed (the world save itself carries blocks, tiles, and progression).
//
// Subcommands:
//   proving [clear]   build (or remove) the neutral site near world spawn
//   start             encounter activation + protected temp edits
//   fail              failure/death restoration (temp edits restored)
//   clear             victory handoff (crest, barrier, waystone, keystone, transform)
//   rematch           arm a rematch without touching the cleared site
//   travel            waystone travel to the site node
//   anchor rest|refill|status   five-charge expedition anchor
//   frenzy            fixture Frenzy start at the cleared waystone
//   bloodmoon on|off  fixture eligibility (NOT a Bell Titan clear)
//   preview           create + enter a Gate 0 preview world (curated kit)
//   status            log the full foundation state

import { useRef, useCallback } from 'react';
import { worldManager } from '../systems/WorldManager';
import { progression } from '../systems/progression/ProgressionStore';
import { WorldStorage } from '../systems/world/WorldStorage';
import { generateCampaignGraph } from '../systems/campaign/campaignGraph';
import {
  buildProvingGround,
  clearProvingGround,
  startProvingEncounter,
  stageProvingTempEdits,
  failProvingEncounter,
  clearProvingEncounter,
  armProvingRematch,
  placeProvingAnchor,
  tryProvingTravel,
  provingAtlasInfo,
  canStartProvingFrenzy,
  PROVING_SITE_ID,
  PROVING_ANCHOR_REFILL,
  type ProvingLayout,
  type ProvingEncounter,
} from '../systems/campaign/provingGround';
import { TempArenaLayer } from '../systems/campaign/encounterSites';
import { BlockType, type ItemStack } from '../types';

export interface CampaignProvingDeps {
  logMsg: (msg: string, kind?: 'info' | 'error' | 'success') => void;
  setInventory: React.Dispatch<React.SetStateAction<(ItemStack | null)[]>>;
  getInventory: () => (ItemStack | null)[];
  saveGame: (opts?: { force?: boolean }) => Promise<void>;
  startWorld: (worldId: string) => Promise<void>;
  teleportTo: (x: number, y: number, z: number) => void;
  openAtlas: () => void;
  activeWorldIdRef: React.MutableRefObject<string | null>;
}

export interface AtlasPanelData {
  provenance: string;
  region: string;
  sketch: string;
  hint: string;
  bearingDegrees: number;
  distanceBlocks: number;
  crests: string[];
  keystones: string[];
  waystones: Record<string, { discovered: boolean; active: boolean }>;
  anchor: { charges: number; maxCharges: number; refillItemId: string } | undefined;
  encounterPhase: string;
  attemptCount: number;
  bloodMoonDemonstrable: boolean;
  bloodMoonFixture: boolean;
  bellTitanDefeated: boolean;
  transformApplied: boolean;
}

function deriveOrigin(): { x: number; z: number; hintY: number } {
  const ws = worldManager.getWorldSpawn();
  if (ws) return { x: Math.floor(ws.x) + 48, z: Math.floor(ws.z), hintY: Math.floor(ws.y) + 8 };
  const sp = worldManager.getSpawnPoint();
  if (sp) return { x: Math.floor(sp.x) + 48, z: Math.floor(sp.z), hintY: Math.floor(sp.y) + 8 };
  return { x: 48, z: 0, hintY: 80 };
}

export function useCampaignProving(deps: CampaignProvingDeps) {
  const encounterRef = useRef<(ProvingEncounter & { granted?: boolean }) | null>(null);
  const layoutRef = useRef<ProvingLayout | null>(null);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const getLayout = useCallback((): ProvingLayout => {
    if (!layoutRef.current) {
      throw new Error('No proving layout this session. Run `/campaign proving` first.');
    }
    return layoutRef.current;
  }, []);

  const withLayout = useCallback(<T,>(fn: (layout: ProvingLayout) => T, fallback?: T): T | undefined => {
    try {
      return fn(getLayout());
    } catch (e) {
      depsRef.current.logMsg(e instanceof Error ? e.message : String(e), 'error');
      return fallback;
    }
  }, [getLayout]);

  const build = useCallback(() => {
    const { logMsg } = depsRef.current;
    const o = deriveOrigin();
    const layout = buildProvingGround(worldManager, o.x, o.z, o.hintY);
    layoutRef.current = layout;
    placeProvingAnchor(progression, layout);
    progression.discoverWaystone(PROVING_SITE_ID);
    logMsg(`Proving ground built at ${layout.origin.x},${layout.origin.y},${layout.origin.z}. Waystone dormant; anchor charged 5/5.`, 'success');
    return layout;
  }, []);

  const clearSite = useCallback(() => {
    const { logMsg } = depsRef.current;
    const layout = getLayout();
    clearProvingGround(worldManager, layout);
    layoutRef.current = null;
    encounterRef.current = null;
    logMsg('Proving ground cleared.', 'info');
  }, [getLayout]);

  const start = useCallback(() => {
    withLayout((layout) => {
      const { logMsg } = depsRef.current;
      const encounter = startProvingEncounter(progression);
      stageProvingTempEdits(worldManager, encounter, layout);
      encounterRef.current = encounter;
      logMsg(`Encounter active: 3 protected temp edits staged (phase=${encounter.state.phase}).`, 'info');
    });
  }, [withLayout]);

  const fail = useCallback(() => {
    const { logMsg } = depsRef.current;
    if (!encounterRef.current) {
      // Death/failure with no live attempt still resolves to the safe state.
      progression.setEncounterPhase(PROVING_SITE_ID, 'ready');
      logMsg('No live attempt; site resolved to ready (safe state).', 'info');
      return;
    }
    withLayout(() => {
      const next = failProvingEncounter(worldManager, progression, encounterRef.current!);
      encounterRef.current = next;
      depsRef.current.logMsg(`Attempt failed: temp edits restored, phase=${next.state.phase}.`, 'info');
    });
  }, [withLayout]);

  const clear = useCallback(() => {
    withLayout((layout) => {
      const { logMsg } = depsRef.current;
      const current = encounterRef.current ?? startProvingEncounter(progression);
      const next = clearProvingEncounter(worldManager, progression, current, layout, Date.now());
      encounterRef.current = next;
      logMsg(
        `Site cleared: crest ${next.granted ? 'granted' : 'already owned'}, barrier open, waystone active, keystone + transform applied. Rematch armed via /campaign rematch.`,
        'success',
      );
    });
  }, [withLayout]);

  const rematch = useCallback(() => {
    withLayout(() => {
      const { logMsg } = depsRef.current;
      if (!encounterRef.current) {
        logMsg('Clear the site first; rematch is available only after first clear.', 'error');
        return;
      }
      encounterRef.current = armProvingRematch(progression, encounterRef.current);
      logMsg(`Rematch armed in a protected instance (phase=${encounterRef.current.state.phase}). Cleared site untouched.`, 'info');
    });
  }, [withLayout]);

  const travel = useCallback(() => {
    withLayout((layout) => {
      const { logMsg, teleportTo } = depsRef.current;
      const camp = progression.getCampaign();
      const phase = (camp.encounters?.[PROVING_SITE_ID]?.phase ?? 'undiscovered') as ProvingEncounter['state']['phase'];
      const active = camp.encounters?.[PROVING_SITE_ID]?.waystoneActive === true;
      const res = tryProvingTravel(worldManager, phase, layout, active);
      if (!res.ok || !res.destination) {
        logMsg(`Travel refused: ${res.reason}`, 'error');
        return;
      }
      teleportTo(res.destination.x, res.destination.y, res.destination.z);
      logMsg(`Waystone travel committed to the site node (boats stay behind).`, 'success');
    });
  }, [withLayout]);

  const anchor = useCallback((action: string) => {
    const { logMsg, getInventory, setInventory } = depsRef.current;
    const record = progression.getAnchor(PROVING_SITE_ID);
    if (!record) {
      logMsg('No anchor record. Run /campaign proving first.', 'error');
      return;
    }
    if (action === 'status') {
      logMsg(`Anchor ${record.charges}/${record.maxCharges} at ${record.x},${record.y},${record.z} (refill: ${record.refillItemId}).`, 'info');
    } else if (action === 'rest') {
      worldManager.setSpawnPoint(record.x, record.y + 1, record.z, false);
      logMsg(`Attuned: respawn set to the anchor (${record.charges} charges held).`, 'success');
    } else if (action === 'refill') {
      const inv = getInventory();
      let cobble = 0;
      for (const s of inv) {
        if (s && (s.type as number) === (BlockType.COBBLESTONE as number)) cobble += s.count;
      }
      if (cobble <= 0) {
        logMsg(`Refill needs ${PROVING_ANCHOR_REFILL} (minecraft:cobblestone) in inventory.`, 'error');
        return;
      }
      const consumed = progression.refillAnchor(PROVING_SITE_ID, cobble);
      if (consumed <= 0) {
        logMsg('Anchor already full.', 'info');
        return;
      }
      let left = consumed;
      const next = inv.map((s) => {
        if (!s || left <= 0) return s;
        if ((s.type as number) !== (BlockType.COBBLESTONE as number)) return s;
        const take = Math.min(s.count, left);
        left -= take;
        return s.count - take <= 0 ? null : { ...s, count: s.count - take };
      });
      setInventory(next);
      const updated = progression.getAnchor(PROVING_SITE_ID);
      logMsg(`Anchor refilled +${consumed} (now ${updated?.charges}/${updated?.maxCharges}).`, 'success');
    } else {
      logMsg('Usage: /campaign anchor rest|refill|status', 'error');
    }
  }, []);

  const frenzy = useCallback(() => {
    const { logMsg } = depsRef.current;
    const camp = progression.getCampaign();
    const phase = (camp.encounters?.[PROVING_SITE_ID]?.phase ?? 'undiscovered') as ProvingEncounter['state']['phase'];
    const active = camp.encounters?.[PROVING_SITE_ID]?.waystoneActive === true;
    if (!canStartProvingFrenzy(progression.isBloodMoonDemonstrable(), phase, active)) {
      logMsg('Frenzy unavailable: needs a cleared site, an active waystone, and Blood Moon eligibility (/campaign bloodmoon on).', 'error');
      return;
    }
    encounterRef.current = encounterRef.current
      ? armProvingRematch(progression, encounterRef.current)
      : { state: startProvingEncounter(progression).state, tempLayer: new TempArenaLayer() };
    logMsg('Frenzy started (fixture package: tighter temp-edit tells + one recovery branch + bounded arena rule). No canonical rewards; challenge cosmetics only.', 'success');
  }, []);

  const bloodmoon = useCallback((action: string) => {
    const { logMsg } = depsRef.current;
    if (action === 'on') {
      progression.setBloodMoonFixture(true);
      logMsg('Blood Moon fixture eligibility ON. This is NOT a Bell Titan clear and gates nothing canonical.', 'info');
    } else if (action === 'off') {
      progression.setBloodMoonFixture(false);
      logMsg('Blood Moon fixture eligibility OFF.', 'info');
    } else {
      logMsg('Usage: /campaign bloodmoon on|off', 'error');
    }
  }, []);

  const preview = useCallback(async () => {
    const { logMsg, saveGame, startWorld, teleportTo, setInventory, activeWorldIdRef } = depsRef.current;
    const oldId = activeWorldIdRef.current;
    logMsg('Creating Gate 0 preview world (noncanonical provenance)...', 'info');
    await saveGame({ force: true });
    if (oldId) await WorldStorage.closeWorld(oldId).catch(() => {});
    const meta = await WorldStorage.createWorld('Gate 0 Proving Preview', `gate0-preview-${Date.now() % 100000}`, 'survival');
    meta.provenance = 'preview';
    meta.previewRegion = 'gate0_proving_ground';
    await WorldStorage.saveWorldMeta(meta);
    await startWorld(meta.id);
    // Curated arrival kit (preview loadout, isolated to this world).
    const kit: (ItemStack | null)[] = Array(36).fill(null);
    kit[0] = { type: BlockType.STONE_PICKAXE, count: 1 };
    kit[1] = { type: BlockType.TORCH, count: 32 };
    kit[2] = { type: BlockType.APPLE, count: 16 };
    kit[3] = { type: BlockType.COBBLESTONE, count: 64 };
    kit[4] = { type: 256 as BlockType, count: 16 };
    setInventory(kit);
    const o = deriveOrigin();
    const layout = buildProvingGround(worldManager, o.x, o.z, o.hintY);
    layoutRef.current = layout;
    placeProvingAnchor(progression, layout);
    progression.discoverWaystone(PROVING_SITE_ID);
    teleportTo(layout.origin.x + 0.5, layout.origin.y + 2, layout.origin.z + 0.5);
    logMsg('Preview entered: production terrain, curated kit, no canonical clears fabricated. Progress stays in this world.', 'success');
  }, []);

  const status = useCallback(() => {
    const { logMsg } = depsRef.current;
    const camp = progression.getCampaign();
    const enc = camp.encounters?.[PROVING_SITE_ID];
    const anchorState = progression.getAnchor(PROVING_SITE_ID);
    logMsg(
      `Campaign status: provenance=${camp.provenance ?? 'standard'} seed=${camp.seedNum ?? '?'} retrofit=${camp.isRetrofit ?? false} | ` +
      `encounter=${enc?.phase ?? 'none'} attempts=${enc?.attemptCount ?? 0} | ` +
      `crests=[${(camp.crests ?? []).join(',')}] keystones=[${(camp.keystones ?? []).join(',')}] | ` +
      `anchor=${anchorState ? `${anchorState.charges}/${anchorState.maxCharges}` : 'none'} | ` +
      `bloodmoon=${camp.bloodMoonUnlocked === true ? 'unlocked' : camp.bloodMoonFixture === true ? 'fixture' : 'locked'} | ` +
      `transform=${camp.transforms?.['gate0_proving_ground'] === true ? 'applied' : 'none'}`,
      'info',
    );
  }, []);

  const runCommand = useCallback((args: string[]): boolean => {
    const [sub, ...rest] = args;
    switch ((sub ?? '').toLowerCase()) {
      case 'proving':
        if ((rest[0] ?? '').toLowerCase() === 'clear') clearSite();
        else build();
        return true;
      case 'start': start(); return true;
      case 'fail': fail(); return true;
      case 'clear': clear(); return true;
      case 'rematch': rematch(); return true;
      case 'travel': travel(); return true;
      case 'anchor': anchor((rest[0] ?? 'status').toLowerCase()); return true;
      case 'frenzy': frenzy(); return true;
      case 'bloodmoon': bloodmoon((rest[0] ?? '').toLowerCase()); return true;
      case 'preview': void preview(); return true;
      case 'status': status(); return true;
      default: return false;
    }
  }, [build, clearSite, start, fail, clear, rematch, travel, anchor, frenzy, bloodmoon, preview, status]);

  const getAtlasInfo = useCallback(() => {
    const camp = progression.getCampaign();
    const seed = camp.seedNum ?? 1;
    try {
      const graph = generateCampaignGraph(seed, camp.isRetrofit === true);
      const spawn = worldManager.getWorldSpawn();
      return provingAtlasInfo(graph, spawn?.x ?? 0, spawn?.z ?? 0);
    } catch {
      return { region: 'gate0_proving_ground', bearingDegrees: 0, distanceBlocks: 0, sketch: '', hint: '' };
    }
  }, []);

  const getPanelData = useCallback((): AtlasPanelData => {
    const camp = progression.getCampaign();
    const enc = camp.encounters?.[PROVING_SITE_ID];
    const anchorState = progression.getAnchor(PROVING_SITE_ID);
    let atlas;
    try {
      atlas = getAtlasInfo();
    } catch {
      atlas = { region: 'gate0_proving_ground', bearingDegrees: 0, distanceBlocks: 0, sketch: '', hint: '' };
    }
    return {
      provenance: camp.provenance ?? 'standard',
      region: atlas.region,
      sketch: atlas.sketch,
      hint: atlas.hint,
      bearingDegrees: atlas.bearingDegrees,
      distanceBlocks: atlas.distanceBlocks,
      crests: camp.crests ?? [],
      keystones: camp.keystones ?? [],
      waystones: camp.waystones ?? {},
      anchor: anchorState ? { charges: anchorState.charges, maxCharges: anchorState.maxCharges, refillItemId: anchorState.refillItemId } : undefined,
      encounterPhase: enc?.phase ?? 'none',
      attemptCount: enc?.attemptCount ?? 0,
      bloodMoonDemonstrable: progression.isBloodMoonDemonstrable(),
      bloodMoonFixture: progression.isBloodMoonFixture(),
      bellTitanDefeated: camp.bellTitanDefeated === true,
      transformApplied: camp.transforms?.['gate0_proving_ground'] === true,
    };
  }, [getAtlasInfo]);

  return { runCommand, getPanelData, getAtlasInfo, build, travel, status };
}
