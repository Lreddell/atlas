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
    // combat + equipment code paths); tool class/tier/speed come from BLOCKS
    // (the mining code path).
    assert.match(tooltips, /import \{ getItemStats, getMaxDurability \} from '\.\/itemStats'/);
    assert.match(tooltips, /stats\?\.attack/);
    assert.match(tooltips, /def\.toolType/);
    assert.match(tooltips, /def\.toolSpeed/);
    assert.match(tooltips, /stats\?\.defense/);
    assert.match(tooltips, /stack\.instance\?\.durability \?\? maxDurability/);
    // Food + fuel lines match the eating/furnace math.
    assert.match(tooltips, /def\.nutrition \* \(def\.saturationModifier \?\? 0\) \* 2/);
    assert.match(tooltips, /def\.fuelValue \/ 1000/);
    // Unbreakable special gear reads as such instead of showing nothing.
    assert.match(tooltips, /Unbreakable/);
});

test('special gear carries how-to descriptions (polarity boots, boat, upgrade)', () => {
    for (const key of [
        'POLARITY_BOOTS', 'UPGRADED_POLARITY_BOOTS', 'POLARITY_BOOTS_UPGRADE',
        'BOAT', 'POSITIVE_MAGNET', 'NEGATIVE_MAGNET', 'MAGNETIC_SPIKE',
        'MAGNETIC_BOSS_SUMMONER',
    ]) {
        assert.match(tooltips, new RegExp(`\\[BlockType\\.${key}\\]:`), `${key} needs a description`);
    }
});

test('the inventory tooltip and hotbar name plate render the stat lines', () => {
    // Inventory hover builds from getItemTooltip for both slots and equipment.
    assert.match(inventoryUI, /getItemTooltip\(item\)/);
    assert.match(inventoryUI, /getItemTooltip\(it\)/);
    assert.match(inventoryUI, /hoverInfo\.lines\.map/);
    // Hotbar shows the compact one-line summary under the item name.
    assert.match(hud, /summarizeItemStats\(inventory\[selectedSlot\]!\)/);
});
