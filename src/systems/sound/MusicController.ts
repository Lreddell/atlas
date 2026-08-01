
import { soundManager } from './SoundManager';
import { gameEvents } from '../events/GameEvents';
import { MAGNETIC_WARDEN_BOSS_ID } from '../world/magneticFields';
import {
    createMusicState,
    PRIORITY_CROSSFADE_MS,
    reduceMusicRequest,
    type MusicTransitionState,
} from './musicTransitions';

export { createMusicState, reduceMusicRequest } from './musicTransitions';

const MUSIC_DELAY_MIN_KEY = 'atlas.music.delay.min';
const MUSIC_DELAY_MAX_KEY = 'atlas.music.delay.max';
const MUSIC_NIGHT_SLOWDOWN_KEY = 'atlas.music.nightSlowdown';

// Subtle "night" effect: a track started at night plays a little slower, and with
// pitch-preservation disabled (in SoundManager) that also drops its pitch slightly.
// -1 semitone
const NIGHT_PLAYBACK_RATE = 2 ** (-1 / 12); // 0.9438743126816935 (−100 cents)
const FRENZY_PLAYBACK_RATE = 2 ** (1 / 12);  // 1.0594630943592953  (+100 cents, the exact opposite of night)

// --- Music tags ---
//
// A "music tag" is a folder of songs (public/assets/rvx/sounds/music/<tag>/).
// Each biome activates a set of tags (music/biomes/<biome>/tags.json, loaded via
// soundManager.getBiomeTags); the game plays a random song pooled from the
// biome's tags that actually have files, so multiple biomes can share identical
// music simply by sharing a tag. If a song from a tag is already playing and you
// cross into another biome that still has that tag, the music keeps playing
// (see switchContext continuity), the biome-stability timer still governs when a
// switch is even considered.
//
// Non-biome game states map to a single tag each.
const STATE_TAGS: Record<string, string[]> = {
    MENU: ["menu"],
    DEATH: ["death"],
    BLOODMOON: ["bloodmoon"],
    CREATIVE: ["creative"],
    CAVES: ["caves"],
    BOSS_MAGNETIC: ["boss_magnetic_warden"],
    VAULT: ["resonant_vault"],
    VAULT_COMBAT: ["resonant_combat"],
    BOSS_RESONANT: ["boss_bell_titan"],
    VAULT_ESCAPE: ["resonant_escape"],
    generic: ["plains"],
};

// Default biome -> tags. Mirrors the music/biomes/<biome>/tags.json config
// folders; those override this at runtime once the index loads, but this keeps
// the game working before load and if a biome is missing a config.
const BIOME_TAGS: Record<string, string[]> = {
    plains: ["plains"],
    meadow: ["plains", "meadow"],
    savanna: ["plains", "savanna"],
    river: ["plains", "river"],
    forest: ["forest"],
    birch_forest: ["forest", "birch_forest"],
    flower_forest: ["forest", "flower_forest"],
    dark_forest: ["forest", "dark_forest"],
    jungle: ["forest", "jungle"],
    swamp: ["forest", "swamp"],
    cherry_grove: ["forest", "cherry_grove"],
    ocean: ["ocean"],
    beach: ["ocean", "beach"],
    stone_shore: ["ocean", "stone_shore"],
    frozen_ocean: ["cold", "frozen_ocean"],
    frozen_river: ["cold", "frozen_river"],
    tundra: ["cold", "tundra"],
    taiga: ["cold", "taiga"],
    ice_spikes: ["cold", "ice_spikes"],
    mountains: ["cold", "mountains"],
    desert: ["desert"],
    red_mesa: ["mesa"],
    mesa_bryce: ["mesa"],
    volcanic: ["volcanic", "caves"],
    magnetic_fields: ["magnetic_fields"],
    caves: ["caves"],
    lush_caves: ["caves", "lush_caves"],
    dripstone_caves: ["caves", "dripstone_caves"],
};

// Cave contexts react faster than surface biome travel and are treated together
// for transition timing. The generic CAVES state plus the cave biomes.
const CAVE_CONTEXTS = new Set(["CAVES", "lush_caves", "dripstone_caves"]);
const RESONANT_MUSIC_CONTEXTS = new Set(["VAULT", "VAULT_COMBAT", "BOSS_RESONANT", "VAULT_ESCAPE"]);
const CONTINUOUS_MUSIC_CONTEXTS = new Set(["VAULT", "VAULT_COMBAT", "BOSS_RESONANT", "VAULT_ESCAPE", "BOSS_MAGNETIC"]);

