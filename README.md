# Atlas

Atlas is a voxel sandbox game built with TypeScript, React, Three.js, and Vite, with an Electron desktop wrapper for native Windows builds.

## Highlights

- Procedural voxel world generation with chunk streaming
- Real-time meshing/generation workers for smooth gameplay
- Inventory, crafting, drops, and interaction systems
- In-game UI suite (main menu, pause, HUD, chat, debug screen)
- Panorama-based menu backgrounds and customization
- Browser development flow and desktop installer packaging

## License

The **source code** in this repository is licensed under the **MIT License**. See [`LICENSE`](./LICENSE).

Unless explicitly stated otherwise, **all non-code content is All Rights Reserved**. This includes, but is not limited to:

- textures, sprites, models, and other visual assets
- music, sound effects, and other audio
- branding, logos, and the name **Atlas**
- screenshots, videos, written lore, design notes, and other creative content
- bundled game content and other non-code assets in `public/`, `data/`, `build/`, `docs/`, and similar directories

You may use, copy, modify, and distribute the code under the terms of the MIT License, but you may **not** reuse, redistribute, or create derivative works from the protected non-code content without explicit written permission.

If a file or directory includes its own license or notice, that specific notice controls for that content.

## Tech Stack

- React 18 + TypeScript
- Three.js + @react-three/fiber + @react-three/drei
- Vite 5
- Electron 40 + electron-builder

## Requirements

- Node.js 18+
- npm 9+
- Windows is required for the provided NSIS desktop build flow

## Quick Start

1) Install dependencies

```bash
npm install
```

2) Run browser development server

```bash
npm run dev
```

3) Run Electron development mode

```bash
npm run electron:dev
```

## Scripts

- `npm run dev` — start Vite dev server (`http://localhost:5173`)
- `npm run build` — production web build into `dist/`
- `npm run preview` — preview built web output
- `npm run typecheck` — run TypeScript checking (`tsc --noEmit`)
- `npm run lint` — run ESLint
- `npm run check` — currently aliases lint
- `npm run format` — run Prettier write
- `npm run format:check` — run Prettier check
- `npm run electron:dev` — run Vite + Electron together
- `npm run electron:build` — build web assets + create Windows installer

## Desktop Build Output

Running:

```bash
npm run electron:build
```

produces:

- Installer executable in `release/` (e.g. `Atlas Setup x.y.z.exe`)
- Unpacked runtime in `release/win-unpacked/`

`release/` is intentionally ignored by Git.

## Versioning

Project version is sourced from `package.json` and used across:

- Installer naming/metadata (electron-builder)
- In-game version display (main menu + debug/F3)

Recommended bump commands:

```bash
npm version patch
# or
npm version minor
npm version major
```

Then rebuild with:

```bash
npm run electron:build
```

## Project Structure

```text
atlas/
  src/
    components/      # Rendering, gameplay components, UI
    systems/         # World, player, sound, texture systems
    hooks/           # Reusable gameplay hooks
    utils/           # Utility modules
    data/            # Code-defined block/command data
    App.tsx          # App/game orchestration
    index.tsx        # React entrypoint
    constants.ts     # Shared constants + APP_VERSION
    types.ts         # Shared types/enums
    recipes.ts       # Crafting recipe logic/data
  electron/          # Main/preload process code
  public/            # Static assets
  data/              # Runtime/editor data (e.g. panoramas)
  docs/              # Planning and analysis docs
  build/             # Desktop build resources (icon, etc.)
```

## Notes on Data & Storage

- In development, panorama captures are stored under `data/panoramas/`.
- In packaged desktop builds, panorama files are stored under Electron `userData`.
- World/chunk persistence uses IndexedDB via world storage systems.

## Troubleshooting

- If `electron:dev` exits immediately, verify Vite is running on `http://localhost:5173`.
- If desktop packaging fails due to signing/symlink issues on Windows, this project already disables executable sign/edit for local unsigned builds.
- Large chunk-size warnings during web build are warnings only and do not block output.

## Repository Hygiene

Ignored by default:

- `node_modules/`
- `dist/`
- `release/`
- `.env*` (except `.env.example`)
- common OS/editor artifacts

Keep `package-lock.json` committed for reproducible installs.
