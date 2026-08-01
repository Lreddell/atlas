# Resonant Vault Definitive Overhaul Design

**Date:** 2026-07-14

**Status:** Implemented and production-audited; optional FL mastering remains deferred

## 1. Authority and supersession

This document is the new implementation contract for the Resonant Vault work on PR #4. It supersedes the player experience, boss, item progression, room topology, enemy presentation, and escape designs in:

- `2026-07-13-resonant-vaults-design.md`
- `2026-07-13-resonant-vaults-decisions.md`
- `2026-07-14-resonant-vault-production-overhaul-design.md`
- `2026-07-14-resonant-vault-production-overhaul.md`

Earlier safety, classification, lighting, environmental-guidance, and validation requirements remain binding unless this document explicitly replaces them. Resonant Vault prototype compatibility is explicitly superseded: the feature has one current schema and no conversion layer.

The implementation plan must be rewritten from this specification. Obsolete Vault Mason, Resonator, Pulse Bracer, three-wing, and underground-exit tasks must not be carried forward merely because code for them already exists.

## 2. Product goal

The Resonant Vault becomes a complete 45 to 70 minute authored expedition that can stand beside Atlas's main content rather than feeling like an MVP or a collection of generated test rooms.

The intended first-clear story is:

> I found a ruined spire, descended through a real underground complex, learned its echo machinery from the environment, found useful weapons, fought through several distinct chambers, defeated the Bell Titan, chose an escape route, and reached the surface before the vault became fully unstable.

The structure may look completely different from the existing implementation. Current registered IDs and the current progression schema are authoritative; retired prototype items, fields, room aliases, and boss repair paths are not retained or converted.

## 3. No-regression contract

The overhaul must retain or strengthen every previously approved requirement below.

| Requirement | Definitive treatment |
| --- | --- |
| Every intended room connects physically | Explicit doorway sockets, post-furnishing opening reassertion, and generated-voxel flood-fill tests remain mandatory. |
| Environmental teaching instead of prose | The world teaches through placement, shape, animation, light, particles, and sound. No room instruction paragraphs or lore walls return. |
| Compact Atlas-native HUD | Retained and expanded only with compact contextual progress. No neon, holographic, gradient, or quest-card presentation. |
| Restrained luminous biome materials | Retained. Glow is sparse and functional on blocks, never a general UI or enemy treatment. |
| Adequate authored lighting | Strengthened. All routes, objectives, enemies, and the Bell Titan must be readable without player torches. |
| Torches inside the sealed structure | Retained through the action-aware edit policy. |
| Echo preview readability | Strengthened with visible pylon-top cues, ordered particles, positional events, persistent input markers, and replay. |
| Traversal cannot be bypassed | Strengthened with checkpoint validation and physical perimeter closure. |
| Enemies do not leak into stairs or adjacent rooms | Strengthened with encounter thresholds, room ownership, and shared navigation. |
| Two true surface exits | Strengthened into two architecturally and mechanically different routes that both reconcile with actual surface height. |
| Escape completion at the surface | Retained. An underground gate or room never completes escape. |
| Current-only save and load behavior | Vault progress serializes and validates only the current room, Titan, core, route, timer, and checkpoint fields. Unknown prototype fields are discarded rather than migrated. |
| No destructive regeneration of persisted chunks | Retained. The full new topology is guaranteed for newly generated vault footprints. |
| Recorded or genuinely performed production audio | Retained as the final audio quality bar, but production is explicitly paused until the user authorizes FL Studio work. |
| No synthesized placeholder fallback | Retained. Missing vault audio fails silent with diagnostics. |
| No abrupt sound cutoff | Retained for one-shots, musical tails, and context changes. |
| Music returns to world contexts | Strengthened with an explicit priority state machine and mid-track interruption. |
| Current block and item IDs are exact | Registered world blocks and current items keep their assigned IDs; retired prototype ID holes remain unregistered and are never converted. |
| No broad `App.tsx` or `WorldManager.ts` refactor | Retained. New systems attach through narrow lifecycle and query boundaries. |

### 3.1 Final audit evidence (2026-07-15)

