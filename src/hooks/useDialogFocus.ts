import { useEffect, useRef } from 'react';

export const useDialogFocus = <T extends HTMLElement>(onClose: () => void) => {
    const dialogRef = useRef<T>(null);

    useEffect(() => {
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialogRef.current?.focus();

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            onClose();
        };

        window.addEventListener('keydown', handleEscape, true);
        return () => {
            window.removeEventListener('keydown', handleEscape, true);
            previousFocus?.focus();
        };
    }, [onClose]);

    return dialogRef;
};
