package dev.atlas;

import com.google.gson.*;
import java.util.*;
import net.minecraft.block.Blocks;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.decoration.DisplayEntity;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.math.*;
import org.joml.Quaternionf;
import org.joml.Vector3f;

public final class VaultHazards {
  private static final Map<String, DisplayEntity.BlockDisplayEntity> DISPLAYS = new HashMap<>();
  private static final Map<String, String> PHASES = new HashMap<>();

  public static void reset() {
    DISPLAYS.clear();
    PHASES.clear();
  }

  private static Vec3d world(Vaults.Site s, double x, double y, double z) {
    return switch (s.rotation()) {
      case 1 -> new Vec3d(s.center().getX() - z, y + s.dy(), s.center().getZ() + x);
      case 2 -> new Vec3d(s.center().getX() - x, y + s.dy(), s.center().getZ() - z);
      case 3 -> new Vec3d(s.center().getX() + z, y + s.dy(), s.center().getZ() - x);
      default -> new Vec3d(s.center().getX() + x, y + s.dy(), s.center().getZ() + z);
    };
  }

  public static void tick(ServerWorld w, Vaults.Site s, ServerPlayerEntity player, long end) {
    long now = w.getTime();
    int left = (int) Math.max(0, (end - now) / 20),
        tier = left <= 30 ? 3 : left <= 90 ? 2 : left <= 180 ? 1 : 0;
    var state = AtlasState.get(w);
    double elapsed = Math.max(0, (8400 - (end - now)) / 20.0);
    for (String route : List.of("grand", "fracture")) {
      var descriptor = s.layout().getAsJsonObject("escapeRoutes").getAsJsonObject(route);
      var landing = s.world(descriptor.getAsJsonObject("surfaceLanding"));
      for (var room : s.layout().getAsJsonArray("rooms")) {
        var r = room.getAsJsonObject();
        if (r.get("kind").getAsString().equals("outlet_" + route)) {
          landing = s.world(r);
          break;
        }
      }
      int surface = Vaults.nativeSurface(w, landing.getX(), landing.getZ());
      if (Math.abs(player.getX() - landing.getX()) < 8
          && Math.abs(player.getZ() - landing.getZ()) < 8
          && player.getY() >= surface + 1
          && w.isSkyVisible(player.getBlockPos())) {
        state.complete(s.id() + ":escaped");
        state.escapes.remove(s.id());
        state.markDirty();
        player.giveItemStack(
            new net.minecraft.item.ItemStack(Content.item("echo_core"), left > 0 ? 4 : 1));
        Vaults.sound(w, player.getBlockPos(), "escape_complete");
        player.sendMessage(
            Text.literal(
                left > 0
                    ? "The vault releases you with its intact echoes."
                    : "You escape with a fractured echo."),
            false);
        return;
      }
      var checkpoints = descriptor.getAsJsonArray("checkpoints");
      String ck = s.id() + ":checkpoint:" + route + ":" + player.getUuid();
      int checkpoint = state.puzzles.getOrDefault(ck, -1);
      for (int i = checkpoint + 1; i < checkpoints.size(); i++) {
        var pos = s.world(checkpoints.get(i).getAsJsonObject());
        if (player.getPos().squaredDistanceTo(Vec3d.ofCenter(pos)) < 16) {
          checkpoint = i;
          state.puzzle(ck, i);
          Vaults.sound(w, pos, "resonator_pulse_1");
        }
      }
      var path = descriptor.getAsJsonArray("path");
      JsonObject closest = null;
      double distance = Double.MAX_VALUE;
      for (var e : path) {
        var p = e.getAsJsonObject();
        var pos = s.world(p);
        double d =
            Math.pow(player.getX() - pos.getX(), 2) + Math.pow(player.getZ() - pos.getZ(), 2);
        if (d < distance) {
          distance = d;
          closest = p;
        }
      }
      if (closest != null && distance < 36 && player.getY() < s.world(closest).getY() - 5) {
        var recover =
            checkpoint >= 0
                ? s.world(checkpoints.get(checkpoint).getAsJsonObject())
                : s.world(path.get(0).getAsJsonObject());
        player.teleport(
            w, recover.getX() + .5, recover.getY() + 1, recover.getZ() + .5, player.getYaw(), 0);
        player.fallDistance = 0;
      }
    }
    for (var value : s.layout().getAsJsonArray("hazards")) {
      var d = value.getAsJsonObject();
      Vec3d center =
          world(s, d.get("x").getAsDouble(), d.get("y").getAsDouble(), d.get("z").getAsDouble());
      if (player.getPos().squaredDistanceTo(center) > 45 * 45) continue;
      var sample = HazardMath.sample(d, elapsed, tier);
      String id = s.id() + ":" + d.get("id").getAsString(), kind = d.get("kind").getAsString();
      if (!sample.phase().equals(PHASES.put(id, sample.phase()))) {
        if (sample.phase().equals("telegraph"))
          Vaults.sound(w, BlockPos.ofFloored(center), "phase_shift");
        if (sample.phase().equals("active") && kind.equals("crusher"))
          Vaults.sound(w, BlockPos.ofFloored(center), "titan_slam");
      }
      if (kind.equals("gap") || kind.equals("collapse")) {
        for (var cell : d.getAsJsonArray("cells")) {
          var p = s.world(cell.getAsJsonObject());
          if (w.isChunkLoaded(p))
            w.setBlockState(
                p,
                sample.solid()
                    ? Content.block("phase_block").getDefaultState().with(AtlasBlock.ACTIVE, true)
                    : Blocks.AIR.getDefaultState());
        }
      }
      if (kind.equals("crusher") && now % 2 == 0)
        display(
            w,
            id,
            center.add(0, sample.headY() - d.get("y").getAsDouble(), 0),
            ((d.get("forwardX").getAsInt() != 0) ^ (s.rotation() % 2 != 0))
                ? d.get("length").getAsFloat()
                : d.get("width").getAsFloat(),
            1,
            ((d.get("forwardX").getAsInt() != 0) ^ (s.rotation() % 2 != 0))
                ? d.get("width").getAsFloat()
                : d.get("length").getAsFloat(),
            "chiseled_echo_stone");
      if (kind.equals("spikes") && now % 2 == 0)
        for (int i = 0; i < 10; i++) {
          double across = -2.3 + (i % 5) * 1.15, along = (i / 5 - .5) * 1.8;
          Vec3d p =
              world(
                  s,
                  d.get("x").getAsDouble()
                      + d.get("rightX").getAsInt() * across
                      + d.get("forwardX").getAsInt() * along,
                  d.get("y").getAsDouble(),
                  d.get("z").getAsDouble()
                      + d.get("rightZ").getAsInt() * across
                      + d.get("forwardZ").getAsInt() * along);
          display(w, id + ":" + i, p, .7f, (float) sample.collision(), .7f, "echo_spikes");
        }
      var local = s.local(player.getBlockPos());
      double dx = local.getX() + .5 - d.get("x").getAsDouble(),
          dz = local.getZ() + .5 - d.get("z").getAsDouble(),
          along = Math.abs(dx * d.get("forwardX").getAsInt() + dz * d.get("forwardZ").getAsInt()),
          across = Math.abs(dx * d.get("rightX").getAsInt() + dz * d.get("rightZ").getAsInt());
      if (along < d.get("length").getAsDouble() * .5 + .35
          && across < d.get("width").getAsDouble() * .5 + .35) {
        double y = player.getY() - s.dy();
        if (kind.equals("spikes")
                && sample.collision() > .65
                && y < d.get("y").getAsDouble() + sample.collision()
            || kind.equals("crusher")
                && sample.phase().equals("active")
                && y < sample.headY() + 1.05
                && y + 1.8 > sample.headY())
          player.damage(w.getDamageSources().magic(), d.get("damage").getAsFloat());
      }
      if (sample.phase().equals("telegraph") && now % 4 == 0)
        w.spawnParticles(
            ParticleTypes.END_ROD, center.x, center.y + .25, center.z, 5, 2, .1, 1, .005);
    }
    if (now % 20 == 0)
      player.sendMessage(
          Text.literal(
              "VAULT ESCAPE · "
                  + left
                  + "s · Choose the guarded ascent or the shorter fractured stair"),
          true);
  }

