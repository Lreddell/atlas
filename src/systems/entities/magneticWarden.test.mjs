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
    // damageEntity blocks (returns 'blocked', no damage) while shielded.
    assert.match(manager, /if \(e\.shielded\)\s*{[^}]*return 'blocked';/);
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

test('the Warden is leashed and refuses to path into the lava moat', () => {
    // Hazard/ledge guard: under its own power it won't step off a ledge or onto lava.
    assert.match(manager, /isSafeGround/);
    assert.match(manager, /BlockType\.LAVA/);
    assert.match(manager, /getSupportTop/);
    // Hard leash containment around the spawn (home).
    assert.match(manager, /applyLeash/);
    assert.match(manager, /home:\s*new THREE\.Vector3/);
    // Movement is guarded only while grounded and not being knocked back.
    assert.match(manager, /const guard = e\.grounded && !preserveKnockback/);
    // The boss kind declares a leash radius and a magnetic field.
    assert.match(entity, /magnetic_warden:\s*{[\s\S]*?leashRadius:/);
    assert.match(entity, /magnetic_warden:\s*{[\s\S]*?magneticFieldRange:/);
});

test('the Warden field is exposed to the player physics and applied with clamping', () => {
    // EntityManager publishes the field as sources for the player to apply.
    assert.match(manager, /getMagneticFieldSources\(\)/);
    // The pure, clamped field math lives in magneticField and is wrapped in magnetism.
    const field = read('src/systems/player/magneticField.ts');
    assert.match(field, /bossFieldVelocityDelta/);
    assert.match(field, /BOSS_FIELD_MAX_DRIFT/);
    const magnetism = read('src/systems/player/magnetism.ts');
    assert.match(magnetism, /applyBossMagneticFields/);
    // The player physics actually applies the boss field each tick.
    const player = read('src/components/Player.tsx');
    assert.match(player, /getMagneticFieldSources\(\)/);
    assert.match(player, /applyBossMagneticFields/);
});

test('polarity swaps shockwave the player, and the boss frenzies at low HP', () => {
    assert.match(manager, /emitPolarityShockwave/);
    // Frenzy below the HP threshold speeds barrages/swaps up.
    assert.match(manager, /const frenzy = !e\.shielded && e\.hp <= e\.maxHp \* \(kind\.frenzyThreshold/);
    assert.match(manager, /frenzy \?/);
    assert.match(entity, /frenzyThreshold:/);
});

test('vulnerable phase loops dodge-barrage then a deflectable parry bolt', () => {
    // Shielded → steady barrage; vulnerable → barrage timer then a parry bolt.
    assert.match(manager, /if \(e\.shielded\) {[\s\S]*?fireVolley/);
    assert.match(manager, /e\.awaitingParry/);
    assert.match(manager, /fireParryBolt/);
    assert.match(manager, /'boss:parry'/);
    // While a parry bolt is live, all NEW fire is held (awaitingParry), but the
    // barrage bolts already in flight are NOT wiped — they stay live until ttl/hit.
    assert.match(manager, /e\.awaitingParry = true/);
    assert.doesNotMatch(manager, /this\.projectiles = this\.projectiles\.filter\(\(p\) => p\.owner === 'player'\)/);
    // The deflectable bolt is purple, slow, boss-owned.
    assert.match(manager, /deflectable: true/);
});

test('the player can deflect a parry bolt back for ~1/12 of the boss HP', () => {
    assert.match(manager, /deflectProjectile\(/);
    assert.match(manager, /best\.owner = 'player'/);
    assert.match(manager, /hitBossWithDeflected/);
    assert.match(manager, /parryDamageFraction/);
    assert.match(entity, /parryDamageFraction:\s*1 \/ 12/);
    // Wired into the left-click handler ahead of mining/attacking.
    assert.match(interaction, /deflectProjectile/);
    assert.match(interaction, /tryDeflectBolt\(\)/);
});

test('phase 2 (≤50% HP) slam creates a polarity shockwave you dodge by swapping', () => {
    // Boss kind declares the slam + a 50% threshold; frenzy stays at 25%.
    assert.match(entity, /slamThreshold:\s*0\.5/);
    assert.match(entity, /frenzyThreshold:\s*0\.25/);
    assert.match(entity, /slamRiseHeight:/);
    assert.match(entity, /interface Shockwave/);
    // EntityManager runs the rise→hang→drop→shockwave machine.
    assert.match(manager, /private startSlam\(/);
    assert.match(manager, /private tickSlam\(/);
    assert.match(manager, /spawnShockwave/);
    assert.match(manager, /tickShockwaves/);
    assert.match(manager, /getShockwaves\(\)/);
    // Same polarity launches + hurts; the impact shakes the camera.
    assert.match(manager, /playerPol === s\.polarity/);
    assert.match(manager, /addTrauma/);
    // The slam is telegraphed via a boss:slam event (rise + impact).
    assert.match(manager, /'boss:slam'/);
    assert.match(events, /'boss:slam':/);
    // The renderer draws expanding shockwave rings + the player shakes.
    const renderer = read('src/components/EntityRenderer.tsx');
    assert.match(renderer, /getShockwaves\(\)/);
    const player = read('src/components/Player.tsx');
    assert.match(player, /sampleShake/);
});

test('the boss health bar tints to the current polarity', () => {
    const bar = read('src/components/ui/BossBar.tsx');
    assert.match(bar, /polarity < 0/);
    assert.match(bar, /boss:polarity/);
});

test('death or wandering off despawns the boss (bar clears, re-summon at altar)', () => {
    assert.match(manager, /despawnAllBosses\(\)/);
    assert.match(manager, /private despawnBoss\(/);
    // Despawn clears any standing crystals (set to AIR) and clears the bar.
    assert.match(manager, /despawnBoss[\s\S]*?BlockType\.AIR/);
    assert.match(manager, /'boss:cleared'/);
    assert.match(manager, /BOSS_DESPAWN_RADIUS/);
    assert.match(app, /entityManager\.despawnAllBosses\(\)/);
    assert.match(app, /getShieldCrystalPositions/);
    assert.match(entity, /shieldCrystalPositions\?/);
});

test('projectiles are softened and a defeat sound cue is wired', () => {
    assert.match(entity, /magnetic_warden:\s*{[\s\S]*?projectileDamage:\s*2/);
    // Boss SFX events exist (editable in the sounds folders).
    const sounds = read('src/systems/sound/soundDefaults.ts');
    for (const ev of ['parry', 'deflect', 'defeat', 'polarity', 'shielded']) {
        assert.match(sounds, new RegExp(`entity\\.magnetic_warden\\.${ev}`));
    }
    assert.match(app, /entity\.magnetic_warden\.defeat/);
});

test('boss music loops immediately with no fade-in', () => {
    const mc = read('src/systems/sound/MusicController.ts');
    assert.match(mc, /BOSS_MAGNETIC[\s\S]*?nextPlayTime = 0/);
    assert.match(mc, /context === 'BOSS_MAGNETIC'\) return 0/);
    assert.match(mc, /enteringBoss/);
});

test('polarity swaps (and their sound) only happen while engaged', () => {
    assert.match(manager, /polaritySwapInterval && pp && targetable && e\.aggro/);
});

test('a blocked hit is distinct: no damage, a shield shimmer, a clink', () => {
    assert.match(manager, /'damaged' \| 'blocked' \| 'none'/);
    assert.match(manager, /shieldHitUntil/);
    assert.match(interaction, /result === 'blocked'/);
    const renderer = read('src/components/EntityRenderer.tsx');
    assert.match(renderer, /shieldHitUntil/);
});

test('the boss bar shows a recedable purple shield layer (no instructional text)', () => {
    const bar = read('src/components/ui/BossBar.tsx');
    assert.match(bar, /shieldPct/);
    assert.match(bar, /boss:polarity/);
    assert.doesNotMatch(bar, /match it to repel/);
    // The bar is no longer hidden by the death screen.
    assert.doesNotMatch(app, /!showDeathScreen && <BossBar/);
});

test('the Polarity Boots Upgrade drops, crafts, and grants an N toggle', () => {
    assert.match(entity, /magnetic_warden:\s*{[\s\S]*?drops:\s*\[\{ type: BlockType\.POLARITY_BOOTS_UPGRADE/);
    const recipes = read('src/recipes.ts');
    assert.match(recipes, /UPGRADED_POLARITY_BOOTS/);
    const equip = read('src/systems/registry/equipment.ts');
    assert.match(equip, /hasUpgradedPolarityBoots/);
    const input = read('src/systems/player/playerInput.ts');
    assert.match(input, /polarityPowerOn/);
    assert.match(input, /'KeyN'/);
    // Ctrl/Cmd+R no longer reloads the page.
    assert.match(input, /e\.ctrlKey \|\| e\.metaKey[\s\S]*?preventDefault\(\)/);
});

test('the arena has water landing pools and a removable dais; crystals spawn later', () => {
    const arena = read('src/systems/world/magneticArena.ts');
    assert.match(arena, /buildPillarLandingPools/);
    assert.match(arena, /BlockType\.WATER/);
    // Crystals are NOT generated with the arena — the summon cutscene spawns them
    // at top+2 (getShieldCrystalPositions), so the arena is empty until you fight.
    assert.match(arena, /getShieldCrystalPositions/);
    assert.doesNotMatch(arena, /ctx\.setBlock\(c\.x, top \+ 2, c\.z, BlockType\.MAGNETIC_SHIELD_CRYSTAL\)/);
    // The dais can be flattened (boss alive) and restored (boss gone).
    assert.match(arena, /export function flattenArenaDais/);
    assert.match(arena, /export function restoreArenaDais/);
});

test('the four causeways drop into the lava during the fight and return after', () => {
    const arena = read('src/systems/world/magneticArena.ts');
    // Bridge cells + flatten/restore helpers exist.
    assert.match(arena, /BRIDGE_CELLS/);
    assert.match(arena, /export function flattenArenaBridges/);
    assert.match(arena, /export function restoreArenaBridges/);
    // Flattened as the boss spawns (sealed in); restored when the boss is gone.
    const summon = read('src/systems/boss/bossSummon.ts');
    assert.match(summon, /flattenArenaBridges/);
    assert.match(app, /restoreArenaBridges/);
});

test('boss loot erupts above the altar and the altar re-forms after a delay', () => {
    // Boss loot drops one block above the altar (summoner at baseY+4 = home.y+3),
    // deferred until the altar re-forms.
    assert.match(manager, /e\.home\.y \+ 4/);
    assert.match(manager, /setTimeout\(\(\) => spawnDrops[\s\S]*?BOSS_DEFEAT_ALTAR_DELAY_MS/);
    // A defeat eruption (glowing FX bursts + camera trauma) at the centre.
    assert.match(manager, /if \(e\.isBoss && e\.home\) {[\s\S]*?particleFx\.burst[\s\S]*?addTrauma/);
    // The altar restore is delayed on a clean defeat (shared delay constant).
    assert.match(app, /restoreSummonAltar\(BOSS_DEFEAT_ALTAR_DELAY_MS\)/);
    assert.match(manager, /export const BOSS_DEFEAT_ALTAR_DELAY_MS/);
    assert.match(app, /daisDelayMs/);
});

test('deflecting is a ghast-style parry and stray barrage bolts live ~5s', () => {
    // Tight parry hit box (skill), not the old generous radius.
    assert.match(manager, /const r = 0\.42/);
    assert.doesNotMatch(manager, /const r = 0\.7;/);
    // The deflected bolt flies along the player's AIM (ghast fireball), not homing.
    assert.match(manager, /best\.vel\.set\(\(dir\.x \/ dl\)/);
    // Volley bolts persist longer in the air (deleted on contact or after ~5s).
    assert.match(manager, /fireVolley[\s\S]*?ttl: 5/);
    // A successful deflect throws glowing sparks + nudges the camera.
    assert.match(manager, /deflectProjectile[\s\S]*?particleFx\.burst[\s\S]*?addTrauma/);
});

test('combat and cutscene use the glowing FX particle system (not block debris)', () => {
    // Effect particles come from the dedicated additive system.
    const fx = read('src/systems/fx/particleFx.ts');
    assert.match(fx, /class ParticleFx/);
    assert.match(fx, /polarityFxColor/);
    const renderer = read('src/components/FxParticles.tsx');
    assert.match(renderer, /AdditiveBlending/);
    assert.match(renderer, /MAGNETIC_FIELDS_BIOME_ID/);   // ambient biome motes
    assert.match(app, /<FxParticles/);
    // The boss fight + cutscene fire FX bursts.
    assert.match(manager, /particleFx\.burst/);
    const summon = read('src/systems/boss/bossSummon.ts');
    assert.match(summon, /particleFx\.burst/);
});

test('the Magnetic Fields biome has a thick purple haze, suppressed in the cutscene', () => {
    const dn = read('src/components/world/DayNightCycle.tsx');
    assert.match(dn, /MAGNETIC_FOG_TINT/);
    assert.match(dn, /magneticFogBlendRef/);
    assert.match(dn, /MAGNETIC_FIELDS_BIOME_ID/);
    // No haze while the summon cutscene owns the camera; it fades back after.
    assert.match(dn, /bossSummon\.isActive\(\)[\s\S]*?magneticFogBlendRef\.current = 0/);
});

test('the summon cutscene orbits, charges an energy ball, then spawns the boss aggro', () => {
    const summon = read('src/systems/boss/bossSummon.ts');
    assert.match(summon, /MAGNETIC_SHIELD_CRYSTAL/);   // crystals spawned during the cutscene
    assert.match(summon, /particleFx\.burst/);         // glowing burst effects
    assert.match(summon, /flattenArenaDais/);          // altar removed as the boss spawns
    assert.match(summon, /onSpawnBoss\(\)/);           // boss spawned at the climax
    assert.match(summon, /'cinematic:start'/);
    assert.match(summon, /beamProgress/);
    // Camera orbits the arena; an energy ball charges after the beams.
    assert.match(summon, /orbitPos/);
    assert.match(summon, /ORBIT_RADIUS/);
    assert.match(summon, /ballScale/);
    // Control hands back BEFORE the boss spawns (the run-away grace is the charge).
    assert.match(summon, /firedHandback[\s\S]*?'cinematic:end'/);
    // Batched structural edits avoid the per-block remesh lag.
    assert.match(summon, /worldManager\.setBlocks/);
    // App plays the cutscene on summon (no instant spawn); the boss spawns aggro.
    assert.match(app, /bossSummon\.begin\(/);
    assert.doesNotMatch(app, /aggroGraceSeconds/);
    // Cinematic pauses the player, disables mouse-look, and hides the held item.
    assert.match(app, /isPaused=\{worldPaused \|\| cinematicMode\}/);
    assert.match(app, /disableMouseLook=\{isCapturingPanorama \|\| cinematicMode\}/);
    assert.match(app, /!cinematicMode && <HeldItem/);
});

test('arena structural edits are batched (setBlocks) to avoid reset lag', () => {
    const wm = read('src/systems/WorldManager.ts');
    assert.match(wm, /setBlocks\(edits:/);
    assert.match(wm, /processStreamingJobs\(\)/);
    const arena = read('src/systems/world/magneticArena.ts');
    assert.match(arena, /setBlocks: \(edits: ArenaEdit\[\]\) => void/);
    assert.match(app, /restoreArenaDais\([\s\S]*?worldManager\.setBlocks\(edits\)/);
});

test('defeating the Magnetic Warden cleanses the Magnetic Fields region', () => {
    // Region is configured (bossId magnetic_warden) and boss:defeated → cleanse.
    const regions = read('src/systems/world/regions.ts');
    assert.match(regions, /magnetic_fields:\s*{[\s\S]*?bossId:\s*'magnetic_warden'/);
    assert.match(app, /boss:defeated[\s\S]*?cleanseRegion\(regionId\)/);
});
