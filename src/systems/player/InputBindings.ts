export type InputAction = 'move.forward' | 'move.backward' | 'move.left' | 'move.right'
    | 'move.jump' | 'move.sneak' | 'move.sprint' | 'ability.polarity' | 'ability.toggle';

const DEFAULT_BINDINGS: Record<InputAction, string[]> = {
    'move.forward': ['KeyW', 'ArrowUp'],
    'move.backward': ['KeyS', 'ArrowDown'],
    'move.left': ['KeyA', 'ArrowLeft'],
    'move.right': ['KeyD', 'ArrowRight'],
    'move.jump': ['Space'],
    'move.sneak': ['ShiftLeft', 'ShiftRight'],
    'move.sprint': ['ControlLeft', 'ControlRight'],
    'ability.polarity': ['KeyR'],
    'ability.toggle': ['KeyN'],
};

export class InputBindings {
    private bindings = new Map<InputAction, Set<string>>();

    constructor() { this.reset(); }

    reset(): void {
        this.bindings = new Map(Object.entries(DEFAULT_BINDINGS).map(([action, keys]) => [action as InputAction, new Set(keys)]));
    }

    actionsForCode(code: string): InputAction[] {
        const actions: InputAction[] = [];
        for (const [action, keys] of this.bindings) if (keys.has(code)) actions.push(action);
        return actions;
    }

    set(action: InputAction, codes: readonly string[]): void { this.bindings.set(action, new Set(codes)); }
    get(action: InputAction): string[] { return Array.from(this.bindings.get(action) ?? []); }
    serialize(): Record<InputAction, string[]> {
        return Object.fromEntries(Array.from(this.bindings, ([action, keys]) => [action, Array.from(keys)])) as Record<InputAction, string[]>;
    }
    restore(value: unknown): void {
        this.reset();
        if (!value || typeof value !== 'object') return;
        for (const action of Object.keys(DEFAULT_BINDINGS) as InputAction[]) {
            const codes = (value as Partial<Record<InputAction, unknown>>)[action];
            if (Array.isArray(codes) && codes.every((code) => typeof code === 'string')) this.set(action, codes);
        }
    }
}

export const inputBindings = new InputBindings();
