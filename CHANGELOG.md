# Changelog

All notable changes to Atlas are documented here. This file is the single
source of truth; mirror it into the in-game "What's New" popup
(`src/data/changelog.ts`) and the GitHub release notes when you publish.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow the existing `vX.Y.Z-alpha` scheme.

## [v1.3.0-alpha]: 2026-09-25 — Light & Polarity

A brighter world, a rebuilt Magnetic Warden, and new ways to move, fight, and frame your adventure.

### Highlights
- Explore the Luminous visual style: a new sky and haze, readable moonlit nights, reflective water, swaying foliage, soft or pixel shadows, and clouds that reach the horizon and shade the ground.
- Face the Magnetic Warden, Aegis, and Storm in a rebuilt three-form encounter driven by polarity and tower crystals.
- Dodge, dash, and launch with a new movement kit, timed weapon attacks, and clearer combat feedback.
- Play in free or over-the-shoulder third person, set up a detached camera, and choose or import your own skin.
- Grow and bake with the new farming, find recipes in the recipe book, and rebind any key on the new Controls screen.
- Play through a redrawn interface of ink, parchment and brass, with new vitals, menus and inventory screens.
- Enjoy lighter chunk rendering, saved ground items, water that flows by Minecraft's rules, and the new Luminous Coast panorama.

### Luminous World & Atmosphere
- One sky and distance haze blend terrain and water into the horizon. Warm sunlight and cool shade give each time of day its own look, and moonlit nights stay readable instead of going black.
- The night sky is redrawn, from its twinkling and shooting stars to the moon's phases, auroras and blood moons.
- Clouds are solid, lit volumes that reach the horizon. They cast drifting shadows on the ground, show in water, and hide the sun, moon and stars behind them.
- Water reflects the sky, sun and clouds, and lava glows. Wind sways plants and leaves, and fireflies, pollen, snow, embers, cave dust and magnetic sparks drift through the world.
- The Magnetic Fields have a lighter purple haze and sky that thickens only in the distance.
- Torches, crystals and lava light the world warmly, and the player and Vault enemies take the light of the world around them. Underground your eyes adjust, so caves stay dark but readable at any time of day.
- Block textures look the same every time you launch the game.

### Video Settings
- Choose Low, Medium, High, or Ultra graphics, or change any option for a Custom setup. On first launch the game picks a preset for your graphics card (never Ultra), and if it runs below about 40 fps through the first minute it suggests the next one down. It never lowers the preset by itself.
- Visual Style switches between Luminous and Classic. Classic brings back the old look: flat light, the old sky and fog, and no glow, god rays, reflections, wind or particles.
- Presets set shadows, bloom, god rays, water reflections, foliage wind, ambient particles, cloud quality, resolution, and motion blur.
- New options: Resolution (the pixel density the world renders at on high-DPI screens), Shadow Style, Motion Blur, and View Bobbing. Sun Shadows is now Shadows, from Off to High, and Load Custom Clouds is gone.
- Shadow Style is Pixel by default: crisp shadows stepped on the textures' 16-pixel grid, at Low quality or off. Soft shadows also go up to Medium and High.
- Motion Blur blurs only the 3D scene, never the HUD or menus. Ultra turns it on and the other presets leave it off. It stays restrained and resets across camera cuts, teleports, respawns, and panorama captures.
- The default render distance is 16 chunks, up from 8. A render distance you already chose is kept.

### The Magnetic Warden
- The encounter now unfolds across three distinct forms: Warden, Aegis, and Storm. The boss has 400 health, up from 240; the Aegis takes over at 250 and the Storm at 100. It keeps up the pressure across the whole arena.
- Polarity drives the fight: same polarity repels, opposite attracts. Matching bolts bounce off active Polarity Boots; opposing the exposed boss lets your strikes land.
- Tower crystals shield every form: break one crystal in Form I, two in Form II, and all four, relit, in Form III. A shield never runs out on its own.
- A lit tower takes the boss's polarity. Climb it with the opposite polarity, and when it flips, press Flip Polarity (R) inside the warning window to keep your grip; miss it and you are shocked off.
- Form I mixes volleys, Lash, Charge, and a Draw into a Repel burst. Lash and Charge have delayed follow-up swings, and white-marked melee attacks must be dodged whatever your polarity.
- The Aegis follows tower climbers with aimed volleys and side sweeps, with each crystal powering a different pattern. Breaking both brings it down onto dry ground for a damage window; tracking slams also threaten the platform.
- The Storm combines timed polarity flips, expanding rings, spiral bolts, double beats, and tracking slams. The slam marker turns white when its target locks; the central impact hurts regardless of polarity.
- Breaking a shield or landing a Magnet Slam creates a clear opening. The final stretch speeds up the Storm's rhythm and sends its orbiting shards into the fight.
- Gone from the old fight: parrying bolts back at the boss, unannounced polarity feints, and damage from simply touching the boss.
- The boss bar names the current form and shows which crystals still stand, or EXPOSED when the boss can be hurt. Charged towers glow, white lanes mark the Charge, an off-screen compass points to the boss, and ground warnings match each attack's area.
- A new defeat cinematic follows the Warden's collapse and the towers going dark. Press Jump (Space) to skip it.

