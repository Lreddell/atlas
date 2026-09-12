# Engine and content platform overhaul

Status: PAUSED at user request on 2026-09-12. Requirements: [complete brief](engine-content-platform-brief.md).

## Paused checkpoint and branch isolation

This is an unfinished recovery checkpoint, not a validated implementation milestone. Work stopped during the voxel/storage migration: identity imports and runtime integrations are incomplete. Do not use this branch for gameplay or open existing player saves until implementation resumes and compatibility checks pass.

The original checkout was switched from `codex/engine-content-platform` back to `magnetic-boss-reworks` while edits were uncommitted. Both branch tips remained `09df763`; uncommitted changes followed the shared working directory. The unfinished overhaul is now being committed only to its own branch and isolated in `C:/Users/Logan/VisualStudioCode/atlas-engine-content-platform`. The original checkout remains on `magnetic-boss-reworks`, preserving the user's pre-existing local music changes. Resume only when the user requests it, and work in the isolated overhaul directory.

## Baseline and boundaries

Branch `codex/engine-content-platform` starts at `09df763` on `magnetic-boss-reworks`, 27 commits ahead of current `origin/main` with no main-only commits. Existing uncommitted music changes belong to the user and are excluded from milestone commits. No merge or force push is authorized.

Before architecture changes: typecheck PASS; lint PASS; all 703 Node tests PASS (18.054 seconds); browser build PASS (12.63 seconds); Windows NSIS Electron packaging PASS. Raw logs are in ignored `output/overhaul/baseline/`. Existing build notices: large main bundle, missing package author, duplicate dependency references and Node module-type warnings. They are not test failures.

## Current architecture findings

- 253 TypeScript/TSX files; 56 reference `BlockType`, with 2,831 qualified references. Manual numeric IDs occupy a byte namespace shared by blocks and items.
- World columns contain 98,304 cells, with byte arrays for blocks, light and metadata. Worker mesh requests clone full neighboring columns. Indexed geometry and scratch pooling already exist.
- `App` and `WorldManager` coordinate most runtime state. The live worker is `world.worker.ts`; older split-worker descriptions are obsolete.
- Disk uses IndexedDB, OPFS and Electron ACR backends; exports v1/v2 exist but world schema identity is implicit. Container contents and pending crafting grids are missing from saved world data. Failed chunk reads can regenerate terrain; failed writes can be swallowed.
- Warden and Titan already have deterministic cores. Reuse their existing specialized behavior through narrower entity/encounter contracts.
- Regions are a single biome lookup table. There is no public package compiler or region composition API.
- Tests include meaningful deterministic simulations and many source-text checks. Simulated Vault journeys are not browser gameplay evidence.
- Historical High Reach measurements describe another branch and are not this baseline. No complete canonical Bible was found.

## Target architecture

Public `src/engine` APIs define stable content identity, compilation, generation, capability composition, encounter timelines, structures, progression, persistence contracts and developer inspection. `src/game` contains typed content packages and canonical examples. Existing runtime systems adopt generated registries through explicit adapters during incremental migration. Architecture checks enforce public entry points and keep legacy numeric allocation frozen.

## Invariants

Player data takes precedence over elegance. Unknown identities and corrupt saves fail actionably without overwriting the source. Historical numbers retain meaning. Existing controls, boss timing, terrain seeds and visual identity remain unchanged. Voxel, light and metadata representations are separate decisions. Synthetic content stays development-only. Build/test success is not a substitute for actual browser/desktop evidence.

## Migration checklist

- [x] Create branch from requested current HEAD; inspect main ancestry.
- [x] Read full brief, route skills, audit seven domains in parallel.
- [x] Capture complete static/test/browser-build/desktop-package baseline.
- [x] Replace 757-line ignore list with directory rules; track durable agent guidance.
- [ ] Capture deterministic world fixtures, representation and runtime benchmarks.
- [ ] Stable typed content definitions/compiler and automatic runtime IDs.
- [ ] Uint16 hot voxel storage with stable palette persistence and named migrations.
- [ ] Worker boundary snapshots, telemetry and explicit streaming policies.
- [ ] Entity/encounter/structure/progression APIs adopted by current content.
- [ ] Region SDK, content asset/audio registration and development-only playable proof.
- [ ] Runtime inspection, named scenes, CLI and browser journeys.
- [ ] Architecture checks, generated indexes, authoring skills and canonical spec map.
- [ ] Independent reviews of compatibility, architecture, performance and real gameplay.
- [ ] Resolve findings, rerun affected checks, record post-change measurements, commit and push.

## Decisions and rationale

Use incremental parallel changes with ownership by subsystem. Preserve boss state machines rather than replacing them with a uniform DSL. Compare Uint16, local palette and packed lookup/serialization cost before selecting hot storage. Keep backend disk transport opaque to content identity to avoid duplicated Electron registries. Retain compatibility adapters only where real clients still depend on them, and document their exit criteria.

## Evidence, known problems and deferred work

Baseline runtime screenshots and gameplay journeys are still pending. The `gh` executable is absent; Git fetch/push work and a GitHub connector is available. No missing canonical game design will be invented. Further results and any unresolved blockers must be recorded here before completion.
