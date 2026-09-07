import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

const source = readFileSync(new URL('./PolarityIndicator.tsx', import.meta.url), 'utf8');

test('uses a signed magnet icon and an R prompt, with accessible polarity labels', () => {
    assert.match(source, /<svg viewBox="0 0 48 48"/);
    assert.match(source, /view.positive \? 'Positive' : 'Negative'/);
    assert.match(source, /aria-label=/);
    assert.match(source, /<kbd[^>]*>R<\/kbd>/);
    assert.doesNotMatch(source, /bottom-4 right-4|positive_magnet.png/);
});

test('plays the selected polarity event from the mounted indicator listener', () => {
    assert.match(source, /soundManager\.play\(getPolaritySoundEvent\(active\)\)/);
});
