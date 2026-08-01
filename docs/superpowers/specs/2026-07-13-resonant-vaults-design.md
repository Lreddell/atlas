# Resonant Vaults Design

## Status

Approved concept for an ambitious private Atlas Lab experiment.

Branch: `codex/daily-2026-07-13-resonant-vaults`

This document is the implementation contract. It defines the complete player experience, content IDs, registry boundaries, deterministic generation model, puzzle systems, enemies, miniboss, escape sequence, reward loop, persistence, presentation, performance limits, compatibility constraints, testing strategy, and acceptance criteria.

## Executive Summary

Resonant Vaults adds a repeatable authored-adventure layer to Atlas without replacing its sandbox identity.

A player first notices a rare surface landmark called a Listening Spire. The spire produces directional audiovisual pulses that imply a buried structure rather than placing a map marker on the screen. Nearby underground Echo Crystal veins provide the material needed to craft a Resonator. The Resonator reveals hidden paths and operates resonance machinery through the normal use interaction.

Below the spire is a deterministic multi-room vault containing three challenge wings:

1. A memory chamber based on short audiovisual glyph sequences.
2. A traversal chamber built around rhythmically phasing blocks.
3. A combat chamber where environmental pylons and plates interact with Echo Sentinels.

Completing all three wings opens an inner seal and begins a miniboss fight against the Vault Custodian. Claiming the vault's Echo Core then destabilizes the structure and starts a bounded escape sequence that changes available routes, activates hazards, and releases surviving enemies.

The first completed vault awards a Pulse Bracer, a reusable tool that remains valuable outside the structure. It produces a short-range pulse that knocks enemies back, interrupts compatible attacks, deflects compatible projectiles, activates resonance machinery, and briefly reveals nearby Echo Crystal. Later vaults reward Echo Cores, rare materials, building blocks, and deterministic room variants rather than duplicate unique gear.

The feature is designed as a complete experience arc:

- Curiosity through a physical landmark.
- Discovery through environmental clues.
- Preparation through material gathering and crafting.
- Learning through safe demonstrations.
- Mastery through combined puzzles and combat.
- Climax through a bespoke miniboss.
- Urgency through an escape sequence.
- Lasting payoff through a world-useful reward.
- Replay value through deterministic vault variants and secondary loot.

No external quest panel, map marker, floating badge, or visually disconnected interface is added. Communication uses Atlas's block textures, world-space geometry, lighting, particles, sounds, existing message styling, inventory layout, selected-slot overlays, and established damage/camera systems.

---

## Product Goal

Create the first Atlas feature that feels like a complete authored expedition rather than a single mechanic, content family, or isolated encounter.

The player should finish a vault with a memorable story they can describe in sequence:

> I found a strange tower, followed its pulse underground, crafted a device from crystals, learned how the ruins worked, solved three different wings, fought the machine guarding the core, and escaped with a tool that changed how I explore and fight afterward.

The feature succeeds only if its systems reinforce one another. It is not enough to add a ruin, a puzzle, a miniboss, or an item independently.

## Player-Facing Success Criteria

A successful implementation should produce these player outcomes:

- The surface clue is visually distinctive enough to invite investigation without a HUD marker.
- A new player can infer that the spire is pointing toward something underground.
- Echo Crystal gathering provides a clear preparation step without requiring excessive grinding.
- The Resonator has immediate feedback and a clear relationship to vault machinery.
- Each chamber teaches its rule before testing it.
- Puzzle failure is readable, recoverable, and localized.
- Combat incorporates environment use rather than only increasing enemy health.
- The Custodian has recognizable phases and counterplay.
- The Echo Core claim changes the vault state and creates urgency.
- The escape remains short enough to feel exciting instead of exhausting.
- The Pulse Bracer remains useful in ordinary exploration and combat.
- Repeated vaults provide meaningful rewards and room variation without duplicating the unique first-clear reward.
- The feature feels visually and mechanically native to Atlas.

## Non-Goals

This experiment does not attempt to:

- Replace Atlas's main progression system.
- Introduce a global quest log.
- Build a procedural dungeon framework for every future biome.
- Add multiplayer synchronization.
- Make Atlas compatible with Minecraft saves.
- Complete the full repository-wide block/item ID migration.
- Add a permanent minimap or compass UI.
- Add cinematic dialogue or voiced characters.
- Add a separate skill tree.
- Add a new dimension.
- Require keyboard-only controls.
- Redesign the inventory, crafting table, hotbar, or HUD.
- Add an unbounded physics simulation.

---

# 1. Player Experience

## 1.1 Discovery: Listening Spires

Listening Spires are rare deterministic surface structures aligned with buried Resonant Vaults.

A spire consists of:

- A broad Echo Stone foundation integrated into local terrain.
- Four asymmetrical buttresses so it reads as authored architecture rather than a generated pillar.
- A central Resonance Pylon.
- Four Chiseled Echo Stone glyph faces.
- One Listening Stone at eye level.
- A broken ring of Resonant Lamps and cracked masonry.
- A shallow debris field that points toward a nearby cave mouth when terrain permits.

The structure must remain readable at medium view distance. Its silhouette should include a central fork or tuning-prong shape rather than a generic tower.

### Passive pulse

Every 7–11 seconds, determined by vault identity, the Listening Stone emits:

- A low tone.
- A brief emissive pulse through nearby conduits.
- A short particle trail biased toward the vault entrance vector.
- A subtle camera response only when the player is very close.

The pulse is directional but not precise. It narrows the search area without becoming a waypoint.

### Direct interaction

Using the Listening Stone before obtaining a Resonator produces:

- A muffled two-tone response.
- A brief glyph flash.
- The existing message feed text: `The stone answers from somewhere below.`

Using it while holding a Resonator produces:

- A stronger tone.
- A longer directional particle line.
- Temporary activation of the spire's conduit path.
- The message: `The Resonator catches a buried reply.`

No persistent marker is created.

## 1.2 Preparation: Echo Crystal

Echo Crystal appears in deterministic veins near a vault's underground influence area and at a lower background rarity in deep caves.

The vault-adjacent distribution exists so the player is likely to discover the material while searching below the spire. The background distribution prevents the recipe from becoming impossible if terrain or exploration order is unusual.

Echo Crystal blocks:

- Emit a low light level.
- Use a distinct animated or frame-varied texture if Atlas's texture system supports it without per-frame texture mutation.
- Produce a resonant mining sound layered over the existing glass/amethyst family.
- Drop 2–4 Echo Shards with an iron-tier or better pickaxe.
- Drop 1 Echo Shard with a stone-tier pickaxe.
- Drop nothing by hand or with the wrong tool.
- Generate a brief sympathetic shimmer in nearby crystal blocks when one is broken.

