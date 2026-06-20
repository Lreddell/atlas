import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
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
const atlasFamiliesSource = fs.readFileSync(path.join(root, 'src/utils/atlasTileFamilies.ts'), 'utf8');
const atlasSource = fs.readFileSync(path.join(root, 'src/utils/textures.ts'), 'utf8');
const resolverSource = fs.readFileSync(path.join(root, 'src/systems/world/textureResolver.ts'), 'utf8');

// Biome wood-family saplings are placeable items that render straight from the
// block atlas (blocks/*_sapling.png), so they intentionally have no dedicated
// items/*.png mapping like the PR 19 tool/armor/ingredient items below.
const BLOCK_TEXTURED_ITEMS = new Set([
    'JUNGLE_SAPLING',
    'DARK_OAK_SAPLING',
    'ACACIA_SAPLING',
]);

const blockEntryStarts = [...blocksSource.matchAll(/^\s*\[BlockType\.([A-Z0-9_]+)\]:/gm)];
const itemEntries = blockEntryStarts.flatMap((match, index) => {
    const body = blocksSource.slice(
        match.index,
        blockEntryStarts[index + 1]?.index ?? blocksSource.length,
    );
    if (!/\bisItem:\s*true\b/.test(body)) return [];
    if (BLOCK_TEXTURED_ITEMS.has(match[1])) return [];
    const slot = Number(body.match(/textureSlot:\s*(\d+)/)?.[1]);
    assert.ok(Number.isInteger(slot), `Unable to parse item slot for ${match[1]}`);
    return [{ type: match[1], slot }];
});

const mappedItemPaths = new Map(
    [...mappingSource.matchAll(/^\s*(\d+):\s*['"](items\/[^'"]+\.png)['"]/gm)]
        .map((match) => [Number(match[1]), match[2]]),
);

const assignments = {
    POSITIVE_MAGNET: [149, 'blocks/positive_magnet.png'],
    NEGATIVE_MAGNET: [150, 'blocks/negative_magnet.png'],
    IRON_HELMET: [151, 'items/iron_helmet.png'],
    IRON_CHESTPLATE: [152, 'items/iron_chestplate.png'],
    IRON_LEGGINGS: [153, 'items/iron_leggings.png'],
    IRON_BOOTS: [154, 'items/iron_boots.png'],
    POLARITY_BOOTS: [155, 'items/polarity_boots.png'],
    IRON_BLOCK: [156, 'blocks/iron_block.png'],
};

const dedicatedArmorSlots = {
    GOLD_HELMET: 157,
    GOLD_CHESTPLATE: 158,
    GOLD_LEGGINGS: 159,
    GOLD_BOOTS: 160,
    DIAMOND_HELMET: 161,
    DIAMOND_CHESTPLATE: 162,
    DIAMOND_LEGGINGS: 163,
    DIAMOND_BOOTS: 164,
    COPPER_HELMET: 165,
    COPPER_CHESTPLATE: 166,
    COPPER_LEGGINGS: 167,
    COPPER_BOOTS: 168,
};

const TOOL_SLOTS = [
    32, 33, 34, 36, 37, 38, 39, 40, 41, 61, 62, 63,
    105, 106, 107, 108, 109, 110, 111, 112,
    113, 114, 115, 116, 117, 118, 119, 120, 121, 122,
];

const SPECIAL_ITEM_SLOTS = [
    35, 48, 49, 50, 51, 55, 57, 59, 60, 67, 73,
    100, 101, 102, 103, 104, 146, 147, 148,
];

const ARMOR_SLOTS = [
    151, 152, 153, 154, 155,
    157, 158, 159, 160,
    161, 162, 163, 164,
    165, 166, 167, 168,
];

const alphaMask = (slot) => {
    const pixels = rasterizePixelTile(PR19_TEXTURE_TILES[slot]);
    return Array.from({ length: 256 }, (_, index) => pixels[index * 4 + 3] > 0 ? 1 : 0);
};

const opaqueCount = (slot) => alphaMask(slot).reduce((total, value) => total + value, 0);

const pixelSignature = (slot) =>
    Buffer.from(rasterizePixelTile(PR19_TEXTURE_TILES[slot])).toString('base64');

