// Gate 0: Presentation + audio baseline registries.
// Reusable material/atmosphere/music contracts so regions theme effects
// without changing gameplay meaning (universal response grammar is fixed).

export interface MaterialProfile {
  id: string;
  albedo: string;
  emissive?: string;
  roughness?: number;
  metalness?: number;
  transparency?: 'opaque' | 'cutout' | 'translucent';
  windResponse?: boolean;
}

export interface AtmosphereProfile {
  id: string;
  region: string;
  fogColor: string;
  skyTop: string;
  skyBottom: string;
  ambientParticle: string;
}

export interface MusicState {
  id: string;
  region: string;
  layer: 'exploration' | 'combat' | 'boss_phase' | 'post_clear';
  caption: string;
}

const materials = new Map<string, MaterialProfile>();
const atmospheres = new Map<string, AtmosphereProfile>();
const musicStates = new Map<string, MusicState>();

export function registerMaterial(profile: MaterialProfile): void {
  if (materials.has(profile.id)) throw new Error(`Duplicate material: ${profile.id}`);
  materials.set(profile.id, profile);
}

export function registerAtmosphere(profile: AtmosphereProfile): void {
  if (atmospheres.has(profile.id)) throw new Error(`Duplicate atmosphere: ${profile.id}`);
  atmospheres.set(profile.id, profile);
}

export function registerMusicState(state: MusicState): void {
  if (musicStates.has(state.id)) throw new Error(`Duplicate music state: ${state.id}`);
  musicStates.set(state.id, state);
}

export function listMaterials(): MaterialProfile[] {
  return Array.from(materials.values());
}

export function listAtmospheres(): AtmosphereProfile[] {
  return Array.from(atmospheres.values());
}

export function listMusicStates(): MusicState[] {
  return Array.from(musicStates.values());
}

/** Universal combat response grammar (fixed meaning, themable presentation). */
export const UNIVERSAL_RESPONSE_GRAMMAR = Object.freeze({
  guard_parry: 'tightening contact glint + short rising metallic cue',
  heavy_guard: 'double-ring cue + lower metallic tone',
  dodge_only: 'three-pronged break shape + low tearing cue',
  jumpable_sweep: 'low floor ripple + rising whoosh',
  positioning: 'persistent bounded floor shape + pulsing environmental sound',
  reflectable: 'concentric diamond rings + clean ping',
  interruptible: 'unstable weak point + accelerating crackle',
});

export function clearPresentationRegistriesForTests(): void {
  materials.clear();
  atmospheres.clear();
  musicStates.clear();
}
