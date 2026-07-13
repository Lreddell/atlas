import { affectedSectionsForEdit, unpackSectionKey, type SectionKey } from './sections/sectionDirty';

export interface WorldBlockEdit {
  x: number;
  y: number;
  z: number;
  type: number;
  rotation?: number;
}

export interface WorldEditTransactionResult {
  editCount: number;
  sectionKeys: ReadonlySet<SectionKey>;
  chunkKeys: ReadonlySet<string>;
}

export class WorldEditTransaction {
  private readonly sectionKeys = new Set<SectionKey>();
  private readonly chunkKeys = new Set<string>();
  private editCount = 0;
  private committed: WorldEditTransactionResult | null = null;
  private readonly apply: (edit: WorldBlockEdit) => void;

  constructor(apply: (edit: WorldBlockEdit) => void) {
    this.apply = apply;
  }

  setBlock(x: number, y: number, z: number, type: number, rotation = 0): void {
    if (this.committed) throw new Error('World edit transaction has already been committed');
    const edit = { x, y, z, type, rotation };
    this.apply(edit);
    this.editCount += 1;
    for (const key of affectedSectionsForEdit(x, y, z)) {
      this.sectionKeys.add(key);
      const { cx, cz } = unpackSectionKey(key);
      this.chunkKeys.add(`${cx},${cz}`);
    }
  }

  commit(): WorldEditTransactionResult {
    if (this.committed) return this.committed;
    this.committed = {
      editCount: this.editCount,
      sectionKeys: this.sectionKeys,
      chunkKeys: this.chunkKeys,
    };
    return this.committed;
  }
}