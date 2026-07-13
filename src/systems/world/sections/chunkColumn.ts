import { CHUNK_SIZE, MAX_Y, MIN_Y, WORLD_HEIGHT } from '../../../constants';
import {
  ChunkSection,
  DEFAULT_SKY_LIGHT,
  SECTION_AREA,
  SECTION_SIZE,
  SECTION_VOLUME,
} from './chunkSection';

export { SECTION_SIZE, SECTION_VOLUME } from './chunkSection';
export const SECTION_COUNT = WORLD_HEIGHT / SECTION_SIZE;
export const COLUMN_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;

export type ColumnArrayKind = 'blocks' | 'light' | 'metadata';

const assertWorldCoord = (x: number, y: number, z: number): void => {
  if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < MIN_Y || y > MAX_Y) {
    throw new RangeError(`Chunk-column coordinate out of bounds: ${x},${y},${z}`);
  }
};

export const sectionIndexForY = (y: number): number => {
  if (y < MIN_Y || y > MAX_Y) throw new RangeError(`Y out of bounds: ${y}`);
  return Math.floor((y - MIN_Y) / SECTION_SIZE);
};

export const localYForWorldY = (y: number): number => {
  if (y < MIN_Y || y > MAX_Y) throw new RangeError(`Y out of bounds: ${y}`);
  return (y - MIN_Y) & (SECTION_SIZE - 1);
};

const legacyIndex = (x: number, yOffset: number, z: number): number =>
  yOffset * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;

export class ChunkColumn {
  readonly sections: Array<ChunkSection | undefined> = new Array(SECTION_COUNT);
  dataVersion = 0;
  meshVersion = 0;
  dirty = false;

  static fromLegacy(
    blocks: Uint8Array,
    light?: Uint8Array,
    metadata?: Uint8Array,
  ): ChunkColumn {
    if (blocks.length !== COLUMN_VOLUME) {
      throw new RangeError(`Invalid block column length ${blocks.length}; expected ${COLUMN_VOLUME}.`);
    }
    if (light && light.length !== COLUMN_VOLUME) {
      throw new RangeError(`Invalid light column length ${light.length}; expected ${COLUMN_VOLUME}.`);
    }
    if (metadata && metadata.length !== COLUMN_VOLUME) {
      throw new RangeError(`Invalid metadata column length ${metadata.length}; expected ${COLUMN_VOLUME}.`);
    }

    const column = new ChunkColumn();
    for (let sectionY = 0; sectionY < SECTION_COUNT; sectionY += 1) {
      const yStart = sectionY * SECTION_SIZE;
      let needsSection = false;
      let needsMetadata = false;
      outer: for (let localY = 0; localY < SECTION_SIZE; localY += 1) {
        const yOffset = yStart + localY;
        for (let z = 0; z < CHUNK_SIZE; z += 1) {
          for (let x = 0; x < CHUNK_SIZE; x += 1) {
            const index = legacyIndex(x, yOffset, z);
            if (blocks[index] !== 0 || (light?.[index] ?? DEFAULT_SKY_LIGHT) !== DEFAULT_SKY_LIGHT) {
              needsSection = true;
            }
            if ((metadata?.[index] ?? 0) !== 0) {
              needsSection = true;
              needsMetadata = true;
            }
            if (needsSection && needsMetadata) break outer;
          }
        }
      }
      if (!needsSection) continue;

      const section = new ChunkSection(DEFAULT_SKY_LIGHT);
      if (needsMetadata) section.metadata = new Uint8Array(SECTION_VOLUME);
      for (let localY = 0; localY < SECTION_SIZE; localY += 1) {
        const yOffset = yStart + localY;
        const sectionBase = localY * SECTION_AREA;
        for (let z = 0; z < CHUNK_SIZE; z += 1) {
          const legacyBase = legacyIndex(0, yOffset, z);
          const targetBase = sectionBase + z * CHUNK_SIZE;
          section.blocks.set(blocks.subarray(legacyBase, legacyBase + CHUNK_SIZE), targetBase);
          if (light) section.light.set(light.subarray(legacyBase, legacyBase + CHUNK_SIZE), targetBase);
          if (section.metadata && metadata) {
            section.metadata.set(metadata.subarray(legacyBase, legacyBase + CHUNK_SIZE), targetBase);
          }
        }
      }
      section.recomputeOccupancy();
      section.dirty = false;
      section.saveState = 'clean';
      section.dataVersion = 0;
      column.sections[sectionY] = section;
    }
    return column;
  }

  get allocatedSectionCount(): number {
    let count = 0;
    for (const section of this.sections) if (section) count += 1;
    return count;
  }

  get allocatedBytes(): number {
    let total = 0;
    for (const section of this.sections) total += section?.allocatedBytes ?? 0;
    return total;
  }

  getSection(sectionY: number): ChunkSection | undefined {
    if (sectionY < 0 || sectionY >= SECTION_COUNT) throw new RangeError(`Section Y out of bounds: ${sectionY}`);
    return this.sections[sectionY];
  }

