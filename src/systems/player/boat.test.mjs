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
const entity = read('src/systems/entities/Entity.ts');
const manager = read('src/systems/entities/EntityManager.ts');
const renderer = read('src/components/EntityRenderer.tsx');
const storageTypes = read('src/systems/world/storage/types.ts');

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

test('the boat is a real passive world entity with drops', () => {
    // Registered kind: passive (no AI/aggro/combat music), floats, drops its item.
    assert.match(entity, /boat:\s*\{[\s\S]*?id:\s*'boat'[\s\S]*?passive:\s*true[\s\S]*?floats:\s*true[\s\S]*?drops:\s*\[\{\s*type:\s*BlockType\.BOAT/);
    // The manager routes passive kinds to their own tick (no boss/AI logic)...
    assert.match(manager, /if \(kind\.passive\) \{\s*\n\s*this\.tickPassive\(e, kind, dt\);\s*\n\s*continue;/);
    // ...where an unridden floating hull gets buoyancy and a ridden one is
    // driven by the rider's physics.
    assert.match(manager, /private tickPassive\(/);
    assert.match(manager, /if \(e\.ridden\) return;/);
    assert.match(manager, /setRidden\(id: number, ridden: boolean\)/);
    // Renderer draws a dedicated hull model for boats.
    assert.match(renderer, /kind\.id === 'boat' \?/);
    assert.match(renderer, /const BoatModel/);
});

test('placement consumes the item in survival only; boarding is a right-click', () => {
    // Using a held Boat item on water places an entity; success + survival →
    // consume one from the stack (creative keeps it).
    assert.match(interaction, /held\?\.type === BlockType\.BOAT && onPlaceBoat/);
    assert.match(interaction, /if \(onPlaceBoat\(bx, by, bz\) && gameMode === 'survival'\) \{\s*\n\s*consumeItem\(selectedSlotRef\.current\);/);
    // Right-clicking a (visible, unridden) boat entity boards it.
    assert.match(interaction, /entity\?\.kind === 'boat' && !entity\.ridden/);
    assert.match(app, /const handlePlaceBoat = useCallback/);
    assert.match(app, /entityManager\.spawn\('boat'/);
});

test('boat placement follows the sealed-region edit policy', () => {
    // The sealed check runs BEFORE the spawn (and before any item consumption),
    // using the same canPlayerEdit gate (and denial feedback) as block placement.
    const placeIdx = interaction.indexOf("held?.type === BlockType.BOAT && onPlaceBoat");
    const block = interaction.slice(placeIdx, placeIdx + 400);
    const guardIdx = block.indexOf('if (!canPlayerEdit(bx, by, bz)) return;');
    const spawnIdx = block.indexOf('onPlaceBoat(bx, by, bz)');
    assert.ok(guardIdx !== -1, 'boat placement must run the sealed-region edit check');
    assert.ok(spawnIdx !== -1 && guardIdx < spawnIdx, 'the sealed check must precede the spawn/consume');
});

test('riding drives the entity; sneak dismounts and parks it', () => {
    assert.match(player, /boating && intent\.sneak && onExitBoat/);
    assert.match(player, /entityManager\.getEntity\(ridingBoatId\)/);
    assert.match(player, /boat\.yaw = camera\.rotation\.y/);
    // Riding disables block magnetism and wall adhesion (a wooden hull).
    assert.match(player, /magneticMode !== 'none' && !isFlying\.current && !boating/);
    // Dismount keeps the boat in the world (setRidden(false), no despawn).
    assert.match(app, /entityManager\.setRidden\(riding, false\)/);
    // Destroying the ridden boat force-dismounts.
    assert.match(app, /type !== 'boat'/);
});

test('boats persist per world and cannot leak across worlds', () => {
    // WorldMetadata carries an optional boats list (same pattern as progression).
    assert.match(storageTypes, /boats\?:\s*\{ x: number; y: number; z: number; yaw: number \}\[\]/);
    // Saved with every world save, restored after the entity clear on world load.
    assert.match(app, /const boatsData = entityManager\.serializeBoats\(\)/);
    assert.match(app, /meta\.boats = boatsData/);
    assert.match(app, /entityManager\.restoreBoats\(meta\.boats\)/);
    const clearIdx = app.indexOf('entityManager.clear()');
    const restoreIdx = app.indexOf('entityManager.restoreBoats(meta.boats)');
    assert.ok(clearIdx !== -1 && restoreIdx !== -1 && clearIdx < restoreIdx,
        'boats must restore AFTER the previous world\'s entities are cleared');
    // The restore tolerates malformed saves.
    assert.match(manager, /restoreBoats\(boats: unknown\)/);
    assert.match(manager, /Number\.isFinite\(x\)/);
});
