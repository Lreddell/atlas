// Dedicated SaveWorker: owns the Origin Private File System and runs all OPFS
// region IO (createSyncAccessHandle is Web-Worker-only). The renderer's
// OpfsBackend talks to it over a tiny request/response protocol. Spawned by Vite
// via new Worker(new URL('./saveWorker.ts', import.meta.url), { type: 'module' }).

import { OpfsSavesCore } from './OpfsSavesCore';
import { handleSaveRequest } from './saveWorkerRouter';
import { streamCompressor, streamCompressorAvailable } from '../acr/streamCompressor';
import type { OpfsDirHandle } from './opfsTypes';

const ctx = self as unknown as {
    onmessage: ((e: MessageEvent) => void) | null;
    postMessage: (msg: unknown) => void;
};

let corePromise: Promise<OpfsSavesCore> | null = null;
function getCore(): Promise<OpfsSavesCore> {
    if (!corePromise) {
        corePromise = (async () => {
            const root = await (navigator as unknown as { storage: { getDirectory(): Promise<OpfsDirHandle> } }).storage.getDirectory();
            const worldsRoot = await root.getDirectoryHandle('atlas-worlds', { create: true });
            return new OpfsSavesCore(worldsRoot, streamCompressorAvailable() ? streamCompressor : null);
        })();
    }
    return corePromise;
}

ctx.onmessage = async (e: MessageEvent) => {
    const { id, op, args } = (e.data || {}) as { id: number; op: string; args: unknown[] };
    try {
        const core = await getCore();
        const result = await handleSaveRequest(core, op, args || []);
        ctx.postMessage({ id, ok: true, result });
    } catch (err) {
        const e2 = err as Error & { code?: string };
        ctx.postMessage({ id, ok: false, error: String(e2?.message || e2), code: e2?.code });
    }
};
