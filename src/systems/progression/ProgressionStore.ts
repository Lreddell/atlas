// World-scoped progression state for bosses, regions, abilities, recipes, and
// additive authored-expedition state such as Resonant Vaults.

import { gameEvents } from '../events/GameEvents.ts';
import type { VaultEscapeRoute } from '../world/resonantVaultEscapes.ts';
import { VAULT_ESCAPE_DURATION_SECONDS } from '../world/resonantVaultEscapeRuntime.ts';

export type RegionState = 'sealed' | 'cleansed';

export interface VaultProgressData {
    discovered: boolean;
    rooms: Record<string, boolean>;
    titanDefeated: boolean;
    coreClaimed: boolean;
    escapeStarted: boolean;
    escapeCompleted: boolean;
    escapeRoute?: VaultEscapeRoute;
    escapeRemainingSeconds?: number;
    escapeCheckpoint?: VaultEscapeCheckpointData;
    coreRewardClaimed: boolean;
}

export interface VaultEscapeCheckpointData {
    id: string;
    route: VaultEscapeRoute;
    x: number;
    y: number;
    z: number;
}

export interface VaultEscapeSessionData {
    remainingSeconds: number;
    route: VaultEscapeRoute | null;
    checkpoint: VaultEscapeCheckpointData | null;
}

export interface ResonantVaultProgressData {
    firstVaultRewardClaimed: boolean;
    vaults: Record<string, VaultProgressData>;
}

export interface CampaignAnchorRecord {
    charges: number;
    maxCharges: number;
    refillItemId: string;
    x: number;
    y: number;
    z: number;
}

export interface CampaignProgressionData {
    graphSchema?: number;
    seedNum?: number;
    isRetrofit?: boolean;
    provenance?: 'standard' | 'preview';
    previewRegion?: string;
    crests?: string[];
    keystones?: string[];
    boundRelics?: string[];
    encounters?: Record<string, {
        phase: string;
        waystoneActive: boolean;
        rematchAvailable: boolean;
        attemptCount: number;
        firstClearAt?: number;
    }>;
    waystones?: Record<string, { discovered: boolean; active: boolean }>;
    /** Expedition anchors by site id (bounded charges, persisted). */
    anchors?: Record<string, CampaignAnchorRecord>;
    /** Region transform fixtures applied (region -> true). */
    transforms?: Record<string, boolean>;
    bloodMoonUnlocked?: boolean;
    /**
     * Gate 0 fixture eligibility: allows Blood Moon/Frenzy demonstration
     * WITHOUT a real Bell Titan clear. Never implies bellTitanDefeated and
     * never gates canonical content.
     */
    bloodMoonFixture?: boolean;
    bellTitanDefeated?: boolean;
    atlasSealOwned?: boolean;
    firstSurveyorDefeated?: boolean;
}

export interface ProgressionData {
    version: 1 | 2;
    bossesDefeated: string[];
    regionStates: Record<string, RegionState>;
    unlockedAbilities: string[];
    unlockedRecipes: string[];
    resonantVaults?: ResonantVaultProgressData;
    /** Gate 0 campaign state. Absent on pre-campaign saves -> treated as empty. */
    campaign?: CampaignProgressionData;
}

function emptyVaultProgress(): VaultProgressData {
    return {
        discovered: false,
        rooms: {},
        titanDefeated: false,
        coreClaimed: false,
        escapeStarted: false,
        escapeCompleted: false,
        coreRewardClaimed: false,
    };
}