| Contract row | Exact evidence |
| --- | --- |
| Every intended room connects physically | `resonantVaultConnectivity.test.mjs`: `painted voxels connect entrance, mandatory rooms, boss, both exits, and surface thresholds`; `resonantVaultGeometry.test.mjs`: `the entrance staircase has continuous treads and never cuts through another room`, `escape courses remain shelled against caves while preserving clear headroom`, and `the final decoration pass cannot reseal a doorway opening`. |
| Environmental teaching instead of prose | `resonantObjectiveHud.test.mjs`: `the world owns every teaching cue instead of floating instructions`; `resonantVaultGuidance.test.mjs`: `prose popups and the vault guide command are removed`. |
| Compact Atlas-native HUD | `resonantObjectiveHud.test.mjs`: `the HUD uses Atlas tokens, stays compact, and can be recalled without neon treatment`. |
| Restrained luminous biome materials | `resonantEchoTiming.test.mjs`: `memory echoes sustain pylon caps, floor glyphs, and dust trails with world-lit materials`; final forbidden-treatment scan across 95 runtime files returned zero matches. |
| Adequate authored lighting | `resonantVaultGeometry.test.mjs`: `authored fixtures keep every main corridor anchor within eight blocks of light` and `occupied room centers use restrained recessed lamps instead of leaving puzzle floors black`; `bellTitanEncounter.test.mjs`: `the Titan cannot attack until the arena illumination finishes`; Playwright smoke in a newly generated vault confirmed the Memory Choir and routes render readably with zero console errors. |
| Torches inside the sealed structure | `resonantInteraction.test.mjs`: `sealed vault edit policy allows only crystals and safe torches`. |
| Echo preview readability | `resonantEchoTiming.test.mjs`: `vault runtime gives memory patterns sustained typed steps while Crossing keeps preview timing` and `memory echoes sustain pylon caps, floor glyphs, and dust trails with world-lit materials`. |
| Traversal cannot be bypassed | `resonantVaultGeometry.test.mjs`: `definitive puzzle furnishing removes the Crossing bypass and paints exact descriptor controls`; `resonantVaultHazards.test.mjs`: `the Fracture Stair has no walkable perimeter bypass`. |
| Enemies do not leak into stairs or adjacent rooms | `resonantEncounterActivation.test.mjs`: `an enemy in the next sealed room does not activate through the wall` and `live encounters are room-scoped, gate-aware, capped, and use swept enemy bolts`. |
| Two true surface exits | `resonantVaultEscapes.test.mjs`: `the two exits have measurably different risk and length`, `both final stair volumes open above actual terrain`, and `real layouts preserve route distinction and surface reachability across 128 seeds`; `resonantVaultGeometry.test.mjs`: `ocean-height probes always place the exits and surface landing above water`. |
| Escape completion at the surface | `resonantVaultEscapeRuntime.test.mjs`: `an underground outlet threshold cannot complete the escape`; `resonantVaultExperience.test.mjs`: `the complete-journey harness is deterministic and proves both authored exits`. |
| Current-only save and load behavior | `resonantVaultProgress.test.mjs`: `new vault progress uses only the current expedition schema`, `unknown prototype fields are discarded instead of converted`, and current checkpoint state round-trips exactly. |
| No destructive regeneration of persisted chunks | `resonantVaultConnectivity.test.mjs`: `preflight accepts atomically and rejects any persisted footprint conflict` and `a session-rejected candidate is not stamped by chunk generation`. |
| Recorded or genuinely performed production audio | `resonantVaultAudio.test.mjs`: `every active Vault cue is fail-silent, decodable, tail-safe, and provenance-backed`, plus dedicated Bell Titan and enemy provenance checks. Optional FL mastering remains on hold. |
| No synthesized placeholder fallback | `resonantVaultAudio.test.mjs`: the active-cue provenance scan rejects synthesized, oscillator, and generated-tone sources and verifies `fallback: false`. The runtime forbidden-term scan is clean. |
| No abrupt sound cutoff | `musicStability.test.mjs`: `music transitions never own or truncate gameplay one-shot voices`; `resonantMusicTransitions.test.mjs`: vault contexts crossfade directly without a stop-first gap. |
| Music returns to world contexts | `resonantMusicTransitions.test.mjs`: `leaving the vault mid-song restores the live world context`; `musicLoops.test.mjs`: all four vault cues use sample-accurate overlapping loop schedules. |
| Current block and item IDs are exact | `resonantCatalogs.test.mjs`: world block IDs and the ten current inventory item IDs are exact, collision-free, and byte-sized; retired prototype IDs 172 and 174-176 remain unregistered. |
| No broad `App.tsx` or `WorldManager.ts` refactor | `resonantVaultExperience.test.mjs`: `world transitions use one narrow vault-runtime reset and clear every transient subsystem`; final diff review confirmed the locator and reset remain narrow attachment points. |

## 4. Scope and non-goals

### In scope

- A ground-up visual and spatial rebuild of newly generated Resonant Vaults.
- A graph-planned 12 to 16 room expedition with deterministic seeded variation.
- A rebuilt entrance stair and two true surface escape stairs.
- Several puzzle, traversal, combat, reward, and optional rooms.
- Conventional vault weapons and one unusual echo artifact.
- Several dedicated combat rooms and a revised vault enemy roster.
- General bounded voxel navigation for ordinary ground mobs.
- Creature-specific locomotion, models, textures, and animation states.
- The Bell Titan as a completely new boss.
- Correct boss, escape, vault, and overworld music transitions and audible gapless looping.
- Complete automated and in-game production validation.

### Out of scope

- A general quest, dialogue, map-marker, or cinematic framework.
- Destructive conversion of already persisted vault chunks.
- Renumbering existing content IDs or widening chunk block storage.
- A repository-wide AI architecture rewrite unrelated to ground navigation.
- A broad refactor of `App.tsx` or `WorldManager.ts`.
- FL Studio use, track remastering, new performed music, or final SFX production until the user explicitly lifts the hold.

The feature cannot be declared fully production-complete while final audio production is held. Code-side audio reliability and loop work may proceed.

## 5. Player journey and pacing

The first clear targets 45 to 70 minutes without padding through repeated waves or oversized empty corridors.

### Act 1: Discovery and descent, 5 to 8 minutes

- The Listening Spire is a clear ruin and entrance landmark.
- A visible three-block-wide stair begins at the surface.
- The stair uses switchbacks or a generous spiral, landings, parapets, arches, and integrated lamps.
- The entrance is usable without crafting an external key item.
- Sightlines preview the scale and material identity of the structure below.

### Act 2: Orientation and equipment, 8 to 12 minutes

- The Processional Gallery establishes the visual language.
- A supply reliquary uses the existing chest interaction and inventory UI.
- The Tuning Hall introduces the Echo Tuning Fork through a safe cause-and-effect interaction.
- An armory provides the first conventional vault weapon before a meaningful enemy encounter.
- The central hub previews unfinished routes through architecture rather than paragraphs.

### Act 3: Seeded expedition, 22 to 32 minutes

- Six major chambers are selected deterministically from an authored room pool.
- Guard Hall and Resonance Foundry are guaranteed selections, and Inner Works contains the third guaranteed combat encounter.
- Bell Crypt or another combat annex may add a fourth encounter without increasing the simultaneous-enemy cap.
- At least two non-combat puzzle or traversal chambers occur across the run.
- Two or three optional annexes add risk, loot, architecture, and replay variation.
- Encounter density increases later in the structure instead of spawning enemies near the entrance stair.

### Act 4: Inner works and Bell Titan, 8 to 12 minutes

- The route narrows into a distinct inner architectural act.
- The antechamber provides supplies, a safe sightline into the arena, and a strong lighting transition.
- The Bell Titan fight uses a clear repeated rule and visible phase damage.

### Act 5: Surface escape, 4 to 8 minutes

- Both exit gates open after the Titan falls and the core is claimed.
- The player chooses a longer combat-heavy ascent or a shorter traversal-heavy ascent.
- The timer and objective remain active until the player reaches open air at the actual surface outlet.

## 6. Deterministic macro-layout

### 6.1 Curated spine with seeded modules

