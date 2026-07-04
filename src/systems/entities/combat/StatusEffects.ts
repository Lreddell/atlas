export interface ActiveStatusEffect {
    id: string;
    duration: number;
    amplifier: number;
    elapsed: number;
}

export interface StatusEffectContext {
    damage(amount: number): void;
    heal(amount: number): void;
}

export interface StatusEffectDefinition {
    id: string;
    interval?: number;
    tick?(effect: ActiveStatusEffect, context: StatusEffectContext): void;
}

const definitions = new Map<string, StatusEffectDefinition>();

export function registerStatusEffect(definition: StatusEffectDefinition): void {
    definitions.set(definition.id, definition);
}

export function addStatusEffect(list: ActiveStatusEffect[], id: string, duration: number, amplifier = 0): void {
    const existing = list.find((effect) => effect.id === id);
    if (existing) {
        existing.duration = Math.max(existing.duration, duration);
        existing.amplifier = Math.max(existing.amplifier, amplifier);
        return;
    }
    list.push({ id, duration, amplifier, elapsed: 0 });
}

export function tickStatusEffects(list: ActiveStatusEffect[], delta: number, context: StatusEffectContext): void {
    for (let i = list.length - 1; i >= 0; i--) {
        const effect = list[i];
        effect.duration -= delta;
        effect.elapsed += delta;
        const definition = definitions.get(effect.id);
        const interval = definition?.interval ?? Infinity;
        if (effect.elapsed >= interval) {
            effect.elapsed %= interval;
            definition?.tick?.(effect, context);
        }
        if (effect.duration <= 0) list.splice(i, 1);
    }
}

registerStatusEffect({ id: 'atlas:poison', interval: 1, tick: (effect, ctx) => ctx.damage(1 + effect.amplifier) });
registerStatusEffect({ id: 'atlas:regeneration', interval: 1, tick: (effect, ctx) => ctx.heal(1 + effect.amplifier) });
