import { BlockType, type ItemStack } from '../../types';

export interface BlockPosition { x: number; y: number; z: number }

export interface BlockBehaviorContext {
    getBlock(x: number, y: number, z: number): BlockType;
    setBlock(x: number, y: number, z: number, type: BlockType, metadata?: number): ItemStack[];
    getMetadata(x: number, y: number, z: number): number;
    scheduleTick(x: number, y: number, z: number, type: BlockType, delay: number): void;
}

export interface BlockBehavior {
    onPlaced?(ctx: BlockBehaviorContext, pos: BlockPosition): void;
    onRemoved?(ctx: BlockBehaviorContext, pos: BlockPosition, replacement: BlockType): void;
    onNeighborChanged?(ctx: BlockBehaviorContext, pos: BlockPosition, neighbor: BlockPosition): void;
    scheduledTick?(ctx: BlockBehaviorContext, pos: BlockPosition): void;
    randomTick?(ctx: BlockBehaviorContext, pos: BlockPosition): void;
}

class BlockBehaviorRegistry {
    private values = new Map<BlockType, BlockBehavior>();

    register(type: BlockType, behavior: BlockBehavior): void { this.values.set(type, behavior); }
    get(type: BlockType): BlockBehavior | undefined { return this.values.get(type); }
    hasRandomTick(type: BlockType): boolean { return !!this.values.get(type)?.randomTick; }
}

export const blockBehaviors = new BlockBehaviorRegistry();

const fallingBehavior: BlockBehavior = {
    onPlaced: (ctx, pos) => ctx.scheduleTick(pos.x, pos.y, pos.z, ctx.getBlock(pos.x, pos.y, pos.z), 2),
    onNeighborChanged: (ctx, pos, neighbor) => {
        if (neighbor.x === pos.x && neighbor.y === pos.y - 1 && neighbor.z === pos.z) {
            ctx.scheduleTick(pos.x, pos.y, pos.z, ctx.getBlock(pos.x, pos.y, pos.z), 2);
        }
    },
    scheduledTick: (ctx, pos) => {
        const type = ctx.getBlock(pos.x, pos.y, pos.z);
        if (type !== BlockType.SAND && type !== BlockType.RED_SAND) return;
        let targetY = pos.y;
        while (targetY > -63) {
            const below = ctx.getBlock(pos.x, targetY - 1, pos.z);
            if (below !== BlockType.AIR && below !== BlockType.WATER && below !== BlockType.LAVA) break;
            targetY--;
        }
        if (targetY === pos.y) return;
        const metadata = ctx.getMetadata(pos.x, pos.y, pos.z);
        ctx.setBlock(pos.x, pos.y, pos.z, BlockType.AIR);
        ctx.setBlock(pos.x, targetY, pos.z, type, metadata);
    },
};

blockBehaviors.register(BlockType.SAND, fallingBehavior);
blockBehaviors.register(BlockType.RED_SAND, fallingBehavior);
