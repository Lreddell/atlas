import React from 'react';
import { MenuButton } from './mainMenu/MainMenuControls';
import { useDialogFocus } from '../../hooks/useDialogFocus';

// A small in-app confirmation dialog. Used instead of the native window.confirm(),
// which blocks the event loop and (in the desktop/embedded webview) can leave text
// inputs unable to receive keyboard focus afterwards. A framed panel with the
// menus' buttons; the danger variant uses the ember button.

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
}) => {
    const dialogRef = useDialogFocus<HTMLDivElement>(onCancel);
    const titleId = 'atlas-confirm-modal-title';

    return (
        <div
            className="pointer-events-auto fixed inset-0 z-[300] flex items-center justify-center bg-ink-950/70 atlas-fade-in"
            onClick={onCancel}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="atlas-panel flex w-[460px] max-w-[calc(100vw-2rem)] flex-col items-center gap-4 px-8 pb-7 pt-5 outline-none atlas-panel-in"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 id={titleId} className="atlas-title text-center">{title}</h2>
                <div className="text-center text-read text-parchment-200">{message}</div>
                <div className="mt-2 grid w-full grid-cols-2 gap-3">
                    <MenuButton label={confirmLabel} onClick={onConfirm} variant={danger ? 'danger' : 'primary'} width="w-full" />
                    <MenuButton label={cancelLabel} onClick={onCancel} width="w-full" />
                </div>
            </div>
        </div>
    );
};
