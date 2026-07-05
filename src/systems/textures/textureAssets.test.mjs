import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { TEXTURE_PATHS } from './textureMapping.ts';

// Guard against broken texture overrides: a present-but-empty or non-PNG file
// would make the atlas loader log errors and fall back mid-session. Missing
// files are FINE (the procedural atlas is the designed fallback), but any file
// that exists must be a real PNG.
const root = path.resolve(import.meta.dirname, '../../..');
const texRoot = path.join(root, 'public/assets/textures');
const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10];

test('every mapped texture path is well-formed', () => {
    for (const [slot, rel] of Object.entries(TEXTURE_PATHS)) {
        assert.match(rel, /^(blocks|items)\/[a-z0-9_]+\.png$/, `slot ${slot} has malformed path ${rel}`);
    }
});

test('every texture file on disk is a non-empty, valid PNG', () => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
    const files = walk(texRoot).filter((f) => f.endsWith('.png'));
    assert.ok(files.length > 50, 'expected the texture asset tree to be populated');
    for (const file of files) {
        const bytes = fs.readFileSync(file);
        assert.ok(bytes.length > 0, `${file} is empty`);
        assert.deepEqual(Array.from(bytes.subarray(0, 8)), PNG_MAGIC, `${file} is not a PNG`);
    }
});

test('mapped files that exist are readable from the mapping', () => {
    let existing = 0;
    for (const rel of Object.values(TEXTURE_PATHS)) {
        const full = path.join(texRoot, rel);
        if (!fs.existsSync(full)) continue; // procedural fallback covers it
        existing++;
        assert.ok(fs.statSync(full).size > 0, `${rel} exists but is empty`);
    }
    assert.ok(existing > 40, 'expected a healthy number of override PNGs to exist');
});
