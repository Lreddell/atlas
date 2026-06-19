import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

const managerSource = readFileSync(new URL('./SoundManager.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

test('reloads the manifest without browser cache and invalidates sound buffers', () => {
    assert.match(managerSource, /public async reloadManifest\(\)/);
    assert.match(managerSource, /cache:\s*['"]no-store['"]/);
    assert.match(managerSource, /this\.buffers\.clear\(\)/);
    assert.match(managerSource, /this\.bufferLoadPromises\.clear\(\)/);
});

test('/sound reload uses the real reload path', () => {
    assert.match(appSource, /soundManager\.reloadManifest\(\)/);
    assert.doesNotMatch(
        appSource,
        /parts\[1\]\s*===\s*['"]reload['"][\s\S]{0,120}soundManager\.init\(\)/,
    );
});
