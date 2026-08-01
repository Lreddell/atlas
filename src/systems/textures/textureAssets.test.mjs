import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { TEXTURE_PATHS } from './textureMapping.ts';
import { getResonantTilePixels } from './resonantTexturePixels.ts';

// Guard against broken texture overrides: a present-but-empty or non-PNG file
// would make the atlas loader log errors and fall back mid-session. Missing
// files are FINE (the procedural atlas is the designed fallback), but any file
// that exists must be a real PNG.
const root = path.resolve(import.meta.dirname, '../../..');
const texRoot = path.join(root, 'public/assets/textures');
const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10];
const resonantGenerator = fs.readFileSync(path.join(root, 'src/systems/textures/resonantTexturePixels.ts'), 'utf8');

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

test('Resonant procedural tiles use authored material patterns rather than a generic circuit stamp', () => {
    assert.doesNotMatch(resonantGenerator, /drawCircuit|pattern:\s*'circuit'/);
    for (const pattern of ['dressed_stone', 'offset_brick', 'carved_inset', 'mosaic', 'mechanism', 'item']) {
        assert.match(resonantGenerator, new RegExp(`'${pattern}'`));
    }
});

test('Echo masonry is readable in low light without turning functional tiles neon', () => {
    const stats = (slot) => {
        const pixels = getResonantTilePixels(slot);
        let luminance = 0;
        let opaque = 0;
        let hot = 0;
        for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index + 3] === 0) continue;
            const value = 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
            luminance += value;
            opaque += 1;
            if (value >= 190) hot += 1;
        }
        return { average: luminance / opaque, hotFraction: hot / opaque };
    };

    assert.ok(stats(237).average >= 80, 'Echo Stone remains too dark');
    assert.ok(stats(238).average >= 70, 'Echo Bricks remain too dark');
    for (let slot = 243; slot <= 252; slot += 1) {
        if (slot === 244) continue; // retired Resonance Door slot paints nothing
        assert.ok(stats(slot).hotFraction <= 0.15, `slot ${slot} uses too much high-value emission`);
    }
});
