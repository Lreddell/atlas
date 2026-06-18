import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
    PR19_TEXTURE_ASSETS,
    PR19_TEXTURE_TILES,
    rasterizePixelTile,
} from './pr19TexturePixels.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const blocksSource = fs.readFileSync(path.join(root, 'src/data/blocks.ts'), 'utf8');
const mappingSource = fs.readFileSync(path.join(root, 'src/systems/textures/textureMapping.ts'), 'utf8');

const assignments = {
    POSITIVE_MAGNET: [149, 'blocks/positive_magnet.png'],
    NEGATIVE_MAGNET: [150, 'blocks/negative_magnet.png'],
    IRON_HELMET: [151, 'items/iron_helmet.png'],
    IRON_CHESTPLATE: [152, 'items/iron_chestplate.png'],
    IRON_LEGGINGS: [153, 'items/iron_leggings.png'],
    IRON_BOOTS: [154, 'items/iron_boots.png'],
    POLARITY_BOOTS: [155, 'items/polarity_boots.png'],
};

test('PR 19 items use unique dedicated atlas slots and PNG assets', () => {
    const slots = new Set();

    for (const [blockName, [slot, relativePath]] of Object.entries(assignments)) {
        assert.match(
            blocksSource,
            new RegExp(`BlockType\\.${blockName}\\][^\\n]*textureSlot:\\s*${slot}\\b`),
        );
        assert.match(
            mappingSource,
            new RegExp(`\\b${slot}:\\s*['"]${relativePath.replaceAll('/', '\\/')}['"]`),
        );
        assert.equal(
            fs.existsSync(path.join(root, 'public/assets/textures', relativePath)),
            true,
            `${relativePath} is missing`,
        );
        slots.add(slot);
    }

    assert.equal(slots.size, Object.keys(assignments).length);
});

test('magnet panels use light centered plus and minus symbols', () => {
    const positive = rasterizePixelTile(PR19_TEXTURE_TILES[149]);
    const negative = rasterizePixelTile(PR19_TEXTURE_TILES[150]);
    const pixel = (bytes, x, y) => Array.from(bytes.slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 4));

    assert.deepEqual(pixel(positive, 7, 5), [238, 238, 238, 255]);
    assert.deepEqual(pixel(positive, 5, 7), [238, 238, 238, 255]);
    assert.deepEqual(pixel(negative, 5, 7), [238, 238, 238, 255]);
    assert.notDeepEqual(pixel(negative, 7, 5), [238, 238, 238, 255]);
});

test('armor sprites use the existing Atlas iron palette and transparent background', () => {
    const allowedColors = new Set(['0,0,0,0', '158,158,158,255', '215,204,200,255', '238,238,238,255']);

    for (const slot of [151, 152, 153, 154]) {
        const pixels = rasterizePixelTile(PR19_TEXTURE_TILES[slot]);
        for (let index = 0; index < pixels.length; index += 4) {
            const rgba = Array.from(pixels.slice(index, index + 4)).join(',');
            assert.equal(allowedColors.has(rgba), true, `slot ${slot} contains off-style color ${rgba}`);
        }
    }
});

test('committed PNGs exactly match the shared pixel definitions', () => {
    assert.equal(PR19_TEXTURE_ASSETS.length, 7);
    const result = spawnSync(
        process.execPath,
        [
            '--no-warnings',
            '--experimental-strip-types',
            path.join(root, 'scripts/generate_pr19_textures.mjs'),
            '--check',
        ],
        { cwd: root, encoding: 'utf8' },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
});
