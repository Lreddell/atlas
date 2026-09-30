import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

globalThis.__APP_VERSION__ = 'test';
globalThis.__APP_DISPLAY_VERSION__ = 'test';

const book = await loadTs(`
    export * from './src/systems/inventory/recipeBook';
    export { RECIPES } from './src/recipes';
    export { BlockType } from './src/types';
    export { BLOCKS } from './src/data/blocks';
`);
const { BlockType: B, RECIPES } = book;

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const entries = book.buildRecipeEntries(RECIPES);
const entryFor = (type) => entries.find((entry) => entry.output === type);

test('recipes are grouped by what they make, wood families included', () => {
    const sticks = entryFor(B.STICK);
    assert.ok(sticks.variants.length >= 7, 'one stick recipe per plank type');
    assert.equal(sticks.count, 4);
    assert.equal(new Set(entries.map((entry) => entry.output)).size, entries.length);
    assert.ok(entryFor(B.BREAD), 'farming recipes are in the book');
});

test('a recipe is known once any of its ingredients (or its result) has been held', () => {
    const table = entryFor(B.CRAFTING_TABLE);
    assert.equal(book.isKnown(table, new Set()), false);
    assert.equal(book.isKnown(table, new Set([B.BIRCH_PLANKS])), true, 'any plank teaches it');
    assert.equal(book.isKnown(entryFor(B.BREAD), new Set([B.WHEAT])), true);
    assert.equal(book.isKnown(entryFor(B.BREAD), new Set([B.BREAD])), true, 'or holding what it makes');
});

test('craftability picks the variant the player can make, and flags table-only recipes', () => {
    const have = book.countItems([{ type: B.SPRUCE_PLANKS, count: 8 }, null, { type: B.SPRUCE_PLANKS, count: 3 }]);
    assert.equal(have.get(B.SPRUCE_PLANKS), 11);
    const table = book.entryStatus(entryFor(B.CRAFTING_TABLE), have, 2);
    assert.equal(table.crafts, 2, 'eleven spruce planks make two tables');
    assert.equal(table.recipe.pattern[0], B.SPRUCE_PLANKS, 'the spruce variant, not the oak one');
    assert.equal(table.needsTable, false);

    const chest = book.entryStatus(entryFor(B.CHEST), have, 2);
    assert.equal(chest.needsTable, true, 'a chest is 3x3');
    assert.equal(chest.crafts, 0, 'so it can not be made in the inventory grid');
    assert.equal(chest.haveIngredients, true, 'though the planks are on hand');
    assert.equal(book.entryStatus(entryFor(B.CHEST), have, 3).crafts, 1, 'at a table it can');

    const nothing = book.entryStatus(entryFor(B.BREAD), new Map(), 3);
    assert.equal(nothing.crafts, 0);
    assert.equal(nothing.haveIngredients, false);
});

// Mixed materials, as Minecraft allows them: a table from two woods.
test('the book counts and fills mixed planks where the recipe allows them', () => {
    const have = book.countItems([{ type: B.OAK_PLANKS, count: 3 }, { type: B.BIRCH_PLANKS, count: 5 }]);
    const table = book.entryStatus(entryFor(B.CRAFTING_TABLE), have, 2);
    assert.equal(table.crafts, 2, 'eight planks of two woods count as eight');
    assert.equal(table.haveIngredients, true);
    // Cell by cell: each cell holds one kind, so two tables at once don't fit
    // three oak and five birch, but one does, mixing the woods.
    const layout = book.layOut(table.recipe, 2);
    assert.equal(book.assignCells(table.recipe, layout, have, 2), null);
    const one = book.assignCells(table.recipe, layout, have, 1);
    assert.equal(one.filter((cell) => cell === B.OAK_PLANKS).length + one.filter((cell) => cell === B.BIRCH_PLANKS).length, 4);
    // A wood-specific result never mixes: three oak and two birch make no slabs.
    const slabs = book.entryStatus(entryFor(B.OAK_SLAB), book.countItems([{ type: B.OAK_PLANKS, count: 2 }, { type: B.BIRCH_PLANKS, count: 1 }]), 3);
    assert.equal(slabs.crafts, 0);
    // With enough of one wood, the book shows that wood's recipe.
    const spruce = book.entryStatus(entryFor(B.CRAFTING_TABLE), book.countItems([{ type: B.SPRUCE_PLANKS, count: 4 }, { type: B.OAK_PLANKS, count: 1 }]), 2);
    assert.equal(spruce.recipe.pattern[0], B.SPRUCE_PLANKS);
});

test('a recipe lays into the grid from the top-left corner', () => {
    const stick = entryFor(B.STICK).variants[0];
    assert.deepEqual(book.layOut(stick, 2), [stick.pattern[0], null, stick.pattern[2], null]);
    const bread = entryFor(B.BREAD).variants[0];
    assert.equal(book.layOut(bread, 2), null, 'three wide does not fit a 2x2 grid');
    assert.deepEqual(book.layOut(bread, 3), [B.WHEAT, B.WHEAT, B.WHEAT, null, null, null, null, null, null]);
});

test('tabs follow the category of what a recipe makes', () => {
    assert.equal(book.tabOf(book.BLOCKS[B.OAK_STAIRS].category), 'blocks');
    assert.equal(book.tabOf(book.BLOCKS[B.IRON_PICKAXE].category), 'gear');
    assert.equal(book.tabOf(book.BLOCKS[B.BREAD].category), 'food');
    assert.equal(book.tabOf(book.BLOCKS[B.STICK].category), 'other');
});

test('the inventory shows the book and filling it moves real items', () => {
    const controller = read('src/hooks/useInventoryController.ts');
    // The grid's contents go back first, and nothing moves if they can't.
    assert.match(controller, /if \(item && addToInventoryList\(next, cloneItemStack\(item\)\)\) return false;/);
    assert.match(controller, /let crafts = Math\.min\(craftsAvailable\(recipe, held\), all \? perCell : 1\);/);
    assert.match(controller, /while \(crafts > 0 && !\(cells = assignCells\(recipe, layout, held, crafts\)\)\) crafts--;/);
    const ui = read('src/components/ui/InventoryUI.tsx');
    assert.match(ui, /<RecipeBookPanel/);
    assert.match(ui, /recipeBook && <RecipeBookButton open=\{bookOpen\} onToggle=\{toggleBook\} \/>/);
    const app = read('src/App.tsx');
    assert.match(app, /known: gameMode === 'creative' \? 'all' as const : knownItems/);
    assert.match(app, /meta\.knownItems = \[\.\.\.knownItemsRef\.current\];/);
});
