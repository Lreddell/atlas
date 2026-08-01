import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { BlockType, type ItemStack } from '../../types';
import { resonantVaultRuntime } from '../../systems/world/ResonantVaultRuntime';
import { getVaultObjective } from '../../systems/world/resonantVaultObjectives';
import { gameEvents } from '../../systems/events/GameEvents';

const ENVIRONMENT_ONLY_DISPLAY_MS = 4000;

export const ResonantObjectiveHUD: React.FC<{ inventory: (ItemStack | null)[] }> = ({ inventory }) => {
    const snapshot = useSyncExternalStore(resonantVaultRuntime.subscribe, resonantVaultRuntime.getSnapshot);
    const hasTuningFork = inventory.some((item) => item?.type === BlockType.ECHO_TUNING_FORK);
    const [completionNotice, setCompletionNotice] = useState<{ vaultId: string; serial: number } | null>(null);
    const baseObjective = snapshot.vaultId ? getVaultObjective({ ...snapshot, hasTuningFork }) : null;
    const objective = completionNotice?.vaultId === snapshot.vaultId
        ? {
            key: `complete:${completionNotice.serial}:${snapshot.requiredCompleted}`,
            primary: 'Chamber complete',
            secondary: `${snapshot.requiredCompleted} / ${snapshot.requiredTotal} complete`,
            persistent: true as const,
        }
        : baseObjective;
    const objectiveKey = objective?.key;
    const objectivePersistent = objective?.persistent === true;
    const hasObjective = objective !== null;
    const [visible, setVisible] = useState(true);
    const [recall, setRecall] = useState(0);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.code === 'KeyO' && !event.repeat) setRecall((value) => value + 1);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    useEffect(() => gameEvents.on('vault:room-solved', ({ vaultId }) => {
        setCompletionNotice({ vaultId, serial: Date.now() });
    }), []);

    useEffect(() => {
        if (!completionNotice) return;
        const timeout = window.setTimeout(() => setCompletionNotice(null), 2800);
        return () => window.clearTimeout(timeout);
    }, [completionNotice]);

    useEffect(() => {
        if (!hasObjective) {
            setVisible(false);
            return;
        }
        setVisible(true);
        if (objectivePersistent) return;
        const timeout = window.setTimeout(() => setVisible(false), ENVIRONMENT_ONLY_DISPLAY_MS);
        return () => window.clearTimeout(timeout);
    }, [hasObjective, objectiveKey, objectivePersistent, recall]);

    if (!objective || !visible) return null;
    return (
        <div
            aria-live="polite"
            className="absolute top-12 left-1/2 -translate-x-1/2 z-40 pointer-events-none w-[calc(100vw-24px)] max-w-[360px] bg-black/65 border border-stone-500/45 px-3 py-1.5 font-pixel text-sm text-shadow-sm text-center shadow-md"
        >
            <div className="text-white leading-5">{objective.primary}</div>
            {objective.secondary && <div className="text-gray-300 leading-4">{objective.secondary}</div>}
        </div>
    );
};
