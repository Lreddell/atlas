package dev.atlas;

import net.minecraft.block.*;
import net.minecraft.block.enums.RailShape;
import net.minecraft.util.math.*;
import net.minecraft.world.StructureWorldAccess;
import net.minecraft.world.chunk.Chunk;

/** Sparse vegetation, ferric soil and abandoned transit remnants outside the source arena. */
public final class MeridianTerrain {
  public static void decorate(StructureWorldAccess w, Chunk chunk) {
    int sx = chunk.getPos().getStartX(), sz = chunk.getPos().getStartZ();
    for (int x = sx; x < sx + 16; x++)
      for (int z = sz; z < sz + 16; z++) {
        var biome = MeridianBiomes.at(x, z, w.getSeed());
        if (biome == null || biome == Worldgen.FIELDS) continue;
        var col = FieldMath.column(x, z, w.getSeed());
        int y = Worldgen.surface(w, x, z, w.getSeed());
        var ground = chunk.getBlockState(new BlockPos(x, y, z));
        // Preserve natural wall magnets and source decorations; enrich only bare ground.
        if (!ground.isOf(Content.block("magnetite_block"))) continue;
        double patch = FieldMath.noise(w.getSeed()).sample(x * .11, z * .11);
        double r = FieldMath.hash(x, 214, z, (int) w.getSeed());
        if (biome == MeridianBiomes.VERGE && patch > -.15) {
          Worldgen.set(
              chunk,
              x,
              y,
              z,
              (patch > .28 ? Blocks.MOSS_BLOCK : Blocks.COARSE_DIRT).getDefaultState());
          var above = new BlockPos(x, y + 1, z);
          if (chunk.getBlockState(above).isAir() && r < .14) {
            var plant =
                patch > .28
                    ? (r < .012
                        ? Content.block("ferric_reed")
                        : r < .025 ? Blocks.AZURE_BLUET : Blocks.SHORT_GRASS)
                    : r < .025 ? Blocks.DEAD_BUSH : null;
            if (plant != null) Worldgen.set(chunk, x, y + 1, z, plant.getDefaultState());
          }
        } else if (biome == MeridianBiomes.BARRENS && patch > .1) {
          Worldgen.set(
              chunk,
              x,
              y,
              z,
              (patch > .4 && r < .015 ? Blocks.RAW_IRON_BLOCK : Blocks.TUFF).getDefaultState());
        } else if (biome == MeridianBiomes.RAILGRAVE) {
          int dx = x - col.center().x(), dz = z - col.center().z();
          boolean eastWest = Math.abs(dz) <= 1, northSouth = Math.abs(dx) <= 1;
          if (eastWest || northSouth) {
            Worldgen.set(
                chunk,
                x,
                y,
                z,
                (r < .16 ? Blocks.CUT_COPPER : Blocks.DEEPSLATE_TILES).getDefaultState());
            if (r > .2
                && (dz == 0 || dx == 0)
                && chunk.getBlockState(new BlockPos(x, y + 1, z)).isAir())
              Worldgen.set(
                  chunk,
                  x,
                  y + 1,
                  z,
                  Blocks.RAIL
                      .getDefaultState()
                      .with(
                          RailBlock.SHAPE, eastWest ? RailShape.EAST_WEST : RailShape.NORTH_SOUTH));
          }
          if (r < .006 && Math.abs(dz) > 5 && Math.abs(dx) > 5) {
            for (int h = 1; h <= 4; h++)
              Worldgen.set(chunk, x, y + h, z, Blocks.WAXED_OXIDIZED_CUT_COPPER.getDefaultState());
            Worldgen.set(chunk, x, y + 5, z, Blocks.IRON_BARS.getDefaultState());
          }
        }
      }
  }
}
