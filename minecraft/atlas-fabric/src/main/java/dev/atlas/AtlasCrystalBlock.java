package dev.atlas;

import net.minecraft.block.*;
import net.minecraft.entity.Entity;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.shape.VoxelShape;
import net.minecraft.world.BlockView;
import net.minecraft.world.World;

public final class AtlasCrystalBlock extends Block {
  private final String kind;

  public AtlasCrystalBlock(String kind, Settings settings) {
    super(settings);
    this.kind = kind;
  }

  @Override
  protected VoxelShape getOutlineShape(
      BlockState s, BlockView world, BlockPos pos, ShapeContext ctx) {
    return Block.createCuboidShape(3, 0, 3, 13, 14, 13);
  }

  @Override
  protected VoxelShape getCollisionShape(
      BlockState s, BlockView world, BlockPos pos, ShapeContext ctx) {
    return net.minecraft.util.shape.VoxelShapes.empty();
  }

  @Override
  protected void onEntityCollision(BlockState s, World w, BlockPos p, Entity e) {
    if (!w.isClient && kind.endsWith("spike") || !w.isClient && kind.endsWith("spikes")) {
      e.damage(w.getDamageSources().cactus(), 2);
    }
  }
}
