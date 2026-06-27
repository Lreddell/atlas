import React, { useState } from 'react';

// In-app rename dialog (matches ConfirmModal styling). Renames a world's display
// name only — the world id (and its save folder) stay the same.

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
            className="pointer-events-auto fixed inset-0 z-[300] flex items-center justify-center bg-black/60"
            onClick={onCancel}
        >
            <div
                className="flex w-[420px] max-w-[calc(100vw-2rem)] flex-col items-center gap-4 border-2 border-black/80 bg-[#1c1c22] p-6 font-minecraft text-white [text-shadow:2px_2px_0px_#000]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="text-2xl text-[#b388ff]">Rename World</div>
                <input
                    autoFocus
                    value={value}
                    maxLength={64}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
                    className="w-full border-2 border-black/80 bg-black/50 px-3 py-2 text-lg text-white outline-none focus:border-[#b388ff]"
                />
                <div className="mt-2 flex gap-4">
                    <button
                        disabled={!trimmed}
                        className="border border-black/80 bg-[#7b1fa2] px-6 py-2 text-lg hover:brightness-110 disabled:opacity-40"
                        onClick={submit}
                    >
                        Save
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
};
