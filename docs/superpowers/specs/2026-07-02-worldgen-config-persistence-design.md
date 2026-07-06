# World Generation Configuration Persistence

## Goal

Use one schema-driven normalization path for every world-generation configuration
boundary so all current and future editor sections persist consistently. This
specifically restores custom Magnetic Fields settings under
`bossDomains.magneticFields`, which the preset-specific normalizer currently
drops when a preset is read.

## Root Cause

`genConfig.ts` and the World Editor know about every current top-level section,
including `bossDomains`, but `worldGenPresets.ts` maintains a second manual merge
list that stops at `spawn`. Reading either a browser or Electron preset rebuilds
the configuration from defaults through that incomplete list. The saved Magnetic
Fields values are therefore replaced by defaults before the preset is loaded or
used to create a world.

The current top-level sections are:

- `noise`
- `terrainShape`
- `biomes`
- `height`
- `climateWarp`
- `spawn`
- `bossDomains`

`bossDomains` is the only section missing from the duplicated preset normalizer,
but retaining separate manual lists would allow the same defect whenever another
editor section is added.

## Shared Normalization

Add one pure normalization function in `src/systems/world/genConfig.ts`. It will:

- Start from a deep clone of a supplied base configuration.
- Recursively merge only keys defined by the base schema.
- Preserve default values for fields absent from older JSON.
- Ignore unknown fields rather than allowing them into runtime configuration.
- Preserve the existing legacy `simplex` to `opensimplex2` noise migration.
- Return a complete `WorldGenConfigSnapshot` or reject a non-object root.

The normalizer will be schema-driven from the complete default object rather than
enumerating top-level sections. Adding a future section to `DEFAULTS` will
therefore include it automatically in normalized snapshots.

`loadGenConfig` will use this function with the current mutable configuration as
its base, preserving the editor's existing partial-import behavior. Preset and
world persistence will use `DEFAULTS` as the base, producing complete portable
snapshots.

## Persistence Boundaries

Apply the shared normalizer to every world-generation configuration boundary:

1. World Editor JSON import normalizes before applying values.
2. World Editor JSON export serializes a complete normalized snapshot.
3. Browser preset saves write a complete normalized snapshot to localStorage.
4. Browser preset reads normalize legacy or partial entries in memory.
5. Electron preset saves receive a normalized snapshot before IPC writes JSON.
6. Electron preset reads normalize legacy or partial files in memory.
7. World creation stores a complete normalized snapshot when a preset is used.
8. World loading applies the same normalized representation to runtime state.
9. Subsequent saves of a world with a custom generation configuration persist
   its complete normalized snapshot.
10. Portable world JSON export/import retains that normalized world metadata via
    the existing world export path.

Worlds that use default generation and currently omit `worldGenConfig` will
continue omitting it. They will not gain unnecessary default configuration data.

## Upgrade And Compatibility Policy

Existing preset and world files are never rewritten merely because they are
listed, opened, or loaded. Missing fields are supplied from defaults in memory.

A legacy preset is upgraded on disk only when the user explicitly saves it as a
preset again. A legacy world with custom generation data is upgraded when the
normal world-save flow next persists its metadata. New presets, editor exports,
and worlds always receive the complete schema.

This preserves old presets and saves without introducing a migration prompt or a
background filesystem mutation.

## Editor Behavior

No controls, layout, or gameplay behavior change. Magnetic Fields remains in the
Biomes section and participates in the same save, load, undo, import, and export
model as every other world-generation section.

The implementation will keep the diff focused and will not refactor
`src/App.tsx` beyond the small world-load/save assignments needed to normalize
custom configuration metadata.

## Tests

Add focused Node tests that prove:

- Custom Magnetic Fields values survive normalization and preset round trips.
- Every top-level key in `DEFAULTS` exists in a normalized snapshot.
- Nested values from every current section survive normalization.
- Partial legacy presets receive missing defaults without mutating the input.
- Legacy `simplex` noise names still migrate to `opensimplex2`.
- Unknown keys are ignored.
- Saving and then reading a browser preset preserves the complete configuration.
- Default worlds can continue omitting `worldGenConfig`.

The Magnetic Fields regression test must fail against the current implementation
before production code changes are made.

## Validation

Run the focused regression tests, all repository Node tests, and the standard
Atlas static validation:

```text
node --no-warnings --experimental-strip-types --test <focused tests>
node --test <all test files>
npm run typecheck
npm run lint
npm run build
```

Manual verification will cover an editor JSON export/import and a preset
save/load round trip if practical. No terrain generation, rendering, or gameplay
behavior is intentionally changed.
