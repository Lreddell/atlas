# Atlas

Atlas is a voxel sandbox game built with TypeScript, React, Three.js, and Vite, with an Electron desktop wrapper for native Windows builds.

## Highlights

- Procedural voxel world generation with chunk streaming
- Real-time meshing/generation workers for smooth gameplay
- Inventory, crafting, drops, and interaction systems
- In-game UI suite (main menu, pause, HUD, chat, debug screen)
- Panorama-based menu backgrounds and feature editor tooling
- Browser development flow + desktop installer packaging

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
- If desktop packaging fails due signing/symlink issues on Windows, this project already disables executable sign/edit for local unsigned builds.
- Large chunk-size warnings during web build are warnings only and do not block output.

## Repository Hygiene

Ignored by default:

- `node_modules/`
- `dist/`
- `release/`
- `.env*` (except `.env.example`)
- common OS/editor artifacts

Keep `package-lock.json` committed for reproducible installs.
