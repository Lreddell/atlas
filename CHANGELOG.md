# Changelog

All notable changes to Atlas are documented here. This file is the single
source of truth; mirror it into the in-game "What's New" popup
(`src/data/changelog.ts`) and the GitHub release notes when you publish.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow the existing `vX.Y.Z-alpha` scheme.

## [v1.3.0-alpha]: 2026-09-25 — Light & Polarity

A brighter world, a rebuilt Magnetic Warden, and new ways to move, fight, and frame your adventure.

### Highlights
- Explore the Luminous visual style with richer skies, readable nights, reflective water, animated foliage, and new lighting and shadows.
- Face the Magnetic Warden, Aegis, and Storm in a rebuilt three-form encounter driven by polarity and tower crystals.
- Dodge, dash, and launch with a new movement kit, timed weapon attacks, and clearer combat feedback.
- Play in free or over-the-shoulder third person, set up a detached camera, and choose or import your own skin.
- Enjoy lighter chunk rendering, saved ground items, smoother menus, and the new Luminous Coast panorama.

### Luminous World & Atmosphere
- A shared sky and distance haze blend terrain and water into the horizon. Warm sunlight, cool shade, moon phases, stars, auroras, meteors, and blood moons give each time of day its own look.
- Clouds have solid volume and sky lighting, remain visible from every direction, and no longer disappear into the terrain's render-distance haze.
- Water reflects the sky and sun; lava flows and glows. Wind moves foliage, while fireflies, pollen, snow, embers, and magnetic sparks bring movement to the world.
- Torches, crystals, lava, blocks, the player, and Vault enemies share more consistent lighting. Caves stay dark and readable instead of inheriting daylight.
- Improved sun shadows and open-air haze, fixed light leaking through hills and glowing night edges, and made block texture variations consistent between launches.

### Video Settings
- Choose Low, Medium, High, or Ultra graphics quality, then adjust individual options. First launch selects a conservative preset based on the detected GPU.
- Switch between Luminous and Classic visual styles. Classic offers a simpler look while keeping the new graphics controls.
- Presets balance clouds, reflections, bloom, god rays, ambient particles, and anti-aliasing. Video Settings also lets you adjust resolution, mipmaps, shadow style, and chunk fade.
- Motion Blur affects only the 3D scene, leaving the HUD and menus sharp. Ultra enables it by default; other presets leave it off. It stays restrained and resets across camera cuts, teleports, respawns, and panorama captures.
- View Bobbing can be toggled in Video Settings. Fixed motion blur darkening the scene and improved shadow stability as the camera moves.
- Pixel is the default shadow style for every quality preset. Pixel shadows use Low quality or can be switched off; Medium and High remain available with Soft shadows.
- The default render distance is now 16 chunks. Existing saved render-distance choices are preserved.
- Removed the custom cloud-image upload control from Video Settings.

### The Magnetic Warden
- The encounter now unfolds across three distinct forms: Warden, Aegis, and Storm. Early forms have more health and tighter attack pacing, and the boss keeps pressure across the arena.
- Polarity drives the fight: same polarity repels, opposite attracts. Matching bolts bounce off active Polarity Boots; opposing the exposed boss lets your strikes land.
- Tower crystals shield every form. Break one crystal in Form I, two in Form II, and all four relit crystals in Form III. Shields do not expire on their own.
- Lit tower faces follow the boss's polarity. Climb with the opposite polarity, then press R during the warning window when a tower flips to keep your grip; missing it shocks you away.
- Form I mixes volleys, Lash, Charge, and a Draw into a Repel burst. Lash and Charge develop delayed follow-up swings, and white-marked melee attacks must be avoided regardless of polarity.
- The Aegis follows tower climbers with aimed volleys and side sweeps, with each crystal powering a different pattern. Breaking both brings it down onto dry ground for a damage window; tracking slams also threaten the platform.
- The Storm combines timed polarity flips, expanding rings, spiral bolts, double beats, and tracking slams. The slam marker turns white when its target locks; the central impact hurts regardless of polarity.
- Breaking a shield or landing a Magnet Slam creates a clear opening. The final stretch accelerates the Storm's rhythm and sends its orbiting shards into the fight.
- Removed the old Flux burst, burning tethers, projectile parry, and unannounced polarity feint. Contact with the boss's body alone no longer deals damage.
- Shield beams, charged towers, phase markers, an off-screen boss compass, and clearer white Charge lanes help track the encounter. Ground warnings match the attack areas, and unnecessary projectile target circles are gone.
- A new defeat cinematic follows the Warden's collapse and the towers going dark. Press Space to skip it.

