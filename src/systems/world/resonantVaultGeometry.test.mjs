import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import * as vaults from './resonantVaults.ts';

import {
  RESONANT_VAULT_ACTIVE_DENOMINATOR,
  RESONANT_VAULT_GRID,
  RESONANT_VAULT_HALF_EXTENT,
  RESONANT_VAULT_MIN_ORIGIN_DISTANCE,
  getRoomPort,
  getVaultCandidateForCell,
  getVaultCorridorRoute,
  getVaultDoorways,
  getVaultEntranceRoute,
  getVaultLayout,
  getVaultOpenAirSurfaceY,
  getVaultSpirePosition,
  getVaultSurfaceOutlet,
} from './resonantVaults.ts';
import {
  validatePaintedVault,
  validateVaultLayout,
} from './resonantVaultConnectivity.ts';
import {
  SparseVaultStructureWriter,
  VaultTestBlockType as BlockType,
  loadVaultGenerationModule,
} from './resonantVaultGeometry.testSupport.mjs';
import { buildVaultPuzzleDescriptor, getCrossingPitDescriptor } from './resonantVaultPuzzles.ts';
import { getVaultEscapeRoutes } from './resonantVaultEscapes.ts';

const SEED = 987654321;
const { paintResonantVaultStructure } = await loadVaultGenerationModule();

test('vault placement remains rare, deterministic, and away from the starter origin', () => {
  assert.equal(RESONANT_VAULT_GRID, 1536);
  assert.equal(RESONANT_VAULT_ACTIVE_DENOMINATOR, 4);
  assert.equal(RESONANT_VAULT_MIN_ORIGIN_DISTANCE, 1200);
  assert.equal(RESONANT_VAULT_HALF_EXTENT, 256);
  for (let gx = -8; gx <= 8; gx += 1) {
    for (let gz = -8; gz <= 8; gz += 1) {
      const candidate = getVaultCandidateForCell(gx, gz, SEED);
      assert.deepEqual(candidate, getVaultCandidateForCell(gx, gz, SEED));
      if (Math.hypot(candidate.centerX, candidate.centerZ) < RESONANT_VAULT_MIN_ORIGIN_DISTANCE) {
        assert.equal(candidate.active, false);
      }
    }
  }
  let active = 0;
  const total = 41 * 41;
  for (let gx = -20; gx <= 20; gx += 1) {
    for (let gz = -20; gz <= 20; gz += 1) {
      if (getVaultCandidateForCell(gx, gz, SEED).active) active += 1;
    }
  }
  assert.ok(active > total * 0.18 && active < total * 0.32, `unexpected active ratio ${active}/${total}`);
});

test('every graph edge owns wall ports and a contiguous player-safe stair route', () => {
  for (let orientation = 0; orientation < 4; orientation += 1) {
    const candidate = { ...getVaultCandidateForCell(3, -2, SEED), active: true, orientation };
    const layout = getVaultLayout(candidate, 102, (x, z) => 84 + Math.abs(x + z) % 33);
    assert.deepEqual(validateVaultLayout(layout), { valid: true, errors: [] });
    const byId = new Map(layout.rooms.map((room) => [room.id, room]));
    for (const [fromId, toId] of layout.edges) {
      const from = byId.get(fromId);
      const to = byId.get(toId);
      assert.ok(from && to, `missing ${fromId}>${toId}`);
      const route = getVaultCorridorRoute(from, to);
      assert.deepEqual(route[0], getRoomPort(from, to));
      assert.deepEqual(route.at(-1), getRoomPort(to, from));
      assert.ok(route.length >= 2);
      for (let index = 1; index < route.length; index += 1) {
        const previous = route[index - 1];
        const point = route[index];
        assert.equal(Math.abs(previous.x - point.x) + Math.abs(previous.z - point.z), 1);
        assert.ok(Math.abs(previous.y - point.y) <= 1, `${fromId}>${toId} rises too quickly`);
      }
    }
  }
});

