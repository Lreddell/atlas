export interface TutorialSection {
    id: string;
    title: string;
    subtitle: string;
    paragraphs: string[];
    bullets: string[];
}

export const TUTORIAL_SECTIONS: TutorialSection[] = [
    {
        id: 'concept',
        title: 'Game Concept',
        subtitle: 'What Atlas is about',
        paragraphs: [
            'Atlas is a voxel action-adventure about exploring procedurally generated worlds, gearing up, and breaking the seal on corrupted regions.',
            'Somewhere out there lie the rare Magnetic Fields: sealed against mining and building until you defeat their guardian, the Magnetic Warden.',
            'You can play in survival, creative, or spectator mode, and shape terrain with the built-in World Editor when you want to author worlds instead of adventuring in them. Every world can be saved, renamed, imported, and exported from the main menu.'
        ],
        bullets: [
            'Explore infinite-style terrain across a dozen-plus biomes.',
            'Gather resources, craft weapons and armor, build, and fight.',
            'Find the Magnetic Fields and defeat the Warden to cleanse them.',
            'Customize generation presets for unique world seeds.'
        ]
    },
    {
        id: 'getting-started',
        title: 'Getting Started',
        subtitle: 'First steps for a new world',
        paragraphs: [
            'Start with Singleplayer, create a world, then choose a game mode and optional generation preset.',
            'In Survival, your priority is shelter, food, and basic tools before night falls.',
            'In Creative, focus on testing builds and layouts without resource limits.'
        ],
        bullets: [
            'Create world: Singleplayer -> Create New World.',
            'Set game mode: Survival, Creative, or Spectator.',
            'Optional: choose a World Edit Preset for terrain rules.',
            'Play selected world and begin gathering or building.'
        ]
    },
    {
        id: 'controls',
        title: 'Controls',
        subtitle: 'Core keyboard and mouse input',
        paragraphs: [
            'Movement and interaction follow familiar voxel-sandbox controls.',
            'Some controls are context-dependent and only work while actively in-game.'
        ],
        bullets: [
            'W A S D: Move',
            'Space: Jump (double-tap in Creative to toggle flight)',
            'Ctrl (hold) or double-tap W: Sprint',
            'Left Shift: Sneak / descend in flight contexts',
            'Mouse: Look around',
            'Left Click: Break / attack',
            'Right Click: Place / use / eat',
            'E: Open inventory',
            'Q: Drop held item (Ctrl+Q drops the whole stack)',
            'R: Flip magnetic polarity (needs Polarity Boots)',
            'N: Toggle polarity power on/off (upgraded boots)',
            '/ or T: Open command input',
            'Esc: Pause / menu back',
            'F3: Toggle debug screen',
            'F4: Toggle texture atlas viewer',
            'F8: Capture menu panorama'
        ]
    },
    {
        id: 'mechanics',
        title: 'Mechanics',
        subtitle: 'How progression and world systems work',
        paragraphs: [
            'The world runs a full day-night cycle, biome-dependent ambience, and moon-phase variation.',
            'In Survival, health, hunger, and breath matter. Weapons deal real damage and wear out with use; armor pieces absorb hits until their durability runs out.',
            'Lighting, weather ambience, and music context react to where you are and what state you are in.'
        ],
        bullets: [
            'Day/night affects visibility and atmosphere.',
            'Health and hunger shape survival pacing; armor reduces combat damage (not falls, fire, or drowning).',
            'Tools and weapons show durability bars and break at zero; tiers (wood to diamond) differ in damage and lifespan.',
            'Equip helmet, chestplate, leggings, and boots in the dedicated armor slots of the inventory screen. All four sets (iron, gold, diamond, copper) are craftable.',
            'While armor is worn, the HUD shows your defense pips above the hearts and each piece\'s durability at the bottom-left; a piece pulses red when close to breaking.',
            'Craft a Boat (5 planks) and use it on water to launch it. Right-click boards it, Sneak hops out, and a punch or two breaks it back into the item. Boats stay where you park them and are saved with the world.',
            'Biome context influences visuals and soundscape.'
        ]
    },
    {
        id: 'magnetism',
        title: 'Magnetism & The Warden',
        subtitle: 'Polarity traversal and the sealed Magnetic Fields',
        paragraphs: [
            'The Magnetic Fields biome is sealed: you cannot mine or build there until its guardian falls. Doors, containers, and the crystals you need remain usable.',
            'The region is a huge tiered expedition: between the rim and the central arena you will find crystal deposits, glowing shard clusters, charged veins, spike hazards, polarity launch pads, pylon route markers, and collapsed ruins that can shelter loot caches.',
            'Polarity Boots give you control over magnetism: your polarity attracts you to opposite-polarity magnets and repels you from matching ones, providing enough force to launch across gaps and climb magnetic walls. Launch pads on the shelves are a safe place to practice before the fight.',
            'Summon the Magnetic Warden at the central altar. Break its four shield crystals, strike its deflectable bolts back at it, and survive the slam and frenzy phases to cleanse the region.'
        ],
        bullets: [
            'Press R to flip your polarity; press N to switch the ability off entirely (upgraded boots).',
            'Same polarity repels, opposite attracts; use repulsion to launch and attraction to stick.',
            'Iron armor is ferromagnetic: without boots it drags you toward every magnet, with no control.',
            'Ruin caches hold magnetite building materials, crystals, and sometimes rarer metals.',
            'The Warden drops a boot upgrade, and defeating it permanently unlocks the region.',
            'Dying or leaving the arena resets an unfinished fight so it can be summoned again.'
        ]
    },
    {
        id: 'commands',
        title: 'Commands & Tips',
        subtitle: 'Useful commands and quality-of-life tips',
        paragraphs: [
            'Use slash commands for fast testing, traversal, and world control.',
            'Autocomplete is available in command input, and many commands have subcommands.'
        ],
        bullets: [
            '/help: list every command group',
            '/gamemode <survival|creative|spectator>',
            '/setspawn: set your respawn point where you stand',
            '/keepinventory <on|off>: keep items on death',
            '/giveitem <id> [count] and /equip <armor id>',
            '/time set <day|night|value> and /time add <value>',
            '/tp <x> <y> <z>',
            '/locate biome <name>',
            '/boss <spawn|kill> and /magfields <on|off|toggle>: encounter testing',
            '/playsound <id>, /sound volume <value>, /music skip',
            'Tip: use Options and Panorama Settings to tune visuals and menu presentation.'
        ]
    }
];