function readVaultProgress(value: VaultProgressData | undefined): VaultProgressData {
    // A saved record can only reach a later stage through the earlier ones, so
    // decoding enforces the implication chain. This heals partially written or
    // hand-edited saves that would otherwise strand the vault (e.g. an escape
    // in progress for a core that was never marked claimed).
    const escapeCompleted = value?.escapeCompleted === true;
    const escapeStarted = value?.escapeStarted === true || escapeCompleted;
    const coreClaimed = value?.coreClaimed === true || escapeStarted;
    const titanDefeated = value?.titanDefeated === true || coreClaimed;
    const discovered = value?.discovered === true || titanDefeated || Object.keys(value?.rooms ?? {}).length > 0;
    const escapeRoute = value?.escapeRoute === 'grand' || value?.escapeRoute === 'fracture'
        ? value.escapeRoute
        : undefined;
    const remaining = Number.isFinite(value?.escapeRemainingSeconds)
        ? Math.max(0, Math.min(VAULT_ESCAPE_DURATION_SECONDS, value!.escapeRemainingSeconds!))
        : null;
    const checkpoint = value?.escapeCheckpoint;
    const validCheckpoint = escapeRoute && checkpoint
        && checkpoint.route === escapeRoute
        && checkpoint.id.length > 0
        && [checkpoint.x, checkpoint.y, checkpoint.z].every(Number.isFinite)
        ? { ...checkpoint }
        : null;
    return {
        discovered,
        rooms: { ...(value?.rooms ?? {}) },
        titanDefeated,
        coreClaimed,
        escapeStarted,
        escapeCompleted,
        ...(escapeRoute ? { escapeRoute } : {}),
        ...(remaining !== null ? { escapeRemainingSeconds: remaining } : {}),
        ...(validCheckpoint ? { escapeCheckpoint: validCheckpoint } : {}),
        coreRewardClaimed: value?.coreRewardClaimed === true,
    };
}

export class ProgressionStore {
    private bossesDefeated = new Set<string>();
    private regionStates = new Map<string, RegionState>();
    private unlockedAbilities = new Set<string>();
    private unlockedRecipes = new Set<string>();
    private vaults = new Map<string, VaultProgressData>();
    private firstVaultRewardClaimed = false;
    private campaign: CampaignProgressionData = {};

    load(data: ProgressionData | undefined | null): void {
        this.bossesDefeated = new Set(data?.bossesDefeated ?? []);
        this.regionStates = new Map(Object.entries(data?.regionStates ?? {}));
        this.unlockedAbilities = new Set(data?.unlockedAbilities ?? []);
        this.unlockedRecipes = new Set(data?.unlockedRecipes ?? []);
        this.vaults = new Map(
            Object.entries(data?.resonantVaults?.vaults ?? {})
                .map(([vaultId, progress]) => [vaultId, readVaultProgress(progress)]),
        );
        this.firstVaultRewardClaimed = data?.resonantVaults?.firstVaultRewardClaimed === true;
        this.campaign = sanitizeCampaignData(data?.campaign);
    }

    serialize(): ProgressionData {
        const serializedVaults: Record<string, VaultProgressData> = {};
        for (const [vaultId, progress] of this.vaults) {
            serializedVaults[vaultId] = readVaultProgress(progress);
        }
        const hasCampaign = Object.keys(this.campaign).length > 0;
        return {
            version: hasCampaign ? 2 : 1,
            bossesDefeated: Array.from(this.bossesDefeated),
            regionStates: Object.fromEntries(this.regionStates),
            unlockedAbilities: Array.from(this.unlockedAbilities),
            unlockedRecipes: Array.from(this.unlockedRecipes),
            ...(this.vaults.size > 0 || this.firstVaultRewardClaimed ? {
                resonantVaults: {
                    firstVaultRewardClaimed: this.firstVaultRewardClaimed,
                    vaults: serializedVaults,
                },
            } : {}),
            ...(hasCampaign ? { campaign: { ...this.campaign } } : {}),
        };
    }

    reset(): void {
        this.load(null);
    }

    isBossDefeated(bossId: string): boolean {
        return this.bossesDefeated.has(bossId);
    }
    markBossDefeated(bossId: string): void {
        this.bossesDefeated.add(bossId);
    }
    getDefeatedBosses(): string[] {
        return Array.from(this.bossesDefeated);
    }

    isRegionCleansed(regionId: string): boolean {
        return this.regionStates.get(regionId) === 'cleansed';
    }
    cleanseRegion(regionId: string): void {
        if (this.regionStates.get(regionId) === 'cleansed') return;
        this.regionStates.set(regionId, 'cleansed');
        gameEvents.emit('region:cleansed', { regionId });
    }
    sealRegion(regionId: string): void {
        this.regionStates.delete(regionId);
    }

    isAbilityUnlocked(abilityId: string): boolean {
        return this.unlockedAbilities.has(abilityId);
    }
    unlockAbility(abilityId: string): void {
        this.unlockedAbilities.add(abilityId);
    }
    getUnlockedAbilities(): string[] {
        return Array.from(this.unlockedAbilities);
    }

