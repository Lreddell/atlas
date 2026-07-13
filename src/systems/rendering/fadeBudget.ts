export type FadeBudgetState = 'active' | 'queued';

export class FadeBudget<T> {
  readonly active = new Set<T>();
  private readonly pending: T[] = [];
  readonly maxActive: number;

  constructor(maxActive: number) {
    if (!Number.isInteger(maxActive) || maxActive < 1) {
      throw new RangeError(`maxActive must be a positive integer: ${maxActive}`);
    }
    this.maxActive = maxActive;
  }

  request(item: T): FadeBudgetState {
    if (this.active.has(item)) return 'active';
    if (this.pending.includes(item)) return 'queued';
    if (this.active.size < this.maxActive) {
      this.active.add(item);
      return 'active';
    }
    this.pending.push(item);
    return 'queued';
  }

  cancel(item: T): T[] {
    const wasActive = this.active.delete(item);
    const pendingIndex = this.pending.indexOf(item);
    if (pendingIndex >= 0) this.pending.splice(pendingIndex, 1);
    return wasActive ? this.promote() : [];
  }

  complete(item: T): T[] {
    return this.cancel(item);
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  private promote(): T[] {
    const activated: T[] = [];
    while (this.active.size < this.maxActive && this.pending.length > 0) {
      const next = this.pending.shift();
      if (next === undefined || this.active.has(next)) continue;
      this.active.add(next);
      activated.push(next);
    }
    return activated;
  }
}
