
import { soundManager } from './SoundManager';

const MUSIC_DELAY_MIN_KEY = 'atlas.music.delay.min';
const MUSIC_DELAY_MAX_KEY = 'atlas.music.delay.max';

// Mapping of Game States/Biomes to Music Packs
const MUSIC_PACKS: Record<string, string[]> = {
    // Menu
    "MENU": ["music.menu"],

    // Game States
    "BLOODMOON": ["music.bloodmoon"],
    "CREATIVE": ["music.creative"],
    "CAVES": ["music.caves"],
    
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
const BIOME_STABILITY_THRESHOLD = 30000; // 30 seconds to confirm biome change
const CAVE_STABILITY_THRESHOLD = 4000; // Underground should react much faster than biome travel
const BLOOD_MOON_STABILITY_THRESHOLD = 0;
const BLOOD_MOON_LOOP_CROSSFADE = 10.0;
const BLOOD_MOON_LOOP_CROSSFADE_TICKS = BLOOD_MOON_LOOP_CROSSFADE * 20;
const BLOOD_MOON_LOOP_DISABLE_WINDOW_TICKS = BLOOD_MOON_LOOP_CROSSFADE_TICKS * 2;
const BLOOD_MOON_FADE_IN = 10.0;
const BLOOD_MOON_FADE_OUT = 10.0;
const STANDARD_FADE_IN = 3.0;
const TRANSITION_FADE_OUT = 5.0; // 5 seconds to fade out old track
const TRANSITION_SILENCE = 0; // 0 seconds of absolute silence between tracks

// Fast Transition Config (Menu Switching)
const FAST_FADE_OUT = 2.0; 
const FAST_SILENCE = 500;

class MusicController {
    private currentContext: string = "";
    private isPlaying: boolean = false;
    private nextPlayTime: number = 0;
    
    // Track when the last track finished to allow live-updating delays
    private lastFinishTime: number = 0; 
    
    // Track the last played track to prevent repeats
    private lastPlayedTrack: string | null = null;
    
    // Configurable delays (in ms)
    private minDelay: number = 5000;
    private maxDelay: number = 15000;
    
    // To debounce context changes
    private pendingContext: string | null = null;
    private contextStableTime: number = 0;

    // Transition State
    private isTransitioning: boolean = false;
    private bloodMoonLoopCrossfadePending: boolean = false;

    constructor() {
        if (typeof window === 'undefined') return;

        const minRaw = window.localStorage.getItem(MUSIC_DELAY_MIN_KEY);
        const maxRaw = window.localStorage.getItem(MUSIC_DELAY_MAX_KEY);
        const minSeconds = minRaw == null ? 5 : Number(minRaw);
        const maxSeconds = maxRaw == null ? 15 : Number(maxRaw);

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

    public forcePlayForWorldEntry(gameMode: string, biomeId: string, inCaves: boolean = false, inBloodMoon: boolean = false) {
        let targetContext = 'generic';
        const fadeOut = FAST_FADE_OUT;

        if (gameMode === 'survival' && inBloodMoon) {
            targetContext = 'BLOODMOON';
        } else if (gameMode === 'creative') {
            targetContext = 'CREATIVE';
        } else if (inCaves) {
            targetContext = 'CAVES';
        } else if (MUSIC_PACKS[biomeId]) {
            targetContext = biomeId;
        }

        this.currentContext = targetContext;
        this.pendingContext = targetContext;
        this.contextStableTime = Date.now();
        this.isTransitioning = true;
        this.isPlaying = false;
        this.bloodMoonLoopCrossfadePending = false;
        this.lastFinishTime = 0;
        this.lastPlayedTrack = null;
        this.nextPlayTime = Date.now() + (fadeOut * 1000);

        // Fade out menu music first, then let the normal update loop start
        // world music immediately after the fade completes.
        soundManager.stopMusic(fadeOut);
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
        this.bloodMoonLoopCrossfadePending = false;
        // Don't reset lastPlayedTrack - skip should also avoid repeating the same song
        this.nextPlayTime = Date.now() + (fadeOut * 1000) + silence;
        return true;
    }

    public update(inMenu: boolean, gameMode: string, biomeId: string, inCaves: boolean = false, inBloodMoon: boolean = false, bloodMoonTicksRemaining: number | null = null) {
        // 1. Determine Target Context
        let targetContext = "generic";
        
        if (inMenu) {
            targetContext = "MENU";
        } else if (gameMode === 'survival' && inBloodMoon) {
            targetContext = 'BLOODMOON';
        } else if (gameMode === 'creative') {
            targetContext = "CREATIVE";
        } else if (inCaves) {
            targetContext = "CAVES";
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
        const isBloodMoonSwitch = targetContext === 'BLOODMOON' || this.currentContext === 'BLOODMOON';
        const isCaveSwitch = targetContext === "CAVES" || this.currentContext === "CAVES";
        const threshold = isMenuSwitch
            ? 0
            : (isBloodMoonSwitch ? BLOOD_MOON_STABILITY_THRESHOLD : (isCaveSwitch ? CAVE_STABILITY_THRESHOLD : BIOME_STABILITY_THRESHOLD));

        if (this.pendingContext && now - this.contextStableTime >= threshold) {
            if (this.pendingContext !== this.currentContext) {
                this.switchContext(this.pendingContext, isMenuSwitch);
            }
        }

        if (this.shouldCrossfadeBloodMoonLoop(targetContext, bloodMoonTicksRemaining)) {
            this.crossfadeBloodMoonLoop();
            return;
        }

        // 3. Playback Logic
        
        // If we are in the middle of a biome switch silence gap
        if (this.isTransitioning) {
            // Wait until the silence timer (stored in nextPlayTime) expires
            if (now >= this.nextPlayTime) {
                this.isTransitioning = false;
                this.playNextTrack(this.getFadeInForContext(this.currentContext));
            }
            return;
        }

        // Normal playlist logic (Same biome)
        if (!this.isPlaying && now >= this.nextPlayTime) {
            this.playNextTrack(this.getFadeInForContext(this.currentContext)); 
        }
    }

    private switchContext(newContext: string, isFast: boolean = false) {
        // Don't stop current music if the new context has no available tracks
        const newPack = MUSIC_PACKS[newContext] || MUSIC_PACKS['generic'];
        const hasNewTracks = newPack?.some(eventId => soundManager.hasTracksForEvent(eventId)) ?? false;
        if (!hasNewTracks) {
            console.log(`[Music] Context ${newContext} has no tracks, staying in ${this.currentContext || 'current'}.`);
            this.pendingContext = this.currentContext;
            this.contextStableTime = Date.now();
            return;
        }

        console.log(`[Music] Switching to ${newContext} (Fast: ${isFast})`);
        const previousContext = this.currentContext;
        this.currentContext = newContext;
        this.bloodMoonLoopCrossfadePending = false;
        this.lastPlayedTrack = null; // Reset track history when switching contexts

        const leavingMenuForWorld = previousContext === 'MENU' && newContext !== 'MENU';
        const enteringMenu = newContext === 'MENU';
        const leavingBloodMoon = previousContext === 'BLOODMOON' && newContext !== 'BLOODMOON';

        let fadeOut = isFast ? FAST_FADE_OUT : TRANSITION_FADE_OUT;
        let silence = isFast ? FAST_SILENCE : TRANSITION_SILENCE;

        if (enteringMenu) {
            fadeOut = 0;
            silence = 0;
        } else if (leavingMenuForWorld) {
            fadeOut = FAST_FADE_OUT;
            silence = FAST_SILENCE;
        } else if (leavingBloodMoon) {
            fadeOut = BLOOD_MOON_FADE_OUT;
        }

        // 1. Stop current music with fade out
        soundManager.stopMusic(fadeOut);
        
        // 2. Set Transition Flag
        this.isPlaying = false; // Technically nothing is "playing" logic-wise during silence
        this.isTransitioning = true;

        // 3. Schedule next track: Now + FadeOutDuration + SilenceGap
        this.nextPlayTime = Date.now() + (fadeOut * 1000) + silence;
    }

    private shouldCrossfadeBloodMoonLoop(targetContext: string, bloodMoonTicksRemaining: number | null) {
        if (this.currentContext !== 'BLOODMOON' || targetContext !== 'BLOODMOON') return false;
        if (!this.isPlaying || this.isTransitioning || this.bloodMoonLoopCrossfadePending) return false;
        if (bloodMoonTicksRemaining !== null && bloodMoonTicksRemaining <= BLOOD_MOON_LOOP_DISABLE_WINDOW_TICKS) return false;

        const timeRemaining = soundManager.getActiveMusicTimeRemaining();
        return timeRemaining !== null && timeRemaining <= BLOOD_MOON_LOOP_CROSSFADE;
    }

    private crossfadeBloodMoonLoop() {
        this.bloodMoonLoopCrossfadePending = true;
        this.playNextTrack(BLOOD_MOON_LOOP_CROSSFADE).finally(() => {
            this.bloodMoonLoopCrossfadePending = false;
        });
    }

    private getFadeInForContext(context: string) {
        return context === 'BLOODMOON' ? BLOOD_MOON_FADE_IN : STANDARD_FADE_IN;
    }

    private playNextTrack(fadeTime = STANDARD_FADE_IN, fadeOutTime: number = fadeTime) {
        const pack = MUSIC_PACKS[this.currentContext] || MUSIC_PACKS["generic"];
        if (!pack || pack.length === 0) return Promise.resolve();

        // If there are multiple tracks, exclude the last played track
        let availableTracks = pack;
        if (pack.length > 1 && this.lastPlayedTrack !== null) {
            availableTracks = pack.filter(track => track !== this.lastPlayedTrack);
            // If all tracks are filtered out (shouldn't happen), use all tracks
            if (availableTracks.length === 0) {
                availableTracks = pack;
            }
        }

        const trackId = availableTracks[Math.floor(Math.random() * availableTracks.length)];
        this.lastPlayedTrack = trackId; // Store the track we're about to play
        
        // Optimistically lock to prevent double triggers
        this.isPlaying = true;

        // Try to play
        // We pass a callback for when it finishes
        return soundManager.playMusic(trackId, fadeTime, () => {
            this.onTrackFinished();
        }, fadeOutTime).then(started => {
            if (!started) {
                // If it failed to start (e.g. file is empty or missing), release lock and retry after a long delay
                this.isPlaying = false;
                this.nextPlayTime = Date.now() + (this.currentContext === 'MENU' ? 250 : 30000);
            }
        });
    }

    private onTrackFinished() {
        this.isPlaying = false;
        this.bloodMoonLoopCrossfadePending = false;
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
