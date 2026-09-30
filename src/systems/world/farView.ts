// Where far terrain draws (farTerrain.ts): around the chunk the streaming is
// centred on, past the full-detail chunks, out to the render distance. App sets
// it with the chunk list (applyChunkCenter), so far terrain and full chunks
// always agree on where one stops and the other starts.

export interface FarViewState {
    /** The chunk the streaming is centred on. */
    cx: number;
    cz: number;
    /** Full-detail radius, in chunks: far terrain stands aside within it. */
    fullDetail: number;
    /** Render distance, in chunks: far terrain reaches this far. */
    renderDistance: number;
}

let current: FarViewState | null = null;
const listeners = new Set<() => void>();

export const farView = {
    get(): FarViewState | null {
        return current;
    },
    set(next: FarViewState | null): void {
        if (next === current) return;
        if (next && current && next.cx === current.cx && next.cz === current.cz
            && next.fullDetail === current.fullDetail && next.renderDistance === current.renderDistance) return;
        current = next;
        for (const listener of listeners) listener();
    },
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};
