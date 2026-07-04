import { BlockType } from '../../types';

export type RecipeIngredient = { ids: readonly BlockType[] } | { tag: string };

export interface RuntimeRecipe {
    id: string;
    type: 'shaped' | 'shapeless';
    width: number;
    height: number;
    ingredients: Array<RecipeIngredient | null>;
    output: { type: BlockType; count: number };
}

const ingredientMatches = (ingredient: RecipeIngredient | null, value: BlockType | null, tags: Map<string, Set<BlockType>>) => {
    if (ingredient === null) return value === null;
    if (value === null) return false;
    return 'ids' in ingredient ? ingredient.ids.includes(value) : !!tags.get(ingredient.tag)?.has(value);
};

export class RecipeRegistry {
    private recipes = new Map<string, RuntimeRecipe>();
    private tags = new Map<string, Set<BlockType>>();

    register(recipe: RuntimeRecipe): () => void {
        if (this.recipes.has(recipe.id)) throw new Error(`Duplicate recipe: ${recipe.id}`);
        this.recipes.set(recipe.id, recipe);
        return () => this.recipes.delete(recipe.id);
    }

    setTag(id: string, values: Iterable<BlockType>): void { this.tags.set(id, new Set(values)); }
    clearNamespace(namespace: string): void {
        for (const id of this.recipes.keys()) if (id.startsWith(`${namespace}:`)) this.recipes.delete(id);
    }

    match(grid: readonly (BlockType | null)[], width: number): RuntimeRecipe['output'] | null {
        const occupied = grid.map((value, index) => ({ value, x: index % width, y: Math.floor(index / width) })).filter((cell) => cell.value !== null);
        if (occupied.length === 0) return null;
        const minX = Math.min(...occupied.map((cell) => cell.x));
        const maxX = Math.max(...occupied.map((cell) => cell.x));
        const minY = Math.min(...occupied.map((cell) => cell.y));
        const maxY = Math.max(...occupied.map((cell) => cell.y));
        const trimmedWidth = maxX - minX + 1;
        const trimmedHeight = maxY - minY + 1;
        const trimmed: (BlockType | null)[] = [];
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) trimmed.push(grid[y * width + x]);

        for (const recipe of this.recipes.values()) {
            if (recipe.type === 'shaped') {
                if (recipe.width !== trimmedWidth || recipe.height !== trimmedHeight) continue;
                if (recipe.ingredients.every((ingredient, index) => ingredientMatches(ingredient, trimmed[index], this.tags))) return { ...recipe.output };
            } else {
                const remaining = [...trimmed.filter((value): value is BlockType => value !== null)];
                const ingredients = recipe.ingredients.filter((value): value is RecipeIngredient => value !== null);
                if (ingredients.length !== remaining.length) continue;
                let matches = true;
                for (const ingredient of ingredients) {
                    const index = remaining.findIndex((value) => ingredientMatches(ingredient, value, this.tags));
                    if (index < 0) { matches = false; break; }
                    remaining.splice(index, 1);
                }
                if (matches) return { ...recipe.output };
            }
        }
        return null;
    }
}

export const runtimeRecipeRegistry = new RecipeRegistry();
