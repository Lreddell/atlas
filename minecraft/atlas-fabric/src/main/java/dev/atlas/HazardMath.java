package dev.atlas;

import com.google.gson.JsonObject;

public final class HazardMath {
  public record Sample(
      String phase, double progress, double collision, double headY, boolean solid) {}

  public static Sample sample(JsonObject d, double time, int tier) {
    String kind = d.get("kind").getAsString();
    double y = d.get("y").getAsDouble();
    if (kind.equals("gap")) return new Sample("active", 1, 0, y + 5.2, false);
    double scale = new double[] {1, .94, .84, .74}[tier],
        rest =
            Math.max(
                .65,
                d.get("restSeconds").getAsDouble()
                    * (kind.equals("crusher") ? new double[] {1, .88, .76, .66}[tier] : scale)),
        warn = Math.max(.55, d.get("telegraphSeconds").getAsDouble()),
        active = d.get("activeSeconds").getAsDouble(),
        recover = Math.max(.65, d.get("recoverSeconds").getAsDouble() * scale),
        cycle = rest + warn + active + recover,
        local = ((time - d.get("phaseOffset").getAsDouble()) % cycle + cycle) % cycle;
    String phase;
    double progress;
    if (local < rest) {
      phase = "rest";
      progress = local / rest;
    } else if (local < rest + warn) {
      phase = "telegraph";
      progress = (local - rest) / warn;
    } else if (local < rest + warn + active) {
      phase = "active";
      progress = (local - rest - warn) / active;
    } else {
      phase = "recover";
      progress = (local - rest - warn - active) / recover;
    }
    double
        spike =
            phase.equals("rest")
                ? .08
                : phase.equals("telegraph")
                    ? .08 + progress * .34
                    : phase.equals("active") ? 1.05 : Math.max(.08, 1.05 * (1 - progress)),
        travel =
            phase.equals("telegraph")
                ? progress * .16
                : phase.equals("active")
                    ? Math.min(1, progress * 4)
                    : phase.equals("recover") ? 1 - progress : 0;
    return new Sample(
        phase,
        progress,
        kind.equals("spikes") ? spike : 0,
        y + 5.15 - travel * 4.05,
        !kind.equals("collapse") || !phase.equals("active"));
  }
}
