# Native Dialog Removal Design

## Goal

Remove every synchronous browser `alert`, `confirm`, and `prompt` call from Atlas so UI actions cannot leave Electron keyboard focus stale. Preserve the operating-system panorama file picker, which is asynchronous and is not part of the renderer-blocking failure mode.

## Architecture

Atlas will keep confirmation ownership in the screen that initiates an action and reuse the existing `ConfirmModal`. A new `UiNotice` component will provide consistent, dismissible success, information, and error feedback without blocking the renderer. This avoids a global context refactor while giving App, Main Menu, Pause Menu, World Editor, and Feature Editor the same presentation model.

## Behavior

- Destructive world, panorama, pack, texture, block, item, and recipe actions require `ConfirmModal` confirmation.
- Failures and non-destructive outcomes appear through `UiNotice` or the World Editor's existing inline notice.
- World-menu initialization and refresh failures are caught rather than becoming unhandled promise rejections.
- Feature Editor imports report invalid schemas as well as malformed JSON and reset persistent file inputs so the same file can be retried.
- Texture import/export revokes object URLs and reports file/image read failures.
- Cloud texture import reports success or failure without a native dialog and allows retrying the same file.

## Regression Protection

A source-level Node test scans all production TypeScript and TSX files and fails if a renderer-blocking native dialog call returns. Focused assertions verify the shared notice, in-app confirmations, file-input resets, and object-URL cleanup are wired into the affected surfaces.

## Compatibility

No save, world metadata, content-pack, or gameplay data shapes change. Only UI feedback and error handling change.
