# Real Greedy Meshing

Status: Proposed  
Priority: High

## Problem

The current mesher identifies rectangular runs on top and bottom surfaces, but it
still loops over every cell in each rectangle and emits one quad per block face.
It therefore performs rectangle discovery without obtaining the main greedy
meshing benefit: fewer vertices and indices.

Side faces also continue through the normal per-block face path.

At high render distances, geometry count is a primary GPU-memory and vertex-cost
driver even after dark cave faces are culled.

## Goals

- Emit one quad for each compatible merged rectangle.
- Support all six face directions.
- Preserve texture appearance, rotation, transparency rules, lighting, and AO.
- Keep chunk-border visibility correct.
- Produce deterministic geometry for a given chunk state.

## Compatibility Key

Faces may merge only when every rendering property that affects the final pixels
is compatible. The face key should include at least:

- block type
- face direction
- texture tile
- texture rotation
- render bucket: opaque, cutout, or transparent
- light signature
- AO signature
- any block metadata that changes appearance

Initially require exact corner light and AO equality. More permissive interpolation
rules can be considered after correctness is established.

## Texture Tiling

Stretching the existing atlas UV rectangle across a merged quad would enlarge one
block texture instead of repeating it. The shader therefore needs both:

- the local coordinates across the merged face
- the selected atlas tile bounds and rotation

The fragment shader can apply `fract()` to the local face coordinates, then map
the repeated result into the tile's padded atlas rectangle.

Take care around atlas seams:

- use inset tile bounds or texture padding
- preserve nearest-neighbor sampling
- verify mip behavior if mipmaps are enabled later

## Proposed Algorithm

For each axis:

1. Sweep the planes between voxel layers.
2. Build a two-dimensional mask describing visible faces and their compatibility
   keys.
3. Select the first unused mask cell.
4. Expand width while keys match.
5. Expand height while every cell in the next row matches.
6. Emit one correctly wound quad.
7. Mark the rectangle consumed.

Generate positive and negative faces separately or encode orientation in the key.
Neighbor chunk data must be consulted at horizontal chunk boundaries.

## Lighting and AO

Merged geometry still needs visually stable corner values. The first version
should merge only faces whose four-corner light and AO tuples are identical.

Later optimization may allow a larger rectangle when lighting forms a compatible
gradient, but that is not required for the initial implementation.

Dark-face culling remains an earlier visibility decision. Culled faces must not
enter the merge mask.

## Transparent and Cutout Blocks

Implement in stages:

1. opaque cubes
2. cutout cube faces
3. transparent cube faces
4. special geometry such as plants, fluids, beds, or torches

Do not merge special geometry until its overlap, sorting, and texture semantics are
explicitly defined. Transparent faces may require stricter merge rules.

## Instrumentation

Record per mesh:

- visible source face count
- emitted quad count
- vertex and index counts by material bucket
- meshing duration
- output bytes

Expose aggregate counters in the debug screen or a development-only log so the
benefit can be measured on real worlds.

## Tests

- a solid 16 by 16 top surface becomes one top quad
- a uniform wall becomes one side quad
- different block types do not merge
- different texture rotations do not merge
- differing light or AO signatures do not merge
- chunk boundaries hide internal faces correctly
- transparent and cutout faces remain in the correct material buckets
- winding and normals are correct for all six directions
- generated UVs tile once per block without atlas bleeding

## Acceptance Criteria

- A flat, uniformly lit chunk surface emits one quad per compatible rectangle.
- All six cube face directions use the greedy path.
- Representative worlds render without texture stretching, seams, lighting
  changes, missing faces, or incorrect normals.
- Vertex and index counts materially decrease in benchmark scenes.
- Meshing time does not regress enough to erase runtime gains.

## Risks

- Shader changes affect every chunk material and must preserve existing lighting.
- Overly strict light keys reduce merge rates; overly loose keys create visible
  gradients or AO artifacts.
- Transparent merging can worsen sorting artifacts.
- Buffer sizing should be based on worst-case non-merged geometry even after the
  common case becomes much smaller.

## Dependencies

Add the mesher correctness tests from `02-tests-and-ci.md` before replacing the
current geometry path. Worker payload caching can follow this work so it caches
the final message and data contracts rather than an intermediate design.