    isRecipeUnlocked(recipeId: string): boolean {
        return this.unlockedRecipes.has(recipeId);
    }
    unlockRecipe(recipeId: string): void {
        this.unlockedRecipes.add(recipeId);
    }

    getVaultProgress(vaultId: string): VaultProgressData {
        return readVaultProgress(this.vaults.get(vaultId) ?? emptyVaultProgress());
    }

    private updateVault(vaultId: string, mutate: (progress: VaultProgressData) => boolean): boolean {
        const next = this.getVaultProgress(vaultId);
        const changed = mutate(next);
        if (changed) this.vaults.set(vaultId, next);
        return changed;
    }

    setVaultDiscovered(vaultId: string, position = { x: 0, y: 0, z: 0 }): boolean {
        const changed = this.updateVault(vaultId, (progress) => {
            if (progress.discovered) return false;
            progress.discovered = true;
            return true;
        });
        if (changed) gameEvents.emit('vault:discovered', { vaultId, ...position });
        return changed;
    }

    setVaultRoomSolved(vaultId: string, roomId: string): boolean {
        if (!roomId) return false;
        const changed = this.updateVault(vaultId, (progress) => {
            if (progress.rooms[roomId]) return false;
            progress.rooms[roomId] = true;
            return true;
        });
        if (changed) gameEvents.emit('vault:room-solved', { vaultId, roomId });
        return changed;
    }

    isVaultRoomSolved(vaultId: string, roomId: string): boolean {
        return this.getVaultProgress(vaultId).rooms[roomId] === true;
    }

    markVaultTitanDefeated(vaultId: string, _entityId = -1): boolean {
        const changed = this.updateVault(vaultId, (progress) => {
            if (progress.titanDefeated) return false;
            progress.titanDefeated = true;
            return true;
        });
        return changed;
    }

    claimVaultCore(vaultId: string): boolean {
        const changed = this.updateVault(vaultId, (progress) => {
            if (!progress.titanDefeated || progress.coreClaimed) return false;
            progress.coreClaimed = true;
            progress.coreRewardClaimed = true;
            return true;
        });
        if (changed) gameEvents.emit('vault:core-claimed', { vaultId, firstClear: !this.firstVaultRewardClaimed });
        return changed;
    }

    startVaultEscape(vaultId: string): boolean {
        const changed = this.updateVault(vaultId, (progress) => {
            if (!progress.coreClaimed || progress.escapeStarted) return false;
            progress.escapeStarted = true;
            progress.escapeRemainingSeconds = VAULT_ESCAPE_DURATION_SECONDS;
            return true;
        });
        if (changed) gameEvents.emit('vault:escape-started', { vaultId, durationSeconds: VAULT_ESCAPE_DURATION_SECONDS });
        return changed;
    }

    chooseVaultEscapeRoute(vaultId: string, route: VaultEscapeRoute): boolean {
        const changed = this.updateVault(vaultId, (progress) => {
            if (!progress.escapeStarted || progress.escapeCompleted || progress.escapeRoute) return false;
            progress.escapeRoute = route;
            return true;
        });
        if (changed) gameEvents.emit('vault:escape-route-chosen', {
            vaultId,
            route,
            closedRoute: route === 'grand' ? 'fracture' : 'grand',
        });
        return changed;
    }

    updateVaultEscapeRemaining(vaultId: string, remainingSeconds: number): boolean {
        if (!Number.isFinite(remainingSeconds)) return false;
        const remaining = Math.max(0, Math.min(VAULT_ESCAPE_DURATION_SECONDS, remainingSeconds));
        return this.updateVault(vaultId, (progress) => {
            if (!progress.escapeStarted || progress.escapeCompleted
                || progress.escapeRemainingSeconds === remaining) return false;
            progress.escapeRemainingSeconds = remaining;
            return true;
        });
    }

    setVaultEscapeCheckpoint(vaultId: string, checkpoint: VaultEscapeCheckpointData): boolean {
        const route = checkpoint.route;
        if (!checkpoint.id || ![checkpoint.x, checkpoint.y, checkpoint.z].every(Number.isFinite)) return false;
        const changed = this.updateVault(vaultId, (progress) => {
            if (!progress.escapeStarted || progress.escapeCompleted || progress.escapeRoute !== route
                || progress.escapeCheckpoint?.id === checkpoint.id) return false;
            progress.escapeCheckpoint = { ...checkpoint, route };
            return true;
        });
        if (changed) gameEvents.emit('vault:escape-checkpoint', { vaultId, route, checkpointId: checkpoint.id });
        return changed;
    }

