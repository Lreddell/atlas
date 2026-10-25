package dev.atlas;

import net.minecraft.block.Blocks;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.*;

/** One field law for boots, loose metal and machinery. All queries have a five-block radius. */
public final class MagneticPhysics {
  public record Sample(Vec3d force, boolean oppositeSurface, boolean attracting) {}

  public static double strength(double distance, double step) {
    if (distance < .1 || distance > 5) return 0;
    return 70 / Math.pow(Math.max(.75, distance), 2) * Math.min(1, 5 - distance) * step;
  }

  public static double cone(double dot) {
    double edge = Math.cos(Math.PI / 6);
    if (dot <= edge) return .01;
    double t = Math.clamp((dot - edge) / (1 - edge), 0, 1);
    return .01 + 3.99 * t * t * (3 - 2 * t);
  }

  public static Sample sample(
      ServerWorld w,
      Vec3d origin,
      int response,
      double step,
      double cap,
      boolean grace,
      boolean ironArmor) {
    Vec3d force = Vec3d.ZERO;
    boolean opposite = false, attracting = false;
    for (var pos : BlockPos.iterateOutwards(BlockPos.ofFloored(origin), 5, 5, 5)) {
      if (!w.isChunkLoaded(pos)) continue;
      int magnet = PlayerMechanics.magnet(w.getBlockState(pos));
      if (magnet == 0) continue;
      Vec3d d = Vec3d.ofCenter(pos).subtract(origin);
      double distance = d.length(), amount = strength(distance, step);
      if (amount == 0) continue;
      boolean release = grace && distance < 1.65;
      double relation = release ? 1 : ironArmor ? -magnet : -magnet * response;
      if (!ironArmor && relation > 0) attracting = true;
      Vec3d axis = Vec3d.ZERO;
      for (var dir : Direction.values())
        if (w.getBlockState(pos.offset(dir)).isOf(Blocks.IRON_BLOCK))
          axis = axis.add(Vec3d.of(dir.getOpposite().getVector()));
      double gain =
          axis.lengthSquared() < .00001
              ? 1
              : cone(axis.normalize().dotProduct(d.normalize().negate()));
      force = force.add(d.normalize().multiply(relation * amount * gain));
      if ((response == -magnet || release) && distance < 1.65) opposite = true;
    }
    if (force.length() > cap) force = force.normalize().multiply(cap);
    return new Sample(force, opposite, attracting);
  }
}
