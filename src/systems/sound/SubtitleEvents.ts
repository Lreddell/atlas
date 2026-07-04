export interface SubtitleEvent { id: number; text: string; createdAt: number; x?: number; y?: number; z?: number }
type Listener = (event: SubtitleEvent) => void;

class SubtitleEvents {
    private listeners = new Set<Listener>();
    private nextId = 1;
    emit(text: string, position?: { x: number; y: number; z: number }): void {
        const event = { id: this.nextId++, text, createdAt: Date.now(), ...position };
        for (const listener of this.listeners) listener(event);
    }
    subscribe(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}

export const subtitleEvents = new SubtitleEvents();
