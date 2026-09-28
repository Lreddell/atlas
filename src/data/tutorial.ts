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
            'Explore infinite-style terrain across more than twenty biomes, with caves and deepslate depths below.',
            'Gather resources, craft weapons and armor, build, and fight.',
            'Find the Magnetic Fields and defeat the Warden to cleanse them.',
            'Seek out the Resonant Vaults sealed beneath rare listening spires, and the Bell Titan within.',
            'Customize generation presets for unique world seeds.'
        ]
    },
    {
        id: 'getting-started',
        title: 'Getting Started',
        subtitle: 'First steps for a new world',
        paragraphs: [
            'Start with Singleplayer, create a world, then choose a game mode and optional generation preset.',
            'In Survival, start with wood and basic tools, then keep an eye on food, which you forage from plants.',
            'In Creative, focus on testing builds and layouts without resource limits.'
        ],
        bullets: [
            'Create world: Singleplayer -> Create New World, then pick Survival, Creative, or Spectator.',
            'Hold left click on a tree for logs. In your inventory (E), one log makes four planks, and two planks stacked make four sticks.',
            'Two planks above two sticks make a wooden pickaxe, right in the inventory grid. Four planks make a Crafting Table for the 3x3 recipes.',
            'Mine stone for cobblestone: stone tools, and a Furnace (eight cobblestone in a ring) to smelt ore. Coal or charcoal on a stick makes torches.',
            "Food: apples fall from oak leaves, bananas from jungle leaves, and glowing Lumen Berries from cave glow lichen. One of each, in a row at a Crafting Table, makes a Forager's Bowl.",
            'A bed (three wool over three planks) lets you sleep through the night and sets your respawn point. Four wheat seeds, found in tall grass, weave into one wool.'
        ]
    },
    {
        id: 'controls',
        title: 'Controls',
        subtitle: 'Core keyboard and mouse input',
        paragraphs: [
            'Movement and interaction follow familiar voxel-sandbox controls.',
            'These are the default keys. Rebind any of them, and set mouse sensitivity and invert, in Options > Controls. Some controls only work while actively in-game.'
        ],
        bullets: [
            'W A S D (or the arrow keys): Move',
            'Space: Jump (double-tap in Creative to toggle flight)',
            'Ctrl (hold) or double-tap W: Sprint',
            'Left Shift: Sneak / descend in flight contexts',
            'Mouse: Look around',
            'Left Click: Break / attack',
            'Right Click: Place / use / eat',
            'Middle Click: Pick the block you are looking at',
            '1-9 or Mouse Wheel: Choose a hotbar slot',
            'E: Open inventory',
            'Q: Drop held item (Ctrl+Q drops the whole stack)',
            'R: Flip magnetic polarity (needs Polarity Boots)',
            'N: Toggle polarity power on/off (upgraded boots)',
            'C: Dodge roll (always available, in the air too; a landing rolled through takes no fall damage). With Polarity Boots it also becomes a magnetic dash onto an opposite magnet face or into an opposed Warden, a repel leap away from a matched one, or a launch off a wall',
            'F5: Free third person, where the body runs its own way while the camera orbits (boss fights start in it)',
            'F6: Over-the-shoulder third person, where the body turns with the camera',
            'F7: Detached camera: press to fly it into place, again to park it while you play, and again to put it back',
            '/ or T: Open chat and command input',
            'Esc: Pause / menu back',
            'O: Show the current Vault objective again',
            'F1: Hide the HUD',
            'F3: Toggle debug screen (position, biome)',
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
            'Lighting and music react to where you are and what state you are in.'
        ],
        bullets: [
            'Day/night affects visibility and atmosphere. Sleep in a bed at night to skip to morning; no one can sleep through a blood moon.',
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
            'The nearest Field is usually a couple of thousand blocks from where you start: look for tiered walls of dark magnetite rising toward a plateau. With commands allowed, /locate biome magnetic_fields gives its position.',
            'The region is a huge tiered expedition: between the rim and the central arena you will find crystal deposits, glowing shard clusters, charged veins, spike hazards, polarity launch pads, pylon route markers, and collapsed ruins that can shelter loot caches.',
            'Polarity Boots give you control over magnetism: your polarity attracts you to opposite-polarity magnets and repels you from matching ones, providing enough force to launch across gaps and climb magnetic walls. Launch pads on the shelves are a safe place to practice before the fight.',
            'Summon the Magnetic Warden at the central altar. It fights in three forms, and one rule runs the whole duel: same polarity repels, opposite attracts. Match its colour and its bolts bounce off your boots; oppose it and you are drawn in close enough to strike.',
            'Every form is shielded by tower crystals, and the only way through a shield is to break every crystal of that form. Each lit tower carries the Warden\'s polarity on its climb faces: oppose it to cling and climb, and when the Warden swaps colour the tower swaps with it. A flux window opens before each flip: flip (R) inside it to hold on, or the settled tower throws you off. Press C on a wall for a magnetic launch back toward the platform (aim for the landing pools).',
            'Its first form duels you on the platform (Volley, Lash, a Draw into a Repel burst, and a Charge down a marked lane) while its one crystal stands. Lash and Charge gain a delayed backswing after their first use: dodge again or move out of its cone. These white-marked melee attacks hurt regardless of polarity. Its second, the Aegis, lights two towers and hovers out to contest whichever one you climb, firing volleys down at you. One crystal powers aimed volleys, the other side sweeps; breaking either removes its pattern while the other stands. Polarity flips more frequently, and its tracking slam also threatens the platform; break both and it crashes onto dry ground facing that tower, reeling. Its last form, the Storm, relights all four towers and flips polarity on a beat: every lit tower flips with it, and each flip sends a ring across the arena. Break all four crystals to expose it. On the platform it also rises for a tracking slam: its landing circle turns white when the target locks. The center impact deals damage regardless of polarity, followed by a polarity ring.'
        ],
        bullets: [
            'Press R to flip your polarity; press N to switch the ability off entirely (upgraded boots).',
            'Same polarity repels, opposite attracts; use repulsion to launch and attraction to stick.',
            'C is one button, resolved by that rule: a dodge roll with i-frames, a magnetic dash onto an opposite magnet face (or into an opposed, exposed Warden, which arms a Magnet Slam: your next strike lands harder and staggers it), a repel leap away from a matched Warden, or a launch off a wall.',
            'Bolts you match bounce off your boots; bolts you oppose curve in. A roll through a bolt, a ring or a lunge takes no damage.',
            'Its ground rings launch a matching polarity and pin the opposite one. Its melee bounces off a matching polarity: oppose it to land hits.',
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
            'Use slash commands for fast testing, traversal, and world control. They work in worlds with Allow Commands on: set it when you create a world, or later in Game Menu > World Options. /help, /sound and /music always work.',
            'Autocomplete is available in command input, and many commands have subcommands.'
        ],
        bullets: [
            '/help: list every command group',
            '/gamemode <survival|creative|spectator>',
            '/setspawn: set your respawn point where you stand',
            '/keepinventory <on|off>: keep items on death (also a switch in World Options)',
            '/giveitem <id> [count] and /equip <armor id>',
            '/time set <day|night|value> and /time add <value>',
            '/tp <x> <y> <z>',
            '/locate biome <name> and /locate vault',
            '/boss <spawn|kill> and /magfields <on|off|toggle>: encounter testing',
            '/playsound <id>, /sound volume <value>, /music skip',
            'Tip: Options holds Video Settings, and Options > Menu Background the title screen panorama.'
        ]
    }
];
