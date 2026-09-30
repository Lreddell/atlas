import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import * as attack from '../../systems/combat/playerAttack.ts';

// Run the actual controller's effects, input handlers and frame callback with
// an empty world. No renderer, browser, audio or persistent world is started.
const code = ts.transpileModule(readFileSync(new URL('./InteractionController.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;

function controller() {
    let cursor = 0, frame, consumed = 0;
    const hooks = [], pending = [], listeners = new Map();
    const previousWindow = globalThis.window;
    globalThis.window = {
        addEventListener: (name, fn) => listeners.set(name, fn),
        removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
    };
    const inputState = { eating: false };
    const detachedCamera = { stage: 'off' };
    const modules = {
        react: {
            useRef: value => { const index = cursor++; return hooks[index] ??= { current: value }; },
            useCallback: fn => fn,
            useEffect: (fn, deps) => {
                const index = cursor++, prior = hooks[index];
                if (!prior || deps.some((dep, i) => dep !== prior.deps[i])) {
                    pending.push(() => { prior?.cleanup?.(); hooks[index] = { deps, cleanup: fn() }; });
                }
            },
        },
        'react/jsx-runtime': { jsx: () => null },
        '@react-three/fiber': { useThree: () => ({ camera: new THREE.PerspectiveCamera() }), useFrame: fn => { frame = fn; } },
        three: THREE,
        '../../types': { BlockType: { AIR: 'air', WATER: 'water', LAVA: 'lava' } },
        '../../data/blocks': { BLOCKS: { apple: { category: 'food', nutrition: 4 }, bread: { category: 'food', nutrition: 5 } } },
        '../../systems/combat/playerAttack': attack,
        '../../systems/player/playerInput': { inputState },
        '../../systems/player/playerMotion': { motionStatus: { action: 'none' } },
        '../../systems/player/viewRig': { viewRig: { third: false }, detachedCamera },
        '../../systems/world/voxelRaycast': { voxelRaycast: () => null },
        '../../systems/combat/VaultProjectileSystem': { vaultProjectileSystem: { setDependencies() {} } },
        '../../systems/combat/vaultWeapons': { getPlayerWeaponProfile: () => null },
        '../../systems/sound/SoundManager': { soundManager: { play() {} } },
        '../../systems/player/playerFood': { eatFood() {} },
    };
    const exports = {};
    new Function('require', 'exports', code)(name => modules[name] ?? {}, exports);
    let props = {
        isLocked: false, openContainer: null, isDead: false, gameMode: 'survival', selectedSlot: 0,
        inventory: [{ type: 'apple', count: 8 }, { type: 'bread', count: 8 }],
        foodStateRef: { current: { foodLevel: 5 } }, setBreakingVisual() {},
        consumeItem: () => { consumed++; },
    };
    const render = changes => {
        props = { ...props, ...changes }; cursor = 0;
        exports.InteractionController(props);
        for (const effect of pending.splice(0)) effect();
    };
    render({}); render({ isLocked: true });
    return {
        render, inputState, detachedCamera,
        frame: dt => frame({}, dt),
        rightDown: () => listeners.get('mousedown')({ button: 2 }),
        blur: () => listeners.get('blur')(),
        consumed: () => consumed,
        dispose: () => { hooks.forEach(hook => hook?.cleanup?.()); globalThis.window = previousWindow; },
    };
}

test('interaction lockout lasts the same time at 30, 60 and 144 fps', () => {
    for (const fps of [30, 60, 144]) {
        const c = controller();
        try {
            for (let i = 0; i < Math.floor(fps * 0.1); i++) c.frame(1 / fps);
            c.rightDown(); c.frame(1 / fps);
            assert.equal(c.inputState.eating, false, `${fps} fps: lockout ended too early`);
            for (let i = 0; i < Math.ceil(fps * 0.12); i++) c.frame(1 / fps);
            c.rightDown(); c.frame(1 / fps);
            assert.equal(c.inputState.eating, true, `${fps} fps: lockout lasted too long`);
        } finally { c.dispose(); }
    }
});

test('switching food restarts the bite, including a different item in the same slot', () => {
    for (const sameSlot of [false, true]) {
        const c = controller();
        try {
            for (let i = 0; i < 20; i++) c.frame(1 / 60);
            c.rightDown();
            for (let i = 0; i < 80; i++) c.frame(1 / 60);
            c.render(sameSlot ? { inventory: [{ type: 'bread', count: 8 }] } : { selectedSlot: 1 });
            for (let i = 0; i < 30; i++) c.frame(1 / 60);
            assert.equal(c.consumed(), 0);
            for (let i = 0; i < 70; i++) c.frame(1 / 60);
            assert.equal(c.consumed(), 1);
        } finally { c.dispose(); }
    }
});

test('focus loss or disabled gameplay cancels held actions without a delayed bite', () => {
    for (const stop of ['blur', 'disabled', 'detached']) {
        const c = controller();
        try {
            for (let i = 0; i < 20; i++) c.frame(1 / 60);
            c.rightDown(); c.frame(1 / 60);
            attack.playerInteraction.leftHeld = true;
            attack.beginAttack(attack.playerAttack, 'sword', 0.5);
            if (stop === 'blur') c.blur();
            else if (stop === 'disabled') c.render({ isLocked: false });
            else c.detachedCamera.stage = 'placing';
            c.frame(1 / 60);
            assert.equal(c.inputState.eating, false);
            assert.equal(attack.playerInteraction.leftHeld, false);
            assert.equal(attack.playerAttack.cancelled, true);
            for (let i = 0; i < 120; i++) c.frame(1 / 60);
            assert.equal(c.consumed(), 0);
        } finally { c.dispose(); }
    }
});

test('a stalled frame cannot instantly finish a bite', () => {
    const c = controller();
    try {
        for (let i = 0; i < 20; i++) c.frame(1 / 60);
        c.rightDown();
        c.frame(5);
        assert.equal(c.consumed(), 0);
        assert.equal(c.inputState.eating, true);
    } finally { c.dispose(); }
});
