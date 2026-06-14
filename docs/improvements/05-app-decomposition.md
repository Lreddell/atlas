# App Component Decomposition

Status: Proposed  
Priority: Medium

## Problem

`src/App.tsx` is roughly 2,100 lines and owns unrelated concerns:

- application and menu state
- world-session lifecycle
- player and inventory state
- chat input, history, autocomplete, and command execution
- saving and metadata updates
- panorama capture and selection
- render settings
- scene composition
- pause, focus, and pointer-lock behavior

Frequently changing UI state such as command input lives at the root, increasing
the number of components participating in updates and making isolated tests
difficult.

## Goals

- Reduce root-component responsibility without changing behavior.
- Isolate high-frequency UI state from the world and Three.js scene.
- Establish explicit boundaries between simulation, session state, UI, and render
  adapters.
- Make later dimension, multiplayer, and entity work easier to place.

## Non-Goals

- Replacing React.
- Introducing a large state-management library immediately.
- Rewriting all hooks in one change.

## Target Boundaries

### App shell

Own only:

- top-level mode selection
- menu versus active world routing
- fatal error boundaries
- composition of providers

### World session controller

Own:

- create/load/unload world
- active world metadata
- spawn and respawn flow
- save scheduling and force-save
- session cleanup

Expose commands through a hook or context rather than passing many setters.

### Command and chat controller

Own:

- messages
- input text
- history navigation
- autocomplete state
- command parsing and execution dispatch

Move the input state next to `Chat` so typing does not rerender the full app.
Commands should call narrow service methods rather than directly mutating many
root states.

### Inventory controller

The existing `useInventoryController` is a starting point. Continue moving:

- crafting state
- container interactions
- cursor stack
- item transfer rules

Keep presentation in `InventoryUI`.

### Panorama controller

Own:

- panorama discovery and selection
- capture workflow
- file reads and writes
- menu background synchronization

### Game scene

Extract the contents of the React Three Fiber `Canvas` into a memoized component
whose props are stable configuration or external-store selectors.

## State Strategy

Use the lightest mechanism appropriate to each boundary:

- local component state for isolated UI
- refs for frame-loop mutable values
- existing stores for imperative render data
- context for low-frequency session services
- `useSyncExternalStore` for shared external state requiring React subscriptions

Do not put per-frame transforms or continuously decaying values into React state.

## Migration Sequence

1. Extract pure presentational sections and the `GameScene` component.
2. Move command/chat state and handlers into `useCommandController`.
3. Move panorama behavior into `usePanoramaController`.
4. Move save and world-session lifecycle into `useWorldSession`.
5. Replace broad prop groups with narrow typed controller interfaces.
6. Revisit remaining root state and remove obsolete compatibility wiring.

Each step should be independently reviewable. Avoid a single large file move that
makes behavioral differences hard to identify.

## Tests

- command parsing and history operate without mounting the full game
- typing in chat does not rerender the game scene
- world load and unload perform all required cleanup
- save scheduling uses the latest session state
- panorama operations report errors without breaking the active world
- pause and pointer-lock transitions retain existing behavior

Use React Profiler or temporary render counters to verify isolation rather than
assuming extraction alone reduced rerenders.

## Acceptance Criteria

- `App.tsx` acts primarily as composition and routing.
- Command input updates do not rerender `GameScene`.
- World-session cleanup has one owner and can be tested directly.
- Extracted controllers expose typed, narrow APIs.
- Existing gameplay, menus, saves, and panorama features behave unchanged.

## Risks

- Moving callbacks can change dependency arrays and introduce stale closures.
- Context values can recreate every render unless their identities are stabilized.
- Splitting files without moving ownership merely hides complexity. Each
  extraction must reduce responsibility, not only line count.
- Save-integrity work should land before or together with the world-session
  extraction so broken persistence behavior is not preserved behind a new API.
