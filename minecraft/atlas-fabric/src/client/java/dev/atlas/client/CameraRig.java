package dev.atlas.client;

import java.util.*;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.Perspective;
import net.minecraft.util.math.*;
import net.minecraft.world.RaycastContext;

public final class CameraRig {
  public enum Mode {
    FIRST,
    FREE,
    SHOULDER
  }

  public static Mode mode = Mode.FIRST;
  public static int detached = 0;
  public static float yaw, pitch;
  public static Vec3d detachedPosition = Vec3d.ZERO;
  private static boolean seeded = false;
  public static int bossId = -1;
  private static Mode beforeBoss = Mode.FIRST;
  private static boolean cinematic = false;
  private static long cinemaStart;
  private static int cinemaDuration;
  private static boolean defeat = false;
  public static final Map<Integer, Long> ROLLS = new HashMap<>();

  private static MinecraftClient mc() {
    return MinecraftClient.getInstance();
  }

  public static boolean orbit() {
    return mode == Mode.FREE || detached == 1;
  }

  public static boolean cinematic() {
    return cinematic && AtlasConfig.INSTANCE.cinematics && !AtlasConfig.INSTANCE.reducedMotion;
  }

  public static double cinematicProgress() {
    return Math.clamp((System.nanoTime() - cinemaStart) / 1e9 / cinemaDuration, 0, 1);
  }

  public static boolean custom() {
    return detached != 0 || mode != Mode.FIRST || cinematic();
  }

  public static void seed() {
    if (mc().player != null) {
      yaw = mc().player.getYaw();
      pitch = mc().player.getPitch();
      seeded = true;
    }
  }

  public static void toggleFree() {
    if (!seeded) seed();
    detached = 0;
    mode = mode == Mode.FREE ? Mode.FIRST : Mode.FREE;
    mc().options
        .setPerspective(
            mode == Mode.FIRST ? Perspective.FIRST_PERSON : Perspective.THIRD_PERSON_BACK);
  }

  public static void toggleShoulder() {
    seed();
    detached = 0;
    mode = mode == Mode.SHOULDER ? Mode.FIRST : Mode.SHOULDER;
    mc().options
        .setPerspective(
            mode == Mode.FIRST ? Perspective.FIRST_PERSON : Perspective.THIRD_PERSON_BACK);
  }

  public static void toggleDetached() {
    if (detached == 0) {
      seed();
      detachedPosition = mc().gameRenderer.getCamera().getPos();
      detached = 1;
      mc().options.setPerspective(Perspective.THIRD_PERSON_BACK);
    } else if (detached == 1) detached = 2;
    else {
      detached = 0;
      mc().options
          .setPerspective(
              mode == Mode.FIRST ? Perspective.FIRST_PERSON : Perspective.THIRD_PERSON_BACK);
    }
  }

  public static void mouse(double dx, double dy) {
    yaw += (float) (dx * .15);
    pitch = Math.clamp(pitch + (float) (dy * .15), -89, 89);
  }

  public static void cue(String cue, int id) {
    if (cue.equals("roll")) {
      ROLLS.put(id, System.nanoTime());
      return;
    }
    if (!cue.equals("intro") && !cue.equals("defeat")) return;
    if (bossId < 0) beforeBoss = mode;
    bossId = id;
    detached = 0;
    mode = Mode.FREE;
    seed();
    mc().options.setPerspective(Perspective.THIRD_PERSON_BACK);
    cinematic = true;
    cinemaStart = System.nanoTime();
    defeat = cue.equals("defeat");
    cinemaDuration = defeat ? 5 : 4;
  }

  public static void tick() {
    var c = mc();
    if (c.player == null) {
      reset();
      return;
    }
    if (!seeded) seed();
    if (cinematic
        && ((System.nanoTime() - cinemaStart) / 1e9 >= cinemaDuration
            || c.options.jumpKey.isPressed() && (System.nanoTime() - cinemaStart) > 300_000_000L))
      cinematic = false;
    if (bossId >= 0 && (c.world.getEntityById(bossId) == null || defeat && !cinematic)) {
      bossId = -1;
      mode = beforeBoss;
      c.options.setPerspective(
          mode == Mode.FIRST ? Perspective.FIRST_PERSON : Perspective.THIRD_PERSON_BACK);
      defeat = false;
      seed();
    }
    if (detached == 1 && c.currentScreen == null) {
      double
          forward =
              (c.options.forwardKey.isPressed() ? 1 : 0) - (c.options.backKey.isPressed() ? 1 : 0),
          side = (c.options.leftKey.isPressed() ? 1 : 0) - (c.options.rightKey.isPressed() ? 1 : 0),
          up = (c.options.jumpKey.isPressed() ? 1 : 0) - (c.options.sneakKey.isPressed() ? 1 : 0);
      double r = Math.toRadians(yaw), speed = c.options.sprintKey.isPressed() ? 1 : .35;
      Vec3d d =
          new Vec3d(
              -Math.sin(r) * forward + Math.cos(r) * side,
              up,
              Math.cos(r) * forward + Math.sin(r) * side);
      if (d.lengthSquared() > 0)
        detachedPosition = detachedPosition.add(d.normalize().multiply(speed));
    }
    if (mode == Mode.FREE && detached == 0)
      c.player.headYaw =
          c.player.getYaw() + Math.clamp(MathHelper.wrapDegrees(yaw - c.player.getYaw()), -65, 65);
  }

  public static void faceForAction() {
    var c = mc();
    if (c.player != null && mode == Mode.FREE && detached == 0) {
      c.player.setYaw(yaw);
      c.player.setPitch(pitch);
    }
  }

  public static Vec3d eye(float delta) {
    return mc().player.getCameraPosVec(delta);
  }

  public static Vec3d collision(Vec3d eye, Vec3d desired) {
    var c = mc();
    var hit =
        c.world.raycast(
            new RaycastContext(
                eye,
                desired,
                RaycastContext.ShapeType.VISUAL,
                RaycastContext.FluidHandling.NONE,
                c.player));
    return hit.getType() == net.minecraft.util.hit.HitResult.Type.MISS
        ? desired
        : hit.getPos().add(eye.subtract(desired).normalize().multiply(.25));
  }

  public static float rollProgress(int id) {
    var start = ROLLS.get(id);
    if (start == null) return -1;
    float t = (System.nanoTime() - start) / 600_000_000f;
    if (t >= 1) {
      ROLLS.remove(id);
      return -1;
    }
    return t;
  }

  public static void reset() {
    mode = Mode.FIRST;
    detached = 0;
    seeded = false;
    bossId = -1;
    cinematic = false;
    ROLLS.clear();
  }
}