    getVaultEscapeSession(vaultId: string): VaultEscapeSessionData {
        const progress = this.getVaultProgress(vaultId);
        return {
            remainingSeconds: progress.escapeRemainingSeconds ?? VAULT_ESCAPE_DURATION_SECONDS,
            route: progress.escapeRoute ?? null,
            checkpoint: progress.escapeCheckpoint ? { ...progress.escapeCheckpoint } : null,
        };
    }

    getActiveVaultEscapeRecovery(
        position?: { x: number; y: number; z: number } | null,
    ): { vaultId: string; checkpoint: VaultEscapeCheckpointData } | null {
        // Several vaults can hold unfinished escapes; recover to the checkpoint
        // nearest the player rather than whichever map entry happens to be first.
        let best: { vaultId: string; checkpoint: VaultEscapeCheckpointData; distance: number } | null = null;
        for (const [vaultId] of this.vaults) {
            const progress = this.getVaultProgress(vaultId);
            if (!progress.escapeStarted || progress.escapeCompleted || !progress.escapeCheckpoint) continue;
            const checkpoint = { ...progress.escapeCheckpoint };
            const distance = position
                ? Math.hypot(checkpoint.x - position.x, checkpoint.y - position.y, checkpoint.z - position.z)
                : 0;
            if (!best || distance < best.distance) best = { vaultId, checkpoint, distance };
        }
        return best ? { vaultId: best.vaultId, checkpoint: best.checkpoint } : null;
    }

    completeVaultEscape(vaultId: string, exit: VaultEscapeRoute = 'grand'): boolean {
        const changed = this.updateVault(vaultId, (progress) => {
            if (!progress.escapeStarted || progress.escapeCompleted) return false;
            if (progress.escapeRoute && progress.escapeRoute !== exit) return false;
            progress.escapeCompleted = true;
            progress.escapeRoute = exit;
            return true;
        });
        if (changed) gameEvents.emit('vault:escape-completed', { vaultId, exit });
        return changed;
    }

    hasClaimedFirstVaultReward(): boolean {
        return this.firstVaultRewardClaimed;
    }

    claimFirstVaultReward(): boolean {
        if (this.firstVaultRewardClaimed) return false;
        this.firstVaultRewardClaimed = true;
        return true;
    }

    resetVault(vaultId: string): void {
        this.vaults.delete(vaultId);
    }

    // ---- Gate 0 campaign state (additive; old saves load as empty) ----
    getCampaign(): CampaignProgressionData {
        return { ...this.campaign };
    }

    setCampaignSeed(seedNum: number, isRetrofit: boolean, provenance: 'standard' | 'preview' = 'standard'): void {
        this.campaign = {
            ...this.campaign,
            graphSchema: 1,
            seedNum,
            isRetrofit,
            provenance,
        };
    }

    grantCampaignCrest(crestId: string): boolean {
        const crests = this.campaign.crests ?? [];
        if (crests.includes(crestId)) return false;
        this.campaign = { ...this.campaign, crests: [...crests, crestId] };
        this.addBoundRelic(crestId);
        return true;
    }

    grantCampaignKeystone(keystoneId: string): boolean {
        const keystones = this.campaign.keystones ?? [];
        if (keystones.includes(keystoneId)) return false;
        this.campaign = { ...this.campaign, keystones: [...keystones, keystoneId] };
        this.addBoundRelic(keystoneId);
        return true;
    }

    private addBoundRelic(relicId: string): void {
        const bound = this.campaign.boundRelics ?? [];
        if (!bound.includes(relicId)) {
            this.campaign = { ...this.campaign, boundRelics: [...bound, relicId] };
        }
    }

    hasCampaignCrest(crestId: string): boolean {
        return (this.campaign.crests ?? []).includes(crestId)
            || (this.campaign.boundRelics ?? []).includes(crestId);
    }

    getCampaignKeystones(): string[] {
        return [...(this.campaign.keystones ?? [])];
    }

