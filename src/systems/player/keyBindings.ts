// Rebindable keys (Options > Controls). Every action the keyboard drives, its
// default keys, and the pure helpers the input handlers and the Controls
// screen share; keyBindingStore.ts persists the player's choices.
//
// Keys are KeyboardEvent.code values (the physical key), so WASD sits under
// the same fingers on any layout. Esc and the mouse buttons stay fixed.

export type KeyAction =
    | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sneak' | 'sprint' | 'dodge'
    | 'inventory' | 'drop' | 'chat' | 'command'
    | 'hotbar1' | 'hotbar2' | 'hotbar3' | 'hotbar4' | 'hotbar5' | 'hotbar6' | 'hotbar7' | 'hotbar8' | 'hotbar9'
    | 'flipPolarity' | 'polarityPower'
    | 'freeView' | 'shoulderView' | 'detachedCamera'
    | 'hideHud' | 'debug' | 'atlasViewer' | 'panorama' | 'vaultObjective';

export interface KeyActionDef {
    id: KeyAction;
    label: string;
    group: string;
    defaults: readonly string[];
}

const HOTBAR_ACTIONS: readonly KeyActionDef[] = Array.from({ length: 9 }, (_, i) => ({
    id: `hotbar${i + 1}` as KeyAction,
    label: `Hotbar Slot ${i + 1}`,
    group: 'Inventory',
    defaults: [`Digit${i + 1}`],
}));

export const KEY_ACTIONS: readonly KeyActionDef[] = [
    { id: 'forward', label: 'Walk Forward', group: 'Movement', defaults: ['KeyW', 'ArrowUp'] },
    { id: 'back', label: 'Walk Back', group: 'Movement', defaults: ['KeyS', 'ArrowDown'] },
    { id: 'left', label: 'Strafe Left', group: 'Movement', defaults: ['KeyA', 'ArrowLeft'] },
    { id: 'right', label: 'Strafe Right', group: 'Movement', defaults: ['KeyD', 'ArrowRight'] },
    { id: 'jump', label: 'Jump', group: 'Movement', defaults: ['Space'] },
    { id: 'sneak', label: 'Sneak', group: 'Movement', defaults: ['ShiftLeft', 'ShiftRight'] },
    { id: 'sprint', label: 'Sprint', group: 'Movement', defaults: ['ControlLeft', 'ControlRight'] },
    { id: 'dodge', label: 'Dodge / Magnetic Dash', group: 'Movement', defaults: ['KeyC'] },
    { id: 'inventory', label: 'Inventory', group: 'Inventory', defaults: ['KeyE'] },
    { id: 'drop', label: 'Drop Item', group: 'Inventory', defaults: ['KeyQ'] },
    ...HOTBAR_ACTIONS,
    { id: 'flipPolarity', label: 'Flip Polarity', group: 'Polarity Boots', defaults: ['KeyR'] },
    { id: 'polarityPower', label: 'Polarity Power', group: 'Polarity Boots', defaults: ['KeyN'] },
    { id: 'freeView', label: 'Free Third Person', group: 'Camera', defaults: ['F5'] },
    { id: 'shoulderView', label: 'Over-the-Shoulder', group: 'Camera', defaults: ['F6'] },
    { id: 'detachedCamera', label: 'Detached Camera', group: 'Camera', defaults: ['F7'] },
    { id: 'chat', label: 'Open Chat', group: 'Interface', defaults: ['KeyT'] },
    { id: 'command', label: 'Open Command', group: 'Interface', defaults: ['Slash'] },
    { id: 'vaultObjective', label: 'Vault Objective', group: 'Interface', defaults: ['KeyO'] },
    { id: 'hideHud', label: 'Hide HUD', group: 'Interface', defaults: ['F1'] },
    { id: 'debug', label: 'Debug Screen', group: 'Interface', defaults: ['F3'] },
    { id: 'atlasViewer', label: 'Texture Atlas', group: 'Interface', defaults: ['F4'] },
    { id: 'panorama', label: 'Capture Panorama', group: 'Interface', defaults: ['F8'] },
];

export const KEY_ACTION_GROUPS: readonly string[] = ['Movement', 'Inventory', 'Polarity Boots', 'Camera', 'Interface'];

/** What the mouse and Esc do; listed on the Controls screen but not rebindable. */
export const FIXED_BINDINGS: readonly (readonly [keys: string, action: string])[] = [
    ['Left Click', 'Break / attack'],
    ['Right Click', 'Place / use / eat / board'],
    ['Middle Click', 'Pick the block you are looking at'],
    ['Mouse Wheel', 'Choose a hotbar slot'],
    ['Esc', 'Pause / back'],
];

/** The nine hotbar-slot actions, slot 1 first. */
export const HOTBAR_KEY_ACTIONS: readonly KeyAction[] = HOTBAR_ACTIONS.map((action) => action.id);

export type KeyBindings = Readonly<Record<KeyAction, readonly string[]>>;

