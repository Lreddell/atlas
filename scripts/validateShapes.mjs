// Standalone validation for shaped-block geometry, stair-corner resolution and
// paired light occlusion. The repo has no test runner, so this is a self-contained
// harness: it MIRRORS the pure logic in src/systems/world/blockShapes.ts and
// blockProps.ts (kept in sync by hand) and asserts the documented behavior.
//
// Run:  node scripts/validateShapes.mjs
//
// Verifies: double slabs render/occlude as full cubes; straight/inner/outer stair
// geometry; neighbor-based corner resolution incl. left/right + canTakeShape veto;
// and paired source/target face occlusion (two partial faces that jointly seal).

// ---- mirror of blockShapes.ts ----
const POS_Z = 0, NEG_Z = 1, POS_X = 2, NEG_X = 3, SLAB_DOUBLE = 2;
const STRAIGHT = 0, INNER_LEFT = 1, INNER_RIGHT = 2, OUTER_LEFT = 3, OUTER_RIGHT = 4;
const DIR_VEC = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIR_CCW = [3, 0, 1, 2], DIR_CW = [1, 2, 3, 0], DIR_AXIS = [0, 1, 0, 1], DIR_OPP = [2, 3, 0, 1];
const FACING_TO_BACK = [0, 2, 3, 1];
const makeBox = (xh, zh, yLo, yHi) => [xh < 0 ? 0 : (xh > 0 ? 0.5 : 0), yLo, zh < 0 ? 0 : (zh > 0 ? 0.5 : 0), xh < 0 ? 0.5 : 1, yHi, zh < 0 ? 0.5 : 1];
const halfBox = (D, yLo, yHi) => DIR_AXIS[D] === 1 ? makeBox(DIR_VEC[D][0], 0, yLo, yHi) : makeBox(0, DIR_VEC[D][1], yLo, yHi);
const quadBox = (Da, Db, yLo, yHi) => makeBox(DIR_VEC[Da][0] || DIR_VEC[Db][0], DIR_VEC[Da][1] || DIR_VEC[Db][1], yLo, yHi);
function stairTopBoxes(facing, shape, yLo, yHi) {
  const B = FACING_TO_BACK[facing], L = DIR_OPP[B], left = DIR_CCW[B], right = DIR_CW[B];
  switch (shape) {
    case OUTER_LEFT: return [quadBox(B, left, yLo, yHi)];
    case OUTER_RIGHT: return [quadBox(B, right, yLo, yHi)];
    case INNER_LEFT: return [halfBox(B, yLo, yHi), quadBox(L, left, yLo, yHi)];
    case INNER_RIGHT: return [halfBox(B, yLo, yHi), quadBox(L, right, yLo, yHi)];
    default: return [halfBox(B, yLo, yHi)];
  }
}
function getShapeBoxes(isSlab, meta) {
  if (isSlab) {
    if (meta & SLAB_DOUBLE) return [[0, 0, 0, 1, 1, 1]];
    return (meta & 1) === 1 ? [[0, 0.5, 0, 1, 1, 1]] : [[0, 0, 0, 1, 0.5, 1]];
  }
  const facing = meta & 3, upside = (meta & 4) === 4, shape = (meta >> 3) & 7;
  const base = upside ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
  const yLo = upside ? 0 : 0.5, yHi = upside ? 0.5 : 1;
  const tops = stairTopBoxes(facing, shape, yLo, yHi); tops.push(base); return tops;
}
const stairBackDir = meta => FACING_TO_BACK[meta & 3];
function resolveStairShape(facing, upside, getNeighbor) {
  const back = FACING_TO_BACK[facing];
  const canTake = dir => { const v = DIR_VEC[dir], s = getNeighbor(v[0], v[1]); return !s || s.back !== back || s.upside !== upside; };
  const fv = DIR_VEC[back], front = getNeighbor(fv[0], fv[1]);
  if (front && front.upside === upside && DIR_AXIS[front.back] !== DIR_AXIS[back] && canTake(DIR_OPP[front.back]))
    return front.back === DIR_CCW[back] ? OUTER_LEFT : OUTER_RIGHT;
  const bv = DIR_VEC[DIR_OPP[back]], rear = getNeighbor(bv[0], bv[1]);
  if (rear && rear.upside === upside && DIR_AXIS[rear.back] !== DIR_AXIS[back] && canTake(rear.back))
    return rear.back === DIR_CCW[back] ? INNER_LEFT : INNER_RIGHT;
  return STRAIGHT;
}