### Combat & Magnetic Movement
- Press Dodge (C) to roll, with no special gear, even in mid-air. Rolls give brief invulnerability, and rolling through a landing cancels its fall damage.
- Rolls use stamina and have a short recovery. Readouts show your stamina and when you can roll again, and a press that can't be taken flashes by the crosshair.
- With active Polarity Boots, Dodge also dashes you to an opposite magnet face, leaps you away from a matching Warden, or launches you off a wall toward the landing pools.
- Dash into an opposed, exposed Warden to ready a Magnet Slam: your next strike deals 2.5 times damage and staggers it.
- Melee attacks have weapon-specific windup, hit timing, and recovery, with matching held-item motion. Weapon tooltips show attack speed.
- Placing blocks and using items keep the same pace at any frame rate (they ran faster on high-refresh screens), and switching items or opening a menu stops any eating or mining in progress.

### Cameras, Skins & Player Animation
- F5 toggles free third person: orbit the camera while your character moves independently, with sprinting available in every direction.
- F6 toggles over-the-shoulder third person, keeping the body aligned with the camera. Both views hang the camera on an arm that pulls in from nearby blocks.
- F7 cycles the detached camera: fly it into position, press again to park it and keep playing through it, then press again to return to the player view.
- F1 hides the HUD, your hand and the block outline, for clean screenshots.
- Boss fights start in free third person and restore your previous view afterward.
- Choose a skin from the preview carousel in Options > Skins, or import a Minecraft skin. The jointed player model shows held items, equipped armor, eating, attacks, climbing, rolls, and magnetic moves.
- First-person hands and the camera respond to walking, sprinting, sneaking, jumping, and landing. Your whole body casts a shadow, even in first person.
- Mining shows ten crack stages and knocks chips off the block. Dropped items bob and fly to you when picked up, and Vault enemies settle into the floor when they die.
- The hotbar frame slides between slots, your health flashes when you are hit and twitches when low, and chat lines fade out on time.
- In boats you sit and row.

### Menus & Panoramas
- Luminous Coast is the new default menu and loading background. The original panorama is still available as Classic Atlas in Options > Menu Background.
- Your own captured or imported panoramas still work, and the built-in ones can't be deleted.
- Menus, dialogs, the inventory, and the loading and death screens ease in, and World Editor sections fade between pages. These skip their motion if your system asks for reduced motion.

### Interface
- Menus, dialogs, the HUD and the inventory are redrawn: navy panels in brass frames, parchment text, and brass for the action that matters on each screen. Text uses the Pixelify Sans pixel font, sized so it stays crisp; chat, commands and the F3 screen use Monocraft.
- The title screen has a new ATLAS wordmark.
- New vitals: life crystals for health, loaves for hunger, steel plates for armor, and bubbles for breath, with the same ten pips and half pips as before. Together they are exactly as wide as the hotbar, and the selected hotbar slot has a brass frame.
- The boss bar sits in a brass frame under a name plate, keeping its bright polarity colours.
- The inventory is narrower, so it fits beside the recipe book. Empty armor slots show what goes in them, the furnace has a pixel flame and a filling arrow, and a chest labels your own inventory below it.
- Create New World picks a terrain preset with a World Type button instead of a drop-down list.
- The crosshair is a pixel cross that inverts whatever it sits over. The death screen drains the colour from the world.
- Chat stays clear of the hotbar on smaller screens, and the tutorial marks which section is open.

### Sound & Low Health
- At four hearts or less, a heartbeat and a crimson pulse around the screen warn that your health is low. The heartbeat quickens as health falls and stops once you are back to five hearts.
- The low-health pulse sits beneath the polarity rim, so the boss's red and blue cues stay readable.
- New Magnetic Warden and Bell Titan fight music and steadier music changes during encounters. At night, a boss's frenzy now adds its pitch change to the night slowdown instead of replacing it.
- Creative mode plays the normal biome and cave music when its own music folder is empty.
- New feedback sounds for magnetic movement and tower events.