test('the entrance staircase has continuous treads and never cuts through another room', () => {
  for (let orientation = 0; orientation < 4; orientation += 1) {
    const candidate = { ...getVaultCandidateForCell(8, -6, SEED), active: true, orientation };
    const layout = getVaultLayout(candidate, 106, () => 106);
    const writer = new SparseVaultStructureWriter();
    paintResonantVaultStructure(writer, candidate, layout, { seed: SEED, getSurfaceY: () => 106 });
    const route = getVaultEntranceRoute(layout);
    assert.equal(route[0].y, layout.rooms.find(({ id }) => id === 'entrance').y);
    assert.equal(route.at(-1).y, layout.surfaceY);
    for (let index = 0; index < route.length; index += 1) {
      const point = route[index];
      assert.notEqual(writer.get(point.x, point.y, point.z), BlockType.AIR, `missing tread ${orientation}:${index}`);
      assert.notEqual(writer.get(point.x, point.y - 1, point.z), BlockType.AIR, `unsupported tread ${orientation}:${index}`);
      for (let y = point.y + 1; y <= point.y + 3; y += 1) {
        assert.equal(writer.get(point.x, y, point.z), BlockType.AIR, `blocked stair headroom ${orientation}:${index}`);
      }
      if (index > 0) {
        const previous = route[index - 1];
        assert.ok(Math.abs(point.y - previous.y) <= 1, `stair rises too quickly ${orientation}:${index}`);
        assert.ok(Math.abs(point.x - previous.x) + Math.abs(point.z - previous.z) <= 1, `stair has a horizontal hole ${orientation}:${index}`);
      }
    }
    assert.deepEqual(validateVaultLayout(layout), { valid: true, errors: [] });
  }
});

test('doorways own two five-by-five planes and exactly three progression gates', () => {
  const candidate = { ...getVaultCandidateForCell(2, 5, SEED), active: true, orientation: 2 };
  const layout = getVaultLayout(candidate, 100, () => 100);
  assert.deepEqual(getVaultDoorways(layout), layout.doorways);
  assert.equal(layout.doorways.length, layout.edges.length);
  for (const doorway of layout.doorways) {
    assert.equal(doorway.roomOverlap.length, 2);
    assert.equal(doorway.corridorOverlap.length, 2);
    assert.equal(doorway.opening.length, 50);
    assert.equal(new Set(doorway.opening.slice(0, 25).map(({ y }) => y)).size, 5);
    assert.equal(new Set(doorway.opening.slice(25).map(({ y }) => y)).size, 5);
  }
  assert.deepEqual(
    layout.doorways.filter(({ gate }) => gate).map(({ from, to, gate }) => [from, to, gate]),
    [
    ['hub', 'antechamber', 'inner_seal'],
      ['core', 'grand_ascent', 'grand_ascent'],
      ['core', 'fracture_stair', 'fracture_stair'],
    ],
  );
  assert.equal(getVaultSurfaceOutlet(layout, 'grand').room, 'outlet_grand');
  assert.equal(getVaultSurfaceOutlet(layout, 'fracture').room, 'outlet_fracture');
});

test('combat seals select the doorway plane owned by the active room', () => {
  assert.equal(typeof vaults.getVaultDoorwayRoomOpening, 'function');
  const candidate = { ...getVaultCandidateForCell(2, 5, SEED), active: true, orientation: 2 };
  const layout = getVaultLayout(candidate, 100, () => 100);
  const doorway = layout.doorways.find(({ gate }) => !gate);
  assert.ok(doorway);
  assert.deepEqual(vaults.getVaultDoorwayRoomOpening(doorway, doorway.from), doorway.opening.slice(0, 25));
  assert.deepEqual(vaults.getVaultDoorwayRoomOpening(doorway, doorway.to), doorway.opening.slice(25));
  assert.deepEqual(vaults.getVaultDoorwayRoomOpening(doorway, 'not-a-room'), []);

  const root = path.resolve(import.meta.dirname, '../../..');
  const director = fs.readFileSync(path.join(root, 'src/systems/entities/ResonantEncounterDirector.ts'), 'utf8');
  assert.match(director, /getVaultDoorwayRoomOpening\(doorway, room\.id\)/);
  assert.doesNotMatch(director, /closeRoomGates[\s\S]*?opening\.slice\(25\)/);
});

