import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

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
