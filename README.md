# Atlas

Atlas is a TypeScript voxel sandbox built with React, Three.js, and Vite, with optional Electron packaging for desktop builds.

## Tech Stack

- React + TypeScript
- Three.js + @react-three/fiber
- Vite
- Electron (optional desktop runtime)

## Development

Prerequisites: Node.js 18+

1. Install dependencies:

    npm install

2. Run in browser mode:

    npm run dev

3. Run in Electron mode:

    npm run electron:dev

## Build

- Browser build:

   npm run build

- Electron installer build (Windows NSIS):

   npm run electron:build

## Quality Gates

- Type check:

   npm run typecheck

- Lint:

   npm run lint

- Combined check:

   npm run check

- Format files:

   npm run format

## Architecture (High-Level)

- `App.tsx` orchestrates game/app mode, UI overlays, and session flow.
- `systems/WorldManager.ts` owns chunk lifecycle and worker coordination.
- `systems/world/workers/world.worker.ts` performs generation/meshing off the main thread.
- `systems/world/WorldStorage.ts` provides world/chunk persistence.
- `components/ui/*` contains HUD/menu/inventory/debug interfaces.