The first Resonator recipe should require materials the player can plausibly possess before a vault:

- 2 Copper Ingots.
- 1 Amethyst Cluster or Amethyst Block, depending on existing recipe ergonomics.
- 2 Echo Shards.
- 1 Lapis Lazuli.

The recipe is intentionally cross-system: copper provides conductivity, amethyst provides resonance identity, lapis provides an established magical/mineral accent, and Echo Shards link the item to the vault.

## 1.3 The Resonator

The Resonator is a held inventory item using the normal use input.

Outside vaults, use produces a short scan pulse with a cooldown. It can reveal nearby Echo Crystal through world-space particles for approximately two seconds.

Inside a vault, use can:

- Activate a targeted Resonance Pylon.
- Toggle a compatible Pulse Conduit.
- Query a Listening Stone.
- Start or replay a memory demonstration.
- Interrupt a compatible Sentinel charge at close range.
- Reveal a hidden cracked wall or alternate escape route.

The Resonator does not deal normal damage. It is a key, scanner, and puzzle tool.

### Feedback

Use feedback includes:

- A central expanding ring rendered in world space.
- Directional particles toward affected machinery.
- A procedural two-tone audio cue.
- A small selected-slot cooldown overlay matching Atlas's existing durability/stack visual treatment.
- A short failure click if no valid target is in range.

No separate Resonator HUD is added.

## 1.4 Entering the Vault

The primary entrance should be reachable from natural caves or a short buried shaft. It must not require blind strip mining.

Entrance clues include:

- Echo Brick fragments embedded in cave walls.
- Increasing Echo Crystal density.
- Resonant Lamp fragments.
- A repeating low tone that grows stronger near the sealed entrance.
- One visible Pulse Conduit leading into the door frame.

The entrance door is a large Resonance Door composed from multiple blocks but controlled as one logical door. Using the Resonator on its pylon opens it through a staged block-state animation:

1. Glyphs illuminate.
2. Conduit light travels inward.
3. Door blocks phase or retract in a deterministic order.
4. Dust and sound communicate mass.

The door should never open instantly as a simple block replacement.

## 1.5 Hub

The central hub is the player's safe orientation space.

It includes:

- Three sealed wing doors.
- Three glyph pedestals corresponding to Memory, Traversal, and Combat.
- A central Vault Seal leading toward the Custodian.
- A return path to the entrance.
- One cache containing modest supplies.
- A visual model showing that three signals must converge before the inner seal opens.

Each completed wing lights one third of the hub's conduit network. The player can understand progress by looking at the architecture.

No checklist panel is required.

---

# 2. Challenge Wings

## 2.1 Memory Chamber

### Goal

Teach and test the relationship between glyph shape, pylon position, and tone sequence.

### Structure

The chamber contains:

- A safe demonstration threshold.
- Four Resonance Pylons positioned at distinct cardinal or diagonal locations.
- Four floor glyphs with high-shape contrast.
- A central Listening Stone.
- A closed reward gate.
- Side alcoves that prevent the layout from reading as a plain square room.

### Demonstration

Activating the central Listening Stone plays a sequence of three pylon activations.

Each activation includes:

- One pylon lighting.
- One glyph shape illuminating.
- One distinct tone.
- One conduit pulse from center to pylon.

The first vault uses a three-step sequence. Later vaults may use four steps, but never more than five.

The player repeats the sequence by using the Resonator on pylons.

### Failure

A wrong pylon:

- Stops the current input sequence.
- Produces a low dissonant chord.
- Sends a visible but avoidable shockwave along the floor.
- Deals low damage only if the player remains in the wave.
- Resets input after a short delay.
- Does not regenerate the sequence.

The correct sequence remains stable for the vault's identity and attempt.

### Accessibility

The sequence is never audio-only or color-only. Every pylon has:

- A unique glyph silhouette.
- A unique location.
- A tone.
- A light pulse pattern.

The system remains solvable with muted audio and with impaired color discrimination.

### Completion

Success:

- Locks the pylons into a harmonic chord.
- Opens the wing cache.
- Activates the Memory signal in the hub.
- Saves completion immediately.

## 2.2 Traversal Chamber

### Goal

Create a readable timing challenge based on Phase Blocks, without requiring precision platforming beyond Atlas's established movement.

### Phase Blocks

Phase Blocks alternate between:

- Solid/opaque.
- Warning/translucent.
- Intangible/faded.

The cycle is deterministic and tied to the vault clock, not wall-clock time. Pausing freezes it.

Phase state uses block metadata and renderer behavior rather than duplicate numeric IDs.

### Teaching section

The first corridor shows a single Phase Block bridge over a shallow, nonlethal recovery pit. A nearby Pulse Conduit visibly previews the cycle.

The player can observe:

- Conduit darkening.
- Block glyph flicker.
- Block fading.
- Block returning.

The first failure costs time, not health.

### Main routes

The wing contains two or three traversal modules selected deterministically:

- Alternating bridge lanes.
- Vertical phase steps.
- A rotating safe quadrant.
- A corridor where Resonance Plates temporarily hold selected blocks solid.
- A split path where the slower route is safer and the direct route requires timing.
- A chamber where the Resonator freezes a local phase group for a short duration.

No module should require more than one unfamiliar rule at once.

### Recovery

Falls lead to:

- A lower recovery passage.
- Low environmental damage at most.
- A short return route.

The player should not repeatedly die while still learning the mechanic.

### Completion

The final plate requires combining timing and Resonator use. Completion stabilizes the room, creates a permanent return bridge, activates the Traversal signal, and saves immediately.

## 2.3 Combat Chamber

### Goal

Teach the player to use vault machinery tactically against enemies.

### Arena language

The room includes:

- Cover pillars.
- Three Resonance Plates.
- Two interruptible pylons.
- Elevated Sentinel entry points.
- A central hazard zone.
- Visible conduits showing which plate controls which effect.

### Encounter waves

The chamber uses three short waves rather than one health-heavy group.

Wave 1:

- Two basic Echo Sentinels.
- Teaches projectile timing and pylon interruption.

Wave 2:

- One Sentinel variant plus environmental pulse hazards.
- Teaches plate activation.

Wave 3:

- Mixed group with one shielded Sentinel.
- Requires using the Resonator or an arena pylon to expose it.

### Environmental tools

Resonance Plates trigger one of these deterministic effects:

- A directional knockback pulse.
- A brief enemy slow field.
- A shield-disrupting harmonic wave.

Each plate has a cooldown communicated by conduit brightness and glyph recovery.

### Completion

Defeating the final wave:

- Deactivates hazards.
- Opens the cache.
- Activates the Combat signal.
- Saves immediately.

---

# 3. Vault Custodian

## 3.1 Role

