import React from 'react';
import { MenuButton } from './mainMenu/MainMenuControls';

// Confirmation prompt shown when right-clicking a Magnetic Boss Summoner. Warns the
// player before the fight begins; confirming spawns the boss, cancelling does
// nothing. Styled to match the menus (raised panel + MenuButton).

interface BossConfirmModalProps {
    bossName: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export const BossConfirmModal: React.FC<BossConfirmModalProps> = ({ bossName, onConfirm, onCancel }) => (
    <div
        className="pointer-events-auto absolute inset-0 z-[200] flex items-center justify-center bg-black/70"
        onClick={onCancel}
    >
        <div
            className="flex w-[440px] max-w-[calc(100vw-2rem)] flex-col items-center gap-4 border-2 border-white border-b-[#373737] border-r-[#373737] bg-[#151515] p-6 font-pixel text-white"
            onClick={(e) => e.stopPropagation()}
        >
            <h2 className="text-2xl font-bold text-white [text-shadow:1px_1px_0px_#3f3f3f]">Summon {bossName}?</h2>
            <p className="text-center text-sm leading-relaxed text-gray-300">
                The {bossName} will awaken and attack. Its shield can only be broken by
                destroying the crystals atop the arena pillars. Make sure you are ready.
            </p>
            <div className="mt-2 flex justify-center gap-3">
                <MenuButton label="Begin Fight" onClick={onConfirm} variant="primary" width="w-[160px]" />
                <MenuButton label="Cancel" onClick={onCancel} width="w-[150px]" />
            </div>
        </div>
    </div>
);
