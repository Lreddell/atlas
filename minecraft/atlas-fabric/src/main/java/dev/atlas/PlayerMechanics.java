package dev.atlas;

import java.util.*;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.AttackEntityCallback;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.entity.*;
import net.minecraft.entity.damage.DamageTypes;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.*;
import net.minecraft.registry.tag.DamageTypeTags;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.*;
import net.minecraft.util.math.*;
import net.minecraft.world.World;

public final class PlayerMechanics {
  public static final class Motion {
    double stamina = 100;
    int roll = 0, cooldown = 0, regen = 0, slam = 0, magnetGrace = 0;
    Vec3d direction = Vec3d.ZERO;
    long[] lastControl = {-100, -100, -100, -100};
    float forward;
  }

  private static final Map<UUID, Motion> MOTION = new HashMap<>();

  public static Motion motion(PlayerEntity p) {
    return MOTION.computeIfAbsent(p.getUuid(), id -> new Motion());
  }

  public static boolean boots(PlayerEntity p) {
    String n = Content.path(p.getEquippedStack(EquipmentSlot.FEET).getItem());
    return n.equals("polarity_boots") || n.equals("upgraded_polarity_boots");
  }

  public static int polarity(PlayerEntity p) {
    return boots(p) && !p.getCommandTags().contains("atlas:boots_off")
        ? (p.getCommandTags().contains("atlas:negative") ? -1 : 1)
        : 0;
  }

  public static boolean consumeSlam(PlayerEntity p) {
    var m = motion(p);
    if (m.slam <= 0) return false;
    m.slam = 0;
    return true;
  }

  public static void init() {
    net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents.SERVER_STOPPED.register(
        server -> MOTION.clear());
    ServerTickEvents.END_WORLD_TICK.register(PlayerMechanics::tick);
    ServerPlayConnectionEvents.DISCONNECT.register((h, s) -> MOTION.remove(h.player.getUuid()));
    net.fabricmc.fabric.api.entity.event.v1.ServerPlayerEvents.COPY_FROM.register(
        (oldPlayer, newPlayer, alive) -> {
          for (String tag : oldPlayer.getCommandTags())
            if (tag.equals("atlas:negative") || tag.equals("atlas:boots_off"))
              newPlayer.addCommandTag(tag);
          MOTION.remove(newPlayer.getUuid());
        });
    ServerLivingEntityEvents.ALLOW_DAMAGE.register(
        (entity, source, amount) -> {
          if (!(entity instanceof PlayerEntity p)
              || source.isIn(DamageTypeTags.BYPASSES_INVULNERABILITY)) return true;
          var m = motion(p);
          if (source.isOf(DamageTypes.FALL) && m.roll > 0) return false;
          return !(m.roll >= 7 && m.roll <= 10);
        });
    AttackEntityCallback.EVENT.register(
        (p, w, h, target, hit) -> {
          if (!w.isClient
              && target instanceof AtlasMob m
              && Content.path(p.getStackInHand(h).getItem()).contains("maul")) m.stagger(30);
          return ActionResult.PASS;
        });
  }

