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
            'Atlas is a voxel sandbox focused on exploration, building, and editing your own worlds.',
            'You can play in survival, creative, or spectator mode, then switch workflows with tools like World Editor and Feature Editor.',
            'Every world is procedurally generated and can be saved, imported, and exported from the main menu.'
        ],
        bullets: [
            'Explore infinite-style terrain with biome variety.',
            'Gather resources, build structures, and shape terrain.',
            'Customize generation presets for unique world seeds.',
            'Use editor tools to iterate on content quickly.'
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
            'Space: Jump',
            'Left Shift: Sneak / descend in flight contexts',
            'Mouse: Look around',
            'Left Click: Break / attack',
            'Right Click: Place / use',
            'E: Open inventory',
            '/: Open command input',
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
            'In Survival, health, hunger, and breath matter. Inventory management and positioning are key.',
            'Lighting, weather ambience, and music context react to where you are and what state you are in.'
        ],
        bullets: [
            'Day/night affects visibility and atmosphere.',
            'Moon phase changes nighttime brightness and ambience.',
            'Health and hunger shape survival pacing.',
            'Inventory slots determine what you can place or use quickly.',
            'Biome context influences visuals and soundscape.'
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
            '/gamemode <survival|creative|spectator>',
            '/time set <day|night|value> and /time add <value>',
            '/phase set <0-7>',
            '/tp <x> <y> <z>',
            '/locate biome <name>',
            '/playsound <id> [x y z]',
            '/sound reload and /sound volume <value>',
            '/music skip',
            'Tip: use Options and Panorama Settings to tune visuals and menu presentation.'
        ]
    }
];
