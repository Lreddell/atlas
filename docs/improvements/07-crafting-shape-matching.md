# Crafting Shape Matching

Status: In progress
Priority: High

## Problem

Core shape identity is already fixed in `src/recipes.ts`: `trimGrid()` returns
trimmed cells plus width and height, and `checkRecipe()` compares width, height,
and cells before accepting a shaped recipe.

Remaining work is recipe schema cleanup: explicit shaped and shapeless recipe
kinds, declared mirror behavior, ingredient tags, ambiguity validation, and
automated tests. Recipe behavior still depends on manually listing mirrored
variants.

## Goals

- Preserve recipe width and height during normalization.
- Match translated patterns anywhere within a 2 by 2 or 3 by 3 grid.
- Make mirroring and other transformations explicit recipe properties.
- Keep current valid recipes working unless they relied on the bug.
- Reduce duplicated recipes where a declared ingredient group can express intent.

## Current Normalized Shape

```ts
interface CraftingShape {
  width: number
  height: number
  cells: Array<BlockType | null>
}
```

The current implementation names the width and height fields `w` and `h`, but the
behavior is equivalent. Two shapes match only when:

- width is equal
- height is equal
- every corresponding cell is equal or satisfies an ingredient predicate

## Recipe Schema

Move toward an explicit schema:

```ts
interface ShapedRecipe {
  kind: 'shaped'
  pattern: CraftingShape
  allowMirror?: boolean
  output: ItemStack
}

interface ShapelessRecipe {
  kind: 'shapeless'
  ingredients: Ingredient[]
  output: ItemStack
}
```

An `Ingredient` can initially be a concrete `BlockType`. Later it may support tags
such as `planks` without duplicating recipes for every wood type.

Do not add rotation by default. A rotated pickaxe or shovel should match only if
the game design explicitly allows it.

## Matching Rules

### Shaped

1. Normalize the input grid to width, height, and cells.
2. Compare against the recipe's normalized shape.
3. If `allowMirror` is true, compare a horizontal mirror.
4. Return the first matching recipe according to a documented priority.

### Shapeless

1. Remove empty cells.
2. Compare ingredient multiplicities.
3. Ignore slot positions.

Shapeless support is optional for the first fix but the schema should not block
it.

## Data Cleanup

After the schema is explicit:

- remove manually duplicated mirrored axe recipes and use `allowMirror`
- consider plank ingredient tags for recipes that accept all wood types
- review the unusual 2 by 2 wooden pickaxe recipes and decide whether they are
  intentional
- validate every loading-screen crafting tip against the actual recipe table

## Tests

- a vertical two-item recipe does not match horizontally
- a horizontal recipe does not match vertically
- translated patterns match in every valid grid offset
- mirrored axes match when `allowMirror` is enabled
- non-mirrored asymmetric recipes reject mirrors
- empty grids return no output
- duplicate ingredients in shapeless recipes respect counts
- every declared recipe has at least one positive fixture
- ambiguous recipes resolve according to documented priority

## Acceptance Criteria

- Shape width and height participate in every shaped comparison.
- Existing intended recipes still craft from all valid offsets.
- Accidental rotations no longer match.
- Mirror behavior is declared in recipe data rather than duplicated by hand.
- Recipe tests cover positive and negative cases.

## Risks

- Some players may have learned recipes that currently work only because of the
  bug. Record any intentional compatibility decisions.
- Recipe tags can become a broad data refactor. Fix shape identity first and add
  tags in a separate step if needed.
- Returning the first match can hide ambiguity. Add a development-time validator
  that detects equivalent normalized recipes.
