import {
  ChunkColumn,
  COLUMN_VOLUME,
  materializeColumnArray,
  type ColumnArrayKind,
} from './chunkColumn';

const VIEW_INFO = Symbol('atlas.sectioned-array-view');

interface ViewInfo {
  column: ChunkColumn;
  kind: ColumnArrayKind;
}

export interface SectionedColumnMaps {
  columns: Map<string, ChunkColumn>;
  chunks: SectionedColumnMap;
  lights: SectionedColumnMap;
  metadata: SectionedColumnMap;
}

const parseArrayIndex = (property: PropertyKey): number | null => {
  if (typeof property !== 'string' || property.length === 0) return null;
  const code = property.charCodeAt(0);
  if (code < 48 || code > 57) return null;
  const value = Number(property);
  return Number.isInteger(value) && value >= 0 ? value : null;
};

const createView = (column: ChunkColumn, kind: ColumnArrayKind): Uint8Array => {
  const target = Object.create(null) as Record<PropertyKey, unknown>;
  const viewInfo: ViewInfo = { column, kind };
  Object.defineProperty(target, VIEW_INFO, { value: viewInfo, enumerable: false });
  const materialize = () => materializeColumnArray(column, kind);
  const proxy = new Proxy(target, {
    get(_target, property) {
      const index = parseArrayIndex(property);
      if (index !== null) return column.readLinear(kind, index);
      if (property === VIEW_INFO) return viewInfo;
      if (property === 'length') return COLUMN_VOLUME;
      if (property === 'byteLength') return column.allocatedBytesForKind(kind);
      if (property === 'byteOffset') return 0;
      if (property === 'BYTES_PER_ELEMENT') return 1;
      if (property === 'buffer') return materialize().buffer;
      if (property === Symbol.toStringTag) return 'Uint8Array';
      if (property === Symbol.iterator) return materialize()[Symbol.iterator].bind(materialize());
      if (property === 'toUint8Array') return materialize;
      if (property === 'slice' || property === 'subarray') {
        return (start?: number, end?: number) => materialize().slice(start, end);
      }
      if (property === 'set') {
        return (source: ArrayLike<number>, offset = 0) => {
          if (offset < 0 || offset + source.length > COLUMN_VOLUME) throw new RangeError('Source is too large');
          for (let index = 0; index < source.length; index += 1) column.writeLinear(kind, offset + index, source[index]);
        };
      }
      if (property === 'fill') {
        return (value: number, start = 0, end = COLUMN_VOLUME) => {
          const normalizedStart = start < 0 ? Math.max(0, COLUMN_VOLUME + start) : Math.min(COLUMN_VOLUME, start);
          const normalizedEnd = end < 0 ? Math.max(0, COLUMN_VOLUME + end) : Math.min(COLUMN_VOLUME, end);
          for (let index = normalizedStart; index < normalizedEnd; index += 1) column.writeLinear(kind, index, value);
          return proxy;
        };
      }
      if (property === 'at') return (index: number) => column.readLinear(kind, index < 0 ? COLUMN_VOLUME + index : index);
      const array = materialize();
      const value = Reflect.get(array, property, array);
      return typeof value === 'function' ? value.bind(array) : value;
    },
    set(_target, property, value) {
      const index = parseArrayIndex(property);
      if (index === null) return false;
      column.writeLinear(kind, index, Number(value));
      return true;
    },
    has(_target, property) {
      const index = parseArrayIndex(property);
      return index !== null ? index < COLUMN_VOLUME : property in target;
    },
  });
  return proxy as unknown as Uint8Array;
};

export const isSectionedColumnView = (value: unknown): value is Uint8Array =>
  !!value && typeof value === 'object' && VIEW_INFO in (value as object);

export const getSectionedViewInfo = (value: unknown): ViewInfo | null =>
  isSectionedColumnView(value) ? ((value as unknown as Record<PropertyKey, unknown>)[VIEW_INFO] as ViewInfo) : null;

export const materializeUint8Array = (value: Uint8Array): Uint8Array => {
  const info = getSectionedViewInfo(value);
  return info ? materializeColumnArray(info.column, info.kind) : value;
};

export const allocatedBytesOfArray = (value: Uint8Array): number => {
  const info = getSectionedViewInfo(value);
  return info ? info.column.allocatedBytesForKind(info.kind) : value.byteLength;
};

export class SectionedColumnMap {
  readonly [Symbol.toStringTag] = 'Map';
  private readonly views = new Map<string, Uint8Array>();
  private readonly columns: Map<string, ChunkColumn>;
  readonly kind: ColumnArrayKind;

  constructor(columns: Map<string, ChunkColumn>, kind: ColumnArrayKind) {
    this.columns = columns;
    this.kind = kind;
  }

  get size(): number {
    return this.columns.size;
  }

  clear(): void {
    this.views.clear();
    if (this.kind === 'blocks') this.columns.clear();
    else for (const column of this.columns.values()) column.clearKind(this.kind);
  }

  delete(key: string): boolean {
    this.views.delete(key);
    if (this.kind === 'blocks') return this.columns.delete(key);
    const column = this.columns.get(key);
    if (!column) return false;
    column.clearKind(this.kind);
    return true;
  }

  forEach(callbackfn: (value: Uint8Array, key: string, map: Map<string, Uint8Array>) => void, thisArg?: unknown): void {
    for (const [key, value] of this.entries()) callbackfn.call(thisArg, value, key, this as unknown as Map<string, Uint8Array>);
  }

  get(key: string): Uint8Array | undefined {
    const column = this.columns.get(key);
    if (!column) return undefined;
    let view = this.views.get(key);
    if (!view) {
      view = createView(column, this.kind);
      this.views.set(key, view);
    }
    return view;
  }

  has(key: string): boolean {
    return this.columns.has(key);
  }

  set(key: string, value: Uint8Array): this {
    let column = this.columns.get(key);
    if (!column) {
      column = new ChunkColumn();
      this.columns.set(key, column);
    }
    column.replaceKindFromLegacy(this.kind, materializeUint8Array(value));
    this.views.delete(key);
    return this;
  }

  *entries(): IterableIterator<[string, Uint8Array]> {
    for (const key of this.columns.keys()) {
      const value = this.get(key);
      if (value) yield [key, value];
    }
  }

  keys(): IterableIterator<string> {
    return this.columns.keys();
  }

  *values(): IterableIterator<Uint8Array> {
    for (const key of this.columns.keys()) {
      const value = this.get(key);
      if (value) yield value;
    }
  }

  [Symbol.iterator](): IterableIterator<[string, Uint8Array]> {
    return this.entries();
  }
}

export const createSectionedColumnMaps = (): SectionedColumnMaps => {
  const columns = new Map<string, ChunkColumn>();
  return {
    columns,
    chunks: new SectionedColumnMap(columns, 'blocks'),
    lights: new SectionedColumnMap(columns, 'light'),
    metadata: new SectionedColumnMap(columns, 'metadata'),
  };
};
