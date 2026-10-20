package dev.atlas;

import com.mojang.serialization.MapCodec;
import net.minecraft.block.*;
import net.minecraft.entity.Entity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.state.StateManager;
import net.minecraft.state.property.*;
import net.minecraft.util.*;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.shape.*;
import net.minecraft.world.World;

public class AtlasBlock extends Block {
  public static final BooleanProperty ACTIVE = BooleanProperty.of("active");
  public static final IntProperty TONE = IntProperty.of("tone", 0, 3);
  private final String kind;

  public AtlasBlock(String kind, Settings settings) {
    super(settings);
    this.kind = kind;
    setDefaultState(stateManager.getDefaultState().with(ACTIVE, false).with(TONE, 0));
  }

  @Override
  protected MapCodec<? extends Block> getCodec() {
    return Block.CODEC;
  }

  @Override
  protected void appendProperties(StateManager.Builder<Block, BlockState> builder) {
    builder.add(ACTIVE, TONE);
  }

  @Override
  protected VoxelShape getCollisionShape(
      BlockState state, net.minecraft.world.BlockView world, BlockPos pos, ShapeContext context) {
    if (kind.equals("phase_block") && !state.get(ACTIVE) || kind.equals("magnetic_shield_crystal"))
      return VoxelShapes.empty();
    if (kind.equals("resonance_plate")) return Block.createCuboidShape(1, 0, 1, 15, 2, 15);
    return super.getCollisionShape(state, world, pos, context);
  }

  @Override
  protected VoxelShape getOutlineShape(
      BlockState state, net.minecraft.world.BlockView world, BlockPos pos, ShapeContext context) {
    if (kind.equals("magnetic_shield_crystal")) return Block.createCuboidShape(3, 0, 3, 13, 16, 13);
    if (kind.equals("resonance_plate")) return Block.createCuboidShape(1, 0, 1, 15, 2, 15);
    return super.getOutlineShape(state, world, pos, context);
  }

  @Override
  protected ActionResult onUse(
      BlockState state, World world, BlockPos pos, PlayerEntity player, BlockHitResult hit) {
    if (!world.isClient) Vaults.use((ServerWorld) world, pos, player, kind);
    return ActionResult.SUCCESS;
  }

  @Override
  protected ItemActionResult onUseWithItem(
      ItemStack stack,
      BlockState state,
      World world,
      BlockPos pos,
      PlayerEntity player,
      Hand hand,
      BlockHitResult hit) {
    if (!world.isClient) Vaults.use((ServerWorld) world, pos, player, kind);
    return ItemActionResult.SUCCESS;
  }

  @Override
  protected void onEntityCollision(BlockState state, World world, BlockPos pos, Entity entity) {
    if (!world.isClient
        && kind.equals("resonance_plate")
        && entity instanceof PlayerEntity p
        && world.getTime() % 10 == 0) Vaults.use((ServerWorld) world, pos, p, kind);
    super.onEntityCollision(state, world, pos, entity);
  }
}
