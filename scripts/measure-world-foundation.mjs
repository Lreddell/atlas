import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { deflateSync } from 'node:zlib';
import { build } from 'esbuild';

// Run before and after the identity/storage migration with the same seeds and
// coordinates. This measures CPU/encoded storage, never GPU FPS or playability.
const root = path.resolve(import.meta.dirname, '..');
const bundled = await build({
  absWorkingDir: root, bundle: true, format: 'esm', platform: 'node', write: false,
  define: { __APP_VERSION__: '"benchmark"', __APP_DISPLAY_VERSION__: '"benchmark"' },
  stdin: { resolveDir: root, contents: `
    export { BLOCKS } from './src/data/blocks';
    export { BlockType } from './src/types';
    export { generateChunk } from './src/systems/world/chunkGeneration';
    export { reseedGlobalNoise } from './src/utils/noise';
    export { encodeChunkBody, decodeChunkBody } from './src/systems/world/storage/acr/acrCodec';
    export { encodeExportedWorld, decodeExportedWorld } from './src/systems/world/storage/worldExport';
    export { CHUNK_SIZE, WORLD_HEIGHT } from './src/constants';
  ` },
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const round = n => Math.round(n * 1000) / 1000;
const percentiles = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const q = p => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  return { count: values.length, p50: round(q(0.5)), p95: round(q(0.95)), p99: round(q(0.99)) };
};
const samples = [];
const genTimes = [], encodeTimes = [], decodeTimes = [];
const chunks = [];
for (const seed of [12345, 1729, 334033944]) {
  api.reseedGlobalNoise(seed);
  for (const [cx, cz] of [[0, 0], [1, 0], [-1, -1], [8, 8]]) {
    let start = performance.now();
    const chunk = api.generateChunk(cx, cz);
    genTimes.push(performance.now() - start);
    const bodies = [];
    for (let i = 0; i < 5; i++) {
      start = performance.now();
      const body = api.encodeChunkBody(chunk.blocks, chunk.light, chunk.meta, 1000);
      encodeTimes.push(performance.now() - start);
      start = performance.now();
      const decoded = api.decodeChunkBody(body);
      decodeTimes.push(performance.now() - start);
      assert.deepEqual([...decoded.blocks], [...chunk.blocks]);
      bodies.push(body);
    }
    const body = bodies[0];
    samples.push({ seed, cx, cz, voxels: chunk.blocks.length,
      blockBytes: chunk.blocks.byteLength, lightBytes: chunk.light.byteLength, metaBytes: chunk.meta.byteLength,
      paletteSize: new Set(chunk.blocks).size, bodyBytes: body.length,
      deflatedBodyBytes: deflateSync(body).length,
      semanticSha256: hash(Buffer.from(JSON.stringify([...chunk.blocks]))),
    });
    if (seed === 12345) chunks.push({ ...chunk, cx, cz, timestamp: 1000 });
  }
}
const metadata = { id: 'benchmark', name: 'Foundation benchmark', seed: '12345', seedNum: 12345,
  gameMode: 'creative', time: 1000, created: 1000, lastPlayed: 1000 };
let start = performance.now();
const exported = api.encodeExportedWorld(metadata, chunks);
const exportEncodeMs = round(performance.now() - start);
start = performance.now();
const imported = api.decodeExportedWorld(exported);
const exportDecodeMs = round(performance.now() - start);
assert.equal(imported.chunks.length, chunks.length);
for (let i = 0; i < chunks.length; i++) assert.deepEqual([...imported.chunks[i].blocks], [...chunks[i].blocks]);
const definitions = Object.entries(api.BlockType).filter(([name, value]) => !/^\d+$/.test(name) && typeof value === 'number')
  .map(([name, id]) => ({ id, name, classification: api.BLOCKS[id]?.isItem ? 'item' : api.BLOCKS[id] ? 'block' : 'missing' }))
  .sort((a, b) => a.id - b.id);
const out = {
  schema: 1, measuredAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  host: { os: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model, threads: os.cpus().length,
    ramBytes: os.totalmem(), node: process.version },
  scope: 'CPU and serialization only. No GPU frame-rate, gameplay, or target-hardware claim.',
  chunkSize: api.CHUNK_SIZE, worldHeight: api.WORLD_HEIGHT,
  generationMs: percentiles(genTimes), encodeMs: percentiles(encodeTimes), decodeMs: percentiles(decodeTimes),
  export: { version: exported.version, chunks: chunks.length, bytes: Buffer.byteLength(JSON.stringify(exported)),
    encodeMs: exportEncodeMs, decodeMs: exportDecodeMs },
  references: Object.fromEntries(['src/types.ts', 'src/data/blocks.ts', 'src/data/resonantDefinitions.ts']
    .map(file => [file, hash(readFileSync(path.join(root, file)))])),
  definitions, samples,
};
const destination = path.resolve(root, process.argv[2] ?? 'docs/high-reach/foundation-measurements.json');
mkdirSync(path.dirname(destination), { recursive: true });
writeFileSync(destination, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ output: destination, definitions: definitions.length,
  generationMs: out.generationMs, encodeMs: out.encodeMs, decodeMs: out.decodeMs, export: out.export }, null, 2));
