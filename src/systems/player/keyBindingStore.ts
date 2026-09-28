import { useSyncExternalStore } from 'react';
import {
    DEFAULT_KEY_BINDINGS, actionsForCode, bindingLabel, isDefaultBinding, parseKeyBindings, serializeKeyBindings,
    withBinding, withDefaultBinding, type KeyAction, type KeyBindings,
} from './keyBindings';

// The player's key bindings, read by every input handler on each key event and
// by the Controls screen and HUD hints. Same external-store pattern as
// controlStore.ts.

export const KEY_BINDINGS_KEY = 'atlas.settings.keybinds.v1';

interface KeyBindingSnapshot {
    bindings: KeyBindings;
    /** Codes -> the characters the player's layout prints on them, once known. */
    layout: ReadonlyMap<string, string> | null;
}

const read = (): string | null => {
    try { return window.localStorage.getItem(KEY_BINDINGS_KEY); } catch { return null; }
};

const write = (bindings: KeyBindings): void => {
    try { window.localStorage.setItem(KEY_BINDINGS_KEY, serializeKeyBindings(bindings)); } catch { /* storage full or blocked: keep the in-memory bindings */ }
};

let snapshot: KeyBindingSnapshot | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function current(): KeyBindingSnapshot {
    if (!snapshot) {
        snapshot = { bindings: parseKeyBindings(read()), layout: null };
        // Chromium (and so Electron) can name keys as the player's layout prints them.
        const keyboard = typeof navigator !== 'undefined'
            ? (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> } }).keyboard
            : undefined;
        keyboard?.getLayoutMap?.().then((layout) => {
            snapshot = { ...current(), layout };
            notify();
        }).catch(() => { /* labels fall back to QWERTY names */ });
    }
    return snapshot;
}

export function getKeyBindings(): KeyBindings {
    return current().bindings;
}

/** Whether a key event is one of this action's keys. */
export function isKeyFor(action: KeyAction, event: { code: string; key?: string }): boolean {
    const codes = current().bindings[action];
    if (codes.includes(event.code)) return true;
    // "/" opens commands wherever the layout puts it, as long as the binding is the default.
    return action === 'command' && event.key === '/' && isDefaultBinding(current().bindings, 'command');
}

/** Every action a key drives. */
export function actionsForKey(code: string): KeyAction[] {
    return actionsForCode(current().bindings, code);
}

/** The key(s) an action is bound to, as the player sees them ("R", "Left Shift"). */
export function keyLabelFor(action: KeyAction): string {
    const { bindings, layout } = current();
    return bindingLabel(bindings, action, layout);
}

export const keyBindingStore = {
    bind(action: KeyAction, code: string): void {
        const next = withBinding(current().bindings, action, code);
        snapshot = { ...current(), bindings: next };
        write(next);
        notify();
    },
    reset(action: KeyAction): void {
        const next = withDefaultBinding(current().bindings, action);
        snapshot = { ...current(), bindings: next };
        write(next);
        notify();
    },
    resetAll(): void {
        snapshot = { ...current(), bindings: DEFAULT_KEY_BINDINGS };
        write(DEFAULT_KEY_BINDINGS);
        notify();
    },
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
};

export function useKeyBindings(): KeyBindingSnapshot {
    return useSyncExternalStore(keyBindingStore.subscribe, current, current);
}

/** Re-renders when bindings change; returns the action's current key label. */
export function useKeyLabel(action: KeyAction): string {
    const { bindings, layout } = useKeyBindings();
    return bindingLabel(bindings, action, layout);
}