The Vault Custodian is a miniboss, not a region-ending boss. It should be more complex than a normal enemy but shorter and more readable than the Magnetic Warden.

It protects the Echo Core and tests the three learned concepts:

- Read and remember telegraphs.
- Move through phase timing.
- Use environmental resonance tools during combat.

## 3.2 Visual Design

The Custodian should read as ancient machinery assembled from Echo Stone, a floating Sentinel Core, and segmented resonance rings.

Silhouette requirements:

- Large central core.
- Two asymmetric armatures.
- A rotating outer ring.
- Four visible glyph plates.
- Strong idle pulse.

It must not resemble the Magnetic Warden's polarity identity.

## 3.3 Arena

The arena includes:

- Four Resonance Pylons.
- Four Phase Block lanes.
- Cover structures.
- A central Echo Core dais.
- An outer recovery ring.
- Conduit paths that show upcoming attacks.

## 3.4 Phase One: Calibration

Attacks:

- Directed pulse cone.
- Slow arcing projectiles.
- Short armature sweep.

Counterplay:

- Use cover.
- Deflect projectiles with timed Resonator use only after the player has seen the mechanic demonstrated.
- Trigger a pylon during the Custodian's charge to stagger it.

The boss exposes its core after two successful interrupts or after a bounded time window to prevent a hard lock.

## 3.5 Phase Two: Desynchronization

At approximately 60% health:

- Two Phase Block lanes begin cycling.
- The outer ring rotates faster.
- Pulse attacks become wider but retain longer telegraphs.
- One arena pylon becomes temporarily disabled after each use.

The player must move between stable lanes while preserving pylon opportunities.

## 3.6 Phase Three: Harmonic Break

At approximately 25% health:

- The Custodian becomes aggressive.
- All four glyph plates light in a repeating attack pattern.
- The pattern predicts safe quadrants.
- The boss performs a large radial attack after the full sequence.

The player can:

- Read the sequence and move to safety.
- Use the Resonator at a matching pylon to shorten the attack.
- Continue normal damage during exposed windows.

The phase should last less than one minute under expected equipment.

## 3.7 Defeat

Defeat behavior:

- Core brightness destabilizes rather than instantly vanishing.
- The ring breaks into world-space fragments or particles.
- The arena's conduits redirect toward the central dais.
- The Custodian Sigil drops as a collectible material.
- The Echo Core becomes claimable.
- The vault state saves before the escape begins.

The core is not automatically granted. The player chooses when to claim it, allowing a brief recovery period.

---

# 4. Echo Core Escape

## 4.1 Trigger

Using the Resonator or normal use interaction on the Echo Core dais claims the core.

First clear:

- Adds the Echo Core to progression state.
- Grants or unlocks the Pulse Bracer reward path.

Repeat clear:

- Grants an Echo Core item and deterministic secondary loot.

## 4.2 Escape Design

The escape lasts approximately 75–120 seconds for a player who knows the route.

It should not destroy the entire vault. It changes selected routes:

- Some Phase Block bridges become unstable.
- Cracked Echo Brick walls break open.
- Previously closed maintenance passages open.
- Resonant Lamps shift to a warm warning pulse.
- Remaining Sentinels activate.
- Periodic shockwaves travel through conduits.

The player can escape through:

- The original entrance route, now altered.
- One deterministic alternate route opened by the collapse.

The alternate route should reward players who noticed cracked walls or conduits earlier.

## 4.3 Failure and Recovery

Death during escape must not permanently lose the core.

On death/reload:

- Claimed-core progression remains saved.
- The vault reloads into a post-claim stabilized state.
- The player can return and collect any unclaimed reward cache.
- The timed escape does not restart indefinitely unless explicitly designed as a debug option.

The feature must never trap the player behind a permanently closed route.

## 4.4 Completion

Exiting the vault influence volume after claiming the core:

- Ends the escape state.
- Produces a final low harmonic release.
- Converts warning lamps to a stable completed state.
- Saves the vault completion.
- Announces the first unique reward through existing message styling.

---

# 5. Long-Term Reward: Pulse Bracer

## 5.1 Acquisition

The first completed vault grants the Pulse Bracer.

Preferred delivery:

- The Echo Core combines with the Resonator and Custodian Sigil at a crafting table to produce the bracer.

This preserves a final player-authored crafting step and avoids silently replacing equipment.

Alternative delivery if recipe UX becomes unclear:

- A post-vault cache contains the bracer directly.

The implementation plan must choose one path and test it consistently. The preferred path is crafting.

## 5.2 Equip Model

The Pulse Bracer is an inventory item with a use action. It does not require a new equipment slot in this experiment.

The player selects it on the hotbar and uses the existing interaction input.

## 5.3 Pulse Behavior

Pulse properties:

- Short-range cone.
- Approximately 5-block effective distance.
- Strongest directly ahead.
- Bounded entity count.
- Line-of-sight checked.
- Cooldown approximately 4–6 seconds, subject to tuning.

Effects:

- Knock back normal hostile enemies.
- Interrupt Echo Sentinel charge attacks.
- Interrupt compatible Custodian attacks.
- Deflect supported projectiles.
- Activate Resonance Pylons and Plates.
- Reveal Echo Crystal within a bounded radius.
- Trigger a short dust pulse on lightweight breakable vault debris if implemented.

It does not:

- Mine normal blocks.
- Damage bosses directly.
- Replace swords or bows.
- Create unlimited mobility.
- Affect sealed-region rules.

## 5.4 Cooldown Presentation

Cooldown appears on the selected hotbar slot as a dark radial or vertical fill using Atlas's existing item-slot framing.

Requirements:

- No separate ability bar.
- No floating icon.
- No text timer required.
- Mobile/touch layout uses the same selected-slot treatment.
- Cooldown resets safely on world teardown.

## 5.5 External Utility

Outside vaults, the bracer should create at least three valuable interactions:

1. Combat spacing against ordinary hostile entities.
2. Projectile deflection where entity/projectile systems support it.
3. Echo Crystal reveal during cave exploration.

A reward that only works inside vaults is insufficient.

---

# 6. Repeat Vaults and Replay Value

## 6.1 Vault Identity

Each vault receives a stable ID derived from:

- World seed.
- Coarse vault-grid coordinates.
- Vault version.

The ID controls:

- Spire orientation.
- Entrance direction.
- Room layout choices.
- Glyph sequence.
- Phase timing offset.
- Trap positions.
- Sentinel composition.
- Loot table seed.
- Alternate escape route.

## 6.2 First Vault Bias

The nearest eligible vault to world spawn should use the easiest deterministic variant:

- Three-step memory sequence.
- Simple phase modules.
- Standard Sentinels only.
- Lower Custodian health or slower timings.

