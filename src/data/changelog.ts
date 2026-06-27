// In-game changelog ("What's New") data.
//
// This is the single source of truth for the in-game update popup. Each entry's
// `version` MUST exactly match the build's APP_VERSION (package.json "version")
// for the auto-popup to trigger when a player updates to that build.
//
// Keep this in sync with CHANGELOG.md / the GitHub release notes. Newest first.

export interface ChangelogSection {
    title: string;
    items: string[];
}

export interface ChangelogEntry {
    /** Must match APP_VERSION exactly, e.g. "v1.1.0-alpha". */
    version: string;
    /** Player-facing label, e.g. "Alpha 1.1.0". */
    displayVersion: string;
    /** ISO date "YYYY-MM-DD", or empty string while unreleased. */
    date: string;
    /** One-line summary shown under the heading. */
    tagline?: string;
    /** Short TL;DR bullets shown in a highlight box. */
    highlights: string[];
    /** Full categorized notes. */
    sections: ChangelogSection[];
}

// Ordered newest -> oldest.
export const CHANGELOG: ChangelogEntry[] = [
    {
        version: 'v1.1.0-alpha',
        displayVersion: 'Alpha 1.1.0',
        date: '',
        tagline: 'A magnetic boss adventure, expanded world generation, and safer local saves.',
        highlights: [
            'Explore the Magnetic Fields and defeat the Magnetic Warden in a multi-stage arena fight.',
            'Master polarity boots to attract, repel, launch, and climb through magnetic terrain.',
            'Discover 12 new biomes, three new wood families, and many biome-specific blocks.',
            'Equip full armor sets and use tier-based weapons and tools with visible durability.',
            'Safer local world saves now migrate automatically and finish saving when you quit.',
            'Major polish for shaped blocks, lighting, music, menus, controls, and update notes.',
        ],
        sections: [
            {
                title: 'Adventure & Magnetic Fields',
                items: [
                    'Explore the rare Magnetic Fields biome: tiered magnetite terrain, crystal deposits, spike hazards, launch routes, a lava-ringed arena, and a full magnetite building set.',
                    'Magnetic Fields begin sealed. Defeat their Warden to cleanse the region and unlock normal mining and building; doors, containers, and required crystals remain usable.',
                    'Summon the Magnetic Warden at the central altar, break its four shield crystals, parry returnable bolts, and survive homing slams, polarity feints, and a final frenzy.',
                    'Polarity Boots let you switch attraction and repulsion around red and blue magnets, launch between structures, and climb magnetic walls. The Warden drops an upgrade that adds an on/off toggle.',
                    'Defeated bosses, cleansed regions, and equipment persist with each world. Dying or leaving the arena resets an unfinished fight so it can be summoned again.',
                    'The World Editor can place Magnetic Fields and preview the Warden’s arena influence.',
                ],
            },
            {
                title: 'World Generation & Building',
                items: [
                    'Added Birch Forest, Flower Forest, Dark Forest, Meadow, Savanna, Jungle, Taiga, Ice Spikes, Mountains, Swamp, Stone Shore, and Magnetic Fields biomes.',
                    'New terrain includes distinct ground cover and vegetation, jagged snowy mountains, packed-ice spires, muddy wetlands, rocky shores, and auroras in snowy regions.',
                    'Added jungle, dark oak, and acacia trees with matching planks, saplings, slabs, stairs, crafting recipes, and dedicated textures.',
                    'Stairs form corner shapes when placed against neighbouring stairs, and matching slabs merge back into full blocks.',
                    'Light, smooth shading, and ambient occlusion now respect the solid and open parts of slabs and stairs without over-darkening them.',
                    'Selection outlines, inventory icons, held and dropped models, plants, and torches now follow the real shape and support surface of slabs and stairs.',
                ],
            },
            {
                title: 'Combat & Gear',
                items: [
                    'Melee combat now uses each weapon’s real damage, with knockback, hit feedback, loot drops, and clear boss health and shield feedback.',
                    'Tools and weapons wear down through use, show durability bars, and break at zero; material tiers now have distinct damage and durability.',
                    'Added equippable iron, gold, diamond, and copper armor sets with defense and durability, plus dedicated armor slots in the inventory screen.',
                    'Every tool, weapon, armor piece, and special item now has its own inventory and held-item artwork.',
                ],
            },
            {
                title: 'World Saves',
                items: [
                    'Desktop worlds now live as files in the Atlas save folder; browser worlds use the browser’s private on-device filesystem, with automatic fallback when unavailable.',
                    'Existing worlds migrate automatically while their original data is retained, and portable world export and import remain compatible.',
                    'Saving is more resilient: unsaved chunks stay loaded for retry, respawning saves immediately, cursor-held items persist, and quitting or closing performs a final save.',
                    'A world already open in another Atlas window or browser tab is blocked from opening again, preventing two sessions from overwriting the same save.',
                    'Worlds can be renamed in-game; desktop players can open the save folder directly, and the world menu shows the active save type and storage use.',
                ],
            },
            {
                title: 'Audio & Presentation',
                items: [
                    'Added dedicated Magnetic Fields and Magnetic Warden music, including phase-aware boss intensity, plus a new ocean track.',
                    'Added death music and an optional slower, calmer night soundtrack, enabled by default.',
                    'The Warden encounter includes a summon cinematic, shield beams, fog, particles, camera shake, clearer phase warnings, and distinct combat sounds.',
                    'Rename, confirmation, and boss-warning dialogs now match the main menu style.',
                ],
            },
            {
                title: 'Controls & Fixes',
                items: [
                    'Holding Ctrl no longer blocks scroll-wheel hotbar switching, and polarity switching continues to work while sprinting.',
                    'Added /keepinventory and /setspawn commands.',
                    'Eating can repeat while held; use and place animations only play after a successful action.',
                    'Water only breaks a fall when the landing actually reaches it, and dropped items’ five-minute timer pauses while their chunk is unloaded.',
                    'Browser shortcuts no longer interrupt play, and tab closing is blocked while a world loads.',
                    'Fixed held shaped items rendering inside-out and double-slab merging being misread against the player’s collision box.',
                    'Added an in-game "What’s New" screen that appears after updates and can be reopened from the main menu.',
                ],
            },
        ],
    },
    {
        version: 'v1.0.2-alpha',
        displayVersion: 'Alpha 1.0.2',
        date: '2026-06-15',
        tagline: 'A large stability, performance, and content update.',
        highlights: [
            'Chunk streaming moved to a unified Web Worker pool — no more severe frame drops at high render distance.',
            'Minecraft-style movement rebuild with real momentum, sprint-jumping, and auto-step.',
            'First slabs & stairs for 9 material families, with full placement control.',
            'New tools, sandstone crafting, and recipes for every new block.',
        ],
        sections: [
            {
                title: 'Performance & Stability',
                items: [
                    'Generation and meshing now run off the main thread in one shared worker pool.',
                    'Dynamic mesher buffers cut per-context mesh memory from ~60 MB to ~5 MB.',
                    'Fixed frame pacing so the FPS limiter no longer undershoots the target.',
                    'Day/night, cloud, and lighting hot paths no longer allocate every frame.',
                    'Fixed the chunk-fade "ghost chunk" glitch and several mount/unmount bugs.',
                ],
            },
            {
                title: 'Movement',
                items: [
                    'Rebuilt on a friction model with real acceleration toward a top-speed equilibrium.',
                    'Sprint-jumping is faster than running, and sprinting no longer cancels mid-air.',
                    'Auto-step up slabs and single stair steps without jumping.',
                ],
            },
            {
                title: 'Building, Items & Crafting',
                items: [
                    'Slabs and stairs for oak, spruce, birch, cherry, cobblestone, stone, sandstone, red sandstone, and brick.',
                    'Top/bottom slab placement and stair facing + upside-down orientation from where you click.',
                    'New swords, hoes, and gold/diamond tools; sandstone crafting; recipes for all new blocks.',
                ],
            },
        ],
    },
];

/** Entry whose version exactly matches the given build version, if any. */
export const getChangelogEntry = (version: string): ChangelogEntry | undefined =>
    CHANGELOG.find((entry) => entry.version === version);

/** Newest entry overall (used when opening the popup manually). */
export const getLatestChangelogEntry = (): ChangelogEntry | undefined => CHANGELOG[0];
