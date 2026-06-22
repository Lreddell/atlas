import React, { useEffect, useReducer } from 'react';
import { gameEvents } from '../../systems/events/GameEvents';
import { reduceBossBarState } from './bossBarState';

// Reusable boss / objective health bar. Driven entirely by the game event bus
// (boss:spawned / boss:damaged / boss:defeated) so it has no direct dependency
// on the entity or combat systems — any future boss just emits these events.

export const BossBar: React.FC = () => {
    const [boss, dispatch] = useReducer(reduceBossBarState, null);
    // Shield crystals remaining (-1 = boss has no shield phase). The boss is
    // invulnerable until this reaches 0.
    const [shield, setShield] = React.useState<number>(-1);

    useEffect(() => {
        const offSpawned = gameEvents.on('boss:spawned', ({ bossId, entityId, name, maxHp }) => {
            dispatch({ type: 'spawned', bossId, entityId, name, maxHp });
            setShield(-1);
        });
        const offDamaged = gameEvents.on('boss:damaged', ({ bossId, entityId, hp, maxHp }) => {
            dispatch({ type: 'damaged', bossId, entityId, hp, maxHp });
        });
        const offDefeated = gameEvents.on('boss:defeated', ({ bossId, entityId }) => {
            dispatch({ type: 'defeated', bossId, entityId });
            setShield(-1);
        });
        const offCleared = gameEvents.on('boss:cleared', () => {
            dispatch({ type: 'cleared' });
            setShield(-1);
        });
        const offShield = gameEvents.on('boss:shield', ({ crystals }) => setShield(crystals));
        const offVulnerable = gameEvents.on('boss:vulnerable', () => setShield(0));
        return () => { offSpawned(); offDamaged(); offDefeated(); offCleared(); offShield(); offVulnerable(); };
    }, []);

    if (!boss) return null;

    const pct = boss.maxHp > 0 ? Math.max(0, Math.min(1, boss.hp / boss.maxHp)) : 0;

    return (
        <div className="pointer-events-none absolute left-1/2 top-4 z-[150] flex w-[520px] -translate-x-1/2 flex-col items-center">
            <div className="mb-1 font-minecraft text-lg text-white [text-shadow:2px_2px_0px_#000]">
                {boss.name} {Math.ceil(boss.hp)} / {boss.maxHp}
            </div>
            {shield > 0 && (
                <div className="mb-1 font-minecraft text-sm text-[#b388ff] [text-shadow:2px_2px_0px_#000]">
                    🛡 Shielded — break {shield} crystal{shield === 1 ? '' : 's'}
                </div>
            )}
            <div
                className="h-4 w-full overflow-hidden border border-black/80"
                style={{ background: '#1c1c22' }}
            >
                <div
                    className="h-full transition-[width] duration-150"
                    style={{
                        width: `${pct * 100}%`,
                        background: 'linear-gradient(180deg, #ff6a6a 0%, #e01010 55%, #a00000 100%)',
                    }}
                />
            </div>
        </div>
    );
};