Every newly generated vault uses a reliable fixed spine:

1. Listening Spire.
2. Entrance stair.
3. Processional Gallery.
4. Supply reliquary and Tuning Hall.
5. Central hub.
6. Seeded outer and middle chambers.
7. Inner Works.
8. Bell Titan antechamber and arena.
9. Core chamber.
10. Grand Ascent gate.
11. Fracture Stair gate.
12. Two separate surface outlets.

The vault seed selects six major modules and two or three optional annexes from the authored pool. Guard Hall and Resonance Foundry occupy two required major-module slots. At least two of Memory Choir, Counterweight Gallery, Acoustic Relay, and Broken Crossing occupy required major-module slots. Inner Works supplies the third guaranteed combat encounter. Selection, orientation, offsets, encounter composition, loot, and decoration use the vault's stable deterministic RNG. `Math.random()`, wall-clock input, and iteration-order-dependent selection are prohibited.

### 6.2 Graph-first placement

The layout graph is selected before voxel painting. Each room exposes typed doorway sockets with:

- Position and facing.
- Required clear width and height.
- Interior overlap volume.
- Corridor overlap volume.
- Frame reservation volume.
- Optional progression gate ownership.
- Navigation anchors on both sides.

Rooms may be non-rectangular, multi-level, asymmetrical, or vertically stacked, but their reserved bounds and sockets remain deterministic.

The complete reserved structure volume suppresses later terrain, cave, fluid, ore, and unrelated feature writes that would invade a critical room, corridor, staircase, arena, or outlet. Protection remains chunk-local and deterministic.

### 6.3 Connection guarantees

Generation order is:

1. Select and place room bounds.
2. Reject overlap or invalid terrain integration.
3. Paint structural shells.
4. Connect compatible sockets.
5. Paint furnishings and architecture.
6. Reassert every owned opening and clear corridor envelope.
7. Validate player-sized connectivity over actual generated voxels.
8. Reject or fall back from invalid layouts before accepting the vault candidate.

No visual-detail pass may write into a doorway's clear volume. No mandatory connection may rely on the player mining a wall.

### 6.4 Existing-world footprint safety

Before activating a vault candidate in an existing world, the structure system checks every chunk intersecting the spire, entrance, full underground reservation, both escape routes, and both surface outlets.

If a persisted chunk conflicts with the candidate and does not identify the same vault, the complete candidate is disabled and the locator advances to the next deterministic candidate. Partial new vaults across old terrain are prohibited.

## 7. Complete visual overhaul

### 7.1 Quality target

The current box rooms are not preserved for familiarity. Every major room is re-authored until it reads as a deliberately built place with a unique silhouette at first glance.

The structure must not rely on texture color to distinguish rooms. Spatial composition does that first.

### 7.2 Architectural language

The vault uses:

- Monumental load-bearing arches.
- Recessed wall bays and deep doorway frames.
- Stone ribs and aged bronze braces.
- Layered floors with insets, curbs, stairs, and slabs.
- Balconies, galleries, alcoves, and visible upper machinery.
- Broken but believable structural sections.
- Buttresses, parapets, railings, columns, and carved thresholds.
- Ceiling height variation and visible support logic.
- Rubble and wear placed outside critical navigation envelopes.
- Large recognizable landmarks instead of repeated decorative clutter.

### 7.3 Material language

- Base stone remains dark neutral blue-gray, but average surface value is raised so forms remain visible.
- Aged bronze and iron identify mechanisms, braces, weapons, and the Bell Titan.
- Dust, chips, joint wear, and darker recesses create depth.
- Restrained sea-glass or teal receptive accents identify active echo machinery.
- Purple and saturated cyan are not general vault colors.
- No UI, enemy body, room shell, or reward chest receives neon treatment.

### 7.4 Shaped blocks

The overhaul adds dedicated Echo Stone and Echo Brick slab and stair variants using the existing shape, metadata, texture-parent, placement, collision, and crafting paths.

They are used for:

- The full entrance staircase.
- Room dais edges and stepped floors.
- Balcony and parapet caps.
- Arched-frame approximations.
- Benches, shelves, broken trim, and landings.
- Both surface escape staircases.

They must render, collide, select, drop, place, orient, remesh, light, and persist exactly like existing slab and stair families.

### 7.5 Texture and model rules

- Important blocks receive authored nearest-filtered texture identities.
- Full-tile glowing circuit grids and generic luminous crosses are removed.
- Spikes use real three-dimensional geometry and collision, never a full cube or crossed sprite.
- Vault chests use the existing chest system, framed by authored vault furniture rather than replaced with a glowing custom loot box.
- Item icons remain legible at hotbar scale.
- No final enemy or boss uses a flat-color box or untextured primitive as its body.

## 8. Room pool

The implementation may refine names, but it must preserve the gameplay roles and quality boundaries below.

### 8.1 Fixed rooms

#### Processional Gallery

- Establishes scale and material language.
- Contains no combat activation from neighboring rooms.
- Uses large sightlines, a readable return path, and a view toward the hub.

#### Tuning Hall

- Contains the guaranteed Echo Tuning Fork chest.
- Places a receptive mechanism in direct view of the chest.
- Demonstrates pulse, preview, and delayed answer without prose.
- Provides a physical replay control.

#### Central Hub

- Acts as the strongest visual landmark.
- Uses doorway silhouette, floor pattern, and physical state markers rather than color alone.
- Shows which routes are complete and where the inner seal will open.

#### Inner Works

- Changes scale and material rhythm before the boss.
- Combines prior navigation and combat knowledge without introducing a new puzzle vocabulary.

#### Bell Titan Antechamber

- Provides a safe preparation space and chest.
- Prevents ordinary enemies from leaking into the boss arena.
- Gives a clear view of the Titan silhouette and arena lighting before activation.

### 8.2 Seeded major chambers

#### Memory Choir

- Demonstrates and tests a four-position echo sequence.
- Pylon response originates at the visible pylon top or glyph face, not inside a block.
- Each step has an ordered physical light response, particle movement, and typed positional sound event.
- Demonstration cadence is slow enough to perceive and is replayable immediately.
- Persistent low-intensity position or index marks remain during the input window.