// ---- mirror of blockProps.ts coverage / paired occlusion ----
function faceBit(nx, ny, nz) { if (nx === 1) return 0; if (nx === -1) return 1; if (ny === 1) return 2; if (ny === -1) return 3; if (nz === 1) return 4; return 5; }
function collect(boxes, face, out) {
  let ti, tv, a0, a1, b0, b1;
  switch (face) {
    case 0: ti = 3; tv = 1; a0 = 1; a1 = 4; b0 = 2; b1 = 5; break;
    case 1: ti = 0; tv = 0; a0 = 1; a1 = 4; b0 = 2; b1 = 5; break;
    case 2: ti = 4; tv = 1; a0 = 0; a1 = 3; b0 = 2; b1 = 5; break;
    case 3: ti = 1; tv = 0; a0 = 0; a1 = 3; b0 = 2; b1 = 5; break;
    case 4: ti = 5; tv = 1; a0 = 0; a1 = 3; b0 = 1; b1 = 4; break;
    default: ti = 2; tv = 0; a0 = 0; a1 = 3; b0 = 1; b1 = 4;
  }
  for (const bx of boxes) { if (bx[ti] !== tv) continue; out.push([bx[a0], bx[b0], bx[a1], bx[b1]]); }
}
function cover(rects) {
  const xs = new Set([0, 1]), ys = new Set([0, 1]);
  for (const r of rects) { xs.add(r[0]); xs.add(r[2]); ys.add(r[1]); ys.add(r[3]); }
  const xa = [...xs].sort((a, b) => a - b), ya = [...ys].sort((a, b) => a - b);
  for (let i = 0; i < xa.length - 1; i++) {
    const mx = (xa[i] + xa[i + 1]) / 2;
    for (let j = 0; j < ya.length - 1; j++) {
      const my = (ya[j] + ya[j + 1]) / 2;
      let c = false; for (const r of rects) { if (mx > r[0] && mx < r[2] && my > r[1] && my < r[3]) { c = true; break; } }
      if (!c) return false;
    }
  }
  return true;
}
const mask = boxes => { let m = 0; for (let f = 0; f < 6; f++) { const r = []; collect(boxes, f, r); if (r.length && cover(r)) m |= 1 << f; } return m; };
const dirOp = (boxes, shaped, opaque, dx, dy, dz) => !shaped ? (opaque ? 15 : 0) : ((mask(boxes) & (1 << faceBit(-dx, -dy, -dz))) ? 15 : 1);
const shapedSealed = (boxes, dx, dy, dz) => (mask(boxes) & (1 << faceBit(dx, dy, dz))) !== 0;
function pairedSealed(sB, tB, dx, dy, dz) { const r = []; collect(sB, faceBit(dx, dy, dz), r); collect(tB, faceBit(-dx, -dy, -dz), r); return r.length > 0 && cover(r); }
function pairedOcc(srcBoxes, srcShaped, tgtBoxes, tgtShaped, tgtOpaque, dx, dy, dz) {
  const base = tgtShaped ? dirOp(tgtBoxes, true, false, dx, dy, dz) : (tgtOpaque ? 15 : 0);
  if (base >= 15) return 15;
  if (!srcShaped) return base;
  if (!tgtShaped) return shapedSealed(srcBoxes, dx, dy, dz) ? 15 : base;
  return pairedSealed(srcBoxes, tgtBoxes, dx, dy, dz) ? 15 : base;
}

// ---- assertions ----
let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const t = (label, cond) => { if (cond) pass++; else { fail++; console.log('FAIL:', label); } };

