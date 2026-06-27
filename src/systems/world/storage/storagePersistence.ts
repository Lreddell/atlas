// Browser storage durability helpers. OPFS + IndexedDB share one per-origin quota
// and one persistence mode; requesting "persistent" stops the browser from
// auto-evicting worlds under storage pressure. (It does NOT survive the user
// clearing site data — that's what the export-to-disk path is for.)

/** Ask the browser to make this origin's storage persistent. Best-effort + idempotent. */
export async function requestPersistentStorage(): Promise<boolean> {
    try {
        if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
        if (navigator.storage.persisted && (await navigator.storage.persisted())) return true;
        const granted = await navigator.storage.persist();
        console.log(`[Storage] Persistent storage ${granted ? 'granted' : 'not granted'}.`);
        return granted;
    } catch {
        return false;
    }
}

export interface StorageEstimate { usage: number; quota: number }

export async function getStorageEstimate(): Promise<StorageEstimate | null> {
    try {
        if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
        const e = await navigator.storage.estimate();
        return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
    } catch {
        return null;
    }
}

export function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return '0 MB';
    const mb = n / (1024 * 1024);
    if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
}
