// Pure request dispatch for the SaveWorker — separated from the worker globals so
// it can be unit-tested against an OpfsSavesCore backed by a fake OPFS.

import type { OpfsSavesCore } from './OpfsSavesCore';
import type { ChunkBatchEntry, WorldMetadata } from '../types';

export async function handleSaveRequest(core: OpfsSavesCore, op: string, args: unknown[]): Promise<unknown> {
    const a = args as [string, ...unknown[]];
    switch (op) {
        case 'list': return core.list();
        case 'readMeta': return core.readMeta(a[0]);
        case 'writeMeta': return core.writeMeta(args[0] as WorldMetadata);
        case 'create': return core.create(args[0] as WorldMetadata);
        case 'delete': return core.deleteWorld(a[0]);
        case 'rename': return core.rename(a[0], a[1] as string);
        case 'readChunk': return core.readChunk(a[0], a[1] as number, a[2] as number);
        case 'writeChunks': return core.writeChunks(a[0], a[1] as ChunkBatchEntry[]);
        case 'readChunksAll': return core.listAllChunks(a[0]);
        case 'open': return core.open(a[0]);
        case 'close': return core.close(a[0]);
        case 'exists': return core.exists(a[0]);
        default: throw new Error(`Unknown save op: ${op}`);
    }
}
