# Resonant Vault Production Overhaul Design

**Date:** 2026-07-14

**Status:** Approved direction, written specification awaiting final review

## Summary

The Resonant Vault will be rebuilt from an MVP-style collection of disconnected systems into a cohesive Atlas expedition. The overhaul keeps the existing content IDs, additive progression data, rewards, and save compatibility, but replaces the structure presentation, guidance, boss encounter, escape, visual language, and audio package.

The experience will teach one consistent idea: a pulse creates an echo, and the echo reveals what happens next. That rule drives route finding, the three wings, combat feedback, the Vault Mason encounter, and the musical structure. Players should learn through the world first and use a compact objective line only as a safety net.

## Goals

- Make every intended room connection physically open, visible, and traversable.
- Replace the box-room and square-tunnel presentation with authored voxel architecture.
- Give the structure two genuine routes from the core chamber to the surface.
- Replace the Vault Custodian with the Vault Mason, a dedicated boss built around arena reconstruction.
- Give the Vault Mason a textured articulated model, readable animation states, and unique mechanics.
- Make echo behavior a consistent gameplay rule across the expedition.
- Replace automatic instruction paragraphs with environmental teaching and a one-line objective HUD.
- Keep the HUD visually consistent with Atlas and free of neon styling.
- Retain restrained luminous accents on functional vault blocks while reducing their saturation and frequency.
- Make every critical route readable without requiring player-placed light.
- Allow torch placement before the vault is cleared while preserving the structure edit lock.
- Replace every synthesized Resonant Vault music and sound asset with recorded or genuinely performed material.
- Guarantee that music transitions and one-shot sound tails do not cut off abruptly.
- Preserve existing worlds and repair temporary encounter state safely after loading.
- Validate the generated structure and runtime behavior rather than relying on source-text assertions.

## Non-goals

- Do not rewrite `src/App.tsx` or `src/systems/WorldManager.ts` into new architectures.
- Do not renumber Resonant block or item IDs.
- Do not migrate or invalidate existing world saves.
- Do not add a general quest system, dialogue system, or new global UI framework.
- Do not expose a general-purpose dynamic-structure editing API beyond what the Vault Mason requires.
- Do not redesign unrelated Atlas biomes, bosses, inventory behavior, or base-game music.
- Do not make neon an interface theme.

## Current-state findings

The current branch has several implementation gaps that the overhaul must address directly:

- Geometry tests confirm route-point continuity but do not confirm that generated wall blocks are cleared or that a player-sized volume can cross each threshold.
- The two escape rooms are underground dead ends. Progress marks escape complete when a player enters either room, not when the player reaches the surface.
- Rooms are rectangular shells connected by uniform square corridors. Most visual distinction comes from block color instead of spatial composition.
- The current boss is a generic entity box with attached primitive accents. It uses generic shield, projectile, phase, and slam fields also used by the Magnetic Warden architecture.
- Resonant combat still calls Magnetic Warden sound events.
- Guidance is delivered as multi-line chat prose and advertises `/vault guide` and debug commands.
- `ResonantVaultController` discovers the selected item by querying rendered DOM and matching texture-slot numbers.
- `Chat` imports and executes Resonant Vault commands directly.
- The structure edit check does not distinguish breaking a structure block from placing a torch in an empty cell.
- The custom Resonant music and effects are synthesized from MIDI, oscillators, and generated noise. They are placeholders under the revised audio requirement.
- The music system owns two streaming decks, but Resonant context changes stop the current deck before scheduling the next context. This does not use the decks as a true overlap crossfade.

## Design principles

### World first

The structure, light, movement, animation, and sound must communicate the intended action before text does. Text can confirm an objective, but it must not explain the level in paragraphs.

### One echo rule

An echo is a delayed, readable response to a pulse. The delay, anticipation, and response must remain consistent enough that learning in one room helps in the next.

### Functional light

Luminous material identifies active machinery, routes, and state changes. It is not a blanket color treatment and is never used to decorate the HUD.

### Physical consequence

The Vault Mason changes real arena blocks. Every change must be telegraphed, bounded, reversible, and safe across remeshing, lighting, chunk borders, save/load, death, and encounter reset.

### Plain player language

Player-facing copy names an action or state. Internal terms can remain in code when renaming them would create compatibility risk, but the player should not need to decode lore phrases to understand a mechanic.

