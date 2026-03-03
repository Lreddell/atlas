
import { soundManager } from './SoundManager';

const MUSIC_DELAY_MIN_KEY = 'atlas.music.delay.min';
const MUSIC_DELAY_MAX_KEY = 'atlas.music.delay.max';

// Mapping of Game States/Biomes to Music Packs
const MUSIC_PACKS: Record<string, string[]> = {
    // Menu
    "MENU": ["music.menu"],

    // Game States (Creative mixes everything)
    "CREATIVE": [
        "music.plains", 
        "music.forest", 
        "music.desert", 
        "music.ocean", 
        "music.cold", 
        "music.cherry", 
        "music.mesa", 
        "music.volcanic"
    ],
    
    // Biomes (Exclusive assignments)
    "ocean": ["music.ocean"],
    "frozen_ocean": ["music.cold"],
    
    "plains": ["music.plains"],
    "river": ["music.plains"], // River falls back to plains
    "frozen_river": ["music.cold"],
    
    "forest": ["music.forest"],
    
    "desert": ["music.desert"],
    
    "tundra": ["music.cold"],
    
    "cherry_grove": ["music.cherry"],
    
    "red_mesa": ["music.mesa"],
    "mesa_bryce": ["music.mesa"],
    
    "volcanic": ["music.volcanic"],
    
    // Fallback
    "generic": ["music.plains"]
};

// Biome Switch Config
const BIOME_STABILITY_THRESHOLD = 6000; // 6 seconds to confirm biome change
const TRANSITION_FADE_OUT = 5.0; // 5 seconds to fade out old track
const TRANSITION_SILENCE = 3000; // 3 seconds of absolute silence between tracks

// Fast Transition Config (Menu Switching)
const FAST_FADE_OUT = 2.0; 
const FAST_SILENCE = 500;

class MusicController {
    private currentContext: string = "";
    private isPlaying: boolean = false;
    private nextPlayTime: number = 0;
    
    // Track when the last track finished to allow live-updating delays
    private lastFinishTime: number = 0; 
    
    // Configurable delays (in ms)
    private minDelay: number = 15000;
    private maxDelay: number = 60000;
    
    // To debounce context changes
    private pendingContext: string | null = null;
    private contextStableTime: number = 0;

    // Transition State
    private isTransitioning: boolean = false;

    constructor() {
        if (typeof window === 'undefined') return;

        const minRaw = window.localStorage.getItem(MUSIC_DELAY_MIN_KEY);
        const maxRaw = window.localStorage.getItem(MUSIC_DELAY_MAX_KEY);
        const minSeconds = minRaw == null ? 15 : Number(minRaw);
        const maxSeconds = maxRaw == null ? 60 : Number(maxRaw);

        if (!Number.isFinite(minSeconds) || !Number.isFinite(maxSeconds)) return;

        const clampedMin = Math.max(0, minSeconds);
        const clampedMax = Math.max(clampedMin, maxSeconds);
        this.minDelay = clampedMin * 1000;
        this.maxDelay = clampedMax * 1000;
    }

    public setDelayRange(minSeconds: number, maxSeconds: number) {
        this.minDelay = minSeconds * 1000;
        this.maxDelay = maxSeconds * 1000;
        console.log(`[Music] Delay set to ${minSeconds}s - ${maxSeconds}s`);

        if (typeof window !== 'undefined') {
            window.localStorage.setItem(MUSIC_DELAY_MIN_KEY, String(minSeconds));
            window.localStorage.setItem(MUSIC_DELAY_MAX_KEY, String(maxSeconds));
        }
        
        // Live update: If we are currently waiting for a track (and not in a special transition)
        // we should re-evaluate the scheduled time based on the new delay settings.
        if (!this.isPlaying && !this.isTransitioning) {
            this.scheduleNextTrack();
        }
    }
    
    public getDelayRange() {
        return { min: this.minDelay / 1000, max: this.maxDelay / 1000 };
    }

    public skipTrack() {
        const context = this.currentContext || this.pendingContext || 'generic';
        const pack = MUSIC_PACKS[context] || MUSIC_PACKS.generic;
        if (!pack || pack.length === 0) return false;

        this.currentContext = context;
        this.pendingContext = context;
        this.contextStableTime = Date.now();

        const fadeOut = this.currentContext === 'MENU' ? 0.2 : 0.8;
        const silence = this.currentContext === 'MENU' ? 0 : 250;

        soundManager.stopMusic(fadeOut);
        this.isPlaying = false;
        this.isTransitioning = true;
        this.lastFinishTime = 0;
        this.nextPlayTime = Date.now() + (fadeOut * 1000) + silence;
        return true;
    }

