# Atlas Project Analysis (Updated)

## Summary

Atlas is a React + TypeScript voxel sandbox with a Web Worker-driven world pipeline and optional Electron packaging.
The current architecture is functional and feature-rich, with the highest-value next work concentrated on performance and maintainability.

## Current Architecture

- `App.tsx` controls top-level game/app state and screen flow.
- `systems/WorldManager.ts` is the world orchestration core (chunk requests, meshing jobs, subscriptions, cache/eviction logic).
- `systems/world/workers/world.worker.ts` handles generation and meshing away from the main thread.
- `systems/world/WorldStorage.ts` provides world and chunk persistence.
- `components/*` and `components/ui/*` render world, HUD, menus, and interaction surfaces.

## Confirmed Working Areas

- Worker-based generation/meshing pipeline is implemented.
- Player movement/collision and interaction loops are in place.
- Inventory/crafting and block interaction surfaces are present.
- Persistence is implemented (world/chunk storage), and the app no longer appears persistence-missing.

## Primary Risks / Debt

1. `systems/WorldManager.ts` remains large and multi-responsibility.
2. Meshing still appears primarily culling-based (limited greedy-style optimization).
3. Documentation previously drifted from runtime reality (now partially corrected).
4. Legacy worker artifacts (`gen.worker.ts`, `mesh.worker.ts`) can create confusion if no longer active.

## Recommended Implementation Order

1. **Stability Baseline**
   - Keep typecheck/lint/format gates passing.
   - Ensure browser and Electron runtime parity.

2. **Performance Track**
   - Instrument chunk pipeline timings (request → generate → mesh → upload).
   - Optimize meshing hotspots and chunk update paths.
   - Reduce avoidable chunk churn around render-distance boundaries.

3. **Architecture Track**
   - Split `WorldManager` responsibilities into smaller modules (streaming, worker transport, persistence sync).
   - Clarify and consolidate worker strategy.

4. **Documentation Track**
   - Keep `README.md`, `plan.md`, and `BACKLOG.md` synchronized with what is actually shipped.

## Near-Term Success Criteria

- `npm run check` passes locally.
- No ambiguity in runtime dependency source.
- Measurable frame-time/chunk processing improvements in stress scenarios.
- Reduced cognitive load in world orchestration code.