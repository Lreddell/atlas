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

test('the player position is not dragged by the cutscene camera (leave = stay put)', () => {
    const player = read('src/components/Player.tsx');
    // PlayerRefUpdater must skip copying the camera while the cinematic owns it, so
    // quitting mid-cutscene saves the spot the player was actually standing.
    assert.match(player, /PlayerRefUpdater[\s\S]*?if \(cinematicMode \|\| bossSummon\.isActive\(\)\) return/);
    assert.match(app, /<PlayerRefUpdater playerPosRef=\{playerPosRef\} cinematicMode=\{cinematicMode\}/);
});

test('deleting a world uses an in-app modal, not a blocking native confirm', () => {
    const hook = read('src/components/ui/mainMenu/useWorldMenu.ts');
    // No native confirm() (it blocks the event loop and breaks text-input focus).
    assert.doesNotMatch(hook, /window\.confirm/);
    assert.match(hook, /setPendingDeleteId/);
    assert.match(hook, /confirmDeleteWorld/);
    const menu = read('src/components/ui/MainMenu.tsx');
    assert.match(menu, /<ConfirmModal/);
    assert.match(menu, /pendingDeleteId &&/);
});

test('polarity flips while sprinting (Ctrl held) and boss death clears all bolts', () => {
    const input = read('src/systems/player/playerInput.ts');
    // KeyR no longer bails when Ctrl/Cmd is held — it suppresses reload but STILL
    // flips polarity (you are usually holding Ctrl to sprint during the fight).
    assert.match(input, /case 'KeyR':[\s\S]*?if \(e && \(e\.ctrlKey \|\| e\.metaKey\)\) e\.preventDefault\(\);[\s\S]*?inputState\.magneticPolarity = inputState\.magneticPolarity >= 0 \? -1 : 1/);
    // The old early-return guard (which ate the swap while sprinting) is gone.
    assert.doesNotMatch(input, /e\.ctrlKey \|\| e\.metaKey\)\) \{ e\.preventDefault\(\); break; \}/);
    // On boss death, lingering bolts + shockwaves are wiped so they can't keep
    // hitting the player during the victory moment.
    assert.match(manager, /addTrauma\(1\.0\);[\s\S]*?this\.projectiles = \[\];[\s\S]*?this\.shockwaves = \[\];/);
});