#### Counterweight Gallery

- Uses visible weights, chains, platforms, and stair segments.
- Cause and effect remain in the same sightline where possible.
- A safe first interaction teaches the movement before the room demands timing.

#### Acoustic Relay

- Routes the Tuning Fork pulse through a visible sequence of receivers.
- The next valid receiver is implied by physical alignment, echo direction, and machinery movement.
- Failure resets clearly without a chat explanation.

#### Broken Crossing

- Replaces the bypassable parkour room.
- Uses real gaps, side walls, collapsed perimeter space, or hazard volumes so the required route cannot be walked around.
- Completion requires ordered checkpoint progression, not only touching the final plate.
- Stable landings are permanent recovery checkpoints.

#### Resonance Foundry

- Mixed melee and ranged combat across machinery, cover, and height variation.
- Ranged enemies must reposition for line of sight.
- Reinforcements enter from visible authored doors.

#### Guard Hall

- Formation-focused melee encounter with cover and readable approaches.
- Contains a clear entrance threshold and no spawn point on the incoming stair.

#### Bell Crypt

- Optional elite combat chamber with a Tollkeeper.
- Offers a high-value conventional weapon or armor reward.
- Its difficulty and reward are visually legible before commitment.

#### Fractured Archive

- Optional observation and treasure room.
- Uses layout, displayed objects, and physical mechanisms instead of descriptive lore panels.
- Rewards supplies, building materials, ammunition, or a weapon variant.

Additional authored modules may be added if they meet the same readability, traversal, and uniqueness standard. More rooms are not a substitute for finished rooms.

## 9. Echo rule and puzzle feedback

### 9.1 One artifact, one rule

The Echo Tuning Fork is the only unusual player tool in the new progression. Using it emits a short directional pulse that wakes clearly marked receptive machinery or asks an active echo puzzle to replay its demonstration.

It does not become a second combat moveset, a generic scanning system, a projectile reflector, a knockback cone, or a required boss-damage tool.

### 9.2 Pulse, preview, answer

Every echo interaction uses the same sequence:

1. **Pulse:** immediate physical response at the targeted receiver.
2. **Preview:** movement, dust, shape, or ordered markers indicate what will answer.
3. **Answer:** the mechanism performs the delayed action.

Position, shape, and motion carry the message. Color and sound support it but are never the only channels.

### 9.3 Memory demonstration requirements

- Markers render above or on the visible mechanism surface.
- No marker is buried inside a pylon or floor block.
- Step spacing is approximately 0.55 to 0.75 seconds and remains configurable from one source.
- The sequence plays twice on the room's first activation, with a short pause between passes. Later manual replays play once.
- A replay control is available without leaving the room or failing intentionally.
- Preview particles originate at the active symbol and travel in the sequence direction.
- Correct input confirms locally.
- Incorrect input produces a short physical reset and replays without prose.
- The HUD uses `LISTEN n/4` and `REPEAT n/4` only while relevant.

### 9.4 Traversal requirements

- A completion token records ordered checkpoints.
- The final plate rejects a bypassed route without pretending the room is complete.
- Perimeter geometry prevents walking around phase blocks or jumps.
- A failed jump returns or routes the player to the most recent stable checkpoint without an unavoidable death loop.
- Return travel becomes safe after completion.

## 10. Weapons, chests, and loot

### 10.1 Player-facing item reset

New vault progression does not award or require the Resonator, Pulse Bracer, Resonant Lens, Custodian Sigil, Echo Dust gadget loop, or Fractured Core gadget loop.

Those retired prototype IDs are unregistered. They do not appear in vault loot tables, recipes, guidance, inventory catalogs, textures, or progression, and no conversion maps them to current items.

### 10.2 Conventional weapon set

#### Vaultsteel Spear

- Conventional melee weapon with longer reach than a sword.
- Moderate damage and recovery.
- Uses a readable thrust animation and narrow hit volume.
- Useful against Bell Hounds and guarded approaches without becoming a magical pulse tool.

#### Vault Crossbow

- Physical ranged weapon with visible bolts.
- Deliberate reload and finite ammunition.
- Projectiles collide with world geometry and creatures.
- Useful against Marksmen, elevated targets, and the Titan's exposed bell.

#### Bellbreaker Maul

- Slow conventional heavy weapon.
- High stagger and armor pressure.
- Long commitment and recovery prevent it from replacing every other weapon.
- Particularly effective against Tollkeepers and Titan armor, but never mandatory.

#### Titan Hammer reward

- Guaranteed first-clear weapon in the opened core cache after Bell Titan defeat.
- Repeat vaults use the normal deterministic high-tier weapon table instead of guaranteeing duplicate Titan Hammers.
- Remains a physical heavy weapon rather than a second artifact system.
- Its improvement is expressed through damage, reach, durability, or stagger, not a neon spell effect.

### 10.3 Diegetic acquisition

- The Tuning Fork is guaranteed in the Tuning Hall before any mandatory use.
- At least one vault weapon is guaranteed before the first combat room.
- The crossbow is introduced with bolts and a safe visible target or mechanism before ranged combat pressure.
- The maul appears before or within armor-heavy content.
- Existing chest and inventory interfaces are reused.
- Chests open with physical animation and event hooks for authored sound and particles.
- Item tooltips use one short concrete sentence at most.

### 10.4 Loot reliability

- Critical progression items are never left to a random loot roll.
- Optional chests use deterministic per-cache loot seeds.
- Repeat vaults reward ammunition, armor, conventional weapon variants, building materials, and supplies.
- Loot cannot duplicate a one-time progression flag into an unusable clutter item.
- The Tuning Hall reliquary remains accessible after opening, and every mandatory echo mechanism also has a nearby physical striker or replay control. Losing or leaving the Tuning Fork therefore cannot permanently soft-lock a vault.

### 10.5 New content ID revision

The previous reservation of `178-189` is revised as follows:

