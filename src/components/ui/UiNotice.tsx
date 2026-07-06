import React from 'react';

export interface UiNoticeState {
    type: 'success' | 'info' | 'error';
    message: string;
}

interface UiNoticeProps {
    notice: UiNoticeState | null;
    onDismiss: () => void;
}

const NOTICE_STYLES: Record<UiNoticeState['type'], string> = {
    success: 'border-green-500/60 bg-green-950/95 text-green-200',
    info: 'border-blue-500/60 bg-blue-950/95 text-blue-100',
    error: 'border-red-500/60 bg-red-950/95 text-red-200',
};

export const UiNotice: React.FC<UiNoticeProps> = ({ notice, onDismiss }) => {
    if (!notice) return null;

    return (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[500] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2">
            <div
                role={notice.type === 'error' ? 'alert' : 'status'}
                aria-live={notice.type === 'error' ? 'assertive' : 'polite'}
                className={`pointer-events-auto flex items-center gap-3 border-2 px-4 py-3 font-pixel text-xs shadow-2xl ${NOTICE_STYLES[notice.type]}`}
            >
                <span className="min-w-0 flex-1 text-center">{notice.message}</span>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center border border-current/40 text-sm hover:bg-white/10"
                    aria-label="Dismiss message"
                >
                    ×
                </button>
            </div>
        </div>
    );
};
