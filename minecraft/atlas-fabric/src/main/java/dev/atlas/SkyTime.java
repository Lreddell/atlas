package dev.atlas;

/** Astronomical time works on both sides; client ambient-darkness flags do not. */
public final class SkyTime {
  private SkyTime() {}

  public static boolean night(long ticks) {
    long t = Math.floorMod(ticks, 24000);
    return t >= 13000 && t < 23000;
  }
}
