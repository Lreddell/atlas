# Atlas

Atlas is a voxel sandbox game built with TypeScript, React, Three.js, and Vite, with an Electron desktop wrapper for native Windows builds.

Atlas focuses on procedural world generation, chunk streaming, responsive gameplay systems, and a desktop-friendly development flow for building and packaging the project as a playable application.

## Highlights

- Procedural voxel world generation with chunk streaming
- Real-time meshing and generation workers for smoother gameplay
- Inventory, crafting, drops, and interaction systems
- In-game UI including main menu, pause menu, HUD, chat, and debug tools
- Panorama-based menu backgrounds and customization support
- Browser development flow and desktop installer packaging

## Tech Stack

- React 18 and TypeScript
- Three.js, `@react-three/fiber`, and `@react-three/drei`
- Vite 5
- Electron 40 and `electron-builder`

## Requirements

- Node.js 18 or newer
- npm 9 or newer
- Windows for the provided NSIS desktop build flow

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Run the browser development server

```bash
npm run dev
```

### 3. Run Electron in development mode

```bash
npm run electron:dev
```

## Scripts

- `npm run dev` starts the Vite dev server at `http://localhost:5173`
- `npm run build` creates a production web build in `dist/`
- `npm run preview` previews the built web output
- `npm run typecheck` runs TypeScript checking with `tsc --noEmit`
- `npm run lint` runs ESLint
- `npm run check` runs TypeScript and ESLint checks
- `npm run format` runs Prettier write
- `npm run format:check` runs Prettier check
- `npm run electron:dev` runs Vite and Electron together
- `npm run electron:build` builds the web assets and creates the Windows installer

## Desktop Build Output

Running:

```bash
npm run electron:build
```

produces:

- an installer executable in `release/` such as `Atlas Setup x.y.z.exe`
- an unpacked runtime in `release/win-unpacked/`

`release/` is intentionally ignored by Git.

## Versioning

Project version information is sourced from `package.json` and used across:

- installer naming and metadata through `electron-builder`
- in-game version display in the main menu and debug screen

Recommended bump commands:

```bash
npm version patch
# or
npm version minor
# or
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
    systems/         # World, player, sound, texture, and gameplay systems
    hooks/           # Reusable gameplay hooks
    utils/           # Utility modules
    data/            # Code-defined block and command data
    App.tsx          # App and game orchestration
    index.tsx        # React entrypoint
    constants.ts     # Shared constants and APP_VERSION
    types.ts         # Shared types and enums
    recipes.ts       # Crafting recipe logic and data
  electron/          # Main and preload process code
  public/            # Static assets bundled with the app
  data/              # Runtime and editor data such as panoramas
  docs/              # Planning and analysis documents
  build/             # Desktop build resources such as icons
```

## Notes on Data and Storage

- In development, panorama captures are stored under `data/panoramas/`.
- In packaged desktop builds, panorama files are stored under Electron `userData`.
- World and chunk persistence use IndexedDB through the world storage systems.

## Troubleshooting

- If `npm run electron:dev` exits immediately, verify that Vite is running at `http://localhost:5173`.
- If desktop packaging fails due to signing or symlink issues on Windows, this project already disables executable signing and editing for local unsigned builds.
- Large chunk-size warnings during the web build are warnings only and do not block output.

## Repository Hygiene

Ignored by default:

- `node_modules/`
- `dist/`
- `release/`
- `.env*` except `.env.example`
- common OS and editor artifacts

Keep `package-lock.json` committed for reproducible installs.

## Licensing

### Source code

Unless otherwise noted, the source code in this repository is licensed under the MIT License. See `LICENSE` for details.

For Atlas, "source code" includes application and build logic such as files in `src/`, `electron/`, configuration files, and other code used to run, build, or package the project.

### Non-code content

Unless otherwise noted, all non-code content in this repository is **All Rights Reserved**.

This includes, but is not limited to:

- artwork and textures
- models and visual assets
- audio, music, and sound effects
- screenshots, promotional images, and videos
- panorama files and bundled game content
- written lore, narrative content, and design material
- Atlas name, logo, and branding
- other creative and presentation assets that are not source code

See `LICENSE-ASSETS.md` for details.

### Third-party materials

Some bundled assets and materials may be included under their own third-party licenses.

These third-party materials are **not** covered by Atlas's All Rights Reserved asset notice and remain under their original terms. See `THIRD_PARTY_NOTICES.md` for details.

## Third-Party Notice

Atlas includes the Monocraft font in `public/assets/fonts/Monocraft-ttf/`.

Monocraft is a third-party font by IdreesInc and is licensed separately under the SIL Open Font License 1.1. It is not covered by Atlas's All Rights Reserved asset terms.

## Disclaimer

Atlas is an independent game project. Any genre or aesthetic inspiration from other voxel or sandbox games does not imply affiliation with or endorsement by Mojang or any other third party.
