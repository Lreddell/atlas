import { CHUNK_SIZE, WORLD_HEIGHT } from "../../../constants";

export type NeighborBorderSide = "left" | "right" | "front" | "back";
export type NeighborBorderMap = Partial<Record<NeighborBorderSide, Uint8Array>>;

export const NEIGHBOR_BORDER_CELLS = CHUNK_SIZE * WORLD_HEIGHT;
export const NEIGHBOR_BORDER_BYTES = NEIGHBOR_BORDER_CELLS;

const SIDES: readonly NeighborBorderSide[] = ["left", "right", "front", "back"];

const arrayIndex = (x: number, yOffset: number, z: number): number =>
  yOffset * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;

export const extractNeighborBorder = (
  source: Uint8Array | undefined,
  side: NeighborBorderSide,
): Uint8Array | undefined => {
  if (!source) return undefined;
  const plane = new Uint8Array(NEIGHBOR_BORDER_CELLS);
  for (let yOffset = 0; yOffset < WORLD_HEIGHT; yOffset += 1) {
    const planeOffset = yOffset * CHUNK_SIZE;
    for (let axis = 0; axis < CHUNK_SIZE; axis += 1) {
      let x = axis;
      let z = axis;
      if (side === "left") x = CHUNK_SIZE - 1;
      else if (side === "right") x = 0;
      else if (side === "front") z = 0;
      else z = CHUNK_SIZE - 1;
      plane[planeOffset + axis] = source[arrayIndex(x, yOffset, z)];
    }
  }
  return plane;
};

export const extractNeighborBorders = (
  neighbors: Partial<Record<NeighborBorderSide, Uint8Array>> | undefined,
): NeighborBorderMap => {
  const borders: NeighborBorderMap = {};
  if (!neighbors) return borders;
  for (const side of SIDES) {
    const plane = extractNeighborBorder(neighbors[side], side);
    if (plane) borders[side] = plane;
  }
  return borders;
};

export const writeNeighborBorder = (
  target: Uint8Array,
  plane: Uint8Array,
  side: NeighborBorderSide,
): void => {
  if (plane.length !== NEIGHBOR_BORDER_CELLS) {
    throw new RangeError(
      `Invalid ${side} border length ${plane.length}; expected ${NEIGHBOR_BORDER_CELLS}.`,
    );
  }
  for (let yOffset = 0; yOffset < WORLD_HEIGHT; yOffset += 1) {
    const planeOffset = yOffset * CHUNK_SIZE;
    for (let axis = 0; axis < CHUNK_SIZE; axis += 1) {
      let x = axis;
      let z = axis;
      if (side === "left") x = CHUNK_SIZE - 1;
      else if (side === "right") x = 0;
      else if (side === "front") z = 0;
      else z = CHUNK_SIZE - 1;
      target[arrayIndex(x, yOffset, z)] = plane[planeOffset + axis];
    }
  }
};

export const inflateNeighborBorders = (
  borders: NeighborBorderMap | undefined,
  targetLength: number,
  scratch: Partial<Record<NeighborBorderSide, Uint8Array>>,
): Partial<Record<NeighborBorderSide, Uint8Array>> => {
  const inflated: Partial<Record<NeighborBorderSide, Uint8Array>> = {};
  if (!borders) return inflated;
  for (const side of SIDES) {
    const plane = borders[side];
    if (!plane) continue;
    let target = scratch[side];
    if (!target || target.length !== targetLength) {
      target = new Uint8Array(targetLength);
      scratch[side] = target;
    }
    writeNeighborBorder(target, plane, side);
    inflated[side] = target;
  }
  return inflated;
};

export const neighborScratchBytes = (
  scratch: Partial<Record<NeighborBorderSide, Uint8Array>>,
): number =>
  SIDES.reduce((total, side) => total + (scratch[side]?.byteLength ?? 0), 0);
