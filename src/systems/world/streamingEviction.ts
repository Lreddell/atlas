export interface EvictionCandidate {
  key: string;
  cx: number;
  cz: number;
  distSq: number;
  attempts?: number;
}

export class EvictionQueue {
  private heap: EvictionCandidate[] = [];
  private indexByKey = new Map<string, number>();

  get size(): number {
    return this.heap.length;
  }

  has(key: string): boolean {
    return this.indexByKey.has(key);
  }

  clear(): void {
    this.heap.length = 0;
    this.indexByKey.clear();
  }

  upsert(candidate: EvictionCandidate): void {
    const existingIndex = this.indexByKey.get(candidate.key);
    if (existingIndex === undefined) {
      const index = this.heap.length;
      this.heap.push({ ...candidate });
      this.indexByKey.set(candidate.key, index);
      this.bubbleUp(index);
      return;
    }

    const previous = this.heap[existingIndex];
    this.heap[existingIndex] = { ...previous, ...candidate };
    if (this.heap[existingIndex].distSq > previous.distSq) this.bubbleUp(existingIndex);
    else this.bubbleDown(existingIndex);
  }

  remove(key: string): boolean {
    const index = this.indexByKey.get(key);
    if (index === undefined) return false;

    const lastIndex = this.heap.length - 1;
    this.swap(index, lastIndex);
    this.heap.pop();
    this.indexByKey.delete(key);

    if (index < this.heap.length) {
      this.bubbleUp(index);
      this.bubbleDown(index);
    }
    return true;
  }

  pop(): EvictionCandidate | undefined {
    if (this.heap.length === 0) return undefined;
    const result = this.heap[0];
    this.remove(result.key);
    return result;
  }

  private bubbleUp(startIndex: number): void {
    let index = startIndex;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent].distSq >= this.heap[index].distSq) break;
      this.swap(parent, index);
      index = parent;
    }
  }

  private bubbleDown(startIndex: number): void {
    let index = startIndex;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let largest = index;

      if (left < this.heap.length && this.heap[left].distSq > this.heap[largest].distSq) largest = left;
      if (right < this.heap.length && this.heap[right].distSq > this.heap[largest].distSq) largest = right;
      if (largest === index) return;

      this.swap(index, largest);
      index = largest;
    }
  }

  private swap(a: number, b: number): void {
    if (a === b) return;
    const temp = this.heap[a];
    this.heap[a] = this.heap[b];
    this.heap[b] = temp;
    this.indexByKey.set(this.heap[a].key, a);
    this.indexByKey.set(this.heap[b].key, b);
  }
}