This can be selected by deterministic distance-to-spawn rules rather than hidden difficulty scaling.

## 6.3 Later Vault Rewards

Later vaults may provide:

- Echo Cores.
- Echo Shards.
- Resonant building blocks.
- Rare ore bundles.
- Resonant Lens.
- Fractured Core.
- Custodian Sigils.
- Decorative glyph variants if metadata or texture limits permit.

Unique Pulse Bracer duplication is prevented through progression state.

## 6.4 Variants

Each chamber category should ship with at least three layout variants or module combinations.

Minimum variation target:

- 3 Memory room arrangements.
- 4 Traversal module combinations.
- 3 Combat arena arrangements.
- 2 Custodian arena configurations.
- 2 escape routes per vault shell.

This does not require fully random room graphs. A curated graph with deterministic module choices is preferred for reliability.

---

# 7. Content IDs and Registry Separation

## 7.1 Existing Constraint

Atlas currently stores voxel IDs in `Uint8Array`, so placed block IDs must remain in the `0–255` range. Inventory-only items share the same `BlockType` enum even though they are not stored in chunk block arrays.

The current free ranges include:

- `70–85`: 16 IDs suitable for new blocks.
- `170–189`: 20 IDs suitable for inventory-only items or future content.

This experiment uses only those gaps and does not renumber existing content.

## 7.2 Block ID Allocation

Exact proposed mapping:

| ID | Symbol | Role |
|---:|---|---|
| 70 | `ECHO_STONE` | Primary natural/structural vault block |
| 71 | `ECHO_BRICKS` | Main built wall block |
| 72 | `CRACKED_ECHO_BRICKS` | Breakable/escape-route clue block |
| 73 | `CHISELED_ECHO_STONE` | Glyph/decorative block |
| 74 | `ECHO_MOSAIC` | Floor guidance and room identity |
| 75 | `ECHO_CRYSTAL` | Mineable luminous resource block |
| 76 | `RESONANCE_PYLON` | Main interactive puzzle device |
| 77 | `RESONANCE_DOOR` | Multi-block controlled door material |
| 78 | `PULSE_CONDUIT` | State-bearing visual signal block |
| 79 | `PHASE_BLOCK` | Metadata-driven solid/intangible block |
| 80 | `RESONANCE_PLATE` | Environmental trigger block |
| 81 | `RESONANT_LAMP` | State-bearing light block |
| 82 | `ECHO_SPIKES` | Hazard block |
| 83 | `SENTINEL_CORE_BLOCK` | Decorative/mechanical core block |
| 84 | `LISTENING_STONE` | Surface and vault interaction block |
| 85 | `VAULT_SEAL` | Inner progression gate material |

No additional block IDs may be added without revising this document.

## 7.3 Item ID Allocation

Exact proposed mapping:

| ID | Symbol | Role |
|---:|---|---|
| 170 | `ECHO_SHARD` | Primary mined ingredient |
| 171 | `ECHO_DUST` | Refined ingredient/secondary loot |
| 172 | `RESONATOR` | Discovery and puzzle tool |
| 173 | `ECHO_CORE` | Major repeat-vault reward |
| 174 | `PULSE_BRACER` | Unique first-clear reusable tool |
| 175 | `CUSTODIAN_SIGIL` | Boss material |
| 176 | `RESONANT_LENS` | Advanced crafting/loot component |
| 177 | `FRACTURED_CORE` | Repeat-vault rare component |

IDs `178–189` remain unused.

## 7.4 Compatibility-Preserving Catalog Split

This branch introduces a partial block/item separation without rewriting every existing system.

### New catalog structure

- `src/systems/registry/worldBlockCatalog.ts`
  - Contains definitions or classification for content valid in voxel arrays.
  - Asserts every world block ID is `0–255`.
  - Exposes `isWorldBlock(type)`.
  - Exposes reserved/free-range validation.

- `src/systems/registry/itemCatalog.ts`
  - Contains inventory-only item classification.
  - Exposes `isInventoryOnlyItem(type)`.
  - Exposes stack and placement metadata.

- `src/systems/registry/contentCatalog.ts`
  - Temporary merged compatibility view.
  - Existing callers can continue using numeric IDs and `BLOCKS` during migration.
  - New Resonant Vault code uses explicit world-block or item classification.

### Rules

- Existing IDs retain existing meaning.
- `BlockType` remains available for compatibility.
- Chunk arrays remain `Uint8Array`.
- Inventory stacks remain numeric in this experiment.
- New item-only definitions must never be written to chunks.
- Tests fail if an inventory-only Resonant Vault item is placeable or generated as terrain.
- Tests fail if a world block is missing from `BLOCKS`, texture mapping, drops/harvest behavior, or creative categorization.
- Tests document all currently free IDs.

### Deferred work

A full stable-key registry and paletted chunk format remain separate future work. This feature prepares cleaner boundaries but does not depend on that migration.

---

# 8. Block and Item Behavior

## 8.1 Echo Stone Family

### Echo Stone

- Hardness between stone and deepslate.
- Pickaxe required.
- Drops itself or Echo Cobble equivalent is not added due to ID constraints; it drops Echo Stone.
- Subtle speckled pattern and low-saturation blue-gray palette.

### Echo Bricks

- Crafted from Echo Stone.
- Primary building reward.
- Strong rectilinear texture matching Atlas's 16×16 block style.

### Cracked Echo Bricks

- Lower hardness.
- Used as escape-route clues.
- May break from scripted vault pulses.
- Drops Echo Bricks or itself according to final balance.

### Chiseled Echo Stone

- Contains one of a limited glyph set using metadata or orientation.
- If metadata cannot select texture variants cleanly, use one universal glyph texture and world-space overlays for puzzle-specific symbols.

### Echo Mosaic

- Floor navigation block.
- Provides strong value contrast and directional geometry.

## 8.2 Interactive Blocks

### Resonance Pylon

Metadata/state includes:

- Orientation.
- Active/inactive.
- Locked/unlocked.
- Puzzle group index.

Behavior is owned by vault state, not inferred only from current metadata.

### Resonance Door

Door cells are generated as a coordinated set. The controller opens/closes all cells through a stable door ID.

The system must recover if some door blocks are manually modified in creative mode.

### Pulse Conduit

Conduits are mostly visual state carriers:

- Dark.
- Charging.
- Active.
- Warning.

They may use metadata and renderer tint/emission.

### Phase Block

Collision, selection, rendering opacity, and meshing must agree on current phase state.

A block may be:

- Solid.
- Warning.
- Intangible.

State changes must trigger bounded remeshing and collision updates. The implementation should update groups rather than every block independently each frame.

### Resonance Plate

Triggered by:

- Player presence.
- Entity presence where intended.
- Resonator or Pulse Bracer use where configured.

