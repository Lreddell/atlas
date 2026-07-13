export const SECTION_SIZE = 16;
export const SECTION_AREA = SECTION_SIZE * SECTION_SIZE;
export const SECTION_VOLUME = SECTION_AREA * SECTION_SIZE;
export const DEFAULT_SKY_LIGHT = 15 << 4;

export type SectionRenderState = 'hidden' | 'queued' | 'meshing' | 'ready';
export type SectionSaveState = 'clean' | 'dirty' | 'saving' | 'failed';

export const localSectionIndex = (x: number, y: number, z: number): number => {
  if (x < 0 || x >= SECTION_SIZE || y < 0 || y >= SECTION_SIZE || z < 0 || z >= SECTION_SIZE) {
    throw new RangeError(`Section coordinate out of bounds: ${x},${y},${z}`);
  }
  return y * SECTION_AREA + z * SECTION_SIZE + x;
};

export class ChunkSection {
  readonly blocks = new Uint8Array(SECTION_VOLUME);
  readonly light = new Uint8Array(SECTION_VOLUME);
  metadata: Uint8Array | undefined;
  dataVersion = 0;
  meshVersion = 0;
  dirty = false;
  renderState: SectionRenderState = 'hidden';
  saveState: SectionSaveState = 'clean';
  occupancyMin: [number, number, number] | null = null;
  occupancyMax: [number, number, number] | null = null;

  constructor(defaultLight = DEFAULT_SKY_LIGHT) {
    if (defaultLight !== 0) this.light.fill(defaultLight);
  }

  get allocatedBytes(): number {
    return this.blocks.byteLength + this.light.byteLength + (this.metadata?.byteLength ?? 0);
  }

  get isEmpty(): boolean {
    return this.occupancyMin === null;
  }

  ensureMetadata(): Uint8Array {
    if (!this.metadata) this.metadata = new Uint8Array(SECTION_VOLUME);
    return this.metadata;
  }

  getBlock(x: number, y: number, z: number): number {
    return this.blocks[localSectionIndex(x, y, z)];
  }

  setBlock(x: number, y: number, z: number, value: number): void {
    const index = localSectionIndex(x, y, z);
    const previous = this.blocks[index];
    if (previous === value) return;
    this.blocks[index] = value;
    this.dataVersion += 1;
    this.dirty = true;
    this.saveState = 'dirty';
    if (value !== 0) this.expandOccupancy(x, y, z);
    else if (previous !== 0 && this.touchesOccupancyBoundary(x, y, z)) this.recomputeOccupancy();
  }

  getLight(x: number, y: number, z: number): number {
    return this.light[localSectionIndex(x, y, z)];
  }

  setLight(x: number, y: number, z: number, value: number): void {
    const index = localSectionIndex(x, y, z);
    if (this.light[index] === value) return;
    this.light[index] = value;
    this.dataVersion += 1;
    this.dirty = true;
    this.saveState = 'dirty';
  }

  getMetadata(x: number, y: number, z: number): number {
    return this.metadata?.[localSectionIndex(x, y, z)] ?? 0;
  }

  setMetadata(x: number, y: number, z: number, value: number): void {
    const index = localSectionIndex(x, y, z);
    const previous = this.metadata?.[index] ?? 0;
    if (previous === value) return;
    if (value === 0 && !this.metadata) return;
    this.ensureMetadata()[index] = value;
    this.dataVersion += 1;
    this.dirty = true;
    this.saveState = 'dirty';
  }

  recomputeOccupancy(): void {
    let minX = SECTION_SIZE;
    let minY = SECTION_SIZE;
    let minZ = SECTION_SIZE;
    let maxX = -1;
    let maxY = -1;
    let maxZ = -1;
    for (let y = 0; y < SECTION_SIZE; y += 1) {
      for (let z = 0; z < SECTION_SIZE; z += 1) {
        const base = y * SECTION_AREA + z * SECTION_SIZE;
        for (let x = 0; x < SECTION_SIZE; x += 1) {
          if (this.blocks[base + x] === 0) continue;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (z < minZ) minZ = z;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          if (z > maxZ) maxZ = z;
        }
      }
    }
    if (maxX < 0) {
      this.occupancyMin = null;
      this.occupancyMax = null;
      return;
    }
    this.occupancyMin = [minX, minY, minZ];
    this.occupancyMax = [maxX, maxY, maxZ];
  }

  private expandOccupancy(x: number, y: number, z: number): void {
    if (!this.occupancyMin || !this.occupancyMax) {
      this.occupancyMin = [x, y, z];
      this.occupancyMax = [x, y, z];
      return;
    }
    this.occupancyMin[0] = Math.min(this.occupancyMin[0], x);
    this.occupancyMin[1] = Math.min(this.occupancyMin[1], y);
    this.occupancyMin[2] = Math.min(this.occupancyMin[2], z);
    this.occupancyMax[0] = Math.max(this.occupancyMax[0], x);
    this.occupancyMax[1] = Math.max(this.occupancyMax[1], y);
    this.occupancyMax[2] = Math.max(this.occupancyMax[2], z);
  }

  private touchesOccupancyBoundary(x: number, y: number, z: number): boolean {
    const min = this.occupancyMin;
    const max = this.occupancyMax;
    return !!min && !!max && (
      x === min[0] || x === max[0] || y === min[1] || y === max[1] || z === min[2] || z === max[2]
    );
  }
}