// Biome Switch Config
const BIOME_STABILITY_THRESHOLD = 30000; // 30 seconds to confirm biome change
const CAVE_STABILITY_THRESHOLD = 4000; // Underground should react much faster than biome travel
const BLOOD_MOON_STABILITY_THRESHOLD = 0;
const BLOOD_MOON_LOOP_CROSSFADE = 10.0;
const CONTINUOUS_LOOP_CROSSFADE = 2.5;
const BLOOD_MOON_LOOP_CROSSFADE_TICKS = BLOOD_MOON_LOOP_CROSSFADE * 20;
const BLOOD_MOON_LOOP_DISABLE_WINDOW_TICKS = BLOOD_MOON_LOOP_CROSSFADE_TICKS * 2;
const BLOOD_MOON_FADE_IN = 10.0;
const BLOOD_MOON_FADE_OUT = 10.0;
const STANDARD_FADE_IN = 3.0;
const TRANSITION_FADE_OUT = 5.0; // 5 seconds to fade out old track
const TRANSITION_SILENCE = 0; // 0 seconds of absolute silence between tracks
const PRIORITY_CROSSFADE_SECONDS = PRIORITY_CROSSFADE_MS / 1000;

// Fast Transition Config (Menu Switching)
const FAST_FADE_OUT = 2.0;
const FAST_SILENCE = 500;

// Death Config: the current track fades out quickly and the death music plays;
// on respawn / leaving to the menu the death music fades out quickly too, then
// the normal (world or menu) music resumes.
const DEATH_FADE_OUT = 1.0;

class MusicController {
    private currentContext: string = "";
    private isPlaying: boolean = false;
    private nextPlayTime: number = 0;

    // The music tag the currently-playing song was drawn from. Used for the
    // cross-biome continuity check (keep playing if the new biome shares the tag).
    private currentTrackTag: string | null = null;

    // Track when the last track finished to allow live-updating delays
    private lastFinishTime: number = 0;
    
    // Configurable delays (in ms)
    private minDelay: number = 5000;
    private maxDelay: number = 5000;
    
    // To debounce context changes
    private pendingContext: string | null = null;
    private contextStableTime: number = 0;

    // Transition State
    private isTransitioning: boolean = false;
    private bloodMoonLoopCrossfadePending: boolean = false;
    private continuousLoopCrossfadePending: boolean = false;
    private isDeathSuspended: boolean = false;

    // Night slowdown effect (player setting + latest day/night state from update()).
    private nightSlowdownEnabled: boolean = true;
    private isNight: boolean = false;
    // Boss frenzy: the music speeds up + pitches up +100 cents, mid-song.
    private bossFrenzy: boolean = false;

    // Boss-music override. The dedicated boss track plays only while the Magnetic
    // Warden is alive AND the player is actively in combat (aggro'd). So it stops
    // when the boss dies, when the player dies, or when the player leaves / loses
    // aggro, but survives a brief loss of line-of-sight and resumes on re-engage.
    private bossAlive: boolean = false;
    private inCombat: boolean = false;

    // Resonant Vault music state is event-driven so it remains independent of
    // surface biome/cave detection and changes immediately at authored beats.
    private vaultActive: boolean = false;
    private vaultCombat: boolean = false;
    private vaultTitan: boolean = false;
    private vaultEscape: boolean = false;
    private transitionState: MusicTransitionState = createMusicState();

