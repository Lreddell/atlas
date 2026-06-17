# Documentation and Licensing Cleanup

Status: In progress
Priority: Medium

Progress note, 2026-06-16:

- `README.md` now documents current control/input behavior and no longer points
  to a missing root `LICENSE` file.
- `LICENSE-ASSETS.md` no longer claims the missing source-code `LICENSE` exists.
- `CLAUDE.md` now points to the actual
  `docs/atlas-performance-upgrades-md-updated/` directory.
- `docs/clauderesp.md` now identifies itself as a historical audit and points to
  the active roadmap.
- `THIRD_PARTY_NOTICES.md` no longer infers a missing MIT source-code license.
- `public/assets/rvx/README_SOUNDS.md` now reflects automatic
  `music-index.json` generation and the remaining `sounds.json` requirement.
- `public/assets/rvx/sounds/README.txt` now matches the main sound guide's
  automatic music-index wording.
- `THIRD_PARTY_NOTICES.md` now calls out that the bundled Monocraft directory is
  still missing the original OFL license text.

The remaining licensing and release-process work below is still open.

## Problem

Several repository instructions do not match the current code or files:

- `README.md` now warns maintainers to update both `version` and
  `displayVersion`, but no release script enforces synchronized
  package/package-lock/display-version updates.
- The package version includes a leading `v` and `-alpha`, so generic npm version
  commands may not produce the intended release label.
- A repository-root source-code `LICENSE` file still does not exist, and package
  metadata still needs to be aligned once the source license is chosen.
- `THIRD_PARTY_NOTICES.md` says Monocraft's original license materials should be
  retained, but the font directory does not contain an OFL license file.
- Current status still lives across several documents, so completed work and open
  follow-ups should continue to be reconciled into the roadmap.

## Goals

- Make setup, release, asset, and licensing instructions match the repository.
- Preserve third-party license texts required for redistribution.
- Clearly separate historical audits from active roadmaps.
- Make generated-file behavior explicit.

## Release Documentation

Choose and document one version format:

- package-compatible semantic version such as `1.0.2-alpha.0`, or
- the current display-oriented `v1.0.2-alpha`

Prefer a valid semver value without a leading display prefix in `version`, and
keep presentation in `displayVersion`.

Add a release script that updates both package files and the display version, for
example:

```text
npm run version:bump -- 1.0.3-alpha.0 "Alpha 1.0.3"
```

The script should:

- validate semantic version input
- update `package.json`
- update the lockfile consistently
- update `displayVersion`
- run checks
- not create a Git tag unless explicitly requested

Keep the README warning about updating both version fields until the actual
scripted workflow exists, then replace it with the command for that workflow.

## Source License

Before publishing or distributing under MIT:

1. Confirm the intended copyright holder and year.
2. Add the full MIT license text at repository root as `LICENSE`.
3. Ensure package metadata includes `"license": "MIT"` if accurate.
4. Keep the distinction between MIT source and All Rights Reserved assets.

This is a repository-maintenance task, not legal advice. The owner should confirm
the final licensing choice.

## Third-Party Materials

For Monocraft:

- obtain the license text from the version/source from which the bundled files
  were acquired
- place it beside the font files or in a clearly named third-party licenses
  directory
- include source URL, version or commit when known, author, and copyright notice
- verify whether reserved font names or redistribution conditions apply

Audit other bundled fonts, audio, textures, icons, and libraries for materials not
created by the Atlas owner. Add each separately licensed asset to
`THIRD_PARTY_NOTICES.md`.

Npm dependencies do not normally require copying all license texts into this file,
but packaged desktop distribution should retain notices required by their
licenses.

## Sound Guide

`public/assets/rvx/README_SOUNDS.md` now explains:

- Vite regenerates `music-index.json` at dev-server start, build start, and music
  hot updates
- Electron discovers music folders at runtime
- `sounds.json` still needs a `music.<folder>` event for a new context
- the generated index should be committed if web builds consume it from source

Consider adding a dedicated `npm run generate:music-index` command so generation
can run without starting Vite.

## Audit and Roadmap Documentation

`docs/clauderesp.md` is now marked as a dated historical report with an audit
date, source commit, implementation-status warning, and link to the active
roadmap.

Do not continuously rewrite the historical findings. Mark current status in the
roadmap documents instead.

## Additional Repository Docs

Add when useful:

- `CONTRIBUTING.md` with checks, code style, and asset rules
- `SECURITY.md` with private vulnerability reporting guidance
- a short architecture overview covering world data, workers, rendering, storage,
  and UI ownership
- release notes or a changelog once public builds are distributed

## Acceptance Criteria

- Every file referenced by the README exists.
- Version bump instructions update both machine and display versions.
- The root source license matches package metadata and stated intent.
- Monocraft is distributed with its applicable license text and attribution.
- The sound guide reflects automatic music-index generation.
- Historical audits point to the active roadmap and state their date/commit.
- `npm run build` does not leave unexplained tracked-file changes.

## Risks

- Licensing conclusions must not be guessed. Missing provenance may require
  replacing an asset rather than documenting an uncertain license.
- Changing version format can affect installer filenames and update logic; verify
  Electron packaging before adopting a new format.
- Generated files can cause noisy commits if ordering or line endings are not
  deterministic.