| ID | Symbol | Classification |
| --- | --- | --- |
| 178 | `ECHO_STONE_SLAB` | World block |
| 179 | `ECHO_STONE_STAIRS` | World block |
| 180 | `ECHO_BRICK_SLAB` | World block |
| 181 | `ECHO_BRICK_STAIRS` | World block |
| 182 | `VAULTSTEEL_SPEAR` | Inventory item |
| 183 | `VAULT_CROSSBOW` | Inventory item |
| 184 | `VAULT_BOLT` | Inventory item |
| 185 | `BELLBREAKER_MAUL` | Inventory item |
| 186 | `ECHO_TUNING_FORK` | Inventory item |
| 187 | `TITAN_HAMMER` | Inventory item |
| 188-189 | Reserved | Unused |

`BLOCKS` remains authoritative, current `BlockType` constants remain byte-sized, world writes reject inventory-only IDs, and chunk storage remains `Uint8Array` based.

## 11. Combat rooms and enemy roster

### 11.1 Encounter ownership

Every encounter owns:

- A room activation threshold.
- Authored spawn entries.
- An allowed navigation region or connected room set.
- Reinforcement doors.
- Completion and cleanup state.
- A maximum simultaneous enemy count.

At most six ordinary vault enemies are active in one encounter and at most twelve ordinary vault enemies remain live across the loaded vault. Inactive rooms do not keep distant combat AI ticking. The Bell Titan arena does not retain ordinary encounter enemies.

Enemies do not activate because the player is merely within a large radius through a wall. Ordinary vault enemies require shared encounter ownership or a valid authored corridor and line of sight.

### 11.2 Vault Guard

- Armored humanoid with spear or sword.
- Advances deliberately, guards, and commits to readable melee arcs.
- Uses stairs and ordinary one-block steps.
- Does not skate sideways while attacking.

### 11.3 Vault Marksman

- Carries a physical crossbow.
- Maintains range, checks line of sight, and searches for reachable firing positions.
- Braces before firing and visibly reloads.
- Relocates when its projectile lane is blocked.

### 11.4 Bell Hound

- Low, fast bronze-and-stone quadruped.
- Flanks rather than stacking directly behind another enemy.
- Can jump small gaps and safe one-block obstacles.
- Uses distinct acceleration, turn rate, leap, fall, and landing behavior.

### 11.5 Tollkeeper

- Large slow elite with a heavy hammer.
- Requires wider navigation clearance.
- Prefers ramps and broad stairs instead of jumping gaps.
- Uses long readable wind-ups and high stagger pressure.
- Appears sparingly and never spawns in the entrance stair.

### 11.6 Models and animations

Each vault enemy receives a textured articulated model and explicit states for:

- Idle.
- Alert and target acquisition.
- Turn in place.
- Walk or run.
- Strafe where appropriate.
- Jump, fall, land, and recovery where appropriate.
- Attack wind-up, contact, follow-through, and recovery.
- Ranged aim, fire, and reload where appropriate.
- Guard or block where appropriate.
- Hurt, stagger, and death.

Animation playback is driven by authoritative movement and combat state. Locomotion speed matches actual ground speed closely enough to avoid foot sliding.

## 12. General ground-mob navigation

### 12.1 Current issue

The existing generic AI primarily aims horizontal velocity directly at the player, then stops at collisions or unsafe ledges. It does not plan around obstacles and can repeatedly push into walls, railings, height changes, or ledges.

### 12.2 Voxel navigation service

A focused navigation service provides bounded three-dimensional ground paths without refactoring world streaming.

Navigation nodes represent valid feet positions and are evaluated using:

- Actual collision clearance for the entity's width and height.
- Standable support geometry.
- Slab and stair shape metadata.
- Maximum step-up height.
- Maximum safe drop height.
- Jump distance and rise where supported by the movement profile.
- Hazard costs or rejection.
- Body-width clearance.
- Loaded-chunk availability.

### 12.3 Movement profiles

Entity kinds specify movement capabilities rather than sharing one `canStep` flag:

- Ground speed and acceleration.
- Turn speed.
- Step height.
- Safe drop height.
- Jump height and horizontal gap.
- Preferred combat distance.
- Required corridor width.
- Hazard tolerance.
- Whether the entity may strafe, flank, or seek line of sight.

### 12.4 Planning and performance

- Searches use a bounded radius and bounded node budget.
- Planning work is distributed through a per-frame budget.
- Paths are cached and shared only when body profile, target region, and relevant terrain match.
- Replanning occurs when the target moves materially, the next segment becomes invalid, terrain changes, or progress stalls.
- A stuck detector measures real displacement rather than animation state.
- Recovery chooses another reachable local waypoint or replans; it never teleports the mob.
- Unloaded chunks are unavailable navigation space.

### 12.5 Integration boundary

Pathfinding chooses waypoints. Existing collision, gravity, knockback, damage, and entity ownership remain authoritative for actual movement.

Flying, swimming, passive vehicle, and specialized boss movement stay on their own profiles unless deliberately migrated later.

The system must improve ordinary ground mobs outside the vault without changing unrelated boss mechanics or player controls.

## 13. The Bell Titan

### 13.1 Replacement boundary

The Vault Mason is removed from new encounters and player-facing copy. No arena wall construction, arena remeshing puzzle, Mason tool interruption, or Magnetic Warden-derived shield, polarity, parry, or projectile loop remains in the new boss.

The Mason temporary-cell repair path is removed. The Bell Titan arena is authored once by the current structure generator and does not remesh or patch an obsolete encounter volume.

### 13.2 Identity and silhouette

The Bell Titan is a towering bronze-and-stone guardian built around a large cracked hanging bell.

Its model includes:

- A broad but unmistakably non-Warden silhouette.
- A suspended bell torso or chest cavity.
- Two asymmetrical hammer-capable arms.
- Layered breakable stone armor.
- Visible chains and aged metal joints.
- A readable head and facing direction.
- A bell core visible from normal combat distance.
- Authored diffuse textures with weathering, chips, joints, and recesses.

The Titan is never rendered as a generic entity box with decorative primitives attached.

### 13.3 Arena readability

- The dormant arena is lit well enough to preview its floor and major cover.
- Awakening raises the full combat light state before the first damaging move.
- The Titan remains readable at the darkest supported graphics settings.
- Telegraphs use floor movement, dust, debris, body pose, and restrained light.
- Shockwaves are visible physical ground disturbances, not thin neon rings.
- No attack is communicated through sound alone.

