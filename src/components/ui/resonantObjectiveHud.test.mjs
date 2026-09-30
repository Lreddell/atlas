import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  VAULT_ENVIRONMENTAL_CUES,
  formatVaultObjective,
} from '../../systems/world/resonantVaultObjectives.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const hud = fs.readFileSync(path.join(root, 'src/components/ui/ResonantObjectiveHUD.tsx'), 'utf8');

test('normal objectives are one short imperative line', () => {
  const view = formatVaultObjective({ phase: 'echo_repeat', progress: 2, total: 4 });
  assert.equal(view.primary, 'Repeat the echo');
  assert.equal(view.secondary, '2 / 4');
  assert.ok(view.primary.length <= 32);
});

test('objectives contain no internal system language', () => {
  const forbidden = /resonator|phase lattice|wing solved|custodian|mason|telemetry|synchronize|calibrate/i;
  for (const phase of ['enter', 'search', 'echo_listen', 'echo_repeat', 'cross', 'restore', 'combat', 'boss', 'claim', 'choose_exit', 'escape']) {
    const view = formatVaultObjective({ phase, progress: 0, total: 4, route: 'grand', remainingSeconds: 198 });
    assert.doesNotMatch(`${view.primary} ${view.secondary ?? ''}`, forbidden);
  }
});

test('the world owns every teaching cue instead of floating instructions', () => {
  assert.deepEqual(VAULT_ENVIRONMENTAL_CUES.map(({ kind }) => kind), [
    'path_light', 'route_symbol', 'receptive_device', 'hazard', 'cache', 'completion_response',
  ]);
  assert.ok(VAULT_ENVIRONMENTAL_CUES.every(({ evidence }) => evidence.length >= 2));
  assert.ok(VAULT_ENVIRONMENTAL_CUES.some(({ evidence }) => evidence.includes('brass_fork_mark')));
  assert.ok(VAULT_ENVIRONMENTAL_CUES.some(({ evidence }) => evidence.includes('visible_test_cycle')));
});

test('the HUD uses Atlas tokens, stays compact, and can be recalled without neon treatment', () => {
  assert.match(hud, /max-w-\[360px\]/);
  // Recalled by its rebindable key, O by default.
  assert.match(hud, /isKeyFor\('vaultObjective', event\)/);
  assert.match(fs.readFileSync(path.join(root, 'src/systems/player/keyBindings.ts'), 'utf8'), /id: 'vaultObjective'.*defaults: \['KeyO'\]/);
  assert.match(hud, /4000/);
  // The kit's quiet ink card and parchment type, like the item tooltips.
  assert.match(hud, /atlas-tooltip/);
  assert.match(hud, /text-px-2 text-parchment-50/);
  assert.doesNotMatch(hud, /bg-black|border-stone|text-white|text-gray/);
  assert.doesNotMatch(hud, /neon|glow|gradient|scanline|hologram|cyan|purple/i);
});
