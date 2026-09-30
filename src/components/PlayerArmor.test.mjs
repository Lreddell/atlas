import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const bundled = await build({ stdin: { contents: `
    export { PlayerArmor } from './src/components/PlayerArmor';
    export { BLOCKS } from './src/data/blocks';
    export { BlockType } from './src/types';
`, resolveDir: path.resolve(import.meta.dirname, '../..'), loader: 'tsx' }, bundle: true, platform: 'node', format: 'esm', write: false });
const { PlayerArmor, BlockType: B, BLOCKS } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const elements = (e) => !e || typeof e !== 'object' ? [] : [e, ...[e.props?.children].flat(Infinity).flatMap(elements)];

test('equipped material colors follow inventory armor; an empty slot has no armor', () => {
    for (const tier of ['IRON', 'GOLD', 'DIAMOND', 'COPPER']) {
        for (const [slot, part] of [['HELMET', 'helmet'], ['CHESTPLATE', 'chest'], ['LEGGINGS', 'thigh'], ['BOOTS', 'boot']]) {
            const type = B[`${tier}_${slot}`];
            const rendered = elements(PlayerArmor({ item: { type, count: 1 }, part }));
            const colors = rendered.filter(e => e.type === 'meshLambertMaterial').map(e => e.props.color);
            assert.ok(colors.length > 0);
            assert.ok(colors.every(color => color === BLOCKS[type].color));
        }
    }
    assert.equal(PlayerArmor({ item: null, part: 'helmet' }), null);
    assert.ok(elements(PlayerArmor({ item: { type: B.POLARITY_BOOTS, count: 1 }, part: 'boot' })).some(e => e.type === 'mesh'));
});
test('the helmet leaves both eyes visible', () => {
    const meshes = elements(PlayerArmor({ item: { type: B.IRON_HELMET, count: 1 }, part: 'helmet' })).filter(e => e.type === 'mesh');
    for (const mesh of meshes) {
        const size = elements(mesh).find(e => e.type === 'boxGeometry').props.args;
        for (const x of [-0.11, 0.11]) {
            const eye = [x, 0.27, -0.26];
            assert.equal(eye.every((p, axis) => Math.abs(p - mesh.props.position[axis]) <= size[axis] / 2), false);
        }
    }
});
