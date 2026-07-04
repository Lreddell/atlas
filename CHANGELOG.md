# Changelog

All notable changes to Atlas are documented here. This file is the single
source of truth — mirror it into the in-game "What's New" popup
(`src/data/changelog.ts`) and the GitHub release notes when you publish.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow the existing `vX.Y.Z-alpha` scheme.

## [Unreleased] — v1.1.0-alpha

> Draft. Not yet published to the website or tagged. Accumulate notes here as
> the update is built, then publish when ready.

### Highlights
- Explore the expanded Magnetic Fields — ruins, pylons, launch pads, and loot caches —
  and defeat the Magnetic Warden in a multi-stage arena fight.
- Master polarity boots to attract, repel, launch, and climb through magnetic terrain.
- Discover 13 new biomes (now with real swamps and sandy beaches), three new wood
  families, and many biome-specific blocks.
- Delve overhauled caves — deepslate depths, dripstone caverns, glowing lush hollows,
  and amethyst geodes — all tunable live in the World Editor.
- Craft full armor sets with an on-screen defense and durability readout, and sail a
  craftable boat.
- Safer local world saves now migrate automatically and finish saving when you quit.
- Major polish for shaped blocks, lighting, music, menus, controls, and update notes.

### Adventure & Magnetic Fields
- Explore the rare Magnetic Fields biome, now half again larger: tiered magnetite
  terrain, crystal deposits, glowing shard clusters, charged veins, spike hazards,
  polarity launch pads, pylon route markers, collapsed ruins, a lava-ringed arena,
  and a full magnetite building set.
- Ruins can shelter loot caches stocked with magnetite materials, crystals of both
  polarities, and sometimes rarer metals.
- Magnetic Fields begin sealed. Defeat their Warden to cleanse the region and unlock
  normal mining and building; doors, containers, and required crystals remain usable.
- Summon the Magnetic Warden at the central altar, break its four shield crystals,
  parry returnable bolts, and survive homing slams, polarity feints, and a final frenzy.
- Polarity Boots let you switch attraction and repulsion around red and blue magnets,
  launch between structures, and climb magnetic walls. The Warden drops an upgrade
  that adds an on/off toggle. Magnet forces no longer spike at point-blank range.
- Defeated bosses, cleansed regions, and equipment persist with each world. Dying or
  leaving the arena resets an unfinished fight so it can be summoned again.
- The World Editor now fully edits Magnetic Fields generation (size, rarity, tiers,
  arena, blending), can find and jump to the nearest Warden arena, copy its teleport
  command, and reads out tier/center/field values under the cursor.
- A new World Editor Caves tab exposes every cave attribute — each carving layer, the
  deepslate band, and all decoration densities — over a live vertical cross-section
  preview that redraws as you tune, so you can see exactly how the caves will look.

### World Generation & Building
- Added Birch Forest, Flower Forest, Dark Forest, Meadow, Savanna, Jungle, Taiga,
  Ice Spikes, Mountains, Swamp, Beach, Stone Shore, and Magnetic Fields biomes.
- A generation quality pass: swamps, jungles, and dark forests actually generate now
  (the old mountain rule silently swallowed them), sandy beaches rim the coasts,
  biome edges read organic instead of blocky, and oceans no longer inherit mountain
  or mesa terrain.
- Volcanic Crags is a normal (unsealed) biome again — it previously claimed to be a
  boss region that had no boss, leaving it permanently unmineable.
- New terrain includes distinct ground cover and vegetation, jagged snowy mountains,
  packed-ice spires, muddy wetlands, rocky shores, and auroras in snowy regions.
- Added jungle, dark oak, and acacia trees with matching planks, saplings, slabs,
  stairs, crafting recipes, and dedicated textures.
- Overhauled caves: layered spaghetti tunnels, cheese caverns, noodle threads, and
  deep swiss-cheese holes now carve deepslate depths, with dripstone caverns (pointed
  dripstone), lush hollows (moss + emissive glow lichen that lights the dark), and
  rare amethyst geodes (calcite shell, budding amethyst, glowing clusters).
- Stairs form corner shapes when placed against neighbouring stairs, and matching
  slabs merge back into full blocks.
- Light, smooth shading, and ambient occlusion now respect the solid and open parts
  of slabs and stairs without over-darkening them.
- Selection outlines, inventory icons, held and dropped models, plants, and torches
  now follow the real shape and support surface of slabs and stairs.

### Boats & Traversal
- Craft a Boat from 5 planks (any wood family) and use it on a water cell to set it
  afloat as a real boat in the world; right-click to board.
