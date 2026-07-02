# World Generation Configuration Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every world-generation editor section, including Magnetic Fields, through JSON, presets, and worlds using one shared normalizer.

**Architecture:** `genConfig.ts` will own a pure, schema-driven normalizer based on `DEFAULTS`. Runtime loading will normalize against the current configuration for partial imports, while persistence boundaries normalize against defaults to produce complete snapshots. Preset and world storage will call that shared function instead of maintaining their own schema copies.

**Tech Stack:** TypeScript, React, Electron IPC, browser localStorage, Node test runner, Vite.

---

### Task 1: Add a shared schema-driven configuration normalizer

**Files:**
- Modify: `src/systems/world/genConfig.ts`
- Modify: `src/systems/world/worldgenDefaults.test.mjs`

- [ ] **Step 1: Write failing normalization regression tests**

Extend `worldgenDefaults.test.mjs` to import `normalizeGenConfigSnapshot` and add tests that customize nested values in every top-level section, especially `bossDomains.magneticFields`, then assert the normalized result preserves them and has the same top-level keys as `DEFAULTS`. Add a legacy/unknown-key test:

```js
const input = {
    noise: { temperature: { type: 'simplex', scale: 0.0042 } },
    bossDomains: { magneticFields: { radius: 777, enabled: false } },
    unknownSection: { unsafe: true },
};
const normalized = normalizeGenConfigSnapshot(input);
assert.equal(normalized.bossDomains.magneticFields.radius, 777);
assert.equal(normalized.bossDomains.magneticFields.enabled, false);
assert.equal(normalized.noise.temperature.type, 'opensimplex2');
assert.equal('unknownSection' in normalized, false);
assert.equal('unknownSection' in input, true);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --no-warnings --experimental-strip-types --test src/systems/world/worldgenDefaults.test.mjs
```

Expected: FAIL because `normalizeGenConfigSnapshot` is not exported.

- [ ] **Step 3: Implement the pure normalizer**

In `genConfig.ts`:

- Export `WorldGenConfigSnapshot = typeof DEFAULTS`.
- Add a recursive helper that walks the keys present in the base schema, recursively merges record values, clones recognized primitive values, and ignores unknown keys.
- Export `normalizeGenConfigSnapshot(data, base = DEFAULTS)` returning a complete clone or `null` for a non-object root.
- Reapply the existing noise-type migration after merging so `simplex` becomes `opensimplex2` and invalid noise names retain the base value.
- Replace the manual `loadGenConfig` section list with the shared normalizer using `GenConfig` as the base.
- Replace manual `applyState` assignments with a complete cloned top-level assignment so future `DEFAULTS` sections are applied automatically.

The implementation is:

```ts
export type WorldGenConfigSnapshot = typeof DEFAULTS;

const mergeKnownShape = (base: unknown, incoming: unknown): unknown => {
    if (!isRecord(base) || !isRecord(incoming)) return clone(base);
    const result = clone(base) as Record<string, unknown>;
    Object.keys(result).forEach((key) => {
        const incomingValue = incoming[key];
        if (incomingValue === undefined) return;
        const currentValue = result[key];
        if (isRecord(currentValue)) {
            if (isRecord(incomingValue)) {
                result[key] = mergeKnownShape(currentValue, incomingValue);
            }
            return;
        }
        if (!isRecord(incomingValue)) result[key] = clone(incomingValue);
    });
    return result;
};

export const normalizeGenConfigSnapshot = (
    data: unknown,
    base: WorldGenConfigSnapshot = DEFAULTS,
): WorldGenConfigSnapshot | null => {
    if (!isRecord(data)) return null;
    const normalized = mergeKnownShape(base, data) as WorldGenConfigSnapshot;
    const incomingNoise = isRecord(data.noise) ? data.noise : {};
    (Object.keys(normalized.noise) as NoiseKey[]).forEach((key) => {
        const incoming = incomingNoise[key];
        if (!isRecord(incoming) || !('type' in incoming)) return;
        normalized.noise[key].type = normalizeNoiseType(incoming.type) ?? base.noise[key].type;
    });
    return normalized;
};
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2. Expected: all `worldgenDefaults` tests pass.

- [ ] **Step 5: Commit the shared normalizer**

```powershell
git add src/systems/world/genConfig.ts src/systems/world/worldgenDefaults.test.mjs
git commit -m "Fix worldgen config normalization"
```

### Task 2: Route preset and editor JSON persistence through the normalizer

**Files:**
- Modify: `src/systems/world/worldGenPresets.ts`
- Create: `src/systems/world/worldGenPresets.test.mjs`
- Modify: `src/components/ui/ChunkBase.tsx`

- [ ] **Step 1: Write a failing browser preset round-trip test**

Create an in-memory localStorage stub, assign it to `globalThis.window`, save a preset with non-default Magnetic Fields and values from the other top-level sections, read it back with `listWorldGenPresets`, and assert the complete values survive. Also inspect the raw localStorage JSON to prove `bossDomains` is written.

```js
const config = structuredClone(DEFAULTS);
config.bossDomains.magneticFields.radius = 901;
config.climateWarp.amplitude = 31;
const saved = saveWorldGenPreset('Complete', config);
const [loaded] = listWorldGenPresets();
assert.equal(saved.config.bossDomains.magneticFields.radius, 901);
assert.equal(loaded.config.bossDomains.magneticFields.radius, 901);
assert.equal(JSON.parse(storage.get('atlas.worldGen.presets'))[0].config.bossDomains.magneticFields.radius, 901);
```

- [ ] **Step 2: Run the preset test and verify RED**

Run:

```powershell
node --no-warnings --experimental-strip-types --test src/systems/world/worldGenPresets.test.mjs
```

Expected: FAIL because the current read normalizer replaces Magnetic Fields values with defaults.

- [ ] **Step 3: Remove preset-specific schema duplication**

Update `worldGenPresets.ts` to import `normalizeGenConfigSnapshot` and `WorldGenConfigSnapshot` from `genConfig.ts`. Remove its manual `normalizeConfigSnapshot`. Normalize both saves and reads through the shared function, returning `null` if the supplied configuration root is invalid.

Update `ChunkBase.tsx` so `downloadConfig` serializes `normalizeGenConfigSnapshot(GenConfig)` rather than the mutable object directly. JSON import continues through `loadGenConfig`, which now uses the same normalizer.

- [ ] **Step 4: Run both focused tests and verify GREEN**

```powershell
node --no-warnings --experimental-strip-types --test src/systems/world/worldgenDefaults.test.mjs src/systems/world/worldGenPresets.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit preset and editor routing**