### Combat & Magnetic Movement
- Press C to dodge roll without special gear, including in mid-air. Rolls give brief invulnerability and protect against fall damage when you roll through the landing.
- Rolls now use stamina and have a recovery period. Combat readouts show readiness, stamina, and cooldowns, while a failed input flashes feedback near the crosshair.
- With active Polarity Boots, C also performs a dash toward an opposite magnet face, a repel leap away from a matching Warden, or a launch off a wall toward the landing pools.
- Dash into an opposed, exposed Warden to ready a Magnet Slam: your next strike deals 2.5 times damage and staggers it.
- Melee attacks have weapon-specific windup, hit timing, and recovery, with matching held-item motion. Weapon tooltips expose useful timing information.
- Improved buffered dodge inputs, interaction timing, and input cleanup so actions are less likely to disappear between updates or remain stuck after leaving a menu.
- Polarity, tower warnings, attack readiness, and dodge feedback have clearer placement without covering the hotbar item name or health display.

### Cameras, Skins & Player Animation
- F5 toggles free third person: orbit the camera while your character moves independently, with sprinting available in every direction.
- F6 toggles over-the-shoulder third person, keeping the body aligned with the camera. Both views use a camera arm that responds to nearby blocks.
- F7 cycles the detached camera: fly it into position, press again to park it and control your character, then press again to return to the player view.
- Boss fights start in free third person and restore your previous view afterward. Camera transitions, cinematic recovery, and detached-camera cleanup are more reliable.
- Choose a skin from the preview carousel or import a Minecraft skin. The jointed player model shows held items, equipped armor, eating, attacks, climbing, rolls, and magnetic moves.
- First-person hands and the camera respond to walking, sprinting, sneaking, jumping, and landing. Your full body casts a shadow even in first person.
- Mining uses ten crack stages and flying block chips. Dropped items, deaths, HUD changes, and menu transitions have smoother animation.
- Boat passengers now sit and row, with corrected aiming and boat heading in third person.
- Improved eye-based aiming, block selection outlines, and interaction alignment across camera modes.

### Menus & Panoramas
- Luminous Coast is the new bundled default for menu and loading backgrounds. The original panorama remains available as Classic Atlas in Panorama Settings.
- Keep using your own captured or imported panoramas, with named built-in choices that are protected from deletion.
- The short Video Settings fade now also appears on matching menu pages, tutorial and editor tabs, creative inventory categories, loading panels, and dialogs. These fades respect reduced-motion preferences.
- What's New now includes this full update, with older releases still selectable. Its panel and version buttons use the same square, beveled styling as the rest of the menus.

### Sound & Low Health
- At four hearts or less, a heartbeat and crimson screen-edge pulse warn that health is low. The heartbeat speeds up as health falls and clears after you recover to five hearts.
- The low-health effect stays beneath the polarity rim so the boss's red and blue cues remain readable. Low health no longer changes the music pitch.
- Updated Magnetic Warden and Bell Titan fight music, stabilized encounter music transitions, and corrected how night and boss-phase pitch changes combine.
- Creative mode falls back to normal biome and cave music when its dedicated music folder is empty.
- Added feedback sounds for magnetic movement and tower events.

### Performance & Memory
- Adjacent full-block faces are combined into larger surfaces while preserving tiled textures, reducing the geometry needed to draw the world.
- Settled chunks are drawn together in small regions with tighter visibility bounds, reducing repeated rendering work.
- Chunk geometry uses more compact data, and empty chunks no longer reserve unused block metadata. This reduces memory overhead as more chunks are loaded.
- Water and glass no longer build unnecessary faces against chunks that have not loaded yet.
- Boss lighting uses the shared world light system to avoid rebuilding terrain shaders when an encounter starts.
- Expanded development performance diagnostics make it easier to investigate slowdowns at different quality settings and render distances.

### Saves & Gameplay Fixes
- Items on the ground now save with the world, including their remaining despawn time. Reloading no longer deletes dropped supplies or boss loot that has not yet landed.
- Items stop being pulled toward dead players and cannot be collected in the first moments after respawning.
- Fast-moving bodies no longer pass through thin floors and walls, and blocks cannot be placed inside entities.
- The world clock now stays in step with player simulation under heavy load.
- Refusing or losing mouse capture no longer causes a fatal input error, and camera recovery avoids sudden look changes.
- Fixed recovery after cinematics and panorama capture, including returning control to the correct camera mode.
- Desktop Ctrl+W, Ctrl+R, and Ctrl+Q no longer close, reload, or quit the game during movement and item dropping.
- In-game overlays now share the HUD's display layer so combat readouts and menu effects stack consistently.