test('the Crossing course follows its rotated entrance and exit instead of a room side wall', () => {
  const center = (cells) => ({
    x: cells.reduce((sum, cell) => sum + cell.x, 0) / cells.length,
    z: cells.reduce((sum, cell) => sum + cell.z, 0) / cells.length,
  });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  for (let orientation = 0; orientation < 4; orientation += 1) {
    const candidate = { ...getVaultCandidateForCell(2, 5, SEED), active: true, orientation };
    const layout = getVaultLayout(candidate, 100, () => 100);
    const crossing = layout.rooms.find(({ kind }) => kind === 'broken_crossing');
    assert.ok(crossing);
    const incoming = layout.doorways.find(({ to }) => to === crossing.id);
    const outgoing = layout.doorways.find(({ from }) => from === crossing.id);
    assert.ok(incoming && outgoing);
    const puzzle = buildVaultPuzzleDescriptor(crossing);
    assert.ok(distance(puzzle.activation, center(vaults.getVaultDoorwayRoomOpening(incoming, crossing.id))) <= 4);
    assert.ok(distance(puzzle.completion, center(vaults.getVaultDoorwayRoomOpening(outgoing, crossing.id))) <= 4);
  }
});

test('the final decoration pass cannot reseal a doorway opening', () => {
  const candidate = { ...getVaultCandidateForCell(5, 4, SEED), active: true, orientation: 0 };
  const getSurfaceY = () => 100;
  const layout = getVaultLayout(candidate, 100, getSurfaceY);
  const writer = new SparseVaultStructureWriter();
  paintResonantVaultStructure(writer, candidate, layout, { seed: SEED, getSurfaceY });

  for (const doorway of layout.doorways) {
    const first = doorway.opening.slice(0, 25).map(({ x, y, z }) => writer.get(x, y, z));
    const second = doorway.opening.slice(25).map(({ x, y, z }) => writer.get(x, y, z));
    assert.equal(first.every((type) => type === BlockType.AIR), true, `${doorway.from}>${doorway.to} first plane obstructed`);
    assert.equal(
      second.every((type) => type === (doorway.gate ? BlockType.VAULT_SEAL : BlockType.AIR)),
      true,
      `${doorway.from}>${doorway.to} second plane obstructed`,
    );
  }
});

test('authored fixtures keep every main corridor anchor within eight blocks of light', () => {
  const candidate = { ...getVaultCandidateForCell(9, -5, SEED), active: true, orientation: 3 };
  const layout = getVaultLayout(candidate, 101, () => 101);
  const spire = getVaultSpirePosition(candidate);
  const writer = new SparseVaultStructureWriter();
  paintResonantVaultStructure(writer, candidate, layout, { seed: SEED, getSurfaceY: () => 101 });
  const lamps = [...writer.blocks].filter(([, cell]) => cell.type === BlockType.RESONANT_LAMP).map(([key]) => {
    const [x, y, z] = key.split(',').map(Number);
    return { x, y, z };
  });
  const surfaceMasonry = [...writer.blocks].filter(([key, cell]) => {
    const [x, y, z] = key.split(',').map(Number);
    return cell.type >= 178 && cell.type <= 181
      && y >= layout.surfaceY
      && Math.abs(x - spire.x) <= 16
      && Math.abs(z - spire.z) <= 16;
  });
  assert.ok(surfaceMasonry.length >= 40, 'the listening spire lacks stair/slab silhouette work');
  const byId = new Map(layout.rooms.map((room) => [room.id, room]));

  for (const [fromId, toId] of layout.edges) {
    const route = getVaultCorridorRoute(byId.get(fromId), byId.get(toId));
    for (const point of route) {
      const lit = lamps.some((lamp) => Math.abs(lamp.x - point.x) <= 8
        && Math.abs(lamp.z - point.z) <= 8
        && Math.abs(lamp.y - (point.y + 2)) <= 8);
      assert.equal(lit, true, `${fromId}>${toId} is underlit at ${point.x},${point.y},${point.z}`);
    }
  }
});

