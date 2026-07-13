const CHUNK_SIZE = 16;
const SECTION_SIZE = 16;
const MIN_Y = -64;
const SECTION_COUNT = 24;
const MASK_32 = 0xffff_ffffn;
const Z_SHIFT = 6n;
const X_SHIFT = 38n;

export type SectionKey = bigint;
export interface SectionCoord { cx: number; cz: number; sectionY: number }

const assertInt32 = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
    throw new RangeError(`${label} must be a signed 32-bit integer: ${value}`);
  }
};

export const packSectionKey = (cx: number, cz: number, sectionY: number): SectionKey => {
  assertInt32(cx, 'cx');
  assertInt32(cz, 'cz');
  if (!Number.isInteger(sectionY) || sectionY < 0 || sectionY >= SECTION_COUNT) {
    throw new RangeError(`sectionY out of bounds: ${sectionY}`);
  }
  const x = BigInt.asUintN(32, BigInt(cx));
  const z = BigInt.asUintN(32, BigInt(cz));
  return (x << X_SHIFT) | (z << Z_SHIFT) | BigInt(sectionY);
};

export const unpackSectionKey = (key: SectionKey): SectionCoord => ({
  cx: Number(BigInt.asIntN(32, key >> X_SHIFT)),
  cz: Number(BigInt.asIntN(32, (key >> Z_SHIFT) & MASK_32)),
  sectionY: Number(key & 0x3fn),
});

const chunkAxis = (value: number): { chunk: number; local: number } => {
  const chunk = Math.floor(value / CHUNK_SIZE);
  return { chunk, local: value - chunk * CHUNK_SIZE };
};

export const sectionYForWorldY = (y: number): number => {
  const sectionY = Math.floor((y - MIN_Y) / SECTION_SIZE);
  if (sectionY < 0 || sectionY >= SECTION_COUNT) throw new RangeError(`Y out of bounds: ${y}`);
  return sectionY;
};

export const affectedSectionsForEdit = (x: number, y: number, z: number): Set<SectionKey> => {
  const xAxis = chunkAxis(x);
  const zAxis = chunkAxis(z);
  const sectionY = sectionYForWorldY(y);
  const localY = (y - MIN_Y) & (SECTION_SIZE - 1);
  const result = new Set<SectionKey>();
  const add = (cx: number, cz: number, sy: number) => {
    if (sy >= 0 && sy < SECTION_COUNT) result.add(packSectionKey(cx, cz, sy));
  };
  add(xAxis.chunk, zAxis.chunk, sectionY);
  if (localY === 0) add(xAxis.chunk, zAxis.chunk, sectionY - 1);
  else if (localY === SECTION_SIZE - 1) add(xAxis.chunk, zAxis.chunk, sectionY + 1);
  if (xAxis.local === 0) add(xAxis.chunk - 1, zAxis.chunk, sectionY);
  else if (xAxis.local === CHUNK_SIZE - 1) add(xAxis.chunk + 1, zAxis.chunk, sectionY);
  if (zAxis.local === 0) add(xAxis.chunk, zAxis.chunk - 1, sectionY);
  else if (zAxis.local === CHUNK_SIZE - 1) add(xAxis.chunk, zAxis.chunk + 1, sectionY);
  return result;
};