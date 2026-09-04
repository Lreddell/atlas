import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// The entity modules pull in the BlockType enum + worldManager, so (per repo
// convention) the boss-fight WIRING is asserted via source text here. The fight
// logic itself is exercised directly in systems/boss/magneticWardenCore.test.mjs.
const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const entity = read('src/systems/entities/Entity.ts');
const manager = read('src/systems/entities/EntityManager.ts');
const core = read('src/systems/boss/magneticWardenCore.ts');
const encounter = read('src/systems/boss/MagneticWardenEncounter.ts');
const events = read('src/systems/events/GameEvents.ts');
const interaction = read('src/components/controllers/InteractionController.tsx');
const app = read('src/App.tsx');
const summon = read('src/systems/boss/bossSummon.ts');
const wardenRenderer = read('src/components/MagneticWardenRenderer.tsx');
const entityRenderer = read('src/components/EntityRenderer.tsx');

test('magnetic_warden is a brain-driven boss body: no contact damage, no legacy phase config', () => {
    assert.match(entity, /magnetic_warden:\s*{[\s\S]*?isBoss:\s*true/);
    assert.match(entity, /magnetic_warden:\s*{[\s\S]*?brain:\s*'magnetic_warden'/);
    assert.match(entity, /magnetic_warden:\s*{[\s\S]*?contactDamage:\s*0/);
    assert.match(entity, /magnetic_warden:\s*{[\s\S]*?maxHp:\s*WARDEN_MAX_HP/);
    assert.match(entity, /magnetic_warden:\s*{[\s\S]*?leashRadius:/);
    assert.match(entity, /magnetic_warden:\s*{[\s\S]*?drops:\s*\[\{ type: BlockType\.POLARITY_BOOTS_UPGRADE/);
    // The old inline mechanics are gone from the entity model.
    for (const legacy of ['shieldCrystals', 'slamThreshold', 'parryDamageFraction', 'frenzyThreshold', 'awaitingParry', 'slamState']) {
        assert.doesNotMatch(entity, new RegExp(`\\b${legacy}\\b`));
    }
    // What remains is the polarity surface a brain drives.
    assert.match(entity, /shielded: boolean/);
    assert.match(entity, /polarity: number/);
    assert.match(entity, /field\?: EntityMagneticField \| null/);
});

test('the pure core owns the one rule, the three forms, and the Flux meter, deterministically', () => {
    assert.match(core, /export function polarityRelation\(/);
    assert.match(core, /Same polarity repels\. Opposite attracts\./);
    assert.match(core, /WARDEN_FORM_THRESHOLDS[\s\S]*?\{ 2: 2 \/ 3, 3: 1 \/ 3 \}/);
    assert.match(core, /WARDEN_FORM_NAMES[\s\S]*?Warden[\s\S]*?Aegis[\s\S]*?Storm/);
    for (const action of ["'shatter'", "'storm_rise'", "'plunge_windup'", "'stunned'", "'recoil'", "'draw_active'", "'lash_windup'", "'swap_windup'"]) {
        assert.ok(core.includes(action), `core declares ${action}`);
    }
    assert.match(core, /export const FLUX_MAX = 10/);
    assert.match(core, /export function getWardenBeatInterval/);
    assert.match(core, /export function wardenShardOffsets/);
    assert.match(core, /export function isInWardenCone/);
    // No feints: a polarity swap is its own telegraphed action, and nothing in
    // the fight rolls dice.
    assert.doesNotMatch(core, /Math\.random/);
    assert.match(core, /case 'swap_windup': return enterAction\(flipPolarity\(state, events\), 'swap_recovery', events\)/);
});

test('EntityManager dispatches registered brains and resolves bolts and rings by the polarity rule', () => {
    assert.match(manager, /registerBrain\(kind: string, brain: EntityBrain\)/);
    assert.match(manager, /const brain = kind\.brain \? this\.brains\.get\(kind\.brain\) : undefined;/);
    assert.match(manager, /brain\(e, dt, \{ player: pp, targetable \}\);/);
    // The player's polarity reaches the fixed-step simulation through a provider (0 = no boots).
    assert.match(manager, /polarityProvider\?: \(\) => number/);
    assert.match(manager, /getPlayerPolarity\(\): number/);
    // Bolts: same polarity is repelled and absorbed (Flux), opposite homes and hits.
    assert.match(manager, /polarityRelation\(playerPolarity, p\.polarity\) === 'same'/);
    assert.match(manager, /gameEvents\.emit\('bolt:absorbed'/);
    assert.match(manager, /p\.homing && polarityRelation\(playerPolarity, p\.polarity\) === 'opposite'/);
    // Rings: same is launched + hurt, opposite pinned safe, neutral hurt; flux rings are visual.
    assert.match(manager, /s\.kind === 'polarity' && targetable && pp/);
    assert.match(manager, /if \(relation === 'same'\) \{[\s\S]*?playerImpulseHandler\?\.\(ox \* 13, 19, oz \* 13\)/);
    assert.match(manager, /else if \(relation === 'neutral'\)/);
    // Physics helpers a brain composes, and no leftover inline Warden mechanics.
    for (const helper of ['applyGravity(', 'moveEntity(', 'leashEntity(', 'steerEntity(', 'haltEntity(', 'spawnProjectile(', 'spawnShockwave(', 'clearProjectilesWithin(', 'applyHitReaction(']) {
        assert.ok(manager.includes(helper), `EntityManager exposes ${helper}`);
    }
    for (const legacy of ['tickBossMechanics', 'fireParryBolt', 'deflectProjectile', 'tickSlam', 'onShieldCrystalBroken', 'hitBossWithDeflected', 'slamState']) {
        assert.doesNotMatch(manager, new RegExp(legacy));
    }
    // Contact damage only for kinds that declare it (the Warden declares none).
    assert.match(manager, /kind\.contactDamage > 0 && targetable && pp/);
});

test('the encounter runtime registers as the brain and damage handler and owns the arena', () => {
    assert.match(encounter, /entityManager\.registerBrain\(MAGNETIC_WARDEN_BOSS_ID/);
    assert.match(encounter, /entityManager\.registerDamageHandler\(MAGNETIC_WARDEN_BOSS_ID/);
    for (const ev of ['crystal:broken', 'bolt:absorbed', 'ability:changed', 'boss:cleared', 'boss:defeated']) {
        assert.ok(encounter.includes(`gameEvents.on('${ev}'`), `encounter listens to ${ev}`);
    }
    // Form II re-forms the crystals and lights the climb faces; Form III consumes and strips them.
    assert.match(encounter, /private spawnCrystals[\s\S]*?MAGNETIC_SHIELD_CRYSTAL[\s\S]*?placePillarClimbMagnets/);
    assert.match(encounter, /private consumeCrystals[\s\S]*?BlockType\.AIR[\s\S]*?this\.stripMagnets\(\)/);
    assert.match(encounter, /stripArenaClimbMagnets\(/);
    // A broken crystal yanks the core toward that tower's edge of the platform.
    assert.match(encounter, /this\.crashTarget = event\.reason === 'broken' \? this\.edgeBelowCrystal\(entity, event\.crystal\) : null/);
    // Melee polarity: a repelled strike shoves the player; a stunned core is the punish window.
    assert.match(encounter, /event\.reason === 'repelled' && player/);
    assert.match(encounter, /gameEvents\.emit\('boss:repelled'/);
    // Defeat routes through the manager's drop/eruption path, and any reset cleans the towers.
    assert.match(encounter, /entityManager\.defeatEntity\(entityId\)/);
    assert.match(encounter, /private cleanupArena\(\)/);
    // Telegraph geometry is the hit geometry.
    assert.match(encounter, /isInWardenCone\(\{ x: entity\.pos\.x, y: entity\.pos\.y, z: entity\.pos\.z \}, entity\.yaw, player, range, halfAngle\)/);
    assert.match(encounter, /wardenShardOffsets\(this\.state\.clock\)/);
});

test('the boss-fight events are declared and the parry-era ones are gone', () => {
    for (const ev of ['boss:form', 'boss:action', 'boss:tether', 'boss:tether-snapped', 'boss:crystals', 'boss:beat', 'boss:beat-tick', 'boss:repelled', 'bolt:absorbed', 'flux:changed', 'flux:burst', 'boss:shield', 'boss:polarity', 'boss:phase', 'crystal:broken']) {
        assert.ok(events.includes(`'${ev}':`), `event ${ev} declared`);
    }
    assert.doesNotMatch(events, /'boss:parry'|'boss:deflected'/);
});

test('App attaches the encounter to the summoned boss and feeds it the player polarity', () => {
    assert.match(app, /magneticWardenEncounter\.begin\(boss\.id, \{ centerX, centerZ, baseY, crystals \}\)/);
    assert.match(app, /magneticModeRef\.current === 'controlled' \? inputState\.magneticPolarity : 0/);
    assert.match(app, /some\(\(e\) => e\.bossId === bossId && e\.hp > 0\)/);
    assert.match(app, /bossSummon\.begin\(/);
    // Sound wiring for the new telegraphs and the Flux loop.
    for (const ev of ['boss:action', 'boss:beat-tick', 'boss:beat', 'boss:tether', 'boss:tether-snapped', 'boss:crystals', 'bolt:absorbed', 'flux:changed', 'flux:burst']) {
        assert.ok(app.includes(`gameEvents.on('${ev}'`), `App handles ${ev}`);
    }
    // The old shield/parry/strip plumbing is gone from App.
    assert.doesNotMatch(app, /onShieldCrystalBroken|climbMagnetsActiveRef|boss:parry|stripArenaClimbMagnets/);
    // The Storm still drives the music frenzy, and defeat still cleanses the region.
    assert.match(app, /if \(phase >= 3\) musicController\.setBossFrenzy\(true\)/);
    assert.match(app, /boss:defeated[\s\S]*?region\?\.bossId === bossId[\s\S]*?cleanseRegion\(region\.id\)/);
});

test('melee no longer has a deflect step; a bounced strike still clinks', () => {
    assert.doesNotMatch(interaction, /tryDeflectBolt|deflectProjectile|DEFLECT_REACH/);
    assert.match(interaction, /result === 'blocked' && targetKind === 'magnetic_warden'/);
    assert.match(interaction, /MAGNETIC_SHIELD_CRYSTAL\)\s*{[\s\S]*?'crystal:broken'/);
});

test('the summon cutscene consumes its crystals into the Warden and leaves the towers bare', () => {
    assert.match(summon, /worldManager\.setBlocks\(this\.crystals\.map\(\(c\) => \(\{ x: c\.x, y: c\.y, z: c\.z, type: BlockType\.AIR \}\)\)\)/);
    assert.doesNotMatch(summon, /placePillarClimbMagnets/);
    assert.match(summon, /MAGNETIC_SHIELD_CRYSTAL/);
    assert.match(summon, /flattenArenaBridges/);
    assert.match(summon, /onSpawnBoss\(\)/);
});

test('the Warden renders its own three-form body and telegraphs from the encounter snapshot', () => {
    assert.match(entityRenderer, /'magnetic_warden',\n\]\)/);
    assert.match(entityRenderer, /<MagneticWardenRenderer \/>/);
    assert.match(entityRenderer, /p\.kind === 'spiral' \? 0\.62 : 1/);
    assert.match(entityRenderer, /s\.kind === 'flux' \? FLUX_RING/);
    assert.match(wardenRenderer, /magneticWardenEncounter\.getSnapshot\(\)/);
    // The Lash sector is oriented with the entity yaw convention (verified numerically).
    assert.match(wardenRenderer, /sector\.rotation\.set\(-Math\.PI \/ 2, 0, entity\.yaw\)/);
    assert.match(wardenRenderer, /-Math\.PI \/ 2 - WARDEN_TIMING\.lash\.halfAngle, WARDEN_TIMING\.lash\.halfAngle \* 2/);
    // Draw disc, plunge disc, beat countdown rings, shield shimmer, tether beam, shards.
    for (const ref of ['drawDiscRef', 'plungeDiscRef', 'beatRingRef', 'beatRing2Ref', 'shieldRef', 'tetherRef', 'stormShardRefs', 'wingsRef', 'haloRef']) {
        assert.ok(wardenRenderer.includes(ref), `renderer has ${ref}`);
    }
    assert.match(wardenRenderer, /snap\.shards\[index\]/);
});

test('the HUD reads the forms, the receding tether shield, and the Flux meter', () => {
    const bar = read('src/components/ui/BossBar.tsx');
    assert.match(bar, /magnetic_warden:\s*\[2 \/ 3, 1 \/ 3\]/);
    assert.match(bar, /boss:form/);
    assert.match(bar, /FORM \{FORM_NUMERALS/);
    assert.match(bar, /boss:polarity/);
    assert.match(bar, /shieldPct/);
    const indicator = read('src/components/ui/PolarityIndicator.tsx');
    assert.match(indicator, /flux:changed/);
    assert.match(indicator, /FLUX READY/);
});

test('every new telegraph has a sound slot, documented for the sound pack', () => {
    const sounds = read('src/systems/sound/soundDefaults.ts');
    const readme = read('public/assets/rvx/sounds/magnetic_warden/README.txt');
    for (const slot of ['volley', 'lash', 'draw', 'repel', 'swap_charge', 'stagger', 'shatter', 'tether', 'snap', 'crash', 'stunned', 'storm', 'beat_tick', 'beat', 'absorb', 'flux_full', 'burst', 'hurt', 'defeat', 'enrage', 'crystal_break', 'crystal_spawn']) {
        assert.match(sounds, new RegExp(`entity\\.magnetic_warden\\.${slot}`));
        assert.ok(readme.includes(slot), `README documents ${slot}`);
    }
    assert.doesNotMatch(sounds, /entity\.magnetic_warden\.parry|entity\.magnetic_warden\.deflect"/);
});

test('the Warden field still drives the player physics, with the Draw raising its drift', () => {
    const field = read('src/systems/player/magneticField.ts');
    assert.match(field, /maxDrift\?: number/);
    assert.match(field, /\(s\.maxDrift \?\? BOSS_FIELD_MAX_DRIFT\) \* falloff/);
    const player = read('src/components/Player.tsx');
    assert.match(player, /getMagneticFieldSources\(\)/);
    assert.match(player, /applyBossMagneticFields/);
    assert.match(manager, /maxDrift: e\.field\.maxDrift/);
    assert.match(core, /draw: \{ range: 14, force: 60, maxDrift: 12/);
});

test('player-facing text teaches the one rule', () => {
    const tutorial = read('src/data/tutorial.ts');
    assert.match(tutorial, /Same polarity repels, opposite attracts/);
    assert.match(tutorial, /Flux/);
    const tips = read('src/components/ui/LoadingScreen.tsx');
    assert.match(tips, /Match the Warden/);
    const modal = read('src/components/ui/BossConfirmModal.tsx');
    assert.match(modal, /Same polarity repels, opposite attracts/);
    const changelog = read('CHANGELOG.md');
    assert.match(changelog, /## \[Unreleased\]/);
    assert.match(changelog, /three forms/i);
});

// --- Regression guards carried over from the previous fight's suite ---------

test('the Polarity Boots Upgrade drops, crafts, and grants an N toggle', () => {
    const recipes = read('src/recipes.ts');
    assert.match(recipes, /UPGRADED_POLARITY_BOOTS/);
    const equip = read('src/systems/registry/equipment.ts');
    assert.match(equip, /hasUpgradedPolarityBoots/);
    const input = read('src/systems/player/playerInput.ts');
    assert.match(input, /polarityPowerOn/);
    assert.match(input, /'KeyN'/);
    assert.match(input, /e\.ctrlKey \|\| e\.metaKey[\s\S]*?preventDefault\(\)/);
});

test('the arena has water landing pools and a removable dais; crystals spawn only for a fight', () => {
    const arena = read('src/systems/world/magneticArena.ts');
    assert.match(arena, /buildPillarLandingPools/);
    assert.match(arena, /BlockType\.WATER/);
    assert.match(arena, /getShieldCrystalPositions/);
    assert.doesNotMatch(arena, /ctx\.setBlock\(c\.x, top \+ 2, c\.z, BlockType\.MAGNETIC_SHIELD_CRYSTAL\)/);
    assert.match(arena, /export function flattenArenaDais/);
    assert.match(arena, /export function restoreArenaDais/);
    assert.match(arena, /export function placePillarClimbMagnets/);
    assert.match(arena, /export function stripArenaClimbMagnets/);
});

test('the four causeways drop into the lava during the fight and return after', () => {
    const arena = read('src/systems/world/magneticArena.ts');
    assert.match(arena, /BRIDGE_CELLS/);
    assert.match(arena, /export function flattenArenaBridges/);
    assert.match(arena, /export function restoreArenaBridges/);
    assert.match(summon, /flattenArenaBridges/);
    assert.match(app, /restoreArenaBridges/);
});

test('the player position is not dragged by the cutscene camera (leave = stay put)', () => {
    const player = read('src/components/Player.tsx');
    assert.match(player, /PlayerRefUpdater[\s\S]*?if \(cinematicMode \|\| bossSummon\.isActive\(\)\) return/);
    assert.match(app, /<PlayerRefUpdater playerPosRef=\{playerPosRef\} cinematicMode=\{cinematicMode\}/);
});

test('polarity flips while sprinting (Ctrl held) and boss death clears all bolts', () => {
    const input = read('src/systems/player/playerInput.ts');
    assert.match(input, /case 'KeyR':[\s\S]*?if \(e && \(e\.ctrlKey \|\| e\.metaKey\)\) e\.preventDefault\(\);[\s\S]*?inputState\.magneticPolarity = inputState\.magneticPolarity >= 0 \? -1 : 1/);
    assert.match(manager, /addTrauma\(1\.0\);[\s\S]*?this\.projectiles = \[\];[\s\S]*?this\.shockwaves = \[\];/);
});

test('boss fight ambiance: polarity vignette + per-form storm', () => {
    assert.match(app, /<PolarityVignette/);
    const phase = read('src/systems/boss/bossPhaseState.ts');
    assert.match(phase, /get intensity/);
    const dn = read('src/components/world/DayNightCycle.tsx');
    assert.match(dn, /bossPhaseState\.intensity/);
    const fx = read('src/components/FxParticles.tsx');
    assert.match(fx, /bossPhaseState\.isFrenzy/);
    assert.match(encounter, /gameEvents\.emit\('boss:phase', \{ bossId: MAGNETIC_WARDEN_BOSS_ID, entityId: entity\.id, phase: form \}\)/);
});

test('boss music loops immediately and the Storm speeds it up +100 cents', () => {
    const mc = read('src/systems/sound/MusicController.ts');
    assert.match(mc, /BOSS_MAGNETIC[\s\S]*?nextPlayTime = 0/);
    assert.match(mc, /context === 'BOSS_MAGNETIC'\) return 0/);
    assert.match(mc, /FRENZY_PLAYBACK_RATE = 2 \*\* \(1 \/ 12\)/);
    assert.match(mc, /setBossFrenzy/);
});

test('death or wandering off despawns the boss (bar clears, re-summon at altar)', () => {
    assert.match(manager, /despawnAllBosses\(\)/);
    assert.match(manager, /private despawnBoss\(/);
    assert.match(manager, /'boss:cleared'/);
    assert.match(manager, /BOSS_DESPAWN_RADIUS/);
    assert.match(app, /entityManager\.despawnAllBosses\(\)/);
    // The encounter cleans its towers on that signal.
    assert.match(encounter, /gameEvents\.on\('boss:cleared', \(\) => this\.reset\(\)\)/);
});

test('leaving the world mid-fight resets the arena before saving', () => {
    assert.match(app, /const resetSummonArena = useCallback/);
    assert.match(app, /resetSummonArena[\s\S]*?bossSummon\.cancel\(\)/);
    assert.match(app, /resetSummonArena[\s\S]*?despawnAllBosses\(\)/);
    assert.match(app, /resetSummonArena\(\);[\s\S]{0,120}?saveGame\(\{ force: true \}\)/);
});

test('boss loot erupts above the altar and the altar re-forms after a delay', () => {
    assert.match(manager, /e\.home\.y \+ 4/);
    assert.match(manager, /this\.lootDropTimer = setTimeout\([\s\S]*?spawnDrops\(hx, hy, hz\);[\s\S]*?BOSS_DEFEAT_ALTAR_DELAY_MS/);
    assert.match(manager, /clear\(\): void \{[\s\S]*?clearTimeout\(this\.lootDropTimer\)/);
    assert.match(manager, /if \(e\.kind === 'magnetic_warden' && e\.home\) \{[\s\S]*?particleFx\.burst[\s\S]*?addTrauma\(1\.0\)/);
    assert.match(app, /restoreSummonAltar\(BOSS_DEFEAT_ALTAR_DELAY_MS\)/);
    assert.match(manager, /export const BOSS_DEFEAT_ALTAR_DELAY_MS/);
});

test('arena structural edits are batched (setBlocks) to avoid reset lag', () => {
    const wm = read('src/systems/WorldManager.ts');
    assert.match(wm, /setBlocks\(edits:/);
    const arena = read('src/systems/world/magneticArena.ts');
    assert.match(arena, /setBlocks: \(edits: ArenaEdit\[\]\) => void/);
    assert.match(app, /restoreArenaDais\([\s\S]*?worldManager\.setBlocks\(edits\)/);
    assert.match(encounter, /worldManager\.setBlocks\(/);
});

test('defeating the Magnetic Warden cleanses the Magnetic Fields region', () => {
    const regions = read('src/systems/world/regions.ts');
    assert.match(regions, /magnetic_fields:\s*{[\s\S]*?bossId:\s*'magnetic_warden'/);
});

test('/setspawn sets a personal respawn point like a bed', () => {
    assert.match(app, /parts\[0\] === '\/setspawn'/);
    assert.match(app, /worldManager\.setSpawnPoint\(sx, sy, sz, false\)/);
    const cmds = read('src/data/commands.ts');
    assert.match(cmds, /'\/setspawn'/);
});

test('deleting a world uses an in-app modal, not a blocking native confirm', () => {
    const hook = read('src/components/ui/mainMenu/useWorldMenu.ts');
    assert.doesNotMatch(hook, /window\.confirm/);
    assert.match(hook, /setPendingDeleteId/);
    assert.match(hook, /confirmDeleteWorld/);
    const menu = read('src/components/ui/MainMenu.tsx');
    assert.match(menu, /<ConfirmModal/);
    assert.match(menu, /pendingDeleteId &&/);
});

test('the World Editor surfaces the Magnetic Fields boss biome + boss-field layer', () => {
    const editor = read('src/components/ui/ChunkBase.tsx');
    assert.match(editor, /id: 'boss'/);
    assert.match(editor, /getMagneticFieldColumn/);
    assert.match(editor, /bossBiome\.noise2D/);
    assert.match(editor, /const biomeKeys = Object\.keys\(GenConfig\.biomes\)/);
    assert.match(editor, /BIOMES\.MAGNETIC_FIELDS\.color/);
    assert.match(editor, /bossDomains\.magneticFields/);
    assert.match(editor, /findNearestMagneticField/);
});

test('the Magnetic Fields biome has a thick purple haze, suppressed in the cutscene', () => {
    const dn = read('src/components/world/DayNightCycle.tsx');
    assert.match(dn, /MAGNETIC_FOG_TINT/);
    assert.match(dn, /magneticFogBlendRef/);
    assert.match(dn, /MAGNETIC_FIELDS_BIOME_ID/);
    assert.match(dn, /bossSummon\.isActive\(\)[\s\S]*?magneticFogBlendRef\.current = 0/);
});

test('the summon cutscene orbits, charges an energy ball, then spawns the boss aggro', () => {
    assert.match(summon, /particleFx\.burst/);
    assert.match(summon, /flattenArenaDais/);
    assert.match(summon, /'cinematic:start'/);
    assert.match(summon, /beamProgress/);
    assert.match(summon, /orbitPos/);
    assert.match(summon, /ORBIT_RADIUS/);
    assert.match(summon, /ballScale/);
    assert.match(summon, /firedHandback[\s\S]*?'cinematic:end'/);
    assert.match(summon, /worldManager\.setBlocks/);
    assert.doesNotMatch(app, /aggroGraceSeconds/);
    assert.match(app, /isPaused=\{worldPaused \|\| cinematicMode\}/);
    assert.match(app, /disableMouseLook=\{isCapturingPanorama \|\| cinematicMode\}/);
    assert.match(app, /!cinematicMode && <HeldItem/);
});

test('combat and cutscene use the glowing FX particle system (not block debris)', () => {
    const fx = read('src/systems/fx/particleFx.ts');
    assert.match(fx, /class ParticleFx/);
    assert.match(fx, /polarityFxColor/);
    const renderer = read('src/components/FxParticles.tsx');
    assert.match(renderer, /AdditiveBlending/);
    assert.match(renderer, /MAGNETIC_FIELDS_BIOME_ID/);
    assert.match(app, /<FxParticles/);
    assert.match(encounter, /particleFx\.burst/);
    assert.match(summon, /particleFx\.burst/);
});
