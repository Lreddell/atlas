
import * as THREE from 'three';
import { SoundManifest, SoundEventDefinition, SoundOptions } from './soundTypes';
import { DEFAULT_SOUND_MANIFEST } from './soundDefaults';

const SOUND_VOLUME_KEY_PREFIX = 'atlas.sound.volume.';
const MUSIC_FOLDER_INDEX_PATH = 'assets/rvx/sounds/music-index.json';

// Helper to build URLs relative to the current location (file or http)
const assetUrl = (path: string) => {
    try {
        const base = window.location.href;
        return new URL(path, base).toString();
    } catch (e) {
        return path.startsWith('/') ? path : '/' + path;
    }
};

class SoundManager {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    
    // "World" Bus handles everything except UI. Used for muffling/ducking.
    private worldGain: GainNode | null = null;
    private worldFilter: BiquadFilterNode | null = null;

    private categoryGains: Map<string, GainNode> = new Map();
    private manifest: SoundManifest = DEFAULT_SOUND_MANIFEST;
    private buffers: Map<string, AudioBuffer> = new Map();
    private bufferLoadPromises: Map<string, Promise<AudioBuffer | null>> = new Map();
    
    private enabled: boolean = true;
    
    private activeSources: Set<AudioBufferSourceNode> = new Set();
    private activeByEvent: Map<string, Set<AudioBufferSourceNode>> = new Map();
    private readonly MAX_GLOBAL_SOURCES = 48;
    private readonly MAX_EVENT_SOURCES = 6;

    private musicFolderIndex: Map<string, string[]> = new Map();

    // Music Streaming State (Dual Deck for Crossfade)
    private musicDeckA: HTMLAudioElement | null = null;
    private musicDeckB: HTMLAudioElement | null = null;
    private musicGainA: GainNode | null = null;
    private musicGainB: GainNode | null = null;
    private activeDeck: 'A' | 'B' | null = null;
    private musicStopTimeoutA: number | null = null;
    private musicStopTimeoutB: number | null = null;

    // Temp vectors for listener update to reduce GC
    private tmpPos = new THREE.Vector3();
    private tmpDir = new THREE.Vector3();
    private tmpUp = new THREE.Vector3();

    constructor() {
        // Lazy init in init()
    }