    constructor() {
        // Boss-fight music hooks (safe without a window; emit is a no-op otherwise).
        gameEvents.on('boss:spawned', ({ bossId }) => {
            if (bossId === MAGNETIC_WARDEN_BOSS_ID) this.bossAlive = true;
        });
        gameEvents.on('boss:defeated', () => { this.bossAlive = false; });
        gameEvents.on('boss:cleared', () => { this.bossAlive = false; });
        gameEvents.on('combat:start', () => { this.inCombat = true; });
        gameEvents.on('combat:stop', () => { this.inCombat = false; });

        gameEvents.on('vault:entered', () => { this.vaultActive = true; });
        gameEvents.on('vault:left', () => { this.endVaultMusicImmediately(); });
        gameEvents.on('vault:encounter-started', ({ room }) => {
            if (room === 'combat') this.vaultCombat = true;
        });
        gameEvents.on('vault:encounter-completed', ({ room }) => {
            if (room === 'combat') {
                this.vaultCombat = false;
                if (this.vaultActive && !this.vaultTitan && !this.vaultEscape) {
                    this.requestImmediateContextCrossfade('VAULT', PRIORITY_CROSSFADE_SECONDS);
                }
            }
            if (room === 'arena') {
                this.vaultCombat = false;
                this.vaultTitan = false;
                if (this.vaultActive && !this.vaultEscape) {
                    this.requestImmediateContextCrossfade('VAULT', PRIORITY_CROSSFADE_SECONDS);
                }
            }
        });
        gameEvents.on('vault:titan-awakened', () => {
            this.vaultActive = true;
            this.vaultCombat = false;
            this.vaultTitan = true;
            this.requestImmediateContextCrossfade('BOSS_RESONANT', PRIORITY_CROSSFADE_SECONDS);
        });
        gameEvents.on('vault:titan-defeated', () => {
            this.vaultTitan = false;
            this.vaultCombat = false;
            if (this.vaultActive && !this.vaultEscape) {
                this.requestImmediateContextCrossfade('VAULT', PRIORITY_CROSSFADE_SECONDS);
            }
        });
        gameEvents.on('vault:escape-started', () => {
            this.vaultActive = true;
            this.vaultCombat = false;
            this.vaultTitan = false;
            this.vaultEscape = true;
        });
        gameEvents.on('vault:escape-completed', () => { this.endVaultMusicImmediately(); });

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

    private clearVaultMusicState(): void {
        this.vaultActive = false;
        this.vaultCombat = false;
        this.vaultTitan = false;
        this.vaultEscape = false;
    }

    private endVaultMusicImmediately(): void {
        this.clearVaultMusicState();
        if (!RESONANT_MUSIC_CONTEXTS.has(this.currentContext)) return;
        // Completion and leaving are hard gameplay boundaries. Silence the escape
        // score now; the next update immediately selects the current world context.
        soundManager.stopMusic(0.08);
        this.isPlaying = false;
        this.isTransitioning = false;
        this.continuousLoopCrossfadePending = false;
        this.nextPlayTime = 0;
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

    /**
     * Boss frenzy music: speeds up + pitches up +100 cents MID-SONG (the exact
     * opposite of the night slowdown), and persists across track loops while on.
     */
    public setBossFrenzy(active: boolean) {
        if (this.bossFrenzy === active) return;
        this.bossFrenzy = active;
        if (active) {
            // Turning ON: apply live so the track currently playing speeds up + pitches
            // up mid-song. Future tracks pick it up via playNextTrack().
            soundManager.setMusicPlaybackRate(FRENZY_PLAYBACK_RATE);
        }
        // Turning OFF (boss defeated / player died / fight cleared): do NOT snap the
        // playing track's rate back down, that pitch drop is clearly audible while the
        // track is fading out and sounds like a glitch. Leave the fading track at its
        // raised pitch; whatever plays next (death music, world music) starts fresh at
        // 1.0 via playNextTrack(), so nothing else is left pitched.
    }

    public setNightSlowdownEnabled(enabled: boolean) {
        this.nightSlowdownEnabled = enabled;
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(MUSIC_NIGHT_SLOWDOWN_KEY, enabled ? 'true' : 'false');
        }
        // Applied to the next track that starts; a track already playing is left as-is.
    }

    // The music tags active for a context: a fixed tag for game states, else the
    // biome's tag list (folder config preferred, code default as a safety net).
    private tagsForContext(context: string): string[] {
        if (STATE_TAGS[context]) return STATE_TAGS[context];
        const fromFolders = soundManager.getBiomeTags(context);
        if (fromFolders.length > 0) return fromFolders;
        return BIOME_TAGS[context] ?? [];
    }

    private isKnownContext(context: string): boolean {
        return !!STATE_TAGS[context] || this.tagsForContext(context).length > 0;
    }

    public forcePlayForWorldEntry(gameMode: string, biomeId: string, inCaves: boolean = false, inBloodMoon: boolean = false) {
        this.isDeathSuspended = false;
        // Defensive: entering a world must never inherit stale boss/vault state
        // from a previous save or session.
        this.bossFrenzy = false;
        this.clearVaultMusicState();

        let targetContext = 'generic';
        const fadeOut = FAST_FADE_OUT;

        if (gameMode === 'survival' && inBloodMoon) {
            targetContext = 'BLOODMOON';
        } else if (gameMode === 'creative') {
            targetContext = 'CREATIVE';
        } else if (inCaves) {
            targetContext = (biomeId === 'lush_caves' || biomeId === 'dripstone_caves') ? biomeId : 'CAVES';
        } else if (this.isKnownContext(biomeId)) {
            targetContext = biomeId;
        }

        this.currentContext = targetContext;
        this.pendingContext = targetContext;
        this.contextStableTime = Date.now();
        this.isTransitioning = true;
        this.isPlaying = false;
        this.bloodMoonLoopCrossfadePending = false;
        this.lastFinishTime = 0;
        this.nextPlayTime = Date.now() + (fadeOut * 1000);

        // Fade out menu music first, then let the normal update loop start
        // world music immediately after the fade completes.
        soundManager.stopMusic(fadeOut);
    }

    public skipTrack() {
        if (this.isDeathSuspended) return false;

        const context = this.currentContext || this.pendingContext || 'generic';
        if (this.tagsForContext(context).length === 0) return false;

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
        } else if (this.vaultEscape) {
            targetContext = 'VAULT_ESCAPE';
        } else if (this.vaultTitan) {
            targetContext = 'BOSS_RESONANT';
        } else if (this.vaultCombat) {
            targetContext = 'VAULT_COMBAT';
        } else if (this.vaultActive) {
            targetContext = 'VAULT';
        } else if (this.bossAlive && this.inCombat && gameMode !== 'creative') {
            // Magnetic Warden fight overrides biome/ambient music while engaged.
            targetContext = 'BOSS_MAGNETIC';
        } else if (gameMode === 'survival' && inBloodMoon) {
            targetContext = 'BLOODMOON';
        } else if (gameMode === 'creative') {
            targetContext = "CREATIVE";
        } else if (inCaves) {
            // Cave biomes can carry their own music; otherwise the generic caves pack.
            targetContext = (biomeId === 'lush_caves' || biomeId === 'dripstone_caves') ? biomeId : "CAVES";
        } else {
            // Use biome ID directly if it maps to tags, otherwise stay generic.
            if (this.isKnownContext(biomeId)) {
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
        const isCaveSwitch = CAVE_CONTEXTS.has(targetContext) || CAVE_CONTEXTS.has(this.currentContext);
        const isBossSwitch = targetContext === 'BOSS_MAGNETIC' || this.currentContext === 'BOSS_MAGNETIC'
            || targetContext === 'BOSS_RESONANT' || this.currentContext === 'BOSS_RESONANT';
        const isVaultSwitch = RESONANT_MUSIC_CONTEXTS.has(targetContext) || RESONANT_MUSIC_CONTEXTS.has(this.currentContext);
        // A game-mode change (into or out of CREATIVE) is a deliberate action, not a
        // biome wander, switch promptly instead of waiting out the biome debounce,
        // so the right track starts even when nothing is currently playing.
        const isCreativeSwitch = targetContext === 'CREATIVE' || this.currentContext === 'CREATIVE';
        // Leaving the boss track while the boss is STILL ALIVE is usually an aggro
        // flicker (a beat of combat:stop mid-fight), not the fight ending, debounce
        // it so the music doesn't thrash boss↔biome. A real end (boss dead/cleared,
        // player dead, quitting to menu) switches away instantly as before.
        const leavingLiveBossFlicker = this.currentContext === 'BOSS_MAGNETIC'
            && targetContext !== 'BOSS_MAGNETIC' && this.bossAlive && !inMenu;
        const threshold = leavingLiveBossFlicker
            ? 3000
            : (isMenuSwitch || isDeathSwitch || isBossSwitch || isCreativeSwitch || isVaultSwitch)
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
        if (this.shouldCrossfadeContinuousTrack(targetContext)) {
            this.crossfadeContinuousTrack();
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

    private requestImmediateContextCrossfade(newContext: string, fadeSeconds: number): void {
        if (this.isDeathSuspended) return;
        const hasNewTracks = this.tagsForContext(newContext)
            .some((tag) => soundManager.hasTracksForEvent(`music.${tag}`));
        if (!hasNewTracks || (this.currentContext === newContext && this.isPlaying)) return;
        this.transitionState = reduceMusicRequest(this.transitionState, {
            context: newContext,
            reason: newContext === 'BOSS_RESONANT' ? 'vault:titan-awakened' : 'music:priority-change',
        });
        this.currentContext = newContext;
        this.pendingContext = newContext;
        this.contextStableTime = Date.now();
        this.isTransitioning = false;
        this.bloodMoonLoopCrossfadePending = false;
        this.continuousLoopCrossfadePending = false;
        void this.playNextTrack(fadeSeconds, fadeSeconds);
    }

    private switchContext(newContext: string, isFast: boolean = false) {
        // Don't stop current music if the new context has no available tracks
        const newTags = this.tagsForContext(newContext);
        const hasNewTracks = newTags.some(tag => soundManager.hasTracksForEvent(`music.${tag}`));
        if (!hasNewTracks) {
            console.log(`[Music] Context ${newContext} has no tracks, staying in ${this.currentContext || 'current'}.`);
            this.pendingContext = this.currentContext;
            this.contextStableTime = Date.now();
            return;
        }

        if (RESONANT_MUSIC_CONTEXTS.has(newContext) || RESONANT_MUSIC_CONTEXTS.has(this.currentContext)) {
            this.requestImmediateContextCrossfade(newContext, PRIORITY_CROSSFADE_SECONDS);
            return;
        }

        // Continuity: if the song currently playing belongs to a tag the new
        // context still uses (e.g. crossing from tundra to mountains, both 'cold',
        // or generic caves into a dripstone cave, both 'caves'), keep it playing.
        // Just adopt the new context so the NEXT song comes from the new pool.
        if (this.isPlaying && this.currentTrackTag && newTags.includes(this.currentTrackTag)) {
            console.log(`[Music] Context ${newContext} shares tag '${this.currentTrackTag}', keeping current track.`);
            this.currentContext = newContext;
            this.pendingContext = newContext;
            this.bloodMoonLoopCrossfadePending = false;
            return;
        }

        console.log(`[Music] Switching to ${newContext} (Fast: ${isFast})`);
        const previousContext = this.currentContext;
        this.currentContext = newContext;
        this.bloodMoonLoopCrossfadePending = false;

        const leavingDeath = previousContext === 'DEATH';
        const leavingMenuForWorld = previousContext === 'MENU' && newContext !== 'MENU';
        const enteringMenu = newContext === 'MENU';
        const enteringBoss = newContext === 'BOSS_MAGNETIC' || newContext === 'BOSS_RESONANT';
        const enteringVaultAction = newContext === 'VAULT_COMBAT' || newContext === 'VAULT_ESCAPE';
        const leavingBloodMoon = previousContext === 'BLOODMOON' && newContext !== 'BLOODMOON';

        let fadeOut = isFast ? FAST_FADE_OUT : TRANSITION_FADE_OUT;
        let silence = isFast ? FAST_SILENCE : TRANSITION_SILENCE;

        if (enteringBoss) {
            // Quickly duck out whatever was playing; the boss track starts dry.
            fadeOut = 0.5;
            silence = 0;
        } else if (enteringVaultAction) {
            fadeOut = 0.8;
            silence = 0;
        } else if (leavingDeath) {
            // Death music fades out quickly before the world/menu music resumes.
            fadeOut = DEATH_FADE_OUT;
            silence = 0;
        } else if (enteringMenu) {
            fadeOut = 0;
            silence = 0;
            // Menu music is always as-authored: clear any lingering fight state and
            // snap both decks back to 1.0. Safe here (no audible pitch snap) because
            // the menu switch stops the old track with a zero-length fade anyway.
            this.bossFrenzy = false;
            soundManager.setMusicPlaybackRate(1.0);
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

    public stopForDeath() {
        // Player death always ends the boss fight context (music must not resume
        // the boss track on respawn).
        this.bossAlive = false;
        this.inCombat = false;
        // Vault contexts are set by one-shot events (escape-started fires once
        // per claim), so they must survive death: the encounter, Titan fight,
        // and escape all persist across a respawn and their scores resume.
        // Death music still outranks them while it plays.
        if (this.isDeathSuspended) return; // already in death music, don't restart it

        this.bossFrenzy = false;
        this.isDeathSuspended = true;
        this.isTransitioning = false;
        this.bloodMoonLoopCrossfadePending = false;
        this.currentContext = 'DEATH';
        this.pendingContext = 'DEATH';
        this.contextStableTime = Date.now();
        this.lastFinishTime = Date.now();
        this.nextPlayTime = Number.POSITIVE_INFINITY;
        this.transitionState = reduceMusicRequest(this.transitionState, {
            context: 'DEATH',
            reason: 'player:death',
        });

        // The death cue is a direct priority crossfade. It plays once, then
        // onTrackFinished keeps the controller silent until respawn or menu.
        this.isPlaying = false;
        void this.playNextTrack(PRIORITY_CROSSFADE_SECONDS, PRIORITY_CROSSFADE_SECONDS);
    }

    public resumeAfterDeath() {
        if (!this.isDeathSuspended) return;

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

    private shouldCrossfadeContinuousTrack(targetContext: string): boolean {
        if (targetContext !== this.currentContext || !CONTINUOUS_MUSIC_CONTEXTS.has(this.currentContext)) return false;
        if (!this.isPlaying || this.isTransitioning || this.continuousLoopCrossfadePending) return false;
        const timeRemaining = soundManager.getActiveMusicTimeRemaining();
        return timeRemaining !== null && timeRemaining <= CONTINUOUS_LOOP_CROSSFADE;
    }

    private crossfadeContinuousTrack(): void {
        this.continuousLoopCrossfadePending = true;
        this.playNextTrack(CONTINUOUS_LOOP_CROSSFADE, CONTINUOUS_LOOP_CROSSFADE).finally(() => {
            this.continuousLoopCrossfadePending = false;
        });
    }

    private crossfadeBloodMoonLoop() {
        this.bloodMoonLoopCrossfadePending = true;
        this.playNextTrack(BLOOD_MOON_LOOP_CROSSFADE).finally(() => {
            this.bloodMoonLoopCrossfadePending = false;
        });
    }

    private getFadeInForContext(context: string) {
        if (context === 'BLOODMOON') return BLOOD_MOON_FADE_IN;
        if (context === 'BOSS_MAGNETIC') return 0;
        if (context === 'BOSS_RESONANT') return 0.25;
        if (context === 'VAULT_ESCAPE') return 0.35;
        if (context === 'VAULT_COMBAT') return 0.75;
        if (context === 'VAULT') return 2.5;
        return STANDARD_FADE_IN;
    }

    private playNextTrack(fadeTime = STANDARD_FADE_IN, fadeOutTime: number = fadeTime) {
        // Pool the current context's tags and pick one at random among those that
        // actually have songs (so a biome plays a random song across all of its
        // populated tags, and empty tags simply drop out).
        const playableTags = this.tagsForContext(this.currentContext)
            .filter(tag => soundManager.hasTracksForEvent(`music.${tag}`));
        if (playableTags.length === 0) {
            // Nothing playable for this context (all its tag folders empty), retry later.
            this.isPlaying = false;
            this.nextPlayTime = Date.now() + (this.currentContext === 'MENU' ? 250 : 30000);
            return Promise.resolve();
        }

        const tag = playableTags[Math.floor(Math.random() * playableTags.length)];
        this.currentTrackTag = tag;
        this.transitionState = {
            ...this.transitionState,
            activeTrack: tag,
        };
        const trackId = `music.${tag}`;

        // Optimistically lock to prevent double triggers
        this.isPlaying = true;

        // Night slowdown: only regular wandering music (biomes/caves/creative). Menu,
        // death and blood-moon tracks are meant to sound as-authored. Decided here, at
        // track start, so a song already playing when night falls keeps its rate and
        // only the next song picks up the effect.
        const useNightRate = this.nightSlowdownEnabled && this.isNight
            && this.currentContext !== 'MENU'
            && this.currentContext !== 'DEATH'
            && this.currentContext !== 'BLOODMOON'
            && !RESONANT_MUSIC_CONTEXTS.has(this.currentContext);
        // Frenzy overrides night: the fight track always drives UP +100 cents.
        const playbackRate = this.bossFrenzy ? FRENZY_PLAYBACK_RATE : (useNightRate ? NIGHT_PLAYBACK_RATE : 1.0);

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
        this.continuousLoopCrossfadePending = false;
        this.lastFinishTime = Date.now();
        if (this.isDeathSuspended) {
            // Death music plays once, after it ends, stay silent until respawn / menu.
            this.nextPlayTime = Number.POSITIVE_INFINITY;
            return;
        }
        // Authored vault states and boss music restart immediately so encounters
        // and the collapse never fall back to unrelated biome silence.
        if (CONTINUOUS_MUSIC_CONTEXTS.has(this.currentContext)) {
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
