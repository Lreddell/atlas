import type { ModPack } from '../../components/ui/FeatureEditor/editorTypes';
import { runtimeIdForResourceId } from '../registry/contentIdentity';
import { runtimeRecipeRegistry } from '../registry/RecipeRegistry';
import { BlockType } from '../../types';

const STORAGE_KEY = 'atlas_mod_packs';
const ACTIVE_KEY = 'atlas_active_pack_id';

export class RuntimePackManager {
    private stack: ModPack[] = [];
    private recipeDisposers: Array<() => void> = [];

    reload(): void {
        this.recipeDisposers.splice(0).forEach((dispose) => dispose());
        if (typeof localStorage === 'undefined') { this.stack = []; return; }
        try {
            const packs = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ModPack[];
            const active = localStorage.getItem(ACTIVE_KEY);
            this.stack = packs.filter((pack) => pack?.meta?.enabled)
                .sort((a, b) => Number(a.meta.id === active) - Number(b.meta.id === active));
        } catch {
            this.stack = [];
        }
        for (const pack of this.stack) this.registerRecipes(pack);
    }

    getStackManifest(): Array<{ id: string; version: string }> {
        return this.stack.map((pack) => ({ id: pack.meta.id, version: pack.meta.version }));
    }

    resolveTexture(id: string): number[] | undefined {
        for (let i = this.stack.length - 1; i >= 0; i--) {
            const texture = this.stack[i].textures[id];
            if (texture) return texture.data;
        }
        return undefined;
    }

    private registerRecipes(pack: ModPack): void {
        for (const recipe of Object.values(pack.recipes)) {
            const output = runtimeIdForResourceId(recipe.output.id);
            if (output === undefined) continue;
            const mapped = recipe.pattern.map((id) => {
                if (!id) return null;
                const runtime = runtimeIdForResourceId(id);
                return runtime === undefined ? null : { ids: [runtime as BlockType] };
            });
            if (mapped.some((ingredient, index) => recipe.pattern[index] !== null && ingredient === null)) continue;
            this.recipeDisposers.push(runtimeRecipeRegistry.register({
                id: `${pack.meta.id}:${recipe.id}`,
                type: recipe.type,
                width: recipe.gridSize,
                height: recipe.gridSize,
                ingredients: mapped,
                output: { type: output as BlockType, count: recipe.output.count },
            }));
        }
    }
}

export const runtimePackManager = new RuntimePackManager();