## Player journey

### 1. Surface discovery

The surface ruin presents a visible entrance rather than a decorative tower with an unclear purpose. Echo Crystal outcrops lead toward the entrance through placement and restrained light. The central receptive stone emits a directional echo through floor markers toward the descent when pulsed.

The objective line reads:

`VAULT · Craft a Resonator: shard, copper, amethyst, stick`

This is a functional recipe reminder, not a descriptive paragraph. The existing recipe remains available for repeat crafting.

### 2. Descent and gallery

The descent becomes a continuous, two-way voxel stair rather than alternating ledges. Landings break the vertical distance into readable sections and provide recessed lamps. The gallery opens sightlines toward the hub and introduces the echo rule safely:

1. A floor receiver flashes when pulsed.
2. A delayed light response travels toward the next doorway.
3. The doorway frame answers with a short recorded stone-and-metal cue.

The player learns that a pulse can reveal a route before a puzzle demands timing.

### 3. Hub

The hub is the expedition's visual anchor. Three distinct doorway silhouettes face the three wings. Mosaic paths lead to them without relying on color alone. A central status stone sends a short light echo down the route of the current unfinished wing.

Completed wings change their hub marker from an inactive carved face to a softly lit solid face. The boss route is the only intentionally sealed passage. The seal is visible from the hub and never masquerades as an ordinary wall.

The objective line reads:

`VAULT · Open the wing seals 1/3`

### 4. Three wings

The wings can be completed in any order. Each teaches the same pulse-and-echo rule through a different activity.

### 5. Inner route and Vault Mason

Completing all three wings opens the inner seal. The antechamber gives the player a clear view into the arena and enough light to read its major shapes before combat starts. Entry closes the encounter boundary, but it never removes the route permanently.

### 6. Core and escape

Defeating the Vault Mason opens the core. Claiming it opens two previously visible escape gates and starts the escape music and timer. Both routes lead to real surface outlets. Progress completes only after crossing a surface threshold.

## Spatial architecture

### Room shells

Room generation will retain deterministic rectangular bounds for routing and persistence lookup, but the visible interior will not read as a plain box. A focused architectural pass will add:

- Recessed wall bays at regular intervals.
- Chiseled supports at structural corners and doorway loads.
- Stepped or ribbed ceilings in major rooms.
- Raised or lowered floor zones where they do not obstruct navigation.
- Alcoves that hold lamps and machinery instead of placing lights on open floors.
- Larger framed openings at primary routes.
- Distinct silhouettes for the hub, pattern room, crossing room, combat room, arena, and core.

Architectural detail must stay outside the player navigation envelope and must not overwrite functional cells.

### Corridors

Corridors will use a restrained vaulted cross-section rather than a uniform seven-block square tube. Straight sections include structural rhythm through wall ribs and recessed lamps. Turns receive larger landing volumes so the route does not pinch or create blind collision corners.

Every corridor must satisfy these generated-block rules:

- At least three blocks of clear walking width.
- At least four blocks of clear headroom.
- No horizontal step larger than one block.
- No vertical step larger than one block.
- A player-sized flood fill can travel from the source room interior to the destination room interior.
- Decorative framing cannot write into the clear opening volume.

### Doorways

Doorways become explicit generation objects rather than an incidental corridor endpoint. Each doorway owns:

- A room-interior overlap volume.
- A wall-opening volume.
- A corridor overlap volume.
- A frame volume outside the clear opening.
- An optional gate plane used only for a real progression lock.

After rooms, corridors, and furnishings are generated, a final connectivity pass reasserts every clear opening. This makes later decoration unable to reseal a valid route.

### Descent

The surface descent uses a deterministic spiral or switchback stair with one-block rises, full headroom, guarded edges where practical, and lit landings. It supports both descent and return travel before the vault is cleared.

## True escape routes

The core chamber connects to two locked route entrances. Claiming the core removes both gate planes and begins the escape.

### Short route

The short route uses shifting masonry already taught by the Vault Mason. Floor receivers preview the cells that will move on the next echo. The route is faster but asks the player to read one final timed reconstruction sequence.

### Long route

The long route uses a stable stair and gallery climb. It is consistently lit and contains no mandatory precision jump. Its additional distance is the tradeoff for lower execution risk.

### Surface outlets

