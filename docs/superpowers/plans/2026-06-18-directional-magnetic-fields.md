# Directional Magnetic Fields Implementation Plan

**Goal:** Add Iron Blocks that shape adjacent magnet fields, plus a raw-field debug overlay, without changing existing save formats or non-magnetic gameplay.

## Task 1: Lock behavior with tests

- Add primitive field-math tests covering no iron, one-sided iron, diagonal combinations, cancellation, polarity, and the 15% residual field.
- Extend command autocomplete tests for `/magfields on|off|toggle`.
- Add recipe/data source guards for Iron Block compression and decompression.
- Extend PR #19 texture assignment tests for the new generated Iron Block texture.

## Task 2: Add Iron Block data and texture

- Add `BlockType.IRON_BLOCK` after the PR #19 item IDs.
- Register it as a solid opaque building block with pickaxe harvesting and self-drop behavior.
- Add the block to creative inventory ordering.
- Add 9-ingot compression and 9-ingot decompression recipes.
- Add slot 156 to the shared PR #19 texture definition and generation pipeline, then regenerate the PNG.

## Task 3: Implement shared directional field math

- Add pure helpers for magnet polarity, adjacent-Iron direction axes, directional weighting, magnet source collection, and raw field sampling.
- Sum all six adjacent Iron Block directions and normalize the result.
- Fall back to the current spherical field when no Iron Blocks are adjacent or opposing Iron Blocks cancel.
- Keep the current range, inverse-square strength, and velocity clamp.
- Update player magnetism to consume the shared helpers.

## Task 4: Add the debug command and overlay

- Register `/magfields [on|off|toggle]` in autocomplete and command execution.
- Keep the setting session-only.
- Add a react-three-fiber debug component that renders all sampled vectors in one `LineSegments` geometry.
- Color positive-dominant vectors red and negative-dominant vectors blue.
- Rebuild only when the player enters a new block or nearby magnet/Iron Block state changes.

## Task 5: Verify and publish

- Run targeted Node tests.
- Run `npm run typecheck`, `npm run lint`, and `npm run build`.
- Confirm the normal checkout remains on clean `main`.
- Commit without assistant attribution and push to `origin/main-kf9l7x`.
