import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

const source = readFileSync(new URL('./PolarityIndicator.tsx', import.meta.url), 'utf8');

test('renders Atlas magnet artwork and explicit polarity labels', () => {
    assert.match(source, /positive_magnet\.png/);
    assert.match(source, /negative_magnet\.png/);
    assert.match(source, /Positive \(R\)/);
    assert.match(source, /Negative \(R\)/);
    assert.match(source, /imageRendering:\s*['"]pixelated['"]/);
});

test('plays the selected polarity event from the mounted indicator listener', () => {
    assert.match(source, /soundManager\.play\(getPolaritySoundEvent\(active\)\)/);
});
