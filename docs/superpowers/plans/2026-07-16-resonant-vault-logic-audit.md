# Resonant Vault Logic Audit — 2026-07-16

## Status

Applied on `claude/resident-vault-audit-fixes-d85jww`, based on `a3b24f9`
(the verified score redeploy). The earlier wave-spawn patches and the
patch-file apply machinery that followed that commit were rolled back and
replaced by the root-cause fixes below.

## Scope

A full-repository audit of the Resonant Vault experience: encounter flow,
generation/preflight consistency, progression persistence, escape sequence,
loot economy, music state, and the renderer defects that shipped with the
vault content (cutout blocks, held items, slab adjacency).

---

## 1. Encounter waves stalled after the first combat room (root cause)

Reported symptom: the first combat room plays all of its waves; in a later
room the first wave spawns and the next wave never arrives, and after that no
other combat room in the vault starts.

Root cause chain (`ResonantEncounterDirector`):

1. When an encounter starts, the room's doorways are sealed with
   `VAULT_SEAL` — which the navigation system classifies as a **hazard**.
2. Waves after the first preferred the doorway "entry anchors". Those anchors
   sit one cell inside the room, flush against the sealed plane.
3. Navigation footprints are block-quantized: a vault guard (0.92 wide)
   occupies one column, but a bell hound (1.08) or tollkeeper (1.82) spans
   3×3 columns — overlapping the sealed doorway plane, so anchor resolution
   fails for them.
4. Wave spawning was all-or-nothing against **fixed** anchors
   (`(index + waveIndex) % anchors.length`): one failed resolution despawned
   the whole wave and retried the same deterministic anchors every 0.5 s,
   forever.
5. The stuck room held the vault's one-active-room lock
   (`activeRoomByVault`), so every later combat room silently refused to
   start.

`guard_hall` (the usual first combat room) only survived because its waves
are all vault guards — the single kind whose footprint misses the seal.

### Fixes

- `resonantEncounterSpawn.ts`: per-enemy spawn resolution that falls back
  across every anchor (entry first, then recovery), preferring unused cells
  and then shared ones.
- Partial waves spawn instead of aborting when one enemy has nowhere to
  stand; a wave that cannot spawn anything is retried on a bounded budget
  (~8 s) and then skipped so the room — and the vault — can never deadlock.
- A per-tick reap removes entities that vanished without an `entity:died`
  event (unload, external despawn) so a wave can never wait on a ghost,
  matching the design contract "must recover if entities unload or are
  removed unexpectedly".
- Recovery-anchor resolution falls back from tollkeeper-sized to guard-sized
  cells, and a room now starts with any standable anchor instead of silently
  requiring four tollkeeper-sized corners (which blocked the hub seal for the
  whole vault in cluttered rooms).

Coverage: `resonantEncounterSpawn.test.mjs`.

---

## 2. Generation / runtime consistency

- The runtime activated any nearby grid candidate, including ones preflight
  rejected (ocean/Magnetic Fields spires, persisted-chunk conflicts). A
  rejected candidate has no structure, so vault logic ran against bare
  terrain — sealing natural caves, spawning encounters in the open world,
  marking discovery. The runtime now requires a preflight-**accepted**
  candidate and requests preflight when the answer is unknown.
- The runtime activation radius (260) did not cover the reserved square's
  corners (256·√2 ≈ 362): standing at a surface outlet near a corner
  unloaded the expedition mid-escape (enemies despawned, gates reopened).
  Replaced with `RESONANT_VAULT_RUNTIME_RADIUS` covering the full square.
- Synchronous spawn-chunk generation (`ensureChunk`) generated vault slices
  for candidates whose preflight never ran. It now suppresses undecided
  candidates for the session, and preflight can no longer persist a
  reservation for a suppressed candidate — preventing torn structures in
  later sessions.
- `/locate vault` and the surface Listening Stone locator only report
  accepted candidates, so they never point at coordinates where no vault
  will generate.

## 3. Progression, escape, and loot

- Saved vault progress is normalized on load through the stage implication
  chain (escapeCompleted ⇒ escapeStarted ⇒ coreClaimed ⇒ titanDefeated ⇒
  discovered), healing partial or hand-edited saves that stranded a vault.
