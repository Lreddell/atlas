import React from 'react';
import { MenuButton } from './mainMenu/MainMenuControls';
import { useDialogFocus } from '../../hooks/useDialogFocus';

// Confirmation prompt shown when right-clicking a Magnetic Boss Summoner. Warns the
// player before the fight begins; confirming spawns the boss, cancelling does
// nothing. A framed panel like the other dialogs.

interface BossConfirmModalProps {
    bossName: string;
    title?: string;
    description?: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export const BossConfirmModal: React.FC<BossConfirmModalProps> = ({
    bossName,
    title,
    description,
    confirmLabel = 'Begin Fight',
    onConfirm,
    onCancel,
}) => {
    const dialogRef = useDialogFocus<HTMLDivElement>(onCancel);
    const titleId = 'atlas-boss-confirm-title';

    return (
        <div
            className="pointer-events-auto absolute inset-0 z-[200] flex items-center justify-center bg-ink-950/70 atlas-fade-in"
            onClick={onCancel}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="atlas-panel flex w-[520px] max-w-[calc(100vw-2rem)] flex-col items-center gap-4 px-8 pb-7 pt-5 outline-none atlas-panel-in"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 id={titleId} className="atlas-title text-center">{title ?? `Summon ${bossName}?`}</h2>
                <p className="text-center text-read text-parchment-200">
                    {description ?? `The ${bossName} will awaken and attack across three forms, each shielded by its tower crystals. Same polarity repels, opposite attracts: match its color to shrug off its bolts, oppose it to climb its towers and strike. Make sure you are ready.`}
                </p>
                <div className="mt-2 grid w-full grid-cols-2 gap-3">
                    <MenuButton label={confirmLabel} onClick={onConfirm} variant="primary" width="w-full" />
                    <MenuButton label="Cancel" onClick={onCancel} width="w-full" />
                </div>
            </div>
        </div>
    );
};
