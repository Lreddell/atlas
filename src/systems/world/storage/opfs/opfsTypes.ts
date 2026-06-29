// Structural subset of the Origin Private File System (OPFS) API actually used by
// OpfsSavesCore. Declaring it ourselves (rather than relying on lib.dom) lets the
// Node test fake implement exactly this shape, and documents the surface we depend
// on. The real FileSystemDirectoryHandle / FileSystemFileHandle satisfy it.

/** Synchronous random-access file handle — Web Worker only in real OPFS. */
export interface OpfsSyncAccessHandle {
    read(buffer: Uint8Array, options?: { at?: number }): number;
    write(buffer: Uint8Array, options?: { at?: number }): number;
    getSize(): number;
    truncate(newSize: number): void;
    flush(): void;
    close(): void;
}

export interface OpfsWritable {
    write(data: Uint8Array): Promise<void>;
    close(): Promise<void>;
}

export interface OpfsFileHandle {
    readonly kind: 'file';
    createSyncAccessHandle(): Promise<OpfsSyncAccessHandle>;
    createWritable(options?: { keepExistingData?: boolean }): Promise<OpfsWritable>;
    getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; size: number }>;
}

export interface OpfsDirHandle {
    readonly kind: 'directory';
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OpfsDirHandle>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>;
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
    entries(): AsyncIterableIterator<[string, OpfsDirHandle | OpfsFileHandle]>;
}