  ensureSection(sectionY: number): ChunkSection {
    if (sectionY < 0 || sectionY >= SECTION_COUNT) throw new RangeError(`Section Y out of bounds: ${sectionY}`);
    let section = this.sections[sectionY];
    if (!section) {
      section = new ChunkSection(DEFAULT_SKY_LIGHT);
      this.sections[sectionY] = section;
    }
    return section;
  }

  getBlock(x: number, y: number, z: number): number {
    assertWorldCoord(x, y, z);
    return this.sections[sectionIndexForY(y)]?.getBlock(x, localYForWorldY(y), z) ?? 0;
  }

  setBlock(x: number, y: number, z: number, value: number): void {
    assertWorldCoord(x, y, z);
    const sectionY = sectionIndexForY(y);
    const existing = this.sections[sectionY];
    if (!existing && value === 0) return;
    const section = existing ?? this.ensureSection(sectionY);
    const before = section.getBlock(x, localYForWorldY(y), z);
    section.setBlock(x, localYForWorldY(y), z, value);
    if (before !== value) this.markChanged();
  }

  getLight(x: number, y: number, z: number): number {
    assertWorldCoord(x, y, z);
    return this.sections[sectionIndexForY(y)]?.getLight(x, localYForWorldY(y), z) ?? DEFAULT_SKY_LIGHT;
  }

  setLight(x: number, y: number, z: number, value: number): void {
    assertWorldCoord(x, y, z);
    const sectionY = sectionIndexForY(y);
    const existing = this.sections[sectionY];
    if (!existing && value === DEFAULT_SKY_LIGHT) return;
    const section = existing ?? this.ensureSection(sectionY);
    const before = section.getLight(x, localYForWorldY(y), z);
    section.setLight(x, localYForWorldY(y), z, value);
    if (before !== value) this.markChanged();
  }

  getMetadata(x: number, y: number, z: number): number {
    assertWorldCoord(x, y, z);
    return this.sections[sectionIndexForY(y)]?.getMetadata(x, localYForWorldY(y), z) ?? 0;
  }

  setMetadata(x: number, y: number, z: number, value: number): void {
    assertWorldCoord(x, y, z);
    const sectionY = sectionIndexForY(y);
    const existing = this.sections[sectionY];
    if (!existing && value === 0) return;
    const section = existing ?? this.ensureSection(sectionY);
    const before = section.getMetadata(x, localYForWorldY(y), z);
    section.setMetadata(x, localYForWorldY(y), z, value);
    if (before !== value) this.markChanged();
  }


  replaceKindFromLegacy(kind: ColumnArrayKind, data: Uint8Array): void {
    if (data.length !== COLUMN_VOLUME) {
      throw new RangeError(`Invalid ${kind} column length ${data.length}; expected ${COLUMN_VOLUME}.`);
    }
    for (let sectionY = 0; sectionY < SECTION_COUNT; sectionY += 1) {
      const yStart = sectionY * SECTION_SIZE;
      const defaultValue = kind === 'light' ? DEFAULT_SKY_LIGHT : 0;
      let needsData = false;
      scan: for (let localY = 0; localY < SECTION_SIZE; localY += 1) {
        const yOffset = yStart + localY;
        for (let z = 0; z < CHUNK_SIZE; z += 1) {
          const base = legacyIndex(0, yOffset, z);
          for (let x = 0; x < CHUNK_SIZE; x += 1) {
            if (data[base + x] !== defaultValue) { needsData = true; break scan; }
          }
        }
      }
      let section = this.sections[sectionY];
      if (!needsData && !section) continue;
      if (!section) section = this.ensureSection(sectionY);
      let target: Uint8Array;
      if (kind === 'blocks') target = section.blocks;
      else if (kind === 'light') target = section.light;
      else {
        if (!needsData) { section.metadata = undefined; this.pruneSection(sectionY); continue; }
        target = section.ensureMetadata();
      }
      if (!needsData) target.fill(defaultValue);
      else {
        for (let localY = 0; localY < SECTION_SIZE; localY += 1) {
          const yOffset = yStart + localY;
          const targetBase = localY * SECTION_AREA;
          for (let z = 0; z < CHUNK_SIZE; z += 1) {
            const sourceBase = legacyIndex(0, yOffset, z);
            const rowBase = targetBase + z * CHUNK_SIZE;
            target.set(data.subarray(sourceBase, sourceBase + CHUNK_SIZE), rowBase);
          }
        }
      }
      if (kind === 'blocks') section.recomputeOccupancy();
      section.dataVersion += 1;
      section.dirty = false;
      section.saveState = 'clean';
      this.pruneSection(sectionY);
    }
    this.dataVersion += 1;
  }

  clearKind(kind: ColumnArrayKind): void {
    for (let sectionY = 0; sectionY < SECTION_COUNT; sectionY += 1) {
      const section = this.sections[sectionY];
      if (!section) continue;
      if (kind === 'blocks') { section.blocks.fill(0); section.recomputeOccupancy(); }
      else if (kind === 'light') section.light.fill(DEFAULT_SKY_LIGHT);
      else section.metadata = undefined;
      section.dataVersion += 1;
      this.pruneSection(sectionY);
    }
    this.dataVersion += 1;
  }

