import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// playerConstants.ts is enum-free/erasable → importable directly; the modules
// that touch BlockType are asserted via source text (repo convention).
import {
    BOAT_SPEED, BOAT_FRICTION, BOAT_LAND_SPEED, BOAT_LAND_FRICTION,
    BOAT_BUOYANCY, BOAT_VERTICAL_DAMP,
    SWIM_SPEED, SPRINT_MULTIPLIER, WALK_SPEED,
} from './playerConstants.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const movement = read('src/systems/player/playerMovement.ts');
const player = read('src/components/Player.tsx');
const interaction = read('src/components/controllers/InteractionController.tsx');
const app = read('src/App.tsx');

test('boat speeds make water travel meaningfully faster than swimming', () => {
    assert.ok(BOAT_SPEED > SWIM_SPEED * 2.5, 'boat must be much faster than swimming');
    assert.ok(BOAT_SPEED > WALK_SPEED * SPRINT_MULTIPLIER, 'boat should beat sprinting');
    assert.ok(BOAT_LAND_SPEED < WALK_SPEED, 'a beached boat only scrapes along');
    assert.ok(BOAT_FRICTION > 0.9 && BOAT_FRICTION < 1, 'afloat retention gives a long glide');
    assert.ok(BOAT_LAND_FRICTION < BOAT_FRICTION, 'land scraping bleeds speed fast');
    assert.ok(BOAT_BUOYANCY > 0 && BOAT_VERTICAL_DAMP > 0 && BOAT_VERTICAL_DAMP < 1);
});

test('simulateStep has a boat path: surface glide, buoyancy, no hull jumping', () => {
    assert.match(movement, /boat:\s*boolean\s*=\s*false/);
    assert.match(movement, /boatAfloat\s*\?\s*BOAT_SPEED\s*:\s*BOAT_LAND_SPEED/);
    assert.match(movement, /BOAT_VERTICAL_DAMP/);
    assert.match(movement, /BOAT_BUOYANCY \* dt/);
    // Jumping is disabled while riding (sneak is the dismount).
    assert.match(movement, /intent\.jump && wasGrounded && !boat/);
});

test('boarding and dismounting are wired end to end', () => {
    // Use a held Boat on a water cell to board.
    assert.match(interaction, /held\?\.type === BlockType\.BOAT && onEnterBoat/);
    // Sneak while riding hops out; boat physics feed simulateStep.
    assert.match(player, /boating && intent\.sneak && onExitBoat/);
    assert.match(player, /boating && !isFlying\.current/);
    // Riding disables block magnetism and wall adhesion (a wooden hull).
    assert.match(player, /magneticMode !== 'none' && !isFlying\.current && !boating/);
    // App owns the state, resets it on world switch + respawn, renders the hull
    // and the dismount hint.
    assert.match(app, /const \[boating, setBoating\] = useState\(false\)/);
    assert.match(app, /onEnterBoat=\{handleEnterBoat\}/);
    assert.match(app, /boating=\{boating\} onExitBoat=\{handleExitBoat\}/);
    assert.match(app, /<BoatRig playerPosRef=\{playerPosRef\} \/>/);
    assert.match(app, /hop out of the boat/);
});
