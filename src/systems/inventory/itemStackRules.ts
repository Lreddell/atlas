export interface StackInstanceData {
    durability?: number;
    maxDurability?: number;
    stats?: object;
    tags?: string[];
}

export interface StackLike {
    type: number;
    count: number;
    instance?: StackInstanceData;
}

const stableInstanceJson = (instance: StackInstanceData | undefined): string =>
    JSON.stringify(instance ?? null);

export const getStackLimitForCapabilities = (durable: boolean, equippable: boolean): number =>
    durable || equippable ? 1 : 64;

export const canStackByPolicy = (
    a: StackLike,
    b: StackLike,
    stackLimit: number,
): boolean =>
    stackLimit > 1
    && a.type === b.type
    && stableInstanceJson(a.instance) === stableInstanceJson(b.instance);

export const cloneStack = <T extends StackLike>(stack: T, count = stack.count): T => ({
    ...stack,
    count,
    ...(stack.instance ? { instance: structuredClone(stack.instance) } : {}),
});
