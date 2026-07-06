import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

const collisionSource = readFileSync(new URL('./playerCollision.ts', import.meta.url), 'utf8');
const constantsSource = readFileSync(new URL('./playerConstants.ts', import.meta.url), 'utf8');

test('standing collision covers the block intersecting the upper body', () => {
    assert.match(constantsSource, /PLAYER_WIDTH\s*=\s*0\.6/);
    assert.match(constantsSource, /PLAYER_HEIGHT\s*=\s*1\.8/);
    assert.match(collisionSource, /const maxY = Math\.floor\(pos\.y \+ height - CONTACT_EPS\)/);
    assert.match(collisionSource, /const playerMaxY = pos\.y \+ height/);
    assert.match(collisionSource, /playerMinY < blockTop && playerMaxY > y/);
});
