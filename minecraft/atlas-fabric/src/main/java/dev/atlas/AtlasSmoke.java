package dev.atlas;

import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import net.fabricmc.fabric.api.event.lifecycle.v1.*;
import net.minecraft.registry.*;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.*;

public final class AtlasSmoke {
  private static ServerWorld world;
  private static final ArrayDeque<BlockPos> QUEUE = new ArrayDeque<>();
  private static FieldMath.Center field;
  private static Vaults.Site vault;
  private static final JsonArray checks = new JsonArray();
  private static boolean running = false;
  private static AtlasBoss resetProbe;
  private static int resetTicks;
  private static boolean forcedBefore;

  public static void init() {
    ServerLifecycleEvents.SERVER_STARTED.register(
        server -> {
          if (Boolean.getBoolean("atlas.smoke")) start(server.getOverworld());
        });
    ServerTickEvents.END_SERVER_TICK.register(
        server -> {
          if (!running) return;
          try {
            for (int i = 0; i < 2 && !QUEUE.isEmpty(); i++) {
              var p = QUEUE.remove();
              world.getChunk(p.getX() >> 4, p.getZ() >> 4);
            }
            if (QUEUE.isEmpty()) {
              if (resetProbe == null) finish();
              else {
                FoundryProbe.step();
                if (++resetTicks < 310 || !FoundryProbe.done) return;
                check("foundry physical sorting, rail transit and shared seal", FoundryProbe.done);
                check(
                    "abandoned encounter removes boss after intro and 10s retreat",
                    resetProbe.isRemoved());
                for (int i = 0; i < 4; i++) {
                  var s = world.getBlockState(resetProbe.tower(i));
                  check(
                      "reset disables crystal " + i,
                      !s.isOf(Content.block("magnetic_shield_crystal"))
                          || !s.get(AtlasBlock.ACTIVE));
                }
                world.setChunkForced(field.x() >> 4, field.z() >> 4, forcedBefore);
                write(true);
                running = false;
                Atlas.LOGGER.info("ATLAS_SMOKE_SUCCESS: {} live checks", checks.size());
                if (Boolean.getBoolean("atlas.smoke.exit")) server.stop(false);
              }
            }
          } catch (Throwable e) {
            FoundryProbe.cleanup();
            Atlas.LOGGER.error("ATLAS_SMOKE_FAILURE", e);
            var failure = new JsonObject();
            failure.addProperty("failure", e.toString());
            checks.add(failure);
            write(false);
            running = false;
            if (Boolean.getBoolean("atlas.smoke.exit")) server.stop(false);
          }
        });
  }

  public static void start(ServerWorld w) {
    if (running) return;
    world = w;
    running = true;
    checks.asList().clear();
    resetProbe = null;
    resetTicks = 0;
    field = FieldMath.nearest(0, 0, w.getSeed());
    for (int cx = (field.x() - 80) >> 4; cx <= (field.x() + 80) >> 4; cx++)
      for (int cz = (field.z() - 80) >> 4; cz <= (field.z() + 80) >> 4; cz++)
        QUEUE.add(new BlockPos(cx * 16, 132, cz * 16));
    var center = Worldgen.nearestVault(0, 0, w.getSeed());
    vault = Vaults.site(w, center);
    for (var e : vault.layout().getAsJsonArray("rooms")) {
      var p = vault.world(e.getAsJsonObject());
      for (int x = -1; x <= 1; x++)
        for (int z = -1; z <= 1; z++) QUEUE.add(p.add(x * 16, 0, z * 16));
    }
    Atlas.LOGGER.info("Atlas smoke: loading {} source-derived field/vault chunks", QUEUE.size());
  }

  private static void check(String name, boolean ok) {
    var o = new JsonObject();
    o.addProperty("check", name);
    o.addProperty("pass", ok);
    checks.add(o);
    if (!ok) throw new IllegalStateException(name);
  }