Debounce prevents repeated activation every frame.

### Resonant Lamp

Light level and texture/emissive state correspond to vault state.

### Echo Spikes

- Damage on contact or landing.
- Clear collision silhouette.
- Used sparingly.
- Never hidden beneath opaque blocks.

### Listening Stone

- Interactive.
- Emits directional pulses.
- Stores no player-specific data in block metadata.

### Vault Seal

- Unbreakable or effectively unbreakable in survival until completion.
- Creative-editable.
- Controlled by the three-wing completion state.

## 8.3 Items

### Echo Shard

- Stackable ingredient.
- Distinct crystal icon.
- Drops from Echo Crystal.

### Echo Dust

- Stackable refined ingredient.
- Created from Echo Shards through crafting or furnace processing.
- Used in advanced repeat-vault recipes.

### Resonator

- Durability-free.
- Cooldown-driven.
- Normal use tool.
- No attack damage bonus.

### Echo Core

- Rare stackable or non-stackable material; preferred maximum stack size 16.
- Used for Pulse Bracer and later content.

### Pulse Bracer

- Unique tool.
- Maximum stack size 1.
- Cooldown-driven.
- No durability in this experiment.

### Custodian Sigil

- Boss material.
- Maximum stack size 16.

### Resonant Lens

- Rare component.
- Potential future navigation upgrade.
- In this experiment, used for advanced recipes or high-value loot.

### Fractured Core

- Repeat-vault rare component.
- Used for building block conversion or future progression.

---

# 9. Texture and Visual Language

## 9.1 Constraints

All new textures must follow the existing Atlas texture-atlas pipeline.

Requirements:

- 16×16 pixel source style.
- Limited palette.
- Strong value grouping.
- No smooth gradients that clash with existing blocks.
- No imported high-resolution concept art.
- No externally generated UI icon style.
- Every item icon reads at hotbar scale.
- Every puzzle block remains recognizable under cave lighting.

## 9.2 Palette

Primary palette:

- Blue-gray stone.
- Desaturated cyan resonance lines.
- Warm amber warning state.
- Pale lavender crystal highlights.
- Near-black recesses.

The palette must remain distinct from:

- Magnetic Fields red/blue polarity.
- Amethyst's saturated purple.
- Lapis blue.
- Diamond cyan.

## 9.3 Glyphs

Glyphs use shape, not only color.

Minimum set:

- Split circle.
- Three-prong fork.
- Offset diamond.
- Nested angle.

Glyphs must remain distinguishable at 16×16 and in world-space emissive overlays.

## 9.4 Animated State

Preferred implementation order:

1. Metadata-driven texture/tint/emission changes.
2. World-space particles and light pulses.
3. Limited frame animation only if the existing atlas supports it safely.

Avoid rebuilding atlas textures every frame.

## 9.5 Enemy Rendering

Echo Sentinels and the Custodian should use existing Three.js primitive/mesh patterns and texture-atlas materials where practical.

They must not appear as untextured developer geometry.

---

# 10. Audio and Feedback

## 10.1 Procedural Resonance Audio

A small `ResonanceAudioSystem` may use Web Audio oscillators filtered and enveloped through Atlas's sound settings.

Uses:

- Pylon tones.
- Memory sequence notes.
- Listening Spire pulse.
- Door activation chord.
- Custodian charge telegraph.
- Core claim dissonance.

Requirements:

- Respect master and effects volume.
- Stop on teardown.
- Avoid continuous oscillators when inaudible.
- Fall back safely if AudioContext is unavailable.
- Never block gameplay on audio initialization.

## 10.2 Existing Sound Reuse

Block interactions continue using Atlas sound groups for:

- Stone breaking.
- Crystal breaking.
- Door mass/impact.
- Enemy impacts where appropriate.

Procedural tones layer over, rather than replace, tactile block sounds.

## 10.3 Feedback Hierarchy

Every important interaction should provide at least two channels:

- Visual plus audio.
- Visual plus camera response.
- Shape plus position.

Critical puzzle information must never depend on audio alone.

---

# 11. Deterministic Generation

## 11.1 Vault Grid

Vault candidates use a coarse world grid large enough to prevent overlap.

Recommended starting values:

- Cell size: 640–896 blocks.
- One candidate per cell.
- Deterministic jitter within a safe center region.
- Minimum distance from world spawn for all but the guided first-vault candidate.
- Minimum distance from another accepted vault.

Exact values require generation tests.

## 11.2 Eligibility

Reject candidate locations when:

- Inside Magnetic Fields.
- Intersecting a protected boss arena.
- Center lies in deep ocean if no valid land entrance is possible.
- Terrain vertical range cannot contain the vault bounding volume.
- Structure would exceed world height limits.
- Candidate overlaps another reserved authored structure.

## 11.3 Structure Graph

Every vault has this logical graph:

- Surface Spire.
- Entrance approach.
- Entrance door.
- Hub.
- Memory wing.
- Traversal wing.
- Combat wing.
- Inner seal corridor.
- Custodian arena.
- Echo Core chamber.
- Primary escape route.
- Alternate escape route.

The graph is fixed for reliability. Individual room modules, orientation, offsets, and furnishings vary deterministically.

## 11.4 Bounding Volume

A vault reserves an underground volume.

Within the volume:

- Ordinary cave carving must not remove critical structural cells.
- Ores may be suppressed in critical rooms.
- Existing caves may intersect designated entrance/maintenance corridors.
- Vault blocks overwrite replaceable natural stone according to strict rules.
- Bedrock and protected structures are never overwritten.

## 11.5 Cross-Chunk Generation

Use a dedicated generator similar in isolation to `magneticArena.ts`.

Suggested files:

- `src/systems/world/resonantVaults.ts`
- `src/systems/world/resonantVaultLayout.ts`
- `src/systems/world/resonantVaultGenerator.ts`
- `src/systems/world/resonantVaultRooms.ts`

The generator receives:

- Vault identity.
- Center/orientation.
- Chunk bounds.
- Bounded `setBlock` and `setMetadata` callbacks.

Every overlapping chunk independently generates the same slice.

## 11.6 Terrain Integration

The surface spire foundation adapts to terrain through:

- Limited foundation columns.
- Debris ramps.
- No large flat terrain disc.
- No floating foundations.
- No buried interactive face.

The underground structure uses authored elevations relative to a validated center Y.

## 11.7 Determinism Rules

- No `Math.random()`.
- No `Date.now()` for generation or puzzle identity.
- No iteration-order-dependent Map/Set randomness.
- Stable integer hashing.
- Stable room ordering.
- Stable loot seed.
- Stable first-vault selection.

---

# 12. Runtime Vault State

## 12.1 State Model

Each generated vault has a world-scoped record:

