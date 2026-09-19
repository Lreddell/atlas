// Gate 0 perf evidence: generation/domain-query/save overhead of the
// campaign layer vs the pre-campaign baseline.
// Usage: node scripts/campaign-perf-bench.mjs
//
// What "baseline" means here: the pre-campaign engine allocated uint8 voxel
// planes and had no graph/domain/registry work. This bench measures the same
// operations in both widths plus the new campaign queries in absolute terms,
// with call-frequency notes so the numbers can be judged against budgets.
import { deflateRawSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const bundled = await build({
  absWorkingDir: root,
  bundle: true,
  format: 'esm',
  platform: 'node',
  stdin: {
    contents: `export { generateCampaignGraph, getCampaignRegionAt } from './src/systems/campaign/campaignGraph.ts';\nexport { copyUpLegacyBlocks, legacyDecodeRemap } from './src/systems/registry/blockRegistry.ts';\n`,
    resolveDir: root,
    sourcefile: 'perf-bench-entry.ts',
  },
  write: false,
});
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-perf-')), 'entry.mjs');
fs.writeFileSync(tmp, bundled.outputFiles[0].text);
const mod = await import(pathToFileURL(tmp).href);

const CELLS = 16 * 16 * 384; // 98304 voxels per chunk
const out = { cells: CELLS };

// 1. Voxel plane alloc + fill: uint8 (pre-campaign) vs uint16 (Gate 0).
function benchAlloc(Ctor, iters = 50) {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) {
    const a = new Ctor(CELLS);
    a.fill(i & 0xff);
  }
  return Number(process.hrtime.bigint() - t0) / 1e6 / iters;
}
out.allocFillMs = { uint8: benchAlloc(Uint8Array), uint16: benchAlloc(Uint16Array) };

// 2. Save size: raw + deflated, uint8 legacy vs uint16 Gate 0, on
// terrain-like data (runs of stone/dirt/air, not random noise).
function terrainLike(width) {
  const a = width === 1 ? new Uint8Array(CELLS) : new Uint16Array(CELLS);
  for (let i = 0; i < CELLS; i++) {
    const band = (i >> 8) % 32;
    a[i] = band < 2 ? 0 : band < 6 ? 1 : band < 20 ? 3 : 5;
  }
  return a;
}
function byteView(a) {
  return a instanceof Uint16Array ? new Uint8Array(a.buffer, a.byteOffset, a.byteLength) : a;
}
const u8 = terrainLike(1);
const u16 = terrainLike(2);
out.saveBytes = {
  rawU8: u8.byteLength,
  rawU16: u16.byteLength,
  deflatedU8: deflateRawSync(byteView(u8)).length,
  deflatedU16: deflateRawSync(byteView(u16)).length,
};

// 3. Legacy copy-up + remap cost per chunk (one-time migration read).
{
  const t0 = process.hrtime.bigint();
  const iters = 20;
  for (let i = 0; i < iters; i++) mod.copyUpLegacyBlocks(u8);
  out.copyUpMsPerChunk = Number(process.hrtime.bigint() - t0) / 1e6 / iters;
}

// 4. Campaign graph generation + domain query throughput.
{
  const t0 = process.hrtime.bigint();
  const N = 200;
  for (let i = 0; i < N; i++) mod.generateCampaignGraph((i * 2654435761) >>> 0, false);
  out.graphGenMs = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  const g = mod.generateCampaignGraph(12345, false);
  const M = 200000;
  const t1 = process.hrtime.bigint();
  for (let i = 0; i < M; i++) mod.getCampaignRegionAt(g, (i * 37) % 20000 - 10000, (i * 91) % 20000 - 10000);
  out.domainQueryNs = Number(process.hrtime.bigint() - t1) / M;
}

// 5. Registry snapshot size (per-world meta overhead).
out.registrySnapshotBytes = JSON.stringify({ version: 1, extra: [{ numeric: 256, namespaced: 'atlas:gate0_proving_stone' }] }).length;

console.log(JSON.stringify(out, null, 2));