### 13.4 Core combat rule

The fight repeats one understandable rule:

1. Read and avoid a clearly telegraphed physical attack.
2. A committed heavy slam leaves the bell exposed.
3. Damage the bell during the clear vulnerability window.
4. Armor breaks and established attacks become more demanding across phases.

Body damage remains possible at reduced effectiveness so the fight cannot hard-lock if a window is missed. Melee, crossbow, and existing weapons all remain valid.

### 13.5 Attack set

#### Hammer sweep

- Wide readable body turn and shoulder wind-up.
- Fixed arc and grounded hit volume.
- Clear recovery that does not instantly chain into an unrelated move.

#### Bell slam

- Heavy overhead preparation.
- Impact creates debris and a visible ground shockwave.
- The bell opens or hangs exposed during recovery.

#### Advancing strike

- A short committed advance, not a homing charge.
- Used to stop passive long-range play without crossing the whole arena instantly.

#### Double toll

- Later-phase variation using two established shockwave timings.
- Both timings are previewed through body and floor motion.
- It does not introduce a new artifact or polarity rule.

### 13.6 Phases

#### Phase one: Armored March

- Slow deliberate sweeps and slams.
- Long exposure window.
- Establishes every core rule.

#### Phase two: Cracked Bell

- Outer armor visibly breaks and remains absent.
- Shockwave timing expands using already learned cues.
- Recovery windows shorten modestly but stay readable.

#### Phase three: Last Toll

- Most armor is gone and the bell is visually dominant.
- Attacks chain in limited authored combinations.
- No brand-new puzzle appears.
- The final death has a complete collapse and settled pose before cleanup.

### 13.7 Animation set

- Dormant pose.
- Awakening.
- Idle weight shift.
- Walk and turn.
- Sweep wind-up, contact, follow-through, and recovery.
- Slam wind-up, impact, exposed-bell recovery, and close.
- Advancing strike.
- Double toll.
- Hurt and heavy stagger.
- Armor break for each phase.
- Bell vulnerability.
- Death collapse and final settled pose.

### 13.8 Boss audio event set

Typed events are required for:

- Awakening.
- Stone footfalls with variation.
- Chain movement and strain.
- Hammer movement.
- Sweep impact.
- Slam impact and debris.
- Bell resonance at multiple intensities.
- Armor fracture.
- Damage and stagger.
- Phase changes.
- Death and final tail.

No event reuses a Magnetic Warden sound ID. Until authored files are produced, missing Bell Titan cues fail silent rather than synthesizing a placeholder.

## 14. Lighting and sealed-vault edits

### 14.1 Authored lighting

- No main-route walk cell is more than eight horizontal blocks from an appropriate fixture unless another validated light source covers it.
- Every room objective is readable from its normal approach.
- Every staircase landing is lit.
- Combat enemies are visible against their backgrounds.
- The Bell Titan arena reaches its full light state before damage begins.
- Both escape routes remain readable throughout the timer.
- Cross-chunk light updates use the existing lighting and remesh paths.

### 14.2 Torch policy

Before escape completion:

- Breaking authored structure is denied.
- Placing ordinary blocks is denied.
- Placing a torch into a valid empty cell is allowed.
- A torch cannot replace a structure block, gate, mechanism, hazard, or occupied cell.
- Inventory, collision, lighting, remeshing, and persistence behave normally.

After escape completion, the existing full-edit permission applies.

## 15. Escape choice and surface completion

### 15.1 Trigger and timer

Defeating the Bell Titan opens the core. Claiming the core:

- Saves boss and core progression first.
- Opens both route gates.
- Starts the escape context and timer.
- Changes the objective to `ESCAPE | Reach the surface mm:ss`.

The initial target timer is seven minutes and must be tuned from full-route traversal results. Both routes must be feasible without speedrunning, while the shorter route provides meaningful time savings.

If the timer reaches zero, escape does not permanently seal or corrupt the vault. Hazards remain at maximum intensity and the objective changes from a countdown to an urgent `REACH THE SURFACE` state, but the player can still escape. The core cannot be lost permanently because of an escape death.

### 15.2 Grand Ascent

- Long, wide ceremonial staircase.
- Several large landings and side galleries.
- Combat-heavy pressure using surviving or newly released enemies.
- Falling masonry, closing shutters, or visible gate timing create urgency.
- No mandatory precision jump.
- Consistent lighting and one supply cache.
- Surface outlet is a monumental ruined stair structure.

This route favors combat confidence and safer movement at the cost of time.

### 15.3 Fracture Stair

- Short, steep maintenance route through a broken vertical shaft.
- Switchback stairs, narrow bridges, gaps, and collapsing landings.
- Moving crushers and spike mechanisms occupy required route space.
- Hazards cannot be bypassed along a safe room perimeter.
- Stable intermediate landings provide fair recovery points.
- Little or no forced combat.
- Surface outlet is a narrow fractured tower or service ruin.

This route favors precise movement and risk tolerance in exchange for a faster exit.

### 15.4 Spike requirements

- Real three-dimensional teeth or spike-cluster geometry.
- Correct occupied volume and collision.
- Clear retracted, warning, active, and recovery states.
- Damage only during the active state.
- Placement across the intended path, not beside it.
- Visible mechanical source and timing.
- Typed positional audio and debris/spark events.

### 15.5 Surface completion predicate

Escape completes only when:

- Escape has started.
- The player enters the selected outlet's surface threshold.
- The player's feet are at or above the sampled outlet surface floor.
- The threshold is connected to open air or sky through the generated outlet.
- Generated-voxel validation confirms a route from the core to that threshold.

Entering an underground escape room or tunnel never completes progression.

## 16. UI, copy, and environmental teaching

### 16.1 HUD

The objective HUD remains compact and Atlas-native.

Allowed information:

- One short objective line.
- Compact puzzle state such as `LISTEN 2/4` or `REPEAT 1/4`.
- Encounter progress when it materially reduces confusion.
- Escape time while the player has not reached the surface.