  allocatedBytesForKind(kind: ColumnArrayKind): number {
    let total = 0;
    for (const section of this.sections) {
      if (!section) continue;
      if (kind === 'blocks') total += section.blocks.byteLength;
      else if (kind === 'light') total += section.light.byteLength;
      else total += section.metadata?.byteLength ?? 0;
    }
    return total;
  }

  hasAllocatedKind(kind: ColumnArrayKind): boolean {
    if (kind === 'blocks' || kind === 'light') return this.sections.some(Boolean);
    return this.sections.some((section) => !!section?.metadata);
  }

  private pruneSection(sectionY: number): void {
    const section = this.sections[sectionY];
    if (!section) return;
    if (!section.isEmpty) return;
    if (section.metadata?.some((value) => value !== 0)) return;
    for (let index = 0; index < section.light.length; index += 1) {
      if (section.light[index] !== DEFAULT_SKY_LIGHT) return;
    }
    this.sections[sectionY] = undefined;
  }

  readLinear(kind: ColumnArrayKind, index: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= COLUMN_VOLUME) return undefined as unknown as number;
    const yOffset = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
    const withinLayer = index - yOffset * CHUNK_SIZE * CHUNK_SIZE;
    const z = Math.floor(withinLayer / CHUNK_SIZE);
    const x = withinLayer - z * CHUNK_SIZE;
    const y = yOffset + MIN_Y;
    if (kind === 'blocks') return this.getBlock(x, y, z);
    if (kind === 'light') return this.getLight(x, y, z);
    return this.getMetadata(x, y, z);
  }

  writeLinear(kind: ColumnArrayKind, index: number, value: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= COLUMN_VOLUME) return;
    const yOffset = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
    const withinLayer = index - yOffset * CHUNK_SIZE * CHUNK_SIZE;
    const z = Math.floor(withinLayer / CHUNK_SIZE);
    const x = withinLayer - z * CHUNK_SIZE;
    const y = yOffset + MIN_Y;
    if (kind === 'blocks') this.setBlock(x, y, z, value);
    else if (kind === 'light') this.setLight(x, y, z, value);
    else this.setMetadata(x, y, z, value);
  }

  private markChanged(): void {
    this.datU™\œÚ[Ûˆ
ÏHNÂˆ\Ë™\HHYNÂˆBŸB‚™^ÜÛÛœİX]\šX[^™PÛÛ[[\œ˜^HH
ˆÛÛ[[ˆÚ[šĞÛÛ[[‹ˆÚ[™ˆÛÛ[[\œ˜^RÚ[™ŠNˆZ[\œ˜^HOˆÂˆÛÛœİİ]]H™]ÈZ[\œ˜^JÓÓSS—Õ“ÓSQJNÂˆYˆ
Ú[™OOH	ÛYÚ	ÊHİ]]™š[
QUSÔÒÖWÓQÒ
NÂˆ›Üˆ
]ÙXİ[Û–HHÈÙXİ[Û–HÑPÕSÓ—ĞÓÕS•ÈÙXİ[Û–H
ÏHJHÂˆÛÛœİÙXİ[ÛˆHÛÛ[[‹œÙXİ[ÛœÖÜÙXİ[Û–WNÂˆYˆ
\ÙXİ[ÛŠHÛÛ[YNÂˆÛÛœİÛİ\˜ÙHHÚ[™OOH	Ø›ØÚÜÉÈÈÙXİ[Û‹˜›ØÚÜÈˆÚ[™OOH	ÛYÚ	ÈÈÙXİ[Û‹›YÚˆÙXİ[Û‹›Y]Y]NÂˆYˆ
\Ûİ\˜ÙJHÛÛ[YNÂˆ›Üˆ
]ØØ[HHÈØØ[HÑPÕSÓ—ÔÒV‘NÈØØ[H
ÏHJHÂˆÛÛœİSÙ™œÙ]HÙXİ[Û–H
ˆÑPÕSÓ—ÔÒV‘H
ÈØØ[NÂˆÛÛœİÛİ\˜ÙP˜\ÙHHØØ[H
ˆÑPÕSÓ—ĞT‘PNÂˆ›Üˆ
]ˆHÈˆÒS’×ÔÒV‘NÈˆ
ÏHJHÂˆÛÛœİ\™Ù]˜\ÙHHYØXŞR[™^
SÙ™œÙ]ŠNÂˆÛÛœİ›İĞ˜\ÙHHÛİ\˜ÙP˜\ÙH
Èˆ
ˆÒS’×ÔÒV‘NÂˆİ]]œÙ]
Ûİ\˜ÙKœİX˜\œ˜^J›İĞ˜\ÙK›İĞ˜\ÙH
ÈÒS’×ÔÒV‘JK\™Ù]˜\ÙJNÂˆBˆBˆBˆ™]\›ˆİ]]ÂŸNÂ