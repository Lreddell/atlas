import type { ItemStack } from '../../types';
import { cloneItemStack, canStacksMerge, getItemStackLimit } from './itemStackPolicy';

const cloneStack = (stack: ItemStack | null | undefined): ItemStack | null => stack ? cloneItemStack(stack) : null;

export interface InventoryView { get(index: number): ItemStack | null; set(index: number, stack: ItemStack | null): void; size: number }

/** Atomic inventory mutation: changes are staged and committed together. */
export class InventoryTransaction {
    private staged = new Map<number, ItemStack | null>();
    private committed = false;

    constructor(private readonly view: InventoryView) {}

    get(index: number): ItemStack | null {
        this.assertIndex(index);
        return cloneStack(this.staged.has(index) ? this.staged.get(index) ?? null : this.view.get(index));
    }
    set(index: number, stack: ItemStack | null): void {
        this.assertIndex(index);
        if (stack && (stack.count <= 0 || stack.count > getItemStackLimit(stack.type))) throw new Error('Invalid stack count');
        this.staged.set(index, cloneStack(stack));
    }
    move(from: number, to: number, amount = Infinity): boolean {
        const source = this.get(from);
        const target = this.get(to);
        if (!source) return false;
        if (target && !canStacksMerge(source, target)) return false;
        const limit = getItemStackLimit(source.type);
        const moved = Math.min(source.count, amount, limit - (target?.count ?? 0));
        if (moved <= 0) return false;
        this.set(from, source.count === moved ? null : { ...source, count: source.count - moved });
        this.set(to, target ? { ...target, count: target.count + moved } : { ...source, count: moved });
        return true;
    }
    commit(): void {
        if (this.committed) throw new Error('Transaction already committed');
        for (const [index, stack] of this.staged) this.view.set(index, cloneStack(stack));
        this.committed = true;
    }
    rollback(): void { this.staged.clear(); this.committed = true; }
    private assertIndex(index: number): void {
        if (!Number.isInteger(index) || index < 0 || index >= this.view.size) throw new RangeError(`Invalid slot ${index}`);
    }
}
