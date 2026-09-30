import React from 'react';
import { CloseMark } from './kit/PixelArt';

export interface UiNoticeState {
    type: 'success' | 'info' | 'error';
    message: string;
}

interface UiNoticeProps {
    notice: UiNoticeState | null;
    onDismiss: () => void;
}

// A notice is an ink strip with a coloured bar on its left edge: green done,
// brass for information, ember for a problem.
const NOTICE_STYLES: Record<UiNoticeState['type'], string> = {
    success: 'shadow-[inset_6px_0_0_#6fae5a] text-parchment-100',
    info: 'shadow-[inset_6px_0_0_#c99a4a] text-parchment-100',
    error: 'shadow-[inset_6px_0_0_#d8644c] text-parchment-50',
};

export const UiNotice: React.FC<UiNoticeProps> = ({ notice, onDismiss }) => {
    if (!notice) return null;

    return (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[500] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2">
            <div
                role={notice.type === 'error' ? 'alert' : 'status'}
                aria-live={notice.type === 'error' ? 'assertive' : 'polite'}
                className={`pointer-events-auto flex items-center gap-3 border-2 border-ink-950 bg-ink-800 py-2 pl-6 pr-3 text-px-2 atlas-panel-in ${NOTICE_STYLES[notice.type]}`}
            >
                <span className="min-w-0 flex-1 text-shadow-md">{notice.message}</span>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="atlas-btn h-8 w-8 flex-shrink-0"
                    aria-label="Dismiss message"
                >
                    <CloseMark />
                </button>
            </div>
        </div>
    );
};