test('occupied room centers use restrained recessed lamps instead of leaving puzzle floors black', () => {
  const candidate = { ...getVaultCandidateForCell(6, -8, SEED), active: true, orientation: 1 };
  const layout = getVaultLayout(candidate, 96, () => 96);
  const writer = new SparseVaultStructureWriter();
  paintResonantVaultStructure(writer, candidate, layout, { seed: SEED, getSurfaceY: () => 96 });
  const courseKinds = new Set(['spire', 'broken_crossing', 'grand_ascent', 'fracture_stair', 'outlet_grand', 'outlet_fracture']);

  for (const room of layout.rooms.filter(({ kind }) => !courseKinds.has(kind))) {
    const centralFloorLamps = [...writer.blocks].filter(([key, cell]) => {
      if (cell.type !== BlockType.RESONANT_LAMP) return false;
      const [x, y, z] = key.split(',').map(Number);
      return y === room.y && Math.abs(x - room.x) <= 4 && Math.abs(z - room.z) <= 4;
    });
    assert.ok(centralFloorLamps.length >= 2, `${room.id} has no readable low central light`);
  }
});

test('the boss arena has one central confirmation plate and a clear combat floor', () => {
  const candidate = { ...getVaultCandidateForCell(11, -4, SEED), active: true, orientation: 0 };
  const layout = getVaultLayout(candidate, 100, () => 100);
  const writer = new SparseVaultStructureWriter();
  paintResonantVaultStructure(writer, candidate, layout, { seed: SEED, getSurfaceY: () => 100 });
  const arena = layout.rooms.find(({ kind }) => kind === 'arena');
  const antechamber = layout.rooms.find(({ kind }) => kind === 'antechamber');
  assert.ok(arena && antechamber);

  assert.equal(writer.get(arena.x, arena.y, arena.z), BlockType.RESONANCE_PLATE);
  const arenaFloorLamps = [...writer.blocks].filter(([key, cell]) => {
    if (cell.type !== BlockType.RESONANT_LAMP) return false;
    const [x, y, z] = key.split(',').map(Number);
    return y === arena.y && Math.hypot(x - arena.x, z - arena.z) <= 18;
  });
  assert.ok(arenaFloorLamps.length >= 20, 'the Titan arena needs a bright, even ring of recessed lights');
  for (let y = antechamber.y; y <= antechamber.y + 3; y += 1) {
    assert.notEqual(writer.get(antechamber.x, y, antechamber.z), BlockType.RESONANCE_PLATE);
  }

  for (let dx = -16; dx <= 16; dx += 1) {
    for (let dz = -16; dz <= 16; dz += 1) {
      if (Math.hypot(dx, dz) > 16) continue;
      for (let y = arena.y + 1; y <= arena.y + 7; y += 1) {
        assert.equal(
          writer.get(arena.x + dx, y, arena.z + dz),
          BlockType.AIR,
          `arena obstruction at ${dx},${y - arena.y},${dz}`,
        );
      }
    }
  }
});

test('the post-boss core is exposed from above so claiming it can unlock the reward cache', () => {
  const candidate = { ...getVaultCandidateForCell(12, -3, SEED), active: true, orientation: 1 };
  const layout = getVaultLayout(candidate, 100, () => 100);
  const writer = new SparseVaultStructureWriter();
  paintResonantVaultStructure(writer, candidate, layout, { seed: SEED, getSurfaceY: () => 100 });
  const core = layout.rooms.find(({ kind }) => kind === 'core');
  assert.ok(core);

  assert.equal(writer.get(core.x, core.y + 4, core.z), BlockType.SENTINEL_CORE);
  assert.equal(writer.get(core.x, core.y + 5, core.z), BlockType.AIR);
  assert.equal(writer.get(core.x, core.y + 6, core.z), BlockType.AIR);
});

