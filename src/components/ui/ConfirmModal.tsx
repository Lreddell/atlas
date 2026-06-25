import React from 'react';

// A small in-app confirmation dialog. Used instead of the native window.confirm(),
// which blocks the event loop and (in the desktop/embedded webview) can leave text
// inputs unable to receive keyboard focus afterwards.

interface ConfirmModalProps {
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm, onCancel,
}) => (
    <div
        className="pointer-events-auto fixed inset-0 z-[300] flex items-center justify-center bg-black/60"
        onClick={onCancel}
    >
        <div
            className="flex w-[420px] max-w-[calc(100vw-2rem)] flex-col items-center gap-4 border-2 border-black/80 bg-[#1c1c22] p-6 font-minecraft text-white [text-shadow:2px_2px_0px_#000]"
            onClick={(e) => e.stopPropagation()}
        >
            <div className={`text-2xl ${danger ? 'text-[#ff6b6b]' : 'text-[#b388ff]'}`}>{title}</div>
            <div className="text-center text-sm leading-relaxed text-gray-300">{message}</div>
            <div className="mt-2 flex gap-4">
                <button
                    autoFocus
                    className={`border border-black/80 px-6 py-2 text-lg hover:brightness-110 ${danger ? 'bg-[#a01f1f]' : 'bg-[#7b1fa2]'}`}
                    onClick={onConfirm}
                >
                    {confirmLabel}
                </button>
                <button
                    className="border border-black/80 bg-[#3a3a44] px-6 py-2 text-lg hover:brightness-110"
                    onClick={onCancel}
                >
                    {cancelLabel}
                </button>
            </div>
        </div>
    </div>
);
