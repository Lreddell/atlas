import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { BlockType, type ItemStack } from '../../types';
import { resonantVaultRuntime } from '../../systems/world/ResonantVaultRuntime';
import { getVaultObjective } from '../../systems/world/resonantVaultObjectives';
import { gameEvents } from '../../systems/events/GameEvents';
import { isKeyFor } from '../../systems/player/keyBindingStore';
import { isEditableElement } from '../../utils/dom';

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
            if (isKeyFor('vaultObjective', event) && !event.repeat && !isEditableElement(event.target)) setRecall((value) => value + 1);
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
    // In the interface's own ink, like its tooltips: a quiet card.
    return (
        <div
            aria-live="polite"
            className="atlas-tooltip absolute top-12 left-1/2 -translate-x-1/2 z-40 pointer-events-none w-[calc(100vw-24px)] max-w-[360px] text-center"
        >
            <div className="text-px-2 text-parchment-50 text-shadow-md">{objective.primary}</div>
            {objective.secondary && <div className="text-read text-parchment-300">{objective.secondary}</div>}
        </div>
    );
};