  public static void control(ServerPlayerEntity p, Network.Control packet) {
    var m = motion(p);
    long now = p.getWorld().getTime();
    if (!Float.isFinite(packet.yaw())
        || !Float.isFinite(packet.forward())
        || !Float.isFinite(packet.sideways())) return;
    int action = packet.action();
    if (action < 0 || action > 3 || now == m.lastControl[action] || !p.isAlive() || p.isSpectator())
      return;
    m.lastControl[action] = now;
    if (packet.action() == 1 && boots(p)) {
      if (!p.getCommandTags().remove("atlas:negative")) p.addCommandTag("atlas:negative");
      return;
    }
    if (packet.action() == 2 && boots(p)) {
      if (!p.getCommandTags().remove("atlas:boots_off")) p.addCommandTag("atlas:boots_off");
      return;
    }
    if (packet.action() == 3) {
      m.forward = Math.clamp(packet.forward(), -1, 1);
      return;
    }
    if (packet.action() != 0
        || m.cooldown > 0
        || m.stamina < 30
        || p.getAbilities().flying
        || p.hasVehicle()) return;
    double yaw = Math.toRadians(packet.yaw()),
        forward = Math.clamp(packet.forward(), -1, 1),
        side = Math.clamp(packet.sideways(), -1, 1);
    Vec3d direction =
        new Vec3d(
            -Math.sin(yaw) * forward + Math.cos(yaw) * side,
            0,
            Math.cos(yaw) * forward + Math.sin(yaw) * side);
    if (direction.lengthSquared() < .1) direction = new Vec3d(Math.sin(yaw), 0, -Math.cos(yaw));
    direction = direction.normalize();
    m.stamina -= 30;
    m.regen = 22;
    m.cooldown = 17;
    m.roll = 12;
    m.direction = direction;
    p.fallDistance = 0;
    int pol = polarity(p);
    if (pol != 0) {
      for (var boss :
          p.getWorld()
              .getEntitiesByClass(
                  AtlasBoss.class, p.getBoundingBox().expand(16), b -> b.kind().equals("warden"))) {
        Vec3d to = boss.getPos().add(0, 1.5, 0).subtract(p.getPos());
        if (to.length() < 16) {
          if (pol == -boss.polarity() && boss.shields() == 0) {
            m.direction = to.normalize();
            m.slam = 60;
            p.addVelocity(m.direction.multiply(.8));
          } else if (pol == boss.polarity()) {
            m.direction = to.normalize().negate();
            p.addVelocity(m.direction.x * .8, .6, m.direction.z * .8);
          }
          break;
        }
      }
      for (var pos : BlockPos.iterateOutwards(p.getBlockPos(), 3, 3, 3)) {
        int magnet = magnet(p.getWorld().getBlockState(pos));
        if (magnet == pol && p.squaredDistanceTo(Vec3d.ofCenter(pos)) < 8) {
          Vec3d away = p.getPos().subtract(Vec3d.ofCenter(pos)).normalize();
          p.addVelocity(away.x * .9, .75, away.z * .9);
          m.direction = away.multiply(1, 0, 1).normalize();
          break;
        }
      }
    }
    p.velocityModified = true;
    for (var other : p.getServerWorld().getPlayers())
      if (other.squaredDistanceTo(p) < 4096) Network.sendCue(other, "roll", p.getId(), "roll");
  }

  public static int magnet(net.minecraft.block.BlockState b) {
    String n = Content.path(b);
    return n.equals("positive_magnet") ? 1 : n.equals("negative_magnet") ? -1 : 0;
  }

  private static void tick(ServerWorld w) {
    if (w.getTime() % 5 == 0) magneticDrops(w);
    for (var p : w.getPlayers()) {
      var m = motion(p);
      if (m.magnetGrace > 0) m.magnetGrace--;
      if (m.cooldown > 0) m.cooldown--;
      if (m.regen > 0) m.regen--;
      else m.stamina = Math.min(100, m.stamina + 1.2);
      if (m.slam > 0) m.slam--;
      if (m.roll > 0) {
        double t = (12 - m.roll) / 12.0, speed = .65 * Math.pow(1 - t, .7);
        Vec3d v = p.getVelocity();
        p.setVelocity(m.direction.x * speed, v.y, m.direction.z * speed);
        p.velocityModified = true;
        p.fallDistance = 0;
        m.roll--;
      }
      if (w.getTime() % 3 == 0) magnetism(w, p);
      if (w.getTime() % 5 == 0) {
        String context = "";
        var site = Vaults.at(w, p.getBlockPos());
        if (site != null) {
          if (AtlasState.get(w).escapes.containsKey(site.id())) context = "resonant_escape";
          var room = Vaults.room(site, p.getBlockPos());
          if (context.isEmpty()
              && (Vaults.inside(site, p.getBlockPos()) || room != null)
              && (room == null || !room.get("kind").getAsString().equals("spire"))) {
            context = "resonant_vault";
            if (!w.getEntitiesByClass(
                    AtlasBoss.class,
                    p.getBoundingBox().expand(100),
                    b -> b.kind().equals("titan") && !b.action().equals("death"))
                .isEmpty()) context = "boss_bell_titan";
            else if (!w.getEntitiesByClass(
                    AtlasMob.class, p.getBoundingBox().expand(30), LivingEntity::isAlive)
                .isEmpty()) context = "resonant_combat";
          }
        }
        if (!w.getEntitiesByClass(
                AtlasBoss.class,
                p.getBoundingBox().expand(140),
                b -> b.kind().equals("warden") && !b.action().equals("death"))
            .isEmpty()) context = "boss_magnetic_warden";
        if (w.getRegistryKey() == World.OVERWORLD
            && FieldMath.bloodMoon(w.getTimeOfDay(), w.getSeed())
            && w.isNight()
            && context.isEmpty()) context = "bloodmoon";
        ServerPlayNetworking.send(
            p,
            new Network.State(
                (int) m.stamina,
                m.roll,
                polarity(p),
                w.getSeed(),
                w.getRegistryKey() == World.OVERWORLD
                    && FieldMath.bloodMoon(w.getTimeOfDay(), w.getSeed())
                    && w.isNight(),
                context));
      }
    }
  }

