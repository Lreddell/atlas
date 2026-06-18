# Changelog

All notable changes to Atlas are documented here. This file is the single
source of truth — mirror it into the in-game "What's New" popup
(`src/data/changelog.ts`) and the GitHub release notes when you publish.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow the existing `vX.Y.Z-alpha` scheme.

## [Unreleased] — v1.0.3-alpha

> Draft. Not yet published to the website or tagged. Accumulate notes here as
> the update is built, then publish when ready.

### Highlights
- Big slabs & stairs pass: corner stairs, double-slab merging, and correct shading.
- Light now flows correctly through and around shaped blocks.
- New death music plus an optional calmer night soundtrack (on by default).
- Holding Ctrl no longer blocks scroll-wheel hotbar switching.
- In-game "What's New" popup that shows on update and can be reopened from the main menu.

### Building & Lighting
- Stairs form corner shapes when placed against neighbouring stairs.
- Placing a matching slab onto a slab merges them back into a full block.
- Light passes through the cut-out part of slabs/stairs and is blocked by the
  solid part — correctly from both sides.
- Smooth lighting and ambient occlusion shade slabs and stairs properly
  (fixed stair AO over-darkening).
- Selection outlines hug the real block silhouette; stair inventory icons are seamless.
- Dropped and held slabs/stairs render as their true shape.
- Plants and torches follow proper support rules on shaped blocks.

### Audio
- Added death music.
- Optional slower, calmer music at night (enabled by default; toggle in Options).

### Fixes
- Fixed held shaped items rendering inside-out.
- Fixed double-slab fusion being mis-detected against the player's collision box.
- Documentation and licensing cleanup.

## [v1.0.2-alpha] — 2026-06-15

A large stability, performance, and content update. See the
[full release notes](https://github.com/Lreddell/atlas/releases/tag/v1.0.2-alpha).

### Highlights
- Chunk streaming moved to a unified Web Worker pool — no more severe frame
  drops at high render distance.
- Minecraft-style movement rebuild with real momentum, sprint-jumping, and auto-step.
- First slabs & stairs for 9 material families, with full placement control.
- New tools, sandstone crafting, and recipes for every new block.

## [v1.0.1-alpha] — 2026-05-15

- Windows installer release.

[Unreleased]: https://github.com/Lreddell/atlas/compare/v1.0.2-alpha...main
[v1.0.2-alpha]: https://github.com/Lreddell/atlas/releases/tag/v1.0.2-alpha
[v1.0.1-alpha]: https://github.com/Lreddell/atlas/releases/tag/v1.0.1-alpha