const ACTION_IDS = new Set<string>(KEY_ACTIONS.map((action) => action.id));

export const DEFAULT_KEY_BINDINGS: KeyBindings = Object.fromEntries(
    KEY_ACTIONS.map((action) => [action.id, action.defaults]),
) as KeyBindings;

/** Keys that can never be bound: Esc always pauses, and the rest belong to the system. */
export const UNBINDABLE_CODES: ReadonlySet<string> = new Set([
    'Escape', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'ContextMenu', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'Unidentified', '',
]);

const isBindableCode = (code: unknown): code is string =>
    typeof code === 'string' && code.length > 0 && code.length <= 32 && !UNBINDABLE_CODES.has(code);

/** Reads stored bindings: each known action takes its stored keys, or its defaults. */
export function parseKeyBindings(raw: string | null): KeyBindings {
    const bindings: Record<string, readonly string[]> = { ...DEFAULT_KEY_BINDINGS };
    if (!raw) return bindings as KeyBindings;
    try {
        const stored = JSON.parse(raw) as Record<string, unknown> | null;
        if (!stored || typeof stored !== 'object') return bindings as KeyBindings;
        for (const [action, codes] of Object.entries(stored)) {
            if (!ACTION_IDS.has(action) || !Array.isArray(codes)) continue;
            bindings[action] = codes.filter(isBindableCode).slice(0, 2);
        }
    } catch {
        // Malformed: keep the defaults.
    }
    return bindings as KeyBindings;
}

/** What to store: only the actions that differ from their defaults. */
export function serializeKeyBindings(bindings: KeyBindings): string {
    const changed: Record<string, readonly string[]> = {};
    for (const action of KEY_ACTIONS) {
        if (!isDefaultBinding(bindings, action.id)) changed[action.id] = bindings[action.id];
    }
    return JSON.stringify(changed);
}

/** The action bound to exactly this key (a pressed key replaces the action's keys). */
export function withBinding(bindings: KeyBindings, action: KeyAction, code: string): KeyBindings {
    if (!isBindableCode(code)) return bindings;
    return { ...bindings, [action]: [code] };
}

export function withDefaultBinding(bindings: KeyBindings, action: KeyAction): KeyBindings {
    return { ...bindings, [action]: DEFAULT_KEY_BINDINGS[action] };
}

export function isDefaultBinding(bindings: KeyBindings, action: KeyAction): boolean {
    const current = bindings[action];
    const defaults = DEFAULT_KEY_BINDINGS[action];
    return current.length === defaults.length && current.every((code, i) => code === defaults[i]);
}

/** Every action a key drives (more than one when the player bound it twice). */
export function actionsForCode(bindings: KeyBindings, code: string): KeyAction[] {
    const out: KeyAction[] = [];
    for (const action of KEY_ACTIONS) {
        if (bindings[action.id].includes(code)) out.push(action.id);
    }
    return out;
}

/** Other actions sharing any of this action's keys. */
export function conflictsOf(bindings: KeyBindings, action: KeyAction): KeyAction[] {
    const codes = bindings[action];
    if (codes.length === 0) return [];
    return KEY_ACTIONS
        .filter((other) => other.id !== action && bindings[other.id].some((code) => codes.includes(code)))
        .map((other) => other.id);
}

export function keyActionLabel(action: KeyAction): string {
    return KEY_ACTIONS.find((entry) => entry.id === action)?.label ?? action;
}

const NAMED_CODES: Readonly<Record<string, string>> = {
    Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
    Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
    AltLeft: 'Left Alt', AltRight: 'Right Alt',
    Slash: '/', Backslash: '\\', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', IntlBackslash: '\\',
    NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /',
    NumpadDecimal: 'Num .', NumpadEnter: 'Num Enter',
};

/**
 * A key's name as the player sees it. `layout` maps codes to the characters
 * the player's keyboard layout prints on them (navigator.keyboard), so an
 * AZERTY player sees "Z" where QWERTY players see "W".
 */
export function keyLabel(code: string, layout?: ReadonlyMap<string, string> | null): string {
    const printed = layout?.get(code);
    if (printed && printed.trim().length === 1 && /^(Key|Digit|Backquote|Minus|Equal|Bracket|Semicolon|Quote|Comma|Period|Slash|Backslash|IntlBackslash)/.test(code)) {
        return printed.toUpperCase();
    }
    if (NAMED_CODES[code]) return NAMED_CODES[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`;
    if (/^F[0-9]{1,2}$/.test(code)) return code;
    return code;
}

/** An action's keys as a short label, e.g. "W / Up"; "None" when unbound. */
export function bindingLabel(bindings: KeyBindings, action: KeyAction, layout?: ReadonlyMap<string, string> | null): string {
    const codes = bindings[action];
    if (codes.length === 0) return 'None';
    return codes.map((code) => keyLabel(code, layout)).join(' / ');
}