Each route ends at a separate small surface ruin within the vault generation footprint. Outlet elevation is calculated from terrain height at that outlet, not copied blindly from the central spire. The last stair segment reconciles the underground route with the actual surface elevation.

Escape completion requires all of the following:

- Escape has started.
- The player is inside the selected outlet threshold.
- The player's feet are at or above that outlet's surface floor.
- The outlet route is physically connected to the core chamber in generated blocks.

Entering an underground escape room is insufficient.

## Echo mechanics

### Core rule

An echo interaction has three stages:

1. **Pulse:** the player activates a receptive object with the Resonator or Pulse Bracer.
2. **Preview:** the object gives an immediate short response that identifies what will answer.
3. **Echo:** after a consistent delay, the world performs or repeats the indicated action.

Preview and echo use shape, timing, position, recorded sound, and restrained functional light. Color is supplementary and never the sole signal.

### Route echo

Pulsing a status stone or route receiver sends a delayed sequence through floor markers toward the current objective. It does not draw a floating waypoint or print coordinates.

### Pattern wing

The room demonstrates a four-symbol sequence through a preview pass, pauses, then gives the player an input window. Each correct input receives a brief local confirmation. A wrong input gives one short low response and restarts the demonstration without a prose message.

The room's physical glyph shapes match the pylon faces and floor inlays. Symbols remain readable without luminous color.

Objective:

`VAULT · Repeat the four-symbol echo 2/4`

### Crossing wing

Floor lanes preview their next solid state through an echo traveling across the room. The actual phase change follows after the established delay. Stable mosaic strips remain permanent checkpoints and use a different physical pattern from moving cells.

Objective:

`VAULT · Cross when the floor answers`

### Combat wing

Sentinels share an audible and visible link through a Conductor. A pulse interrupts that link and briefly exposes linked enemies. This keeps the Resonator useful without reproducing the Magnetic Warden's polarity or parry loop.

Hostile projectiles, if retained for ordinary Sentinels, use physical shard or compact energy forms and do not become the boss's primary damage loop. Their response is taught in the room through telegraph timing rather than paragraphs.

Objective:

`VAULT · Break the link, then defeat the sentinels`

### Hub echo

The central stone answers with one pulse per completed wing and sends the next route echo toward an unfinished wing. It does not replay instructions or report lore in chat.

### Vault Mason echo

The arena floor previews a proposed wall pattern. The Mason then builds it. Unless interrupted, the pattern echoes once as a delayed second movement. The player can learn the first movement and anticipate the echo.

Pulsing the Mason during the construction wind-up reverses the echo into its body, cancels the second movement, and exposes its core. This is the boss's primary tool interaction and is distinct from reflecting a projectile.

## Vault Mason encounter

### Identity

The Vault Mason is an ancient construction machine made from the same materials and structural language as the vault. It looks capable of moving the arena because its limbs, tools, and body are built for that purpose.

It is not a renamed Custodian and does not inherit the Warden's player-facing identity.

### Model

The Mason receives a dedicated articulated renderer and texture asset.

Model requirements:

- Approximately four blocks tall with a broad, asymmetrical construction silhouette.
- Separate torso, head, shoulders, upper arms, forearms, hands or tools, pelvis, thighs, shins, and feet.
- One heavy shaping arm and one bracing arm.
- A chest core that can physically open during vulnerability.
- Stone armor plates, weathered metal joints, dust-darkened recesses, and a restrained receptive seam.
- UV-mapped texture materials, not flat per-mesh colors.
- Shadows and lighting behavior consistent with other world entities.
- No wireframe bubble, generic orbiting octahedrons, neon torus, or unlit cyan body.

### Animation states

The renderer supports these explicit states:

- Idle weight shift.
- Walk cycle with heavy planted steps.
- Construction wind-up.
- Wall placement follow-through.
- Masonry throw wind-up and release.
- Wall charge.
- Pulse interruption.
- Exposed-core stagger.
- Armor shedding at phase changes.
- Recovery.
- Death collapse with a final settled pose before removal.

Animation state is driven by encounter state and timestamps, not inferred from DOM or arbitrary material flashes.

### Combat phases

#### Phase one: Measure

The Mason introduces one wall pattern at a time, throws physical masonry, and uses slow charges through openings. Construction previews last long enough for the player to understand the arena rule. Pulsing a wind-up exposes the core for a substantial damage window.

#### Phase two: Rebuild

