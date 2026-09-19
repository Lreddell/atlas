// Test helper: bundle a TS entry (with its relative-import graph) into an ESM
// module and import it. The node --test strip-types resolver can't follow
// extensionless relative TS imports, so we bundle with esbuild exactly like
// src/recipes.test.mjs does. Type-only imports are dropped by esbuild, so heavy
// graphs (BlockType enum, ProgressionStore) are never pulled in.
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(import.meta.dirname, '../../../..');

export async function loadTs(entrySource) {
    const bundled = await build({
        absWorkingDir: ROOT,
        bundle: true,
        format: 'esm',
        platform: 'node',
        stdin: { contents: entrySource, resolveDir: ROOT, sourcefile: 'storage-test-entry.ts' },
        write: false,
    });
    const code = bundled.outputFiles[0].text;
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

/**
 * Same as loadTs, but imports through a temp file instead of a data: URL.
 * data: URL imports fail for large bundles (the whole BLOCKS catalog); use
 * this for registry/world modules.
 */
export async function loadTsViaFile(entrySource, tag = 'ts-entry') {
    const bundled = await build({
        absWorkingDir: ROOT,
        bundle: true,
        format: 'esm',
        platform: 'node',
        stdin: { contents: entrySource, resolveDir: ROOT, sourcefile: `${tag}.ts` },
        write: false,
    });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `atlas-${tag}-`));
    const file = path.join(dir, 'entry.mjs');
    fs.writeFileSync(file, bundled.outputFiles[0].text);
    return import(pathToFileURL(file).href);
}
