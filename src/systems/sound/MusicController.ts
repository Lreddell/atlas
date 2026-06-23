
import { soundManager } from './SoundManager';
import { gameEvents } from '../events/GameEvents';
import { MAGNETIC_WARDEN_BOSS_ID } from '../world/magneticFields';

const MUSIC_DELAY_MIN_KEY = 'atlas.music.delay.min';
const MUSIC_DELAY_MAX_KEY = 'atlas.music.delay.max';
const MUSIC_NIGHT_SLOWDOWN_KEY = 'atlas.music.nightSlowdown';

// Subtle "night" effect: a track started at night plays a little slower, and with
// pitch-preservation disabled (in SoundManager) that also drops its pitch slightly.
// -1 semitone
const NIGHT_PLAYBACK_RATE = 2 ** (-1 / 12); // 0.9438743126816935

// Mapping of Game States/Biomes to Music Packs
const MUSIC_PACKS: Record<string, string[]> = {
    // Menu
    "MENU": ["music.menu"],

    // Death
    "DEATH": ["music.death"],

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

    // --- New biomes (Task ID 4/5): mapped to the closest existing music pack ---
    // Forest family → forest music
    "birch_forest": ["music.forest"],
    "flower_forest": ["music.forest"],
    "dark_forest": ["music.forest"],
    "jungle": ["music.forest"],
    "swamp": ["music.forest"],

    // Open grasslands → plains music
    "meadow": ["music.plains"],
    "savanna": ["music.plains"],

    // Cold/snowy biomes → cold music (also get auroras via the 'snowy' tag)
    "taiga": ["music.cold"],
    "ice_spikes": ["music.cold"],
    "mountains": ["music.cold"],

    // Coastal bare rock → ocean music (coastal ambiance)
    "stone_shore": ["music.ocean"],

    // Magnetic Fields biome ambience + dedicated Magnetic Warden boss track.
    "magnetic_fields": ["music.magnetic_fields"],
    "BOSS_MAGNETIC": ["music.boss_magnetic_warden"],

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

// Death Config: the current track fades out quickly and the death music plays;
// on respawn / leaving to the menu the death music fades out quickly too, then
// the normal (world or menu) music resumes.
const DEATH_FADE_OUT = 1.0;
const DEATH_FADE_IN = 1.5;

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
    private maxDelay: number = 5000;
    
    // To debounce context changes
    private pendingContext: string | null = null;
    private contextStableTime: number = 0;

    // Transition State
    private isTransitioning: boolean = false;
    private bloodMoonLoopCrossfadePending: boolean = false;
    private isDeathSuspended: boolean = false;
    private deathStartTimer: ReturnType<typeof setTimeout> | null = null;

    // Night slowdown effect (player setting + latest day/night state from update()).
    private nightSlowdownEnabled: boolean = true;
    private isNight: boolean = false;

    // Boss-music override. The dedicated boss track plays only while the Magnetic
    // Warden is alive AND the player is actively in combat (aggro'd). So it stops
    // when the boss dies, when the player dies, or when the player leaves / loses
    // aggro — but survives a brief loss of line-of-sight and resumes on re-engage.
    private bossAlive: boolean = false;
    private inCombat: boolean = false;

    constructor() {
        // Boss-fight music hooks (safe without a window; emit is a no-op otherwise).
        gameEvents.on('boss:spawned', ({ bossId }) => {
            if (bossId === MAGNETIC_WARDEN_BOSS_ID) this.bossAlive = true;
        });
        gameEvents.on('boss:defeated', () => { this.bossAlive = false; });
        gameEvents.on('boss:cleared', () => { this.bossAlive = false; });
        gameEvents.on('combat:start', () => { this.inCombat = true; });
        gameEvents.on('combat:stop', () => { this.inCombat = false; });

        if (typeof window === 'undefined') return;

        // Load before the delay parsing below (which may early-return on bad data).
        // Default ON for new players; preserve an explicit saved OFF/ON choice.
        const nightSlowdownRaw = window.localStorage.getItem(MUSIC_NIGHT_SLOWDOWN_KEY);
        this.nightSlowdownEnabled = nightSlowdownRaw == null ? true : nightSlowdownRaw === 'true';

        const minRaw = window.localStorage.getItem(MUSIC_DELAY_MIN_KEY);
        const maxRaw = window.localStorage.getItem(MUSIC_DELAY_MAX_KEY);
        const minSeconds = minRaw == null ? 5 : Number(minRaw);
        const maxSeconds = maxRaw == null ? minSeconds : Number(maxRaw);

        if (!Number.isFinite(minSeconds) || !Number.isFinite(maxSeconds)) return;

        const clampedMin = Math.max(0, minSeconds);
        const clampedMax = Math.max(clampedMin, maxSeconds);

        // Keep startup behavior in sync with the single delay value shown in UI.
        this.minDelay = clampedMin * 1000;
        this.maxDelay = clampedMin * 1000;

        // Migrate older saved ranges (min..max) to a single value to prevent desync.
        if (clampedMax !== clampedMin) {
            window.localStorage.setItem(MUSIC_DELAY_MIN_KEY, String(clampedMin));
            window.localStorage.setItem(MUSIC_DELAY_MAX_KEY, String(clampedMin));
        }
    }

    public setDelayRange(minSeconds: number, maxSeconds: number) {
        const clampedMin = Math.max(0, minSeconds);
        const clampedMax = Math.max(0, maxSeconds);

        // Normalize to one effective delay so configured value and behavior match.
        const normalizedDelaySeconds = Math.min(clampedMin, clampedMax);
        this.minDelay = normalizedDelaySeconds * 1000;
        this.maxDelay = normalizedDelaySeconds * 1000;
        console.log(`[Music] Delay set to ${normalizedDelaySeconds}s`);

        if (typeof window !== 'undefined') {
            window.localStorage.setItem(MUSIC_DELAY_MIN_KEY, String(normalizedDelaySeconds));
            window.localStorage.setItem(MUSIC_DELAY_MAX_KEY, String(normalizedDelaySeconds));
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

    public getNightSlowdownEnabled() {
        return this.nightSlowdownEnabled;
    }

    public setNightSlowdownEnabled(enabled: boolean) {
        this.nightSlowdownEnabled = enabled;
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(MUSIC_NIGHT_SLOWDOWN_KEY, enabled ? 'true' : 'false');
        }
        // Applied to the next track that starts; a track already playing is left as-is.
    }

    public forcePlayForWorldEntry(gameMode: string, biomeId: string, inCaves: boolean = false, inBloodMoon: boolean = false) {
        this.isDeathSuspended = false;

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
        if (this.isDeathSuspended) return false;

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

    public update(inMenu: boolean, gameMode: string, biomeId: string, inCaves: boolean = false, inBloodMoon: boolean = false, bloodMoonTicksRemaining: number | null = null, isNight: boolean = false) {
        this.isNight = isNight;

        if (this.isDeathSuspended) {
            if (!inMenu) return;
            this.resumeAfterDeath();
        }

        // 1. Determine Target Context
        let targetContext = "generic";
        
        if (inMenu) {
            targetContext = "MENU";
        } else if (this.bossAlive && this.inCombat && gameMode !== 'creative') {
            // Magnetic Warden fight overrides biome/ambient music while engaged.
            targetContext = 'BOSS_MAGNETIC';
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
        const isDeathSwitch = this.currentContext === "DEATH"; // leaving death resumes instantly
        const isBloodMoonSwitch = targetContext === 'BLOODMOON' || this.currentContext === 'BLOODMOON';
        const isCaveSwitch = targetContext === "CAVES" || this.currentContext === "CAVES";
        const isBossSwitch = targetContext === 'BOSS_MAGNETIC' || this.currentContext === 'BOSS_MAGNETIC';
        const threshold = (isMenuSwitch || isDeathSwitch || isBossSwitch)
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

        const leavingDeath = previousContext === 'DEATH';
        const leavingMenuForWorld = previousContext === 'MENU' && newContext !== 'MENU';
        const enteringMenu = newContext === 'MENU';
        const enteringBoss = newContext === 'BOSS_MAGNETIC';
        const leavingBloodMoon = previousContext === 'BLOODMOON' && newContext !== 'BLOODMOON';

        let fadeOut = isFast ? FAST_FADE_OUT : TRANSITION_FADE_OUT;
        let silence = isFast ? FAST_SILENCE : TRANSITION_SILENCE;

        if (enteringBoss) {
            // Quickly duck out whatever was playing; the boss track starts dry.
            fadeOut = 0.5;
            silence = 0;
        } else if (leavingDeath) {
            // Death music fades out quickly before the world/menu music resumes.
            fadeOut = DEATH_FADE_OUT;
            silence = 0;
        } else if (enteringMenu) {
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

    public stopForDeath(fadeOut = DEATH_FADE_OUT) {
        // Player death always ends the boss fight context (music must not resume
        // the boss track on respawn).
        this.bossAlive = false;
        this.inCombat = false;
        if (this.isDeathSuspended) return; // already in death music — don't restart it

        this.isDeathSuspended = true;
        this.isTransitioning = false;
        this.bloodMoonLoopCrossfadePending = false;
        this.currentContext = 'DEATH';
        this.pendingContext = 'DEATH';
        this.contextStableTime = Date.now();
        this.lastPlayedTrack = null;
        this.lastFinishTime = Date.now();
        this.nextPlayTime = Number.POSITIVE_INFINITY;

        // Quickly fade out whatever is playing, then start the death music. The
        // update() loop is not driven while dead, so the start is scheduled here; it
        // plays once (see onTrackFinished) and then stays silent until respawn / menu.
        soundManager.stopMusic(fadeOut);
        this.isPlaying = false;

        if (this.deathStartTimer) clearTimeout(this.deathStartTimer);
        this.deathStartTimer = setTimeout(() => {
            this.deathStartTimer = null;
            if (this.isDeathSuspended) this.playNextTrack(DEATH_FADE_IN);
        }, fadeOut * 1000);
    }

    public resumeAfterDeath() {
        if (!this.isDeathSuspended) return;

        if (this.deathStartTimer) { clearTimeout(this.deathStartTimer); this.deathStartTimer = null; }
        this.isDeathSuspended = false;
        // currentContext is still 'DEATH'; the resumed update() loop fast-switches out
        // of it (instant, with a quick fade) into the world or menu music.
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
        if (context === 'BLOODMOON') return BLOOD_MOON_FADE_IN;
        if (context === 'BOSS_MAGNETIC') return 0; // boss music starts instantly, no fade-in
        return STANDARD_FADE_IN;
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

        // Night slowdown: only regular wandering music (biomes/caves/creative). Menu,
        // death and blood-moon tracks are meant to sound as-authored. Decided here, at
        // track start, so a song already playing when night falls keeps its rate and
        // only the next song picks up the effect.
        const useNightRate = this.nightSlowdownEnabled && this.isNight
            && this.currentContext !== 'MENU'
            && this.currentContext !== 'DEATH'
            && this.currentContext !== 'BLOODMOON';
        const playbackRate = useNightRate ? NIGHT_PLAYBACK_RATE : 1.0;

        // Try to play
        // We pass a callback for when it finishes
        return soundManager.playMusic(trackId, fadeTime, () => {
            this.onTrackFinished();
        }, fadeOutTime, playbackRate).then(started => {
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
        if (this.isDeathSuspended) {
            // Death music plays once — after it ends, stay silent until respawn / menu.
            this.nextPlayTime = Number.POSITIVE_INFINITY;
            return;
        }
        // Boss music restarts immediately (no delay) so the fight never falls quiet.
        if (this.currentContext === 'BOSS_MAGNETIC') {
            this.nextPlayTime = 0;
            return;
        }
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
