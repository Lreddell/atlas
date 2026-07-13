import { CHUNK_SIZE, WORLD_HEIGHT } from '../../constants';

export type NeighborDirection = 'left' | 'right' | 'front' | 'back';

export interface NeighborPlanes {
  left?: Uint8Array;
  right?: Uint8Array;
  front?: Uint8Array;
  back?: Uint8Array;
  borderOnly?: boolean;
}

export const BORDER_PLANE_LENGTH = CHUNK_SIZE * WORLD_HEIGHT;
const LAYER_SIZE = CHUNK_SIZE * CHUNK_SIZE;
const CHUNK_VOLUME = LAYER_SIZE * WORLD_HEIGHT;

const fullIndex = (x: number, localY: number, z: number): number =>
  localY * LAYER_SIZE + z * CHUNK_SIZE + x;

const borderSourceCoordinates = (
  direction: NeighborDirection,
  lateral: number,
): { x: number; z: number } => {
  switch (direction) {
    case 'left':
      return { x: CHUNK_SIZE - 1, z: lateral };
    case 'right':
      return { x: 0, z: lateral };
    case 'front':
      return { x: lateral, z: 0 };
    case 'back':
      return { x: lateral, z: CHUNK_SIZE - 1 };
  }
};

export const extractBorderPlane = (
  source: Uint8Array | undefined,
  direction: NeighborDirection,
): Uint8Array | undefined => {
  if (!source) return undefined;
  if (source.length === BORDER_PLANE_LENGTH) return source;
  if (source.length < CHUNK_VOLUME) return undefined;

  const plane = new Uint8Array(BORDER_PLANE_LENGTH);
  for (let localY = 0; localY < WORLD_HEIGHT; localY += 1) {
    const planeBase = localY * CHUNK_SIZE;
    for (let lateral = 0; lateral < CHUNK_SIZE; lateral += 1) {
      const { x, z } = borderSourceCoordinates(direction, lateral);
      plane[planeBase + lateral] = source[fullIndex(x, localY, z)];
    }
  }
  return plane;
};

export const compactNeighborPlanes = (neighbors: NeighborPlanes | undefined): NeighborPlanes => ({
  borderOnly: true,
  left: extractBorderPlane(neighbors?.left, 'left'),
  right: extractBorderPlane(neighbors?.right, 'right'),
  front: extractBorderPlane(neighbors?.front, 'front'),
  back: extractBorderPlane(neighbors?.back, 'back'),
});

const expandPlane = (
  plane: Uint8Array | undefined,
  direction: NeighborDirection,
): Uint8Array | undefined => {
  if (!plane) return undefined;
  if (plane.length !== BORDER_PLANE_LENGTH) return plane;

  const expanded = new Uint8Array(CHUNK_VOLUME);
  for (let localY = 0; localY < WORLD_HEIGHT; localY += 1) {
    const planeBase = localY * CHUNK_SIZE;
    for (let lateral = 0; lateral < CHUNK_SIZE; lateral += 1) {
      const { x, z } = borderSourceCoordinates(direction, lateral);
      expanded[fullIndex(x, localY, z)] = plane[planeBase + lateral];
    }
  }
  return expanded;
};

export const expandNeighborPlanes = (neighbors: NeighborPlanes | undefined): NeighborPlanes => {
  if (!neighbors?.borderOnly) return neighbors ?? {};
  return {
    left: expandPlane(neighbors.left, 'left'),
    right: expandPlane(neighbors.right, 'right'),
    front: expandPlane(neighbors.front, 'front'),
    back: expandPlane(neighbors.back, 'back'),
  };
};
