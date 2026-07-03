import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// itemTooltips.ts imports the BlockType enum, so its behavior is asserted via
// source text (repo convention for enum-touching modules).
const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const tooltips = read('src/systems/registry/itemTooltips.ts');
const inventoryUI = read('src/components/ui/InventoryUI.tsx');
const hud = read('src/components/ui/HUD.tsx');

test('tooltip stats derive from the live gameplay registries, not magic numbers', () => {
    // Attack/defense/durability come from getItemStats/getMaxDurability (the
    // combat + equipment code paths); tool class/mining power come from
    // BLOCKS (the mining code path).
    assert.match(tooltips, /import \{ getItemStats, getMaxDurability \} from '\.\/itemStats'/);
    assert.match(tooltips, /stats\?\.attack/);
    assert.match(tooltips, /def\.toolType/);
    assert.match(tooltips, /stats\?\.defense/);
    assert.match(tooltips, /stack\.instance\?\.durability \?\? maxDurability/);
    // Food line matches the eating math.
    assert.match(tooltips, /def\.nutrition \* \(def\.saturationModifier \?\? 0\) \* 2/);
    // Unbreakable special gear reads as such instead of showing nothing.
    assert.match(tooltips, /Unbreakable/);
});

test('mining power is a quantified stat from toolSpeed — no multiplier wording, no fuel line', () => {
    // "Mining power 6.0" (the raw registry toolSpeed), never "×6 speed".
    assert.match(tooltips, /Mining power \$\{def\.toolSpeed\.toFixed\(1\)\}/);
    assert.match(tooltips, /Power \$\{def\.toolSpeed\.toFixed\(1\)\}/); // hotbar summary
    assert.doesNotMatch(tooltips, /×\$\{def\.toolSpeed\}/);
    assert.doesNotMatch(tooltips, /speed`/i);
    // Fuel burn time is not a player-facing tooltip stat (furnace behavior and
    // the isFuel/fuelValue data are unchanged).
    assert.doesNotMatch(tooltips, /Fuel: burns/);
    assert.doesNotMatch(tooltips, /fuelValue/);
});

test('hoes are explicitly excluded from mining stats, with the reason documented', () => {
    // No tilling/farmland system → hoes have no toolType/toolSpeed in BLOCKS and
    // no mining line; they still show Attack + Durability via ITEM_STATS.
    assert.match(tooltips, /Hoes are deliberately absent/);
    const blocks = read('src/data/blocks.ts');
    assert.doesNotMatch(blocks, /BlockType\.WOOD_HOE\]:[^\n]*toolType/);
    assert.doesNotMatch(blocks, /BlockType\.IRON_HOE\]:[^\n]*toolType/);
    // Hoes DO have combat stats, so the tooltip still has content for them.
    const stats = read('src/systems/registry/itemStats.ts');
    assert.match(stats, /\[BlockType\.IRON_HOE\]:\s*tool\(/);
});

test('tooltips omit tier labels and purple informational descriptions', () => {
    assert.doesNotMatch(tooltips, /TIER_NAMES|Wood tier|Stone tier|Iron tier|Diamond tier/);
    assert.doesNotMatch(tooltips, /ITEM_DESCRIPTIONS|tone:\s*'info'/);
    assert.doesNotMatch(inventoryUI, /text-purple-200|bg-\[#100010\]|border-\[#2a0b4d\]/);
});

test('the inventory tooltip and hotbar name plate render the stat lines', () => {
    // Inventory hover builds from getItemTooltip for both slots and equipment.
    assert.match(inventoryUI, /getItemTooltip\(item\)/);
    assert.match(inventoryUI, /getItemTooltip\(it\)/);
    assert.match(inventoryUI, /hoverInfo\.lines\.map/);
    // Hotbar shows the compact one-line summary under the item name.
    assert.match(hud, /summarizeItemStats\(inventory\[selectedSlot\]!\)/);
});
