import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 384;
const RAW_BYTES_PER_CHUNK = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE * 3;
const MIB = 1024 * 1024;
const renderDistances = [8, 16, 24, 32, 48];

const circularChunkCount = (radius) => {
  let count = 0;
  for (let x = -radius; x <= radius; x += 1) {
    for (let z = -radius; z <= radius; z += 1) {
      if (x * x + z * z <= radius * radius) count += 1;
    }
  }
  return count;
};

const rows = renderDistances.map((renderDistance) => {
  const chunks = circularChunkCount(renderDistance);
  const rawBytes = chunks * RAW_BYTES_PER_CHUNK;
  return {
    renderDistance,
    chunks,
    rawBytes,
    rawMiB: rawBytes / MIB,
  };
});

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  model: {
    chunkSize: CHUNK_SIZE,
    worldHeight: WORLD_HEIGHT,
    arraysPerChunk: 3,
    rawBytesPerChunk: RAW_BYTES_PER_CHUNK,
  },
  rows,
  note: 'This is a deterministic storage model, not a measured runtime benchmark. Use window.__ATLAS_PERF__ during gameplay for measured samples.',
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const jsonPath = resolve(root, 'artifacts/performance/streaming-model.json');
const markdownPath = resolve(root, 'artifacts/performance/streaming-model.md');
mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const markdown = [
  '# Atlas Streaming Memory Model',
  '',
  '> This report models the three full-height Uint8Array fields per resident chunk. It is not a measured game benchmark.',
  '',
  `Raw bytes per chunk: ${RAW_BYTES_PER_CHUNK.toLocaleString()} (${(RAW_BYTES_PER_CHUNK / 1024).toFixed(1)} KiB)`,
  '',
  '| Render distance | Circular chunks | Raw array memory |',
  '|---:|---:|---:|',
  ...rows.map((row) => `| ${row.renderDistance} | ${row.chunks.toLocaleString()} | ${row.rawMiB.toFixed(1)} MiB |`),
  '',
  'For runtime measurements, open Atlas and use `window.__ATLAS_PERF__.resetCapture()`, run the scenario, then call `window.__ATLAS_PERF__.downloadCapture("scenario-name")`.',
  '',
].join('\n');
writeFileSync(markdownPath, markdown);

console.log(markdown);
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);