test('boss phase transitions (50%/25%) telegraph with FX, sound, and bar markers', () => {
    // EntityManager GATES the boss at 50%/25% (clamps HP to the threshold) and
    // erupts + emits boss:phase exactly there, not below.
    assert.match(manager, /Phase gate/);
    assert.match(manager, /e\.hp = e\.maxHp \* thr; phase = ph/);
    assert.match(manager, /gameEvents\.emit\('boss:phase'/);
    assert.match(events, /'boss:phase':/);
    // App plays an enrage cue (editable sound slot).
    assert.match(app, /entity\.magnetic_warden\.enrage/);
    const sounds = read('src/systems/sound/soundDefaults.ts');
    assert.match(sounds, /entity\.magnetic_warden\.enrage/);
    // The boss bar shows 50%/25% phase markers + a pulse on transition.
    const bar = read('src/components/ui/BossBar.tsx');
    assert.match(bar, /left: '50%'/);
    assert.match(bar, /left: '25%'/);
    assert.match(bar, /boss:phase/);
    // The slam goes through a charge windup before launching.
    assert.match(manager, /slamState = 'charging'/);
});

test('slam charges, launches high, homes over the player, and is telegraphed', () => {
    // Windup state + a high launch + frenzy-faster cadence.
    assert.match(entity, /slamChargeTime:/);
    assert.match(entity, /slamRiseHeight: 50/);
    assert.match(entity, /slamTrackSpeed:/);
    assert.match(manager, /private startSlam\(e: Entity, kind: EntityKind, frenzy: boolean\)/);
    assert.match(manager, /frenzy \? 0\.45 : 1/);
    // Homes the boss over the player while airborne (rising + most of the hang).
    assert.match(manager, /private slamTrack\(/);
    assert.match(manager, /if \(pp\) this\.slamTrack\(e, pp, track, dt\)/);
    // The shockwave spawns where the boss actually lands (its tracked x/z).
    assert.match(manager, /spawnShockwave[\s\S]*?x: e\.pos\.x[\s\S]*?z: e\.pos\.z/);
    // A rendered ground indicator (not UI) tracks the boss and flashes near the drop.
    const renderer = read('src/components/EntityRenderer.tsx');
    assert.match(renderer, /Slam landing indicator/);
    assert.match(renderer, /slamRefs/);
    assert.match(renderer, /e\.slamState === 'charging'/);
});

test('cutscene beams feed the ball until detonation; return is snappier; hurt sfx', () => {
    const summon = read('src/systems/boss/bossSummon.ts');
    // Beams persist until the explosion (T_IMPACT), not collapsing when the ball forms.
    assert.match(summon, /t >= T_BEAM && t < T_IMPACT/);
    assert.match(summon, /FLYBACK_DUR = 2\.0/);
    // Flyback flies to the return spot looking at the ball (not the player's old angle).
    assert.match(summon, /this\.camPos\.lerpVectors\(this\._eye, this\.returnPos, k\)/);
    assert.match(summon, /quatLookAt\(this\.camPos, this\.altar, this\.camQuat\)/);
    const cine = read('src/components/BossCinematic.tsx');
    // Beams render regardless of the camera handback (driven by beamProgress).
    assert.match(cine, /cutsceneProg = bossSummon\.beamProgress/);
    // Boss takes-damage hurt cue (e.g. a deflected bolt landing).
    assert.match(app, /entity\.magnetic_warden\.hurt/);
    const sounds = read('src/systems/sound/soundDefaults.ts');
    assert.match(sounds, /entity\.magnetic_warden\.hurt/);
});

test('shield beams track the boss (ender-dragon style) and dissipate per crystal', () => {
    const cine = read('src/components/BossCinematic.tsx');
    // After spawn the beams re-target the boss and track it while the crystal stands.
    assert.match(cine, /e\.isBoss && \(e\.shieldCrystalPositions\?\.length/);
    assert.match(cine, /MAGNETIC_SHIELD_CRYSTAL/);
    assert.match(cine, /boss\.pos\.x, boss\.pos\.y \+ boss\.height \* 0\.5, boss\.pos\.z/);
    // A crystal shatter erupts + the beam fades out, with a dissipate sound in App.
    assert.match(cine, /wasStanding\.current\[i\][\s\S]*?particleFx\.burst/);
    assert.match(app, /entity\.magnetic_warden\.crystal_break/);
    const sounds = read('src/systems/sound/soundDefaults.ts');
    assert.match(sounds, /entity\.magnetic_warden\.crystal_break/);
});

test('boss fight ambiance: polarity vignette + per-phase storm', () => {
    assert.match(app, /<PolarityVignette/);
    const vig = read('src/components/ui/PolarityVignette.tsx');
    assert.match(vig, /boxShadow/);
    assert.match(vig, /magneticPolarity/);
    // Shared phase intensity drives fog + FX storms.
    const phase = read('src/systems/boss/bossPhaseState.ts');
    assert.match(phase, /get intensity/);
    const dn = read('src/components/world/DayNightCycle.tsx');
    assert.match(dn, /bossPhaseState\.intensity/);
    const fx = read('src/components/FxParticles.tsx');
    assert.match(fx, /bossPhaseState\.intensity/);
});

test('frenzy speeds the music up +100 cents, the exact opposite of night', () => {
    const mc = read('src/systems/sound/MusicController.ts');
    assert.match(mc, /FRENZY_PLAYBACK_RATE = 2 \*\* \(1 \/ 12\)/);
    assert.match(mc, /setBossFrenzy/);
    assert.match(mc, /this\.bossFrenzy \? FRENZY_PLAYBACK_RATE/);
    const sm = read('src/systems/sound/SoundManager.ts');
    assert.match(sm, /setMusicPlaybackRate/);
    assert.match(app, /setBossFrenzy\(true\)/);
});

test('a direct boss hit hurts a lot and knockback scales with hit strength', () => {
    assert.match(entity, /contactDamage: 16/);
    // Player knockback scales with damage (heavy hits throw you).
    assert.match(app, /const kb = 6 \+ amount \* 0\.8/);
    // Wrong-polarity slam launches hard.
    assert.match(manager, /playerImpulseHandler\?\.\(ox \* 13, 19, oz \* 13\)/);
    // Slam locks ~0.4s before impact and frenzy flips polarity as a feint.
    assert.match(manager, /e\.slamPhaseTimer > 0\.4/);
    assert.match(manager, /Frenzy FEINT/);
});

test('leaving the world mid-fight resets the arena before saving', () => {
    // A hard reset helper that cancels the cutscene, despawns the boss, clears
    // crystals and rebuilds the dais + bridges...
    assert.match(app, /const resetSummonArena = useCallback/);
    assert.match(app, /resetSummonArena[\s\S]*?bossSummon\.cancel\(\)/);
    assert.match(app, /resetSummonArena[\s\S]*?despawnAllBosses\(\)/);
    // ...invoked when quitting to the title screen, BEFORE the save runs.
    assert.match(app, /resetSummonArena\(\);\s*\n\s*saveGame\(\)/);
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

test('the World Editor surfaces the Magnetic Fields boss biome + boss-field layer', () => {
    const editor = read('src/components/ui/ChunkBase.tsx');
    // A dedicated preview layer for the boss-biome activation noise.
    assert.match(editor, /id: 'boss'/);
    assert.match(editor, /getMagneticFieldColumn/);
    assert.match(editor, /bossBiome\.noise2D/);
    // The biome list is now driven by the full GenConfig set (not a hardcoded 10).
    assert.match(editor, /const biomeKeys = Object\.keys\(GenConfig\.biomes\)/);
    // The Magnetic Fields biome is documented in the BIOMES tab.
    assert.match(editor, /BIOMES\.MAGNETIC_FIELDS\.color/);
    assert.match(editor, /MF_FIELD_THRESHOLD/);
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
