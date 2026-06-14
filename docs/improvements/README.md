# Atlas Improvement Roadmap

This directory turns the follow-up findings in `docs/clauderesp.md` into
implementation-ready work. The audit is useful historical context, but several of
its render-distance recommendations have already been completed in the current
codebase.

## Current Baseline

The following work from the original audit is already present:

- a two-to-four-worker world generation and meshing pool
- dark-face culling for distant chunks, with full remeshing on approach
- shared chunk materials outside active fades
- one global chunk fade ticker
- frozen transforms for static chunk meshes
- voxel DDA block targeting instead of whole-scene raycasting
- direct wrapping of transferred geometry buffers
- plant growth restricted to chunks near the player

These completed items should be preserved and covered by regression tests rather
than reimplemented.

## Recommended Order

| Order | Workstream                                                     | Priority | Primary outcome                                              |
| ----- | -------------------------------------------------------------- | -------- | ------------------------------------------------------------ |
| 1     | [Save Integrity](01-save-integrity.md)                         | Critical | Failed persistence cannot silently lose dirty chunk state    |
| 2     | [Tests and CI](02-tests-and-ci.md)                             | High     | Core systems receive repeatable regression coverage          |
| 3     | [Crafting Shape Matching](07-crafting-shape-matching.md)       | High     | Recipe matching preserves two-dimensional shape              |
| 4     | [Real Greedy Meshing](03-real-greedy-meshing.md)               | High     | Compatible faces collapse into substantially fewer quads     |
| 5     | [Worker Payload Caching](04-worker-payload-caching.md)         | High     | Meshing no longer repeatedly clones full chunk neighborhoods |
| 6     | [App Decomposition](05-app-decomposition.md)                   | Medium   | Root React orchestration becomes smaller and more isolated   |
| 7     | [Entity and Combat Foundation](06-entity-combat-foundation.md) | Medium   | Future mobs and bosses build on a stable simulation layer    |
| 8     | [Documentation and Licensing](08-documentation-licensing.md)   | Medium   | Repository instructions and legal files match reality        |

The ordering is risk-based. Persistence correctness and regression coverage come
before performance and architecture work. The entity system is strategically
important, but it should begin after the surrounding systems are easier to test.

## Shared Definition of Done

Every workstream should:

- keep existing world saves compatible unless a migration is explicitly designed
- pass `npm run check`
- pass `npm run build`
- add or update automated tests for changed behavior
- document any new storage, worker-message, or rendering contract
- include a focused manual smoke test when behavior is visible only in the game
- avoid unrelated formatting or refactoring

## Measurement Baseline

Performance work should record a before-and-after capture using the same:

- world seed
- player position
- render distance
- graphics settings
- browser or Electron runtime
- viewport size
- warm-up duration

At minimum, record frame time, generated vertex/index counts, mesh job payload
bytes, mesh completion time, and JavaScript heap usage. A faster result that
changes lighting, textures, block targeting, or save behavior is not acceptable.

## Document Status

These files describe proposed work. They should be updated as implementation
lands:

- `Proposed`: no implementation has started
- `In progress`: code is being changed
- `Implemented`: acceptance criteria pass
- `Superseded`: another design replaced the proposal

When a workstream is completed, add its implementing commit and completion date
to that document.
