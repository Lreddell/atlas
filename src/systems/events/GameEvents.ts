// Typed game event bus.
//
// Generalizes the ad-hoc subscribe/notify pattern already used by WorldManager
// (subscribeToMessages/Drops/Particles) into a single typed emitter so systems
// can stay decoupled.

import type { VaultRoutePoint } from '../world/resonantVaults';
import type { BellTitanAction } from '../entities/BellTitanEncounterCore';
import type { VaultEnemyActionId, VaultEnemyKind } from '../entities/resonantVaultEnemies';
import type { VaultEscapeRoute } from '../world/resonantVaultEscapes';

export type ResonantEchoKind = 'route' | 'pattern' | 'crossing';

export interface GameEventMap {
    'region:entered': { regionId: string };
    'region:left': { regionId: string };
    'region:cleansed': { regionId: string };
    'edit:denied': { x: number; y: number; z: number; regionId: string };
    'boss:spawned': { bossId: string; entityId: number; name: string; maxHp: number };
    'boss:damaged': { bossId: string; entityId: number; hp: number; maxHp: number };
    'boss:defeated': { bossId: string; entityId: number; regionId?: string };
    'boss:cleared': Record<string, never>;
    /** Shield layers standing for the boss bar, as a fraction of the form's crystals. */
    'boss:shield': { bossId: string; entityId: number; crystals: number };
    'boss:vulnerable': { bossId: string; entityId: number };
    'boss:polarity': { bossId: string; entityId: number; polarity: number };
    'boss:slam': { bossId: string; entityId: number; phase: 'rise' | 'impact'; polarity: number };
    'boss:phase': { bossId: string; entityId: number; phase: number };
    // --- Magnetic Warden (three forms) ---
    'boss:form': { bossId: string; entityId: number; form: 1 | 2 | 3; name: string };
    'boss:action': {
        bossId: string;
        entityId: number;
        action: string;
        phase: 'anticipation' | 'active' | 'recovery';
        durationSeconds: number;
    };
    /** Tower crystals ignite for a form (their towers light up in the Warden's polarity) or are consumed. */
    'boss:crystals': { bossId: string; entityId: number; mode: 'ignite' | 'consume'; crystals: number[]; polarity: number };
    /** A crystal fell; `remaining` layers still hold the shield. */
    'boss:crystal-lost': { bossId: string; entityId: number; crystal: number; remaining: number };
    /** The last crystal of the form fell: the shield is down and the Warden reels. */
    'boss:shield-broken': { bossId: string; entityId: number; crystal: number };
    /**
     * The ignited towers are about to flip with the Warden ('flux': the window
     * in which a climber may flip to hold on, closing at `until` on the fight
     * clock) or just did ('flipped').
     */
    'boss:towers': { bossId: string; entityId: number; towers: number[]; polarity: number; phase: 'flux' | 'flipped'; until: number };
    'boss:charge': { bossId: string; entityId: number; phase: 'windup' | 'lunge' | 'hit' };
    'boss:beat': { bossId: string; entityId: number; polarity: number; double: boolean; second: boolean };
    'boss:beat-tick': { bossId: string; entityId: number; remaining: number; nextPolarity: number };
    /** A same-polarity strike bounced off the boss (the player is shoved back). */
    'boss:repelled': { bossId: string; entityId: number };
    /** A boss bolt bounced off the player's matching polarity. */
    'bolt:repelled': { x: number; y: number; z: number; polarity: number };
    'crystal:broken': { x: number; y: number; z: number; regionId: string | null };
    // --- The player's kit ---
    /** F resolved into a move. */
    'player:dodge': { kind: 'roll' | 'dash' | 'leap' | 'jump-off'; x: number; y: number; z: number };
    /** A hit passed through an invulnerability window. */
    'player:dodged': { source: 'bolt' | 'ring' | 'contact' | 'attack' };
    /** A magnetic dash arrived at the boss: the next strike is a Magnet Slam. */
    'player:surge': { armed: boolean };
    /** A Magnet Slam landed (or bounced). */
    'player:slam': { x: number; y: number; z: number; polarity: number; landed: boolean; punish: boolean };
    /** A tower settled against the climber's polarity and threw them clear. */
    'player:shocked': { x: number; y: number; z: number };
    /** The player took damage (any source). */
    'player:damaged': { amount: number };
    'view:changed': { mode: 'first' | 'third' };
    'entity:died': { entityId: number; type: string; x: number; y: number; z: number; yaw: number };
    'combat:start': Record<string, never>;
    'combat:stop': Record<string, never>;
    'cinematic:start': { source?: 'magnetic_warden' | 'bell_titan' };
    'cinematic:end': {
        source?: 'magnetic_warden' | 'bell_titan';
        returnPosition?: { x: number; y: number; z: number };
        returnPitch?: number;
        returnYaw?: number;
    };
    'ability:changed': { abilityId: string; active: boolean };

