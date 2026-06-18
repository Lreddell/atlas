# PR 19 Texture Style Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PR 19 armor and magnet textures match Atlas's existing procedural pixel-art style exactly.

**Architecture:** Store slots 149-155 as shared layered rectangle definitions. Use those definitions in both browser canvas atlas generation and a deterministic Node PNG generator.

**Tech Stack:** TypeScript, Canvas 2D, Node.js, zlib, Vite

---

### Task 1: Shared Texture Definitions

**Files:**
- Create: `src/systems/textures/pr19TexturePixels.ts`
- Modify: `src/utils/textures.ts`

- [ ] Define layered 16x16 rectangle data for both magnets, four iron armor pieces, and Polarity Boots.
- [ ] Add a canvas painter that renders the shared definitions without smoothing.
- [ ] Replace the duplicated slot 149-155 drawing code in `textures.ts` with the shared painter.

### Task 2: Deterministic PNG Generation

**Files:**
- Delete: `scripts/generate_pr19_textures.py`
- Create: `scripts/generate_pr19_textures.mjs`
- Modify: `public/assets/textures/blocks/*.png`
- Modify: `public/assets/textures/items/*.png`

- [ ] Implement a minimal RGBA PNG encoder using Node `zlib`.
- [ ] Import the shared TypeScript definitions with Node strip-types.
- [ ] Generate all seven committed PNGs from those definitions.
- [ ] Add `--check` mode that fails when committed assets differ.

### Task 3: Verification

**Files:**
- Modify: `src/systems/textures/pr19TextureAssignments.test.mjs`

- [ ] Extend the focused test to execute generator check mode.
- [ ] Run the texture tests and generator check.
- [ ] Run `npm run typecheck`, `npm run lint`, and `npm run build`.
- [ ] Load the app and verify all seven external textures rebuild into the atlas without errors.
