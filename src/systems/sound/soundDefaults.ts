
import { SoundManifest } from './soundTypes';

// These defaults ensure the game tries to play SOMETHING even if the JSON is missing.
// The actual files usually reside in public/assets/rvx/sounds/
export const DEFAULT_SOUND_MANIFEST: SoundManifest = {
    // UI
    "ui.click": { category: "ui", sounds: ["ui/click"], volume: 0.25, pitch: 1.0 },
    "ui.hover": { category: "ui", sounds: ["ui/hover"], volume: 0.1, pitch: 1.5 },
    "ui.slider": { category: "ui", sounds: ["ui/slider"], volume: 0.25, pitch: 1.0 }, 
    "ui.open": { category: "ui", sounds: ["random/chestopen"], volume: 0.5 },
    "ui.close": { category: "ui", sounds: ["random/chestclosed"], volume: 0.5 },
    
    // Player
    "entity.player.hurt": { category: "player", sounds: ["random/classic_hurt"], volume: 1.0 },
    "entity.player.death": { category: "player", sounds: ["random/classic_hurt"], volume: 1.0, pitch: 0.6 },
    "entity.item.pickup": { category: "player", sounds: ["random/pop"], volume: 0.5, pitch: [1.5, 1.8] },

    // Generic Block Sounds (Fallback)
    "block.generic.step": { category: "blocks", sounds: ["step/stone1", "step/stone2", "step/stone3"], volume: 0.2 },
    "block.generic.place": { category: "blocks", sounds: ["step/stone1"], volume: 0.8 },
    "block.generic.break": { category: "blocks", sounds: ["dig/stone1", "dig/stone2"], volume: 0.8 },
    "block.generic.hit": { category: "blocks", sounds: ["dig/stone1"], volume: 0.3 },
    "block.generic.land": { category: "blocks", sounds: ["step/stone1"], volume: 0.5 },

    // Grass
    "block.grass.step": { category: "blocks", sounds: ["step/grass1", "step/grass2", "step/grass3"], volume: 0.3 },
    "block.grass.place": { category: "blocks", sounds: ["dig/grass1"], volume: 0.8 },
    "block.grass.break": { category: "blocks", sounds: ["dig/grass1", "dig/grass2"], volume: 0.8 },
    "block.grass.hit": { category: "blocks", sounds: ["dig/grass1"], volume: 0.4 },
    "block.grass.land": { category: "blocks", sounds: ["step/grass1"], volume: 0.6 },

    // Stone
    "block.stone.step": { category: "blocks", sounds: ["step/stone1", "step/stone2", "step/stone3"], volume: 0.4 },
    "block.stone.place": { category: "blocks", sounds: ["dig/stone1"], volume: 0.8 },
    "block.stone.break": { category: "blocks", sounds: ["dig/stone1", "dig/stone2"], volume: 0.8 },
    "block.stone.hit": { category: "blocks", sounds: ["dig/stone1"], volume: 0.4 },
    "block.stone.land": { category: "blocks", sounds: ["step/stone1"], volume: 0.7 },

    // Wood
    "block.wood.step": { category: "blocks", sounds: ["step/wood1", "step/wood2", "step/wood3"], volume: 0.4 },
    "block.wood.place": { category: "blocks", sounds: ["dig/wood1"], volume: 0.8 },
    "block.wood.break": { category: "blocks", sounds: ["dig/wood1", "dig/wood2"], volume: 0.8 },
    "block.wood.hit": { category: "blocks", sounds: ["dig/wood1"], volume: 0.4 },
    "block.wood.land": { category: "blocks", sounds: ["step/wood1"], volume: 0.7 },

    // Sand
    "block.sand.step": { category: "blocks", sounds: ["step/sand1", "step/sand2", "step/sand3"], volume: 0.4 },
    "block.sand.place": { category: "blocks", sounds: ["dig/sand1"], volume: 0.8 },
    "block.sand.break": { category: "blocks", sounds: ["dig/sand1", "dig/sand2"], volume: 0.8 },
    "block.sand.hit": { category: "blocks", sounds: ["dig/sand1"], volume: 0.4 },
    "block.sand.land": { category: "blocks", sounds: ["step/sand1"], volume: 0.7 },

    // Water
    "block.water.swim": { category: "player", sounds: ["liquid/swim1", "liquid/swim2"], "volume": 0.4, "pitch": [0.8, 1.2] },
    "block.lava.pop": { category: "ambient", "sounds": ["liquid/lavapop"], "volume": 0.8 },

    // --- MUSIC ---
    "music.menu": { category: "music", sounds: ["music/menu"], volume: 0.5 },
    "music.creative": { category: "music", sounds: ["music/creative"], volume: 0.5 },

    // Exclusive Biome Tracks
    "music.plains": { category: "music", sounds: ["music/plains"], volume: 0.5 },
    "music.forest": { category: "music", sounds: ["music/forest"], volume: 0.5 },
    "music.desert": { category: "music", sounds: ["music/desert"], volume: 0.5 },
    "music.ocean": { category: "music", sounds: ["music/ocean"], volume: 0.5 },
    "music.cold": { category: "music", sounds: ["music/cold"], volume: 0.5 }, // Tundra, Frozen Ocean/River
    "music.cherry": { category: "music", sounds: ["music/cherry"], volume: 0.5 },
    "music.mesa": { category: "music", sounds: ["music/mesa"], volume: 0.5 }, // Red Mesa & Bryce
    "music.volcanic": { category: "music", sounds: ["music/volcanic"], volume: 0.5 }
};
