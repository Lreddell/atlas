export type ScheduledTickKind = 'fluid' | 'block';

export interface ScheduledTickRecord {
    x: number;
    y: number;
    z: number;
    kind: ScheduledTickKind;
    blockType: number;
    dueTick: number;
    order: number;
}

const keyOf = (tick: Pick<ScheduledTickRecord, 'x' | 'y' | 'z' | 'kind'>) =>
    `${tick.kind}:${tick.x},${tick.y},${tick.z}`;

const comesBefore = (a: ScheduledTickRecord, b: ScheduledTickRecord) =>
    a.dueTick < b.dueTick || (a.dueTick === b.dueTick && a.order < b.order);

/** Stable min-heap with one pending update per position and tick kind. */
export class ScheduledTickQueue {
    private heap: ScheduledTickRecord[] = [];
    private byKey = new Map<string, ScheduledTickRecord>();
    private nextOrder = 1;

    get size(): number { return this.byKey.size; }

    clear(): void {
        this.heap = [];
        this.byKey.clear();
        this.nextOrder = 1;
    }

    schedule(record: Omit<ScheduledTickRecord, 'order'>): void {
        const key = keyOf(record);
        const existing = this.byKey.get(key);
        if (existing && existing.dueTick <= record.dueTick && existing.blockType === record.blockType) return;
        if (existing) this.byKey.delete(key); // stale heap entry is ignored when popped
        const queued: ScheduledTickRecord = { ...record, order: this.nextOrder++ };
        this.byKey.set(key, queued);
        this.push(queued);
    }

    cancelAt(x: number, y: number, z: number, kind?: ScheduledTickKind): void {
        if (kind) this.byKey.delete(keyOf({ x, y, z, kind }));
        else {
            this.byKey.delete(keyOf({ x, y, z, kind: 'fluid' }));
            this.byKey.delete(keyOf({ x, y, z, kind: 'block' }));
        }
    }

    popDue(worldTick: number, limit: number): ScheduledTickRecord[] {
        const out: ScheduledTickRecord[] = [];
        while (out.length < limit && this.heap.length > 0) {
            const first = this.heap[0];
            if (first.dueTick > worldTick) break;
            const tick = this.pop()!;
            const key = keyOf(tick);
            if (this.byKey.get(key) !== tick) continue;
            this.byKey.delete(key);
            out.push(tick);
        }
        return out;
    }

    serialize(): ScheduledTickRecord[] {
        return Array.from(this.byKey.values())
            .sort((a, b) => a.dueTick - b.dueTick || a.order - b.order)
            .map((tick) => ({ ...tick }));
    }

    restore(records: readonly ScheduledTickRecord[] | undefined): void {
        this.clear();
        if (!records) return;
        for (const record of records) {
            if (!Number.isFinite(record.dueTick) || !Number.isFinite(record.x)
                || !Number.isFinite(record.y) || !Number.isFinite(record.z)) continue;
            const restored = { ...record, order: Math.max(1, record.order | 0) };
            const key = keyOf(restored);
            const existing = this.byKey.get(key);
            if (existing && !comesBefore(restored, existing)) continue;
            this.byKey.set(key, restored);
            this.push(restored);
            this.nextOrder = Math.max(this.nextOrder, restored.order + 1);
        }
    }

    private push(tick: ScheduledTickRecord): void {
        let index = this.heap.length;
        this.heap.push(tick);
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (!comesBefore(tick, this.heap[parent])) break;
            this.heap[index] = this.heap[parent];
            index = parent;
        }
        this.heap[index] = tick;
    }

    private pop(): ScheduledTickRecord | undefined {
        if (this.heap.length === 0) return undefined;
        const root = this.heap[0];
        const last = this.heap.pop()!;
        if (this.heap.length === 0) return root;
        let index = 0;
        while (true) {
            const left = index * 2 + 1;
            if (left >= this.heap.length) break;
            const right = left + 1;
            const child = right < this.heap.length && comesBefore(this.heap[right], this.heap[left]) ? right : left;
            if (!comesBefore(this.heap[child], last)) break;
            this.heap[index] = this.heap[child];
            index = child;
        }
        this.heap[index] = last;
        return root;
    }
}
