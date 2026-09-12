import type { VoxelBuffer, LightBuffer, MetadataBuffer } from './voxel';

export type BoundarySide = 'left' | 'right' | 'front' | 'back';
export type NeighborColumns<T> = Partial<Record<BoundarySide, T>>;
export type BoundaryColumns<T> = NeighborColumns<T> & { layout?: 'faces' };

/**
 * Snapshot only the adjacent plane. Corners use the same clamped single-neighbor
 * samples as the full-column mesher, preserving its current AO/light behavior.
 */
export function snapshotBoundary<T extends VoxelBuffer | LightBuffer>(
  column: T, side: BoundarySide, width: number, height: number,
): T {
  const face = new (column.constructor as { new(length: number): T })(width * height);
  for (let y = 0; y < height; y++) {
    for (let along = 0; along < width; along++) {
      const x = side === 'left' ? width - 1 : side === 'right' ? 0 : along;
      const z = side === 'back' ? width - 1 : side === 'front' ? 0 : along;
      face[y * width + along] = column[y * width * width + z * width + x];
    }
  }
  return face;
}

export function snapshotMeshInput(
  blocks: VoxelBuffer, metadata: MetadataBuffer, light: LightBuffer,
  neighbors: NeighborColumns<VoxelBuffer>, neighborLights: NeighborColumns<LightBuffer>,
  width: number, height: number,
) {
  const boundaryBlocks: BoundaryColumns<VoxelBuffer> = { layout: 'faces' };
  const boundaryLights: BoundaryColumns<LightBuffer> = { layout: 'faces' };
  for (const side of ['left', 'right', 'front', 'back'] as const) {
    const neighbor = neighbors[side];
    const neighborLight = neighborLights[side];
    if (neighbor) boundaryBlocks[side] = snapshotBoundary(neighbor, side, width, height);
    if (neighborLight) boundaryLights[side] = snapshotBoundary(neighborLight, side, width, height);
  }
  const chunk = blocks.slice();
  const metaData = metadata.slice();
  const center = light.slice();
  const transfer: ArrayBuffer[] = [chunk.buffer, metaData.buffer, center.buffer];
  for (const side of ['left', 'right', 'front', 'back'] as const) {
    if (boundaryBlocks[side]) transfer.push(boundaryBlocks[side]!.buffer as ArrayBuffer);
    if (boundaryLights[side]) transfer.push(boundaryLights[side]!.buffer as ArrayBuffer);
  }
  return { chunk, metaData, neighbors: boundaryBlocks, lights: { ...boundaryLights, center }, transfer };
}
