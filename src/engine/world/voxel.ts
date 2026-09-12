/** Hot voxel IDs are compiled content handles, never persistence identities. */
export type VoxelBuffer = Uint16Array;
export type LightBuffer = Uint8Array;
export type MetadataBuffer = Uint8Array;
export const MAX_VOXEL_ID = 0xffff;

export function assertVoxelId(id: number): void {
  if (!Number.isInteger(id) || id < 0 || id > MAX_VOXEL_ID) {
    throw new RangeError(`Invalid runtime voxel ID ${id}; expected an unsigned 16-bit content handle.`);
  }
}