    setEncounterPhase(
        siteId: string,
        phase: string,
        patch: Partial<{ waystoneActive: boolean; rematchAvailable: boolean; attemptCount: number; firstClearAt: number }> = {},
    ): void {
        const encounters = { ...(this.campaign.encounters ?? {}) };
        const prev = encounters[siteId] ?? {
            phase: 'undiscovered',
            waystoneActive: false,
            rematchAvailable: false,
            attemptCount: 0,
        };
        encounters[siteId] = { ...prev, phase, ...patch };
        this.campaign = { ...this.campaign, encounters };
    }

    unlockBloodMoon(): void {
        this.campaign = { ...this.campaign, bloodMoonUnlocked: true };
    }

    isBloodMoonUnlocked(): boolean {
        return this.campaign.bloodMoonUnlocked === true;
    }

    /** Gate 0 fixture: Blood Moon/Frenzy eligibility without a Bell Titan clear. */
    setBloodMoonFixture(on: boolean): void {
        this.campaign = { ...this.campaign, bloodMoonFixture: on === true ? true : undefined };
        if (!on) {
            const next = { ...this.campaign };
            delete next.bloodMoonFixture;
            this.campaign = next;
        }
    }

    isBloodMoonFixture(): boolean {
        return this.campaign.bloodMoonFixture === true;
    }

    /** Challenge layer is demonstrable when unlocked canonically or via fixture. */
    isBloodMoonDemonstrable(): boolean {
        return this.campaign.bloodMoonUnlocked === true || this.campaign.bloodMoonFixture === true;
    }

    discoverWaystone(siteId: string): void {
        const waystones = { ...(this.campaign.waystones ?? {}) };
        const prev = waystones[siteId] ?? { discovered: false, active: false };
        waystones[siteId] = { ...prev, discovered: true };
        this.campaign = { ...this.campaign, waystones };
    }

    activateWaystone(siteId: string): void {
        const waystones = { ...(this.campaign.waystones ?? {}) };
        const prev = waystones[siteId] ?? { discovered: false, active: false };
        waystones[siteId] = { ...prev, discovered: true, active: true };
        this.campaign = { ...this.campaign, waystones };
    }

    getWaystones(): Record<string, { discovered: boolean; active: boolean }> {
        return { ...(this.campaign.waystones ?? {}) };
    }

    setAnchor(siteId: string, record: CampaignAnchorRecord): void {
        const charges = Number.isFinite(record.charges)
            ? Math.max(0, Math.min(record.maxCharges, Math.floor(record.charges)))
            : record.maxCharges;
        const anchors = { ...(this.campaign.anchors ?? {}) };
        anchors[siteId] = { ...record, charges };
        this.campaign = { ...this.campaign, anchors };
    }

    getAnchor(siteId: string): CampaignAnchorRecord | undefined {
        const record = this.campaign.anchors?.[siteId];
        return record ? { ...record } : undefined;
    }

    consumeAnchorCharge(siteId: string): boolean {
        const record = this.campaign.anchors?.[siteId];
        if (!record || record.charges <= 0) return false;
        this.setAnchor(siteId, { ...record, charges: record.charges - 1 });
        return true;
    }

    refillAnchor(siteId: string, materialCount: number): number {
        const record = this.campaign.anchors?.[siteId];
        if (!record || materialCount <= 0) return 0;
        const room = record.maxCharges - record.charges;
        const consumed = Math.min(room, Math.floor(materialCount));
        if (consumed > 0) this.setAnchor(siteId, { ...record, charges: record.charges + consumed });
        return consumed;
    }

    setRegionTransform(region: string, applied = true): void {
        const transforms = { ...(this.campaign.transforms ?? {}) };
        if (applied) transforms[region] = true;
        else delete transforms[region];
        this.campaign = { ...this.campaign, transforms };
    }

    hasRegionTransform(region: string): boolean {
        return this.campaign.transforms?.[region] === true;
    }

    /**
     * Preview decontamination (live enforcement): drop any crest/keystone/
     * relic whose id does not belong to the preview target's namespace, so a
     * preview world can never fabricate or export foreign progression.
     */
    sanitizePreviewCampaign(allowedPrefix: string): string[] {
        const dropped: string[] = [];
        const keep = (id: string) => id.startsWith(allowedPrefix);
        for (const key of ['crests', 'keystones', 'boundRelics'] as const) {
            const list = this.campaign[key] ?? [];
            const kept = list.filter(keep);
            dropped.push(...list.filter((id) => !keep(id)));
            if (kept.length !== list.length) this.campaign = { ...this.campaign, [key]: kept };
        }
        return dropped;
    }
}

