// Where the horizon draws (horizon/): around the chunk the streaming is centred
// on, past the full chunks, out to the Horizon Distance. App sets it with the
// chunk list (applyChunkCenter), so the horizon and the full chunks always
// agree on where one stops and the other starts.

export interface HorizonViewState {
    /** The chunk the streaming is centred on. */
    cx: number;
    cz: number;
    /** The render distance: how far the full chunks reach, in chunks. */
    renderDistance: number;
    /** How far the horizon reaches, in chunks (at or inside the render distance: none). */
    horizon: number;
    /** How much detail it keeps with distance (horizonTiles.ts levelRanges). */
    quality: number;
}

/** The horizon's numbers (HorizonTerrain keeps them), for the F3 screen. */
export const horizonStats = { tiles: 0, wanted: 0, building: 0, sectors: 0, bytes: 0, usedBytes: 0, reveal: 0, waiting: true };

let current: HorizonViewState | null = null;
const listeners = new Set<() => void>();

export const horizonView = {
    get(): HorizonViewState | null {
        return current;
    },
    set(next: HorizonViewState | null): void {
        if (next === current) return;
        if (next && current && next.cx === current.cx && next.cz === current.cz && next.renderDistance === current.renderDistance
            && next.horizon === current.horizon && next.quality === current.quality) return;
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
