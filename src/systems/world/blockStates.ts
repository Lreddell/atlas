export type BlockStateValue = string | number | boolean;
export type BlockState = Readonly<Record<string, BlockStateValue>>;

export interface BlockStateCodec<T extends BlockState> {
    encode(state: T): number;
    decode(metadata: number): T;
}

/** Existing metadata-compatible codecs for common Atlas shaped blocks. */
export const stairStateCodec: BlockStateCodec<{
    facing: number;
    upsideDown: boolean;
    shape: number;
}> = {
    encode: ({ facing, upsideDown, shape }) =>
        (facing & 3) | (upsideDown ? 4 : 0) | ((shape & 7) << 3),
    decode: (metadata) => ({
        facing: metadata & 3,
        upsideDown: (metadata & 4) !== 0,
        shape: (metadata >> 3) & 7,
    }),
};

export const fluidStateCodec: BlockStateCodec<{ level: number; falling: boolean }> = {
    encode: ({ level, falling }) => falling ? 8 : Math.max(0, Math.min(7, level | 0)),
    decode: (metadata) => ({ level: metadata === 8 ? 0 : metadata & 7, falling: metadata === 8 }),
};
