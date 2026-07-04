import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

const inventoryUI = readFileSync(new URL('./InventoryUI.tsx', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../../hooks/useInventoryController.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const dropManager = readFileSync(new URL('../DropManager.tsx', import.meta.url), 'utf8');
const chat = readFileSync(new URL('./Chat.tsx', import.meta.url), 'utf8');
const pauseMenu = readFileSync(new URL('./PauseMenu.tsx', import.meta.url), 'utf8');
const menuControls = readFileSync(new URL('./mainMenu/MainMenuControls.tsx', import.meta.url), 'utf8');
const confirmModal = readFileSync(new URL('./ConfirmModal.tsx', import.meta.url), 'utf8');
const bossConfirmModal = readFileSync(new URL('./BossConfirmModal.tsx', import.meta.url), 'utf8');
const whatsNewModal = readFileSync(new URL('./WhatsNewModal.tsx', import.meta.url), 'utf8');

test('double click is resolved before a cursor click can become a drag', () => {
    const doubleClick = inventoryUI.indexOf("dispatchSlotAction('double_click'");
    const cursorDrag = inventoryUI.indexOf('if (cursorStack) {', doubleClick);
    assert.ok(doubleClick >= 0, 'double-click gather must be dispatched');
    assert.ok(cursorDrag > doubleClick, 'double-click detection must precede cursor drag startup');
    assert.match(inventoryUI, /lastClickRef\.current\.button === 0/);
});

test('single cursor clicks, middle clicks, and result clicks have distinct paths', () => {
    assert.match(inventoryUI, /if \(e\.button === 1\)[\s\S]*dispatchSlotAction\('middle_click'/);
    assert.match(inventoryUI, /if \(collection === 'creative' \|\| collection === 'output' \|\| collection === 'furnace_output'\)/);
    assert.match(inventoryUI, /if \(!dragMovedRef\.current\)[\s\S]*mode === 'one' \? 'right_click' : 'click'/);
    assert.match(controller, /if \(action === 'middle_click'\)[\s\S]*gameMode === 'creative'/);
    assert.match(controller, /if \(collection === 'furnace_output'\)[\s\S]*updateSlot\(collection, index, null\)/);
});

test('drag targets use real stack policy and always clean up outside the window', () => {
    assert.match(inventoryUI, /canStacksMerge\(item, stack\)/);
    assert.match(inventoryUI, /getItemStackLimit\(stack\.type\)/);
    assert.doesNotMatch(inventoryUI, /item\.count >= 64/);
    // The drag must NOT capture the pointer — capture suppressed the other slots'
    // mouseenter events that the paint-drag depends on, which bounced items back
    // to the cursor. Release is handled by the window-level pointerup/cancel/blur
    // listeners instead, so drags still finish no matter where they end.
    assert.doesNotMatch(inventoryUI, /\.setPointerCapture\(/);
    assert.match(inventoryUI, /window\.addEventListener\('pointerup', onPointerUp, true\)/);
    assert.match(inventoryUI, /window\.addEventListener\('pointercancel', onPointerCancel, true\)/);
    assert.match(inventoryUI, /window\.addEventListener\('blur', onBlur\)/);
    assert.match(inventoryUI, /if \(e\.button < 0 \|\| e\.button > 2\) return/);
    assert.match(inventoryUI, /Array\.from\(dragSlotsRef\.current\)/);
});

test('result, furnace, equipment, and shift-transfer policies prevent duplication and invalid writes', () => {
    assert.match(controller, /if \(collection === 'output'\)[\s\S]*consumeCrafts\(crafts\)/);
    assert.match(controller, /syncCraftingOutput\(next\)/);
    assert.match(controller, /spawnItemDrops\(slotItem, slotItem\.count \* crafts\)/);
    assert.match(controller, /if \(collection === 'output' && slotItem\)[\s\S]*getCraftLimit\(\) <= 0/);
    assert.match(controller, /collection === 'output' \|\| collection === 'furnace_output' \|\| collection === 'creative'/);
    assert.match(controller, /if \(action === 'swap_hotbar' && data\.hotbarIdx !== undefined\)/);
    assert.match(controller, /if \(action === 'drop_key'\)[\s\S]*data\.dropAll \? max : 1/);
    assert.match(controller, /const destination = def\.smeltsInto \? 'furnace_input' : def\.isFuel \? 'furnace_fuel' : null/);
    assert.match(controller, /for \(let crafts = craftLimit; crafts > 0; crafts--\)/);
    assert.match(controller, /collection === 'equipment'/);
    assert.match(inventoryUI, /data-slot-collection="equipment"/);
});

test('closing and collecting preserve overflow instead of deleting it', () => {
    assert.match(controller, /return rem > 0 \? cloneItemStack\(item, rem\) : null/);
    assert.match(app, /const remainder = addToInventory\(stack\)/);
    assert.match(app, /drop\.id === id \? \{ \.\.\.drop, count: remainder\.count \}/);
    assert.match(app, /return remainder === null/);
    assert.match(dropManager, /if \(fullyCollected\)[\s\S]*newPos\.set\(0, -5000, 0\)/);
    assert.match(app, /if \(remainder\) dropInventoryOverflow\(remainder\)/);
});

test('overlays do not bypass active UI state or intercept hidden interactions', () => {
    assert.match(app, /!openContainer && !isPaused[\s\S]*!showCommandInput/);
    assert.match(app, /interactionsDisabled=\{!!openContainer \|\| isPaused \|\| showAtlasViewer \|\| showDeathScreen\}/);
    assert.match(chat, /msg\.clickAction && !interactionsDisabled/);
    assert.match(pauseMenu, /event\.stopImmediatePropagation\(\)[\s\S]*setScreen\('main'\)/);
    assert.match(menuControls, /disabled=\{disabled\}/);
    for (const modal of [confirmModal, bossConfirmModal, whatsNewModal]) {
        assert.match(modal, /role="dialog"/);
        assert.match(modal, /aria-modal="true"/);
        assert.match(modal, /useDialogFocus/);
    }
});