    public async init() {
        if (this.ctx) {
            // Already initialized — just resume if suspended, don't reload the folder index
            // (reloading clears the index causing a brief gap where tracks appear missing)
            if (this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
            return;
        }

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                this.ctx = new AudioContextClass();
                this.masterGain = this.ctx.createGain();
                this.masterGain.connect(this.ctx.destination);
                
                // Create World Bus (Gain + LowPass Filter)
                this.worldGain = this.ctx.createGain();
                this.worldFilter = this.ctx.createBiquadFilter();
                this.worldFilter.type = 'lowpass';
                this.worldFilter.frequency.value = 22000; // Open by default
                this.worldFilter.Q.value = 0.5;

                // Chain: WorldGain -> WorldFilter -> MasterGain
                this.worldGain.connect(this.worldFilter);
                this.worldFilter.connect(this.masterGain);

                // Load Manifest
                try {
                    const url = assetUrl('assets/rvx/sounds.json');
                    const response = await fetch(url);
                    if (response.ok) {
                        const json = await response.json();
                        this.manifest = { ...DEFAULT_SOUND_MANIFEST, ...json };
                        console.log(`Loaded sound manifest with ${Object.keys(this.manifest).length} events.`);
                    } else {
                        console.warn('Failed to load sounds.json (404), using defaults.');
                    }
                } catch (e) {
                    console.debug('Error loading sounds.json, using defaults:', e);
                }

                await this.loadMusicFolderIndex();

                const categories = new Set<string>([
                    'master', 'music', 'ambient', 'blocks', 'player', 'ui', 'hostile', 'neutral'
                ]);

                Object.values(this.manifest).forEach(def => {
                    if (!Array.isArray(def) && def.category) {
                        categories.add(def.category);
                    }
                });

                // Clear any existing category gains
                this.categoryGains.clear();

                // Create Category Gains
                categories.forEach(cat => {
                    if (!this.ctx || !this.masterGain || !this.worldGain) return;
                    const g = this.ctx.createGain();
                    
                    // UI connects directly to Master (bypasses world effects like muffling)
                    if (cat === 'ui' || cat === 'master') {
                        g.connect(this.masterGain); 
                    } else {
                        // All game sounds connect to World Bus
                        g.connect(this.worldGain);
                    }
                    
                    this.categoryGains.set(cat, g);
                });

                categories.forEach(cat => {
                    if (typeof window === 'undefined') return;
                    const raw = window.localStorage.getItem(`${SOUND_VOLUME_KEY_PREFIX}${cat}`);
                    if (raw == null) return;
                    const value = Number(raw);
                    if (!Number.isFinite(value)) return;
                    this.setVolume(cat, Math.max(0, Math.min(1, value)));
                });

                // Initialize Music Streaming Decks
                this.initMusicDeck('A');
                this.initMusicDeck('B');

            } else {
                console.warn('WebAudio not supported');
                this.enabled = false;
            }
        } catch (e) {
            console.error('SoundManager init failed:', e);
            this.enabled = false;
        }
    }

    private initMusicDeck(deckId: 'A' | 'B') {
        if (!this.ctx) return;
        const musicBus = this.categoryGains.get('music');
        if (!musicBus) return;

        const audio = new Audio();
        audio.crossOrigin = "anonymous";
        audio.loop = false;
        // Don't set audio.volume here; we control volume via the GainNode below.
        
        try {
            const source = this.ctx.createMediaElementSource(audio);
            const gain = this.ctx.createGain();
            gain.gain.value = 0; // Start silent

            source.connect(gain);
            gain.connect(musicBus);

            if (deckId === 'A') {
                this.musicDeckA = audio;
                this.musicGainA = gain;
            } else {
                this.musicDeckB = audio;
                this.musicGainB = gain;
            }
        } catch (e) {
            console.warn("Failed to create MediaElementSource for music:", e);
        }
    }

    private clearMusicStopTimeout(deckId: 'A' | 'B') {
        const timeoutId = deckId === 'A' ? this.musicStopTimeoutA : this.musicStopTimeoutB;
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }

        if (deckId === 'A') {
            this.musicStopTimeoutA = null;
        } else {
            this.musicStopTimeoutB = null;
        }
    }

    private async loadMusicFolderIndex() {
        // Build into a temp map first, then swap atomically so there is never
        // a window where the index is empty while music is already playing.
        const newIndex = new Map<string, string[]>();

        // In Electron: dynamically scan the music folder (any filename, any audio extension)
        if (typeof window !== 'undefined' && window.atlasDesktop?.scanMusicFolders) {
            try {
                const result = await window.atlasDesktop.scanMusicFolders();
                if (result?.ok && result.index) {
                    Object.entries(result.index).forEach(([folderName, tracks]) => {
                        if (!Array.isArray(tracks)) return;
                        const normalizedTracks = tracks
                            .map(t => t.replace(/\\/g, '/').replace(/^\/+/, '').trim())
                            .filter(t => t.length > 0);
                        if (normalizedTracks.length > 0) {
                            newIndex.set(folderName.toLowerCase(), normalizedTracks);
                        }
                    });
                    this.musicFolderIndex = newIndex;
                    return;
                }
            } catch (e) {
                console.debug('Electron music scan failed, falling back to index file:', e);
            }
        }

        // Fall back to static music-index.json (web / no Electron)
        try {
            const response = await fetch(assetUrl(MUSIC_FOLDER_INDEX_PATH), { cache: 'no-store' });
            if (!response.ok) {
                console.warn(`Failed to load music folder index (${response.status}).`);
                return;
            }

            const json = await response.json() as Record<string, unknown>;
            Object.entries(json).forEach(([folderName, tracks]) => {
                if (!Array.isArray(tracks)) return;

                const normalizedTracks = tracks
                    .filter((track): track is string => typeof track === 'string')
                    .map(track => track.replace(/\\/g, '/').replace(/^\/+/, '').trim())
                    .filter(track => track.length > 0);

                if (normalizedTracks.length > 0) {
                    newIndex.set(folderName.toLowerCase(), normalizedTracks);
                }
            });
            this.musicFolderIndex = newIndex;
        } catch (e) {
            console.debug('Error loading music folder index:', e);
        }
    }

    public hasTracksForEvent(eventId: string): boolean {
        const def = this.getDefinition(eventId);
        if (!def) return false;
        return this.getMusicTracksForEvent(eventId, def).length > 0;
    }

    private getMusicTracksForEvent(eventId: string, def: SoundEventDefinition): string[] {
        const eventFolder = eventId.startsWith('music.') ? eventId.slice('music.'.length).toLowerCase() : '';
        if (eventFolder) {
            const tracks = this.musicFolderIndex.get(eventFolder);
            if (tracks && tracks.length > 0) {
                return tracks;
            }
        }

        const folderMarker = eventFolder ? `music/${eventFolder}` : '';
        return def.sounds
            .map(soundPath => soundPath.replace(/\\/g, '/').replace(/^\/+/, '').trim())
            .filter(soundPath => soundPath.length > 0)
            .filter(soundPath => soundPath.toLowerCase() !== folderMarker);
    }

    private resolveMusicTrackUrl(trackPath: string): string {
        const normalizedPath = trackPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
        const hasAudioExt = /\.(ogg|mp3|wav|flac|m4a|opus|aac|webm)$/i.test(normalizedPath);
        const withExt = hasAudioExt ? normalizedPath : `${normalizedPath}.ogg`;

        if (withExt.startsWith('assets/')) {
            return assetUrl(withExt);
        }

        return assetUrl(`assets/rvx/sounds/${withExt}`);
    }

    public isPlaybackReady() {
        return !!this.enabled && !!this.ctx && this.ctx.state === 'running';
    }

    public async resume() {
        if (!this.enabled || !this.ctx) return false;
        if (this.ctx.state === 'running') return true;

        try {
            await this.ctx.resume();
            const currentState = this.ctx.state as AudioContextState;
            return currentState === 'running';
        } catch (e) {
            console.warn('Audio resume failed', e);
            return false;
        }
    }

    public setGamePaused(paused: boolean, duration: number = 0.8) {
        if (!this.ctx || !this.worldFilter || !this.worldGain) return;
        
        try {
            const now = this.ctx.currentTime;
            
            if (paused) {
                // Muffle: Cutoff at 800Hz (less muffled than 400), Volume down to 0.6 (louder than 0.4)
                this.worldFilter.frequency.setTargetAtTime(800, now, duration);
                this.worldGain.gain.setTargetAtTime(0.6, now, duration);
            } else {
                // Restore: Cutoff at 22kHz, Volume 1.0
                this.worldFilter.frequency.setTargetAtTime(22000, now, duration);
                this.worldGain.gain.setTargetAtTime(1.0, now, duration);
            }
        } catch (e) {
            console.warn("Audio param set failed:", e);
        }
    }

    public async preload(soundIds: string[]) {
        if (!this.ctx) return;
        
        const promises = soundIds.map(async (id) => {
            const def = this.getDefinition(id);
            if (!def || !def.sounds) return;
            
            for (const path of def.sounds) {
                if (path === "silence" || path === "none") continue;
                // Skip preloading music to save memory/bandwidth
                if (def.category === 'music') continue;

                try {
                    await this.getBuffer(path);
                } catch(e) {
                    // Swallow error during preload
                }
            }
        });
        await Promise.all(promises);
    }

    public setVolume(category: string, volume: number) {
        if (!this.enabled || !this.ctx) return;
        const clamped = Math.max(0, Math.min(1, volume));
        try {
            if (category === 'master') {
                if (this.masterGain) this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.1);
            } else {
                const g = this.categoryGains.get(category);
                if (g) g.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.1);
            }
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(`${SOUND_VOLUME_KEY_PREFIX}${category}`, String(clamped));
            }
        } catch(e) {}
    }

    public getVolume(category: string): number {
        if (!this.enabled || !this.ctx) return 0;
        if (category === 'master') {
            return this.masterGain ? this.masterGain.gain.value : 1.0;
        }
        const g = this.categoryGains.get(category);
        return g ? g.gain.value : 1.0;
    }

    public updateListener(camera: THREE.Camera) {
        if (!this.enabled || !this.ctx) return;
        
        try {
            const l = this.ctx.listener;
            
            this.tmpPos.copy(camera.position);
            camera.getWorldDirection(this.tmpDir);
            this.tmpUp.copy(camera.up).applyQuaternion(camera.quaternion);
            
            if (!Number.isFinite(this.tmpPos.x) || !Number.isFinite(this.tmpDir.x)) return;

            if (l.positionX) {
                l.positionX.setTargetAtTime(this.tmpPos.x, this.ctx.currentTime, 0.1);
                l.positionY.setTargetAtTime(this.tmpPos.y, this.ctx.currentTime, 0.1);
                l.positionZ.setTargetAtTime(this.tmpPos.z, this.ctx.currentTime, 0.1);
            } else {
                l.setPosition(this.tmpPos.x, this.tmpPos.y, this.tmpPos.z);
            }

            if (l.forwardX) {
                l.forwardX.setTargetAtTime(this.tmpDir.x, this.ctx.currentTime, 0.1);
                l.forwardY.setTargetAtTime(this.tmpDir.y, this.ctx.currentTime, 0.1);
                l.forwardZ.setTargetAtTime(this.tmpDir.z, this.ctx.currentTime, 0.1);
                l.upX.setTargetAtTime(this.tmpUp.x, this.ctx.currentTime, 0.1);
                l.upY.setTargetAtTime(this.tmpUp.y, this.ctx.currentTime, 0.1);
                l.upZ.setTargetAtTime(this.tmpUp.z, this.ctx.currentTime, 0.1);
            } else {
                l.setOrientation(this.tmpDir.x, this.tmpDir.y, this.tmpDir.z, this.tmpUp.x, this.tmpUp.y, this.tmpUp.z);
            }
        } catch(e) {
            // Ignore listener updates if audio context is weird or closed
        }
    }

    /**
     * Plays streaming music. Use for long audio files.
     * Guaranteed not to crash on missing files or fetch errors.
     */
    public async playMusic(eventId: string, fadeTime: number = 2.0, onEnded?: () => void, fadeOutTime: number = fadeTime) {
        if (!this.enabled || !this.ctx) return false;
        if (this.ctx.state !== 'running') return false;

        const def = this.getDefinition(eventId);
        if (!def || !def.sounds || def.sounds.length === 0) return false;

        const trackPool = this.getMusicTracksForEvent(eventId, def);
        if (trackPool.length === 0) return false;

        const selectedTrack = trackPool[Math.floor(Math.random() * trackPool.length)];
        const fullUrl = this.resolveMusicTrackUrl(selectedTrack);

        // Select Next Deck
        const nextDeckId = this.activeDeck === 'A' ? 'B' : 'A';
        const nextDeck = nextDeckId === 'A' ? this.musicDeckA : this.musicDeckB;
        const nextGain = nextDeckId === 'A' ? this.musicGainA : this.musicGainB;
        
        const prevDeck = nextDeckId === 'A' ? this.musicDeckB : this.musicDeckA;
        const prevGain = nextDeckId === 'A' ? this.musicGainB : this.musicGainA;

        if (!nextDeck || !nextGain) return false;

        this.clearMusicStopTimeout(nextDeckId);

        // Prepare Next Deck
        try {
            nextDeck.src = fullUrl;
            nextDeck.load();
        } catch (e) {
            console.warn("[SoundManager] Music load failed:", e);
            return false;
        }

        // Setup Volume
        let targetVol = 1.0;
        if (def.volume !== undefined) {
            targetVol = Array.isArray(def.volume) ? def.volume[0] : def.volume;
        }

        // Setup Events
        nextDeck.onended = () => {
            if (this.activeDeck === nextDeckId && onEnded) onEnded();
        };
        nextDeck.onerror = (e) => {
            console.warn(`[SoundManager] Music stream error: ${selectedTrack}`, e);
            if (this.activeDeck === nextDeckId && onEnded) onEnded();
        };

        // Play
        try {
            await nextDeck.play();
        } catch (e) {
            console.warn(`[SoundManager] Play failed (missing file?): ${selectedTrack}`, e);
            return false;
        }

        const now = this.ctx.currentTime;

        // Crossfade: Fade In Next
        nextGain.gain.cancelScheduledValues(now);
        nextGain.gain.setValueAtTime(0, now);
        nextGain.gain.linearRampToValueAtTime(targetVol, now + fadeTime);

        // Crossfade: Fade Out Prev
        if (prevDeck && prevGain && this.activeDeck) {
            prevGain.gain.cancelScheduledValues(now);
            prevGain.gain.setValueAtTime(prevGain.gain.value, now);
            prevGain.gain.linearRampToValueAtTime(0, now + fadeOutTime);
            
            setTimeout(() => {
                if (this.activeDeck !== (nextDeckId === 'A' ? 'B' : 'A')) return; 
                prevDeck.pause();
                prevDeck.currentTime = 0;
            }, fadeOutTime * 1000 + 100);
        }

        this.activeDeck = nextDeckId;
        return true;
    }

    public stopMusic(fadeTime: number = 2.0) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        [
            { deckId: 'A' as const, deck: this.musicDeckA, gain: this.musicGainA },
            { deckId: 'B' as const, deck: this.musicDeckB, gain: this.musicGainB }
        ].forEach(({ deckId, deck, gain }) => {
            if (deck && gain) {
                this.clearMusicStopTimeout(deckId);

                // Remove listeners
                deck.onended = null;
                deck.onerror = null;

                gain.gain.cancelScheduledValues(now);
                gain.gain.setValueAtTime(gain.gain.value, now);
                gain.gain.linearRampToValueAtTime(0, now + fadeTime);

                const timeoutId = window.setTimeout(() => {
                    if (this.activeDeck === deckId) return;
                    deck.pause();
                    deck.currentTime = 0;
                    if (deckId === 'A') {
                        this.musicStopTimeoutA = null;
                    } else {
                        this.musicStopTimeoutB = null;
                    }
                }, fadeTime * 1000 + 100);

                if (deckId === 'A') {
                    this.musicStopTimeoutA = timeoutId;
                } else {
                    this.musicStopTimeoutB = timeoutId;
                }
            }
        });
        
        this.activeDeck = null;
    }

    public getActiveMusicTimeRemaining(): number | null {
        const activeDeck = this.activeDeck === 'A'
            ? this.musicDeckA
            : this.activeDeck === 'B'
                ? this.musicDeckB
                : null;

        if (!activeDeck || activeDeck.paused) return null;

        const { duration, currentTime } = activeDeck;
        if (!Number.isFinite(duration) || duration <= 0) return null;

        return Math.max(0, duration - currentTime);
    }

    private createFallbackBuffer(path: string): AudioBuffer | null {
        if (!this.ctx) return null;
        try {
            const sampleRate = this.ctx.sampleRate;
            
            const createNoise = (duration: number, decayRate: number, filterType: 'low'|'high'|'none' = 'none', cutoffFreq: number = 1000) => {
                const length = Math.floor(sampleRate * duration);
                const buffer = this.ctx!.createBuffer(1, length, sampleRate);
                const data = buffer.getChannelData(0);
                
                let lastOut = 0;
                const rc = 1.0 / (2 * Math.PI * cutoffFreq);
                const dt = 1.0 / sampleRate;
                const alpha = dt / (rc + dt);

                for (let i = 0; i < length; i++) {
                    const t = i / sampleRate;
                    const white = Math.random() * 2 - 1;
                    let output = white;

                    if (filterType === 'low') {
                        lastOut = lastOut + alpha * (white - lastOut);
                        output = lastOut;
                    } else if (filterType === 'high') {
                        lastOut = lastOut + alpha * (white - lastOut);
                        output = white - lastOut;
                    }
                    const envelope = Math.exp(-t * decayRate);
                    data[i] = output * envelope;
                }
                return buffer;
            };

            const createOsc = (duration: number, type: 'sine'|'square'|'saw', startFreq: number, endFreq: number, decayRate: number) => {
                const length = Math.floor(sampleRate * duration);
                const buffer = this.ctx!.createBuffer(1, length, sampleRate);
                const data = buffer.getChannelData(0);
                let phase = 0;

                for (let i = 0; i < length; i++) {
                    const t = i / sampleRate;
                    const progress = i / length;
                    const currentFreq = startFreq + (endFreq - startFreq) * progress;
                    phase += currentFreq * (1.0 / sampleRate);
                    
                    let val = 0;
                    if (type === 'sine') val = Math.sin(phase * 2 * Math.PI);
                    else if (type === 'square') val = (phase % 1) < 0.5 ? 1 : -1;
                    else if (type === 'saw') val = (phase % 1) * 2 - 1;

                    const envelope = Math.exp(-t * decayRate);
                    data[i] = val * envelope * 0.5; 
                }
                return buffer;
            };

            const p = path.toLowerCase();

            // Music: No fallback, play silence (handled in playMusic)
            if (p.includes('music') || p.includes('calm') || p.includes('piano')) {
                return null;
            }

            if (p.includes('liquid') || p.includes('water') || p.includes('swim') || p.includes('lava')) {
                const isLava = p.includes('lava');
                const freqStart = isLava ? 300 : 800;
                const freqEnd = isLava ? 100 : 200;
                return createOsc(0.2, 'sine', freqStart, freqEnd, 15);
            }
            if (p.includes('wood') || p.includes('chest') || p.includes('barrel') || p.includes('plank')) {
                return createNoise(0.15, 25, 'low', 500); 
            }
            if (p.includes('stone') || p.includes('rock') || p.includes('cobble') || p.includes('brick') || p.includes('ore') || p.includes('metal')) {
                return createNoise(0.1, 40, 'high', 2000); 
            }
            if (p.includes('grass') || p.includes('dirt') || p.includes('sand') || p.includes('leaves') || p.includes('gravel')) {
                return createNoise(0.15, 30, 'none');
            }
            if (p.includes('click') || p.includes('ui') || p.includes('menu')) {
                return createOsc(0.05, 'sine', 1200, 1200, 100);
            }
            if (p.includes('pop') || p.includes('pickup')) {
                return createOsc(0.15, 'sine', 400, 800, 10);
            }
            if (p.includes('hurt') || p.includes('damage')) {
                return createOsc(0.25, 'saw', 150, 80, 15);
            }

            return createNoise(0.1, 20, 'low', 800);
        } catch (e) {
            console.warn("Fallback synthesis failed:", e);
            return null;
        }
    }

    private async getBuffer(path: string): Promise<AudioBuffer | null> {
        if (!this.ctx) return null;
        
        let url = path;
        if (!path.endsWith('.ogg') && !path.endsWith('.mp3') && !path.endsWith('.wav')) {
            url = path + '.ogg';
        }
        
        const fullUrl = assetUrl(`assets/rvx/sounds/${url}`);
        
        if (this.buffers.has(fullUrl)) return this.buffers.get(fullUrl)!;
        if (this.bufferLoadPromises.has(fullUrl)) return this.bufferLoadPromises.get(fullUrl)!;

        const loadPromise = (async () => {
            try {
                const res = await fetch(fullUrl);
                if (!res.ok) throw new Error(`Status ${res.status}`);
                const arrayBuffer = await res.arrayBuffer();
                
                if (!this.ctx) throw new Error("No AudioContext");
                
                if (arrayBuffer.byteLength === 0) {
                    throw new Error("Empty file");
                }

                const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                this.buffers.set(fullUrl, audioBuffer);
                return audioBuffer;
            } catch (e) {
                if (this.ctx) {
                    const fallback = this.createFallbackBuffer(url);
                    if (fallback) {
                        this.buffers.set(fullUrl, fallback);
                        return fallback;
                    }
                }
                this.bufferLoadPromises.delete(fullUrl);
                
                // Return null if empty or missing, preventing throws
                return null;
            }
        })();

        this.bufferLoadPromises.set(fullUrl, loadPromise);
        loadPromise.catch(() => {}); // catch internal rejection if any
        
        return loadPromise;
    }

    private getDefinition(eventId: string): SoundEventDefinition | null {
        const entry = this.manifest[eventId];
        if (!entry) return null;
        if (Array.isArray(entry)) {
            return { sounds: entry, volume: 1.0, pitch: 1.0, category: 'master' };
        }
        return entry;
    }

    public play(eventId: string, options?: SoundOptions) {
        this.playSoundInternal(eventId, null, options).catch(e => console.warn("Play error swallowed:", e));
    }

    public playAt(eventId: string, position: {x:number, y:number, z:number}, options?: SoundOptions) {
        this.playSoundInternal(eventId, position, options).catch(e => console.warn("PlayAt error swallowed:", e));
    }

    private async playSoundInternal(eventId: string, pos: {x:number, y:number, z:number} | null, opts?: SoundOptions) {
        if (!this.enabled || !this.ctx) return;
        if (this.ctx.state !== 'running') return;

        try {
            const def = this.getDefinition(eventId);
            if (!def || !def.sounds || def.sounds.length === 0) return;

            if (this.activeSources.size >= this.MAX_GLOBAL_SOURCES) return; 
            const activeForEvent = this.activeByEvent.get(eventId);
            if (activeForEvent && activeForEvent.size >= this.MAX_EVENT_SOURCES) {
                return;
            }

            const soundPath = def.sounds[Math.floor(Math.random() * def.sounds.length)];
            if (soundPath === "silence" || soundPath === "none") return;

            const buffer = await this.getBuffer(soundPath);
            if (!buffer || !this.ctx) return;

            const source = this.ctx.createBufferSource();
            source.buffer = buffer;

            let pitch = 1.0;
            if (def.pitch !== undefined) {
                if (Array.isArray(def.pitch)) {
                    pitch = def.pitch[0] + Math.random() * (def.pitch[1] - def.pitch[0]);
                } else {
                    pitch = def.pitch;
                }
            }
            if (opts?.pitch) pitch *= opts.pitch;
            
            if (!isFinite(pitch) || pitch <= 0) pitch = 1.0;
            source.playbackRate.value = pitch;

            const gain = this.ctx.createGain();
            let volume = 1.0;
            if (def.volume !== undefined) {
                if (Array.isArray(def.volume)) {
                    volume = def.volume[0] + Math.random() * (def.volume[1] - def.volume[0]);
                } else {
                    volume = def.volume;
                }
            }
            if (opts?.volume) volume *= opts.volume;
            gain.gain.value = volume;

            let targetNode: AudioNode = gain;
            
            if (pos) {
                // Ensure position isn't NaN before creating Panner
                if (Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)) {
                    const panner = this.ctx.createPanner();
                    panner.panningModel = 'HRTF';
                    panner.distanceModel = 'inverse';
                    panner.refDistance = 1.0;
                    panner.maxDistance = 64.0;
                    panner.rolloffFactor = 1.0;
                    
                    panner.positionX.value = pos.x;
                    panner.positionY.value = pos.y;
                    panner.positionZ.value = pos.z;
                    
                    targetNode.connect(panner);
                    targetNode = panner;
                }
            }

            const category = def.category || 'master';
            let catGain = this.masterGain!;
            
            if (category === 'ui' || category === 'master') {
                const g = this.categoryGains.get(category);
                if (g) catGain = g;
            } else {
                const g = this.categoryGains.get(category);
                if (g) catGain = g; 
            }
            
            targetNode.connect(catGain);

            source.connect(gain);
            source.start(0);

            this.activeSources.add(source);
            if (!this.activeByEvent.has(eventId)) this.activeByEvent.set(eventId, new Set());
            this.activeByEvent.get(eventId)!.add(source);

            source.onended = () => {
                this.activeSources.delete(source);
                const set = this.activeByEvent.get(eventId);
                if (set) {
                    set.delete(source);
                    if (set.size === 0) this.activeByEvent.delete(eventId);
                }
                try {
                    source.disconnect();
                    gain.disconnect();
                    if (targetNode instanceof PannerNode) targetNode.disconnect();
                } catch (e) { /* ignore */ }
            };
        } catch (e) {
            console.debug(`Sound failed: ${eventId}`, e);
        }
    }
}

export const soundManager = new SoundManager();
