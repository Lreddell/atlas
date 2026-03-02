
export type SoundCategory = 'master' | 'music' | 'ambient' | 'blocks' | 'player' | 'ui' | 'hostile' | 'neutral';

export interface SoundEventDefinition {
    sounds: string[]; // List of relative paths (e.g. "block/grass/step1") without extension
    volume?: number | [number, number]; // Fixed or [min, max]
    pitch?: number | [number, number]; // Fixed or [min, max]
    category?: SoundCategory;
    subtitle?: string;
}

// e.g. "block.grass.step": { ... } or just ["path/to/sound"]
export interface SoundManifest {
    [eventId: string]: SoundEventDefinition | string[];
}

export interface SoundOptions {
    volume?: number;
    pitch?: number;
    loop?: boolean;
}
