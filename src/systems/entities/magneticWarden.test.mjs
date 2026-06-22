import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// The entity modules pull in the BlockType enum + worldManager, so (per repo
// convention) the boss-fight wiring is asserted via source text.
const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const entity = read('src/systems/entities/Entity.ts');
const manager = read('src/systems/entities/EntityManager.ts');
const events = read('src/systems/events/GameEvents.ts');
const interaction = read('src/components/controllers/InteractionController.tsx');
const app = read('src/App.tsx');

test('magnetic_warden boss kind is registered with the shield/polarity/projectile config', () => {
    assert.match(entity, /magnetic_warden:\s*{[\s\S]*?isBoss:\s*true/);
    assert.match(entity, /magnetic_warden:\s*{[\s\S]*?shieldCrystals:\s*4/);
    assert.match(entity, /magnetic_warden:\s*{[\s\S]*?polaritySwapInterval:/);
    assert.match(entity, /magnetic_warden:\s*{[\s\S]*?projectileInterval:/);
    // Entity carries the boss-fight state fields.
    for (const f of ['shielded', 'shieldCrystals', 'polarity', 'polarityTimer', 'projectileTimer']) {
        assert.match(entity, new RegExp(`\\b${f}:`));
    }
    assert.match(entity, /interface Projectile/);
});

test('a shielded boss takes no damage until its crystals are gone', () => {
    // damageEntity early-returns while shielded.
    assert.match(manager, /damageEntity[\s\S]*?if \(e\.shielded\)\s*{[^}]*return;/);
    // onShieldCrystalBroken decrements and drops the shield at 0.
    assert.match(manager, /onShieldCrystalBroken\(regionId/);
    assert.match(manager, /e\.shieldCrystals -= 1/);
    assert.match(manager, /e\.shielded = false;[\s\S]*?'boss:vulnerable'/);
    // Polarity swap + projectile volleys + magnetic-field impulse exist.
    assert.match(manager, /e\.polarity \*= -1/);
    assert.match(manager, /fireVolley/);
    assert.match(manager, /tickProjectiles/);
    assert.match(manager, /playerImpulseHandler/);
});

test('boss-fight events are declared', () => {
    for (const ev of ['boss:shield', 'boss:vulnerable', 'boss:polarity', 'crystal:broken']) {
        assert.match(events, new RegExp(`'${ev.replace(':', ':')}':`));
    }
});

test('summoner right-click opens a confirmation; crystal break weakens the shield', () => {
    // Right-click the summoner → boss_confirm container.
    assert.match(interaction, /MAGNETIC_BOSS_SUMMONER/);
    assert.match(interaction, /type:\s*'boss_confirm'/);
    // Breaking a shield crystal emits crystal:broken with the region.
    assert.match(interaction, /MAGNETIC_SHIELD_CRYSTAL\)\s*{[\s\S]*?'crystal:broken'/);
});

test('App wires the confirmation modal, no-duplicate spawn, and crystal→shield', () => {
    assert.match(app, /BossConfirmModal/);
    // No duplicate boss: spawn only when none of that bossId is alive.
    assert.match(app, /some\(\(e\) => e\.bossId === bossId && e\.hp > 0\)/);
    assert.match(app, /entityManager\.spawn\(bossId/);
    // Crystal break routes to the shield handler; magnetic-field impulse hook wired.
    assert.match(app, /crystal:broken[\s\S]*?onShieldCrystalBroken/);
    assert.match(app, /applyImpulse\(x, y, z\)/);
});

test('defeating the Magnetic Warden cleanses the Magnetic Fields region', () => {
    // Region is configured (bossId magnetic_warden) and boss:defeated → cleanse.
    const regions = read('src/systems/world/regions.ts');
    assert.match(regions, /magnetic_fields:\s*{[\s\S]*?bossId:\s*'magnetic_warden'/);
    assert.match(app, /boss:defeated[\s\S]*?cleanseRegion\(regionId\)/);
});
