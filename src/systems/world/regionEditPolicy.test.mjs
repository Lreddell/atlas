import assert from 'node:assert/strict';
import test from 'node:test';

import { findFirstBlockedEdit } from './regionEditPolicy.ts';

test('multi-cell edits reject the whole operation when any cell is blocked', () => {
    const positions = [
        { x: 1, y: 2, z: 3 },
        { x: 2, y: 2, z: 3 },
    ];

    assert.deepEqual(
        findFirstBlockedEdit(positions, ({ x }) => x !== 2),
        positions[1],
    );
    assert.equal(findFirstBlockedEdit(positions, () => true), null);
});

// --- Sealed-region allowed exceptions (source-level assertions; the enforcing
// modules import the BlockType enum, so they can't be imported under the
// type-stripping test runner) ---
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('sealed Magnetic Fields allow mining progression crystals AND shield crystals', () => {
    const blocks = read('src/systems/world/magneticFieldsBlocks.ts');
    // Both resource crystals (Polarity Boots materials) and the boss's shield
    // crystals must be breakable while the region is still sealed.
    assert.match(blocks, /BlockType\.POSITIVE_MAGNETITE_CRYSTAL/);
    assert.match(blocks, /BlockType\.NEGATIVE_MAGNETITE_CRYSTAL/);
    assert.match(blocks, /BlockType\.MAGNETIC_SHIELD_CRYSTAL/);

    // canEditBlock consults the allowlist BEFORE returning the sealed denial,
    // so allowed breaks return true and never reach the denied event.
    const wm = read('src/systems/WorldManager.ts');
    const fn = wm.slice(wm.indexOf('canEditBlock('), wm.indexOf('canEditBlock(') + 900);
    const allowIdx = fn.indexOf('SEALED_MINEABLE_BLOCKS.has');
    const denyIdx = fn.indexOf('return false');
    assert.ok(allowIdx !== -1 && denyIdx !== -1 && allowIdx < denyIdx,
        'the sealed-mineable allowlist must be checked before the deny');
});

test('the denial toast requires a deliberate, dwelling mining attempt', () => {
    const ic = read('src/components/controllers/InteractionController.tsx');
    // The denied event fires only after LMB is held on the SAME sealed block
    // for a beat, a missed combat swing sweeping across sealed terrain during
    // the Warden fight must not toast "defeat its guardian" at the player.
    assert.match(ic, /deniedDwellRef/);
    assert.match(ic, /d\.heldFor >= 0\.25/);
    assert.match(ic, /d\.notified = true;\s*\n\s*canPlayerEdit\(hit\.bx, hit\.by, hit\.bz, hitBreakEdit\);/);
});
