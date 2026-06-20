# PR 19 Block Family Consistency Design

## Goal

Remove the Dead Forest biome and make the biome, wood, soil, grass, and stone
content added in PR 19 behave consistently with Atlas's established blocks.
Replace visually weak additions with deterministic 16x16 pixel textures and
correct the diamond, emerald, and stick item icons.

## Compatibility

- Keep every existing `BlockType` numeric value unchanged.
- Keep `COARSE_DIRT` as a usable block so worlds already containing it remain
  valid.
- Do not migrate or rewrite saved chunks.
- Remove only the Dead Forest biome definition, selection path, generation
  configuration, and music routing.
- Preserve all other new biomes and block families.

## Biome Removal

Delete the `dead_forest` biome from:

- `BIOMES`
- biome selection in `getBiome`
- `GenConfig` defaults and editable world-generation configuration
- music context routing
- any biome-specific generation branches

The former Dead Forest climate band falls through to the ordinary Forest biome.
Coarse dirt remains available in creative inventory and existing worlds.

## Shared Block Behavior

Introduce small shared family definitions for behavior that currently relies on
repeated block lists.

### Grass And Soil

All grass-topped blocks drop dirt when broken:

- Grass
- Snowy Grass
- Mossy Grass
- Lush Grass
- Dark Grass
- Meadow Grass
- Savanna Grass
- Jungle Grass

Podzol, coarse dirt, and mud remain themselves when broken unless an existing
Atlas rule already specifies otherwise.

### Logs And Wood

All seven wood families are first-class:

- Oak
- Spruce
- Birch
- Cherry
- Jungle
- Dark Oak
- Acacia

Every log:

- rotates onto the clicked X, Y, or Z axis;
- uses the correct end-grain and side textures after rotation;
- burns as furnace fuel;
- smelts into charcoal;
- crafts into four matching planks.

Every plank family supports:

- sticks;
- crafting tables;
- chests;
- beds;
- wooden pickaxes, axes, shovels, swords, and hoes;
- matching slabs and stairs.

Every plank, sapling, wooden slab, wooden stair, and existing wooden tool uses
the same fuel policy as its established equivalent.

### Stone Families

Andesite, diorite, and granite:

- require a pickaxe and use stone-like hardness;
- drop themselves;
- smelt into stone;
- are accepted anywhere the established stone-tool recipes accept
  cobblestone.

Mossy cobblestone remains a self-dropping building block and can smelt into
stone. Existing slab and stair coverage is not expanded beyond block types that
already exist.

## Recipe Structure

Replace repeated per-species recipe declarations with generated recipes driven
by explicit wood and stone family tables. Recipe output and shape remain
unchanged. The implementation must not permit mixed plank species in recipes
that currently require one matching species.

## Deterministic Textures

Use code-defined 16x16 RGBA pixel tiles with hard alpha and deterministic PNG
output. Generated files remain external texture overrides through
`TEXTURE_PATHS`.

### Wood Families

Each wood family must be identifiable by both palette and pattern, not hue
alone:

- Jungle: warm reddish-brown bark, broad irregular bands, muted tan planks.
- Dark Oak: near-black brown bark, heavy narrow grain, deep brown planks.
- Acacia: gray-brown bark with orange heartwood and orange planks.

Leaves use distinct palette/value ranges. Saplings use species-specific trunk
and canopy silhouettes so they remain identifiable at inventory scale.

### Stone And Surface Families

- Andesite: medium neutral gray with clustered mottling.
- Diorite: pale stone with high-contrast gray flecks.
- Granite: warm red-brown with darker mineral clusters.
- Mossy cobblestone: readable cobble joints with irregular green growth.
- Grass and soil variants: distinct top patterns and side transitions without
  looking like recolors of one shared noise texture.

### Item Corrections

- Diamond: compact faceted cyan gem with a pointed lower half.
- Emerald: taller green cut gem with a distinct rectangular/faceted silhouette.
- Stick: two-pixel-wide stepped brown shaft with outline, highlight, and clear
  endpoints.

## Validation

Automated coverage will verify:

- no `dead_forest` biome registration or selection remains;
- all grass variants drop dirt;
- all log families rotate, fuel, smelt, and craft correctly;
- all wood families support the established recipe set;
- stone variants support drops, smelting, and stone-tool recipes;
- every generated PNG is 16x16 RGBA;
- generated PNG bytes match their definitions;
- wood, sapling, and stone families have distinct pixel signatures;
- diamond, emerald, and stick satisfy their intended silhouettes.

Run the complete Node test suite, `npm run typecheck`, `npm run lint`,
`npm run build`, generator checks, and `git diff --check`. Perform contact-sheet
inspection of all changed textures and a browser smoke test of world loading and
creative inventory when pointer-lock behavior permits it.