Visual rules:

- Existing pixel font and text shadow.
- Neutral dark translucent backing.
- White text with restrained muted progress color.
- Square or lightly rounded existing geometry.
- No neon border, glow, scanline, gradient, animated hologram, or descriptive panel.

### 16.2 Copy rules

- Use direct verbs and concrete nouns.
- Never expose internal terms such as controller, state, variant, or phase-group.
- Do not explain room lore during play.
- Item tooltips describe a concrete action in one short sentence.
- Chat is reserved for genuine errors or normal command results.
- `/locate vault` remains available.
- Debug-only vault commands stay out of normal player guidance and autocomplete.

### 16.3 Environmental teaching

Critical items appear beside a safe example of their use. Shared glyphs, material insets, mechanical alignment, sightlines, and immediate physical response link item and target without an instructional popup.

Important sounds always have visible equivalents. Important colors always have shape, position, or motion equivalents.

## 17. Music and sound runtime

### 17.1 Context priority

Music context uses an explicit priority order:

1. Death or menu override.
2. Bell Titan.
3. Vault escape.
4. Vault combat.
5. Vault exploration.
6. Overworld biome, cave, creative, blood moon, or other normal context.

Bell Titan awakening immediately requests the boss context. It does not depend on generic distance aggro or an ordinary combat event that may already be active.

Boss defeat, player death, leaving the vault, and surface escape clear the appropriate state immediately and select the correct next context.

### 17.2 Mid-song interruption

- The incoming context can begin before the outgoing track naturally ends.
- The current track is faded or interrupted according to the transition policy.
- Leaving the vault selects current overworld biome or cave music rather than leaving a stale vault flag.
- Rapid state changes cannot pause the deck that has just become active.
- Boss defeat preserves the final impact and reverb tail while music transitions.

### 17.3 Audible gapless looping

Every vault music track used as a continuous loop must provide validated loop metadata or a validated seamless full-file loop.

Requirements:

- Loop points align to decoded sample frames.
- The loop boundary has no audible click, silence gap, duplicated transient, tempo stumble, or reverb discontinuity.
- Intro sections do not replay unless authored to do so.
- Loop bodies can repeat indefinitely while preserving musical time.
- Playback-rate changes do not corrupt the boundary.
- Automated seam analysis supplements an in-game listening review.

If the current `HTMLAudioElement` deck cannot meet the audible gapless requirement for a specific asset and browser target, continuous vault loops move to the existing Web Audio graph or another tested buffer-backed path without rewriting unrelated sound categories.

### 17.4 One-shot lifetime

- Room, phase, boss, and music-context changes do not stop active one-shots.
- Duplicate suppression blocks new spam without terminating an existing source.
- Encoded tails remain long enough for natural decay.
- Entity removal waits for required death-animation and event-tail ownership without keeping damaging collision active.

### 17.5 FL Studio hold

Do not open FL Studio, edit the FL projects, remaster the music, render replacement music, or perform the final sound-design pass until the user explicitly authorizes it.

When authorized, the final audio phase must:

- Preserve the recognizable existing musical themes unless the user changes direction.
- Improve arrangement, performance, mix, space, and sound quality rather than replacing the score casually.
- Produce perfectly looping bodies and transition-safe intros/tails.
- Use recorded, performed, or properly licensed source material.
- Document project, plugin, version, source, and redistribution provenance.
- Avoid oscillator/noise placeholder character.
- Meet decode, loudness, true-peak, tail, and listening-review gates.

## 18. State and persistence

- Resonant Vault persistence uses one current schema.
- Current block and item IDs retain their numeric meaning; retired prototype holes remain unregistered.
- Unknown prototype Vault fields are ignored and never converted into current progress.
- `titanDefeated` is the only Bell Titan completion field.
- `rooms` is the only room-completion map.
- Escape routes accept only `grand` and `fracture`.
- Stable progression saves after each completed mandatory chamber, Bell Titan defeat, core claim, and surface escape completion.
- Transient pathfinding, attack, animation, particle, and music state is not serialized.
- Persisted experimental vault chunks are not destructively rewritten.
- The complete visual, topology, room-pool, and escape rebuild is guaranteed for newly generated vault footprints.
- Runtime fixes apply to existing vaults where their required geometry and anchors exist.

## 19. Code boundaries

### Generation

- `resonantVaults.ts` remains the deterministic layout and descriptor source.
- `resonantVaultGeneration.ts` remains the chunk-local writer.
- New room-module, socket, and validation helpers remain focused and pure where practical.
- General terrain generation remains outside vault modules.

### Runtime

- `ResonantVaultRuntime` owns active layout, stable puzzle progression, thresholds, gates, core claim, escape timer, torch edit policy, and surface completion.
- Pure objective and puzzle selectors remain directly testable.
- Player interaction uses normal selected-item state, never rendered DOM scraping.

### Entities

- A focused navigation service reads world collision and support data through narrow queries.
- Generic entity movement consumes waypoints but retains collision, gravity, damage, and knockback ownership.
- Vault encounter directors own room activation, compositions, attacks, and cleanup.
- Bell Titan combat state remains in a dedicated module rather than adding boss-specific fields to every entity.

### Rendering

- Dedicated renderers own articulated vault enemies and the Bell Titan.
- Animation state is explicit runtime data.
- Spike and shockwave geometry is real three-dimensional world geometry.

### UI

- The existing objective component is extended instead of creating a new quest framework.
- `App.tsx` receives only the smallest lifecycle/render changes needed.

### Audio

- Typed gameplay events map to authored sound IDs through the vault audio director.
- `MusicController` owns context selection.
- `SoundManager` owns playback, loop, crossfade, and source lifetime details.

## 20. Testing strategy

### 20.1 Generated structure tests

- Generate hundreds of representative seeds across orientations and terrain heights.
- Verify deterministic room selection and loot.
- Verify no overlapping room reservations or corridor cuts through unrelated rooms.
- Flood-fill actual generated voxels from surface entrance to every mandatory room.
- Verify every doorway has player-sized width and headroom after furnishing.
- Verify the entrance stair works in both directions.
- Verify both escape routes reach their actual sampled surface outlets.
- Verify no mandatory room can be bypassed through its intended protected perimeter.
- Verify every selected layout contains the required combat and non-combat counts.

