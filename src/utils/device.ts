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
