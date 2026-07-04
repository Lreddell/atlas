import type { ItemStack } from '../../types';

export interface TradeOffer { id: string; cost: ItemStack[]; result: ItemStack; maxUses: number; uses: number }

export function executeTrade(offer: TradeOffer, inventory: ItemStack[]): { success: boolean; result?: ItemStack } {
    if (offer.uses >= offer.maxUses) return { success: false };
    for (const cost of offer.cost) {
        const available = inventory.filter((stack) => stack.type === cost.type).reduce((sum, stack) => sum + stack.count, 0);
        if (available < cost.count) return { success: false };
    }
    for (const cost of offer.cost) {
        let remaining = cost.count;
        for (const stack of inventory) {
            if (stack.type !== cost.type || remaining <= 0) continue;
            const taken = Math.min(stack.count, remaining);
            stack.count -= taken; remaining -= taken;
        }
    }
    offer.uses++;
    return { success: true, result: structuredClone(offer.result) };
}