test('every non-block item has one unique external PNG mapping', () => {
    assert.equal(itemEntries.length, 66);

    const paths = itemEntries.map(({ type, slot }) => {
        const mappedPath = mappedItemPaths.get(slot);
        assert.ok(mappedPath, `${type} slot ${slot} has no item PNG mapping`);
        return mappedPath;
    });

    assert.equal(new Set(paths).size, paths.length);
});

test('material armor uses dedicated slots instead of ingredient fallbacks', () => {
    for (const [type, slot] of Object.entries(dedicatedArmorSlots)) {
        assert.match(
            blocksSource,
            new RegExp(`BlockType\\.${type}\\][^\\n]*textureSlot:\\s*${slot}\\b`),
        );
    }
});

test('all 30 tool slots have generated assets', () => {
    const generatedSlots = new Set(PR19_TEXTURE_ASSETS.map(({ slot }) => slot));
    TOOL_SLOTS.forEach((slot) => assert.equal(generatedSlots.has(slot), true));
});

test('ingredients, food, plants, and utility items have generated assets', () => {
    const generatedSlots = new Set(PR19_TEXTURE_ASSETS.map(({ slot }) => slot));
    SPECIAL_ITEM_SLOTS.forEach((slot) => assert.equal(generatedSlots.has(slot), true));
});

test('all armor and polarity boots have generated assets', () => {
    const generatedSlots = new Set(PR19_TEXTURE_ASSETS.map(({ slot }) => slot));
    ARMOR_SLOTS.forEach((slot) => assert.equal(generatedSlots.has(slot), true));
});

