// Deterministic campaign seed corpus (Gate 0 acceptance evidence).
// Usage: node scripts/campaign-seed-corpus.mjs [count]
// Validates across N seeds + edge seeds: fixed region order, Heartwood at
// (0,0), anchor spacing band, determinism (same seed twice), distinctness,
// graph signatures, and site-overlap checks on reserved sample sites.
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
    contents: `export { generateCampaignGraph, validateCampaignGraph, getRegionAnchor, reserveEncounterSite, CAMPAIGN_REGION_ORDER } from './src/systems/campaign/campaignGraph.ts';\n`,
    resolveDir: root,
    sourcefile: 'seed-corpus-entry.ts',
  },
  write: false,
});
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-corpus-')), 'entry.mjs');
fs.writeFileSync(tmp, bundled.outputFiles[0].text);
const { generateCampaignGraph, validateCampaignGraph, getRegionAnchor, reserveEncounterSite, CAMPAIGN_REGION_ORDER } =
  await import(pathToFileURL(tmp).href);

const count = Number(process.argv[2]) || 200;
const seeds = [];
for (let i = 0; i < count; i++) seeds.push((i * 2654435761) >>> 0);
seeds.push(0, 1, 2147483647, 4294967295);

function signature(graph) {
  return graph.anchors.map((a) => `${a.type}:${a.x},${a.z},r${a.radius}`).join('|');
}

let failures = 0;
const reports = [];
const seenSigs = new Set();
for (const seed of seeds) {
  const issues = [];
  const g = generateCampaignGraph(seed, false);
  // Fixed order.
  const order = g.anchors.map((a) => a.type).join(',');
  if (order !== CAMPAIGN_REGION_ORDER.join(',')) issues.push(`order:${order}`);
  // Heartwood origin.
  const hw = getRegionAnchor(g, 'heartwood');
  if (!hw || hw.x !== 0 || hw.z !== 0) issues.push('origin');
  if (!hw || hw.radius <= 0) issues.push('origin-radius');
  // Spacing band between consecutive anchors (design: 1500-3000 useful edge;
  // generator targets 1800-3000 center distance).
  for (let i = 1; i < g.anchors.length; i++) {
    const a = g.anchors[i - 1];
    const b = g.anchors[i];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (!(d >= 1500 && d <= 3400)) issues.push(`spacing-${i}:${Math.round(d)}`);
  }
  // Determinism: regenerate and compare signatures.
  const g2 = generateCampaignGraph(seed, false);
  if (signature(g) !== signature(g2)) issues.push('nondeterministic');
  // Structural validator clean (no sites reserved yet -> no overlaps).
  const structural = validateCampaignGraph(g);
  if (structural.length > 0) issues.push(`structural:${structural.map((s) => s.message).join(';')}`);
  // Reserve 2 sample sites per region at deterministic offsets; the
  // validator must accept them (reachability proxy: every site sits inside
  // its region anchor radius with a valid approach offset).
  const sited = generateCampaignGraph(seed, false);
  let siteIdx = 0;
  for (const anchor of sited.anchors) {
    for (const [ox, oz] of [[200, 0], [-200, 100]]) {
      siteIdx++;
      reserveEncounterSite(sited, {
        id: `sample-${anchor.type}-${siteIdx}`,
        region: anchor.type,
        kind: 'required_boss',
        bossId: `sample:${anchor.type}-boss`,
        x: anchor.x + ox, y: 70, z: anchor.z + oz, radius: 40,
        approachX: anchor.x + ox + 60, approachY: 70, approachZ: anchor.z + oz,
      });
    }
  }
  const siteIssues = validateCampaignGraph(sited);
  if (siteIssues.length > 0) issues.push(`sites:${siteIssues.map((s) => s.message).join(';')}`);
  for (const anchor of sited.anchors) {
    if (anchor.type === 'meridian_engine') continue;
    // Approach must lie within 500m of its site (sane reservation geometry).
    const site = sited.sites.find((s) => s.region === anchor.type);
    if (site && Math.hypot(site.approachX - site.x, site.approachZ - site.z) > 500) {
      issues.push(`approach-${anchor.type}`);
    }
  }
  // Sample site reservations: 2 per region at deterministic offsets; the
  // validator must report no illegal overlaps for the bare graph.
  const sig = signature(g);
  if (seenSigs.has(sig) && seed !== 0) {
    // Collisions across seeds are only a warning (different seeds may still
    // coincide after rounding); record, do not fail.
    reports.push({ seed, warning: 'duplicate-signature' });
  }
  seenSigs.add(sig);
  if (issues.length > 0) {
    failures++;
    reports.push({ seed, issues, sig });
  }
}

console.log(JSON.stringify({
  seeds: seeds.length,
  failures,
  uniqueSignatures: seenSigs.size,
  sampleSignatures: [...seenSigs].slice(0, 3),
  failuresDetail: reports.filter((r) => r.issues).slice(0, 10),
  warnings: reports.filter((r) => r.warning).length,
}, null, 2));
if (failures > 0) process.exit(1);
