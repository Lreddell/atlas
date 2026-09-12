import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { deflateSync } from 'node:zlib';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const value = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const baselinePath = path.join(root, 'docs/performance/world-baseline.json');
const outputPath = value('--output');
const bundle = await build({
  absWorkingDir: root, bundle: true, format: 'esm', platform: 'node', write: false,
  define: { __APP_VERSION__: '"benchmark"', __APP_DISPLAY_VERSION__: '"benchmark"' },
  stdin: { contents: `export { generateChunk } from './src/systems/world/chunkGeneration';
    export { generateGeometryData } from './src/systems/world/geometry';
    export { reseedGlobalNoise } from './src/utils/noise';
    export { resetGenConfig, GenConfig } from './src/systems/world/genConfig';
    export { BlockType } from './src/types';`, resolveDir: root, sourcefile: 'world-benchmark.ts' },
});
const world = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const names = new Map(Object.entries(world.BlockType).filter(([, id]) => typeof id === 'number').map(([name, id]) => [id, name]));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const measure = (fn, repeats = 5) => {
  const samples = [];
  let result;
  for (let i = 0; i < repeats; i++) { const start = performance.now(); result = fn(); samples.push(performance.now() - start); }
  samples.sort((a, b) => a - b);
  return { medianMs: samples[Math.floor(samples.length / 2)], p95Ms: samples[Math.ceil(samples.length * .95) - 1], result };
};
const metric = ({ medianMs, p95Ms }) => ({ medianMs, p95Ms });
const encodePalette = (blocks, packed) => {
  const palette = [...new Set(blocks)].sort((a, b) => a - b);
  const lookup = new Map(palette.map((id, index) => [id, index]));
  const bits = Math.max(1, Math.ceil(Math.log2(palette.length)));
  const indices = packed ? new Uint8Array(Math.ceil(blocks.length * bits / 8)) : new Uint16Array(blocks.length);
  for (let i = 0; i < blocks.length; i++) {
    const index = lookup.get(blocks[i]);
    if (!packed) { indices[i] = index; continue; }
    const offset = i * bits;
    for (let bit = 0; bit < bits; bit++) if (index & (1 << bit)) indices[(offset + bit) >>> 3] |= 1 << ((offset + bit) & 7);
  }
  return { palette: Uint16Array.from(palette), indices, bits };
};
const sumPacked = encoded => {
  let sum = 0;
  const count = Math.floor(encoded.indices.length * 8 / encoded.bits);
  for (let i = 0; i < count; i++) {
    let index = 0;
    const offset = i * encoded.bits;
    for (let bit = 0; bit < encoded.bits; bit++) index |= ((encoded.indices[(offset + bit) >>> 3] >>> ((offset + bit) & 7)) & 1) << bit;
    sum += encoded.palette[index];
  }
  return sum;
};
const seeds = [12345, 1729, 334033944];
const coordinates = [[0, 0], [1, 0], [-1, -1], [8, 8]];
const samples = [];
world.resetGenConfig();
for (const seed of seeds) {
  world.reseedGlobalNoise(seed);
  for (const [cx, cz] of coordinates) {
    const generated = measure(() => world.generateChunk(cx, cz), 3);
    const chunk = generated.result;
    const blockNames = Array.from(chunk.blocks, id => names.get(id) ?? `unknown:${id}`);
    const sample = {
      seed, cx, cz, voxelCount: chunk.blocks.length,
      semanticSha256: hash(blockNames.join('\0')),
      lightSha256: hash(chunk.light), metadataSha256: hash(chunk.meta),
      distinctBlocks: new Set(blockNames).size,
      blockBytes: chunk.blocks.byteLength, lightBytes: chunk.light.byteLength, metadataBytes: chunk.meta.byteLength,
      generation: metric(generated),
    };
    if (cx === 0 && cz === 0) {
      const blocks16 = Uint16Array.from(chunk.blocks);
      const packed = measure(() => encodePalette(blocks16, true));
      const palette = measure(() => encodePalette(blocks16, false));
      const sum16 = measure(() => { let sum = 0; for (const block of blocks16) sum += block; return sum; }, 20);
      const packedLookup = measure(() => sumPacked(packed.result), 20);
      const paletteLookup = measure(() => { let sum = 0; for (const index of palette.result.indices) sum += palette.result.palette[index]; return sum; }, 20);
      assert.equal(packedLookup.result, sum16.result);
      assert.equal(paletteLookup.result, sum16.result);
      const mesh = measure(() => world.generateGeometryData(cx, cz, chunk.blocks, chunk.meta, {}, { center: chunk.light }), 3);
      const farMesh = measure(() => world.generateGeometryData(cx, cz, chunk.blocks, chunk.meta, {}, { center: chunk.light }, true), 3);
      const geometryBytes = result => Object.values(result).reduce((sum, geo) => sum + Object.values(geo).reduce((n, array) => n + array.byteLength, 0), 0);
      const triangles = result => Object.values(result).reduce((sum, geo) => sum + geo.indices.length / 3, 0);
      sample.representations = {
        uint16: { blockBytes: blocks16.byteLength, compressedBytes: deflateSync(blocks16).byteLength, lookup: metric(sum16) },
        palette16: { blockBytes: palette.result.indices.byteLength + palette.result.palette.byteLength, encode: metric(palette), lookup: metric(paletteLookup) },
        packedPalette: { blockBytes: packed.result.indices.byteLength + packed.result.palette.byteLength, compressedBytes: deflateSync(packed.result.indices).byteLength + packed.result.palette.byteLength, encode: metric(packed), lookup: metric(packedLookup) },
      };
      sample.mesh = { ...metric(mesh), geometryBytes: geometryBytes(mesh.result), triangles: triangles(mesh.result) };
      sample.darkCulledMesh = { ...metric(farMesh), geometryBytes: geometryBytes(farMesh.result), triangles: triangles(farMesh.result) };
    }
    samples.push(sample);
  }
}
const report = {
  format: 1, capturedAt: new Date().toISOString(), node: process.version, cpu: os.cpus()[0]?.model,
  scope: 'CPU deterministic generation and meshing only; not browser/GPU/frame-time evidence. Timings include warmup and are not CI thresholds.',
  configSha256: hash(JSON.stringify(world.GenConfig)), samples,
};
if (args.includes('--capture-baseline')) {
  assert.ok(!fs.existsSync(baselinePath), 'Baseline already exists; never silently replace pre-migration evidence.');
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, JSON.stringify(report, null, 2) + '\n');
} else {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  assert.equal(report.configSha256, baseline.configSha256, 'Worldgen configuration changed');
  for (const actual of samples) {
    const expected = baseline.samples.find(s => s.seed === actual.seed && s.cx === actual.cx && s.cz === actual.cz);
    assert.ok(expected, 'Missing baseline chunk');
    for (const key of ['semanticSha256', 'lightSha256', 'metadataSha256']) assert.equal(actual[key], expected[key], `${key} changed for ${actual.seed}/${actual.cx}/${actual.cz}`);
  }
  report.baselineParity = true;
}
if (outputPath) { const target = path.resolve(root, outputPath); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify({ samples: samples.length, baselineParity: report.baselineParity, output: args.includes('--capture-baseline') ? baselinePath : outputPath, report: outputPath || args.includes('--capture-baseline') ? undefined : report }, null, 2));
