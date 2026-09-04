import React from 'react';
import { MenuButton } from './mainMenu/MainMenuControls';
import { useDialogFocus } from '../../hooks/useDialogFocus';

// Confirmation prompt shown when right-clicking a Magnetic Boss Summoner. Warns the
// player before the fight begins; confirming spawns the boss, cancelling does
// nothing. Styled to match the menus (raised panel + MenuButton).

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
            className="pointer-events-auto absolute inset-0 z-[200] flex items-center justify-center bg-black/70"
            onClick={onCancel}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="flex w-[440px] max-w-[calc(100vw-2rem)] flex-col items-center gap-4 border-2 border-white border-b-[#373737] border-r-[#373737] bg-[#151515] p-6 font-pixel text-white outline-none"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 id={titleId} className="text-2xl font-bold text-white [text-shadow:1px_1px_0px_#3f3f3f]">{title ?? `Summon ${bossName}?`}</h2>
                <p className="text-center text-sm leading-relaxed text-gray-300">
                    {description ?? `The ${bossName} will awaken and attack across three forms. Same polarity repels, opposite attracts: match its colour to shrug off its bolts, oppose it to strike. Make sure you are ready.`}
                </p>
                <div className="mt-2 flex justify-center gap-3">
                    <MenuButton label={confirmLabel} onClick={onConfirm} variant="primary" width="w-[160px]" />
                    <MenuButton label="Cancel" onClick={onCancel} width="w-[150px]" />
                </div>
            </div>
        </div>
    );
};
