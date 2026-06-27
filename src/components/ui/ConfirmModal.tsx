import React from 'react';
import { MenuButton } from './mainMenu/MainMenuControls';

// A small in-app confirmation dialog. Used instead of the native window.confirm(),
// which blocks the event loop and (in the desktop/embedded webview) can leave text
// inputs unable to receive keyboard focus afterwards. Styled to match the menus
// (raised panel + MenuButton); the danger variant uses MenuButton's red button.

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
        className="pointer-events-auto fixed inset-0 z-[300] flex items-center justify-center bg-black/70"
        onClick={onCancel}
    >
        <div
            className="flex w-[420px] max-w-[calc(100vw-2rem)] flex-col items-center gap-4 border-2 border-white border-b-[#373737] border-r-[#373737] bg-[#151515] p-6 font-minecraft text-white"
            onClick={(e) => e.stopPropagation()}
        >
            <h2 className="text-2xl font-bold text-white [text-shadow:1px_1px_0px_#3f3f3f]">{title}</h2>
            <div className="text-center text-sm leading-relaxed text-gray-300">{message}</div>
            <div className="mt-2 flex justify-center gap-3">
                <MenuButton label={confirmLabel} onClick={onConfirm} variant={danger ? 'danger' : 'primary'} width="w-[170px]" />
                <MenuButton label={cancelLabel} onClick={onCancel} width="w-[150px]" />
            </div>
        </div>
    </div>
);
