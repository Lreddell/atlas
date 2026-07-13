import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = join(root, '.tmp', 'streaming-tests');
const files = [
  'src/constants.ts',
  'src/systems/world/streamingBudget.ts',
  'src/systems/world/streamingBorders.ts',
  'src/systems/world/streamingEviction.ts',
  'src/systems/world/streamingGuardState.ts',
  'src/systems/world/streamingMetrics.ts',
  'src/systems/world/workers/streamingProtocol.ts',
  'scripts/perf/tests/streamingBudget.test.ts',
  'scripts/perf/tests/streamingBorders.test.ts',
  'scripts/perf/tests/streamingEviction.test.ts',
  'scripts/perf/tests/streamingGuardState.test.ts',
  'scripts/perf/tests/streamingProtocol.test.ts',
  'scripts/perf/tests/streamingMetrics.test.ts',
];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }));

for (const file of files) {
  const inputPath = join(root, file);
  const outputPath = join(outDir, file.replace(/\.ts$/, '.js'));
  const source = readFileSync(inputPath, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: inputPath,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      strict: true,
    },
  });

  const errors = (result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    for (const diagnostic of errors) {
      console.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    }
    process.exit(1);
  }

  const runtimePrelude = file === 'src/constants.ts'
    ? "globalThis.__APP_VERSION__ = 'test';\nglobalThis.__APP_DISPLAY_VERSION__ = 'Test';\n"
    : '';
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, runtimePrelude + result.outputText);
}

const testFiles = files
  .filter((file) => file.endsWith('.test.ts'))
  .map((file) => join(outDir, file.replace(/\.ts$/, '.js')));
const result = spawnSync(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' });
process.exit(result.status ?? 1);
