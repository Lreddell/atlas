const DB_NAME = 'atlas-web-storage';
const DB_VERSION = 1;
const STORE_NAME = 'panoramas';

interface WebPanoramaRecord {
    id: string;
    blob: Blob;
    updatedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Failed to open panorama blob database.'));
    });
}

async function withStore<T>(mode: IDBTransactionMode, handler: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDatabase();

    return new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = handler(store);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'));
        tx.oncomplete = () => db.close();
        tx.onabort = () => db.close();
    });
}

export async function saveWebPanoramaBlob(id: string, blob: Blob): Promise<void> {
    await withStore('readwrite', (store) => store.put({ id, blob, updatedAt: Date.now() } as WebPanoramaRecord));
}

export async function readWebPanoramaBlob(id: string): Promise<Blob | null> {
    const record = await withStore<WebPanoramaRecord | undefined>('readonly', (store) => store.get(id));
    return record?.blob ?? null;
}

export async function deleteWebPanoramaBlob(id: string): Promise<void> {
    await withStore('readwrite', (store) => store.delete(id));
}
