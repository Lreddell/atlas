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

export interface ProgressionData {
    version: 1;
    bossesDefeated: string[];
    regionStates: Record<string, RegionState>;
    unlockedAbilities: string[];
    unlockedRecipes: string[];
    resonantVaults?: ResonantVaultProgressData;
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
    }

    serialize(): ProgressionData {
        const serializedVaults: Record<string, VaultProgressData> = {};
        for (const [vaultId, progress] of this.vaults) {
            serializedVaults[vaultId] = readVaultProgress(progress);
        }
        return {
            version: 1,
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
}

export const progression = new ProgressionStore();