### 20.2 Visual and lighting tests

- Verify shaped blocks resolve through texture, geometry, placement, selection, drop, and collision paths.
- Verify lamps satisfy route spacing and objective visibility.
- Verify the Bell Titan arena reaches full combat illumination before the first attack.
- Verify enemy and boss textures load without fallback materials.
- Capture and review entrance, hub, representative room modules, combat rooms, boss phases, and both exits at gameplay resolution.

### 20.3 Puzzle tests

- Preview events target visible marker positions.
- Preview step order and cadence are deterministic.
- Replay works during listen and input states without corrupting progress.
- Correct and incorrect input feedback remains synchronized.
- Traversal completion requires every ordered checkpoint.
- Reset returns the player to a safe checkpoint and cannot soft-lock the room.

### 20.4 Navigation tests

- Paths route around solid walls and railings.
- Profiles traverse permitted stairs, slabs, steps, gaps, and drops.
- Entities reject lethal drops, hazards, narrow passages, and unloaded chunks.
- Marksmen find line-of-sight positions and relocate when blocked.
- Heavy entities choose width-valid routes.
- Stuck detection triggers a bounded replan without teleporting.
- Per-frame planning budgets hold under the maximum encounter count.
- Existing ordinary ground mobs gain navigation without player-control or boss regressions.

### 20.5 Combat and animation tests

- Encounter activation requires the correct room threshold.
- Adjacent-room proximity alone does not aggro or spawn vault enemies.
- Reinforcements use authored entries.
- Attack hit volumes align with animation contact frames.
- Locomotion animation follows real speed and state.
- Death removes damage and collision at the correct time while preserving visual and audio tails.

### 20.6 Bell Titan tests

- No Bell Titan definition uses Mason wall reconstruction or Magnetic Warden polarity, shield-crystal, parry, or magnetic-field mechanics.
- Boss music state begins from the awakening event.
- The arena lights before the first damaging state.
- Each attack has a minimum telegraph and recovery window.
- Bell exposure increases incoming damage for the configured window.
- Body damage remains possible.
- Armor breaks persist visually through phase changes.
- Defeat saves before escape begins.
- Death animation settles before renderer cleanup.

### 20.7 Escape tests

- Both gates open after core claim.
- Timer remains active underground and through the complete stair ascent.
- Underground route rooms do not complete escape.
- Each surface predicate requires the correct outlet height and open-air threshold.
- Grand Ascent and Fracture Stair have different topology and hazard compositions.
- Spikes occupy the intended path and damage only while active.
- Timer expiration cannot permanently seal the vault or lose the core.

### 20.8 UI and copy tests

- Objective selection covers discovery, equipment, puzzles, combat, inner route, Bell Titan, core, and escape.
- The HUD remains compact and hides outside relevant contexts.
- No room-instruction paragraphs are emitted to chat.
- No Resonant UI class uses neon, glow, gradient, scanline, or holographic styling.
- Item use reads selected inventory state through normal React/runtime data.

### 20.9 Audio runtime tests

- Bell Titan state has priority over ordinary vault combat.
- Leaving, dying, winning, and reaching the surface clear stale vault states.
- Incoming music starts before the retired deck is reset during a crossfade.
- Loop metadata is valid against decoded duration and sample rate.
- Loop seams pass discontinuity and silence-gap checks.
- Active one-shots survive context changes through their tails.
- Missing vault assets fail silent without synthesis.

### 20.10 Compatibility and repository gates

- Existing numeric ID snapshots remain unchanged.
- New IDs classify correctly as world blocks or inventory-only items.
- Old saves without new room fields load.
- Legacy Mason temporary state repairs safely.
- Relevant Node tests pass.
- Full test inventory passes.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run build` passes.
- Browser runtime starts without renderer, worldgen, entity, or audio errors.
- Electron runtime starts without renderer or audio errors.
- Fresh-world discovery, full clear, boss, both escapes, save/load, death, and resume scenarios pass.

## 21. Production acceptance checklist

The definitive overhaul is not complete unless all applicable items below pass:

- Newly generated vaults provide a coherent 45 to 70 minute expedition.
- The full structure has been visually rebuilt and no major room reads as an MVP box.
- Every mandatory room connection is open and traversable in generated voxels.
- The entrance is a finished two-way staircase from the surface.
- At least three combat encounters and at least two non-combat challenges occur per selected layout.
- Echo demonstration position, timing, sound-event, and particle feedback are understandable.
- The traversal challenge cannot be bypassed around its perimeter.
- Chests provide guaranteed critical equipment before mandatory use.
- New progression centers on conventional weapons and only one unusual artifact.
- Vault enemies have dedicated textured models, movement profiles, and complete animation states.
- General ground mobs route around obstacles, negotiate supported voxel geometry, and recover from stuck states.
- Enemies do not activate through walls or spawn on the entrance staircase.
- The Bell Titan has a new silhouette, authored texture, full animation set, unique mechanics, and no Mason or Warden gameplay identity.
- The Bell Titan and arena are clearly visible throughout combat.
- Boss music starts reliably from awakening.
- Every vault music loop is audibly seamless.
- Vault music can be interrupted mid-song and normal world music resumes correctly.
- One-shot tails do not cut off abruptly.
- The Grand Ascent and Fracture Stair are visibly, spatially, and mechanically different choices.
- Escape hazards occupy the required route and cannot be ignored.
- Both exits physically reach the actual surface.
- Escape completion occurs only at open air on the surface.
- The structure is adequately lit and still permits safe torch placement while sealed.
- UI remains compact, plain, Atlas-native, and free of neon presentation.
- Existing saves and IDs remain readable.
- Existing keyboard, mouse, controller or touch abstractions, inventory flow, and mobile-facing interaction paths are not intentionally broken.
- Automated, browser, Electron, visual, save/load, and traversal validation pass.

Final performed music and sound acceptance remains pending while FL Studio use is on hold. The branch must not claim final audio production completion until the user authorizes that work and the resulting assets pass the documented audio gates.
