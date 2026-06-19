# Directional Magnetic Fields

## Goal

Add a normal craftable Iron Block that directs an adjacent magnet's field away from itself. Multiple adjacent Iron Blocks combine across all three axes. Add `/magfields` to visualize the actual combined raw magnetic field as small 3D arrows.

## Iron Block

- Add `BlockType.IRON_BLOCK = 197`.
- Add a solid, opaque, mineable Iron Block to the Building creative tab.
- Use a dedicated atlas slot and external PNG after the current PR 19 texture slots.
- Draw the texture with the same shared pixel-definition pipeline used by the magnet blocks: Atlas iron colors, simple rectangular paneling, subtle deterministic surface marks, and no heavy outline.
- Add the standard compression recipe: nine Iron Ingots in a full 3x3 grid produce one Iron Block.
- Add the standard decompression recipe: one Iron Block produces nine Iron Ingots.
- Preserve all existing block IDs and save compatibility.

## Direction Calculation

For each magnet, inspect its six face-adjacent cells for Iron Blocks.

Each adjacent Iron Block contributes a cardinal unit vector pointing from the Iron Block through the magnet. Sum all contributions:

- Iron below contributes up.
- Iron right contributes left.
- Iron behind contributes forward.
- Bottom plus right produces an up-left diagonal.
- Contributions work identically across X, Y, and Z.

Normalize the sum to produce the magnet's field axis. If there are no adjacent Iron Blocks, or opposing contributions cancel to zero, the magnet retains its current spherical field.

## Directional Strength

Keep the existing five-block range, inverse-square falloff, force scalar, and velocity clamp.

For a directional magnet, multiply its existing force by a smooth angular weight:

- Full strength on the forward axis.
- Smoothly decreasing strength toward the sides.
- Fifteen percent residual strength directly behind the magnet.

Use a monotonic interpolation from `0.15` at cosine `-1` to `1.0` at cosine `1`. The same helper must be used by gameplay and debug sampling so visualization cannot disagree with physics.

## Field API

Refactor magnetic calculations into pure helpers:

- Resolve a magnet's polarity.
- Resolve its field axis from adjacent block samples.
- Calculate one magnet's raw signed field contribution at a sample point.
- Sample the combined raw field at a world point.

The raw debug field uses a positive test-pole convention:

- Positive magnets repel away from themselves.
- Negative magnets attract toward themselves.
- Directional attenuation applies before contributions are summed.
- Opposing fields cancel naturally.

Player behavior continues to map the same magnet geometry to the existing equipment rules:

- Iron armor is attracted to every magnet.
- Polarity Boots attract or repel based on selected polarity.

## Debug Visualization

Add `/magfields [on|off|toggle]`.

- `/magfields` and `/magfields toggle` toggle the overlay.
- `/magfields on` enables it.
- `/magfields off` disables it.
- Add full autocomplete support.
- The state is debug-only and is not persisted in world saves.

Render a local 3D grid around the player:

- Sample every one block within the existing magnetic range around nearby magnets.
- Draw one small arrow for each non-trivial resultant raw field vector.
- Arrow direction matches the resultant vector.
- Arrow length and opacity scale with normalized magnitude and are clamped for readability.
- Color red when positive-magnet contribution dominates.
- Color blue when negative-magnet contribution dominates.
- Omit arrows whose resultant magnitude is below a small threshold, making cancellation visible.
- Rebuild the debug geometry only when the player changes block position or nearby magnet/iron block state changes; do not allocate arrows every frame.

## Files

Primary implementation areas:

- `src/types.ts`
- `src/data/blocks.ts`
- `src/recipes.ts`
- `src/components/ui/InventoryUI.tsx`
- `src/systems/player/magnetism.ts`
- `src/components/MagneticFieldDebug.tsx`
- `src/data/commands.ts`
- `src/App.tsx`
- `src/systems/textures/pr19TexturePixels.ts`
- `src/systems/textures/textureMapping.ts`
- `scripts/generate_pr19_textures.mjs`

## Validation

- Pure tests for all six iron directions, diagonal composition, cancellation fallback, angular attenuation, raw polarity behavior, and overlapping-field cancellation.
- Recipe tests for 9 ingots to block and block to 9 ingots.
- Command autocomplete tests for `/magfields`.
- Texture assignment and generated-PNG identity tests for Iron Block.
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Runtime smoke test confirming `/magfields` toggles arrows and directional force agrees with the arrows.
