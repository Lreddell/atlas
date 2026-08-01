import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

import { getVaultCandidateForCell, getVaultEntranceRoute, getVaultLayout } from './resonantVaults.ts';
import { SparseVaultStructureWriter } from './resonantVaultGeometry.testSupport.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const bundled = await build({
  entryPoints: [path.join(root, 'src/systems/world/resonantVaultArchitecture.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const architecture = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const { getArchitectureFeatures, paintVaultEntrance, paintVaultRoomArchitecture } = architecture;

test('every gameplay room has a unique non-box architectural feature set', () => {
  const candidate = { ...getVaultCandidateForCell(8, -3, 44119), active: true };
  const layout = getVaultLayout(candidate, 101);
  const gameplayRooms = layout.rooms.filter(({ kind }) => !['spire', 'outlet_grand', 'outlet_fracture'].includes(kind));

  for (const room of gameplayRooms) {
    const features = getArchitectureFeatures(room);
    assert.ok(features.ceilingProfile !== 'flat' || features.floorLevels >= 2, `${room.id} still reads as a flat box`);
    assert.ok(features.landmarks.length >= 1, `${room.id} lacks a landmark`);
    assert.ok(features.lampOffsets.length >= 2, `${room.id} lacks authored light`);
    assert.ok(features.materialBands.length >= 2, `${room.id} lacks masonry depth`);
  }

  const signatures = gameplayRooms.map((room) => JSON.stringify(getArchitectureFeatures(room)));
  assert.equal(new Set(signatures).size, gameplayRooms.length, 'each room instance needs a distinct spatial signature');
});

test('entrance route is three blocks wide, one-step traversable, guarded, and lit at every landing', () => {
  const candidate = { ...getVaultCandidateForCell(8, -3, 44119), active: true };
  const layout = getVaultLayout(candidate, 112);
  const entrance = layout.rooms.find(({ id }) => id === 'entrance');
  assert.ok(entrance);
  const features = getArchitectureFeatures(entrance);

  assert.equal(features.walkWidth, 3);
  assert.equal(features.maximumRise, 1);
  assert.ok(features.landings >= 6);
  assert.equal(features.landingLampInterval, 1);
  assert.equal(features.guardedEdges, true);
});

test('every gameplay room paints shaped masonry and authored light instead of a palette-swapped shell', () => {
  const candidate = { ...getVaultCandidateForCell(-7, 9, 73319), active: true, orientation: 2 };
  const layout = getVaultLayout(candidate, 105, () => 105);
  const gameplayRooms = layout.rooms.filter(({ kind }) => kind !== 'spire');

  for (const room of gameplayRooms) {
    const writer = new SparseVaultStructureWriter();
    paintVaultRoomArchitecture(writer, room, layout);
    const cells = [...writer.blocks.values()].map(({ type }) => type);
    const shaped = cells.filter((type) => type >= 178 && type <= 181).length;
    const lamps = cells.filter((type) => type === 81).length;
    assert.ok(shaped >= 4, `${room.id} has no meaningful stair/slab detailing`);
    assert.ok(lamps >= 2, `${room.id} lacks authored illumination`);
  }
});

test('painted entrance staircase uses three-wide shaped runs and lamp pairs at each full switchback', () => {
  const candidate = { ...getVaultCandidateForCell(6, 8, 99173), active: true, orientation: 1 };
  const layout = getVaultLayout(candidate, 112, () => 112);
  const writer = new SparseVaultStructureWriter();
  const paintedRoute = paintVaultEntrance(writer, layout);
  const compiledRoute = getVaultEntranceRoute(layout);
  assert.deepEqual(paintedRoute, compiledRoute);

  for (let index = 1; index < paintedRoute.length; index += 1) {
    const previous = paintedRoute[index - 1];
    const point = paintedRoute[index];
    assert.equal(Math.abs(point.x - previous.x) + Math.abs(point.z - previous.z), 1);
    assert.ok(point.y - previous.y === 0 || point.y - previous.y === 1);
  }

  const stairCells = [...writer.blocks.values()].filter(({ type }) => type === 181).length;
  const slabCells = [...writer.blocks.values()].filter(({ type }) => type === 178).length;
  const lampCells = [...writer.blocks.values()].filter(({ type }) => type === 81).length;
  assert.ok(stairCells >= (layout.surfaceY - paintedRoute[0].y) * 2.5);
  assert.ok(slabCells >= 18, 'switchback landings need explicit slab surfaces');
  assert.ok(lampCells >= 8, 'every full switchback needs paired landing lamps');
  for (const point of paintedRoute) {
    assert.notEqual(writer.get(point.x, point.y - 1, point.z), 0, `unsupported entrance tread at ${point.x},${point.y},${point.z}`);
  }
});

test('escape chambers do not paint a disconnected staircase before the authored course is carved', () => {
  const candidate = { ...getVaultCandidateForCell(6, 8, 99173), active: true, orientation: 1 };
  const layout = getVaultLayout(candidate, 112, () => 112);
  for (const kind of ['grand_ascent', 'fracture_stair']) {
    const room = layout.rooms.find((candidateRoom) => candidateRoom.kind === kind);
    assert.ok(room);
    const writer = new SparseVaultStructureWriter();
    paintVaultRoomArchitecture(writer, room, layout);
    const centerStairs = [...writer.blocks].filter(([key, cell]) => {
      if (cell.type !== 181) return false;
      const [x, , z] = key.split(',').map(Number);
      return Math.abs(x - room.x) <= 2 && Math.abs(z - room.z) <= 2;
    });
    assert.equal(centerStairs.length, 0, `${kind} still contains the disconnected middle stair`);
  }
});

test('memory choir keeps four fully interactive indexed pylons, visible caps, and a center replay plate', () => {
  const candidate = { ...getVaultCandidateForCell(2, -6, 43117), active: true };
  const layout = getVaultLayout(candidate, 103, () => 103);
  const room = layout.rooms.find(({ kind }) => kind === 'memory_choir');
  assert.ok(room);
  const writer = new SparseVaultStructureWriter();
  paintVaultRoomArchitecture(writer, room, layout);

  const pylonCells = [...writer.blocks.values()].filter(({ type }) => type === 76);
  assert.equal(pylonCells.length, 24, 'each of four bells needs a six-block interactive body');
  assert.deepEqual(new Set(pylonCells.map(({ meta }) => meta)), new Set([0, 1, 2, 3]));
  assert.equal([...writer.blocks.values()].filter(({ type }) => type === 81).length >= 4, true);
  assert.equal(writer.get(room.x, room.y + 1, room.z), 80, 'center bell must replay the pattern');
});
