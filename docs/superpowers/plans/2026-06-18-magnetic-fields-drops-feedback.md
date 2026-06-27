# Magnetic Fields, Drops, and Polarity Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen Iron-backed magnetic fields, apply them to ordinary metal players and dropped metal items, improve field visibility, and add replaceable polarity-switch sounds with an Atlas-style indicator.

**Architecture:** Keep `magneticField.ts` as the shared field geometry and strength source. Add small pure modules for magnetic-item classification, drop velocity application, and polarity sound selection; integrate them into `magnetism.ts`, `DropManager.tsx`, and `PolarityIndicator.tsx`. Render debug arrows as fixed-capacity instanced unlit meshes so daylight readability improves without per-frame object allocation.

**Tech Stack:** TypeScript, React, react-three-fiber, Three.js instancing, Web Audio, Node test runner.

---

### Task 1: Directional Cone Strength and Ordinary Metal Polarity

**Files:**
- Modify: `src/systems/player/magneticField.ts`
- Modify: `src/systems/player/magneticField.test.mjs`
- Modify: `src/systems/player/magnetism.ts`

- [ ] **Step 1: Write failing field tests**

Add assertions that an Iron-backed magnet returns `4` on-axis, `0.01` at 30 degrees and beyond, while an undirected magnet remains at multiplier `1`. Add a pure ordinary-metal force assertion showing positive sources produce outward vectors and negative sources produce inward vectors.

- [ ] **Step 2: Run the field test and verify failure**

Run:

```powershell
node --no-warnings --experimental-strip-types --test src/systems/player/magneticField.test.mjs
```

Expected: failures because the current peak is `1` and rear residual is `0.15`.

- [ ] **Step 3: Implement the narrow boosted cone**

Define:

```ts
export const DIRECTIONAL_PEAK_MULTIPLIER = 4;
export const DIRECTIONAL_LEAK_MULTIPLIER = 0.01;
export const DIRECTIONAL_CONE_HALF_ANGLE = Math.PI / 6;
```

Return `1` for an undirected source. For a directed source, return `0.01` outside the cone and smoothly interpolate from `0.01` at the cone boundary to `4` on-axis.

- [ ] **Step 4: Update player behavior**

For `ferro`, apply the raw positive-test-pole convention: positive magnets repel and negative magnets attract. Keep selected-polarity behavior unchanged for `controlled`. Raise the magnetic velocity clamp enough for the four-times cone to remain noticeable.

- [ ] **Step 5: Run the field tests**

Expected: all magnetic field tests pass.

### Task 2: Dropped Metal Classification and Physics

**Files:**
- Create: `src/systems/registry/metalItems.ts`
- Create: `src/systems/registry/metalItems.test.mjs`
- Create: `src/systems/player/dropMagnetism.ts`
- Create: `src/systems/player/dropMagnetism.test.mjs`
- Modify: `src/components/DropManager.tsx`

- [ ] **Step 1: Write failing classification tests**

Cover raw/ingot/tool/armor/block families for iron, copper, and gold plus both magnet blocks. Assert stone, wood, diamond, food, and plants are false.

- [ ] **Step 2: Write failing drop velocity tests**

Use a primitive tuple API:

```ts
applyMagneticFieldToVelocity([0, 0, 0], { x: 10, y: 0, z: 0 }, 0.1)
```

Assert acceleration follows the raw vector and clamps each resulting velocity axis to the drop magnetic speed limit.

- [ ] **Step 3: Run both tests and verify failure**

Expected: module-not-found failures for the two new pure modules.

- [ ] **Step 4: Implement classification and velocity helpers**

Use explicit `Set<number>` membership for the approved metal families. Mutate the supplied velocity tuple by adding `field * dt`, then clamp its total magnitude.

- [ ] **Step 5: Integrate into `DropManager`**

For metal drops only:

1. Cache nearby `MagnetSource[]` by the drop's integer block cell for 250 ms.
2. Sample the raw field each fixed physics step.
3. Apply magnetic acceleration before gravity and collision.
4. Preserve lava destruction, collision, pickup delay, and player pickup attraction.

- [ ] **Step 6: Run classification and drop tests**

Expected: all tests pass.

### Task 3: High-Visibility Instanced Debug Arrows

**Files:**
- Modify: `src/components/MagneticFieldDebug.tsx`
- Create: `src/components/MagneticFieldDebug.test.mjs`

- [ ] **Step 1: Write a failing architecture test**

