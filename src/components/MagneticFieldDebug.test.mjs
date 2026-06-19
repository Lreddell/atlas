import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

const source = readFileSync(new URL('./MagneticFieldDebug.tsx', import.meta.url), 'utf8');

test('uses bright unlit instanced shafts and cone heads', () => {
    assert.match(source, /InstancedMesh/);
    assert.match(source, /MeshBasicMaterial/);
    assert.match(source, /CylinderGeometry/);
    assert.match(source, /ConeGeometry/);
    assert.match(source, /depthTest:\s*false/);
    assert.match(source, /toneMapped:\s*false/);
    assert.doesNotMatch(source, /LineBasicMaterial/);
});
