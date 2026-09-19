// One-shot generator for the frozen legacy id snapshot.
// Usage: node scripts/gen-legacy-ids.mjs
// Writes src/systems/registry/legacyIds.json. Re-run only when the legacy
// BlockType enum or BLOCKS definitions intentionally change, and review the
// diff: any numeric reassignment is a save-breaking change.
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
    contents: `import { deriveLegacyTable } from './src/systems/registry/blockRegistry.ts';\nexport const table = deriveLegacyTable();\n`,
    resolveDir: root,
    sourcefile: 'gen-legacy-ids-entry.ts',
  },
  write: false,
});
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-legacy-ids-')), 'entry.mjs');
fs.writeFileSync(tmp, bundled.outputFiles[0].text);
const mod = await import(pathToFileURL(tmp).href);
const table = mod.table;
const ids = Object.keys(table).map(Number).sort((a, b) => a - b);
const out = {
  generatedNote: 'Frozen legacy numeric -> namespaced mapping. Do not hand-edit; regenerate via scripts/gen-legacy-ids.mjs.',
  count: ids.length,
  table,
};
fs.writeFileSync(
  path.join(root, 'src/systems/registry/legacyIds.json'),
  JSON.stringify(out, null, 2) + '\n',
);
console.log(`Wrote legacyIds.json with ${ids.length} entries.`);
