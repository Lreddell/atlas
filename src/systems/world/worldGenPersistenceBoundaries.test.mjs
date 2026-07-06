import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const worldStorageSource = read('src/systems/world/WorldStorage.ts');
const appSource = read('src/App.tsx');

test('world creation normalizes custom config and preserves default-world omission', () => {
    assert.match(worldStorageSource, /normalizeGenConfigSnapshot\(worldGenConfig\)/);
    assert.match(
        worldStorageSource,
        /worldGenConfigSnapshot\s*=\s*worldGenConfig\s*==\s*null\s*\?\s*undefined[\s\S]*?:\s*normalizeGenConfigSnapshot/,
    );
    assert.match(
        worldStorageSource,
        /\.\.\.\(worldGenConfigSnapshot\s*\?\s*\{\s*worldGenConfig:\s*worldGenConfigSnapshot\s*\}\s*:\s*\{\}\)/,
    );
});

test('world loading retains a complete normalized active config snapshot', () => {
    assert.match(appSource, /normalizeGenConfigSnapshot\(meta\.worldGenConfig\)/);
    assert.match(appSource, /activeWorldGenConfigRef\.current\s*=\s*worldGenConfigSnapshot/);
});

test('world saves upgrade custom config without adding config to default worlds', () => {
    assert.match(
        appSource,
        /if\s*\(activeWorldGenConfigRef\.current\)[\s\S]*?normalizeGenConfigSnapshot\(activeWorldGenConfigRef\.current\)[\s\S]*?meta\.worldGenConfig\s*=/,
    );
});
