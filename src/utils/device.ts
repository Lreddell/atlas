// Touch / mobile detection. Computed once at module load — the form factor doesn't
// change during a session, and we never want this to trigger React re-renders.
//
// Treated as "mobile" when the primary input is touch AND the screen is phone/tablet
// sized, OR the UA string looks like a phone. Desktops with touchscreens keep the full
// mouse/keyboard experience (coarse-pointer + small-screen is the gate).
function detectMobile(): boolean {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;

    const ua = navigator.userAgent || '';
    const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    // iPadOS 13+ reports as desktop Safari; catch it via touch points on a Mac UA.
    const iPadOS = /Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;

    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const smallScreen = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight) <= 1024;

    return uaMobile || iPadOS || (hasTouch && coarse && smallScreen);
}

export const IS_MOBILE = detectMobile();

// Allow a manual override via ?mobile=1 / ?mobile=0 for testing on any device.
export function isMobileDevice(): boolean {
    if (typeof window !== 'undefined' && window.location?.search) {
        const params = new URLSearchParams(window.location.search);
        const forced = params.get('mobile');
        if (forced === '1' || forced === 'true') return true;
        if (forced === '0' || forced === 'false') return false;
    }
    return IS_MOBILE;
}

// --- Fullscreen helpers (used on mobile to hide the browser URL bar) ----------
// Must be called from a user gesture. No-ops if already fullscreen or unsupported
// (e.g. iPhone Safari, which has no Fullscreen API). Errors are swallowed — failing
// to go fullscreen should never break gameplay.
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };

export function isFullscreen(): boolean {
    const d = document as FsDocument;
    return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

export function requestFullscreen(): void {
    if (typeof document === 'undefined' || isFullscreen()) return;
    const el = document.documentElement as FsElement;
    try {
        const fn = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!fn) return;
        const p = el.requestFullscreen
            ? el.requestFullscreen({ navigationUI: 'hide' })
            : el.webkitRequestFullscreen?.();
        if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
    } catch { /* ignore */ }
}

export function exitFullscreen(): void {
    if (typeof document === 'undefined' || !isFullscreen()) return;
    const d = document as FsDocument;
    try {
        const p = d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.();
        if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
    } catch { /* ignore */ }
}
