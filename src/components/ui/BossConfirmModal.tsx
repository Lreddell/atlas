import React from 'react';

// Confirmation prompt shown when right-clicking a Magnetic Boss Summoner. Warns the
// player before the fight begins; confirming spawns the boss, cancelling does nothing.

interface BossConfirmModalProps {
    bossName: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export const BossConfirmModal: React.FC<BossConfirmModalProps> = ({ bossName, onConfirm, onCancel }) => (
    <div
        className="pointer-events-auto absolute inset-0 z-[200] flex items-center justify-center bg-black/60"
        onClick={onCancel}
    >
        <div
            className="flex w-[420px] flex-col items-center gap-4 border-2 border-black/80 bg-[#1c1c22] p-6 font-minecraft text-white [text-shadow:2px_2px_0px_#000]"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="text-2xl text-[#b388ff]">Summon {bossName}?</div>
            <p className="text-center text-sm leading-relaxed text-gray-300">
                The {bossName} will awaken and attack. Its shield can only be broken by
                destroying the crystals atop the arena pillars. Make sure you are ready.
            </p>
            <div className="mt-2 flex gap-4">
                <button
                    className="border border-black/80 bg-[#7b1fa2] px-6 py-2 text-lg hover:brightness-110"
                    onClick={onConfirm}
                >
                    Begin Fight
                </button>
                <button
                    className="border border-black/80 bg-[#3a3a44] px-6 py-2 text-lg hover:brightness-110"
                    onClick={onCancel}
                >
                    Cancel
                </button>
            </div>
        </div>
    </div>
);