// Double slabs behave as full cubes.
t('double slab is a full cube', eq(getShapeBoxes(true, SLAB_DOUBLE), [[0, 0, 0, 1, 1, 1]]));
t('double slab seals all 6 faces', mask(getShapeBoxes(true, SLAB_DOUBLE)) === 0b111111);
for (const d of [[1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, -1]])
  t('double slab blocks light ' + d, dirOp(getShapeBoxes(true, SLAB_DOUBLE), true, false, d[0], d[1], d[2]) === 15);
t('bottom slab seals only -Y', mask(getShapeBoxes(true, 0)) === (1 << 3));
t('top slab seals only +Y', mask(getShapeBoxes(true, 1)) === (1 << 2));

// Stair corner geometry.
t('straight stair = base + 1 top box', getShapeBoxes(false, POS_Z).length === 2);
t('outer stair = base + 1 top box', getShapeBoxes(false, POS_Z | (OUTER_LEFT << 3)).length === 2);
t('inner stair = base + 2 top boxes', getShapeBoxes(false, POS_Z | (INNER_LEFT << 3)).length === 3);
t('POS_Z outer-left fills NW quad', eq(stairTopBoxes(POS_Z, OUTER_LEFT, 0.5, 1), [[0, 0.5, 0, 0.5, 1, 0.5]]));
t('POS_Z inner-left fills N half + SW quad', eq(stairTopBoxes(POS_Z, INNER_LEFT, 0.5, 1), [[0, 0.5, 0, 1, 1, 0.5], [0, 0.5, 0.5, 0.5, 1, 1]]));
{
  const b = getShapeBoxes(false, POS_Z);
  t('straight stair seals -Y and back(-Z)', (mask(b) & (1 << 3)) && (mask(b) & (1 << 5)));
  t('straight stair open low side (+Z)', (mask(b) & (1 << 4)) === 0);
}
t('outer stair back face NOT fully sealed', (mask(getShapeBoxes(false, POS_Z | (OUTER_LEFT << 3))) & (1 << 5)) === 0);

// Neighbor-based corner resolution (POS_Z stair, tall side = North).
t('resolve OUTER_LEFT', resolveStairShape(POS_Z, false, (dx, dz) => (dx === 0 && dz === -1) ? { back: stairBackDir(POS_X), upside: false } : null) === OUTER_LEFT);
t('resolve OUTER_RIGHT', resolveStairShape(POS_Z, false, (dx, dz) => (dx === 0 && dz === -1) ? { back: stairBackDir(NEG_X), upside: false } : null) === OUTER_RIGHT);
t('resolve INNER_LEFT', resolveStairShape(POS_Z, false, (dx, dz) => (dx === 0 && dz === 1) ? { back: stairBackDir(POS_X), upside: false } : null) === INNER_LEFT);
t('resolve STRAIGHT (parallel front)', resolveStairShape(POS_Z, false, (dx, dz) => (dx === 0 && dz === -1) ? { back: stairBackDir(POS_Z), upside: false } : null) === STRAIGHT);
t('resolve STRAIGHT (canTakeShape veto)', resolveStairShape(POS_Z, false, (dx, dz) => {
  if (dx === 0 && dz === -1) return { back: stairBackDir(POS_X), upside: false };
  if (dx === 1 && dz === 0) return { back: stairBackDir(POS_Z), upside: false };
  return null;
}) === STRAIGHT);
t('resolve respects half mismatch', resolveStairShape(POS_Z, false, (dx, dz) => (dx === 0 && dz === -1) ? { back: stairBackDir(POS_X), upside: true } : null) === STRAIGHT);

// Paired source/target face occlusion.
const botSlab = getShapeBoxes(true, 0), topSlab = getShapeBoxes(true, 1), fullCube = [[0, 0, 0, 1, 1, 1]];
t('bottom+top slab jointly seal vertical edge', pairedOcc(botSlab, true, topSlab, true, false, 1, 0, 0) === 15);
t('bottom+bottom slab leave a gap (open)', pairedOcc(botSlab, true, botSlab, true, false, 1, 0, 0) === 1);
t('top slab does not leak light upward', pairedOcc(topSlab, true, fullCube, false, false, 0, 1, 0) === 15);
t('light into a double slab is blocked', pairedOcc(botSlab, true, getShapeBoxes(true, SLAB_DOUBLE), true, false, 1, 0, 0) === 15);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