  private static void magnetism(ServerWorld w, ServerPlayerEntity p) {
    if (p.isSpectator() || p.getAbilities().flying) return;
    int pol = polarity(p);
    boolean iron = false;
    for (var stack : p.getArmorItems())
      if (Content.path(stack.getItem()).startsWith("iron_")) iron = true;
    if (pol == 0 && !iron) return;
    Vec3d force = Vec3d.ZERO;
    boolean cling = false;
    var origin = p.getPos().add(0, .7, 0);
    for (var pos : BlockPos.iterateOutwards(p.getBlockPos(), 5, 5, 5)) {
      int magnet = magnet(w.getBlockState(pos));
      if (magnet == 0) continue;
      Vec3d d = Vec3d.ofCenter(pos).subtract(origin);
      double distance = d.length();
      if (distance < .1 || distance > 5) continue;
      boolean grace = pol != 0 && motion(p).magnetGrace > 0 && distance < 1.65;
      double relation = grace ? 1 : pol == 0 ? -magnet : pol == magnet ? -1 : 1;
      double strength =
          70
              / Math.pow(Math.max(.75, distance), 2)
              * Math.min(1, 5 - distance)
              * .0025
              * 3
              * directionality(w, pos, d.negate());
      force = force.add(d.normalize().multiply(relation * strength));
      if ((pol == -magnet || grace) && distance < 1.65 && p.horizontalCollision) cling = true;
    }
    if (force.length() > .45) force = force.normalize().multiply(.45);
    p.addVelocity(force);
    if (force.lengthSquared() > .00001 && p.getVelocity().length() > 1)
      p.setVelocity(p.getVelocity().normalize());
    if (cling) {
      double climb =
          p.isSneaking()
              ? -.12
              : motion(p).forward > 0
                  ? (Content.path(p.getEquippedStack(EquipmentSlot.FEET).getItem())
                          .startsWith("upgraded")
                      ? .2
                      : .14)
                  : 0;
      p.setVelocity(p.getVelocity().x, climb, p.getVelocity().z);
      p.fallDistance = 0;
    }
    if (force.lengthSquared() > .00001 || cling) p.velocityModified = true;
    if (pol != 0
        && Content.path(p.getEquippedStack(EquipmentSlot.FEET).getItem()).startsWith("upgraded"))
      for (var e :
          w.getEntitiesByClass(ItemEntity.class, p.getBoundingBox().expand(5), e -> true)) {
        String name = Content.path(e.getStack().getItem());
        if (isMetal(name))
          e.addVelocity(p.getPos().add(0, .5, 0).subtract(e.getPos()).normalize().multiply(.08));
      }
  }

  private static boolean isMetal(String name) {
    return name.startsWith("iron_")
        || name.equals("raw_iron")
        || name.equals("positive_magnet")
        || name.equals("negative_magnet");
  }

  private static double directionality(ServerWorld w, BlockPos pos, Vec3d towardsSample) {
    Vec3d axis = Vec3d.ZERO;
    for (var dir : Direction.values())
      if (w.getBlockState(pos.offset(dir)).isOf(net.minecraft.block.Blocks.IRON_BLOCK))
        axis = axis.add(Vec3d.of(dir.getOpposite().getVector()));
    if (axis.lengthSquared() < .00001) return 1;
    double dot = axis.normalize().dotProduct(towardsSample.normalize()),
        cone = Math.cos(Math.PI / 6);
    if (dot <= cone) return .01;
    double t = (dot - cone) / (1 - cone);
    return .01 + 3.99 * t * t * (3 - 2 * t);
  }

  private static void magneticDrops(ServerWorld w) {
    for (var entity : w.iterateEntities())
      if (entity instanceof ItemEntity item && isMetal(Content.path(item.getStack().getItem()))) {
        Vec3d force = Vec3d.ZERO;
        int response = Content.path(item.getStack().getItem()).equals("negative_magnet") ? -1 : 1;
        for (var pos : BlockPos.iterateOutwards(item.getBlockPos(), 5, 5, 5)) {
          int polarity = magnet(w.getBlockState(pos));
          if (polarity == 0) continue;
          Vec3d d = Vec3d.ofCenter(pos).subtract(item.getPos());
          double distance = d.length();
          if (distance < .1 || distance > 5) continue;
          double strength =
              70
                  / Math.pow(Math.max(.75, distance), 2)
                  * Math.min(1, 5 - distance)
                  * .0125
                  * directionality(w, pos, d.negate());
          force = force.add(d.normalize().multiply(-strength * polarity * response));
        }
        if (force.length() > .65) force = force.normalize().multiply(.65);
        if (force.lengthSquared() > .000001) {
          item.addVelocity(force);
          if (item.getVelocity().length() > .9)
            item.setVelocity(item.getVelocity().normalize().multiply(.9));
          item.velocityModified = true;
        }
      }
  }
}
