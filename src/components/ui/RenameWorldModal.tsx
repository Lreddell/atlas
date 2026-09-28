import React, { useState } from 'react';
import { MenuButton } from './mainMenu/MainMenuControls';

// In-app rename dialog. Renames a world's display name only, the world id (and
// its save folder) stay the same. A framed panel like the other dialogs.

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
            className="pointer-events-auto fixed inset-0 z-[300] flex items-center justify-center bg-ink-950/70 atlas-fade-in"
            onClick={onCancel}
        >
            <div
                className="atlas-panel flex w-[460px] max-w-[calc(100vw-2rem)] flex-col gap-4 px-8 pb-7 pt-5 atlas-panel-in"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="atlas-title">Rename World</h2>
                <input
                    autoFocus
                    type="text"
                    value={value}
                    maxLength={64}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
                    aria-label="World name"
                    className="atlas-input"
                />
                <div className="grid grid-cols-2 gap-3">
                    <MenuButton label="Save" onClick={submit} disabled={!trimmed} variant="primary" width="w-full" />
                    <MenuButton label="Cancel" onClick={onCancel} width="w-full" />
                </div>
            </div>
        </div>
    );
};
