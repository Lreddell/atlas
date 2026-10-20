package dev.atlas.client;

import dev.atlas.*;
import java.util.*;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.MinecraftClient;
import net.minecraft.entity.LivingEntity;
import net.minecraft.item.Item;
import net.minecraft.util.hit.EntityHitResult;

public final class ClientCombat {
  public record Swing(long start, int duration, String kind) {}

  private static final Map<Integer, Swing> SWINGS = new HashMap<>();
  private static Item item;
  private static boolean cancelled = false;

  public static boolean begin() {
    var c = MinecraftClient.getInstance();
    if (c.player == null || !ClientPlayNetworking.canSend(Network.Attack.ID)) return false;
    var profile = Combat.profile(c.player.getMainHandStack().getItem());
    if (profile == null) return false;
    if (progress(c.player.getId(), 0) >= 0) return true;
    if (!(c.crosshairTarget instanceof EntityHitResult hit)
        || !(hit.getEntity() instanceof LivingEntity)) return false;
    CameraRig.faceForAction();
    SWINGS.put(c.player.getId(), new Swing(c.world.getTime(), profile.duration(), profile.kind()));
    item = c.player.getMainHandStack().getItem();
    cancelled = false;
    ClientPlayNetworking.send(
        new Network.Attack(hit.getEntity().getId(), c.player.getYaw(), c.player.getPitch()));
    c.player.swingHand(net.minecraft.util.Hand.MAIN_HAND);
    return true;
  }

  public static void cue(int id, String kind) {
    var c = MinecraftClient.getInstance();
    if (c.player == null || id == c.player.getId()) return;
    int duration =
        switch (kind) {
          case "spear" -> 13;
          case "maul" -> 21;
          case "hammer" -> 22;
          case "axe" -> 20;
          default -> 12;
        };
    SWINGS.put(id, new Swing(c.world.getTime(), duration, kind));
  }

  public static void tick() {
    var c = MinecraftClient.getInstance();
    if (c.player == null) {
      SWINGS.clear();
      return;
    }
    if (progress(c.player.getId(), 0) >= 0
        && (c.currentScreen != null || c.player.getMainHandStack().getItem() != item)
        && !cancelled) {
      ClientPlayNetworking.send(new Network.Attack(-1, 0, 0));
      cancelled = true;
    }
  }

  public static float progress(int id, float delta) {
    var c = MinecraftClient.getInstance();
    var s = SWINGS.get(id);
    if (s == null || c.world == null) return -1;
    float t = (c.world.getTime() - s.start + delta) / s.duration;
    if (t >= 1) {
      SWINGS.remove(id);
      return -1;
    }
    return Math.max(0, t);
  }

  public static float[] pose(int id, float delta) {
    float t = progress(id, delta);
    if (t < 0) return null;
    float wind = smooth(t / .38f),
        cut = smooth((t - .38f) / .2f),
        settle = smooth((t - .58f) / .42f);
    return new float[] {
      (.3f + wind * 2.1f - cut * 1.5f) * (1 - settle),
      (-wind * .35f + cut * .65f) * (1 - settle),
      (-wind * .5f + cut * .9f) * (1 - settle)
    };
  }

  private static float smooth(float v) {
    v = Math.clamp(v, 0, 1);
    return v * v * (3 - 2 * v);
  }
}
