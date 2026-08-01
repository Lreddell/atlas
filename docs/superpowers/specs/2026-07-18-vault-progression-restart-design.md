# Resonant Vault Progression Restart Design

## Source baseline

This design targets PR 4 commit `2a87322`. It preserves the new per-vault room pool, readable mechanism previews, enemy behaviors, and authored audio added by the latest branch.

## Progression and layout

The arrival route ends at a central hub. The boss antechamber and arena sit directly ahead on a central axis. Every generated challenge room sits in one of two side circuits and is reachable before the boss threshold. Fractured archives and annex caches remain optional.

Challenge requirements are dynamic because the new room pool can place a fractured archive in a major slot. One exported challenge classifier drives the HUD numerator and denominator, seal readiness, antechamber activation, and boss eligibility. The boss threshold is the only permanent `inner_seal`; combat gates remain temporary and room-owned.

The seal opens only after every generated challenge is complete. Entering the arena never starts the boss. The antechamber plate becomes a consent point and opens an Atlas-styled prompt:

- `Answer the Bell?`
- `The chamber beyond has waited a very long time. What wakes there will not return quietly.`
- `Strike the Seal`
- `Step Back`

Confirming starts a dedicated Bell Titan cinematic. Arena lights wake in rings, dust falls, chains tense, a low toll reveals the cracked core, and the Titan raises its head. It uses none of the Magnetic Warden's crystals, beams, orbit, or energy sphere.

## Puzzle language

The latest route-preview system remains. Memory pylons gain four clearly distinct positional bell cues, stronger persistent correct-step light, and an obvious resolved chord. Relay progress lights its conduit one segment at a time. Counterweight activation visibly raises the route from entrance to crest and its completion plate answers only after deployment. Wrong input produces a descending cue and resets visible progress. Objective copy describes state, not instructions.

## Broken crossing

The upper route has deliberate islands and no floor bypass. A fall enters a sealed lower judgment pit rather than teleporting the player. It deals meaningful nonlethal damage, switches to combat music, shows `The lower hall has heard you.`, and begins a recoverable wave encounter. Clearing the waves completes the room and opens a supported staircase to the far landing. Pit bounds, floor, walls, headroom, spawns, and return stairs are generated and reserved so caves cannot expose the route.

## Loot

Guaranteed teaching weapons remain. Optional loot is rolled from deterministic weighted tables keyed by vault and cache identity. Supply, armory, archive, crypt, recovery, and core pools differ in items, weights, stack ranges, and rare chances. The same generated cache is stable on reload, while different vaults and cache categories produce meaningfully different contents. The first-clear Titan Hammer remains unique.

## Music

Same-track decoded loop overlaps use constant-sum fades so correlated head and tail audio cannot swell. Crossfades between different musical states retain equal-power curves. Retiring and resuming a cue cancels stale scheduled voices before rescheduling, preventing gain accumulation.

## Validation

Focused Node tests cover dynamic challenge counting, side-wing reachability, the single boss seal, nonintersecting room/corridor geometry in all orientations, puzzle feedback mappings, pit recovery, boss consent and single spawn, loot diversity/determinism, and constant-sum loop fades. Final checks are typecheck and production build; no manual playtest is required.
