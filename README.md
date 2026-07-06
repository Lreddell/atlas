# Atlas

Atlas is a voxel sandbox and action-adventure game built with TypeScript, React,
Three.js, and Vite, with an Electron desktop wrapper for native Windows builds.

Explore procedural worlds, gather and craft, build freely, tune terrain in the
World Editor, or seek out sealed regions and their guardians.

## Highlights

- Procedural surface and cave generation across more than twenty biomes
- The sealed Magnetic Fields, polarity-based traversal, and the Magnetic Warden boss
- Survival, creative, and spectator modes with crafting, combat, armor, tools, and boats
- A live World Editor for terrain, caves, biomes, and Magnetic Fields generation
- Streamed chunk generation and meshing through a unified worker pipeline
- Local world management with desktop filesystem saves, browser storage, import, and export
- In-game menus, HUD, tutorial, chat, commands, debug tools, and custom panoramas

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

## Controls And Input Notes

- Use `W`, `A`, `S`, and `D` to move, `Space` to jump, and `Ctrl` to sprint.
- Use left click to break or attack and right click to place, use, eat, or board.
- Use the mouse wheel or number keys `1` through `9` to change the selected
  hotbar slot.
- In the browser runtime, `Ctrl`/`Cmd` + wheel still changes hotbar slots while
  Atlas prevents browser zoom during active gameplay.
- Press `/` or `T` in-game to open the command/chat input.
- Press `R` to flip polarity while wearing Polarity Boots. Upgraded boots use `N`
  to toggle their magnetic power.
- Press `E` for inventory, `Q` to drop an item, and `F3` for the debug screen.
- Focused text inputs keep normal typing behavior, including movement-key
  letters such as `W`, `A`, `S`, and `D`.
- `Escape` closes active UI, pauses/resumes, or exits pointer lock depending on
  the current game state.

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

Atlas currently stores both a package `version` and a user-facing
`displayVersion` in `package.json`. Until a dedicated release script exists,
update both fields intentionally and rebuild.

Example workflow:

```bash
npm run typecheck
npm run lint
npm run build
```

For installer output, rebuild with:

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
    data/            # Blocks, commands, tutorial, and changelog data
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

## Worlds and Local Storage

- In development, panorama captures are stored under `data/panoramas/`.
- In packaged desktop builds, panorama files are stored under Electron `userData`.
- Desktop worlds use Atlas region files in the application's save folder.
- Browser worlds prefer the browser's private filesystem and fall back to IndexedDB
  when that filesystem is unavailable.
- Existing browser-database worlds migrate automatically without deleting the source
  copy. Import and export remain available across browser and desktop builds.
- Atlas prevents the same world from being opened in two active sessions and performs
  a final save when quitting through the game or closing the desktop app.

## Troubleshooting

- If `npm run electron:dev` exits immediately, verify that Vite is running at `http://localhost:5173`.
- If desktop packaging fails due to signing or symlink issues on Windows, this project already disables executable signing and editing for local unsigned builds.
- Large chunk-size warnings during the web build are warnings only and do not block output.

## Repository Hygiene

Common ignored paths include:

- `node_modules/`
- `dist/`
- `release/`
- `out/`
- `.vite/`
- `*.tsbuildinfo`
- `data/`
- `.env*` except `.env.example`
- common OS and editor artifacts

Keep `package-lock.json` committed for reproducible installs.

## Licensing

### Source code

The repository currently does not include a root `LICENSE` file for source code.
Do not rely on a source-code redistribution license until that file and package
metadata are added intentionally.

For Atlas, "source code" means application and build logic such as files in
`src/`, `electron/`, configuration files, and other code used to run, build, or
package the project.

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