### Water & Lava
- Water and lava now flow by Minecraft's rules. Water spreads seven blocks, one level lower each block, and runs toward the nearest drop within four blocks; lava spreads three blocks and moves six times slower.
- Flowing water falls in columns and spreads out where it lands. A flow cut off from its source drains away, and water between two sources on solid ground becomes a new source.
- Lava pouring down into water turns the water to stone.
- Water and lava surfaces slope between neighbouring levels, and flows saved partway continue once their area loads again.
- Large floods no longer stall the game: moving water relights the world in batches instead of block by block.
- Caves no longer break through the sea floor and leave dark holes in the ocean.

### Farming & Trees
- Till grass or dirt with a hoe to make farmland, then plant wheat seeds on it. Hold the button to till or plant along a row.
- Water within four blocks keeps farmland dark and moist, and wheat on moist soil grows much faster. Crops need light to grow.
- Wheat grows through eight stages. Harvest it golden for wheat and extra seeds: three wheat in a row make bread.
- Dry, empty farmland turns back to dirt, a block set on top packs it down, and a hard landing tramples it. Water washing over a crop drops its harvest.
- Felled trees shed their leaves a few seconds later, dropping the saplings, apples and sticks they held. Leaves you place never fall.

### Recipe Book
- A recipe book opens beside the crafting grid, in your inventory and at a Crafting Table. It lists every recipe you have held an ingredient for, so a new world starts with planks and it fills in as you gather.
- Search it, sort it by Blocks, Tools & Gear, Food, or Materials, or show only what you can make now. Recipes you can make come first; red ones are missing an ingredient, and a table mark means it needs a Crafting Table.
- Click a recipe to lay its ingredients into the grid, or shift-click for as many crafts as you can make. Whatever was in the grid goes back to your inventory first.

### Controls & Getting Started
- A new Controls screen in Options sets mouse sensitivity and inverted look, and rebinds any key: click an action and press its new key. Keys bound twice show in red, and every key can be reset.
- Music & Sounds sliders are named for what they play: Weather is now Ambient & Events, Hostile Creatures is Enemies & Bosses, Players is Player, and Voice/Speech is Interface. The unused Friendly Creatures slider is gone.
- The Tutorial now covers the first recipes, where food comes from, beds, every key, and how to find the Magnetic Fields.
- You never spawn or respawn inside a still-sealed Magnetic Fields region, and a new world's first spawn steers clear of dark forests, swamps, and jungles.

### Worlds & Menus
- Each world now has Allow Commands. It is off for new Survival worlds and on for Creative and Spectator, unless you choose otherwise when creating the world. With it off, only /help, /sound and /music work.
- World Options in the pause menu switches Allow Commands, Keep Inventory (which now saves with the world) and Show Coordinates, and shows the world's seed.
- Show Coordinates puts your position in the corner of the screen.
- The Magnetic Fields are much closer: the nearest is usually about two thousand blocks from where you start. Resonant Vaults never generate inside them.
- The title screen is now Singleplayer, World Editor, Options, and Tutorial or Quit: the World Editor opens directly, and the unfinished Multiplayer and Feature Editor buttons are gone. Panorama settings moved to Options > Menu Background, and saved worlds list their mode and seed.

### Performance & Memory
- Adjacent full-block faces merge into larger surfaces while keeping their tiled textures, so the world takes far less geometry to draw.
- Settled chunks draw together in small regions with tight visibility bounds, cutting repeated rendering work.
- Chunk geometry uses more compact data, and empty chunks no longer reserve block metadata, so memory grows more slowly as chunks load.
- Water and glass no longer build faces against chunks that have not loaded yet.
- Starting a boss fight no longer hitches: boss lights use the world's shared light system instead of making every terrain shader rebuild.

### Saves & Gameplay Fixes
- Items on the ground now save with the world, including their remaining despawn time. Reloading no longer deletes dropped supplies or boss loot that has not yet landed.
- Items stop being pulled toward dead players and cannot be collected in the first moments after respawning.
- Fast-moving bodies no longer pass through thin floors and walls, and blocks cannot be placed inside entities.
- The world clock stays in step with the player under heavy load.
- A refused or lost mouse capture no longer crashes to an error screen.
- Panorama capture (F8) renders its six views off-screen in a single moment instead of switching your field of view to 90 and turning your camera.
- If blocks ever appear inside you, you are moved to the nearest open space instead of being stuck.
- Desktop Ctrl+W, Ctrl+R, and Ctrl+Q no longer close, reload, or quit the game during movement and item dropping.
- The boss bar and the polarity block and tint no longer draw over the pause menu and inventory.

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