test('every used atlas slot has a descriptive optional PNG mapping', () => {
    const usedSlots = new Set();
    const collect = (source, pattern) => {
        for (const match of source.matchAll(pattern)) usedSlots.add(Number(match[1]));
    };

    collect(blocksSource, /\btextureSlot:\s*(\d+)/g);
    collect(atlasFamiliesSource, /\bslot:\s*(\d+)/g);
    collect(
        atlasSource,
        /\b(?:withTile|grassTopFallback|grassSideFallback|logTopFallback|logSideFallback|planksFallback|leavesFallback|saplingFallback)\((\d+)/g,
    );
    collect(
        resolverSource,
        /\b(?:texIdx|topTex|sideTex|frontTex)\s*=\s*(\d+)/g,
    );

    for (const slot of [...usedSlots].sort((left, right) => left - right)) {
        const relativePath = [...mappedItemPaths.entries()]
            .find(([mappedSlot]) => mappedSlot === slot)?.[1]
            ?? mappingSource.match(new RegExp(`^\\s*${slot}:\\s*['"]([^'"]+\\.png)['"]`, 'm'))?.[1];
        assert.ok(relativePath, `slot ${slot} has no optional PNG mapping`);
        assert.match(relativePath, /^(?:blocks|items)\/[a-z0-9_]+\.png$/);
    }
});

test('generated catalog contains every item, sapling, and existing PR 19 block', () => {
    assert.equal(PR19_TEXTURE_ASSETS.length, 72);
    assert.equal(new Set(PR19_TEXTURE_ASSETS.map(({ slot }) => slot)).size, 72);
    assert.equal(new Set(PR19_TEXTURE_ASSETS.map(({ path: relativePath }) => relativePath)).size, 72);

    for (const { slot } of PR19_TEXTURE_ASSETS) {
        assert.ok(PR19_TEXTURE_TILES[slot], `slot ${slot} has no pixel definition`);
    }
});

test('every mapped item PNG exists and belongs to the generated catalog', () => {
    const generatedPaths = new Set(PR19_TEXTURE_ASSETS.map(({ path: relativePath }) => relativePath));

    for (const { type, slot } of itemEntries) {
        const relativePath = mappedItemPaths.get(slot);
        assert.ok(relativePath, `${type} has no mapped item path`);
        assert.equal(generatedPaths.has(relativePath), true, `${relativePath} is not generated`);
        assert.equal(
            fs.existsSync(path.join(root, 'public/assets/textures', relativePath)),
            true,
            `${relativePath} is missing`,
        );
    }
});

test('all generated item PNGs are 16x16 RGBA images', () => {
    const itemAssets = PR19_TEXTURE_ASSETS.filter(({ path: relativePath }) =>
        relativePath.startsWith('items/'));
    assert.equal(itemAssets.length, 66);

    for (const { path: relativePath } of itemAssets) {
        const bytes = fs.readFileSync(path.join(root, 'public/assets/textures', relativePath));
        assert.deepEqual(
            Array.from(bytes.subarray(0, 8)),
            [137, 80, 78, 71, 13, 10, 26, 10],
            `${relativePath} is not a PNG`,
        );
        assert.equal(bytes.readUInt32BE(16), 16, `${relativePath} width`);
        assert.equal(bytes.readUInt32BE(20), 16, `${relativePath} height`);
        assert.equal(bytes[24], 8, `${relativePath} bit depth`);
        assert.equal(bytes[25], 6, `${relativePath} color type`);
    }
});

test('all generated PNGs are 16x16 RGBA images', () => {
    for (const { path: relativePath } of PR19_TEXTURE_ASSETS) {
        const bytes = fs.readFileSync(path.join(root, 'public/assets/textures', relativePath));
        assert.deepEqual(
            Array.from(bytes.subarray(0, 8)),
            [137, 80, 78, 71, 13, 10, 26, 10],
            `${relativePath} is not a PNG`,
        );
        assert.equal(bytes.readUInt32BE(16), 16, `${relativePath} width`);
        assert.equal(bytes.readUInt32BE(20), 16, `${relativePath} height`);
        assert.equal(bytes[24], 8, `${relativePath} bit depth`);
        assert.equal(bytes[25], 6, `${relativePath} color type`);
    }
});

test('all item definitions use hard transparent or opaque alpha', () => {
    for (const { slot, path: relativePath } of PR19_TEXTURE_ASSETS) {
        if (!relativePath.startsWith('items/')) continue;
        const pixels = rasterizePixelTile(PR19_TEXTURE_TILES[slot]);
        for (let offset = 3; offset < pixels.length; offset += 4) {
            assert.ok(
                pixels[offset] === 0 || pixels[offset] === 255,
                `${relativePath} has soft alpha ${pixels[offset]}`,
            );
        }
        assert.equal(pixels[3], 0, `${relativePath} top-left corner must be transparent`);
    }
});

test('material variants share silhouettes while retaining distinct palettes', () => {
    const colors = (slot) => {
        const pixels = rasterizePixelTile(PR19_TEXTURE_TILES[slot]);
        return new Set(Array.from({ length: 256 }, (_, index) =>
            Array.from(pixels.slice(index * 4, index * 4 + 4)).join(','))
            .filter((rgba) => rgba !== '0,0,0,0'));
    };

    for (const slots of [
        [32, 33, 34, 61, 113, 118],
        [36, 37, 38, 62, 114, 119],
        [39, 40, 41, 63, 115, 120],
        [105, 107, 109, 111, 116, 121],
        [106, 108, 110, 112, 117, 122],
        [157, 161, 165],
        [158, 162, 166],
        [159, 163, 167],
        [160, 164, 168],
    ]) {
        const expectedMask = alphaMask(slots[0]);
        slots.slice(1).forEach((slot) => assert.deepEqual(alphaMask(slot), expectedMask));
    }

    assert.notDeepEqual(colors(157), colors(161));
    assert.notDeepEqual(colors(157), colors(165));
    assert.notDeepEqual(colors(161), colors(165));
});

test('new wood saplings keep distinct generated artwork', () => {
    assert.equal(new Set([194, 199, 204].map(pixelSignature)).size, 3);
});

test('stick, diamond, and emerald use readable distinct silhouettes', () => {
    assert.ok(opaqueCount(35) >= 30, 'stick must be a readable two-pixel shaft');
    assert.notDeepEqual(alphaMask(102), alphaMask(103));
    assert.ok(opaqueCount(102) >= 40, 'diamond silhouette is too small');
    assert.ok(opaqueCount(103) >= 40, 'emerald silhouette is too small');
});

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

test('Iron Block uses the Atlas iron palette with an opaque paneled face', () => {
    const pixels = rasterizePixelTile(PR19_TEXTURE_TILES[156]);
    const allowedColors = new Set(['117,117,117,255', '158,158,158,255', '215,204,200,255', '238,238,238,255']);

    for (let index = 0; index < pixels.length; index += 4) {
        const rgba = Array.from(pixels.slice(index, index + 4)).join(',');
        assert.equal(allowedColors.has(rgba), true, `Iron Block contains off-style color ${rgba}`);
    }
});

test('committed PNGs exactly match the shared pixel definitions', () => {
    assert.equal(PR19_TEXTURE_ASSETS.length, 72);
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
