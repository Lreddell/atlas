# Automated Tests and Continuous Integration

Status: Proposed  
Priority: High

## Problem

The repository has type checking, linting, and production builds, but no automated
behavioral tests and no GitHub Actions workflow. Core systems such as storage,
lighting, recipes, ray traversal, world generation, and worker protocols can
regress while all existing checks remain green.

## Goals

- Add a fast unit-test command suitable for local work and pull requests.
- Cover deterministic, high-risk systems before broad UI snapshot testing.
- Run checks on supported Node versions in GitHub Actions.
- Keep browser and Electron smoke testing available without making every unit-test
  run expensive.

## Proposed Tooling

Use Vitest because the project already uses Vite and TypeScript. Add:

- `vitest`
- `@vitest/coverage-v8`
- `fake-indexeddb` for persistence tests
- `jsdom` only for tests that require DOM APIs

Prefer the default Node environment for pure systems. Opt individual test files
into `jsdom` rather than running the whole suite in a browser-like environment.

## Script Changes

Add scripts similar to:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "ci": "npm run check && npm run test && npm run build"
}
```

Keep `npm run check` focused on static analysis unless changing its meaning is
intentional and documented.

## Initial Test Matrix

### Persistence

- successful and failed batch saves
- dirty revision behavior during concurrent edits
- world metadata import validation
- chunk-key isolation between worlds

### Crafting

- translated recipes match anywhere in the crafting grid
- horizontal and vertical shapes remain distinct
- mirrored recipes match only when declared or allowed
- empty and malformed grids return no result

### Voxel raycasting

- all six axis directions
- diagonal traversal and boundary ties
- unloaded chunks are passed through
- maximum reach is respected
- starting inside a solid block follows the documented rule

### World generation

- same seed and coordinates produce identical chunk, light, and metadata arrays
- representative biome and feature fixtures remain stable
- neighboring chunks agree at borders

Avoid enormous golden files. Store hashes or targeted assertions unless a complete
fixture is needed to explain a regression.

### Lighting and fluids

- skylight propagation through cave openings
- block-light removal and repropagation
- source fluids remain sources
- flowing fluids recede after source removal

### Worker contracts

- stale tickets are ignored
- transferred geometry contains valid attribute lengths
- worker failure returns work to the main-thread path
- dark-culled chunks request a full remesh on approach

## CI Workflow

Create `.github/workflows/ci.yml` with:

1. checkout
2. Node setup with npm cache
3. `npm ci`
4. `npm run check`
5. `npm run test`
6. `npm run build`

Run on pushes and pull requests to the default branch. Start with one supported
Node LTS version for speed. Add a version matrix only when Atlas intentionally
supports multiple major Node releases.

Upload coverage only if it will be reviewed. Do not establish a high global
threshold before legacy code has meaningful coverage. Begin with thresholds on
newly tested critical modules or use a modest ratchet that can only increase.

## Optional Smoke Suite

After unit coverage is stable, add a separate manual or scheduled workflow that:

- launches the Vite app
- creates or loads a deterministic test world
- waits for a chunk to reach `READY`
- checks for console errors
- verifies a save request completes

Keep this separate from the fast pull-request gate until it is reliable.

## Acceptance Criteria

- `npm test` runs locally without Electron.
- CI runs static checks, tests, and the production build.
- Persistence, crafting, raycasting, and deterministic generation have focused
  regression coverage.
- Test failures identify the behavior and input that changed.
- CI does not modify tracked files.

## Risks

- World-generation tests can become brittle if they assert entire outputs without
  explaining intended changes.
- Timing-based worker tests can be flaky; inject schedulers or test protocol
  handlers directly.
- A Vite build currently regenerates the music index. CI should verify that this
  generation is deterministic and does not leave the checkout dirty.
