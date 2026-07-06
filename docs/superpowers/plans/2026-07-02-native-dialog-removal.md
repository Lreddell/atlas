# Native Dialog Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all renderer-blocking native dialogs and harden adjacent file and asynchronous UI actions.

**Architecture:** Reuse `ConfirmModal` for destructive confirmation and add one shared `UiNotice` presentational component. Each active screen owns its notice and pending-confirmation state, keeping changes local and avoiding an App-wide context refactor.

**Tech Stack:** React, TypeScript, Electron, Node test runner, Tailwind CSS

---

### Task 1: Add regression coverage

**Files:**
- Create: `src/components/ui/nativeDialogs.test.mjs`

- [ ] **Step 1: Write the failing test**

Create a test that recursively scans production `.ts` and `.tsx` files under `src`, rejects `alert`, `confirm`, and `prompt` calls, and asserts the planned shared notice and cleanup wiring exist.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/components/ui/nativeDialogs.test.mjs`

Expected: FAIL because current App, Main Menu, Pause Menu, and Feature Editor files still contain native dialogs.

### Task 2: Add shared non-blocking feedback

**Files:**
- Create: `src/components/ui/UiNotice.tsx`
- Modify: `src/components/ui/MainMenu.tsx`
- Modify: `src/components/ui/mainMenu/useWorldMenu.ts`
- Modify: `src/components/ui/PauseMenu.tsx`

- [ ] **Step 1: Implement `UiNotice`**

Export `UiNoticeState` with `success`, `info`, and `error` types and render a fixed, dismissible, accessible top-center notice.

- [ ] **Step 2: Replace Main Menu native alerts**

Return notice state from `useWorldMenu`, catch initial world/preset loading failures, and report world create, delete, rename, folder, import, and export failures through `UiNotice`.

- [ ] **Step 3: Replace Pause Menu cloud alert**

Report cloud texture success/read failure through `UiNotice`, reset the file input, and add `FileReader.onerror` handling.

### Task 3: Replace App and panorama dialogs

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add App notice and panorama confirmation state**

Render `UiNotice` at the App root and `ConfirmModal` for pending panorama deletion.

- [ ] **Step 2: Harden panorama actions**

Wrap browser and desktop panorama imports/deletes in `try/catch`, replace alerts with notices, and perform deletion only after in-app confirmation.

- [ ] **Step 3: Replace world-load alerts**

Return to the menu and show a notice for missing metadata or locked worlds without blocking the renderer.

### Task 4: Replace Feature Editor dialogs and fix file lifecycle bugs

**Files:**
- Modify: `src/components/ui/FeatureEditor/FeatureEditor.tsx`
- Modify: `src/components/ui/FeatureEditor/TextureEditorView.tsx`
- Modify: `src/components/ui/FeatureEditor/BlockEditorView.tsx`
- Modify: `src/components/ui/FeatureEditor/ItemEditorView.tsx`
- Modify: `src/components/ui/FeatureEditor/RecipeEditorView.tsx`

- [ ] **Step 1: Replace destructive confirmations**

Store the pending entity identifier locally, render `ConfirmModal`, and delete only from its confirmation callback.

- [ ] **Step 2: Harden pack and texture imports**

Report invalid JSON and invalid pack schemas with `UiNotice`, add read/image failures, reset file inputs, and revoke import/export object URLs.

- [ ] **Step 3: Run focused test to verify it passes**

Run: `node --test src/components/ui/nativeDialogs.test.mjs src/components/ui/worldEditorInputRecovery.test.mjs`

Expected: PASS with no production native dialog calls.

### Task 5: Verify and publish

**Files:**
- Verify all modified files above.

- [ ] **Step 1: Run static and production checks**

Run `npm run typecheck`, `npm run lint`, and `npm run build`; all must exit zero.

- [ ] **Step 2: Run the complete Node test inventory**

Run every `*.test.mjs` under `src` and `electron`, excluding the known Windows PID-1 live-owner assertion; expect zero failures.

- [ ] **Step 3: Review and publish**

Run `git diff --check`, confirm only planned files changed, commit the implementation, push `main-kf9l7x`, and verify local and remote HEAD match.