    public update(inMenu: boolean, gameMode: string, biomeId: string) {
        // 1. Determine Target Context
        let targetContext = "generic";
        
        if (inMenu) {
            targetContext = "MENU";
        } else if (gameMode === 'creative') {
            targetContext = "CREATIVE";
        } else {
            // Use biome ID directly if it exists in our packs, otherwise fallback
            if (MUSIC_PACKS[biomeId]) {
                targetContext = biomeId;
            }
        }

        const now = Date.now();

        // 2. Stable Context Detection (debounce rapid biome switches)
        // If the target changed since last frame, reset the timer
        // Note: Menu switching is instant
        if (targetContext !== this.pendingContext) {
            this.pendingContext = targetContext;
            this.contextStableTime = now;
        }

        // Only switch if context has been stable for the threshold (6 seconds) OR if switching to/from MENU (instant)
        const isMenuSwitch = targetContext === "MENU" || this.currentContext === "MENU";
        const threshold = isMenuSwitch ? 0 : BIOME_STABILITY_THRESHOLD;

        if (this.pendingContext && now - this.contextStableTime >= threshold) {
            if (this.pendingContext !== this.currentContext) {
                this.switchContext(this.pendingContext, isMenuSwitch);
            }
        }

        // 3. Playback Logic
        
        // If we are in the middle of a biome switch silence gap
        if (this.isTransitioning) {
            // Wait until the silence timer (stored in nextPlayTime) expires
            if (now >= this.nextPlayTime) {
                this.isTransitioning = false;
                // Start the new track with a standard fade-in
                this.playNextTrack(3.0);
            }
            return;
        }

        // Normal playlist logic (Same biome)
        if (!this.isPlaying && now >= this.nextPlayTime) {
            this.playNextTrack(3.0); 
        }
    }

    private switchContext(newContext: string, isFast: boolean = false) {
        console.log(`[Music] Switching to ${newContext} (Fast: ${isFast})`);
        const previousContext = this.currentContext;
        this.currentContext = newContext;

        const leavingMenuForWorld = previousContext === 'MENU' && newContext !== 'MENU';
        const enteringMenu = newContext === 'MENU';

        let fadeOut = isFast ? FAST_FADE_OUT : TRANSITION_FADE_OUT;
        let silence = isFast ? FAST_SILENCE : TRANSITION_SILENCE;

        if (enteringMenu) {
            fadeOut = 0;
            silence = 0;
        } else if (leavingMenuForWorld) {
            fadeOut = FAST_FADE_OUT;
            silence = FAST_SILENCE;
        }

        // 1. Stop current music with fade out
        soundManager.stopMusic(fadeOut);
        
        // 2. Set Transition Flag
        this.isPlaying = false; // Technically nothing is "playing" logic-wise during silence
        this.isTransitioning = true;

        // 3. Schedule next track: Now + FadeOutDuration + SilenceGap
        this.nextPlayTime = Date.now() + (fadeOut * 1000) + silence;
    }

    private playNextTrack(fadeTime = 3.0) {
        const pack = MUSIC_PACKS[this.currentContext] || MUSIC_PACKS["generic"];
        if (!pack || pack.length === 0) return;

        const effectiveFadeTime = this.currentContext === 'MENU' ? 0 : fadeTime;

        const trackId = pack[Math.floor(Math.random() * pack.length)];
        
        // Optimistically lock to prevent double triggers
        this.isPlaying = true;

        // Try to play
        // We pass a callback for when it finishes
        soundManager.playMusic(trackId, effectiveFadeTime, () => {
            this.onTrackFinished();
        }).then(started => {
            if (!started) {
                // If it failed to start (e.g. file is empty or missing), release lock and try again shortly
                this.isPlaying = false;
                this.nextPlayTime = Date.now() + (this.currentContext === 'MENU' ? 250 : 1000);
            }
        });
    }

    private onTrackFinished() {
        this.isPlaying = false;
        this.lastFinishTime = Date.now();
        this.scheduleNextTrack();
    }

    private scheduleNextTrack() {
        // If start of game (no track finished yet), play immediately
        if (this.lastFinishTime === 0) {
            this.nextPlayTime = 0;
            return;
        }

        const delay = this.minDelay + Math.random() * (this.maxDelay - this.minDelay);
        this.nextPlayTime = this.lastFinishTime + delay;
        
        // Log info
        const remaining = Math.max(0, this.nextPlayTime - Date.now());
        console.log(`[Music] Next track in ${(remaining/1000).toFixed(1)}s (Delay: ${(delay/1000).toFixed(1)}s)`);
    }
}

export const musicController = new MusicController();
