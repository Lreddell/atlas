import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';
import ts from 'typescript';

// Exercise the real traversal with a tiny world: water cells in front of a solid wall.
const source = fs.readFileSync(new URL('./voxelRaycast.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, require: name => {
    if (name.endsWith('/types')) return { BlockType: { AIR: 0 } };
    if (name.endsWith('/WorldManager')) return { worldManager: { tryGetBlock: (x, y, z) => z >= 1 && z <= 2 ? 1 : z === 3 ? 2 : 0 } };
    if (name.endsWith('/blockShapes')) return { isFullCubeSelection: () => true };
    throw new Error(name);
} });
test('camera filter passes through water to the wall while ordinary targeting still hits water', () => {
    const ray = [0.5, 0.5, 0.5, 0, 0, 1, 5];
    assert.equal(exports.voxelRaycast(...ray).bz, 1);
    const cameraHit = exports.voxelRaycast(...ray, type => type !== 1);
    assert.equal(cameraHit.bz, 3);
    assert.equal(cameraHit.distance, 2.5);
});