## [v1.2.0-alpha]: 2026-08-01

### Highlights
- Discover vast underground Resonant Vaults with connected side chambers, distinct
  puzzles, combat encounters, randomized caches, and two ways back to the surface.
- Challenge the Bell Titan in a cinematic three-phase fight built around readable
  attacks, breaking armor, and striking its exposed bell core.
- Fight a complete Vault enemy roster with voxel-aware navigation, role-specific
  tactics, dedicated models, animation timing, effects, and sounds.
- Wield the Vaultsteel Spear, Vault Crossbow, Bellbreaker Maul, Echo Tuning Fork,
  and the Bell Titan's own hammer.
- Experience dedicated exploration, combat, boss, and escape music alongside a
  full positional soundscape for the structure.

### The Resonant Vaults
- Rare listening spires mark enormous sealed complexes far below the surface. Use
  `/locate vault` to find the nearest one.
- Seeded layouts connect a central hall to required challenge wings, an inner seal,
  the Bell Titan arena, a core chamber, and two terrain-aware escape courses.
- Challenge rooms include a slowly voiced memory choir, an acoustic relay, a
  counterweight gallery, guarded halls, a resonance foundry, inner machinery, and
  a broken crossing with a dangerous lower route.
- Falling from the crossing begins a separate combat encounter instead of trapping
  the player. Surviving its waves opens a return path and completes the challenge.
- Environmental light, floor inlays, symbols, moving mechanisms, particles,
  directional audio, and a compact objective display communicate progression.
- Chests draw from seeded provision, masonry, armory, relic, and forge pools, with
  room placement that introduces useful Vault equipment through play.
- After claiming the core, choose the longer guarded Grand Ascent or the shorter,
  hazard-heavy Fracture Stair and reach the actual surface before time expires.

### Bell Titan & Vault Enemies
- A unique arena confirmation leads into a dedicated Bell Titan awakening cinematic
  and a fully illuminated battle chamber.
- The Bell Titan has three escalating phases, breakable shell stages, exposed-core
  damage windows, and nine attacks ranging from chain lashes and hammer combinations
  to resonance cages, vault-breaking impacts, and a final bell storm.
- Attack hit regions and ground telegraphs use the same geometry so warnings align
  with the danger they represent.
- Vault Guards block and sweep, Marksmen reposition and fire volleys, Bell Hounds
  leap and recover, and Tollkeepers control space with tolls and charges.
- Voxel-aware navigation supports ledge descents, route replanning, combat spacing,
  and anti-crowding movement across multi-level rooms.
- Defeating the Titan unlocks the reward chamber and Titan Hammer. The timed escape
  begins only after the core is claimed.

### Weapons, Materials & Building
- The Vaultsteel Spear rewards attacks at reach, the Vault Crossbow uses dedicated
  bolts, and the Bellbreaker Maul breaks guarded and armored targets.
- The Echo Tuning Fork activates only clearly marked Vault machinery, while the
  Titan Hammer delivers heavy strikes with a crushing area impact.
- Added Echo Stone, Echo Bricks, cracked and chiseled variants, mosaics, crystals,
  pylons, conduits, phase blocks, plates, lamps, spikes, slabs, and stairs.
- Echo Shards, Echo Dust, Echo Cores, and Fractured Cores support new recipes for
  Vault masonry, lighting, mechanisms, and decoration.
- All Resonant content uses reserved IDs within Atlas's existing 8-bit world format
  without colliding with current blocks and items.

### Music, Sound & Presentation
- Added distinct gameplay-mixed music for Vault exploration, Sentinel combat, the
  Bell Titan, and the timed escape.
- Music follows encounter state instead of room boundaries, loops from its authored
  ending, and yields when the player leaves or another music state takes priority.
- Directional, pitch-distinct bells make memory patterns traceable. Machinery,
  seals, weapons, enemies, rewards, and escape events use dedicated audio assets.
- The Bell Titan has a custom textured model, square hanging bell, breakable shell
  presentation, authored animation poses, synchronized telegraphs, debris, and
  arena lighting. Every Vault enemy has its own visual and sound identity.

