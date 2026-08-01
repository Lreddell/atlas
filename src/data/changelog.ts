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
        version: 'v1.2.0-alpha',
        displayVersion: 'Alpha 1.2.0',
        date: '2026-08-01',
        tagline: 'Descend into the Resonant Vaults, face the Bell Titan, and escape before the halls collapse.',
        highlights: [
            'Discover vast underground Resonant Vaults with seeded layouts, connected side chambers, distinct puzzles, combat encounters, hidden caches, and two ways back to the surface.',
            'Challenge the Bell Titan in a cinematic three-phase fight built around readable attacks, breaking armor, and striking its exposed bell core.',
            'Fight Vault Guards, Marksmen, Bell Hounds, and Tollkeepers with improved navigation, roles, reactions, and room-specific encounter compositions.',
            'Wield the Vaultsteel Spear, Vault Crossbow, Bellbreaker Maul, Echo Tuning Fork, and the Bell Titan\'s own hammer.',
            'Experience a complete Vault soundscape with exploration, combat, boss, and escape music plus directional bells, machinery, impacts, and creature foley.',
        ],
        sections: [
            {
                title: 'The Resonant Vaults',
                items: [
                    'Rare listening spires mark enormous sealed complexes far below the surface. The new /locate vault command can find the nearest one.',
                    'Each Vault is assembled from connected architectural wings around a central hall. Challenge rooms occupy the side routes, while the single inner seal protects the Bell Titan chamber until every required challenge is complete.',
                    'Environmental lighting, floor inlays, symbols, moving mechanisms, particles, directional audio, and a compact objective display communicate progress without lengthy instruction text.',
                    'Challenge rooms include a slowly voiced memory choir, an acoustic relay, a counterweight gallery, guarded halls, a resonance foundry, inner machinery, and a broken crossing with a dangerous combat route beneath it.',
                    'Falling from the broken crossing begins a separate lower-hall encounter instead of causing a dead end. Surviving its waves opens a return path and completes the challenge.',
                    'Vault chests draw from multiple seeded loot pools for provisions, masonry, armory supplies, relics, and forge materials, with room placement that introduces useful gear through play.',
                    'After claiming the core, choose between the longer guarded Grand Ascent and the shorter, hazard-heavy Fracture Stair. Both routes adapt to terrain height, reach the real surface, and remain protected from cave breaches.',
                ],
            },
            {
                title: 'Bell Titan & Vault Enemies',
                items: [
                    'A unique confirmation at the arena threshold leads into a dedicated Bell Titan awakening cinematic and fully illuminated battle chamber.',
                    'The Bell Titan uses three escalating phases with sweeps, advances, slams, chain lashes, hammer combinations, double tolls, resonance cages, vault-breaking impacts, and a final bell storm.',
                    'Its stone shell blocks ordinary damage. Committed attacks expose the hanging bell core for a clear punish window, and each broken shell stage changes the fight before the Titan accelerates again.',
                    'Attack hit regions and ground telegraphs share the same authored geometry, keeping visible warnings aligned with the actual danger zones.',
                    'Vault Guards block and sweep, Marksmen reposition and fire deliberate volleys, Bell Hounds leap and recover, and Tollkeepers control space with tolls and charges.',
                    'Vault enemies use voxel-aware navigation, ledge descents, route replanning, role-specific spacing, and anti-crowding movement so encounters remain active across multi-level rooms.',
                    'Defeating the Titan unlocks its reward chamber and the Titan Hammer, records the clear, and begins the timed escape only after the core is claimed.',
                ],
            },
            {
                title: 'Weapons, Materials & Building',
                items: [
                    'The Vaultsteel Spear rewards accurate attacks at reach, the Vault Crossbow fires dedicated Vault Bolts, and the Bellbreaker Maul breaks guarded and armored targets.',
                    'The Echo Tuning Fork is a focused Vault tool used only on marked machinery, while the Titan Hammer delivers heavy strikes with a crushing area impact.',
                    'Added Echo Stone, Echo Bricks, cracked and chiseled variants, mosaics, crystals, pylons, conduits, phase blocks, plates, lamps, spikes, slabs, and stairs.',
                    'Echo Shards, Echo Dust, Echo Cores, and Fractured Cores support a new set of recipes for Vault masonry, lighting, mechanisms, and decorative blocks.',
                    'All Resonant world blocks and items occupy reserved IDs below the existing 8-bit world-storage limit without colliding with current Atlas content.',
                ],
            },
            {
                title: 'Music, Sound & Presentation',
                items: [
                    'Added distinct, gameplay-mixed music for Vault exploration, Sentinel combat, the Bell Titan, and the timed escape.',
                    'Music changes by encounter state instead of room boundaries, loops from the authored ending, and relinquishes control when the player leaves the Vault or another higher-priority music state takes over.',
                    'Directional, pitch-distinct bell notes make memory patterns traceable, while machinery, seals, weapons, enemies, the Titan, rewards, and escape events use dedicated recorded audio assets.',
                    'The Bell Titan has a custom textured model, square hanging bell, layered shell-break states, authored animation poses, synchronized telegraphs, impact effects, debris, and arena lighting.',
                    'Resonant enemies have dedicated textures, silhouettes, held equipment, movement poses, attack animation timing, particles, and sound identities.',
                ],
            },
            {
                title: 'Generation & Reliability',
                items: [
                    'Vault generation validates room connections, doorway planes, protected progression routes, entrance stairs, challenge completion paths, arena clearance, and both surface outlets before committing the structure.',
                    'Structural shells seal rooms from intersecting caves, while terrain-aware entrances and escape courses account for high ground, low ground, and ocean surfaces.',
                    'Challenge completion, inner-seal access, boss state, rewards, core claims, escape routes, and cleansed Vaults persist with the world.',
                    'Vault music and effects are registered through the shared sound system, with stable gain handling across pause, resume, state changes, and repeated loops.',
                ],
            },
        ],
    },
    {
        version: 'v1.1.0-alpha',
        displayVersion: 'Alpha 1.1.0',
        date: '2026-07-05',
        tagline: 'A magnetic boss adventure, expanded world generation, boats, and safer local saves.',
        highlights: [
            'Explore the new Magnetic Fields, master polarity traversal, and defeat the Magnetic Warden in a multi-stage arena fight.',
            'Discover 13 new surface biomes, three new wood families, and biome-specific terrain, plants, blocks, and music.',
            'Delve into a new cave system with deepslate depths, cave biomes, geodes, and deep ores.',
            'Fight with material-based weapons, craft and equip full armor sets, and travel by boat.',
            'Manage safer local worlds with filesystem saves, automatic migration, rename tools, and reliable save-on-quit behavior.',
            'Tune Magnetic Fields and caves directly in the expanded World Editor.',
        ],
        sections: [
            {
                title: 'Adventure & Magnetic Fields',
                items: [
                    'Explore the rare Magnetic Fields biome: tiered magnetite terrain, crystal deposits, glowing shard clusters, charged veins, spike hazards, polarity launch pads, pylon route markers, collapsed ruins, loot caches, a lava-ringed arena, and a full magnetite building set.',
                    'Ruins can shelter loot caches stocked with magnetite materials, crystals of both polarities, and sometimes rarer metals.',
                    'Magnetic Fields begin sealed. Defeat their Warden to cleanse the region and unlock normal mining and building; doors, containers, and required crystals remain usable.',
                    'Summon the Magnetic Warden at the central altar, break its four shield crystals, parry returnable bolts, and survive homing slams, polarity feints, and a final frenzy.',
                    'Polarity Boots let you switch attraction and repulsion around red and blue magnets, launch between structures, and climb magnetic walls. The Warden drops an upgrade that adds an on/off toggle, and active boots soften fall damage.',
                    'Defeated bosses, cleansed regions, and equipment persist with each world. Dying or leaving the arena resets an unfinished fight so it can be summoned again.',
                    'The World Editor can tune Magnetic Fields generation, find the nearest Warden arena, copy its teleport command, and inspect field values on the map.',
                ],
            },
            {
                title: 'World Generation & Building',
                items: [
                    'Added Birch Forest, Flower Forest, Dark Forest, Meadow, Savanna, Jungle, Taiga, Ice Spikes, Mountains, Swamp, Beach, Stone Shore, and Magnetic Fields biomes.',
                    'New terrain includes sandy coasts, distinct ground cover and vegetation, jagged snowy mountains, packed-ice spires, muddy wetlands, rocky shores, organic biome borders, and auroras in snowy regions.',
                    'Added jungle, dark oak, and acacia trees with matching planks, saplings, slabs, stairs, crafting recipes, and dedicated textures.',
                    'Added layered tunnel and cavern generation across deepslate depths, with dripstone caverns, glowing lush hollows, and rare amethyst geodes.',
                    'Lush and dripstone cave biomes are large, coherent regions (~130 blocks across) but rare, so stumbling into one is a find. Deepslate uses a lighter palette that remains readable under low cave light.',
                    'Every ore (coal, iron, copper, gold, lapis, diamond, emerald) has a deepslate variant that generates in the deep band, with its own texture and matching drops.',
                    "New foods: bananas drop rarely from jungle leaves, glowing Lumen Berries can be foraged from cave glow lichen, and the three combine into a hearty Forager's Bowl at a crafting table. Dark oak leaves can drop apples like other oaks.",
                    'A new World Editor Caves tab exposes carving layers, the deepslate band, and decoration densities over a live vertical cross-section preview.',
                ],
            },
            {
                title: 'Combat, Gear & Travel',
                items: [
                    'Added the Magnetic Warden enemy, melee combat, knockback, loot drops, and boss health and shield HUDs.',
                    'Tools and weapons use material-based damage, mining stats, and durability; they show wear in the inventory and break at zero.',
                    'Added craftable iron, gold, diamond, and copper armor sets with dedicated equipment slots, defense, durability, and an armor HUD with low-wear warnings.',
                    'Inventory tooltips and the hotbar name plate show live attack, mining, defense, durability, food, and fuel stats.',
                    'Every tool, weapon, armor piece, and special item has dedicated inventory artwork, alongside new survival recipes for armor and Magnetic Fields materials.',
                    'Craft a Boat from 5 planks (any wood family) and use it on a water cell to set it afloat as a real boat in the world; right-click to board.',
                    'Riding glides at over triple swimming speed, bobs at the surface, and scrapes slowly if beached; sneak hops out and leaves the boat parked where you left it.',
                    'Boats are saved with your world, survive reload and world switches, and a couple of punches break one back into its item.',
                ],
            },
            {
                title: 'World Saves',
                items: [
                    "Desktop worlds live as files in the Atlas save folder; browser worlds use the browser's private on-device filesystem, with automatic fallback when unavailable.",
                    'Existing worlds migrate automatically while their original data is retained, and portable world export and import remain compatible.',
                    'Quitting or closing Atlas performs a final save, and failed saves remain queued for retry.',
                    'A world already open in another Atlas window or browser tab is blocked from opening again, preventing two sessions from overwriting the same save.',
                    'Worlds can be renamed in-game; desktop players can open the save folder directly, and the world menu shows the active save type and storage use.',
                ],
            },
            {
                title: 'Audio & Presentation',
                items: [
                    'Added dedicated Magnetic Fields and Magnetic Warden music, including phase-aware boss intensity, plus a new ocean track.',
                    'Every biome and cave biome has a music configuration. Shared music can continue across biome borders instead of restarting, while layered tags let special biomes draw from more than one soundtrack.',
                    'The Warden encounter includes a summon cinematic, shield beams, fog, particles, camera shake, phase warnings, and distinct combat sounds.',
                    'Health, hunger, and armor use a unified pixel-art HUD, and dedicated item art keeps inventory, hotbar, held, and dropped presentations consistent.',
                    'Rename, confirmation, boss-warning, error, and information prompts use styled in-game dialogs instead of browser-native popups.',
                    'Refreshed the main-menu splash pool by removing weaker, off-brand, and implementation-focused lines, then adding a much larger set of Atlas-specific jokes, world hints, boss teases, exploration lines, and clues about possible future directions.',
                ],
            },
            {
                title: 'Existing Gameplay Improvements',
                items: [
                    'Added /keepinventory and /setspawn commands.',
                    'Holding use can continue eating, and held-item animations only play when an action succeeds.',
                    'Browser shortcuts are suppressed across Atlas, and closing the tab is blocked while a world is loading.',
                    'Dropped-item despawn time pauses while its chunk is unloaded.',
                    'Regaining pointer lock cannot turn a single mouse event into a full camera spin.',
                    'Distant ocean floors remain visible instead of opening see-through gaps in the world.',
                ],
            },
            {
                title: 'Looking Ahead',
                items: [
                    'Atlas is planned to keep expanding around distinct boss regions with their own traversal, hazards, mechanics, and fights, with some victories changing the world and opening new routes rather than only rewarding stronger gear.',
                    'A broader combat overhaul is part of the direction, with more responsive melee, stronger enemy behavior, more hostile creatures, expanded combat options, and fights built more around movement, timing, counters, and positioning.',
                    'Future regions may push exploration into stranger environments with larger encounters, traversal gear that changes how areas are crossed, deeper ruins and cave systems, and places where the environment itself becomes a major part of survival.',
                    'Longer-term directions include broader camera and player presentation, places beyond the current world with different rules, and the possibility of eventually exploring and fighting alongside other players.',
                    'These are direction targets for the project, not locked release promises or a fixed order of implementation.',
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
            'Chunk streaming moved to a unified Web Worker pool; no more severe frame drops at high render distance.',
            'Physics-based movement rebuild with real momentum, sprint-jumping, and auto-step.',
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
