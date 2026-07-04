import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const bundled = await build({
    absWorkingDir: root,
    bundle: true,
    format: 'esm',
    platform: 'node',
    stdin: {
        resolveDir: root,
        sourcefile: 'minecraft-inspired-test-entry.ts',
        contents: `
            export { ScheduledTickQueue } from './src/systems/world/simulation/ScheduledTickQueue.ts';
            export { SavedDataRegistry } from './src/systems/world/persistence/SavedDataRegistry.ts';
            export { encodePalettedSection, decodePalettedSection, SECTION_VOLUME } from './src/systems/world/storage/sectionPalette.ts';
            export { RecipeRegistry } from './src/systems/registry/RecipeRegistry.ts';
            export { BlockType } from './src/types.ts';
        `,
    },
    write: false,
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('scheduled ticks are stable, deduplicated, and serializable', () => {
    const queue = new mod.ScheduledTickQueue();
    queue.schedule({ x: 1, y: 2, z: 3, kind: 'fluid', blockType: 7, dueTick: 20 });
    queue.schedule({ x: 1, y: 2, z: 3, kind: 'fluid', blockType: 7, dueTick: 10 });
    queue.schedule({ x: 2, y: 2, z: 3, kind: 'block', blockType: 6, dueTick: 10 });
    assert.equal(queue.size, 2);
    const restored = new mod.ScheduledTickQueue();
    restored.restore(queue.serialize());
    assert.deepEqual(restored.popDue(10, 8).map((tick) => tick.kind), ['fluid', 'block']);
});

test('saved-data registry preserves unknown modules', () => {
    const registry = new mod.SavedDataRegistry();
    registry.load({ 'pack:missing': { version: 4, data: { value: 9 } } });
    assert.deepEqual(registry.save()['pack:missing'], { version: 4, data: { value: 9 } });
});

test('paletted sections round-trip ids above the legacy byte range', () => {
    const values = new Uint16Array(mod.SECTION_VOLUME);
    for (let i = 0; i < values.length; i++) values[i] = i % 7 === 0 ? 700 : i % 3;
    const decoded = mod.decodePalettedSection(mod.encodePalettedSection(values));
    assert.deepEqual(decoded, values);
});

test('runtime recipe registry supports shapeless recipes', () => {
    const recipes = new mod.RecipeRegistry();
    recipes.register({ id: 'test:mixed', type: 'shapeless', width: 2, height: 2,
        ingredients: [{ ids: [mod.BlockType.COAL] }, { ids: [mod.BlockType.STICK] }],
        output: { type: mod.BlockType.TORCH, count: 4 } });
    assert.deepEqual(recipes.match([mod.BlockType.STICK, null, mod.BlockType.COAL, null], 2), { type: mod.BlockType.TORCH, count: 4 });
});
