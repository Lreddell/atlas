import { Buffer } from 'node:buffer';
import path from 'node:path';
import { build } from 'esbuild';

import { getVaultCandidateForCell, getVaultLayout } from './resonantVaults.ts';

export const VaultTestBlockType = Object.freeze({
  AIR: 0,
  STONE: 3,
  ECHO_MOSAIC: 74,
  RESONANCE_PYLON: 76,
  PULSE_CONDUIT: 78,
  PHASE_BLOCK: 79,
  RESONANCE_PLATE: 80,
  RESONANT_LAMP: 81,
  ECHO_SPIKES: 82,
  SENTINEL_CORE: 83,
  LISTENING_STONE: 84,
  VAULT_SEAL: 85,
});

export class SparseVaultStructureWriter {
  blocks = new Map();

  key(x, y, z) {
    return `${x},${y},${z}`;
  }

  set(x, y, z, type, meta = 0, onlyReplace) {
    const key = this.key(x, y, z);
    const current = this.blocks.get(key)?.type ?? VaultTestBlockType.STONE;
    if (onlyReplace && !onlyReplace.has(current)) return;
    this.blocks.set(key, { type, meta });
  }

  get(x, y, z) {
    return this.blocks.get(this.key(x, y, z))?.type ?? VaultTestBlockType.STONE;
  }
}

let generationModulePromise;

export async function loadVaultGenerationModule() {
  generationModulePromise ??= (async () => {
    const root = path.resolve(import.meta.dirname, '../../..');
    const bundled = await build({
      entryPoints: [path.join(root, 'src/systems/world/resonantVaultGeneration.ts')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      define: {
        __APP_VERSION__: '"test"',
        __APP_DISPLAY_VERSION__: '"test"',
      },
      write: false,
    });
    const source = bundled.outputFiles[0].text;
    return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  })();
  return generationModulePromise;
}

function projectLocalX(candidate, x, z) {
  const dx = x - candidate.centerX;
  const dz = z - candidate.centerZ;
  switch (candidate.orientation) {
    case 1: return dz;
    case 2: return -dx;
    case 3: return -dz;
    default: return dx;
  }
}

export async function makeSparseVaultFixture({
  seed = 77123,
  orientation = 0,
  centerSurfaceY = 104,
  grandSurfaceY = centerSurfaceY,
  fractureSurfaceY = centerSurfaceY,
} = {}) {
  const candidate = {
    ...getVaultCandidateForCell(5, -7, seed),
    active: true,
    orientation,
  };
  const getSurfaceY = (x, z) => {
    const localX = projectLocalX(candidate, x, z);
    if (localX < -100) return grandSurfaceY;
    if (localX > 100) return fractureSurfaceY;
    return centerSurfaceY;
  };
  const layout = getVaultLayout(candidate, centerSurfaceY, getSurfaceY);
  const writer = new SparseVaultStructureWriter();
  const { paintResonantVaultStructure } = await loadVaultGenerationModule();
  paintResonantVaultStructure(writer, candidate, layout, { seed, getSurfaceY });
  return { candidate, layout, writer, reader: writer };
}
