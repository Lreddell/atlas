# Directional Magnetic Fields

## Goal

Add a normal craftable Iron Block that acts as a magnetic backplate, concentrating and boosting an adjacent magnet's field away from itself. Multiple adjacent Iron Blocks combine across all three axes. Add `/magfields` to visualize the actual combined raw magnetic field with highly visible 3D arrows.

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

Keep the existing five-block range and inverse-square falloff for magnets without an Iron Block backplate.

For a directional magnet, replace the broad weighting with a narrow boosted cone:

- Four times the normal magnet force on the forward axis.
- Smoothly decrease from the four-times boost to one percent of normal force within a 30-degree half-angle cone.
- Keep only one percent of normal force at the sides and behind the magnet.
- Multiple Iron Block directions combine before calculating the cone, so bottom plus right produces one boosted up-left cone.

The same helper must be used by gameplay, dropped items, and debug sampling so visualization cannot disagree with physics.

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

Player behavior maps the same magnet geometry to two equipment rules:

- Ordinary ferromagnetic behavior, activated by wearing any Iron Armor piece: positive magnets repel and negative magnets attract.
- Polarity Boots attract or repel based on selected polarity.

## Polarity Feedback

Replace the current smooth circular polarity badge with an Atlas-style pixel-art indicator:

- Use the existing positive and negative magnet texture artwork as the visual basis.
- Render it as a square magnetic plate with hard pixel edges, an Atlas-style dark border, and no rounded glossy treatment.
- Keep a large centered plus or minus symbol with enough contrast to read over bright terrain, water, caves, and night scenes.
- Label the states `Positive (R)` and `Negative (R)`.
- Use pixelated image rendering and the existing pixel-style UI font.
- Play a short scale-and-flash animation when polarity changes, without moving or resizing the hotbar.

Add two replaceable sound-effect slots:

```text
public/assets/rvx/sounds/polarity/positive.ogg
public/assets/rvx/sounds/polarity/negative.ogg
```

Register the files through the existing sound manifest as:

- `ability.polarity.positive`
- `ability.polarity.negative`

The positive event plays when switching to positive polarity, and the negative event plays when switching to negative polarity. These events play only when Polarity Boots are equipped. Missing or empty files use the existing synthesized non-music fallback. `/sound reload` reloads the manifest after replacements, and the sound asset documentation must list the new folder and filenames.

## Dropped Metal Items

Dropped metal items respond to magnets automatically:

- Positive magnets repel dropped metal.
- Negative magnets attract dropped metal.
- Directional cone boost, inverse-square falloff, range, overlap, and cancellation match the shared field helpers.
- Magnetic velocity is clamped so items remain physically controllable and do not tunnel excessively through blocks.
- Player pickup attraction still runs normally after magnetic acceleration.

Treat these dropped item families as metal:

- Raw Iron, Iron Ingots, Iron Block, Iron tools, and Iron Armor.
- Raw Copper, Copper Ingots, and Copper tools.
- Raw Gold, Gold Ingots, and Gold tools.
- Positive and Negative Magnet blocks.

Stone, wood, diamond, food, plants, and unrelated blocks remain unaffected.

## Debug Visualization

Add `/magfields [on|off|toggle]`.

- `/magfields` and `/magfields toggle` toggle the overlay.
- `/magfields on` enables it.
- `/magfields off` disables it.
- Add full autocomplete support.
- The state is debug-only and is not persisted in world saves.

Render a local 3D grid around the player:

- Sample every one block within the existing magnetic range around nearby magnets.
- Draw one clearly visible arrow for each non-trivial resultant raw field vector.
- Arrow direction matches the resultant vector.
- Use thicker arrow shafts and larger cone-shaped heads.
- Use unlit, high-emission materials that remain readable in bright daylight and complete darkness.
- Arrow length and opacity scale with normalized magnitude and are clamped for readability.
- Use bright red when positive-magnet contribution dominates.
- Use bright blue/cyan when negative-magnet contribution dominates.
- Render above ordinary world depth so terrain cannot hide the debug overlay.
- Omit arrows whose resultant magnitude is below a small threshold, making cancellation visible.
- Rebuild the debug geometry only when the player changes block position or nearby magnet/iron block state changes; do not allocate arrows every frame.

## Files

Primary implementation areas:

- `src/types.ts`
- `src/data/blocks.ts`
- `src/recipes.ts`
- `src/components/ui/InventoryUI.tsx`
- `src/systems/player/magnetism.ts`
- `src/systems/player/playerInput.ts`
- `src/systems/registry/metalItems.ts`
- `src/components/DropManager.tsx`
- `src/components/MagneticFieldDebug.tsx`
- `src/components/ui/PolarityIndicator.tsx`
- `src/systems/sound/soundDefaults.ts`
- `src/data/commands.ts`
- `src/App.tsx`
- `src/systems/textures/pr19TexturePixels.ts`
- `src/systems/textures/textureMapping.ts`
- `public/assets/rvx/sounds.json`
- `public/assets/rvx/README_SOUNDS.md`
- `scripts/generate_pr19_textures.mjs`

## Validation

- Pure tests for all six iron directions, diagonal composition, cancellation fallback, four-times forward boost, one-percent side/rear leakage, raw polarity behavior, and overlapping-field cancellation.
- Metal classification tests covering every affected and unaffected item family.
- Dropped-item force tests confirming positive repulsion, negative attraction, directional boost, and velocity clamping.
- Polarity feedback tests confirming the correct sound event is selected for each state and no switch sound plays without Polarity Boots.
- Indicator architecture tests confirming the pixel-art magnet textures and state labels are used.
- Recipe tests for 9 ingots to block and block to 9 ingots.
- Command autocomplete tests for `/magfields`.
- Texture assignment and generated-PNG identity tests for Iron Block.
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Runtime smoke test confirming `/magfields` toggles readable arrows in day and night, dropped metal responds to both polarities, directional force agrees with the arrows, the indicator changes cleanly, and both replacement sound slots play.
