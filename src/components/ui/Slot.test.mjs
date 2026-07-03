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
    assert.match(slot, /const pxSize = 32/);
    assert.match(slot, /imageRendering:\s*'pixelated'/);
});

test('creative tabs render a bare icon and center fifteen-slot rows', () => {
    assert.match(inventory, /openContainer\.type === 'creative' \? 'w-\[852px\]'/);
    assert.match(inventory, /<Slot item=\{\{ type: tab\.icon, count: 1 \}\} size="small" bare \/>/);
    assert.match(inventory, /flex flex-wrap justify-center gap-1 content-start/);
    assert.doesNotMatch(inventory, /scrollbar-gutter/);
    assert.match(inventory, /b\.id !== BlockType\.DEBUG_CROSS/);
    assert.doesNotMatch(inventory, /backdrop-blur/);
});

test('hotbar stacks reproduce the five-tick Minecraft item pop', () => {
    assert.match(hud, /selected=\{selectedSlot === i\} animateChanges/);
    assert.match(slot, /previous === null \|\| \(previous\.type === current\.type && current\.count > previous\.count\)/);
    assert.match(slot, /classList\.add\('atlas-item-pop'\)/);
    assert.match(styles, /@keyframes atlas-item-pop/);
    assert.match(styles, /animation: atlas-item-pop 250ms/);
});

test('selection and durability decorations overlay without resizing the item', () => {
    assert.match(slot, /absolute -inset-1[^\n]*border-4 border-white/);
    assert.match(slot, /w-\[26px\]/);
    assert.match(slot, /Math\.round\(durabilityFrac \* 13\) \* 2/);
    assert.doesNotMatch(slot, /selected \? 'border-4/);
});
