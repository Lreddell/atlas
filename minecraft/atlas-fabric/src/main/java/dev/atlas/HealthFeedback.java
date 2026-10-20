package dev.atlas;

/** Atlas's health hysteresis and heartbeat curve, expressed in Minecraft health points. */
public final class HealthFeedback {
  public static boolean active(boolean wasActive, double health, double max) {
    if (!Double.isFinite(health) || health <= 0) return false;
    if (health <= Math.floor(max * .4)) return true;
    if (health >= Math.floor(max * .5)) return false;
    return wasActive;
  }

  public static double severity(double health, double max) {
    double enter = Math.floor(max * .4);
    return health <= 0 ? 0 : Math.clamp((enter - health) / Math.max(1, enter - 1), 0, 1);
  }

  public static double bpm(double health, double max) {
    double s = severity(health, max);
    return 72 + 42 * (s * s * .35 + s * .65);
  }
}
