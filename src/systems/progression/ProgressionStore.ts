// World-scoped progression state: which bosses are defeated, which sealed
// regions have been cleansed, and which abilities/recipes are unlocked.
//
// This is the backbone of the action-adventure layer. It is a singleton that is
// hydrated when a world loads (from WorldMetadata.progression) and serialized
// back on save. Mutations emit events on the game event bus so world/UI/music
// react without direct coupling.

import { gameEvents } from '../events/GameEvents';

export type RegionState = 'sealed' | 'cleansed';

/** Serializable snapshot stored in WorldMetadata.progression. */
export interface ProgressionData {
    version: 1;
    bossesDefeated: string[];
    /** Only overrides are stored; absent region => its default (sealed) state. */
    regionStates: Record<string, RegionState>;
    unlockedAbilities: string[];
    unlockedRecipes: string[];
}

class ProgressionStore {
    private bossesDefeated = new Set<string>();
    private regionStates = new Map<string, RegionState>();
    private unlockedAbilities = new Set<string>();
    private unlockedRecipes = new Set<string>();

    /** Replace all state from a saved snapshot (or reset if undefined). */
    load(data: ProgressionData | undefined | null): void {
        this.bossesDefeated = new Set(data?.bossesDefeated ?? []);
        this.regionStates = new Map(Object.entries(data?.regionStates ?? {}));
        this.unlockedAbilities = new Set(data?.unlockedAbilities ?? []);
        this.unlockedRecipes = new Set(data?.unlockedRecipes ?? []);
    }

    serialize(): ProgressionData {
        return {
            version: 1,
            bossesDefeated: Array.from(this.bossesDefeated),
            regionStates: Object.fromEntries(this.regionStates),
            unlockedAbilities: Array.from(this.unlockedAbilities),
            unlockedRecipes: Array.from(this.unlockedRecipes),
        };
    }

    reset(): void {
        this.load(null);
    }

    // --- Bosses ---
    isBossDefeated(bossId: string): boolean {
        return this.bossesDefeated.has(bossId);
    }
    markBossDefeated(bossId: string): void {
        this.bossesDefeated.add(bossId);
    }
    getDefeatedBosses(): string[] {
        return Array.from(this.bossesDefeated);
    }

    // --- Regions ---
    /** A region is cleansed only if explicitly recorded; otherwise it is sealed. */
    isRegionCleansed(regionId: string): boolean {
        return this.regionStates.get(regionId) === 'cleansed';
    }
    cleanseRegion(regionId: string): void {
        if (this.regionStates.get(regionId) === 'cleansed') return;
        this.regionStates.set(regionId, 'cleansed');
        gameEvents.emit('region:cleansed', { regionId });
    }
    /** Revert a region to its default (sealed) state. Mainly for testing. */
    sealRegion(regionId: string): void {
        this.regionStates.delete(regionId);
    }

    // --- Abilities ---
    isAbilityUnlocked(abilityId: string): boolean {
        return this.unlockedAbilities.has(abilityId);
    }
    unlockAbility(abilityId: string): void {
        this.unlockedAbilities.add(abilityId);
    }
    getUnlockedAbilities(): string[] {
        return Array.from(this.unlockedAbilities);
    }

    // --- Recipes ---
    isRecipeUnlocked(recipeId: string): boolean {
        return this.unlockedRecipes.has(recipeId);
    }
    unlockRecipe(recipeId: string): void {
        this.unlockedRecipes.add(recipeId);
    }
}

export const progression = new ProgressionStore();