The Mason uses two-stage patterns. The first movement creates cover and lanes; the delayed echo changes those lanes. Throws and charges use the new cover rather than ignoring it. Armor plates visibly detach as health decreases.

#### Phase three: Break

The exposed structure of the Mason becomes faster but less protected. Wall patterns are smaller and more frequent, with shorter previews that still respect the minimum readable window. The core remains vulnerable longer after a successful interrupt. The fight becomes more mobile without adding a generic frenzy tint or attack-speed-only phase.

### Attacks

- **Construct:** place a validated temporary wall pattern.
- **Echo construct:** repeat or invert part of the pattern after the echo delay.
- **Masonry throw:** launch a physical stone chunk on a readable arc.
- **Breach charge:** run through one of the Mason's own temporary wall segments, producing debris along that line.
- **Tool sweep:** a close-range arm attack with a clear animation and limited arc.

There is no polarity swap, shield-crystal bubble, slam shockwave ring, reflected boss bolt requirement, or Magnetic Warden sound reuse.

### Damage and vulnerability

The Mason takes reduced body damage while its chest is closed, not zero damage behind a generic shield. Successful pulse interruption opens the chest and increases damage to the core for a fixed window. Direct melee and ranged play remain possible, while mastery of the echo interrupt shortens the fight.

### Arena pattern safety

Arena changes are selected from deterministic validated patterns. A pattern may write only to an owned set of temporary cells.

Every pattern must guarantee:

- The entrance and core exits remain reachable.
- At least one route exists around or through every wall group.
- No block appears within the player's occupied volume.
- No block appears directly beneath an airborne player as an unavoidable trap.
- No torch or other permitted player light is overwritten.
- No permanent room shell or functional object is removed.
- Writes at chunk borders trigger neighbor remeshing and lighting reconciliation.

### Reset and persistence

Temporary Mason cells are not treated as permanent authored structure state. The runtime stores the original generated state for every owned cell and restores it:

- When the encounter ends.
- When the player dies.
- When the player leaves the active vault.
- When the runtime resets.
- When a vault is loaded with an unfinished Mason encounter.
- Before starting a new encounter in the same arena.

If a save captured temporary blocks, activation repairs them before spawning the boss. Completed-vault player edits are never overwritten because the encounter cannot restart after completion without an explicit debug-only development path.

## Lighting and edit policy

### Authored light

Every primary route must be navigable without a player torch. Lamps are integrated into alcoves, columns, doorway frames, stair landings, machinery, and route thresholds.

Lighting density requirements:

- No main corridor walk cell is more than eight horizontal blocks from an authored lamp.
- No major room objective is hidden in an unlit corner.
- Stairs have a lamp at every landing or equivalent interval.
- Both escape routes remain readable during the escape state.
- Functional light remains restrained and does not turn every surface into an emissive pattern.

Lighting must reconcile across chunk borders through the existing world lighting path.

### Palette

Base materials use dark slate, muted blue-gray stone, aged metal, and dust-dark recesses. Functional receptive surfaces retain a reduced teal or sea-glass highlight. Purple is removed from the general vault identity and reserved nowhere by default.

Biome blocks can retain a limited luminous accent. UI, enemy bodies, corridor walls, and decorative masonry do not receive neon styling.

### Torch placement

The sealed-vault edit policy becomes action-aware.

- Breaking authored structure remains blocked until escape completion.
- Placing ordinary blocks remains blocked until escape completion.
- Placing `BlockType.TORCH` into a valid empty placement cell is allowed before completion.
- A torch cannot replace a structure block, mechanism, seal, temporary Mason cell, or occupied player volume.
- Normal placement collision, inventory consumption, lighting, remeshing, and persistence behavior still apply.

After escape completion, the existing full-edit permission remains unchanged.

## UI and copy

### Objective HUD

The objective HUD is a compact top-center line rendered alongside existing gameplay UI.

Visual requirements:

- Existing Atlas pixel font and text-shadow treatment.
- Neutral black or dark-gray translucent backing.
- White primary text and muted gray secondary progress.
- Existing square or lightly rounded geometry.
- No gradient, neon border, cyan glow, holographic panel, animated scanline, or oversized quest card.
- Hidden outside an active vault objective.
- Hidden when broader gameplay UI is intentionally hidden.

The HUD reads runtime snapshot data through a normal subscription. It does not scrape DOM or texture slots.