- Riding glides at over triple swimming speed, bobs at the surface, and scrapes
  slowly if beached; sneak hops out and leaves the boat parked where you left it.
- Boats are saved with your world, survive reload and world switches, and a couple
  of punches break one back into its item.

### Combat & Gear
- Melee combat now uses each weapon's real damage, with knockback, hit feedback,
  loot drops, and clear boss health and shield feedback.
- Tools and weapons wear down through use, show durability bars, and break at zero;
  material tiers now have distinct damage and durability.
- Added equippable iron, gold, diamond, and copper armor sets with defense and
  durability, plus dedicated armor slots in the inventory screen — and every set is
  now craftable.
- New armor HUD: defense pips above the hearts and per-piece durability icons at the
  bottom-left, with a red pulse when a piece is close to breaking.
- Wool now weaves from wheat seeds (so beds are craftable in survival), packed ice
  crafts from ice, and Charged Magnetite and Magnetic Spikes have recipes.
- Every tool, weapon, armor piece, and special item now has its own inventory and
  held-item artwork, including a dedicated icon for the Warden's boot-upgrade drop.
- Inventory tooltips now show real gameplay stats — attack, tool class, harvest
  tier, mining power, defense, durability, and food — and the hotbar name plate
  carries a compact stat line for the held item.

### World Saves
- Desktop worlds now live as files in the Atlas save folder; browser worlds use the
  browser's private on-device filesystem, with automatic fallback when unavailable.
- Existing worlds migrate automatically while their original data is retained, and
  portable world export and import remain compatible.
- Saving is more resilient: unsaved chunks stay loaded for retry, respawning saves
  immediately, cursor-held items persist, and quitting or closing performs a final save.
- A world already open in another Atlas window or browser tab is blocked from opening
  again, preventing two sessions from overwriting the same save.
- Worlds can be renamed in-game; desktop players can open the save folder directly,
  and the world menu shows the active save type and storage use.

### Audio & Presentation
- Added dedicated Magnetic Fields and Magnetic Warden music, including phase-aware
  boss intensity, plus a new ocean track.
- Added death music and an optional slower, calmer night soundtrack, enabled by default.
- The Warden encounter includes a summon cinematic, shield beams, fog, particles,
  camera shake, clearer phase warnings, and distinct combat sounds.
- Rename, confirmation, and boss-warning dialogs now match the main menu style.

### Controls & Fixes
- Holding Ctrl no longer blocks scroll-wheel hotbar switching, and polarity switching
  continues to work while sprinting.
- Added /keepinventory and /setspawn commands.
- Eating can repeat while held; use and place animations only play after a successful action.
- Water only breaks a fall when the landing actually reaches it, and dropped items'
  five-minute timer pauses while their chunk is unloaded.
- Browser shortcuts no longer interrupt play, and tab closing is blocked while a world loads.
- Fixed held shaped items rendering inside-out and double-slab merging being misread
  against the player's collision box.
- Fixed distant oceans rendering see-through: deep water kept its floor instead of
  being culled with enclosed cave geometry.
- Fixed rare save/session bugs: chunk streaming could stall after long fast travel,
  an edit made during an autosave flush could be lost, spreading a stack across
  nearly-full slots destroyed the overflow, and mining costs always charge the tool
  that did the mining.
- Defeating the Warden and quitting immediately no longer leaks its loot or arena
  rebuild into the next world you open, and item drops no longer carry over between
  worlds.
- A failed save now shows a warning in-game instead of crashing to an error screen
  (including a Windows file-lock case during autosave).
- The tutorial covers magnetism, the Warden, gear durability, and current commands;
  smoother performance around magnets and during growth ticks.
- Added an in-game "What's New" screen that appears after updates and can be reopened
  from the main menu.

## [v1.0.2-alpha] — 2026-06-15

A large stability, performance, and content update. See the
[full release notes](https://github.com/Lreddell/atlas/releases/tag/v1.0.2-alpha).

### Highlights
- Chunk streaming moved to a unified Web Worker pool — no more severe frame
  drops at high render distance.
- Physics-based movement rebuild with real momentum, sprint-jumping, and auto-step.
- First slabs & stairs for 9 material families, with full placement control.
- New tools, sandstone crafting, and recipes for every new block.

## [v1.0.1-alpha] — 2026-05-15

- Windows installer release.

[Unreleased]: https://github.com/Lreddell/atlas/compare/v1.0.2-alpha...main
[v1.0.2-alpha]: https://github.com/Lreddell/atlas/releases/tag/v1.0.2-alpha
[v1.0.1-alpha]: https://github.com/Lreddell/atlas/releases/tag/v1.0.1-alpha