### Generation & Reliability
- Generation validates room connections, doorway planes, protected progression
  routes, stairs, challenge completion paths, arena clearance, and both surface
  outlets before committing a Vault.
- Structural shells prevent cave breaches, while terrain-aware entrances and escape
  routes account for high ground, low ground, and ocean surfaces.
- Challenge progress, seal access, boss state, rewards, core claims, chosen escape
  routes, and cleansed Vaults persist with the world.
- Music and effects use the shared sound system with stable gain handling across
  pause, resume, state changes, and repeated loops.

## [v1.1.0-alpha]: 2026-07-05

### Highlights
- Explore the new Magnetic Fields, master polarity traversal, and defeat the
  Magnetic Warden in a multi-stage arena fight.
- Discover 13 new surface biomes, three new wood families, and biome-specific terrain,
  plants, blocks, and music.
- Delve into a new cave system with deepslate depths, cave biomes, geodes, and deep ores.
- Fight with material-based weapons, craft and equip full armor sets, and travel by boat.
- Manage safer local worlds with filesystem saves, automatic migration, rename tools,
  and reliable save-on-quit behavior.
- Tune Magnetic Fields and caves directly in the expanded World Editor.

### Adventure & Magnetic Fields
- Explore the rare Magnetic Fields biome: tiered magnetite terrain, crystal deposits,
  glowing shard clusters, charged veins, spike hazards, polarity launch pads, pylon
  route markers, collapsed ruins, loot caches, a lava-ringed arena, and a full
  magnetite building set.
- Ruins can shelter loot caches stocked with magnetite materials, crystals of both
  polarities, and sometimes rarer metals.
- Magnetic Fields begin sealed. Defeat their Warden to cleanse the region and unlock
  normal mining and building; doors, containers, and required crystals remain usable.
- Summon the Magnetic Warden at the central altar, break its four shield crystals,
  parry returnable bolts, and survive homing slams, polarity feints, and a final frenzy.
- Polarity Boots let you switch attraction and repulsion around red and blue magnets,
  launch between structures, and climb magnetic walls. The Warden drops an upgrade
  that adds an on/off toggle, and active boots soften fall damage.
- Defeated bosses, cleansed regions, and equipment persist with each world. Dying or
  leaving the arena resets an unfinished fight so it can be summoned again.
- The World Editor can tune Magnetic Fields generation, find the nearest Warden arena,
  copy its teleport command, and inspect field values on the map.

### World Generation & Building
- Added Birch Forest, Flower Forest, Dark Forest, Meadow, Savanna, Jungle, Taiga,
  Ice Spikes, Mountains, Swamp, Beach, Stone Shore, and Magnetic Fields biomes.
- New terrain includes sandy coasts, distinct ground cover and vegetation, jagged
  snowy mountains, packed-ice spires, muddy wetlands, rocky shores, organic biome
  borders, and auroras in snowy regions.
- Added jungle, dark oak, and acacia trees with matching planks, saplings, slabs,
  stairs, crafting recipes, and dedicated textures.
- Added layered tunnel and cavern generation across deepslate depths, with dripstone
  caverns, glowing lush hollows, and rare amethyst geodes.
- Lush and dripstone cave biomes are large, coherent regions (~130 blocks across) but
  rare, so stumbling into one is a find. Deepslate uses a lighter palette that remains
  readable under low cave light.
- Every ore (coal, iron, copper, gold, lapis, diamond, emerald) has a deepslate
  variant that generates in the deep band, with its own texture and matching drops.
- New foods: bananas drop rarely from jungle leaves, glowing Lumen Berries can be
  foraged from cave glow lichen, and the three combine into a hearty Forager's Bowl at
  a crafting table. Dark oak leaves can drop apples like other oaks.
- A new World Editor Caves tab exposes carving layers, the deepslate band, and
  decoration densities over a live vertical cross-section preview.

### Combat, Gear & Travel
- Added the Magnetic Warden enemy, melee combat, knockback, loot drops, and boss
  health and shield HUDs.
- Tools and weapons use material-based damage, mining stats, and durability; they show
  wear in the inventory and break at zero.
- Added craftable iron, gold, diamond, and copper armor sets with dedicated equipment
  slots, defense, durability, and an armor HUD with low-wear warnings.
- Inventory tooltips and the hotbar name plate show live attack, mining, defense,
  durability, food, and fuel stats.
