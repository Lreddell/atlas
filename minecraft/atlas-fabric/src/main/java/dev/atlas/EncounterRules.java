package dev.atlas;

/** Pure encounter contracts, independent of rendering and source reducer parity. */
public final class EncounterRules {
  private EncounterRules() {}

  /** A crystal intercepts a 50-degree wedge. An exposed flank always takes full damage. */
  public static double crystalMultiplier(
      double attackX, double attackZ, double crystalX, double crystalZ) {
    double a = Math.hypot(attackX, attackZ), b = Math.hypot(crystalX, crystalZ);
    if (a < .001 || b < .001) return 1;
    return (attackX * crystalX + attackZ * crystalZ) / (a * b) >= Math.cos(Math.toRadians(25))
        ? .4
        : 1;
  }

  public static boolean abandoned(int emptyTicks) {
    return emptyTicks >= 200;
  }
}