### Objective set

Objectives use one line:

- `VAULT · Craft a Resonator: shard, copper, amethyst, stick`
- `VAULT · Enter the ruin`
- `VAULT · Open the wing seals 1/3`
- `VAULT · Repeat the four-symbol echo 2/4`
- `VAULT · Cross when the floor answers`
- `VAULT · Break the link, then defeat the sentinels`
- `VAULT · The inner seal is open`
- `VAULT · Interrupt the Mason while it builds`
- `VAULT · Use the Resonator on the core`
- `ESCAPE · Reach the surface 01:12`

### Feedback

Moment-to-moment feedback comes from animation, world state, sound, and short objective progress changes. Chat remains available for system errors, but the vault does not dump room instructions or lore into it.

### Removed player-facing systems

- `/vault guide` is removed.
- Solve, reset, teleport, boss-spawn, core-claim, and escape debug commands are removed from player autocomplete and normal command execution.
- `Chat` no longer imports Resonant Vault command code.
- Resonant-specific DOM queries and injected hotbar elements are removed.
- Tooltips are reduced to a short control, crafting role, or concrete use.

## Texture and effect direction

### Block textures

The generic shared pattern generator is replaced or substantially narrowed so each important block has an authored 16-by-16 identity.

- Masonry shows joints, wear, chips, and material depth.
- Chiseled blocks carry the same glyph language used by puzzles.
- Moving blocks have readable edges and a restrained receptive inset.
- Lamps look like fixtures embedded in stone or metal.
- Seals look physically distinct from ordinary walls even when unlit.
- Items have recognizable silhouettes at hotbar size.

Functional highlights occupy a minority of each texture. Large full-tile luminous crosses and generic circuit grids are removed.

### Effects

Effects use dust, chips, sparks from metal contact, subtle receptive light, and physical debris. Unlit mesh-basic neon spheres and wireframes are removed from the vault experience.

## Audio and music

### Asset requirement

Every Resonant Vault sound effect and music track introduced by the current branch will be replaced. The MIDI files, procedural audio renderer, generated synthesis reports, and synthesized Ogg outputs are removed.

Replacement assets must be:

- Recorded acoustic, Foley, environmental, vocal, or genuinely performed instrumental material.
- Licensed for redistribution in Atlas.
- Documented with source, author, license, and any required attribution.
- Stored as production Ogg/Vorbis assets with editable source provenance where available.
- Free of generated oscillator fallback in the vault experience.

Resonant sound manifest entries explicitly disable synthesis fallback. If an asset fails to load, the event remains silent and reports a diagnostic rather than generating a placeholder tone.

### Sound identity

The vault uses stone resonance, restrained metal, air movement, room reflections, and physical machinery. It avoids generic science-fiction chirps and constant tonal beeps.

Required recorded cue families include:

- Surface discovery and route response.
- Resonator pulse at multiple intensities.
- Correct, incorrect, and completed receptive mechanisms.
- Moving phase floor and heavy seal movement.
- Sentinel movement, link state, attacks, damage, and death.
- Vault Mason idle movement, footsteps, joint strain, construction, wall movement, masonry throw, charge, tool sweep, interrupt, core exposure, damage, phase shedding, and death.
- Core opening and claim.
- Escape gate opening, route movement, warnings, and surface completion.

Positional sounds use world positions for machinery, enemies, projectiles, and moving walls.

### Music quality bar

The music must feel authored as one expedition rather than four unrelated tracks. A short motif or interval can recur across exploration, combat, Mason, and escape, but the arrangements must evolve rather than simply changing tempo.

Music direction:

- **Approach and descent:** sparse performed texture with room for environmental sound.
- **Vault interior:** patient tension, low repetition fatigue, and a recognizable restrained motif.
- **Wing combat:** stronger pulse and percussion without becoming generic trailer music.
- **Vault Mason:** weight, construction rhythm, and evolving form that follows the three encounter phases.
- **Escape:** the same motif under forward motion, not a disconnected alarm track.

The score is produced as an original FL Studio project using the user's licensed instruments and effects, with sample-based or physically performed sources carrying the audible identity. Deliberate synthetic layers are permitted as restrained production elements, but neither music nor effects may read as oscillator/noise placeholders. The branch's Python renderer, loose MIDI exports, generated noise instruments, and synthesized fallback cues are removed. Source project files, plugin/version notes, and redistribution provenance are retained without committing proprietary sample libraries.