  private static void display(
      ServerWorld w, String id, Vec3d p, float x, float y, float z, String block) {
    var entity = DISPLAYS.get(id);
    if (entity == null || entity.isRemoved()) {
      String tag = "atlas:hazard:" + id;
      var existing =
          w.getEntitiesByClass(
              DisplayEntity.BlockDisplayEntity.class,
              new Box(p, p).expand(12),
              e -> e.getCommandTags().contains(tag));
      entity = existing.isEmpty() ? EntityType.BLOCK_DISPLAY.create(w) : existing.get(0);
      entity.addCommandTag(tag);
      entity.setBlockState(Content.block(block).getDefaultState());
      entity.setInterpolationDuration(4);
      entity.setTeleportDuration(4);
      entity.setDisplayWidth(Math.max(x, z) + 2);
      entity.setDisplayHeight(8);
      entity.setInvulnerable(true);
      entity.setPosition(p);
      if (existing.isEmpty()) w.spawnEntity(entity);
      DISPLAYS.put(id, entity);
    }
    entity.setStartInterpolation(0);
    entity.setTransformation(
        new AffineTransformation(
            new Vector3f(-x / 2, 0, -z / 2),
            new Quaternionf(),
            new Vector3f(x, Math.max(.01f, y), z),
            new Quaternionf()));
    entity.setPosition(p);
  }
}
