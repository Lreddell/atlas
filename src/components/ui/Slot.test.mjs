import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

const slot = readFileSync(new URL('./Slot.tsx', import.meta.url), 'utf8');
const inventory = readFileSync(new URL('./InventoryUI.tsx', import.meta.url), 'utf8');
const hud = readFileSync(new URL('./HUD.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

test('GUI item sprites stay on a synchronous 16px integer grid', () => {
    assert.match(slot, /React\.useLayoutEffect/);
    assert.match(slot, /getAtlasCanvas\(\)/);
    assert.match(slot, /16,\s*16,\s*0,\s*0,\s*backingSize,\s*backingSize/s);
    // 2x in inventory slots, the HUD's whole-number scale in the hotbar.
    assert.match(slot, /const artScale = size === 'hotbar' \? scale : 2;/);
    assert.match(slot, /const pxSize = 16 \* artScale;/);
    assert.match(slot, /imageRendering:\s*'pixelated'/);
});

test('creative tabs render a bare icon and left-align fifteen-slot rows', () => {
    // 15 slots of 48px with 4px gaps, plus the well, its padding and scrollbar, plus the panel's own padding.
    assert.match(inventory, /openContainer\.type === 'creative' \? 'w-\[860px\]'/);
    assert.match(inventory, /<Slot item=\{\{ type: tab\.icon, count: 1 \}\} size="small" bare \/>/);
    assert.match(inventory, /flex flex-wrap gap-1 content-start/);
    assert.doesNotMatch(inventory, /flex flex-wrap justify-center/);
    assert.doesNotMatch(inventory, /scrollbar-gutter/);
    assert.match(inventory, /b\.id !== BlockType\.DEBUG_CROSS/);
    assert.doesNotMatch(inventory, /backdrop-blur/);
});

test('hotbar stacks reproduce the five-tick Minecraft item pop', () => {
    assert.match(hud, /selected=\{selectedSlot === i\}\s+animateChanges/);
    assert.match(slot, /previous === null \|\| \(previous\.type === current\.type && current\.count > previous\.count\)/);
    assert.match(slot, /classList\.add\('atlas-item-pop'\)/);
    assert.match(styles, /@keyframes atlas-item-pop/);
    assert.match(styles, /animation: atlas-item-pop 250ms/);
});

test('player inventory keeps evenly spaced equipment and crafting groups beside the grid', () => {
    // Equipment | grid | crafting in one row with equal gaps, the panel sized to
    // its contents (it used to be a fixed 1000px that the crafting group overflowed).
    assert.match(inventory, /flex items-start justify-center gap-6/);
    assert.match(inventory, /flex w-\[100px\] shrink-0 items-start gap-1/);
    assert.match(inventory, /renderEquipmentSlot\('accessory'\)/);
    assert.match(inventory, /ARMOR_EQUIPMENT_SLOTS\.map\(renderEquipmentSlot\)/);
    // The crafting group: the recipe book button, the 2x2 grid, the arrow and the output.
    assert.match(inventory, /flex w-\[256px\] shrink-0 items-center gap-1/);
    // Creative has no crafting group: a spacer the equipment's width keeps the grid centred.
    assert.match(inventory, /<div aria-hidden className="w-\[100px\] shrink-0" \/>/);
    assert.doesNotMatch(inventory, /w-\[1000px\]|scale-110/);
});

test('crafting uses the crisp pixel arrow and a normal output slot', () => {
    assert.match(inventory, /viewBox="0 0 16 13"/);
    assert.match(inventory, /shapeRendering="crispEdges"/);
    assert.match(inventory, /className="h-\[26px\] w-8 shrink-0"/);
    assert.match(inventory, /fill="#46578a"/);
    assert.match(inventory, /<CraftingArrow \/>/);
    assert.match(inventory, /renderSlot\(craftingOutput, 'output', 0\)/);
    // The furnace's cook bar is the same arrow filling in; its flame is pixel art too.
    assert.match(inventory, /<CraftingArrow progress=\{cookProgress\} \/>/);
    assert.match(inventory, /<PixelArt rows=\{FLAME_ROWS\} palette=\{FLAME_LIT\} \/>/);
    // No text glyphs or emoji standing in for art.
    assert.doesNotMatch(inventory, /&rarr;|\u2192|\u{1F525}|\u2715/u);
});

test('selection and durability decorations overlay without resizing the item', () => {
    assert.match(slot, /absolute -inset-1[^\n]*atlas-select-frame/);
    assert.match(styles, /\.atlas-select-frame \{\s*border: 4px solid;/);
    // Thirteen steps at the item's own pixel scale: 26px under a 2x item, 39px under 3x.
    assert.match(slot, /bottom: 5 \* artScale, width: 13 \* artScale, height: 2 \* artScale/);
    assert.match(slot, /Math\.round\(durabilityFrac \* 13\) \* artScale/);
    assert.doesNotMatch(slot, /selected \? 'border-4/);
});