    'vault:discovered': { vaultId: string; x: number; y: number; z: number };
    'vault:entered': { vaultId: string };
    'vault:left': { vaultId: string };
    'vault:room-solved': { vaultId: string; roomId: string };
    'vault:unsealed': { vaultId: string };
    'vault:memory-input': { vaultId: string; symbol: number; progress: number; correct: boolean; x: number; y: number; z: number };
    'vault:phase-changed': { vaultId: string; solid: boolean; cycle: number };
    'vault:encounter-started': {
        vaultId: string;
        room: string;
        entityIds: number[];
        roomId?: string;
        roomKind?: string;
        wave?: number;
        totalWaves?: number;
    };
    'vault:encounter-progress': {
        vaultId: string;
        roomId: string;
        roomKind: string;
        wave: number;
        totalWaves: number;
        remaining: number;
    };
    'vault:encounter-cleared': { vaultId: string; roomId: string; roomKind: string };
    'vault:enemy-action': {
        vaultId: string;
        entityId: number;
        kind: VaultEnemyKind;
        action: VaultEnemyActionId;
        phase: 'anticipation' | 'active' | 'recovery';
        x: number;
        y: number;
        z: number;
    };
    'vault:enemy-footstep': {
        vaultId: string;
        entityId: number;
        kind: VaultEnemyKind;
        step: number;
        x: number;
        y: number;
        z: number;
    };
    'vault:enemy-landed': {
        vaultId: string;
        entityId: number;
        kind: VaultEnemyKind;
        x: number;
        y: number;
        z: number;
    };
    'vault:encounter-completed': {
        vaultId: string;
        room: 'combat' | 'arena';
        roomId?: string;
        roomKind?: string;
    };
    'vault:titan-confirm-request': { vaultId: string; x: number; y: number; z: number };
    'vault:titan-confirmed': { vaultId: string };
    'vault:titan-awakened': { vaultId: string; entityId: number };
    'vault:titan-action': { vaultId: string; entityId: number; action: BellTitanAction; durationSeconds: number };
    'vault:titan-strike': {
        vaultId: string;
        entityId: number;
        attack: 'sweep' | 'advance' | 'hammer_combo' | 'chain_lash' | 'slam' | 'double_toll'
            | 'bell_storm' | 'vaultbreaker' | 'resonance_cage' | 'phase_burst';
        index?: number;
    };
    'vault:titan-core': { vaultId: string; entityId: number; open: boolean; durationSeconds: number };
    'vault:titan-shell-broken': { vaultId: string; entityId: number; stage: 1 | 2 };
    'vault:titan-hurt': { vaultId: string; entityId: number; hitZone: 'core'; damage: number };
    'vault:titan-deflected': { vaultId: string; entityId: number; damage: number };
    'vault:titan-defeated': { vaultId: string; entityId: number };
    'vault:core-claimed': { vaultId: string; firstClear: boolean };
    'vault:escape-started': { vaultId: string; durationSeconds: number };
    'vault:escape-route-chosen': { vaultId: string; route: VaultEscapeRoute; closedRoute: VaultEscapeRoute };
    'vault:escape-checkpoint': { vaultId: string; route: VaultEscapeRoute; checkpointId: string };
    'vault:escape-tick': { vaultId: string; remainingSeconds: number; hazardTier: 0 | 1 | 2 | 3 };
    'vault:escape-completed': { vaultId: string; exit: VaultEscapeRoute };
    'vault:resonance-pulse': { x: number; y: number; z: number; radius: number; source: 'echo_tuning_fork' };
    'vault:listening-stone-activated': { vaultId: string; x: number; y: number; z: number };
    'vault:echo-preview': {
        vaultId: string;
        kind: ResonantEchoKind;
        cells: VaultRoutePoint[];
        resolvesAt: number;
        stepDurationMs: number;
        pass: 1 | 2;
    };
    'vault:echo-step': {
        vaultId: string;
        symbol: number;
        index: number;
        pass: 1 | 2;
        x: number;
        y: number;
        z: number;
        floorY: number;
        durationMs: number;
        next?: VaultRoutePoint;
    };
    'vault:echo-resolved': { vaultId: string; kind: ResonantEchoKind; cells: VaultRoutePoint[] };
}

export type GameEventName = keyof GameEventMap;
export type GameEventHandler<K extends GameEventName> = (payload: GameEventMap[K]) => void;
type AnyHandler = (payload: unknown) => void;

export class GameEventBus {
    private handlers = new Map<GameEventName, Set<AnyHandler>>();

    on<K extends GameEventName>(event: K, handler: GameEventHandler<K>): () => void {
        let set = this.handlers.get(event);
        if (!set) {
            set = new Set<AnyHandler>();
            this.handlers.set(event, set);
        }
        set.add(handler as AnyHandler);
        return () => { set!.delete(handler as AnyHandler); };
    }

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
        for (const handler of Array.from(set)) {
            try {
                handler(payload);
            } catch (err) {
                console.error(`[gameEvents] handler for "${event}" threw:`, err);
            }
        }
    }

    clear(): void {
        this.handlers.clear();
    }
}

export const gameEvents = new GameEventBus();
