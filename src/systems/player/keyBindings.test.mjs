import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadTs } from '../world/storage/bundleTs.mjs';

const {
    DEFAULT_KEY_BINDINGS, KEY_ACTIONS, HOTBAR_KEY_ACTIONS,
    actionsForCode, bindingLabel, conflictsOf, isDefaultBinding, keyLabel,
    parseKeyBindings, serializeKeyBindings, withBinding, withDefaultBinding,
} = await loadTs(`export * from './src/systems/player/keyBindings';`);

const root = path.resolve(import.meta.dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the defaults are the keys the game has always used', () => {
    assert.deepEqual(DEFAULT_KEY_BINDINGS.forward, ['KeyW', 'ArrowUp']);
    assert.deepEqual(DEFAULT_KEY_BINDINGS.sneak, ['ShiftLeft', 'ShiftRight']);
    assert.deepEqual(DEFAULT_KEY_BINDINGS.sprint, ['ControlLeft', 'ControlRight']);
    assert.deepEqual(DEFAULT_KEY_BINDINGS.dodge, ['KeyC']);
    assert.deepEqual(DEFAULT_KEY_BINDINGS.flipPolarity, ['KeyR']);
    assert.deepEqual(DEFAULT_KEY_BINDINGS.inventory, ['KeyE']);
    assert.deepEqual(DEFAULT_KEY_BINDINGS.chat, ['KeyT']);
    assert.deepEqual(DEFAULT_KEY_BINDINGS.command, ['Slash']);
    assert.deepEqual(HOTBAR_KEY_ACTIONS.map((action) => DEFAULT_KEY_BINDINGS[action][0]), ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9']);
    // No two defaults share a key.
    for (const action of KEY_ACTIONS) assert.deepEqual(conflictsOf(DEFAULT_KEY_BINDINGS, action.id), [], action.id);
});

test('stored bindings keep only known actions and bindable keys, and store only changes', () => {
    const parsed = parseKeyBindings(JSON.stringify({ jump: ['KeyJ'], bogus: ['KeyB'], sneak: ['Escape', 'KeyZ'], drop: 'KeyQ' }));
    assert.deepEqual(parsed.jump, ['KeyJ']);
    assert.deepEqual(parsed.sneak, ['KeyZ'], 'Esc is never bindable');
    assert.deepEqual(parsed.drop, DEFAULT_KEY_BINDINGS.drop, 'a malformed entry keeps the default');
    assert.equal('bogus' in parsed, false);
    assert.deepEqual(parseKeyBindings('not json'), DEFAULT_KEY_BINDINGS);
    assert.equal(serializeKeyBindings(DEFAULT_KEY_BINDINGS), '{}');
    assert.deepEqual(JSON.parse(serializeKeyBindings(parsed)), { jump: ['KeyJ'], sneak: ['KeyZ'] });
});

test('binding a key replaces the action\'s keys and flags any clash', () => {
    const bound = withBinding(DEFAULT_KEY_BINDINGS, 'jump', 'KeyE');
    assert.deepEqual(bound.jump, ['KeyE']);
    assert.deepEqual(actionsForCode(bound, 'KeyE'), ['jump', 'inventory']);
    assert.deepEqual(conflictsOf(bound, 'jump'), ['inventory']);
    assert.equal(isDefaultBinding(bound, 'jump'), false);
    assert.equal(withBinding(DEFAULT_KEY_BINDINGS, 'jump', 'Escape'), DEFAULT_KEY_BINDINGS, 'Esc stays the pause key');
    assert.equal(isDefaultBinding(withDefaultBinding(bound, 'jump'), 'jump'), true);
});

test('keys are named as the player sees them', () => {
    assert.equal(keyLabel('KeyW'), 'W');
    assert.equal(keyLabel('Digit4'), '4');
    assert.equal(keyLabel('ShiftLeft'), 'Left Shift');
    assert.equal(keyLabel('Slash'), '/');
    assert.equal(keyLabel('F5'), 'F5');
    assert.equal(keyLabel('KeyW', new Map([['KeyW', 'z']])), 'Z', 'an AZERTY layout prints Z there');
    assert.equal(bindingLabel(DEFAULT_KEY_BINDINGS, 'forward'), 'W / Up');
    assert.equal(bindingLabel({ ...DEFAULT_KEY_BINDINGS, jump: [] }, 'jump'), 'None');
});

test('every keyboard shortcut reads the bindings, not a fixed key', () => {
    const input = read('src/systems/player/playerInput.ts');
    assert.match(input, /const actions = actionsForKey\(code\)/);
    assert.doesNotMatch(input, /case 'Key[A-Z]'|case 'Space'|case 'Shift/);
    const app = read('src/App.tsx');
    for (const action of ['hideHud', 'debug', 'shoulderView', 'detachedCamera', 'atlasViewer']) {
        assert.match(app, new RegExp(`hotkey\\('${action}'\\)`));
    }
    assert.match(app, /isKeyFor\('panorama', e\)/);
    assert.match(app, /isKeyFor\('drop', e\)/);
    assert.match(app, /isKeyFor\('inventory', e\)/);
    assert.match(app, /HOTBAR_KEY_ACTIONS\.findIndex\(\(action\) => isKeyFor\(action, e\)\)/);
    // A shortcut bound to a letter never fires while typing in a text field.
    assert.match(app, /const hotkey = \(action: KeyAction\) => isKeyFor\(action, e\) && \(!isEditableTarget \|\| \/\^F\\d\{1,2\}\$\/\.test\(e\.code\)\)/);
    assert.doesNotMatch(app, /e\.code === 'Key[A-Z]'|e\.code === 'F[0-9]'|e\.code\.startsWith\('Digit'\)/);
    const inventory = read('src/components/ui/InventoryUI.tsx');
    assert.doesNotMatch(inventory, /e\.code === 'KeyQ'|startsWith\('Digit'\)/);
    assert.match(read('src/systems/boss/wardenDefeat.ts'), /isKeyFor\('jump', e\)/);
});

test('the Controls screen rebinds every action and cancels on Esc', () => {
    const menu = read('src/components/ui/PauseMenu.tsx');
    assert.match(menu, /KEY_ACTIONS\.filter\(\(action\) => action\.group === group\)/);
    assert.match(menu, /if \(event\.code === 'Escape'\) \{ setListening\(null\); return; \}/);
    assert.match(menu, /keyBindingStore\.bind\(listening, event\.code\)/);
    assert.match(menu, /if \(listeningRef\.current\) return;/);
    assert.match(menu, /label="Reset All Keys"/);
});
