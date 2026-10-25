package dev.atlas;

import net.minecraft.registry.*;
import net.minecraft.world.biome.Biome;

/** Native regional adaptation outside the exact Atlas arena and terrace heights. */
public final class MeridianBiomes {
  public static final RegistryKey<Biome> VERGE = key("ironwind_verge"),
      BARRENS = key("compass_barrens"),
      RAILGRAVE = key("railgrave");

  private static RegistryKey<Biome> key(String id) {
    return RegistryKey.of(RegistryKeys.BIOME, Atlas.id(id));
  }

  public static RegistryKey<Biome> at(int x, int z, long seed) {
    var c = FieldMath.column(x, z, seed);
    if (c == null) return null;
    int dx = x - c.center().x(), dz = z - c.center().z();
    if (Math.max(Math.abs(dx), Math.abs(dz)) <= 80 || Math.hypot(dx, dz) <= 100)
      return Worldgen.FIELDS;
    if (c.tier() <= 1) return VERGE;
    if (Math.abs(dz) < 23 || Math.abs(dx) < 18) return RAILGRAVE;
    return BARRENS;
  }

  public static boolean regional(String id) {
    return id.equals("magnetic_fields")
        || id.equals("ironwind_verge")
        || id.equals("compass_barrens")
        || id.equals("railgrave");
  }
}
