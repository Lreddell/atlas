// The recipe book: every crafting recipe, grouped by what it makes, filtered to
// what the player has discovered, marked craftable or not, and laid into the
// crafting grid on request. Pure: the inventory UI renders it and the
// inventory controller moves the items.
//
// A recipe is known once the player has held any of its ingredients or its
// result (as Minecraft unlocks them), so a new world's book starts with planks
// and grows as the player gathers.

import type { BlockType, CreativeTab, ItemStack } from '../../types';
import type { Recipe } from '../../recipes';

export interface RecipeEntry {
    /** What the recipes make. */
    output: BlockType;
    /** How many one craft makes (the first variant's count). */
    count: number;
    /** Every recipe that makes it (wood families, alternate shapes), in recipe order. */
    variants: Recipe[];
}

export interface TrimmedPattern {
    cells: (BlockType | null)[];
    w: number;
    h: number;
}

/** The recipe's pattern cropped to its used cells. */
export function trimPattern(recipe: Recipe): TrimmedPattern {
    const width: number = recipe.gridSize;
    const height = recipe.pattern.length / width;
    let minX = width, maxX = -1, minY = height, maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (recipe.pattern[y * width + x] === null) continue;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
    }
    if (maxX < 0) return { cells: [], w: 0, h: 0 };
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const cells: (BlockType | null)[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push(recipe.pattern[(minY + y) * width + minX + x]);
    return { cells, w, h };
}

/** Whether the recipe fits a crafting grid this wide (2 in the inventory, 3 at a table). */
export function fitsGrid(recipe: Recipe, gridWidth: number): boolean {
    const { w, h } = trimPattern(recipe);
    return w <= gridWidth && h <= gridWidth;
}

/** Items one craft uses, by type. */
export function ingredientCounts(recipe: Recipe): Map<BlockType, number> {
    const counts = new Map<BlockType, number>();
    for (const cell of recipe.pattern) if (cell !== null) counts.set(cell, (counts.get(cell) ?? 0) + 1);
    return counts;
}

/** Items the player holds, by type. */
export function countItems(stacks: readonly (ItemStack | null)[]): Map<BlockType, number> {
    const counts = new Map<BlockType, number>();
    for (const stack of stacks) if (stack) counts.set(stack.type, (counts.get(stack.type) ?? 0) + stack.count);
    return counts;
}

/** How many times the recipe can be made from these items. */
export function craftsAvailable(recipe: Recipe, have: ReadonlyMap<BlockType, number>): number {
    let crafts = Infinity;
    for (const [type, need] of ingredientCounts(recipe)) crafts = Math.min(crafts, Math.floor((have.get(type) ?? 0) / need));
    return crafts === Infinity ? 0 : crafts;
}

/** Recipes grouped by what they make, in the order the results first appear. */
export function buildRecipeEntries(recipes: readonly Recipe[]): RecipeEntry[] {
    const byOutput = new Map<BlockType, RecipeEntry>();
    for (const recipe of recipes) {
        const entry = byOutput.get(recipe.output.type);
        if (entry) entry.variants.push(recipe);
        else byOutput.set(recipe.output.type, { output: recipe.output.type, count: recipe.output.count, variants: [recipe] });
    }
    return [...byOutput.values()];
}

/** Whether the player knows the recipe: they have held one of its ingredients, or what it makes. */
export function isKnown(entry: RecipeEntry, known: ReadonlySet<BlockType>): boolean {
    if (known.has(entry.output)) return true;
    return entry.variants.some((recipe) => recipe.pattern.some((cell) => cell !== null && known.has(cell)));
}

export interface EntryStatus {
    /** The variant to show and to fill: one craftable here if any, else one that fits, else the first. */
    recipe: Recipe;
    /** Crafts the items on hand allow in this grid (0 when something is missing or it doesn't fit). */
    crafts: number;
    /** It needs a 3x3 grid and this one is 2x2. */
    needsTable: boolean;
    /** The items on hand would make it (at a table, when needsTable). */
    haveIngredients: boolean;
}

/** Which variant of an entry to use here, and whether it can be made. */
export function entryStatus(entry: RecipeEntry, have: ReadonlyMap<BlockType, number>, gridWidth: number): EntryStatus {
    let fallback: EntryStatus | null = null;
    for (const recipe of entry.variants) {
        const needsTable = !fitsGrid(recipe, gridWidth);
        const haveIngredients = craftsAvailable(recipe, have) > 0;
        if (haveIngredients && !needsTable) return { recipe, crafts: craftsAvailable(recipe, have), needsTable, haveIngredients };
        const status = { recipe, crafts: 0, needsTable, haveIngredients };
        if (!fallback
            || (fallback.needsTable && !needsTable)
            || (fallback.needsTable === needsTable && !fallback.haveIngredients && haveIngredients)) fallback = status;
    }
    return fallback!;
}

/** The book's tabs, by the category of what a recipe makes. */
export type RecipeTab = 'all' | 'blocks' | 'gear' | 'food' | 'other';

export function tabOf(category: CreativeTab | undefined): Exclude<RecipeTab, 'all'> {
    if (category === 'building' || category === 'natural') return 'blocks';
    if (category === 'tools') return 'gear';
    if (category === 'food') return 'food';
    return 'other';
}

/**
 * Where each ingredient goes in a crafting grid this wide: the pattern laid in
 * from the top-left corner. Null when it doesn't fit.
 */
export function layOut(recipe: Recipe, gridWidth: number): (BlockType | null)[] | null {
    const { cells, w, h } = trimPattern(recipe);
    if (w > gridWidth || h > gridWidth) return null;
    const grid: (BlockType | null)[] = new Array(gridWidth * gridWidth).fill(null);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grid[y * gridWidth + x] = cells[y * w + x];
    return grid;
}