```ts
interface ResonantVaultProgress {
  vaultId: string;
  discovered: boolean;
  entranceOpened: boolean;
  memorySolved: boolean;
  traversalSolved: boolean;
  combatSolved: boolean;
  custodianDefeated: boolean;
  coreClaimed: boolean;
  escapeCompleted: boolean;
  firstRewardClaimed: boolean;
  openedCaches: string[];
  puzzleAttemptSerials?: Record<string, number>;
}
```

Only stable progression is saved. Transient attack timers, current enemy positions, current phase interpolation, and active particles are not serialized.

## 12.2 Storage

Add an optional progression field:

```ts
worldEvents?: {
  resonantVaults?: Record<string, ResonantVaultProgress>;
}
```

If `worldEvents` is already used by another branch or accepted feature, merge under the same additive namespace.

Compatibility requirements:

- Existing worlds default to no discovered vault progress.
- Progression version remains unchanged if optional additive decoding supports it safely.
- Decoder ignores malformed unknown vault entries rather than failing the world load.
- Save updates occur after each wing completion, Custodian defeat, core claim, and escape completion.

## 12.3 World Edit Persistence

Normal chunk saves preserve:

- Opened door blocks.
- Broken cracked walls.
- Settled escape-route changes.
- Player modifications.

Logical progress remains the source of truth for reconstructing required machinery if chunks are generated after progress has advanced.

Example:

- If a wing is solved before a distant door chunk loads, generation emits the solved/open state directly.

## 12.4 Reset and Teardown

Runtime controllers reset on:

- World unload.
- Return to menu.
- Death where appropriate.
- Switching worlds.
- Creative/spectator transitions where active combat should stop.

Persistent completion does not reset.

---

# 13. Interaction Architecture

## 13.1 Explicit Interaction Hooks

Do not wrap `WorldManager.setBlock` as the Cave Stability experiment does.

Resonant Vaults should add explicit hooks in the normal player interaction path:

- `tryUseResonanceTarget` before ordinary block interaction.
- `onVaultBlockBroken` after a successful player break.
- `onVaultBlockPlaced` if future puzzle behavior needs it.

This provides clear edit source and avoids inferring player intent from mouse state.

## 13.2 Targeting

Resonator/Pulse Bracer targeting uses existing voxel raycast and entity raycast systems.

Rules:

- Prioritize a valid entity target when unobstructed.
- Otherwise use a valid block target.
- Otherwise emit a free pulse/reveal effect.
- Respect sealed-region edit restrictions.
- Do not interact through solid walls.

## 13.3 Mobile and Touch

The normal use action must work through existing touch controls.

No keyboard-only key is required.

Cooldown and selected-item state use the current hotbar layout.

---

# 14. Puzzle Runtime Architecture

## 14.1 Vault Controller

`ResonantVaultSystem` owns runtime state for loaded/nearby vaults.

Responsibilities:

- Resolve current vault by player position.
- Hydrate persistent progress.
- Route interactions to room controllers.
- Update phase groups at bounded cadence.
- Spawn/despawn Sentinels.
- Start Custodian encounter.
- Start/stop escape sequence.
- Emit typed events.
- Apply saved state to newly loaded chunks.

Only nearby vaults are active.

## 14.2 Memory Controller

Pure state machine:

- Idle.
- Demonstrating.
- Awaiting input.
- Failure cooldown.
- Solved.

Inputs are pylon IDs.

The controller exposes demonstration events but does not render UI.

## 14.3 Phase Controller

Groups Phase Blocks by metadata group index or generated registry.

Update frequency:

- Logical state transitions at fixed game-time cadence.
- Rendering interpolation may occur per frame without world block writes.
- Collision state changes only at transition boundaries.
- Remeshing is grouped and bounded.

## 14.4 Combat Controller

Owns:

- Wave definitions.
- Spawn gates.
- Active entity IDs.
- Plate cooldowns.
- Completion conditions.

It must recover if entities unload or are removed unexpectedly.

## 14.5 Escape Controller

Owns:

- Escape start time in world ticks.
- Route stage.
- Hazard schedule.
- Door/wall changes.
- Completion volume.

Pausing freezes the sequence.

Death converts the vault to a stable post-claim state.

---

# 15. Echo Sentinels

## 15.1 Base Sentinel

Behavior:

- Maintains mid-range distance.
- Fires slow readable projectiles.
- Charges a close pulse if cornered.
- Can be interrupted by Resonator/Pulse Bracer.
- Uses vault cover where navigation permits.

## 15.2 Shielded Sentinel

- Starts with a resonance shield.
- Normal attacks are reduced or blocked.
- A matching pylon, plate, Resonator timing, or Pulse Bracer breaks the shield.
- Shield state is visually obvious.

## 15.3 Conductor Sentinel

Optional third variant if implementation remains manageable:

- Buffs nearby Sentinels through conduit-like beams.
- Weak individually.
- Encourages target prioritization.

This variant is optional for the first complete implementation. The base and shielded variants are required.

## 15.4 Projectiles

Echo projectiles:

- Travel slowly enough to read.
- Have strong world-space trails.
- Damage once.
- Can be deflected by Pulse Bracer.
- May be redirected by Resonance Plates in the combat chamber.

## 15.5 Drops

Sentinels drop:

- Echo Dust.
- Low chance of Echo Shard.
- No unique progression item.

---

# 16. Custodian Architecture

Suggested files:

- `src/systems/entities/resonant/CustodianController.ts`
- `src/systems/entities/resonant/custodianAttacks.ts`
- `src/components/entities/VaultCustodian.tsx`
- `src/components/entities/EchoSentinel.tsx`

The Custodian uses the existing entity manager where possible but may require a specialized controller similar to the Magnetic Warden.

Requirements:

- Stable entity kind IDs.
- Bounded attack timers.
- Typed phase events.
- Proper cleanup.
- Boss HUD reuse only if the existing boss HUD styling fits. If used, it must use the existing component and visual language rather than a new panel.
- Save defeat before reward availability.

---

# 17. Loot and Economy

## 17.1 Entrance/Hub Cache

Contains preparation supplies:

- Food.
- Torches.
- Small copper or iron amount.
- Low Echo Dust amount.

## 17.2 Wing Caches

Memory:

- Lapis.
- Echo Dust.
- Decorative Echo blocks.

Traversal:

- Building blocks.
- Food.
- Rare utility materials.

Combat:

- Iron/gold/diamond chance based on vault distance tier.
- Echo Shards.
- Custodian preparation items.

## 17.3 Core Cache

First vault:

- Required Pulse Bracer recipe components.
- Guaranteed unique progression path.

Repeat vault:

- Echo Core.
- Rare Resonant Lens or Fractured Core chance.
- High-value resource bundle.

