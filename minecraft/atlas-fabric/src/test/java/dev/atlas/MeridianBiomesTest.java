package dev.atlas;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;

class MeridianBiomesTest {
  @Test
  void arenaAndFoundryRemainInsideEverySeededRegion() {
    for (long seed : new long[] {0, 1, 42, -1943, Integer.MAX_VALUE}) {
      var c = FieldMath.nearest(0, 0, seed);
      assertEquals(Worldgen.FIELDS, MeridianBiomes.at(c.x(), c.z(), seed));
      var site = MeridianFoundry.site(c, seed);
      assertNotNull(FieldMath.column(site.origin().getX(), site.origin().getZ(), seed));
      assertEquals(c.x() + 192, site.origin().getX());
      assertTrue(site.origin().getY() > 64);
      var kinds = new HashSet<>();
      for (int dx = -480; dx <= 480; dx += 16)
        for (int dz = -480; dz <= 480; dz += 16)
          kinds.add(MeridianBiomes.at(c.x() + dx, c.z() + dz, seed));
      assertTrue(
          kinds.containsAll(
              List.of(
                  Worldgen.FIELDS,
                  MeridianBiomes.VERGE,
                  MeridianBiomes.BARRENS,
                  MeridianBiomes.RAILGRAVE)));
      assertNull(MeridianBiomes.at(c.x() + 600, c.z(), seed));
    }
  }
}