function sanitizeCampaignData(value: CampaignProgressionData | undefined): CampaignProgressionData {
    if (!value || typeof value !== 'object') return {};
    const asStringArray = (input: unknown): string[] => {
        if (!Array.isArray(input)) return [];
        return input.filter((v): v is string => typeof v === 'string' && v.length > 0);
    };
    const provenance = value.provenance === 'preview' ? 'preview' : value.provenance === 'standard' ? 'standard' : undefined;
    const encounters: CampaignProgressionData['encounters'] = {};
    if (value.encounters && typeof value.encounters === 'object') {
        for (const [siteId, record] of Object.entries(value.encounters)) {
            if (!siteId || !record || typeof record !== 'object') continue;
            encounters[siteId] = {
                phase: typeof record.phase === 'string' ? record.phase : 'undiscovered',
                waystoneActive: record.waystoneActive === true,
                rematchAvailable: record.rematchAvailable === true,
                attemptCount: Number.isFinite(record.attemptCount) ? Math.max(0, Math.floor(record.attemptCount)) : 0,
                ...(Number.isFinite(record.firstClearAt) ? { firstClearAt: record.firstClearAt } : {}),
            };
        }
    }
    const waystones: CampaignProgressionData['waystones'] = {};
    if (value.waystones && typeof value.waystones === 'object') {
        for (const [siteId, record] of Object.entries(value.waystones)) {
            if (!siteId || !record || typeof record !== 'object') continue;
            waystones[siteId] = {
                discovered: record.discovered === true,
                active: record.active === true,
            };
        }
    }
    const anchors: CampaignProgressionData['anchors'] = {};
    if (value.anchors && typeof value.anchors === 'object') {
        for (const [siteId, record] of Object.entries(value.anchors)) {
            if (!siteId || !record || typeof record !== 'object') continue;
            const maxCharges = Number.isFinite(record.maxCharges) ? Math.max(1, Math.min(99, Math.floor(record.maxCharges))) : 5;
            const charges = Number.isFinite(record.charges) ? Math.max(0, Math.min(maxCharges, Math.floor(record.charges))) : maxCharges;
            const x = Number(record.x);
            const y = Number(record.y);
            const z = Number(record.z);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
            anchors[siteId] = {
                charges,
                maxCharges,
                refillItemId: typeof record.refillItemId === 'string' ? record.refillItemId : 'minecraft:cobblestone',
                x, y, z,
            };
        }
    }
    const transforms: Record<string, boolean> = {};
    if (value.transforms && typeof value.transforms === 'object') {
        for (const [region, applied] of Object.entries(value.transforms)) {
            if (region && applied === true) transforms[region] = true;
        }
    }
    return {
        ...(Number.isFinite(value.graphSchema) ? { graphSchema: 1 } : {}),
        ...(Number.isFinite(value.seedNum) ? { seedNum: value.seedNum } : {}),
        ...(typeof value.isRetrofit === 'boolean' ? { isRetrofit: value.isRetrofit } : {}),
        ...(provenance ? { provenance } : {}),
        ...(typeof value.previewRegion === 'string' ? { previewRegion: value.previewRegion } : {}),
        ...(asStringArray(value.crests).length > 0 ? { crests: asStringArray(value.crests) } : {}),
        ...(asStringArray(value.keystones).length > 0 ? { keystones: asStringArray(value.keystones) } : {}),
        ...(asStringArray(value.boundRelics).length > 0 ? { boundRelics: asStringArray(value.boundRelics) } : {}),
        ...(Object.keys(encounters).length > 0 ? { encounters } : {}),
        ...(Object.keys(waystones).length > 0 ? { waystones } : {}),
        ...(Object.keys(anchors).length > 0 ? { anchors } : {}),
        ...(Object.keys(transforms).length > 0 ? { transforms } : {}),
        ...(value.bloodMoonUnlocked === true ? { bloodMoonUnlocked: true } : {}),
        ...(value.bloodMoonFixture === true ? { bloodMoonFixture: true } : {}),
        ...(value.bellTitanDefeated === true ? { bellTitanDefeated: true } : {}),
        ...(value.atlasSealOwned === true ? { atlasSealOwned: true } : {}),
        ...(value.firstSurveyorDefeated === true ? { firstSurveyorDefeated: true } : {}),
    };
}

export const progression = new ProgressionStore();
