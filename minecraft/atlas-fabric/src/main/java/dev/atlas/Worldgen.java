package dev.atlas;

import com.google.gson.*;
import java.io.*;
import java.util.*;
import java.util.zip.GZIPInputStream;
import net.minecraft.block.*;
import net.minecraft.registry.*;
import net.minecraft.util.math.*;
import net.minecraft.world.*;
import net.minecraft.world.biome.Biome;
import net.minecraft.world.chunk.Chunk;

public final class Worldgen {
  public static final RegistryKey<Biome> FIELDS =
      RegistryKey.of(RegistryKeys.BIOME, Atlas.id("magnetic_fields"));
  public static final RegistryKey<Biome> VOLCANIC =
      RegistryKey.of(RegistryKeys.BIOME, Atlas.id("volcanic"));
  private static int[] arena;
  private static int arenaSpan, arenaMin, arenaMax, arenaHalf;

  public static void init() {
    try (var in =
        new DataInputStream(
            new GZIPInputStream(SourceData.stream("generation/magnetic-arena.bin.gz")))) {
      arenaSpan = in.readInt();
      arenaMin = in.readInt();
      arenaMax = in.readInt();
      arenaHalf = in.readInt();
      arena = new int[arenaSpan * arenaSpan * (arenaMax - arenaMin + 1)];
      for (int i = 0; i < arena.length; i++) arena[i] = in.readUnsignedShort();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  public static void generate(StructureWorldAccess world, Chunk chunk) {
    if (world.toServerWorld().getRegistryKey() != World.OVERWORLD) return;
    long seed = world.getSeed();
    int minX = chunk.getPos().getStartX(), minZ = chunk.getPos().getStartZ();
    var centers = FieldMath.touching(minX, minZ, minX + 15, minZ + 15, seed, 492);
    if (!centers.isEmpty())
      for (int x = minX; x < minX + 16; x++)
        for (int z = minZ; z < minZ + 16; z++) {
          var c = FieldMath.column(x, z, seed);
          if (c == null) continue;
          int nativeHeight =
              chunk.sampleHeightmap(Heightmap.Type.WORLD_SURFACE_WG, x & 15, z & 15) - 1;
          int h = height(x, z, seed, nativeHeight), floor = h;
          for (int[] off : new int[][] {{1, 0}, {-1, 0}, {0, 1}, {0, -1}})
            floor = Math.min(floor, height(x + off[0], z + off[1], seed, nativeHeight));
          int pol = h - floor >= 4 ? FieldMath.wallPolarity(x, z, seed) : 0;
          for (int y = world.getBottomY() + 1;
              y <= Math.max(h, Math.min(world.getTopY() - 1, nativeHeight + 32));
              y++)
            set(
                chunk,
                x,
                y,
                z,
                y > h
                    ? Blocks.AIR.getDefaultState()
                    : Content.block(
                            pol != 0 && y > floor
                                ? (pol > 0 ? "positive_magnet" : "negative_magnet")
                                : "magnetite_block")
                        .getDefaultState());
        }
    boolean[][] volcanic = new boolean[16][16];
    boolean anyVolcanic = false;
    for (int x = minX; x <= minX + 15; x++)
      for (int z = minZ; z <= minZ + 15; z++) {
        var biome = chunk.getBiomeForNoiseGen(x >> 2, 16, z >> 2);
        int h = chunk.sampleHeightmap(Heightmap.Type.WORLD_SURFACE_WG, x & 15, z & 15) - 1;
        if ((biome.matchesKey(net.minecraft.world.biome.BiomeKeys.STONY_PEAKS)
                || biome.matchesKey(net.minecraft.world.biome.BiomeKeys.WINDSWEPT_HILLS))
            && h > 85
            && FieldMath.noise(seed).sample((x + 1000) * .003, (z - 7000) * .003) > .38) {
          volcanic[x & 15][z & 15] = true;
          anyVolcanic = true;
          double heat = FieldMath.noise(seed).sample(x * .08, z * .08);
          for (int y = h - 3; y <= h; y++)
            set(
                chunk,
                x,
                y,
                z,
                (y == h && heat > .55
                        ? Blocks.LAVA
                        : y == h && heat > .28 ? Blocks.MAGMA_BLOCK : Blocks.BASALT)
                    .getDefaultState());
          if (heat < -.3 && FieldMath.hash(x, 3, z, (int) seed) < .025)
            for (int y = h + 1; y < h + 5; y++)
              set(chunk, x, y, z, Blocks.BASALT.getDefaultState());
        }
      }
    if (!centers.isEmpty()) {
      decorate(world, chunk, seed, minX, minZ);
      for (var c : centers)
        if (c.x() + 80 >= minX
            && c.x() - 80 <= minX + 15
            && c.z() + 80 >= minZ
            && c.z() - 80 <= minZ + 15)
          for (int x = Math.max(minX, c.x() - 80); x <= Math.min(minX + 15, c.x() + 80); x++)
            for (int z = Math.max(minZ, c.z() - 80); z <= Math.min(minZ + 15, c.z() + 80); z++)
              for (int y = arenaMin; y <= arenaMax; y++) {
                int v =
                    arena[
                        (((x - c.x() + arenaHalf) * arenaSpan + z - c.z() + arenaHalf)
                                * (arenaMax - arenaMin + 1))
                            + y
                            - arenaMin];
                if (v != 65535) set(chunk, x, FieldMath.FLOOR + y, z, Content.state(v));
              }
    }
    if (!centers.isEmpty() || anyVolcanic) {
      var fields = world.getRegistryManager().get(RegistryKeys.BIOME).entryOf(FIELDS);
      var verge = world.getRegistryManager().get(RegistryKeys.BIOME).entryOf(MeridianBiomes.VERGE);
      var barrens =
          world.getRegistryManager().get(RegistryKeys.BIOME).entryOf(MeridianBiomes.BARRENS);
      var railgrave =
          world.getRegistryManager().get(RegistryKeys.BIOME).entryOf(MeridianBiomes.RAILGRAVE);
      var volcano = world.getRegistryManager().get(RegistryKeys.BIOME).entryOf(VOLCANIC);
      for (int i = 0; i < chunk.getSectionArray().length; i++) {
        var section = chunk.getSection(i);
        var old = section.getBiomeContainer();
        int sy = world.sectionIndexToCoord(i) * 4;
        section.populateBiomes(
            (bx, by, bz, sampler) ->
                FieldMath.column(bx * 4, bz * 4, seed) != null
                    ? MeridianBiomes.at(bx * 4, bz * 4, seed) == MeridianBiomes.VERGE
                        ? verge
                        : MeridianBiomes.at(bx * 4, bz * 4, seed) == MeridianBiomes.BARRENS
                            ? barrens
                            : MeridianBiomes.at(bx * 4, bz * 4, seed) == MeridianBiomes.RAILGRAVE
                                ? railgrave
                                : fields
                    : volcanic[(bx * 4) & 15][(bz * 4) & 15]
                        ? volcano
                        : old.get(bx & 3, by & 3, bz & 3),
            null,
            minX >> 2,
            sy,
            minZ >> 2);
      }
    }
    MeridianTerrain.decorate(world, chunk);
    Vaults.generate(world, chunk);
    MeridianFoundry.generate(world, chunk);
  }

  private static int height(int x, int z, long seed, int ambient) {
    var c = FieldMath.column(x, z, seed);
    if (c == null) return ambient;
    if (c.tier() == 0 && c.edge() < 64) {
      double t = Math.clamp(c.edge() / 64, 0, 1);
      t = t * t * (3 - 2 * t);
      return (int)
          Math.floor(Math.max(ambient, 60) + (c.height() - Math.max(ambient, 60)) * t + .5);
    }
    return c.height();
  }

  static int surface(StructureWorldAccess world, int x, int z, long seed) {
    var known = FieldMath.column(x, z, seed);
    if (known != null && (known.tier() > 0 || known.edge() >= 64)) return known.height();
    int ambient =
        world
                .toServerWorld()
                .getChunkManager()
                .getChunkGenerator()
                .getHeight(
                    x,
                    z,
                    Heightmap.Type.WORLD_SURFACE_WG,
                    world,
                    world.toServerWorld().getChunkManager().getNoiseConfig())
            - 1;
    return height(x, z, seed, ambient);
  }

  private static boolean flat(StructureWorldAccess world, int x, int z, int y, long seed) {
    return Math.abs(surface(world, x + 1, z, seed) - y) <= 1
        && Math.abs(surface(world, x - 1, z, seed) - y) <= 1
        && Math.abs(surface(world, x, z + 1, seed) - y) <= 1
        && Math.abs(surface(world, x, z - 1, seed) - y) <= 1;
  }

  private static double rand(int x, int y, int z, int salt, long seed) {
    return FieldMath.hash(x, y + salt, z - salt, (int) seed);
  }

  private static void air(Chunk chunk, int x, int y, int z, String name) {
    var pos = new BlockPos(x, y, z);
    if (x >> 4 == chunk.getPos().x
        && z >> 4 == chunk.getPos().z
        && chunk.getBlockState(pos).isAir()) put(chunk, x, y, z, name);
  }

  private static void decorate(
      StructureWorldAccess world, Chunk chunk, long seed, int minX, int minZ) {
    for (int x = minX - 6; x <= minX + 21; x++)
      for (int z = minZ - 6; z <= minZ + 21; z++) {
        var c = FieldMath.column(x, z, seed);
        if (c == null || Math.hypot(x - c.center().x(), z - c.center().z()) <= 80) continue;
        double r = FieldMath.hash(x, 41, z, (int) seed ^ 0x66656174);
        if (r >= .00775) continue;
        int y = surface(world, x, z, seed);
        if (r < .003) {
          String kind =
              FieldMath.hash(x, 45, z, (int) seed ^ 0x66656174) < .5
                  ? "positive_magnetite_crystal"
                  : "negative_magnetite_crystal";
          int count = 1 + (int) (FieldMath.hash(x, 46, z, (int) seed ^ 0x66656174) * 3);
          int[][] o = {{0, 0}, {1, 0}, {0, 1}};
          for (int i = 0; i < count; i++) air(chunk, x + o[i][0], y + 1, z + o[i][1], kind);
        } else if (r < .0042) {
          int count = 1 + (int) (FieldMath.hash(x, 47, z, (int) seed ^ 0x66656174) * 2);
          int[][] o = {{0, 0}, {1, 1}, {-1, 0}};
          for (int i = 0; i < count; i++)
            air(chunk, x + o[i][0], y + 1, z + o[i][1], "magnetite_shard");
        } else if (r < .0058) {
          int size = 2 + (int) (FieldMath.hash(x, 48, z, (int) seed ^ 0x66656174) * 3);
          int[][] o = {{0, 0}, {1, 0}, {0, 1}, {1, 1}, {-1, 0}, {0, -1}, {-1, -1}};
          for (int i = 0; i < size; i++) {
            int vx = x + o[i][0], vz = z + o[i][1];
            put(chunk, vx, surface(world, vx, vz, seed), vz, "charged_magnetite");
          }
        } else if (r < .007) {
          if (!flat(world, x, z, y, seed)) continue;
          int radius = 1 + (int) (FieldMath.hash(x, 49, z, (int) seed ^ 0x66656174) * 2);
          for (int dx = -radius; dx <= radius; dx++)
            for (int dz = -radius; dz <= radius; dz++)
              if (Math.abs(dx) + Math.abs(dz) <= radius && rand(x + dx, y, z + dz, 61, seed) < .65)
                air(chunk, x + dx, y + 1, z + dz, "magnetic_spike");
        } else if (r < .00745) {
          if (!flat(world, x, z, y, seed)) continue;
          String pad =
              FieldMath.hash(x, 50, z, (int) seed ^ 0x66656174) < .5
                  ? "positive_magnet"
                  : "negative_magnet";
          for (int dx = -1; dx <= 1; dx++)
            for (int dz = -1; dz <= 1; dz++) put(chunk, x + dx, y, z + dz, pad);
          air(chunk, x, y + 1, z, "magnetite_shard");
        } else if (r < .00765) {
          if (!flat(world, x, z, y, seed)) continue;
          int h = 6 + (int) (FieldMath.hash(x, 51, z, (int) seed ^ 0x66656174) * 6);
          boolean broken = FieldMath.hash(x, 52, z, (int) seed ^ 0x66656174) < .45;
          if (broken) h = Math.max(2, (int) (h * .4));
          for (int i = 1; i <= h; i++) put(chunk, x, y + i, z, "magnetite_bricks");
          if (!broken) {
            put(chunk, x, y + h + 1, z, "charged_magnetite");
            air(chunk, x, y + h + 2, z, "magnetite_shard");
          } else {
            air(chunk, x + 1, y + 1, z, "magnetite_bricks");
            air(chunk, x - 1, y + 1, z + 1, "magnetite_bricks");
          }
        } else {
          if (!flat(world, x, z, y, seed)) continue;
          int size = 4 + (int) (FieldMath.hash(x, 53, z, (int) seed ^ 0x66656174) * 3);
          for (int dx = -size; dx <= size; dx++)
            for (int dz = -size; dz <= size; dz++)
              if (Math.abs(dx) == size || Math.abs(dz) == size) {
                if (rand(x + dx, 0, z + dz, 62, seed) < .18) continue;
                int h = 1 + (int) (rand(x + dx, 1, z + dz, 63, seed) * 3);
                for (int i = 1; i <= h; i++) air(chunk, x + dx, y + i, z + dz, "magnetite_bricks");
              } else if ((dx + dz) % 2 == 0 && rand(x + dx, 2, z + dz, 64, seed) < .5)
                put(
                    chunk,
                    x + dx,
                    surface(world, x + dx, z + dz, seed),
                    z + dz,
                    "chiseled_magnetite");
          if (FieldMath.hash(x, 54, z, (int) seed ^ 0x66656174) < .6)
            cache(chunk, x, y + 1, z, seed);
        }
      }
  }

  private static void cache(Chunk chunk, int x, int y, int z, long seed) {
    if (x >> 4 != chunk.getPos().x || z >> 4 != chunk.getPos().z) return;
    var pos = new BlockPos(x, y, z);
    set(chunk, x, y, z, Blocks.CHEST.getDefaultState());
    var chest =
        new net.minecraft.block.entity.ChestBlockEntity(pos, Blocks.CHEST.getDefaultState());
    java.util.function.IntToDoubleFunction h =
        salt -> FieldMath.hash(x ^ (y * 31), salt, z, (int) seed ^ 0x63616368);
    var used = new HashSet<Integer>();
    java.util.function.BiConsumer<net.minecraft.item.ItemStack, Integer> add =
        (stack, salt) -> {
          int slot = 0;
          for (int i = 0; i < 27; i++) {
            slot = (int) (h.applyAsDouble(salt + i * 7) * 27);
            if (used.add(slot)) break;
          }
          chest.setStack(slot, stack);
        };
    add.accept(
        new net.minecraft.item.ItemStack(
            Content.item("magnetite_bricks"), 4 + (int) (h.applyAsDouble(1) * 9)),
        100);
    add.accept(
        new net.minecraft.item.ItemStack(
            Content.item("magnetite_block"), 3 + (int) (h.applyAsDouble(2) * 6)),
        110);
    add.accept(
        new net.minecraft.item.ItemStack(
            Content.item("positive_magnetite_crystal"), 1 + (int) (h.applyAsDouble(3) * 3)),
        120);
    add.accept(
        new net.minecraft.item.ItemStack(
            Content.item("negative_magnetite_crystal"), 1 + (int) (h.applyAsDouble(4) * 3)),
        130);
    if (h.applyAsDouble(5) < .7)
      add.accept(
          new net.minecraft.item.ItemStack(
              Content.item("magnetite_shard"), 1 + (int) (h.applyAsDouble(6) * 2)),
          140);
    if (h.applyAsDouble(7) < .5)
      add.accept(
          new net.minecraft.item.ItemStack(
              Content.item("charged_magnetite"), 1 + (int) (h.applyAsDouble(8) * 2)),
          150);
    if (h.applyAsDouble(9) < .6)
      add.accept(
          new net.minecraft.item.ItemStack(
              net.minecraft.item.Items.IRON_INGOT, 2 + (int) (h.applyAsDouble(10) * 4)),
          160);
    if (h.applyAsDouble(11) < .25)
      add.accept(
          new net.minecraft.item.ItemStack(
              net.minecraft.item.Items.GOLD_INGOT, 1 + (int) (h.applyAsDouble(12) * 3)),
          170);
    if (h.applyAsDouble(13) < .1)
      add.accept(new net.minecraft.item.ItemStack(net.minecraft.item.Items.DIAMOND), 180);
    chunk.setBlockEntity(chest);
  }

  public static void set(Chunk chunk, int x, int y, int z, BlockState state) {
    if (x >> 4 != chunk.getPos().x
        || z >> 4 != chunk.getPos().z
        || y < chunk.getBottomY()
        || y >= chunk.getTopY()) return;
    var pos = new BlockPos(x, y, z);
    var old = chunk.getBlockState(pos);
    if (old.hasBlockEntity() && !state.isOf(old.getBlock())) chunk.removeBlockEntity(pos);
    chunk.setBlockState(pos, state, false);
  }

  public static void put(Chunk chunk, int x, int y, int z, String block) {
    set(chunk, x, y, z, Content.block(block).getDefaultState());
  }

  public static BlockPos nearestVault(int x, int z, long seed) {
    BlockPos best = null;
    double distance = Double.MAX_VALUE;
    int bx = Math.floorDiv(x, 1536), bz = Math.floorDiv(z, 1536);
    for (int r = 0; r < 34; r++) {
      for (int cx = bx - r; cx <= bx + r; cx++)
        for (int cz = bz - r; cz <= bz + r; cz++) {
          if (r > 0 && Math.abs(cx - bx) != r && Math.abs(cz - bz) != r) continue;
          var c = Vaults.candidate(cx, cz, seed);
          if (c == null) continue;
          double d = c.getSquaredDistance(new Vec3i(x, 0, z));
          if (d < distance) {
            best = c;
            distance = d;
          }
        }
      if (best != null && r * 1536 > Math.sqrt(distance) + 1536) break;
    }
    if (best == null) throw new IllegalStateException("No vault in range");
    return best;
  }
}
