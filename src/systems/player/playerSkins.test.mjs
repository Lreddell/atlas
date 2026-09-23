import test from 'node:test';
import assert from 'node:assert/strict';
import { minecraftSkinGeometry } from './minecraftSkinGeometry.ts';
import { BUILTIN_SKINS, equipSkin, addImportedSkin, removeImportedSkin, importMinecraftSkin } from './playerSkins.ts';

function frontUV(geometry) {
    const n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
    const points = [];
    for (let i = 0; i < n.count; i++) if (n.getZ(i) < -0.99) points.push([uv.getX(i) * 64, (1 - uv.getY(i)) * 64]);
    return points;
}
test('Minecraft face is on Atlas forward and limb segments preserve the full skin without stretching', () => {
    const head = minecraftSkinGeometry('head', false);
    assert.deepEqual(frontUV(head), [[8, 8], [16, 8], [8, 16], [16, 16]]);
    const upper = minecraftSkinGeometry('rightArm', false, false, 'upper');
    const lower = minecraftSkinGeometry('rightArm', false, false, 'lower');
    assert.deepEqual(frontUV(upper), [[44, 20], [48, 20], [44, 26], [48, 26]]);
    assert.deepEqual(frontUV(lower), [[44, 26], [48, 26], [44, 32], [48, 32]]);
    [head, upper, lower].forEach(g => g.dispose());
});
test('slim arms use three pixels and overlays occupy their separate texture regions', () => {
    const arm = minecraftSkinGeometry('leftArm', true);
    arm.computeBoundingBox();
    assert.equal(arm.boundingBox.max.x - arm.boundingBox.min.x, 3 / 16);
    assert.deepEqual(frontUV(arm), [[36, 52], [39, 52], [36, 64], [39, 64]]);
    const overlay = minecraftSkinGeometry('body', false, true);
    assert.deepEqual(frontUV(overlay), [[20, 36], [28, 36], [20, 48], [28, 48]]);
    arm.dispose(); overlay.dispose();
});
test('selection and imported model persist; quota failures preserve the previous library; removal falls back safely', () => {
    const values = new Map();
    globalThis.localStorage = { setItem: (k, v) => values.set(k, v), getItem: k => values.get(k) ?? null };
    const imported = { ...BUILTIN_SKINS[0], id: 'import-test', model: 'slim', texture: 'data:image/png;base64,test' };
    addImportedSkin(imported);
    equipSkin(imported);
    assert.equal(JSON.parse(values.get('atlas.skins.v1')).selected, 'import-test');
    assert.equal(JSON.parse(values.get('atlas.skins.v1')).imported[0].model, 'slim');
    const write = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
    assert.throws(() => equipSkin(BUILTIN_SKINS[1]), /storage is full/);
    globalThis.localStorage.setItem = write;
    removeImportedSkin('import-test');
    assert.deepEqual(JSON.parse(values.get('atlas.skins.v1')), { selected: 'explorer', imported: [] });
    delete globalThis.localStorage;
});
test('import rejects non-PNG, truncated PNG and invalid dimensions before image decoding', async () => {
    await assert.rejects(importMinecraftSkin(new globalThis.File(['not an image'], 'skin.png')), /Minecraft skin PNG/);
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const header = new DataView(bytes.buffer);
    header.setUint32(16, 64); header.setUint32(20, 48);
    await assert.rejects(importMinecraftSkin(new globalThis.File([bytes], 'skin.png')), /64 × 64/);
    await assert.rejects(importMinecraftSkin(new globalThis.File([bytes.slice(0, 12)], 'skin.png')), /Minecraft skin PNG/);
});
