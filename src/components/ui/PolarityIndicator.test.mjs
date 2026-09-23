import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

const source = readFileSync(new URL('./PolarityIndicator.tsx', import.meta.url), 'utf8');

test('restores centered polarity block textures and their switch zoom', () => {
    assert.match(source, /positive_magnet\.png/);
    assert.match(source, /negative_magnet\.png/);
    assert.match(source, /<kbd[^>]*>R<\/kbd>/);
    assert.doesNotMatch(source, /Positive \(R\)|Negative \(R\)/);
    assert.match(source, /imageRendering: 'pixelated'/);
    assert.match(source, /scale-125 brightness-150/);
    assert.match(source, /}, 180\)/);
    assert.doesNotMatch(source, /bottom-4 right-4/);
});

test('plays the selected polarity event from the mounted indicator listener', () => {
    assert.match(source, /soundManager\.play\(getPolaritySoundEvent\(active\)\)/);
});
