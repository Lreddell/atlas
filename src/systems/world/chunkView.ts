// The chunk columns the scene draws around the player. App sets the list as the
// player crosses into a new chunk; ChunkField (ChunkMesh.tsx) draws it. Kept
// outside React state so that a crossing updates the chunk field alone: held
// in App, it re-rendered all of App and handed the scene a new chunk list as an
// urgent update, diffing every chunk at once, the hitch on each border crossing.

export interface ChunkColumn {
    cx: number;
    cz: number;
}

let current: readonly ChunkColumn[] = [];
const listeners = new Set<() => void>();

export const chunkView = {
    get(): readonly ChunkColumn[] {
        return current;
    },
    set(next: readonly ChunkColumn[]): void {
        if (next === current) return;
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
