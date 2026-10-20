package dev.atlas;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Atlas main's signed 32-bit hashes and seeded Perlin sampler, without Minecraft dependencies. */
public final class FieldMath {
  public static final int CELL = 1536, RADIUS = 384, FLOOR = 132;
  private static final Map<Integer, Noise> NOISE = new ConcurrentHashMap<>();

  public record Center(int x, int z) {}

  public record Column(Center center, int height, int tier, double edge, boolean arena) {}

  public static Noise noise(long seed) {
    return NOISE.computeIfAbsent((int) seed, s -> new Noise((double) s + 800));
  }

  public static double hash(int x, int y, int z, int seed) {
    int h = (x ^ seed) * 374761393;
    h = (h ^ y) * 668265263;
    h = (h ^ z) * 2147483647;
    h ^= h >>> 13;
    h *= 1274126177;
    h ^= h >>> 16;
    return Integer.toUnsignedLong(h) / 4294967296.0;
  }

  public static int vaultHash(int seed, int x, int z, int salt) {
    int h = seed ^ x * 0x45d9f3b ^ z * 0x119de1f3 ^ salt * 0x27d4eb2d;
    h = (h ^ (h >>> 16)) * 0x7feb352d;
    h = (h ^ (h >>> 15)) * 0x846ca68b;
    return h ^ (h >>> 16);
  }

  public static Center center(int cx, int cz, long seed) {
    double jitter = Math.min(.5, Math.max(0, 1 - (2 * RADIUS * 1.28 + 64) / CELL)),
        inset = (1 - jitter) / 2;
    return new Center(
        cx * CELL
            + (int) Math.floor((inset + hash(cx, 1, cz, (int) seed ^ 0x6669656c) * jitter) * CELL),
        cz * CELL
            + (int) Math.floor((inset + hash(cx, 2, cz, (int) seed ^ 0x6473) * jitter) * CELL));
  }

  public static boolean active(Center c, long seed) {
    return noise(seed).sample(c.x * .0009, c.z * .0009) > .3;
  }

  public static List<Center> touching(
      int minX, int minZ, int maxX, int maxZ, long seed, int margin) {
    var out = new ArrayList<Center>();
    for (int cx = Math.floorDiv(minX - margin, CELL);
        cx <= Math.floorDiv(maxX + margin, CELL);
        cx++)
      for (int cz = Math.floorDiv(minZ - margin, CELL);
          cz <= Math.floorDiv(maxZ + margin, CELL);
          cz++) {
        var c = center(cx, cz, seed);
        double dx = Math.max(Math.max(minX - c.x, 0), c.x - maxX),
            dz = Math.max(Math.max(minZ - c.z, 0), c.z - maxZ);
        if (dx * dx + dz * dz <= margin * margin && active(c, seed)) out.add(c);
      }
    return out;
  }

  public static Column column(int x, int z, long seed) {
    var n = noise(seed);
    int bx = Math.floorDiv(x, CELL), bz = Math.floorDiv(z, CELL);
    for (int cx = bx - 1; cx <= bx + 1; cx++)
      for (int cz = bz - 1; cz <= bz + 1; cz++) {
        var c = center(cx, cz, seed);
        double d = Math.hypot(x - c.x, z - c.z);
        if (d > RADIUS * 1.28 || !active(c, seed)) continue;
        double radius = RADIUS * (1 + .28 * n.sample(x * .011, z * .011));
        if (d > radius) continue;
        double warped = Math.max(0, d + 16 * n.sample(x * .02, z * .02)),
            edge = Math.max(0, radius - d);
        if (warped <= 80) return new Column(c, FLOOR, 5, edge, true);
        int tier =
            Math.max(
                0,
                Math.min(
                    5, 5 - (int) Math.floor(Math.max(0, warped - 80) / ((RADIUS - 80) / 6.0))));
        return new Column(
            c,
            70 + tier * 12 + (int) Math.floor(n.sample(x * .075, z * .075) * 1.8 + .5),
            tier,
            edge,
            false);
      }
    return null;
  }

  public static Center nearest(int x, int z, long seed) {
    Center best = null;
    double dist = Double.MAX_VALUE;
    int bx = Math.floorDiv(x, CELL), bz = Math.floorDiv(z, CELL);
    for (int r = 0; r <= 34; r++) {
      for (int cx = bx - r; cx <= bx + r; cx++)
        for (int cz = bz - r; cz <= bz + r; cz++) {
          if (r > 0 && Math.abs(cx - bx) != r && Math.abs(cz - bz) != r) continue;
          var c = center(cx, cz, seed);
          double d = Math.hypot(c.x - x, c.z - z);
          if (d < dist && active(c, seed)) {
            best = c;
            dist = d;
          }
        }
      if (best != null && r * CELL > dist + CELL) break;
    }
    if (best == null) throw new IllegalStateException("No Magnetic Fields within 50,000 blocks");
    return best;
  }

  public static int wallPolarity(int x, int z, long seed) {
    int cx = Math.floorDiv(x, 6), cz = Math.floorDiv(z, 6);
    return hash(cx, 11, cz, (int) seed ^ 0x77616c6c) >= .4
        ? 0
        : hash(cx, 12, cz, (int) seed ^ 0x706f6c) < .5 ? 1 : -1;
  }

  public static boolean bloodMoon(long ticks, long seed) {
    long cycle = Math.floorDiv(ticks - 6000, 24000);
    int h = (int) cycle ^ ((int) seed + 0x51f15e);
    h = (h ^ 0x9e3779b9) * 0x85ebca6b;
    h ^= h >>> 13;
    h *= 0xc2b2ae35;
    h ^= h >>> 16;
    return Integer.toUnsignedLong(h) / 4294967295.0 < 1.0 / 96;
  }

  public static final class Noise {
    private final int[] p = new int[512];

    public Noise(double seed) {
      int[] a = new int[256];
      for (int i = 0; i < 256; i++) a[i] = i;
      double s = seed;
      for (int i = 255; i > 0; i--) {
        double v = Math.sin(s++) * 10000;
        int j = (int) Math.floor((v - Math.floor(v)) * (i + 1));
        int t = a[i];
        a[i] = a[j];
        a[j] = t;
      }
      for (int i = 0; i < 512; i++) p[i] = a[i % 256];
    }

    private static double fade(double t) {
      return t * t * t * (t * (t * 6 - 15) + 10);
    }

    private static double lerp(double t, double a, double b) {
      return a + t * (b - a);
    }

    private static double grad(int hash, double x, double y, double z) {
      int h = hash & 15;
      double u = h < 8 ? x : y, v = h < 4 ? y : h == 12 || h == 14 ? x : z;
      return ((h & 1) == 0 ? u : -u) + ((h & 2) == 0 ? v : -v);
    }

    public double sample(double x, double y) {
      int fx = (int) Math.floor(x), fy = (int) Math.floor(y), X = fx & 255, Y = fy & 255;
      x -= fx;
      y -= fy;
      double u = fade(x), v = fade(y);
      int A = p[X] + Y, AA = p[A], AB = p[A + 1], B = p[X + 1] + Y, BA = p[B], BB = p[B + 1];
      return lerp(
          v,
          lerp(u, grad(p[AA], x, y, 0), grad(p[BA], x - 1, y, 0)),
          lerp(u, grad(p[AB], x, y - 1, 0), grad(p[BB], x - 1, y - 1, 0)));
    }
  }
}
