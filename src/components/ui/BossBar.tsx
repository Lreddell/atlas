import React, { useEffect, useState } from 'react';
import { gameEvents } from '../../systems/events/GameEvents';

// Reusable boss / objective health bar. Driven entirely by the game event bus
// (boss:spawned / boss:damaged / boss:defeated) so it has no direct dependency
// on the entity or combat systems — any future boss just emits these events.

interface BossState {
    bossId: string;
    name: string;
    hp: number;
    maxHp: number;
}

export const BossBar: React.FC = () => {
    const [boss, setBoss] = useState<BossState | null>(null);

    useEffect(() => {
        const offSpawned = gameEvents.on('boss:spawned', ({ bossId, name, maxHp }) => {
            setBoss({ bossId, name, hp: maxHp, maxHp });
        });
        const offDamaged = gameEvents.on('boss:damaged', ({ bossId, hp, maxHp }) => {
            setBoss((prev) => (prev && prev.bossId === bossId ? { ...prev, hp, maxHp } : prev));
        });
        const offDefeated = gameEvents.on('boss:defeated', ({ bossId }) => {
            setBoss((prev) => (prev && prev.bossId === bossId ? null : prev));
        });
        return () => { offSpawned(); offDamaged(); offDefeated(); };
    }, []);

    if (!boss) return null;

    const pct = boss.maxHp > 0 ? Math.max(0, Math.min(1, boss.hp / boss.maxHp)) : 0;

    return (
        <div className="pointer-events-none absolute left-1/2 top-4 z-[150] flex w-[520px] -translate-x-1/2 flex-col items-center">
            <div className="mb-1 font-minecraft text-lg text-white [text-shadow:2px_2px_0px_#000]">{boss.name}</div>
            <div className="h-3 w-full border border-black/70 bg-[#2a0030]">
                <div
                    className="h-full bg-gradient-to-b from-[#ff4d4d] to-[#a80000] transition-[width] duration-200"
                    style={{ width: `${pct * 100}%` }}
                />
            </div>
        </div>
    );
};
