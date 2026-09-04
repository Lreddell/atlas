import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// The entity modules pull in the BlockType enum + worldManager, so (per repo
// convention) the boss-fight WIRING is asserted via source text here. The fight
// logic itself is exercised directly in systems/boss/magneticWardenCore.test.mjs,
// the F kit in systems/player/playerMotion.test.mjs, the view rig in
// systems/player/viewRig.test.mjs and the tower flux rule in
// systems/player/climbSurfaces.test.mjs.
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
const player = read('src/components/Player.tsx');
const input = read('src/systems/player/playerInput.ts');

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
    // A bolt bounced off the boots is spent, and the player's slam ring is visual.
    assert.match(entity, /bounced\?: boolean/);
    assert.match(entity, /kind: 'polarity' \| 'slam'/);
});

test('the pure core owns the one rule, the three crystal-shielded forms, and the slam, deterministically', () => {
    assert.match(core, /export function polarityRelation\(/);
    assert.match(core, /Same polarity repels\. Opposite attracts\./);
    assert.match(core, /WARDEN_FORM_THRESHOLDS[\s\S]*?\{ 2: 2 \/ 3, 3: 1 \/ 3 \}/);
    assert.match(core, /WARDEN_FORM_NAMES[\s\S]*?Warden[\s\S]*?Aegis[\s\S]*?Storm/);
    assert.match(core, /WARDEN_FORM_CRYSTALS[\s\S]*?\{ 1: \[0\], 2: \[1, 2\], 3: \[3\] \}/);
    assert.match(core, /export const WARDEN_SLAM_MULTIPLIER = 2\.5/);
    for (const action of ["'shatter'", "'storm_rise'", "'plunge_windup'", "'shield_break'", "'flinch'", "'charge_windup'", "'recoil'", "'draw_active'", "'lash_windup'", "'swap_windup'"]) {
        assert.ok(core.includes(action), `core declares ${action}`);
    }
    // The shield is layers of standing crystals: nothing decays it, only a break.
    assert.match(core, /return state\.shieldLayers > 0;/);
    assert.doesNotMatch(core, /FLUX_MAX|tether|burnout|bolt-absorbed/);
    assert.match(core, /export function wardenLiveTowers/);
    assert.match(core, /export function isInWardenLane/);
    assert.match(core, /export function getWardenBeatInterval/);
    assert.match(core, /export function wardenShardOffsets/);
    assert.match(core, /export function isInWardenCone/);
    // Every swap and beat carries the towers that flip with it.
    assert.match(core, /events\.push\(\{ type: 'polarity', polarity, towers: wardenLiveTowers\(state\) \}\)/);
    // No feints: a polarity swap is its own telegraphed action, and nothing in
    // the fight rolls dice.
    assert.doesNotMatch(core, /Math\.random/);
    assert.match(core, /case 'swap_windup': return enterAction\(flipPolarity\(state, events\), 'swap_recovery', events\)/);
});

test('EntityManager dispatches registered brains and resolves bolts, rings and i-frames by the rule', () => {
    assert.match(manager, /registerBrain\(kind: string, brain: EntityBrain\)/);
    assert.match(manager, /const brain = kind\.brain \? this\.brains\.get\(kind\.brain\) : undefined;/);
    assert.match(manager, /brain\(e, dt, \{ player: pp, targetable \}\);/);
    // The player's polarity and invulnerability reach the fixed-step simulation through providers.
    assert.match(manager, /polarityProvider\?: \(\) => number/);
    assert.match(manager, /invulnerableProvider\?: \(\) => boolean/);
    assert.match(manager, /getPlayerPolarity\(\): number/);
    assert.match(manager, /tryDamagePlayer\(amount: number, knockX: number, knockZ: number, source: PlayerHitSource = 'attack'\): boolean/);
    assert.match(manager, /gameEvents\.emit\('player:dodged', \{ source \}\)/);
    // Bolts: same polarity bounces (spent), opposite homes and hits, a roll lets it pass.
    assert.match(manager, /polarityRelation\(playerPolarity, p\.polarity\) === 'same'/);
    assert.match(manager, /p\.bounced = true;/);
    assert.match(manager, /gameEvents\.emit\('bolt:repelled'/);
    assert.match(manager, /p\.homing && !p\.bounced && polarityRelation\(playerPolarity, p\.polarity\) === 'opposite'/);
    assert.match(manager, /gameEvents\.emit\('player:dodged', \{ source: 'bolt' \}\)/);
    // Rings: opposite pinned safe, a roll dodges, same is launched + hurt, neutral hurt.
    assert.match(manager, /s\.kind === 'polarity' && targetable && pp/);
    assert.match(manager, /if \(relation === 'opposite'\) continue; \/\/ pinned safe/);
    assert.match(manager, /gameEvents\.emit\('player:dodged', \{ source: 'ring' \}\)/);
    assert.match(manager, /if \(relation === 'same'\) \{[\s\S]*?playerImpulseHandler\?\.\(ox \* 13, 19, oz \* 13\)/);
    // Contact damage goes through the same gate, only for kinds that declare it.
    assert.match(manager, /this\.tryDamagePlayer\(kind\.contactDamage, pp\.x - e\.pos\.x, pp\.z - e\.pos\.z, 'contact'\)/);
    // Physics helpers a brain composes, the boss lookup the kit uses, and no leftover inline Warden mechanics.
    for (const helper of ['applyGravity(', 'moveEntity(', 'leashEntity(', 'steerEntity(', 'haltEntity(', 'spawnProjectile(', 'spawnShockwave(', 'applyHitReaction(', 'findBoss(']) {
        assert.ok(manager.includes(helper), `EntityManager exposes ${helper}`);
    }
    for (const legacy of ['tickBossMechanics', 'fireParryBolt', 'deflectProjectile', 'tickSlam', 'onShieldCrystalBroken', 'hitBossWithDeflected', 'slamState', 'bolt:absorbed']) {
        assert.doesNotMatch(manager, new RegExp(legacy));
    }
});

test('the encounter runtime registers as the brain and damage handler and owns the towers', () => {
    assert.match(encounter, /entityManager\.registerBrain\(MAGNETIC_WARDEN_BOSS_ID/);
    assert.match(encounter, /entityManager\.registerDamageHandler\(MAGNETIC_WARDEN_BOSS_ID/);
    for (const ev of ['crystal:broken', 'boss:cleared', 'boss:defeated']) {
        assert.ok(encounter.includes(`gameEvents.on('${ev}'`), `encounter listens to ${ev}`);
    }
    // Each form ignites its crystals and lights their towers in the Warden's polarity.
    assert.match(encounter, /private igniteTowers[\s\S]*?MAGNETIC_SHIELD_CRYSTAL[\s\S]*?this\.setTowerPolarity\(index, polarity\)/);
    assert.match(encounter, /placePillarClimbMagnets\(centerX, centerZ, baseY, index, \(edits\) => worldManager\.setBlocks\(edits\), polarity\)/);
    // Swaps, beats and double beats open the flux window; the flip rewrites the faces.
    assert.match(encounter, /if \(event\.action === 'swap_windup'\) \{[\s\S]*?this\.openFlux\(wardenLiveTowers\(this\.state\)/);
    assert.match(encounter, /case 'beat-tick':[\s\S]*?this\.openFlux\(event\.towers, event\.nextPolarity/);
    assert.match(encounter, /if \(event\.double && !event\.second\) \{[\s\S]*?this\.openFlux\(/);
    assert.match(encounter, /case 'polarity':[\s\S]*?this\.flipTowers\(event\.towers, event\.polarity, entity\)/);
    assert.match(encounter, /climbSurfaces\.setFlux\(/);
    // A felled tower goes dark only once the climber is clear; a reset strips everything.
    assert.match(encounter, /private retireClearedTowers/);
    assert.match(encounter, /stripPillarClimbMagnets\(/);
    assert.match(encounter, /stripArenaClimbMagnets\(/);
    assert.match(encounter, /climbSurfaces\.clearAll\(\)/);
    // The Aegis contests the climbed tower, and a broken shield sends it to that tower's pool.
    assert.match(encounter, /private towerNearPlayer/);
    assert.match(encounter, /private contestPoint/);
    assert.match(encounter, /case 'shield-broken':[\s\S]*?this\.crashTarget = this\.edgeBelowCrystal\(entity, event\.crystal\)/);
    // The Charge lunges down its locked lane and lands one hit; the slam hit zone reaches the core.
    assert.match(encounter, /if \(s\.action === 'charge_active'\) \{[\s\S]*?WARDEN_TIMING\.charge\.speed/);
    assert.match(encounter, /export const MAGNET_SLAM_HIT_ZONE = 'magnet_slam'/);
    assert.match(encounter, /const slam = hitZone === MAGNET_SLAM_HIT_ZONE;/);
    assert.match(encounter, /\{ type: 'damage', amount, playerPolarity: entityManager\.getPlayerPolarity\(\), slam \}/);
    // Every attack on the player goes through the i-frame gate.
    assert.match(encounter, /entityManager\.tryDamagePlayer\(damage, fx, fz, 'attack'\)/);
    assert.doesNotMatch(encounter, /entityManager\.damagePlayer\(/);
    // Melee polarity: a repelled strike shoves the player.
    assert.match(encounter, /event\.reason === 'repelled' && player/);
    assert.match(encounter, /gameEvents\.emit\('boss:repelled'/);
    // Defeat routes through the manager's drop/eruption path.
    assert.match(encounter, /entityManager\.defeatEntity\(entityId\)/);
    // Telegraph geometry is the hit geometry.
    assert.match(encounter, /isInWardenCone\(\{ x: entity\.pos\.x, y: entity\.pos\.y, z: entity\.pos\.z \}, entity\.yaw, player, range, halfAngle\)/);
    assert.match(encounter, /wardenShardOffsets\(this\.state\.clock\)/);
    assert.doesNotMatch(encounter, /tether|FLUX_MAX|flux:changed|bolt-absorbed/);
});

test('the boss-fight and kit events are declared, and the Flux / tether / parry ones are gone', () => {
    for (const ev of ['boss:form', 'boss:action', 'boss:crystals', 'boss:crystal-lost', 'boss:shield-broken', 'boss:towers', 'boss:charge', 'boss:beat', 'boss:beat-tick', 'boss:repelled', 'bolt:repelled', 'boss:shield', 'boss:polarity', 'boss:phase', 'crystal:broken', 'player:dodge', 'player:dodged', 'player:surge', 'player:slam', 'player:shocked', 'player:damaged', 'view:changed']) {
        assert.ok(events.includes(`'${ev}':`), `event ${ev} declared`);
    }
    assert.doesNotMatch(events, /'boss:parry'|'boss:deflected'|'boss:tether'|'flux:changed'|'flux:burst'|'bolt:absorbed'/);
});

test('App attaches the encounter to the summoned boss and feeds it the player polarity and i-frames', () => {
    assert.match(app, /magneticWardenEncounter\.begin\(boss\.id, \{ centerX, centerZ, baseY, crystals \}\)/);
    assert.match(app, /magneticModeRef\.current === 'controlled' \? inputState\.magneticPolarity : 0/);
    assert.match(app, /\(\) => motionStatus\.invulnerable/);
    assert.match(app, /some\(\(e\) => e\.bossId === bossId && e\.hp > 0\)/);
    assert.match(app, /bossSummon\.begin\(/);
    assert.match(app, /gameEvents\.emit\('player:damaged', \{ amount: d \}\)/);
    // Sound wiring for the telegraphs, the towers and the kit.
    for (const ev of ['boss:action', 'boss:charge', 'boss:beat-tick', 'boss:beat', 'boss:crystals', 'boss:crystal-lost', 'boss:shield-broken', 'boss:towers', 'bolt:repelled', 'player:dodge', 'player:dodged', 'player:surge', 'player:slam', 'player:shocked', 'view:changed']) {
        assert.ok(app.includes(`gameEvents.on('${ev}'`), `App handles ${ev}`);
    }
    // The fight frames itself in third person and hands the view back; the held item hides behind the camera.
    assert.match(app, /preFightViewRef\.current = viewRig\.mode;[\s\S]*?viewRig\.mode = 'third';/);
    assert.match(app, /viewMode !== 'third' && <HeldItem/);
    assert.match(app, /<BossCompass \/>/);
    // The old shield/parry/strip/Flux plumbing is gone from App.
    assert.doesNotMatch(app, /onShieldCrystalBroken|climbMagnetsActiveRef|boss:parry|stripArenaClimbMagnets|flux:|boss:tether/);
    // The Storm still drives the music frenzy, and defeat still cleanses the region.
    assert.match(app, /if \(phase >= 3\) musicController\.setBossFrenzy\(true\)/);
    assert.match(app, /boss:defeated[\s\S]*?region\?\.bossId === bossId[\s\S]*?cleanseRegion\(region\.id\)/);
});

test('melee aims from the eye, loads a Magnet Slam, and a bounced strike still clinks', () => {
    assert.doesNotMatch(interaction, /tryDeflectBolt|deflectProjectile|DEFLECT_REACH/);
    assert.match(interaction, /function aimFromCamera\(camera: THREE\.Camera\)/);
    assert.match(interaction, /const slam = motionStatus\.surge && struckEntity\?\.isBoss === true;/);
    assert.match(interaction, /slam \? MAGNET_SLAM_HIT_ZONE : hit\.hitZone/);
    assert.match(interaction, /motionRequests\.consumeSurge = true/);
    assert.match(interaction, /result === 'blocked' && targetKind === 'magnetic_warden'/);
    assert.match(interaction, /MAGNETIC_SHIELD_CRYSTAL\)\s*{[\s\S]*?'crystal:broken'/);
    // No gameplay ray starts at the camera any more: the only camera-position
    // read left is the first-person branch of the eye helper itself.
    assert.equal((interaction.match(/camera\.position\.clone\(\)/g) ?? []).length, 1);
    assert.match(interaction, /function eyePosition\(camera: THREE\.Camera\)/);
});

test('the player owns the F kit, the flux grace, the magnetic launch and the third-person rig', () => {
    // F and F5 are one-shot triggers, intercepted so F5 never reloads the page.
    assert.match(input, /'KeyF', 'F5'\]/);
    assert.match(input, /case 'KeyF':[\s\S]*?inputState\.dodgeTrigger = true/);
    assert.match(input, /case 'F5':[\s\S]*?inputState\.viewToggleTrigger = true/);
    // The kit resolves once per frame inside the fixed loop and owns the body during a roll or dash.
    assert.match(player, /pressKit\(intent, height\)/);
    assert.match(player, /const kitOwnsBody = motion\.current\.action === 'roll' \|\| motion\.current\.action === 'dash';/);
    assert.match(player, /\? stepKitMotion\(height\)/);
    assert.match(player, /motion\.current = ontoBoss \? armSurge\(endMotion\(m\)\) : endMotion\(m\);/);
    // A flip while the tower is in flux re-grips; otherwise it is the magnetic launch with an arc.
    assert.match(player, /if \(climbSurfaces\.inFlux\(a\.blockX, a\.blockY, a\.blockZ, climbSurfaces\.clock\)\)/);
    assert.match(player, /detachWall\('polarity-flip', ADHESION_POLARITY_LAUNCH_SPEED, ADHESION_LAUNCH_UP\)/);
    assert.match(player, /detachWall\('launch', ADHESION_POLARITY_LAUNCH_SPEED, ADHESION_LAUNCH_UP\)/);
    // A settled tower throws a mismatched climber toward the platform and stings.
    assert.match(player, /climbSurfaces\.shockAt\(/);
    assert.match(player, /CLIMB_SHOCK_LAUNCH_SPEED/);
    assert.match(player, /applyDamage\(CLIMB_SHOCK_DAMAGE\)/);
    // The adhesion scan honours the flux rule.
    assert.match(player, /findAdhesionCandidate\(magnetPolarityAt, solidAt, center, inputState\.magneticPolarity, undefined, attractiveAt\)/);
    // The rig: the eye is published for every consumer, the camera hangs on the spring arm in third person.
    assert.match(player, /viewRig\.eye\.x = eyeX;/);
    assert.match(player, /placeThirdPersonCamera\(/);
    assert.match(player, /playerPosRef\.current\.set\(viewRig\.eye\.x, viewRig\.eye\.y - eyeHeight, viewRig\.eye\.z\)/);
    assert.match(player, /writeMotionStatus\(motion\.current, prompt\)/);
    // The other camera consumers read the eye too.
    assert.match(read('src/components/CameraControls.tsx'), /viewRig\.third/);
    assert.match(read('src/components/ResonantVaultController.tsx'), /viewRig\.third \? viewRig\.eye : camera\.position/);
});

test('the summon cutscene consumes its crystals into the Warden and leaves the towers bare', () => {
    assert.match(summon, /worldManager\.setBlocks\(this\.crystals\.map\(\(c\) => \(\{ x: c\.x, y: c\.y, z: c\.z, type: BlockType\.AIR \}\)\)\)/);
    assert.doesNotMatch(summon, /placePillarClimbMagnets/);
    assert.match(summon, /MAGNETIC_SHIELD_CRYSTAL/);
    assert.match(summon, /flattenArenaBridges/);
    assert.match(summon, /onSpawnBoss\(\)/);
});

test('the Warden renders its three-form body, the tower shield, and every telegraph from the snapshot', () => {
    assert.match(entityRenderer, /'magnetic_warden',\n\]\)/);
    assert.match(entityRenderer, /<MagneticWardenRenderer \/>/);
    assert.match(entityRenderer, /<PlayerModel \/>/);
    assert.match(entityRenderer, /<BossCompassTracker \/>/);
    assert.match(entityRenderer, /p\.kind === 'spiral' \? 0\.62 : 1/);
    assert.match(entityRenderer, /s\.kind === 'slam' \? SLAM_RING/);
    assert.match(wardenRenderer, /magneticWardenEncounter\.getSnapshot\(\)/);
    // The Lash sector is oriented with the entity yaw convention (verified numerically).
    assert.match(wardenRenderer, /sector\.rotation\.set\(-Math\.PI \/ 2, 0, entity\.yaw\)/);
    assert.match(wardenRenderer, /-Math\.PI \/ 2 - WARDEN_TIMING\.lash\.halfAngle, WARDEN_TIMING\.lash\.halfAngle \* 2/);
    // Draw disc, charge lane, plunge disc, beat countdown rings, shield shimmer, shards, the towers.
    for (const ref of ['drawDiscRef', 'chargeLaneRef', 'plungeDiscRef', 'beatRingRef', 'beatRing2Ref', 'shieldRef', 'beamRefs', 'towerRefs', 'crystalGlowRefs', 'stormShardRefs', 'wingsRef', 'haloRef']) {
        assert.ok(wardenRenderer.includes(ref), `renderer has ${ref}`);
    }
    assert.match(wardenRenderer, /snap\.shards\[index\]/);
    assert.match(wardenRenderer, /snap\.towers\.find\(\(tw\) => tw\.index === index\)/);
    assert.doesNotMatch(wardenRenderer, /tether|snap\.flux|snap\.stunned/);
    // The player body is a procedurally animated voxel model shown only in third person.
    const model = read('src/components/PlayerModel.tsx');
    assert.match(model, /root\.visible = viewRig\.showModel;/);
    for (const pose of ["action === 'roll'", "action === 'dash'", 'pose.attached', 'pose.sprint', 'pose.sneak']) {
        assert.ok(model.includes(pose), `player model animates ${pose}`);
    }
});

test('the HUD reads the forms, the crystal shield, the F prompt, the slam and the tower flip warning', () => {
    const bar = read('src/components/ui/BossBar.tsx');
    assert.match(bar, /magnetic_warden:\s*\[2 \/ 3, 1 \/ 3\]/);
    assert.match(bar, /boss:form/);
    assert.match(bar, /FORM \{FORM_NUMERALS/);
    assert.match(bar, /boss:polarity/);
    assert.match(bar, /boss:crystal-lost/);
    assert.match(bar, /SHIELDED/);
    assert.match(bar, /EXPOSED/);
    const indicator = read('src/components/ui/PolarityIndicator.tsx');
    assert.match(indicator, /motionStatus\.prompt/);
    assert.match(indicator, /MAGNET SLAM READY/);
    assert.match(indicator, /TOWER FLIPPING · flip \(R\) to hold/);
    assert.match(indicator, /climbSurfaces\.attachedZone/);
    assert.doesNotMatch(indicator, /flux:changed|FLUX READY/);
    const compass = read('src/components/ui/BossCompass.tsx');
    assert.match(compass, /bossCompassState/);
});

test('every telegraph and every kit move has a sound slot, documented for the sound pack', () => {
    const sounds = read('src/systems/sound/soundDefaults.ts');
    const readme = read('public/assets/rvx/sounds/magnetic_warden/README.txt');
    for (const slot of ['volley', 'lash', 'draw', 'repel', 'swap_charge', 'stagger', 'charge_windup', 'charge_lunge', 'crystal_ignite', 'flinch', 'shield_break', 'tower_flux', 'tower_flip', 'shatter', 'crash', 'storm', 'beat_tick', 'beat', 'repelled', 'hurt', 'defeat', 'enrage', 'crystal_break', 'crystal_spawn']) {
        assert.match(sounds, new RegExp(`entity\\.magnetic_warden\\.${slot}`));
        assert.ok(readme.includes(slot), `README documents ${slot}`);
    }
    for (const slot of ['roll', 'dash', 'leap', 'launch', 'dodged', 'surge', 'slam', 'shocked']) {
        assert.match(sounds, new RegExp(`entity\\.player\\.${slot}`));
        assert.ok(readme.includes(slot), `README documents the kit's ${slot}`);
    }
    assert.doesNotMatch(sounds, /entity\.magnetic_warden\.parry|entity\.magnetic_warden\.deflect"|flux_full|\.absorb|\.tether|\.snap"|\.stunned/);
});

test('the Warden field still drives the player physics, with the Draw raising its drift', () => {
    const field = read('src/systems/player/magneticField.ts');
    assert.match(field, /maxDrift\?: number/);
    assert.match(field, /\(s\.maxDrift \?\? BOSS_FIELD_MAX_DRIFT\) \* falloff/);
    assert.match(player, /getMagneticFieldSources\(\)/);
    assert.match(player, /applyBossMagneticFields/);
    assert.match(manager, /maxDrift: e\.field\.maxDrift/);
    assert.match(core, /draw: \{ range: 14, force: 60, maxDrift: 12/);
});

test('the arena lights one tower at a time in a chosen polarity and exposes each tower\'s face bounds', () => {
    const arena = read('src/systems/world/magneticArena.ts');
    assert.match(arena, /export function collectClimbFaceCells\([\s\S]*?polarity\?: number/);
    assert.match(arena, /export function placePillarClimbMagnets\([\s\S]*?polarity\?: number/);
    assert.match(arena, /export function stripPillarClimbMagnets/);
    assert.match(arena, /export function getPillarClimbFaceBounds/);
});

test('player-facing text teaches the one rule, the crystal shields, the towers and the kit', () => {
    const tutorial = read('src/data/tutorial.ts');
    assert.match(tutorial, /Same polarity repels, opposite attracts/);
    assert.match(tutorial, /break every crystal of that form/);
    assert.match(tutorial, /flux window/);
    assert.match(tutorial, /Magnet Slam/);
    assert.match(tutorial, /F5: Toggle first \/ third person/);
    assert.doesNotMatch(tutorial, /Flux Burst|tethered/);
    const tips = read('src/components/ui/LoadingScreen.tsx');
    assert.match(tips, /Match the Warden/);
    assert.match(tips, /flux window/);
    assert.doesNotMatch(tips, /charge Flux|deflectable bolts/);
    const modal = read('src/components/ui/BossConfirmModal.tsx');
    assert.match(modal, /Same polarity repels, opposite attracts/);
    assert.match(modal, /tower crystals/);
    const readme = read('README.md');
    assert.match(readme, /Press `F` to dodge roll/);
    assert.match(readme, /Press `F5`/);
    assert.doesNotMatch(readme, /Flux/);
    const changelog = read('CHANGELOG.md');
    assert.match(changelog, /## \[Unreleased\]/);
    assert.match(changelog, /three forms/i);
    assert.match(changelog, /Magnet Slam/);
    assert.match(changelog, /Third person \(F5\)/);
});

// --- Regression guards carried over from the previous fight's suite ---------

test('the Polarity Boots Upgrade drops, crafts, and grants an N toggle', () => {
    const recipes = read('src/recipes.ts');
    assert.match(recipes, /UPGRADED_POLARITY_BOOTS/);
    const equip = read('src/systems/registry/equipment.ts');
    assert.match(equip, /hasUpgradedPolarityBoots/);
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
    assert.match(player, /PlayerRefUpdater[\s\S]*?if \(cinematicMode \|\| bossSummon\.isActive\(\)\) return/);
    assert.match(app, /<PlayerRefUpdater playerPosRef=\{playerPosRef\} cinematicMode=\{cinematicMode\}/);
});

test('polarity flips while sprinting (Ctrl held) and boss death clears all bolts', () => {
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
    assert.match(app, /!cinematicMode && viewMode !== 'third' && <HeldItem/);
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