- Every tool, weapon, armor piece, and special item has dedicated inventory artwork,
  alongside new survival recipes for armor and Magnetic Fields materials.
- Craft a Boat from 5 planks (any wood family) and use it on a water cell to set it
  afloat as a real boat in the world; right-click to board.
- Riding glides at over triple swimming speed, bobs at the surface, and scrapes
  slowly if beached; sneak hops out and leaves the boat parked where you left it.
- Boats are saved with your world, survive reload and world switches, and a couple
  of punches break one back into its item.

### World Saves
- Desktop worlds live as files in the Atlas save folder; browser worlds use the
  browser's private on-device filesystem, with automatic fallback when unavailable.
- Existing worlds migrate automatically while their original data is retained, and
  portable world export and import remain compatible.
- Quitting or closing Atlas performs a final save, and failed saves remain queued for retry.
- A world already open in another Atlas window or browser tab is blocked from opening
  again, preventing two sessions from overwriting the same save.
- Worlds can be renamed in-game; desktop players can open the save folder directly,
  and the world menu shows the active save type and storage use.

### Audio & Presentation
- Added dedicated Magnetic Fields and Magnetic Warden music, including phase-aware
  boss intensity, plus a new ocean track.
- Every biome and cave biome has a music configuration. Shared music can continue
  across biome borders instead of restarting, while layered tags let special biomes
  draw from more than one soundtrack.
- The Warden encounter includes a summon cinematic, shield beams, fog, particles,
  camera shake, phase warnings, and distinct combat sounds.
- Health, hunger, and armor use a unified pixel-art HUD, and dedicated item art keeps
  inventory, hotbar, held, and dropped presentations consistent.
- Rename, confirmation, boss-warning, error, and information prompts use styled
  in-game dialogs instead of browser-native popups.
- Refreshed the main-menu splash pool by removing weaker, off-brand, and implementation-focused
  lines, then adding a much larger set of Atlas-specific jokes, world hints, boss teases,
  exploration lines, and clues about possible future directions.

### Existing Gameplay Improvements
- Added /keepinventory and /setspawn commands.
- Holding use can continue eating, and held-item animations only play when an action succeeds.
- Browser shortcuts are suppressed across Atlas, and closing the tab is blocked while a
  world is loading.
- Dropped-item despawn time pauses while its chunk is unloaded.
- Regaining pointer lock cannot turn a single mouse event into a full camera spin.
- Distant ocean floors remain visible instead of opening see-through gaps in the world.

### Looking Ahead
- Atlas is planned to keep expanding around distinct boss regions with their own traversal,
  hazards, mechanics, and fights, with some victories changing the world and opening new
  routes rather than only rewarding stronger gear.
- A broader combat overhaul is part of the direction, with more responsive melee, stronger
  enemy behavior, more hostile creatures, expanded combat options, and fights built more
  around movement, timing, counters, and positioning.
- Future regions may push exploration into stranger environments with larger encounters,
  traversal gear that changes how areas are crossed, deeper ruins and cave systems, and
  places where the environment itself becomes a major part of survival.
- Longer-term directions include broader camera and player presentation, places beyond the
  current world with different rules, and the possibility of eventually exploring and
  fighting alongside other players.
- These are direction targets for the project, not locked release promises or a fixed order
  of implementation.

## [v1.0.2-alpha]: 2026-06-15

A large stability, performance, and content update. See the
[full release notes](https://github.com/Lreddell/atlas/releases/tag/v1.0.2-alpha).

### Highlights
- Chunk streaming moved to a unified Web Worker pool; no more severe frame
  drops at high render distance.
- Physics-based movement rebuild with real momentum, sprint-jumping, and auto-step.
- First slabs & stairs for 9 material families, with full placement control.
- New tools, sandstone crafting, and recipes for every new block.

## [v1.0.1-alpha]: 2026-05-15

- Windows installer release.

[v1.2.0-alpha]: https://github.com/Lreddell/atlas/compare/v1.0.2-alpha...v1.2.0-alpha
[v1.1.0-alpha]: https://github.com/Lreddell/atlas/compare/v1.0.2-alpha...08ee5db4147dd755a7b1516c1f96d8ac40731d5c
[v1.0.2-alpha]: https://github.com/Lreddell/atlas/releases/tag/v1.0.2-alpha
[v1.0.1-alpha]: https://github.com/Lreddell/atlas/releases/tag/v1.0.1-alpha