test('definitive puzzle furnishing removes the Crossing bypass and paints exact descriptor controls', () => {
  // Rooms rotate per vault now; scan deterministic cells for a layout that
  // contains both mechanism chambers so every descriptor assertion runs.
  let candidate = null;
  let layout = null;
  for (let cell = 0; cell < 32 && !layout; cell += 1) {
    const probe = { ...getVaultCandidateForCell(7 + cell, 3, SEED), active: true, orientation: 0 };
    const probeLayout = getVaultLayout(probe, 100, () => 100);
    const kinds = new Set(probeLayout.rooms.map(({ kind }) => kind));
    if (kinds.has('counterweight_gallery') && kinds.has('acoustic_relay')) {
      candidate = probe;
      layout = probeLayout;
    }
  }
  assert.ok(candidate && layout, 'no probed cell selected both mechanism chambers');
  const writer = new SparseVaultStructureWriter();
  paintResonantVaultStructure(writer, candidate, layout, { seed: SEED, getSurfaceY: () => 100 });

  const crossing = layout.rooms.find(({ kind }) => kind === 'broken_crossing');
  const counterweight = layout.rooms.find(({ kind }) => kind === 'counterweight_gallery');
  const relay = layout.rooms.find(({ kind }) => kind === 'acoustic_relay');
  assert.ok(crossing && counterweight && relay);

  const crossingPuzzle = buildVaultPuzzleDescriptor(crossing);
  for (const checkpoint of crossingPuzzle.responseCells) {
    assert.equal(writer.get(checkpoint.x, checkpoint.y, checkpoint.z), BlockType.PULSE_CONDUIT);
  }
  assert.equal(writer.get(crossingPuzzle.completion.x, crossingPuzzle.completion.y, crossingPuzzle.completion.z), BlockType.ECHO_MOSAIC);
  const sideFloorX = crossingPuzzle.alongX ? crossing.x : crossing.x + 8;
  const sideFloorZ = crossingPuzzle.alongX ? crossing.z + 8 : crossing.z;
  for (const y of [crossing.y, crossing.y - 1, crossing.y - 2]) {
    assert.equal(writer.get(sideFloorX, y, sideFloorZ), BlockType.AIR, `perimeter bypass remains walkable at y=${y}`);
  }
  const pit = getCrossingPitDescriptor(crossing);
  const written = (x, y, z) => writer.blocks.get(`${x},${y},${z}`)?.type;
  assert.equal(written(sideFloorX, pit.floorY, sideFloorZ), BlockType.ECHO_MOSAIC, 'the judgment pit needs an authored landing floor');
  assert.notEqual(written(pit.bounds.minX, pit.floorY + 3, crossing.z), undefined, 'the judgment pit must be sealed from caves');
  assert.equal(pit.stairCells.every((cell) => written(cell.x, cell.y, cell.z) === BlockType.AIR), true, 'the return stair must remain retracted until the pit encounter clears');
  assert.equal(pit.landingCells.every((cell) => written(cell.x, cell.y, cell.z) === BlockType.AIR), true, 'the alternate landing must remain retracted until judgment clears');
  assert.equal('gateCells' in pit, false, 'the pit must not define a confusing Vault door');

  const counterPuzzle = buildVaultPuzzleDescriptor(counterweight);
  assert.equal(counterPuzzle.responseCells.every((cell) => writer.get(cell.x, cell.y, cell.z) === BlockType.AIR), true, 'counterweight banks must start retracted');

  const relayPuzzle = buildVaultPuzzleDescriptor(relay);
  assert.equal(
    writer.get(relayPuzzle.activation.x, relayPuzzle.activation.y, relayPuzzle.activation.z),
    BlockType.RESONANCE_PLATE,
    'the final doorway pass must not erase the relay striker while its cue still targets that cell',
  );
  assert.equal(relayPuzzle.responseCells.every((cell) => writer.get(cell.x, cell.y, cell.z) === BlockType.RESONANCE_PYLON), true);
});

test('relay striker and all six resonators survive every vault orientation', () => {
  for (let orientation = 0; orientation < 4; orientation += 1) {
    const candidate = { ...getVaultCandidateForCell(5, -7, 73014), active: true, orientation };
    const layout = getVaultLayout(candidate, 100, () => 100);
    const relay = layout.rooms.find(({ kind }) => kind === 'acoustic_relay');
    assert.ok(relay);
    const writer = new SparseVaultStructureWriter();
    paintResonantVaultStructure(writer, candidate, layout, { seed: 73014, getSurfaceY: () => 100 });
    const puzzle = buildVaultPuzzleDescriptor(relay);
    assert.equal(
      writer.get(puzzle.activation.x, puzzle.activation.y, puzzle.activation.z),
      BlockType.RESONANCE_PLATE,
      `orientation ${orientation} erased the relay striker`,
    );
    assert.equal(
      puzzle.responseCells.every((cell) => writer.get(cell.x, cell.y, cell.z) === BlockType.RESONANCE_PYLON),
      true,
      `orientation ${orientation} erased a relay resonator`,
    );
  }
});