Assert the component uses `InstancedMesh`, `MeshBasicMaterial`, `depthTest: false`, `toneMapped: false`, and both cylinder and cone geometry. Assert old `LineBasicMaterial` rendering is absent.

- [ ] **Step 2: Run the test and verify failure**

Expected: failure because the current overlay uses thin `LineSegments`.

- [ ] **Step 3: Replace line geometry with instanced shafts and heads**

Create positive and negative shaft/head meshes using reusable cylinder and cone geometry. Use bright red and cyan-blue unlit materials, fixed maximum instance counts, high render order, and disabled depth testing. Rebuild matrices only when the player block or source signature changes.

- [ ] **Step 4: Run the architecture test**

Expected: pass.

### Task 4: Polarity Indicator and Replaceable Sounds

**Files:**
- Create: `src/systems/player/polarityFeedback.ts`
- Create: `src/systems/player/polarityFeedback.test.mjs`
- Modify: `src/components/ui/PolarityIndicator.tsx`
- Create: `src/components/ui/PolarityIndicator.test.mjs`
- Modify: `src/systems/sound/soundDefaults.ts`
- Modify: `public/assets/rvx/sounds.json`
- Create: `public/assets/rvx/sounds/polarity/README.txt`
- Modify: `public/assets/rvx/README_SOUNDS.md`

- [ ] **Step 1: Write failing polarity feedback tests**

Assert positive state resolves to `ability.polarity.positive` and negative state resolves to `ability.polarity.negative`. Add source guards confirming the indicator uses the positive/negative magnet PNGs, labels `Positive (R)` and `Negative (R)`, and plays the selected event inside the mounted indicator listener.

- [ ] **Step 2: Run tests and verify failure**

Expected: missing helper module and indicator source assertions fail.

- [ ] **Step 3: Implement the pixel-art indicator**

Render the appropriate magnet texture in a fixed square frame with `imageRendering: pixelated`, hard borders, high contrast, and a short keyed scale/flash animation. Keep the container dimensions stable above the hotbar.

- [ ] **Step 4: Register and play polarity sound events**

Add both events to TypeScript defaults and JSON manifest with `player` category paths `polarity/positive` and `polarity/negative`. In the indicator's `ability:changed` listener, play the resolved event. Because the indicator mounts only in controlled mode, no sound plays without Polarity Boots.

- [ ] **Step 5: Add replacement-file documentation**

Create a folder README that names the exact `.ogg` filenames and explains `/sound reload`.

- [ ] **Step 6: Run polarity tests**

Expected: pass.

### Task 5: Make `/sound reload` Actually Reload

**Files:**
- Modify: `src/systems/sound/SoundManager.ts`
- Modify: `src/App.tsx`
- Create: `src/systems/sound/soundReload.test.mjs`

- [ ] **Step 1: Write a failing source-level reload test**

Assert `SoundManager` exposes `reloadManifest`, fetches `sounds.json` with `cache: 'no-store'`, and clears non-music buffer caches. Assert `/sound reload` calls `reloadManifest`, not `init`.

- [ ] **Step 2: Run the test and verify failure**

Expected: failure because reload currently calls `init()`, which returns early once initialized.

- [ ] **Step 3: Extract manifest loading and implement reload**

Create a private manifest loader shared by `init` and `reloadManifest`. Reload with `no-store`, merge defaults, clear `buffers` and `bufferLoadPromises`, and leave active music playback unchanged.

- [ ] **Step 4: Update command feedback**

Call `reloadManifest()` asynchronously and report success or error through chat.

- [ ] **Step 5: Run reload tests**

Expected: pass.

### Task 6: Full Verification and Publish

**Files:**
- Verify all modified files

- [ ] **Step 1: Run every Node test**

```powershell
$tests = rg --files -g "*.test.mjs" src
node --no-warnings --experimental-strip-types --test $tests
```

- [ ] **Step 2: Run static checks**

```powershell
npm run typecheck
npm run lint
npm run build
```

- [ ] **Step 3: Run browser smoke checks**

Verify world load, `/magfields`, day/night arrow readability, polarity labels and fallback sounds, and a dropped metal item responding to positive and negative magnets. Delete the temporary world afterward.

- [ ] **Step 4: Confirm checkout isolation**

Confirm `C:\Users\Logan\VisualStudioCode\atlas` remains clean on `main`.

- [ ] **Step 5: Commit and push**

Commit implementation without assistant attribution and push `main-kf9l7x` to update PR #19.
