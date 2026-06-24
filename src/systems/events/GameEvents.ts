// Typed game event bus.
//
// Generalizes the ad-hoc subscribe/notify pattern already used by WorldManager
// (subscribeToMessages/Drops/Particles) into a single typed emitter so systems
// can stay decoupled: e.g. "boss defeated" can notify world, music, and UI
// without any of them importing each other.
//
// Usage:
//   const off = gameEvents.on('region:cleansed', ({ regionId }) => { ... });
//   gameEvents.emit('region:cleansed', { regionId });
//   off(); // unsubscribe

export interface GameEventMap {
    'region:entered': { regionId: string };
    'region:left': { regionId: string };
    'region:cleansed': { regionId: string };
    /** A place/break was blocked because the target region is sealed. */
    'edit:denied': { x: number; y: number; z: number; regionId: string };
    'boss:spawned': { bossId: string; entityId: number; name: string; maxHp: number };
    'boss:damaged': { bossId: string; entityId: number; hp: number; maxHp: number };
    'boss:defeated': { bossId: string; entityId: number; regionId?: string };
    'boss:cleared': Record<string, never>;
    /** Magnetic Warden: shield crystal count changed (drops to 0 → vulnerable). */
    'boss:shield': { bossId: string; entityId: number; crystals: number };
    'boss:vulnerable': { bossId: string; entityId: number };
    'boss:polarity': { bossId: string; entityId: number; polarity: number };
    /** The boss launched a deflectable "parry" projectile (telegraph + sound). */
    'boss:parry': { bossId: string; entityId: number };
    /** A boss projectile was deflected back by the player (feedback + sound). */
    'boss:deflected': { bossId: string; entityId: number };
    /** Boss slam attack phase ('rise' = telegraph windup, 'impact' = shockwave). */
    'boss:slam': { bossId: string; entityId: number; phase: 'rise' | 'impact'; polarity: number };
    /** A magnetic shield crystal block was destroyed at a position in a region. */
    'crystal:broken': { x: number; y: number; z: number; regionId: string | null };
    'entity:died': { entityId: number; type: string };
    'combat:start': Record<string, never>;
    'combat:stop': Record<string, never>;
    /** A scripted camera cutscene (the boss summon) started / ended. */
    'cinematic:start': Record<string, never>;
    'cinematic:end': Record<string, never>;
    'ability:changed': { abilityId: string; active: boolean };
}

export type GameEventName = keyof GameEventMap;
export type GameEventHandler<K extends GameEventName> = (payload: GameEventMap[K]) => void;

// Internal handler type is intentionally loose; the public on/emit signatures
// enforce per-event payload types, and we cast at that boundary.
type AnyHandler = (payload: unknown) => void;

class GameEventBus {
    private handlers = new Map<GameEventName, Set<AnyHandler>>();

    /** Subscribe to an event. Returns an unsubscribe function. */
    on<K extends GameEventName>(event: K, handler: GameEventHandler<K>): () => void {
        let set = this.handlers.get(event);
        if (!set) {
            set = new Set<AnyHandler>();
            this.handlers.set(event, set);
        }
        set.add(handler as AnyHandler);
        return () => { set!.delete(handler as AnyHandler); };
    }

    /** Subscribe to an event for a single emission, then auto-unsubscribe. */
    once<K extends GameEventName>(event: K, handler: GameEventHandler<K>): () => void {
        const off = this.on(event, (payload) => {
            off();
            handler(payload);
        });
        return off;
    }

    emit<K extends GameEventName>(event: K, payload: GameEventMap[K]): void {
        const set = this.handlers.get(event);
        if (!set || set.size === 0) return;
        // Copy so handlers that unsubscribe (or emit) during dispatch don't mutate
        // the set we're iterating.
        for (const handler of Array.from(set)) {
            try {
                handler(payload);
            } catch (err) {
                console.error(`[gameEvents] handler for "${event}" threw:`, err);
            }
        }
    }

    /** Remove all handlers (used on full teardown / world unload). */
    clear(): void {
        this.handlers.clear();
    }
}

export const gameEvents = new GameEventBus();
