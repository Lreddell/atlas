package dev.atlas;

import java.util.*;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.entity.*;
import net.minecraft.entity.attribute.*;
import net.minecraft.item.*;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.math.*;

public final class Combat {
  public record Profile(String kind, int duration, double reach) {}

  private record Swing(
      UUID target, Item item, long start, Profile profile, float yaw, float pitch) {}

  private static final Map<UUID, Swing> SWINGS = new HashMap<>();

  public static Profile profile(Item item) {
    String n = Content.path(item);
    if (n.endsWith("spear")) return new Profile("spear", 13, 5.4);
    if (n.endsWith("maul")) return new Profile("maul", 21, 4.2);
    if (n.endsWith("hammer")) return new Profile("hammer", 22, 4.4);
    if (item instanceof SwordItem) return new Profile("sword", 12, 3.2);
    if (item instanceof AxeItem) return new Profile("axe", 20, 3.2);
    return null;
  }

  public static void init() {
    net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents.SERVER_STOPPED.register(
        server -> SWINGS.clear());
    ServerTickEvents.END_SERVER_TICK.register(
        server -> {
          var iterator = SWINGS.entrySet().iterator();
          while (iterator.hasNext()) {
            var entry = iterator.next();
            var p = server.getPlayerManager().getPlayer(entry.getKey());
            var swing = entry.getValue();
            if (p == null || !p.isAlive()) {
              iterator.remove();
              continue;
            }
            long elapsed = p.getWorld().getTime() - swing.start;
            if (elapsed >= swing.profile.duration) {
              iterator.remove();
              continue;
            }
            if (elapsed != swing.profile.duration / 2
                || p.getMainHandStack().getItem() != swing.item) continue;
            var target = p.getServerWorld().getEntity(swing.target);
            if (target == null
                || !target.isAlive()
                || p.distanceTo(target) > swing.profile.reach + target.getWidth() * .5) continue;
            var sight =
                p.getWorld()
                    .raycast(
                        new net.minecraft.world.RaycastContext(
                            p.getEyePos(),
                            target.getPos().add(0, target.getHeight() * .55, 0),
                            net.minecraft.world.RaycastContext.ShapeType.COLLIDER,
                            net.minecraft.world.RaycastContext.FluidHandling.NONE,
                            p));
            if (sight.getType() != net.minecraft.util.hit.HitResult.Type.MISS) continue;
            double multiplier = 1, distance = p.distanceTo(target);
            if (swing.profile.kind.equals("spear"))
              multiplier = distance >= 3.2 ? 1.35 : distance < 1.75 ? .82 : 1;
            if (target instanceof AtlasMob m && m.kind().equals("tollkeeper")) {
              if (swing.profile.kind.equals("maul")) multiplier *= 1.65;
              else if (swing.profile.kind.equals("hammer")) multiplier *= 1.55;
            }
            var attr = p.getAttributeInstance(EntityAttributes.GENERIC_ATTACK_DAMAGE);
            var id = Atlas.id("weapon_technique");
            double extra = attr.getValue() * (multiplier - 1);
            if (extra != 0)
              attr.addTemporaryModifier(
                  new EntityAttributeModifier(
                      id, extra, EntityAttributeModifier.Operation.ADD_VALUE));
            try {
              p.setYaw(swing.yaw);
              p.setPitch(swing.pitch);
              p.attack(target);
            } finally {
              attr.removeModifier(id);
            }
          }
        });
  }

  public static void request(ServerPlayerEntity p, Network.Attack req) {
    if (req.entity() < 0) {
      var s = SWINGS.get(p.getUuid());
      if (s != null)
        SWINGS.put(
            p.getUuid(), new Swing(new UUID(0, 0), s.item, s.start, s.profile, s.yaw, s.pitch));
      return;
    }
    if (SWINGS.containsKey(p.getUuid())
        || !p.isAlive()
        || p.isSpectator()
        || !Float.isFinite(req.yaw())
        || !Float.isFinite(req.pitch())) return;
    var profile = profile(p.getMainHandStack().getItem());
    var target = p.getServerWorld().getEntityById(req.entity());
    if (profile == null
        || target == null
        || target == p
        || !target.isAlive()
        || p.distanceTo(target) > profile.reach + target.getWidth() * .5 + 1) return;
    SWINGS.put(
        p.getUuid(),
        new Swing(
            target.getUuid(),
            p.getMainHandStack().getItem(),
            p.getWorld().getTime(),
            profile,
            req.yaw(),
            Math.clamp(req.pitch(), -90, 90)));
    p.swingHand(net.minecraft.util.Hand.MAIN_HAND);
    for (var other : p.getServerWorld().getPlayers())
      if (other.squaredDistanceTo(p) < 4096)
        Network.sendCue(other, "attack", p.getId(), profile.kind);
  }
}
