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
- Explore the Magnetic Fields and defeat the Magnetic Warden in a multi-stage arena fight.
- Master polarity boots to attract, repel, launch, and climb through magnetic terrain.
- Discover 12 new biomes, three new wood families, and many biome-specific blocks.
- Equip full armor sets and use tier-based weapons and tools with visible durability.
- Safer local world saves now migrate automatically and finish saving when you quit.
- Major polish for shaped blocks, lighting, music, menus, controls, and update notes.

### Adventure & Magnetic Fields
- Explore the rare Magnetic Fields biome: tiered magnetite terrain, crystal deposits,
  spike hazards, launch routes, a lava-ringed arena, and a full magnetite building set.
- Magnetic Fields begin sealed. Defeat their Warden to cleanse the region and unlock
  normal mining and building; doors, containers, and required crystals remain usable.
- Summon the Magnetic Warden at the central altar, break its four shield crystals,
  parry returnable bolts, and survive homing slams, polarity feints, and a final frenzy.
- Polarity Boots let you switch attraction and repulsion around red and blue magnets,
  launch between structures, and climb magnetic walls. The Warden drops an upgrade
  that adds an on/off toggle.
- Defeated bosses, cleansed regions, and equipment persist with each world. Dying or
  leaving the arena resets an unfinished fight so it can be summoned again.
- The World Editor can place Magnetic Fields and preview the Warden's arena influence.

### World Generation & Building
- Added Birch Forest, Flower Forest, Dark Forest, Meadow, Savanna, Jungle, Taiga,
  Ice Spikes, Mountains, Swamp, Stone Shore, and Magnetic Fields biomes.
- New terrain includes distinct ground cover and vegetation, jagged snowy mountains,
  packed-ice spires, muddy wetlands, rocky shores, and auroras in snowy regions.
- Added jungle, dark oak, and acacia trees with matching planks, saplings, slabs,
  stairs, crafting recipes, and dedicated textures.
- Stairs form corner shapes when placed against neighbouring stairs, and matching
  slabs merge back into full blocks.
- Light, smooth shading, and ambient occlusion now respect the solid and open parts
  of slabs and stairs without over-darkening them.
- Selection outlines, inventory icons, held and dropped models, plants, and torches
  now follow the real shape and support surface of slabs and stairs.

### Combat & Gear
- Melee combat now uses each weapon's real damage, with knockback, hit feedback,
  loot drops, and clear boss health and shield feedback.
- Tools and weapons wear down through use, show durability bars, and break at zero;
  material tiers now have distinct damage and durability.
- Added equippable iron, gold, diamond, and copper armor sets with defense and
  durability, plus dedicated armor slots in the inventory screen.
- Every tool, weapon, armor piece, and special item now has its own inventory and
  held-item artwork.

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