```powershell
git add src/systems/world/worldGenPresets.ts src/systems/world/worldGenPresets.test.mjs src/components/ui/ChunkBase.tsx
git commit -m "Persist complete worldgen presets"
```

### Task 3: Normalize world creation, load, and save metadata

**Files:**
- Modify: `src/systems/world/WorldStorage.ts`
- Modify: `src/App.tsx`
- Create: `src/systems/world/worldGenPersistenceBoundaries.test.mjs`

- [ ] **Step 1: Write failing boundary tests**

Add source-backed boundary assertions, following existing Atlas test conventions for orchestration files that are difficult to instantiate under Node:

```js
assert.match(worldStorageSource, /normalizeGenConfigSnapshot\(worldGenConfig\)/);
assert.match(appSource, /activeWorldGenConfigRef\.current\s*=\s*normalizeGenConfigSnapshot\(meta\.worldGenConfig\)/);
assert.match(appSource, /if \(activeWorldGenConfigRef\.current\)[\s\S]*meta\.worldGenConfig\s*=\s*normalizeGenConfigSnapshot/);
assert.match(worldStorageSource, /worldGenConfig\s*==\s*null\s*\?\s*undefined/);
```

These assertions prove that:

- `WorldStorage.createWorld` calls `normalizeGenConfigSnapshot` before assigning `worldGenConfig`.
- `App.tsx` stores a normalized active configuration after load.
- `saveGame` writes the normalized active configuration back only when a custom configuration exists.
- A world without `worldGenConfig` continues to omit it.

The behavior assertion for omission should call the shared normalizer only when the optional value is non-null and confirm the boundary source uses a conditional spread or assignment.

- [ ] **Step 2: Run the boundary test and verify RED**

```powershell
node --no-warnings --experimental-strip-types --test src/systems/world/worldGenPersistenceBoundaries.test.mjs
```

Expected: FAIL because the current world creation and active-world snapshot paths use raw JSON cloning.

- [ ] **Step 3: Implement normalized world boundaries**

In `WorldStorage.createWorld`, replace raw JSON cloning with:

```ts
const worldGenConfigSnapshot = worldGenConfig == null
    ? undefined
    : normalizeGenConfigSnapshot(worldGenConfig) ?? undefined;
```

In `App.tsx`, after `loadGenConfig(meta.worldGenConfig)` succeeds, store a normalized snapshot in `activeWorldGenConfigRef`. During `saveGame`, if that ref contains a custom configuration, normalize it and assign it to `meta.worldGenConfig` before `saveWorldMeta`. Do not assign the field when the ref is `null`.

- [ ] **Step 4: Run all focused tests and verify GREEN**

```powershell
node --no-warnings --experimental-strip-types --test src/systems/world/worldgenDefaults.test.mjs src/systems/world/worldGenPresets.test.mjs src/systems/world/worldGenPersistenceBoundaries.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit world metadata routing**

```powershell
git add src/systems/world/WorldStorage.ts src/App.tsx src/systems/world/worldGenPersistenceBoundaries.test.mjs
git commit -m "Normalize worldgen config in world saves"
```

### Task 4: Validate the complete change

**Files:**
- Verify all modified files from Tasks 1-3.

- [ ] **Step 1: Run all repository Node tests**

```powershell
$tests = Get-ChildItem -Path src,electron -Recurse -Filter *.test.mjs | ForEach-Object { $_.FullName }
node --test $tests
```

Expected: zero failures.

- [ ] **Step 2: Run static validation**

```powershell
npm run typecheck
npm run lint
npm run build
```

Expected: every command exits 0.

- [ ] **Step 3: Review persistence and compatibility requirements**

Confirm from tests and diff that Magnetic Fields survives every configured boundary, every `DEFAULTS` top-level key is covered, unknown keys are ignored, legacy `simplex` still migrates, old data is not rewritten on read, and default worlds still omit custom configuration.

- [ ] **Step 4: Inspect the final diff**

```powershell
git diff HEAD~3 --check
git diff HEAD~3 --stat
git status --short --branch
```

Expected: only the planned configuration, persistence, test, and documentation files changed.

- [ ] **Step 5: Push the validated branch**

```powershell
git push origin main-kf9l7x
```

Expected: the remote branch advances to the final implementation commit.
