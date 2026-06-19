import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

const source = readFileSync(new URL('./recipes.ts', import.meta.url), 'utf8');

test('iron ingots compress into an Iron Block', () => {
    assert.match(
        source,
        /push\(\s*3,\s*\[(?:\s*BlockType\.IRON_INGOT\s*,?){9}\s*\],\s*BlockType\.IRON_BLOCK,\s*1\s*\)/s,
    );
});

test('an Iron Block decompresses into nine iron ingots', () => {
    assert.match(
        source,
        /push\(\s*2,\s*\[\s*BlockType\.IRON_BLOCK,\s*null,\s*null,\s*null\s*\],\s*BlockType\.IRON_INGOT,\s*9\s*\)/s,
    );
});