test('painted voxels connect every room, the surface descent, and both terrain-sampled exits', () => {
  const profiles = [
    { center: 100, grand: 88, fracture: 112 },
    { center: 92, grand: 104, fracture: 82 },
  ];
  for (let orientation = 0; orientation < 4; orientation += 1) {
    for (const profile of profiles) {
      const candidate = { ...getVaultCandidateForCell(-4, 7, SEED), active: true, orientation };
      const getSurfaceY = (x, z) => {
        const dx = x - candidate.centerX;
        const dz = z - candidate.centerZ;
        const localX = orientation === 1 ? dz : orientation === 2 ? -dx : orientation === 3 ? -dz : dx;
        return localX < -100 ? profile.grand : localX > 100 ? profile.fracture : profile.center;
      };
      const layout = getVaultLayout(candidate, profile.center, getSurfaceY);
      const writer = new SparseVaultStructureWriter();
      paintResonantVaultStructure(writer, candidate, layout, { seed: SEED, getSurfaceY });
      const result = validatePaintedVault(layout, writer);
      assert.equal(result.valid, true, `orientation=${orientation} profile=${JSON.stringify(profile)}\n${result.errors.join('\n')}`);
      assert.equal(result.reachedRoomIds.size, layout.rooms.length - 1);
    }
  }
});

test('escape courses remain shelled against caves while preserving clear headroom', () => {
  const candidate = { ...getVaultCandidateForCell(-6, 9, SEED), active: true, orientation: 1 };
  const layout = getVaultLayout(candidate, 102, () => 102);
  const writer = new SparseVaultStructureWriter();
  paintResonantVaultStructure(writer, candidate, layout, { seed: SEED, getSurfaceY: () => 102 });
  for (const route of Object.values(getVaultEscapeRoutes(layout))) {
    const hazards = route.hazardSlots.map(({ pathIndex }) => pathIndex);
    let checked = 0;
    for (let index = 6; index < route.path.length - 10; index += 1) {
      if (hazards.some((hazard) => Math.abs(hazard - index) <= 5)) continue;
      const previous = route.path[index - 1];
      const point = route.path[index];
      const next = route.path[index + 1];
      const dx = next.x - previous.x;
      const dz = next.z - previous.z;
      if (dx !== 0 && dz !== 0) continue;
      const directionX = Math.sign(dx);
      const directionZ = Math.sign(dz);
      for (const side of [-3, 3]) {
        assert.notEqual(
          writer.get(point.x + directionZ * side, point.y, point.z - directionX * side),
          BlockType.AIR,
          `${route.route} cave-exposed side at ${index}`,
        );
      }
      assert.notEqual(writer.get(point.x, point.y + 5, point.z), BlockType.AIR, `${route.route} cave-exposed roof at ${index}`);
      assert.equal(writer.get(point.x, point.y, point.z), BlockType.AIR, `${route.route} blocked walking volume at ${index}`);
      assert.equal(writer.get(point.x, point.y + 2, point.z), BlockType.AIR, `${route.route} blocked headroom at ${index}`);
      checked += 1;
      if (checked >= 12) break;
    }
    assert.equal(checked, 12, `${route.route} did not expose enough straight shell samples`);
  }
});

test('ocean-height probes always place the exits and surface landing above water', () => {
  const candidate = { ...getVaultCandidateForCell(10, -10, SEED), active: true, orientation: 2 };
  const layout = getVaultLayout(candidate, 42, () => 42);
  assert.equal(getVaultOpenAirSurfaceY(42), 63);
  assert.equal(layout.surfaceY, 63);
  for (const route of Object.values(getVaultEscapeRoutes(layout))) {
    assert.equal(route.surfaceY, 63);
    assert.equal(route.surfaceLanding.y, 64);
  }
});
