package dev.atlas;

import com.mojang.serialization.MapCodec;
import net.minecraft.block.*;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.util.shape.*;
import net.minecraft.world.*;

/** Iron-bearing pioneer flora: cultivate with bone meal, smelt a frond to feed a mite. */
public final class FerricReedBlock extends PlantBlock implements Fertilizable {
  public static final MapCodec<FerricReedBlock> CODEC = createCodec(FerricReedBlock::new);

  public FerricReedBlock(Settings settings) {
    super(settings);
  }

  @Override
  protected MapCodec<? extends PlantBlock> getCodec() {
    return CODEC;
  }

  @Override
  protected boolean canPlantOnTop(BlockState state, BlockView w, BlockPos p) {
    return state.isOf(Content.block("magnetite_block"))
        || state.isOf(Content.block("charged_magnetite"))
        || state.isOf(Blocks.MOSS_BLOCK)
        || state.isOf(Blocks.COARSE_DIRT)
        || state.isOf(Blocks.DIRT)
        || state.isOf(Blocks.GRASS_BLOCK);
  }

  @Override
  protected VoxelShape getOutlineShape(BlockState s, BlockView w, BlockPos p, ShapeContext c) {
    return Block.createCuboidShape(3, 0, 3, 13, 15, 13);
  }

  @Override
  public boolean isFertilizable(WorldView w, BlockPos p, BlockState s) {
    for (int dx = -1; dx <= 1; dx++)
      for (int dz = -1; dz <= 1; dz++) {
        var q = p.add(dx, 0, dz);
        if (w.getBlockState(q).isAir() && canPlaceAt(s, w, q)) return true;
      }
    return false;
  }

  @Override
  public boolean canGrow(World w, Random r, BlockPos p, BlockState s) {
    return true;
  }

  @Override
  public void grow(ServerWorld w, Random r, BlockPos p, BlockState s) {
    int planted = 0, offset = r.nextInt(8);
    int[][] ring = {{-1, -1}, {0, -1}, {1, -1}, {1, 0}, {1, 1}, {0, 1}, {-1, 1}, {-1, 0}};
    for (int i = 0; i < 8 && planted < 2; i++) {
      int[] d = ring[(i + offset) % 8];
      var q = p.add(d[0], 0, d[1]);
      if (w.getBlockState(q).isAir() && canPlaceAt(s, w, q)) {
        w.setBlockState(q, getDefaultState());
        planted++;
      }
    }
  }
}
