import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../../..');
const bundled = await build({ stdin: { contents: `
    import './src/data/resonantDefinitions';
    export { BlockType } from './src/types';
    export { getPlayerWeaponProfile } from './src/systems/combat/vaultWeapons';
    export { getItemTooltip } from './src/systems/registry/itemTooltips';
    export { BLOCKS } from './src/data/blocks';
`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const { BlockType: B, getPlayerWeaponProfile: profile, getItemTooltip, BLOCKS } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('all swords are the fastest melee weapons; the spear trades speed for reach', () => {
    for (const tier of ['WOOD', 'STONE', 'COPPER', 'IRON', 'GOLD', 'DIAMOND']) {
        const sword = profile(B[`${tier}_SWORD`]);
        assert.equal(sword.cooldownSeconds, 0.58);
        assert.equal(sword.reach, 3.2);
        assert.ok(profile(B[`${tier}_AXE`]).cooldownSeconds > sword.cooldownSeconds);
    }
    assert.equal(profile(B.VAULTSTEEL_SPEAR).cooldownSeconds, 0.625);
    assert.equal(profile(B.VAULTSTEEL_SPEAR).reach, 5.4);
    assert.ok(profile(B.BELLBREAKER_MAUL).cooldownSeconds > 1);
    assert.ok(profile(B.TITAN_HAMMER).cooldownSeconds > 1);
});
test('blocks, food, armor, ordinary mining tools and empty hands have no timed weapon profile', () => {
    assert.equal(profile(null), null);
    for (const [id, def] of Object.entries(BLOCKS)) {
        const name = B[Number(id)];
        const weapon = name?.endsWith('_SWORD') || name?.endsWith('_AXE') || [B.VAULTSTEEL_SPEAR, B.VAULT_CROSSBOW, B.BELLBREAKER_MAUL, B.TITAN_HAMMER].includes(Number(id));
        if (!weapon) assert.equal(profile(Number(id)), null, def.name);
    }
});
test('inventory attack speed and reach come from the exact combat profiles', () => {
    for (const id of Object.values(B).filter(v => typeof v === 'number')) {
        const p = profile(id);
        if (!p) continue;
        const lines = getItemTooltip({ type: id, count: 1 }).lines.map(l => l.text);
        assert.ok(lines.includes(`Attack speed: ${(1 / p.cooldownSeconds).toFixed(2)} /s`));
        assert.ok(lines.includes(`${p.kind === 'crossbow' ? 'Projectile range' : 'Reach'}: ${p.reach.toFixed(1)} blocks`));
    }
    assert.ok(!getItemTooltip({ type: B.GRASS, count: 1 }).lines.some(l => l.text.includes('Attack speed')));
});
