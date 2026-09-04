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
    "ability.polarity.positive": { category: "player", sounds: ["polarity/positive"], volume: 0.7 },
    "ability.polarity.negative": { category: "player", sounds: ["polarity/negative"], volume: 0.7 },

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
    "block.water.swim": { category: "player", sounds: ["liquid/swim1", "liquid/swim2"], volume: 0.4, pitch: [0.8, 1.2] },
    "block.lava.pop": { category: "ambient", sounds: ["liquid/lavapop"], volume: 0.8 },

    // Music
    "music.menu": { category: "music", sounds: ["music/menu"], volume: 0.5 },
    "music.death": { category: "music", sounds: ["music/death"], volume: 0.5 },
    "music.creative": { category: "music", sounds: ["music/creative"], volume: 0.5 },
    "music.plains": { category: "music", sounds: ["music/plains"], volume: 0.5 },
    "music.forest": { category: "music", sounds: ["music/forest"], volume: 0.5 },
    "music.desert": { category: "music", sounds: ["music/desert"], volume: 0.5 },
    "music.ocean": { category: "music", sounds: ["music/ocean"], volume: 0.5 },
    "music.cold": { category: "music", sounds: ["music/cold"], volume: 0.5 },
    "music.caves": { category: "music", sounds: ["music/caves"], volume: 0.45 },
    "music.bloodmoon": { category: "music", sounds: ["music/bloodmoon"], volume: 0.48 },
    "music.mesa": { category: "music", sounds: ["music/mesa"], volume: 0.5 },
    "music.volcanic": { category: "music", sounds: ["music/volcanic"], volume: 0.5 },
    "music.magnetic_fields": { category: "music", sounds: ["music/magnetic_fields"], volume: 0.5 },
    "music.boss_magnetic_warden": { category: "music", sounds: ["music/boss_magnetic_warden"], volume: 0.55 },
    "music.resonant_vault": { category: "music", sounds: ["music/resonant_vault"], volume: 0.42 },
    "music.resonant_combat": { category: "music", sounds: ["music/resonant_combat"], volume: 0.46 },
    "music.boss_bell_titan": { category: "music", sounds: ["music/boss_bell_titan"], volume: 0.50 },
    "music.resonant_escape": { category: "music", sounds: ["music/resonant_escape"], volume: 0.48 },

    // Music tags
    "music.river": { category: "music", sounds: ["music/river"], volume: 0.5 },
    "music.frozen_river": { category: "music", sounds: ["music/frozen_river"], volume: 0.5 },
    "music.frozen_ocean": { category: "music", sounds: ["music/frozen_ocean"], volume: 0.5 },
    "music.tundra": { category: "music", sounds: ["music/tundra"], volume: 0.5 },
    "music.taiga": { category: "music", sounds: ["music/taiga"], volume: 0.5 },
    "music.ice_spikes": { category: "music", sounds: ["music/ice_spikes"], volume: 0.5 },
    "music.mountains": { category: "music", sounds: ["music/mountains"], volume: 0.5 },
    "music.birch_forest": { category: "music", sounds: ["music/birch_forest"], volume: 0.5 },
    "music.flower_forest": { category: "music", sounds: ["music/flower_forest"], volume: 0.5 },
    "music.dark_forest": { category: "music", sounds: ["music/dark_forest"], volume: 0.5 },
    "music.jungle": { category: "music", sounds: ["music/jungle"], volume: 0.5 },
    "music.swamp": { category: "music", sounds: ["music/swamp"], volume: 0.5 },
    "music.meadow": { category: "music", sounds: ["music/meadow"], volume: 0.5 },
    "music.savanna": { category: "music", sounds: ["music/savanna"], volume: 0.5 },
    "music.stone_shore": { category: "music", sounds: ["music/stone_shore"], volume: 0.5 },
    "music.beach": { category: "music", sounds: ["music/beach"], volume: 0.5 },
    "music.cherry_grove": { category: "music", sounds: ["music/cherry_grove"], volume: 0.5 },
    "music.lush_caves": { category: "music", sounds: ["music/lush_caves"], volume: 0.45 },
    "music.dripstone_caves": { category: "music", sounds: ["music/dripstone_caves"], volume: 0.45 },

    // Magnetic Warden SFX (see public/assets/rvx/sounds/magnetic_warden/README.txt).
    // Cues without an authored file yet fall back on an existing Warden sound
    // where one fits, and stay silent (fallback: false) where none does.
    "entity.magnetic_warden.polarity": { category: "blocks", sounds: ["magnetic_warden/polarity"], volume: 0.6 },
    "entity.magnetic_warden.shielded": { category: "blocks", sounds: ["magnetic_warden/shielded"], volume: 0.5 },
    "entity.magnetic_warden.slam_rise": { category: "blocks", sounds: ["magnetic_warden/slam_rise"], volume: 0.7 },
    "entity.magnetic_warden.slam": { category: "blocks", sounds: ["magnetic_warden/slam"], volume: 0.9 },
    "entity.magnetic_warden.enrage": { category: "blocks", sounds: ["magnetic_warden/enrage"], volume: 0.9 },
    "entity.magnetic_warden.hurt": { category: "blocks", sounds: ["magnetic_warden/hurt"], volume: 0.7 },
    "entity.magnetic_warden.crystal_break": { category: "blocks", sounds: ["magnetic_warden/crystal_break"], volume: 0.85 },
    "entity.magnetic_warden.crystal_spawn": { category: "blocks", sounds: ["magnetic_warden/crystal_spawn"], volume: 0.8 },
    "entity.magnetic_warden.hum": { category: "blocks", sounds: ["magnetic_warden/hum"], volume: 0.7 },
    "entity.magnetic_warden.charge": { category: "blocks", sounds: ["magnetic_warden/charge"], volume: 0.85 },
    "entity.magnetic_warden.summon": { category: "blocks", sounds: ["magnetic_warden/summon"], volume: 1.0 },
    "entity.magnetic_warden.defeat": { category: "music", sounds: ["magnetic_warden/defeat"], volume: 0.8 },
    // Form I telegraphs.
    "entity.magnetic_warden.volley": { category: "hostile", sounds: ["magnetic_warden/volley"], volume: 0.6, fallback: false },
    "entity.magnetic_warden.lash": { category: "hostile", sounds: ["magnetic_warden/lash"], volume: 0.7, fallback: false },
    "entity.magnetic_warden.draw": { category: "hostile", sounds: ["magnetic_warden/slam_rise"], volume: 0.8, pitch: 0.85 },
    "entity.magnetic_warden.repel": { category: "hostile", sounds: ["magnetic_warden/slam"], volume: 0.9, pitch: 1.15 },
    "entity.magnetic_warden.swap_charge": { category: "hostile", sounds: ["magnetic_warden/swap_charge"], volume: 0.6, fallback: false },
    "entity.magnetic_warden.stagger": { category: "hostile", sounds: ["magnetic_warden/hurt"], volume: 0.8, pitch: 0.7 },
    // Form changes and the Aegis tether.
    "entity.magnetic_warden.shatter": { category: "hostile", sounds: ["magnetic_warden/crystal_spawn"], volume: 1.0, pitch: 0.8 },
    "entity.magnetic_warden.tether": { category: "hostile", sounds: ["magnetic_warden/hum"], volume: 0.55 },
    "entity.magnetic_warden.snap": { category: "hostile", sounds: ["magnetic_warden/deflect"], volume: 0.9 },
    "entity.magnetic_warden.crash": { category: "hostile", sounds: ["magnetic_warden/slam"], volume: 1.0, pitch: 0.8 },
    "entity.magnetic_warden.stunned": { category: "hostile", sounds: ["magnetic_warden/stunned"], volume: 0.8, fallback: false },
    "entity.magnetic_warden.storm": { category: "hostile", sounds: ["magnetic_warden/hum"], volume: 0.9, pitch: 0.7 },
    // The Storm metronome.
    "entity.magnetic_warden.beat_tick": { category: "hostile", sounds: ["magnetic_warden/shielded"], volume: 0.55, pitch: 1.6 },
    "entity.magnetic_warden.beat": { category: "hostile", sounds: ["magnetic_warden/slam"], volume: 0.9 },
    // The polarity rule, audibly: repelled bolts, a repelled strike, Flux.
    "entity.magnetic_warden.absorb": { category: "player", sounds: ["magnetic_warden/shielded"], volume: 0.45, pitch: [1.3, 1.65] },
    "entity.magnetic_warden.flux_full": { category: "player", sounds: ["magnetic_warden/crystal_spawn"], volume: 0.8, pitch: 1.4 },
    "entity.magnetic_warden.burst": { category: "player", sounds: ["magnetic_warden/deflect"], volume: 1.0 },

    // Resonant Vault authored audio
    "vault.discovery": { category: "ambient", sounds: ["resonant_vault/listening_stone"], volume: 0.55, fallback: false },
    "vault.enter": { category: "ambient", sounds: ["resonant_vault/vault_enter"], volume: 0.48, fallback: false },
    "vault.tuning_fork": { category: "player", sounds: ["resonant_vault/pylon_correct_1"], volume: 0.48, pitch: [1.08, 1.14], fallback: false },
    "vault.pylon_correct": { category: "blocks", sounds: ["resonant_vault/pylon_correct_1", "resonant_vault/pylon_correct_2", "resonant_vault/pylon_correct_3"], volume: 0.62, pitch: [0.98, 1.02], fallback: false },
    "vault.echo_step": { category: "blocks", sounds: ["resonant_vault/pylon_correct_1"], volume: 0.78, fallback: false },
    "vault.route_step": { category: "blocks", sounds: ["resonant_vault/pylon_correct_1"], volume: 0.72, fallback: false },
    "vault.pylon_wrong": { category: "blocks", sounds: ["resonant_vault/pylon_wrong"], volume: 0.7, fallback: false },
    "vault.room_complete": { category: "ambient", sounds: ["resonant_vault/wing_complete"], volume: 0.65, fallback: false },
    "vault.seal_release": { category: "blocks", sounds: ["resonant_vault/seal_release"], volume: 0.72, fallback: false },
    "vault.sentinel_spawn": { category: "hostile", sounds: ["resonant_vault/sentinel_spawn"], volume: 0.65, fallback: false },
    "vault.titan_awaken": { category: "hostile", sounds: ["resonant_vault/titan_awaken"], volume: 0.86, fallback: false },
    "vault.titan_step": { category: "hostile", sounds: ["resonant_vault/titan_step_1", "resonant_vault/titan_step_2"], volume: 0.88, pitch: [0.98, 1.02], fallback: false },
    "vault.titan_chain": { category: "hostile", sounds: ["resonant_vault/titan_chain_1", "resonant_vault/titan_chain_2"], volume: 0.72, pitch: [0.98, 1.02], fallback: false },
    "vault.titan_sweep": { category: "hostile", sounds: ["resonant_vault/titan_sweep"], volume: 0.92, fallback: false },
    "vault.titan_slam": { category: "hostile", sounds: ["resonant_vault/titan_slam"], volume: 1.0, fallback: false },
    "vault.titan_toll": { category: "hostile", sounds: ["resonant_vault/titan_toll"], volume: 0.96, fallback: false },
    "vault.titan_core_open": { category: "hostile", sounds: ["resonant_vault/titan_core_open"], volume: 0.78, fallback: false },
    "vault.titan_shell_break": { category: "hostile", sounds: ["resonant_vault/titan_shell_break"], volume: 1.0, fallback: false },
    "vault.titan_hurt": { category: "hostile", sounds: ["resonant_vault/titan_hurt_1", "resonant_vault/titan_hurt_2"], volume: 0.74, pitch: [0.98, 1.02], fallback: false },
    "vault.titan_death": { category: "hostile", sounds: ["resonant_vault/titan_death"], volume: 1.0, fallback: false },
    "vault.core_claim": { category: "ambient", sounds: ["resonant_vault/core_claim"], volume: 0.72, fallback: false },
    "vault.escape_start": { category: "ambient", sounds: ["resonant_vault/escape_start"], volume: 0.82, fallback: false },
    "vault.escape_warning": { category: "ambient", sounds: ["resonant_vault/escape_warning"], volume: 0.62, fallback: false },
    "vault.escape_complete": { category: "ambient", sounds: ["resonant_vault/escape_complete"], volume: 0.72, fallback: false },
    "vault.listening_stone": { category: "ambient", sounds: ["resonant_vault/listening_stone"], volume: 0.6, fallback: false },
    "vault.hazard_warning": { category: "blocks", sounds: ["resonant_vault/marksman_brace", "resonant_vault/tollkeeper_windup"], volume: 0.7, fallback: false },
    "vault.hazard_strike": { category: "blocks", sounds: ["resonant_vault/tollkeeper_impact", "resonant_vault/guard_step_1"], volume: 0.82, fallback: false },
};
