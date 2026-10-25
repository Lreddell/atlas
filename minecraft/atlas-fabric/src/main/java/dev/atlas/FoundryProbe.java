package dev.atlas;

import java.util.*;
import net.minecraft.block.*;
import net.minecraft.block.entity.HopperBlockEntity;
import net.minecraft.entity.*;
import net.minecraft.entity.vehicle.MinecartEntity;
import net.minecraft.item.*;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.*;

/** Opt-in dedicated-server proof using actual item ticks, hoppers, carts and saved milestones. */
final class FoundryProbe {
  private static MeridianFoundry.Site site;
  private static ServerWorld world;
  private static MinecartEntity cart;
  private static final Set<Long> unforce = new HashSet<>();
  private static int tick;
  private static boolean returned;
  static boolean done;

  static void start(ServerWorld w, FieldMath.Center field) {
    world = w;
    site = MeridianFoundry.site(field, w.getSeed());
    tick = 0;
    done = returned = false;
    var state = AtlasState.get(w);
    state.completed.removeIf(k -> k.startsWith(site.id() + ":"));
    state.puzzles.keySet().removeIf(k -> k.startsWith(site.id() + ":"));
    state.markDirty();
    for (int x = (site.origin().getX() - 32) >> 4; x <= (site.origin().getX() + 32) >> 4; x++)
      for (int z = (site.origin().getZ() - 12) >> 4; z <= (site.origin().getZ() + 48) >> 4; z++) {
        long id = ChunkPos.toLong(x, z);
        if (!w.getForcedChunks().contains(id)) {
          unforce.add(id);
          w.setChunkForced(x, z, true);
        }
        w.getChunk(x, z);
      }
    for (int x : new int[] {-23, -17}) {
      if (!(w.getBlockEntity(site.at(x, 0, 0)) instanceof HopperBlockEntity hopper))
        throw new IllegalStateException("Foundry hopper missing across generation seam");
      hopper.clear();
    }
    for (int x : new int[] {-24, -16}) {
      world.setBlockState(site.at(x, 1, 0), Blocks.AIR.getDefaultState());
      world.setBlockState(site.at(x, 0, 0), Content.block("induction_relay").getDefaultState());
    }
    power(-24, 0, -1);
    power(-16, 0, 1);
    drop(Items.IRON_INGOT, 4, -.12);
    drop(Content.item("negative_magnet"), 2, .12);
    for (var previous :
        w.getEntitiesByClass(MinecartEntity.class, new Box(site.origin()).expand(12), e -> true))
      previous.discard();
    cart = EntityType.MINECART.create(w);
    cart.refreshPositionAndAngles(Vec3d.of(site.at(-6, 1, 0)).add(.5, .1, .5), 0, 0);
    w.spawnEntity(cart);
    w.setBlockState(site.at(0, 1, -4), Blocks.POLISHED_DEEPSLATE.getDefaultState());
    power(-8, 0, 1);
    power(8, 0, 0);
    power(0, -3, 0);
  }

  static void cleanup() {
    if (cart != null && !cart.isRemoved()) cart.discard();
    if (world != null)
      for (long id : unforce) {
        var cp = new ChunkPos(id);
        world.setChunkForced(cp.x, cp.z, false);
      }
    unforce.clear();
  }

  private static void drop(Item item, int count, double dx) {
    var p = Vec3d.of(site.at(-20, 1, 0)).add(.5 + dx, .4, .5);
    world.spawnEntity(new ItemEntity(world, p.x, p.y, p.z, new ItemStack(item, count), 0, 0, 0));
  }

  private static void power(int x, int z, int sign) {
    var p = site.at(x, x == -24 || x == -16 ? 0 : 1, z);
    if (sign == 0) world.setBlockState(p.up(), Blocks.AIR.getDefaultState());
    else world.setBlockState(p.up(), Blocks.REDSTONE_BLOCK.getDefaultState());
    var state = world.getBlockState(p);
    if (!state.isOf(Content.block("induction_relay")))
      throw new IllegalStateException("Foundry relay missing " + p);
    world.setBlockState(
        p, state.with(AtlasBlock.ACTIVE, sign != 0).with(AtlasBlock.TONE, sign < 0 ? 1 : 0));
  }

  static void step() {
    if (done) return;
    tick++;
    MeridianFoundry.tick(world, site);
    double x = cart.getX() - site.origin().getX();
    if (!returned && x > 5) {
      returned = true;
      power(-8, 0, 0);
      power(8, 0, 1);
      power(0, -3, -1);
    }
    if (tick == 160 && !AtlasState.get(world).completed.contains(site.id() + ":sort"))
      throw new IllegalStateException(
          "Physical polarity sorting failed: left="
              + ((HopperBlockEntity) world.getBlockEntity(site.at(-23, 0, 0))).getStack(0)
              + " right="
              + ((HopperBlockEntity) world.getBlockEntity(site.at(-17, 0, 0))).getStack(0)
              + " drops="
              + world
                  .getEntitiesByClass(
                      ItemEntity.class, new Box(site.origin()).expand(32), e -> true)
                  .stream()
                  .map(e -> e.getStack() + "@" + e.getPos().subtract(Vec3d.of(site.origin())))
                  .toList());
    if (tick % 100 == 0)
      Atlas.LOGGER.info(
          "Foundry probe t={} cartX={} speed={} returned={} state={}",
          tick,
          x,
          cart.getVelocity().horizontalLength(),
          returned,
          AtlasState.get(world).completed);
    if (tick > 160 && AtlasState.get(world).completed.contains(site.id() + ":rail")) {
      world.setBlockState(
          site.at(21, 9, -2),
          Blocks.STONE_PRESSURE_PLATE.getDefaultState().with(PressurePlateBlock.POWERED, true));
      MeridianFoundry.tick(world, site);
      if (!AtlasState.get(world).completed.contains(site.id() + ":open")
          || !world.getBlockState(site.at(0, 2, -7)).isAir())
        throw new IllegalStateException("Foundry shared circuit gate failed");
      done = true;
      cleanup();
    }
    if (tick >= 800)
      throw new IllegalStateException("Physical magnetic carriage failed to settle: x=" + x);
  }
}