## 17.4 Deterministic Loot

Loot is seeded by:

- Vault ID.
- Cache ID.
- Loot version.

Opening state persists to prevent rerolls.

---

# 18. Recipes

Minimum recipes:

## Resonator

3×3 shaped recipe using copper, amethyst, lapis, and Echo Shards.

## Echo Bricks

2×2 Echo Stone → 4 Echo Bricks.

## Chiseled Echo Stone

Echo Stone or Echo Bricks through a simple shaped recipe.

## Echo Mosaic

Echo Bricks plus Echo Dust.

## Resonant Lamp

Echo Stone/Echo Bricks plus Echo Dust and a light source material.

## Pulse Bracer

Echo Core, Resonator, Custodian Sigil, copper/iron, and Resonant Lens or Echo Dust.

The recipe should be expensive enough to preserve the first-clear payoff but not require a second vault.

---

# 19. UI Integration

## 19.1 Allowed UI

- Existing boss HUD for Custodian health if visually appropriate.
- Existing message feed.
- Existing inventory/crafting/chest screens.
- Existing hotbar.
- Selected-slot cooldown overlay.
- Existing interaction prompts if Atlas already has them.

## 19.2 Prohibited UI

- New quest panel.
- Vault checklist.
- Full-screen tutorial modal.
- Floating world marker.
- New top-right badge.
- New visual theme unrelated to Atlas.
- External icon library styling.

## 19.3 Onboarding Through World Design

The feature teaches through:

- Repeated glyphs.
- Conduits connecting cause and effect.
- Safe first examples.
- Short existing-style messages only when necessary.
- Consistent audio/visual feedback.

---

# 20. Accessibility

- Memory sequences use shape, position, light pattern, and tone.
- Phase blocks use opacity, glyph flicker, and conduit state, not color alone.
- Important sounds have visible equivalents.
- Warning timing remains longer than a single reaction frame.
- Camera trauma is bounded and respects reduced-motion settings if available.
- Pulse Bracer does not require pixel-perfect aim.
- Recovery routes prevent repeated lethal punishment during learning.
- No mandatory rapid button mashing.

---

# 21. Performance Boundaries

## Generation

- Vault candidate lookup is O(1) or bounded per chunk through coarse-grid cells.
- Only nearby candidate cells are evaluated.
- Structure generation writes only the current chunk slice.
- Room layout is precomputed from seed without allocating full-world structures.

## Runtime

- Only the current/nearby vault controller is active.
- Phase groups update collision state at fixed transitions, not every frame.
- Visual interpolation avoids repeated block writes.
- Sentinel and Custodian counts are capped.
- Pulse targeting caps affected entities.
- Crystal reveal scans a bounded volume or loaded-block index.
- Conduit animation does not remesh entire chunks every frame.

## Suggested Caps

- Maximum active Sentinels in a vault: 10.
- Maximum combat-room simultaneous Sentinels: 5.
- Maximum Echo projectiles: 32.
- Maximum phase groups active: 8.
- Maximum pulse-affected entities: 12.
- Maximum reveal radius: 14 blocks.
- Maximum active vault controllers: 1 full controller plus passive nearby spire effects.

## Measurement

Record before/after where executable:

- Chunk generation duration with no vault candidate.
- Chunk generation duration intersecting a vault.
- Production bundle size.
- Active vault frame cost through available profiling hooks.
- Entity/projectile counts.
- Remesh count during phase transitions.

Do not claim performance improvement without measurement.

---

# 22. Save Compatibility and Failure Handling

## Existing Worlds

- Existing chunks remain unchanged.
- New vaults appear only in newly generated chunks unless an explicit future retrofit system is added.
- Progression defaults safely.
- Existing IDs are unchanged.

## Missing/Corrupt Progress

- Missing vault progress reconstructs from deterministic generation and current blocks where possible.
- Malformed entries are ignored with diagnostics.
- Core reward cannot duplicate from a partially malformed state; use a world-level first-reward flag.

## Partial Structures

If a vault chunk is missing or fails to generate:

- Neighboring chunks must not crash.
- Door/controller logic tolerates absent blocks.
- Debug inspection reports incomplete structure state.

## Creative Editing

- Creative mode may alter vault blocks.
- Controllers should fail soft when expected blocks are missing.
- Debug command can repair required state in a bounded area if implemented.

---

# 23. Commands and Debug Tooling

Required commands:

- `/vault locate`
  - Reports nearest deterministic vault center and distance.

- `/vault teleport`
  - Development-only teleport if Atlas command conventions allow it.

- `/vault inspect`
  - Reports vault ID, room states, active phase groups, entities, and escape state.

- `/vault reset-room <memory|traversal|combat>`
  - Resets transient room state without duplicating loot.

- `/vault solve-room <memory|traversal|combat>`
  - Development aid.

- `/vault start-custodian`
  - Starts encounter when prerequisites are met or forced in development mode.

- `/vault claim-core`
  - Development aid.

- `/vault repair`
  - Reapplies required generated blocks within loaded vault chunks without overwriting unrelated player blocks unless explicitly forced.

Commands use existing chat/message styling.

---

# 24. Events

Typed events should include:

- `vault:discovered`
- `vault:entered`
- `vault:room-started`
- `vault:room-failed`
- `vault:room-completed`
- `vault:seal-opened`
- `vault:custodian-started`
- `vault:custodian-phase`
- `vault:custodian-defeated`
- `vault:core-claimed`
- `vault:escape-started`
- `vault:escape-completed`
- `resonance:pylon-activated`
- `resonance:pulse`
- `resonance:projectile-deflected`

Events support presentation, persistence, analytics-style tests, and future content without direct system coupling.

---

# 25. Testing Strategy

## 25.1 ID and Catalog Tests

- Exact block IDs 70–85.
- Exact item IDs 170–177.
- Existing ID snapshot unchanged.
- Reserved ranges remain collision-free.
- Inventory-only items rejected from world block writes in new APIs.
- Every new content definition exists.
- Every new texture mapping exists.
- Every new item has stack/placement classification.

## 25.2 Deterministic Generation Tests

- Stable vault candidate for seed/cell.
- Negative coordinate stability.
- No overlapping accepted vaults.
- Magnetic Fields exclusion.
- World-height exclusion.
- Stable room variant selection.
- Stable glyph sequence.
- Stable phase timing.
- Stable loot seed.
- Identical cross-chunk structure overlap.
- No `Math.random()` or wall-clock generation input.

## 25.3 Structure Tests

- Every graph node is reachable.
- Entrance connects to hub.
- Each wing connects to hub.
- Inner seal connects to arena.
- Primary and alternate escape routes reach exterior.
- Required puzzle blocks exist.
- Door groups are complete.
- No critical room is filled with terrain.
- Protected volume excludes cave carving.

