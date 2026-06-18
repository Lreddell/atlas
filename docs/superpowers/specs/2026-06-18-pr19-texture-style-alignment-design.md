# PR 19 Texture Style Alignment

## Goal

Redraw the PR 19 armor and magnet textures so they use Atlas's existing procedural 16x16 pixel-art language instead of the heavier outlined style currently on the branch.

## Visual Rules

- Use hard 1px and rectangular fills only.
- Use the existing Atlas iron palette: `#9e9e9e`, `#d7ccc8`, and `#eeeeee`.
- Keep armor silhouettes sparse and readable without black outlines.
- Keep Polarity Boots red and blue while using the same boot geometry and shading language as Iron Boots.
- Give both magnets a neutral iron frame with small deterministic surface variation.
- Put a red center panel with a light `+` on Positive Magnet.
- Put a blue center panel with a light `-` on Negative Magnet.

## Architecture

Create one TypeScript pixel-definition module for slots 149 through 155. Runtime atlas generation paints those definitions onto the canvas. A Node asset generator imports the same definitions and writes the committed 16x16 PNG overrides, so the external files and procedural fallback remain pixel-identical.

## Validation

- Verify every generated PNG is 16x16 RGBA.
- Verify generated PNG bytes match the committed assets.
- Run the focused texture assignment test.
- Run typecheck, lint, and production build.
- Load Atlas and confirm all seven external textures rebuild into the atlas without console errors.