- With several vaults mid-escape, death recovery now selects the checkpoint
  nearest the player instead of map-iteration order.
- The core cache stays sealed until the core is claimed (the unique
  first-clear reward cannot be lifted before the fight), and the claimed
  Echo Core + dust are delivered through the cache instead of free drops —
  no double payout, and dying mid-escape cannot scatter the reward.
  Repeat clears now pay out (Echo Core + dust) instead of supplies only.
- The entrance is sealed while the escape runs and reopens on completion, so
  the finale cannot be skipped by backtracking out the front door; both
  ascent routes stay open throughout, so the player is never trapped.
- Phase-lane block writes are re-derived when their delayed echo preview
  resolves, so the placed blocks always match the schedule players read.

## 4. Presentation state

- Vault music contexts (combat, Bell Titan, escape) survive death: their
  events fire once per encounter, so clearing them on death silenced the
  authored score after respawn. Death music still outranks them while it
  plays. The runtime also emits `vault:left` on world teardown so listeners
  always hear the expedition end.
- Echo preview visuals are cleared when leaving a vault; enemy death-flash
  timers no longer leak.

## 5. Renderer defects shipped with the vault content

- **Cutouts rendered as black-patched cubes.** Echo Crystal and Echo Spikes
  have transparent-background tiles but were missing from the mesher's
  cutout/cross tables, so they meshed into the solid buffer whose material
  has no alpha test. The cross/sprite classification now lives in one shared
  list (`src/data/spriteBlocks.ts`) consumed by the mesher and by the
  held-item, drop, and particle renderers — the four previously diverging
  hardcoded copies are gone, which also fixes cross blocks rendering as
  miniature cubes in hand and as drops.
- **Slab x-ray holes.** A slab or stair neighbour covers at most part of a
  shared face, but transparent-flagged full blocks (phase blocks, machinery)
  and fluids culled their face against any non-air neighbour — placing a
  slab next to them opened a hole straight through the world. Shaped
  neighbours can no longer seal any face.

Coverage: `meshRenderClassification.test.mjs`.

---

## 6. Abandoned content removed (follow-up pass)

- **Prototype Echo Sentinel family** (`echo_sentinel`, `shielded_echo_sentinel`,
  `conductor_sentinel`): registered entity kinds that nothing has spawned since
  the definitive overhaul replaced them with the vault guard / marksman /
  bell hound / tollkeeper roster. Removed together with their support layer:
  conductor link rules and pulse-interrupt helpers in
  `resonantMachineryRules.ts`, the always-empty `getLinks()` stub and
  `SentinelLinkRenderState` in the encounter director, the dead sentinel-link
  mesh pool in `ResonantEffectsRenderer`, and the never-emitted
  `vault:sentinel-*` events. The `vault.sentinel_spawn` audio cue stays — it is
  still played as the legacy combat-start fallback.
- **`slime`** and **`cinder_warden`**: leftover prototype mobs with no spawner;
  the Cinder boss was abandoned when Volcanic Crags stopped being a sealed
  region (see the note in `regions.ts`, which stays as history).
- **`TutorialOverlay.tsx`** (Feature Editor): orphaned component, imported
  nowhere.
- **`RESONANCE_DOOR`** (block ID 77): the planned multi-block door mechanism
  was never implemented — `VAULT_SEAL` gates ended up owning every doorway —
  so placing it did nothing. Removed entirely (definition, texture slot 244,
  catalog entry, guide copy); the ID stays retired rather than reassigned.
  Confirmed safe because these are internal builds with no external worlds.
- A full scan of every block/item ID found no other definition without a
  gameplay, generation, recipe, or loot role. The registry catalogs
  (`worldBlockCatalog` / `itemCatalog` / `contentCatalog`) are consumed only by
  contract tests but are intentional ID-governance boundaries, not dead code.

## Validation

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `node --test` — 525 passing; the two remaining failures are the Ogg decode
  assertions in `resonantVaultAudio.test.mjs`, which require `ffmpeg` and
  fail in any environment without it (pre-existing, unrelated to this audit).
- `npm run build` — passes.
- Not play-tested in this pass; the combat-room fix and the escape/entrance
  seal changes are the highest-value candidates for the next play session.
