# Resonant Vault Progression Restart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Resonant Vault progression and presentation overhaul on PR 4 commit `2a87322`.

**Architecture:** Keep the new randomized room pool and make challenge metadata authoritative. Reposition the graph into side circuits around a centered boss axis; connect runtime, confirmation UI, and a dedicated Bell Titan cinematic through typed events; keep weighted loot and crossfade math in pure tested helpers.

**Tech Stack:** TypeScript, React, Three.js/react-three-fiber, Web Audio API, Node test runner, esbuild.

## Global Constraints

- Only generated challenge rooms gate the boss; archives and annexes are optional.
- The sole permanent inner seal is the hub-to-antechamber boss threshold.
- Do not add migration logic.
- Preserve latest-branch room randomization and mechanism previews.
- Do not manually playtest.

### Task 1: Topology and challenge authority

**Files:** `resonantVaultRooms.ts`, `resonantVaults.ts`, `resonantVaultProgression.ts`, their room/progression/connectivity tests, and dependent cache placement.

- [ ] Add failing tests for dynamic challenge sets, full pre-seal reachability, two side circuits, centered boss axis, and one hub-to-antechamber seal.
- [ ] Reposition rooms and exits, update edges and route policies, export one challenge classifier, and use it everywhere.
- [ ] Run focused topology, geometry, connectivity, progression, and cache tests.

### Task 2: Puzzle feedback and judgment pit

**Files:** `resonantVaultPuzzles.ts`, `resonantVaultGeneration.ts`, `resonantVaultArchitecture.ts`, `ResonantVaultRuntime.ts`, `ResonantEncounterDirector.ts`, objectives/audio/event manifests, and focused tests.

- [ ] Add failing tests for persistent memory/relay/counterweight feedback and a sealed, supported crossing pit with a recoverable combat staircase.
- [ ] Implement feedback events and authored cues without explanatory tutorial prose.
- [ ] Replace crossing teleport recovery with fall damage, a lower encounter, combat music, completion, and unlocked return stairs.

### Task 3: Boss confirmation and cinematic

**Files:** new `bellTitanCinematic.ts` and `BellTitanCinematic.tsx`; `BossConfirmModal.tsx`, `CinematicOverlay.tsx`, `GameEvents.ts`, `App.tsx`, runtime/controller tests.

- [ ] Add failing tests proving arena entry cannot spawn the Titan and confirmation can trigger one spawn only after all challenges.
- [ ] Generalize modal copy while preserving Magnetic Warden behavior.
- [ ] Implement the unique Bell Titan camera/light/chain/dust/toll sequence with safe cancellation and correct control return.

### Task 4: Loot and music

**Files:** `resonantVaultLoot.ts`, a new pure `musicCrossfade.ts`, `SoundManager.ts`, and focused tests.

- [ ] Add failing deterministic diversity and cache-category tests, then implement weighted tables with existing unique guarantees.
- [ ] Add failing constant-sum curve tests, then use constant-sum only for self-loop seams and equal-power for different-cue transitions.
- [ ] Verify scheduled voices cannot accumulate across loop, pause, resume, or state transition.

### Task 5: Integration and delivery

- [ ] Run all focused vault/audio tests.
- [ ] Run `npm run typecheck` and `npm run build`.
- [ ] Inspect `git diff --check`, commit the cohesive implementation, and push the active branch to update PR 4.
