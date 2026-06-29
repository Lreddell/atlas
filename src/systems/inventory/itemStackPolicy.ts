import type { BlockType, ItemStack } from '../../types';
import { slotForItem } from '../registry/equipment';
import { getMaxDurability } from '../registry/itemStats';
import {
    canStackByPolicy,
    cloneStack,
    getStackLimitForCapabilities,
} from './itemStackRules';

export const getItemStackLimit = (type: BlockType): number =>
    getStackLimitForCapabilities(
        getMaxDurability(type) !== undefined,
        slotForItem(type) !== undefined,
    );

export const canStacksMerge = (a: ItemStack, b: ItemStack): boolean =>
    canStackByPolicy(a, b, getItemStackLimit(a.type));

export const cloneItemStack = (stack: ItemStack, count = stack.count): ItemStack =>
    cloneStack(stack, count);
