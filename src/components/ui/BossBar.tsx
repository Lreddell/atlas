import React, { useEffect, useReducer } from 'react';
import { gameEvents } from '../../systems/events/GameEvents';
import { reduceBossBarState } from './bossBarState';

// Reusable boss / objective health bar. Driven entirely by the game event bus
// (boss:spawned / boss:damaged / boss:defeated) so it has no direct dependency
// on the entity or combat systems — any future boss just emits these events.

export const BossBar: React.FC = () => {
    const [boss, dispatch] = useReducer(reduceBossBarState, null);

    useEffect(() => {
        const offSpawned = gameEvents.on('boss:spawned', ({ bossId, entityId, name, maxHp }) => {
            dispatch({ type: 'spawned', bossId, entityId, name, maxHp });
        });
        const offDamaged = gameEvents.on('boss:damaged', ({ bossId, entityId, hp, maxHp }) => {
            dispatch({ type: 'damaged', bossId, entityId, hp, maxHp });
        });
        const offDefeated = gameEvents.on('boss:defeated', ({ bossId, entityId }) => {
            dispatch({ type: 'defeated', bossId, entityId });
        });
        const offCleared = gameEvents.on('boss:cleared', () => {
            dispatch({ type: 'cleared' });
        });
        return () => { offSpawned(); offDamaged(); offDefeated(); offCleared(); };
    }, []);

    if (!boss) return null;

    const pct = boss.maxHp > 0 ? Math.max(0, Math.min(1, boss.hp / boss.maxHp)) : 0;

    return (
        <div className="pointer-events-none absolute left-1/2 top-4 z-[150] flex w-[520px] -translate-x-1/2 flex-col items-center">
            <div className="mb-1 font-minecraft text-lg text-white [text-shadow:2px_2px_0px_#000]">
                {boss.name} {Math.ceil(boss.hp)} / {boss.maxHp}
            </div>
            <div className="h-3 w-full border border-black/70 bg-[#2a0030]">
                <div
                    className="h-full bg-gradient-to-b from-[#ff4d4d] to-[#a80000] transition-[width] duration-200"
                    style={{ width: `${pct * 100}%` }}
                />
            </div>
        </div>
    );
};
