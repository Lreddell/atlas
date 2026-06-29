import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const sources = {
    biomes: read('src/systems/world/biomes.ts'),
    genConfig: read('src/systems/world/genConfig.ts'),
    chunkGeneration: read('src/systems/world/chunkGeneration.ts'),
    music: read('src/systems/sound/MusicController.ts'),
};
const typesSource = read('src/types.ts');
const blocksSource = read('src/data/blocks.ts');

test('Dead Forest is removed from runtime biome routing', () => {
    for (const [name, source] of Object.entries(sources)) {
        assert.doesNotMatch(source, /\bdead_forest\b/i, `${name} still routes dead_forest`);
        assert.doesNotMatch(source, /\bDEAD_FOREST\b/, `${name} still registers DEAD_FOREST`);
        assert.doesNotMatch(source, /\bdeadForest\b/, `${name} still configures deadForest`);
    }
    assert.doesNotMatch(sources.chunkGeneration, /vType === ['"]dead['"]/);
});

test('Coarse Dirt remains save-compatible after Dead Forest removal', () => {
    assert.match(typesSource, /\bCOARSE_DIRT\s*=\s*221\b/);
    assert.match(blocksSource, /\[BlockType\.COARSE_DIRT\]:/);
});