  private static void finish() {
    check("67 source items plus relay and ferric reed registered", Content.ITEMS.size() == 69);
    for (var d : Content.DEFINITIONS.values()) {
      var id = net.minecraft.util.Identifier.of(d.get("mc").getAsString());
      check(
          "content mapping " + id,
          Registries.ITEM.containsId(id) || Registries.BLOCK.containsId(id));
    }
    check(
        "all 23 music events registered",
        Content.SOUNDS.keySet().stream()
                .filter(k -> k.startsWith("music.") && !k.endsWith(".loop"))
                .count()
            == 23);
    check(
        "arena summoner matches Atlas",
        world.getBlockState(new BlockPos(field.x(), 136, field.z())).getBlock()
            == Content.block("magnetic_boss_summoner"));
    check(
        "magnetic biome assigned",
        world.getBiome(new BlockPos(field.x(), 132, field.z())).matchesKey(Worldgen.FIELDS));
    var boss = AtlasEntities.WARDEN.create(world);
    boss.initializeFight(new BlockPos(field.x(), 132, field.z()), "smoke");
    check(
        "warden initialized with original shield", boss.shields() == 1 && boss.getHealth() == 400);
    boss.refreshPositionAndAngles(field.x() + .5, 136, field.z() + .5, 0, 0);
    check("warden spawn accepted by world", world.spawnEntity(boss));
    boss.discard();
    var titan = AtlasEntities.TITAN.create(world);
    titan.initializeFight(vault.world(0, 4, -76), "smoke-titan");
    check("titan starts awakening", titan.action().equals("awaken") && titan.getHealth() == 390);
    titan.discard();
    for (var type :
        List.of(
            AtlasEntities.GUARD,
            AtlasEntities.MARKSMAN,
            AtlasEntities.HOUND,
            AtlasEntities.TOLLKEEPER)) {
      var e = type.create(world);
      check(
          "enemy " + Registries.ENTITY_TYPE.getId(type).getPath() + " has source health",
          e.getHealth() > 20);
      e.discard();
    }
    for (var e : vault.layout().getAsJsonArray("caches")) {
      var p = vault.world(e.getAsJsonObject());
      world.getChunk(p);
      check(
          "vault cache " + e.getAsJsonObject().get("id").getAsString(),
          world.getBlockEntity(p) instanceof net.minecraft.block.entity.ChestBlockEntity chest
              && !chest.isEmpty());
    }
    var state = AtlasState.get(world);
    for (var e : vault.layout().getAsJsonArray("rooms")) {
      var r = e.getAsJsonObject();
      String kind = r.get("kind").getAsString();
      if (!kind.startsWith("outlet_")) continue;
      var at = vault.world(r);
      int top = Math.max(at.getY(), Vaults.nativeSurface(world, at.getX(), at.getZ()));
      var door =
          vault.world(r.get("x").getAsInt(), top - vault.dy() + 1, r.get("z").getAsInt() - 4);
      check(
          kind + " has open surface doorway",
          world.getBlockState(door).isAir() && !world.getBlockState(door.down()).isAir());
      check(kind + " opens to the sky", world.isSkyVisible(door));
    }
    if (Boolean.getBoolean("atlas.smoke.reload"))
      check(
          "progress loaded from disk", state.puzzles.getOrDefault("smoke_disk_roundtrip", 0) == 7);
    state.puzzle("smoke_disk_roundtrip", 7);
    state.puzzle("smoke_roundtrip", 7);
    var n = state.writeNbt(new net.minecraft.nbt.NbtCompound(), world.getRegistryManager());
    check("progress serializes", n.getCompound("puzzles").getInt("smoke_roundtrip") == 7);
    state.puzzles.remove("smoke_roundtrip");
    state.markDirty();
    var relayAt = new BlockPos(field.x() + 60, 205, field.z() + 60);
    var previous = world.getBlockState(relayAt);
    var previousPower = world.getBlockState(relayAt.east());
    world.setBlockState(relayAt, Content.block("induction_relay").getDefaultState());
    check(
        "unpowered induction relay has no field",
        PlayerMechanics.magnet(world.getBlockState(relayAt)) == 0);
    world.setBlockState(
        relayAt.east(), net.minecraft.block.Blocks.REDSTONE_BLOCK.getDefaultState());
    check(
        "redstone powers positive relay",
        PlayerMechanics.magnet(world.getBlockState(relayAt)) == 1);
    world.setBlockState(relayAt, world.getBlockState(relayAt).with(AtlasBlock.TONE, 1));
    check(
        "negative relay reverses shared field",
        PlayerMechanics.magnet(world.getBlockState(relayAt)) == -1);
    world.setBlockState(relayAt.east(), previousPower);
    check(
        "relay loses field when power removed",
        PlayerMechanics.magnet(world.getBlockState(relayAt)) == 0);
    world.setBlockState(relayAt, previous);
    if (!Boolean.getBoolean("atlas.smoke")) {
      write(true);
      running = false;
      return;
    }
    if (Boolean.getBoolean("atlas.smoke.reload"))
      check(
          "foundry archive milestone loaded from disk",
          state.completed.contains(MeridianFoundry.site(field, world.getSeed()).id() + ":open"));
    var growAt = new BlockPos(field.x() + 60, 205, field.z() + 60);
    var saved = new java.util.HashMap<BlockPos, net.minecraft.block.BlockState>();
    for (int dx = -1; dx <= 1; dx++)
      for (int dz = -1; dz <= 1; dz++) {
        var q = growAt.add(dx, 0, dz);
        saved.put(q, world.getBlockState(q));
        saved.put(q.down(), world.getBlockState(q.down()));
        world.setBlockState(q.down(), net.minecraft.block.Blocks.MOSS_BLOCK.getDefaultState());
        world.setBlockState(q, net.minecraft.block.Blocks.AIR.getDefaultState());
      }
    var reed = (FerricReedBlock) Content.block("ferric_reed");
    world.setBlockState(growAt, reed.getDefaultState());
    check(
        "ferric reed accepts native bone meal growth",
        reed.isFertilizable(world, growAt, reed.getDefaultState()));
    reed.grow(world, world.random, growAt, reed.getDefaultState());
    check(
        "ferric reed cultivation creates two nearby plants",
        saved.keySet().stream().filter(q -> world.getBlockState(q).isOf(reed)).count() == 3);
    saved.forEach(world::setBlockState);
    FoundryProbe.start(world, field);
    forcedBefore =
        world
            .getForcedChunks()
            .contains(net.minecraft.util.math.ChunkPos.toLong(field.x() >> 4, field.z() >> 4));
    world.setChunkForced(field.x() >> 4, field.z() >> 4, true);
    resetProbe = AtlasEntities.WARDEN.create(world);
    resetProbe.initializeFight(new BlockPos(field.x(), 132, field.z()), "smoke-reset");
    resetProbe.refreshPositionAndAngles(field.x() + .5, 136, field.z() + .5, 0, 0);
    world.spawnEntity(resetProbe);
  }

  private static void write(boolean success) {
    var report = new JsonObject();
    report.addProperty("success", success);
    report.addProperty("source", "d7444cb6a56b984a1d9a71e6362419d5d6653fed");
    report.addProperty("seed", world.getSeed());
    report.addProperty("field", field.toString());
    report.addProperty("vault", vault.id());
    report.add("checks", checks);
    try {
      Files.createDirectories(Path.of("logs"));
      Files.writeString(
          Path.of("logs/atlas-smoke.json"),
          new GsonBuilder().setPrettyPrinting().create().toJson(report));
    } catch (Exception e) {
      Atlas.LOGGER.error("Writing smoke report", e);
    }
  }
}