Mix and delivery requirements:

- 48 kHz stereo Ogg/Vorbis.
- Integrated music loudness targeted consistently around -18 to -16 LUFS, adjusted by listening against existing Atlas music.
- True peak at or below -1 dBTP.
- No clipped transients or audible codec damage.
- Environmental and gameplay cues remain intelligible over the score.
- Long tracks include intentional intros, bodies, and tails suitable for state transitions.
- Repeated exploration playback avoids a short obvious loop.

Automated loudness and decode checks supplement, but do not replace, listening review in the game.

### Transition continuity

Resonant contexts use the existing dual music decks as a true overlap crossfade:

- The incoming track begins while the outgoing track is still audible.
- Both gains are automated over the same transition window.
- The outgoing deck is paused and reset only after its gain reaches silence.
- Boss and escape transitions use a shorter but still audible overlap.
- Leaving the vault uses a longer release into world music.
- Boss defeat preserves the end impact and reverb tail before or during the next musical entry.

One-shot cues are not stopped when room, phase, or context state changes. Re-trigger limits prevent spam without terminating an already playing source. Sounds with meaningful tails have enough encoded tail time to decay naturally.

No accepted cue may end with a discontinuity, truncated transient, or hard zero before its intended decay.

## Runtime and code boundaries

### Geometry and generation

`src/systems/world/resonantVaults.ts` remains the deterministic source for layout, rooms, routes, doorway geometry, echo timing, and surface outlet descriptors.

`src/systems/world/resonantVaultGeneration.ts` remains the chunk-local writer for rooms, corridors, doorways, furnishings, light fixtures, escape shafts, and generated structure state.

The base generator facade remains intact. The overhaul does not move general terrain generation into the vault modules.

### Vault runtime

`src/systems/world/ResonantVaultRuntime.ts` owns active layout resolution, objective snapshot state, wing mechanics, gate state, torch edit decisions, core claim, and real surface escape completion.

Objective selection is extracted into a pure function so it can be tested independently of rendering.

### Mason encounter

The Mason receives a focused encounter-state module rather than adding more Warden fields to the generic entity behavior. Generic entity movement and damage can be reused, but wall-pattern scheduling, masonry projectiles, vulnerability, animations, and arena repair remain Mason-owned.

### Rendering

A dedicated Mason renderer owns the model hierarchy, texture material, animation interpolation, physical projectiles, construction previews, and debris. The existing generic entity box is not rendered for the Mason.

Ordinary Sentinel presentation is also revised to avoid neon primitive overlays, but it remains smaller in scope than the Mason renderer.

### UI

A focused vault objective component subscribes to the runtime snapshot and renders beside existing HUD components. `App.tsx` receives only the smallest import and render-site addition needed to mount it.

### Audio

The vault audio director continues mapping typed gameplay events to sound IDs. Event names and payloads are updated from Custodian terminology to Mason terminology. Music context selection remains in `MusicController`, while deck-level overlap remains in `SoundManager`.

## Save compatibility

Existing progression data remains readable without migration. Existing fields keep their serialized names when renaming would invalidate saves. A previous `custodianDefeated` field may remain as the compatibility storage field while new code presents and documents it as Mason defeat.

Rules:

- Old worlds without Resonant progression load unchanged.
- Existing discovered vaults remain discovered.
- Completed wings remain completed.
- A recorded Custodian defeat counts as a Mason defeat for compatibility.
- Existing core and escape completion remain valid.
- Existing generated chunks are not destructively regenerated automatically.
- Temporary Mason arena blocks are repaired when the active vault runtime resolves an unfinished encounter.
- New surface outlets are generated only where the outlet chunks have not already been persisted. Experimental vault chunks created on this unmerged branch are not bulk rewritten; their progression remains readable, but testing the overhauled architecture requires generating a fresh vault.

Because old generated vault chunks may contain the current MVP geometry, validation and release notes must state that the full architectural overhaul is guaranteed for newly generated vaults. Runtime-critical fixes such as objective behavior, torch permission, boss identity, and audio apply regardless of generation age where their required cells exist.

## Testing strategy

### Geometry tests

Tests generate actual block data, not only route points.

