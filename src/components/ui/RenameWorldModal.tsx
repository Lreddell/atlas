import React, { useState } from 'react';
import { MenuButton } from './mainMenu/MainMenuControls';

// In-app rename dialog. Renames a world's display name only — the world id (and
// its save folder) stay the same. Styled to match the menus (raised panel +
// MenuButton), like WhatsNewModal.

interface RenameWorldModalProps {
    currentName: string;
    onConfirm: (name: string) => void;
    onCancel: () => void;
}

export const RenameWorldModal: React.FC<RenameWorldModalProps> = ({ currentName, onConfirm, onCancel }) => {
    const [value, setValue] = useState(currentName);
    const trimmed = value.trim();
    const submit = () => { if (trimmed) onConfirm(trimmed); };

    return (
        <div
            className="pointer-events-auto fixed inset-0 z-[300] flex items-center justify-center bg-black/70"
            onClick={onCancel}
        >
            <div
                className="flex w-[420px] max-w-[calc(100vw-2rem)] flex-col gap-4 border-2 border-white border-b-[#373737] border-r-[#373737] bg-[#151515] p-6 font-pixel text-white"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-2xl font-bold text-white [text-shadow:1px_1px_0px_#3f3f3f]">Rename World</h2>
                <input
                    autoFocus
                    type="text"
                    value={value}
                    maxLength={64}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
                    className="h-10 w-full border-2 border-[#333] bg-black px-3 font-pixel text-white outline-none focus:border-blue-500"
                />
                <div className="flex justify-center gap-3">
                    <MenuButton label="Save" onClick={submit} disabled={!trimmed} variant="primary" width="w-[150px]" />
                    <MenuButton label="Cancel" onClick={onCancel} width="w-[150px]" />
                </div>
            </div>
        </div>
    );
};
