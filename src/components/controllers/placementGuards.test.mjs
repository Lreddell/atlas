import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Source-text wiring tests (the controller pulls in DOM and enums, per repo convention).
const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('a placed block never walls an entity in', () => {
    const manager = read('src/systems/entities/EntityManager.ts');
    // Living bodies only, tested box against box.
    assert.match(manager, /bodyOverlaps\(box: \{ min: \{ x: number; y: number; z: number \}; max: \{ x: number; y: number; z: number \} \}\): boolean/);
    assert.match(manager, /if \(e\.hp <= 0\) continue;/);

    const ctrl = read('src/components/controllers/InteractionController.tsx');
    // Solid single blocks (not torches, plants or other non-colliding blocks)...
    assert.match(ctrl, /!heldItemDef\.noCollision && heldItem\.type !== BlockType\.TORCH && heldItem\.type !== BlockType\.BED_ITEM\s*\n\s*&& entityManager\.bodyOverlaps\(blockAABB\)\) return;/);
    // ...both halves of a bed...
    assert.match(ctrl, /!entityManager\.bodyOverlaps\(headAABB\) && !entityManager\.bodyOverlaps\(blockAABB\)/);
    // ...and a slab fused into a full block.
    assert.match(ctrl, /playerAABB\.intersectsBox\(doubleSlabAABB\) \|\| entityManager\.bodyOverlaps\(doubleSlabAABB\)/);
});