## 25.4 Puzzle Tests

Memory:

- Stable sequence.
- Correct input solves.
- Wrong input resets locally.
- Sequence length bounds.
- Save hydration.

Traversal:

- Stable phase group state from world ticks.
- Pause freeze.
- Collision/render state agreement.
- Permanent return bridge after solve.

Combat:

- Correct wave ordering.
- Missing entity recovery.
- Plate cooldown.
- Completion after required enemies die.

## 25.5 Entity Tests

- Sentinel attack states.
- Shield interruption.
- Projectile lifetime and damage-once.
- Deflection ownership changes.
- Custodian phase thresholds.
- Custodian fallback exposure window.
- Cleanup on defeat/teardown.

## 25.6 Escape Tests

- Core claim saves before escape.
- Route changes occur once.
- Death produces post-claim stable state.
- Escape completion persists.
- No permanent player trap.

## 25.7 Reward Tests

- First reward granted once per world.
- Repeat vault does not duplicate Pulse Bracer.
- Pulse cooldown.
- Knockback cap.
- Line-of-sight.
- Reveal radius.
- Projectile deflection compatibility.

## 25.8 Save Compatibility Tests

- Old save without vault fields loads.
- Malformed vault entry ignored.
- Existing progression fields preserved.
- Existing block IDs preserved.
- Generated solved-state reconstruction.

## 25.9 UI/Visual Source Tests

- No detached vault HUD/panel.
- Cooldown uses existing hotbar slot.
- New textures use Atlas mapping.
- Puzzle glyphs have shape variants.
- Boss HUD reuses existing component if present.

## 25.10 Full Repository Gate

- `npm run typecheck`
- `npm run lint`
- `node --test`
- `npm run build`

Attempt preview deployment and browser verification through available tooling. Report environmental blockers precisely.

---

# 26. Implementation Stages

The implementation plan should preserve these reviewable stages:

1. ID governance and catalog separation foundation.
2. Content definitions, textures, recipes, drops, and creative integration.
3. Deterministic vault location and reserved-volume rules.
4. Full structure graph and cross-chunk generation.
5. Progression model and typed events.
6. Resonance audio/visual pulse foundation.
7. Listening Spire discovery loop.
8. Resonator interactions and crystal reveal.
9. Memory chamber.
10. Phase block and traversal chamber.
11. Combat chamber environmental systems.
12. Echo Sentinel entities and projectiles.
13. Inner seal and hub progression.
14. Custodian miniboss.
15. Echo Core claim and escape sequence.
16. Pulse Bracer reward and external utility.
17. Deterministic caches and repeat-vault rewards.
18. Commands, diagnostics, and repair tooling.
19. Compatibility, determinism, and full integration tests.
20. Full validation, cleanup, deployment, and private draft PR.

Each stage should use focused commits. Temporary validation files must be removed from the final diff.

---

# 27. Acceptance Criteria

The experiment is implementation-complete when all of these are true:

## Content

- All 16 proposed blocks exist with valid definitions and textures.
- All 8 proposed items exist with valid definitions and icons.
- New IDs occupy only the approved gaps.
- New catalog boundaries classify world blocks and inventory-only items.

## Discovery

- Listening Spires generate deterministically.
- Spires direct players toward vaults through world-space feedback.
- Echo Crystal supports Resonator crafting.

## Vault

- Entrance, hub, three wings, inner seal, arena, core chamber, and escape routes generate.
- Cross-chunk generation is deterministic.
- Critical rooms are protected from caves.

## Puzzles

- Memory chamber is fully playable.
- Traversal chamber is fully playable.
- Combat chamber is fully playable.
- Each chamber saves completion.

## Enemies

- Base and shielded Echo Sentinels function.
- Custodian has three readable phases and can be defeated.

## Escape

- Core claim starts the escape.
- Route changes and hazards occur.
- Death/reload cannot lose the core or trap the player.
- Escape completion saves.

## Reward

- Pulse Bracer is obtainable once.
- It works in normal combat and exploration.
- Cooldown matches Atlas hotbar styling.

## Presentation

- No mismatched standalone UI.
- New textures match Atlas's pixel-art language.
- Puzzle information is not audio-only or color-only.
- Existing sound, particle, message, lighting, and camera systems are reused.

## Compatibility

- Existing IDs unchanged.
- Existing saves load.
- Existing worlds require no migration.
- Browser/Electron/mobile control paths are not intentionally broken.

## Validation

- Typecheck passes.
- Lint passes.
- All tests pass.
- Production build passes.
- Final branch contains no temporary validation configuration.
- Draft PR documents unverified runtime behavior honestly.

---

# 28. Risks and Mitigations

## Scope Risk

This is a large feature. The implementation must preserve vertical slices and avoid one giant controller.

Mitigation:

- Separate generation, puzzles, entities, persistence, items, and presentation.
- Validate each stage.
- Keep a fixed graph and curated module set.

## ID Risk

The block range is fully consumed.

Mitigation:

- Exact ID table and snapshot tests.
- No unplanned new block ID.
- Metadata handles state variants.
- Leave item IDs 178–189 free.

## Generation Risk

Vaults could intersect terrain poorly or become unreachable.

Mitigation:

- Eligibility checks.
- Reserved volume.
- Deterministic entrance approach.
- Route connectivity tests.
- Debug locate/repair commands.

## Puzzle Readability Risk

Players may not understand rules.

Mitigation:

- Safe demonstrations.
- Conduits show relationships.
- Multiple feedback channels.
- Recoverable failure.

## Combat Risk

Sentinels or Custodian may feel like health sponges.

Mitigation:

- Environmental counterplay.
- Interrupt windows.
- Short wave structure.
- Boss exposure fallback.

## Reward Risk

Pulse Bracer may be too strong or too narrow.

Mitigation:

- Cooldown.
- Bounded cone and target cap.
- Utility without raw damage scaling.
- At least three external uses.

## Performance Risk

Phase blocks and effects may cause excessive remeshing.

Mitigation:

- Grouped transitions.
- Visual interpolation without block writes.
- Fixed controller activation radius.
- Measured remesh counts.

## Compatibility Risk

Partial catalog separation could produce inconsistent classification.

Mitigation:

- Compatibility merged view.
- Snapshot tests.
- New content uses explicit APIs.
- Existing content remains untouched.

---

# 29. Final Design Decision

Proceed with Resonant Vaults as a large private Atlas Lab experiment.

The implementation must prioritize the player's complete experience over raw feature count. Every subsystem should support the same arc: discover, prepare, learn, master, confront, escape, and carry a meaningful new capability back into the wider world.

The feature should be judged by whether the player would seek out another vault after completing the first—not merely by whether all listed systems exist.