- Every graph edge has an open player-sized threshold.
- A flood fill connects the interior navigation anchors of every intended room.
- All four orientations pass.
- Vertical routes never exceed one-block step changes.
- The surface descent is traversable in both directions.
- Both escape routes connect the core chamber to their surface outlet.
- The locked inner seal and escape gates are the only intentional blockers.
- Final doorway carving remains valid after furnishings.
- Corridors do not cut through unrelated rooms.
- Outlet heights match terrain samples at outlet positions.

### Lighting tests

- Authored lamp placement satisfies maximum route spacing.
- Every objective anchor has a nearby light source.
- Cross-chunk structure light is reconciled through the normal lighting path.
- Removing and restoring Mason walls updates affected lighting.

### Edit-policy tests

- Mining vault masonry before escape is denied.
- Placing ordinary blocks before escape is denied.
- Placing a torch in a valid empty cell is allowed.
- Replacing a structure block with a torch is denied.
- Torch placement still consumes inventory and triggers lighting, remesh, and persistence.
- Full edit permission returns after escape.

### Echo tests

- Preview always precedes echo action.
- Route echoes select a valid unfinished objective.
- Pattern progress and reset behavior are deterministic.
- Crossing preview and solid-state timing stay aligned.
- Mason construction echo can be interrupted only during its telegraphed window.

### Mason tests

- No Mason definition uses Warden polarity, shield-crystal, slam, or magnetic-field behavior.
- Each arena pattern preserves the entrance and at least one navigation path.
- Patterns never overwrite protected cells or torches.
- Player occupancy prevents unsafe writes.
- Interrupting construction opens the core vulnerability window.
- Mason projectiles use their own state and renderer.
- Reset restores every temporary cell.
- Loading an unfinished encounter repairs saved temporary blocks.
- Defeat persists through the compatibility progression field.

### UI and copy tests

- Objective selection covers discovery, hub progress, each wing, inner route, Mason, core, and escape.
- Only one objective line is rendered.
- Vault guidance no longer writes room instruction paragraphs to chat.
- `/vault guide` and player-facing debug commands are absent.
- `Chat` has no Resonant Vault import.
- No Resonant UI class uses glow, gradient, neon border, or holographic styling.
- Hotbar cooldown state uses React data, not DOM queries or injected elements.

### Visual tests

- The Mason uses the dedicated model renderer and texture asset.
- Animation states transition without snapping.
- The core opening is visible from normal combat distance.
- Functional highlights are readable but limited.
- Rooms, stairs, arena, and exits are readable at normal brightness settings.
- Browser and Electron screenshots are reviewed at gameplay resolution.

### Audio tests

- Every vault event resolves to a real file.
- Vault events explicitly disable synthesis fallback.
- No Resonant manifest entry references the removed generated assets.
- All Ogg files decode through FFprobe and browser Web Audio.
- Music files satisfy sample rate, channel, loudness, and true-peak requirements.
- One-shots retain nonzero encoded tail time after the last major transient.
- Music context tests confirm overlapping deck gains and delayed deck reset.
- Leaving a room or changing a phase does not stop active one-shots.
- Listening review checks musical quality, mix balance, repetition, transitions, and audible cutoff behavior in browser and Electron.

### Repository validation

- Relevant Node tests pass.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run build` passes.
- The production bundle starts in a browser.
- Electron starts without renderer or audio errors.
- A fresh world can discover, enter, complete, fight, claim, and escape a vault.
- A saved world can resume or repair an unfinished encounter without corrupting chunks.

## Production acceptance checklist

The overhaul is not complete unless all of the following are true:

- No intended room is sealed by an ordinary wall.
- The player can physically return to the surface through either escape route.
- The objective HUD contains no neon styling and never becomes a prose panel.
- Environmental cues remain sufficient to complete the structure without `/vault guide`.
- The Vault Mason has a dedicated textured model and complete combat animation set.
- The Vault Mason has no player-facing Magnetic Warden mechanics or sounds.
- Arena reconstruction is safe, reversible, remeshed, relit, and repaired after load.
- The structure is adequately lit before the player places a torch.
- Torches can be placed safely inside a sealed vault.
- Biome block glow is restrained and functional.
- Every Resonant music and sound asset is recorded or genuinely performed with documented provenance.
- No Resonant event can synthesize a fallback cue.
- No accepted sound or music transition cuts off abruptly.
- New and existing progression saves remain readable.
- Automated validation and in-game browser and Electron review pass.
