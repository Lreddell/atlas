package dev.atlas.client;

import dev.atlas.*;
import java.nio.file.*;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.MessageScreen;
import net.minecraft.client.gui.screen.TitleScreen;
import net.minecraft.client.util.ScreenshotRecorder;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.item.ItemStack;
import net.minecraft.resource.DataConfiguration;
import net.minecraft.text.Text;
import net.minecraft.util.math.*;
import net.minecraft.world.*;
import net.minecraft.world.gen.GeneratorOptions;
import net.minecraft.world.gen.WorldPresets;
import net.minecraft.world.level.LevelInfo;

/** Opt-in development-only real-client tour. Never runs in a normal installation. */
public final class ClientQa {
  private static boolean started = false;
  private static int ticks = 0, stage = 0;
  private static FieldMath.Center field;
  private static Vec3d inputStart;
  private static int directionsPassed = 0;
  private static boolean dodgePassed = false;
  private static volatile boolean lockPassed = false;
  private static volatile int meleeTarget = -1;
  private static volatile boolean windupPassed = false, meleePassed = false;
  private static boolean loopPassed = false;
  private static volatile boolean ascentPassed, mitePassed, vergeReady;
  private static int vergeStable;
  private static BlockPos vergeGoal;
  private static final boolean REGION_ONLY = Boolean.getBoolean("atlas.clientqa.region");

  public static void init() {
    if (!Boolean.getBoolean("atlas.clientqa")) return;
    ClientTickEvents.END_CLIENT_TICK.register(ClientQa::tick);
  }

  private static void tick(MinecraftClient c) {
    try {
      if (!started
          && c.currentScreen
              instanceof net.minecraft.client.gui.screen.AccessibilityOnboardingScreen) {
        c.currentScreen.close();
        return;
      }
      if (!started && c.currentScreen instanceof TitleScreen) {
        started = true;
        c.options.pauseOnLostFocus = false;
        c.options.tutorialStep = net.minecraft.client.tutorial.TutorialStep.NONE;
        c.options.getViewDistance().setValue(12);
        c.options.getSimulationDistance().setValue(5);
        c.options.getCloudRenderMode().setValue(net.minecraft.client.option.CloudRenderMode.OFF);
        c.options.getMaxFps().setValue(60);
        c.createIntegratedServerLoader()
            .createAndStart(
                "atlas-qa-" + System.currentTimeMillis(),
                new LevelInfo(
                    "Atlas visual QA",
                    GameMode.SURVIVAL,
                    false,
                    Difficulty.NORMAL,
                    true,
                    new GameRules(),
                    DataConfiguration.SAFE_MODE),
                new GeneratorOptions(42, true, false),
                WorldPresets::createDemoOptions,
                new MessageScreen(Text.literal("Atlas client verification")));
        return;
      }
      if (c.player == null || c.world == null || c.getServer() == null) return;
      ticks++;
      if (stage == 0 && ticks > 80) {
        stage = 1;
        ticks = 0;
        field = FieldMath.nearest(0, 0, 42);
        if (REGION_ONLY) {
          c.setScreen(new AtlasSettingsScreen(null));
          stage = 91;
          server(
              c,
              p -> {
                AtlasCommands.kit(p);
                p.getAbilities().invulnerable = true;
                p.sendAbilitiesUpdate();
                p.getServerWorld()
                    .getGameRules()
                    .get(GameRules.DO_MOB_SPAWNING)
                    .set(false, c.getServer());
              });
          return;
        }

        server(
            c,
            p -> {
              p.getServerWorld().setTimeOfDay(6000);
              p.getServerWorld()
                  .getGameRules()
                  .get(GameRules.DO_MOB_SPAWNING)
                  .set(false, c.getServer());
              AtlasCommands.kit(p);
              p.getAbilities().invulnerable = true;
              p.sendAbilitiesUpdate();
              p.teleport(p.getServerWorld(), field.x() + 12.5, 136, field.z() + 14.5, 140, 10);
              var b = AtlasEntities.WARDEN.create(p.getServerWorld());
              b.initializeFight(new BlockPos(field.x(), 132, field.z()), "clientqa-warden");
              b.refreshPositionAndAngles(field.x() + .5, 136, field.z() + .5, 0, 0);
              p.getServerWorld().spawnEntity(b);
            });
      } else if (stage == 1 && ticks > 240) {
        if (CameraRig.mode != CameraRig.Mode.FIRST)
          throw new IllegalStateException("Intro did not restore first person");
        CameraRig.detached = 2;
        CameraRig.detachedPosition = new Vec3d(field.x() + 68, 215, field.z() + 68);
        CameraRig.yaw = 135;
        CameraRig.pitch = 39;
        c.options.setPerspective(net.minecraft.client.option.Perspective.THIRD_PERSON_BACK);
        c.options.hudHidden = true;
        stage = 2;
        ticks = 0;
      } else if (stage == 2 && ticks > 50) {
        capture(c, "01-magnetic-fields-arena.png");
        CameraRig.detachedPosition = new Vec3d(field.x() + 9, 140, field.z() + 12);
        CameraRig.yaw = 143;
        CameraRig.pitch = 12;
        stage = 3;
        ticks = 0;
      } else if (stage == 3 && ticks > 40) {
        capture(c, "02-warden-form-one.png");
        stage = 4;
        ticks = 0;
      } else if (stage == 4) {
        damageWarden(c, 2);
        if (ticks > 300) {
          capture(c, "03-warden-aegis.png");
          stage = 5;
          ticks = 0;
        }
      } else if (stage == 5) {
        damageWarden(c, 3);
        if (ticks > 300) {
          capture(c, "04-warden-storm.png");
          stage = 6;
          ticks = 0;
          server(
              c,
              p -> {
                for (var b :
                    p.getServerWorld()
                        .getEntitiesByClass(
                            AtlasBoss.class, p.getBoundingBox().expand(180), e -> true))
                  b.discard();
                var center = Worldgen.nearestVault(0, 0, 42);
                var site = Vaults.site(p.getServerWorld(), center);
                for (var e : site.layout().getAsJsonArray("rooms")) {
                  String id = e.getAsJsonObject().get("id").getAsString();
                  if (id.startsWith("major_"))
                    AtlasState.get(p.getServerWorld()).complete(site.id() + ":" + id);
                }
                var arena =
                    site.layout().getAsJsonArray("rooms").asList().stream()
                        .map(e -> e.getAsJsonObject())
                        .filter(r -> r.get("id").getAsString().equals("arena"))
                        .findFirst()
                        .orElseThrow();
                var at = site.world(arena);
                p.teleport(
                    p.getServerWorld(), at.getX() + 9.5, at.getY() + 1, at.getZ() + 10.5, 140, 0);
                c.execute(
                    () -> {
                      CameraRig.bossId = -1;
                      CameraRig.detached = 2;
                      CameraRig.detachedPosition = Vec3d.ofCenter(at).add(16, 9, 18);
                      CameraRig.yaw = 139;
                      CameraRig.pitch = 17;
                    });
              });
        }
      } else if (stage == 6 && ticks > 220) {
        capture(c, "05-bell-titan.png");
        stage = 7;
        ticks = 0;
        server(
            c,
            p -> {
              var site = Vaults.at(p.getServerWorld(), p.getBlockPos());
              var hub =
                  site.layout().getAsJsonArray("rooms").asList().stream()
                      .map(e -> e.getAsJsonObject())
                      .filter(r -> r.get("id").getAsString().equals("hub"))
                      .findFirst()
                      .orElseThrow();
              var at = site.world(hub);
              p.teleport(p.getServerWorld(), at.getX(), at.getY() + 1, at.getZ(), 0, 0);
              c.execute(
                  () -> {
                    CameraRig.bossId = -1;
                    CameraRig.detached = 2;
                    CameraRig.detachedPosition = Vec3d.ofCenter(at).add(13, 10, 12);
                    CameraRig.yaw = 133;
                    CameraRig.pitch = 25;
                  });
            });
      } else if (stage == 7 && ticks > 130) {
        loopPassed = AtlasMusic.authoredLoopPlaying(c);
        capture(c, "06-vault-hub.png");
        stage = 8;
        ticks = 0;
        c.options.hudHidden = false;
        CameraRig.detached = 0;
        CameraRig.mode = CameraRig.Mode.FREE;
        CameraRig.seed();
      } else if (stage == 8 && ticks > 40) {
        float body = c.player.getYaw(), camera = CameraRig.yaw;
        CameraRig.mouse(200, 0);
        if (c.player.getYaw() != body || CameraRig.yaw == camera)
          throw new IllegalStateException("Independent camera orbit failed");
        CameraRig.bossId = -1;
        CameraRig.mode = CameraRig.Mode.FREE;
        CameraRig.detached = 0;
        CameraRig.yaw = 0;
        CameraRig.pitch = 15;
        server(
            c,
            p -> {
              p.teleport(p.getServerWorld(), field.x() + 50.5, 134, field.z() + .5, 0, 0);
              var site = Vaults.site(p.getServerWorld(), Worldgen.nearestVault(0, 0, 42));
              var archive =
                  site.layout().getAsJsonArray("rooms").asList().stream()
                      .map(e -> e.getAsJsonObject())
                      .filter(
                          r ->
                              r.get("kind").getAsString().equals("fractured_archive")
                                  && r.get("id").getAsString().startsWith("annex_"))
                      .findFirst()
                      .orElseThrow();
              int mask = 0;
              for (int i = 0; i < 9; i++) {
                var at = Vaults.harmonicCell(site, archive, i);
                p.getServerWorld().getChunk(at);
                if (p.getServerWorld().getBlockState(at).get(AtlasBlock.ACTIVE)) mask |= 1 << i;
              }
              int presses = HarmonicLock.solve(mask);
              for (int i = 0; i < 9; i++)
                if ((presses & (1 << i)) != 0)
                  Vaults.use(
                      p.getServerWorld(),
                      Vaults.harmonicCell(site, archive, i),
                      p,
                      "resonance_pylon");
              lockPassed =
                  AtlasState.get(p.getServerWorld())
                      .completed
                      .contains(site.id() + ":" + archive.get("id").getAsString());
            });
        stage = 80;
        ticks = 0;
      } else if (stage == 80 && ticks > 50) {
        stage = 81;
        ticks = 0;
      } else if (stage == 81) {
        int index = (ticks - 1) / 20, step = (ticks - 1) % 20;
        int[][] directions = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {-1, -1}, {1, -1}, {-1, 1}};
        if (index >= 8) {
          release(c);
          net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking.send(
              new Network.Control(0, 0, 1, 0));
          stage = 82;
          ticks = 0;
        } else {
          int f = directions[index][0], s = directions[index][1];
          if (step == 0) {
            inputStart = c.player.getPos();
            c.options.forwardKey.setPressed(f > 0);
            c.options.backKey.setPressed(f < 0);
            c.options.leftKey.setPressed(s > 0);
            c.options.rightKey.setPressed(s < 0);
            c.options.sprintKey.setPressed(true);
          }
          if (step == 9) {
            if (c.player.getPos().squaredDistanceTo(inputStart) < .2
                || Math.abs(CameraRig.yaw) > .01
                || !c.player.isSprinting())
              throw new IllegalStateException(
                  "Free camera movement / omnidirectional sprint failed in direction " + index);
            directionsPassed++;
            release(c);
          }
        }
      } else if (stage == 82) {
        if (AtlasClient.stamina < 100 && AtlasClient.roll > 0) dodgePassed = true;
        if (ticks > 30) {
          if (!dodgePassed || !lockPassed || directionsPassed != 8)
            throw new IllegalStateException("Input / harmonic puzzle verification failed");
          stage = 83;
          ticks = 0;
          server(
              c,
              p -> {
                p.getServerWorld().setTimeOfDay(18000);
                p.teleport(p.getServerWorld(), field.x() + 50.5, 134, field.z() + .5, 0, 0);
                p.equipStack(
                    EquipmentSlot.MAINHAND, new ItemStack(net.minecraft.item.Items.IRON_SWORD));
                var target = net.minecraft.entity.EntityType.ZOMBIE.create(p.getServerWorld());
                target.setAiDisabled(true);
                target.setNoGravity(true);
                target.refreshPositionAndAngles(p.getX(), p.getY(), p.getZ() + 2.7, 180, 0);
                p.getServerWorld().spawnEntity(target);
                meleeTarget = target.getId();
              });
        }
      } else if (stage == 83 && ticks > 30 && c.world.getEntityById(meleeTarget) != null) {
        c.crosshairTarget =
            new net.minecraft.util.hit.EntityHitResult(c.world.getEntityById(meleeTarget));
        CameraRig.yaw = 0;
        CameraRig.pitch = 0;
        if (!ClientCombat.begin()) throw new IllegalStateException("Melee packet was not sent");
        stage = 84;
        ticks = 0;
      } else if (stage == 84) {
        if (ticks == 2)
          server(
              c,
              p -> {
                var e =
                    (net.minecraft.entity.LivingEntity)
                        p.getServerWorld().getEntityById(meleeTarget);
                windupPassed = e != null && e.getHealth() == 20;
              });
        if (ticks == 16)
          server(
              c,
              p -> {
                var e =
                    (net.minecraft.entity.LivingEntity)
                        p.getServerWorld().getEntityById(meleeTarget);
                meleePassed = e != null && e.getHealth() < 20;
                if (e != null) e.discard();
              });
        if (ticks > 35) {
          if (!windupPassed || !meleePassed || !loopPassed)
            throw new IllegalStateException("Timed melee or native authored music loop failed");
          server(
              c,
              p -> {
                p.getServerWorld().setWeather(0, 6000, false, false);
                String command =
                    "fillbiome "
                        + (p.getBlockX() - 8)
                        + " 128 "
                        + (p.getBlockZ() - 8)
                        + " "
                        + (p.getBlockX() + 8)
                        + " 156 "
                        + (p.getBlockZ() + 8)
                        + " minecraft:snowy_taiga";
                p.getServer()
                    .getCommandManager()
                    .executeWithPrefix(p.getServer().getCommandSource().withLevel(4), command);
              });
          c.options.hudHidden = true;
          CameraRig.detached = 2;
          CameraRig.detachedPosition = c.player.getEyePos().add(-8, 6, -8);
          CameraRig.yaw = 0;
          CameraRig.pitch = -32;
          stage = 85;
          ticks = 0;
        }
      } else if (stage == 85 && ticks > 90) {
        if (AtlasSky.renderedRibbons == 0)
          throw new IllegalStateException(
              "Aurora rendering path did not execute: biome="
                  + c.world.getBiome(c.player.getBlockPos()).getKey()
                  + ", time="
                  + c.world.getTimeOfDay()
                  + ", rain="
                  + c.world.getRainGradient(1)
                  + ", night="
                  + c.world.isNight()
                  + ", blood="
                  + AtlasClient.bloodMoon);
        capture(c, "08-aurora.png");
        server(
            c,
            p -> {
              for (int day = 1; day < 10000; day++)
                if (FieldMath.bloodMoon(day * 24000L + 18000, 42)) {
                  p.getServerWorld().setTimeOfDay(day * 24000L + 18000);
                  break;
                }
            });
        CameraRig.pitch = -75;
        stage = 86;
        ticks = 0;
      } else if (stage == 86 && ticks > 60) {
        if (!AtlasClient.bloodMoon)
          throw new IllegalStateException("Blood moon state did not reach client");
        capture(c, "09-blood-moon.png");
        c.options.hudHidden = false;
        CameraRig.detached = 0;
        c.setScreen(new FieldJournalScreen());
        stage = 9;
        ticks = 0;
      } else if (stage == 9 && ticks > 40) {
        capture(c, "10-field-journal.png");
        c.setScreen(new AtlasSettingsScreen(null));
        stage = 91;
        ticks = 0;
      } else if (stage == 91 && ticks > 40) {
        capture(c, "07-settings.png");
        c.setScreen(null);
        server(
            c,
            p -> {
              var site = MeridianFoundry.site(field, 42);
              p.getServerWorld().setTimeOfDay(6000);
              p.teleport(
                  p.getServerWorld(),
                  site.origin().getX() + .5,
                  site.origin().getY() + 1,
                  site.origin().getZ() + 8.5,
                  180,
                  0);
            });
        var site = MeridianFoundry.site(field, 42);
        CameraRig.detached = 2;
        CameraRig.detachedPosition = Vec3d.of(site.at(4, 6, 9));
        CameraRig.yaw = 156;
        CameraRig.pitch = 22;
        c.options.hudHidden = true;
        stage = 92;
        ticks = 0;
      } else if (stage == 92 && ticks > 80) {
        capture(c, "11-foundry-workshops.png");
        var site = MeridianFoundry.site(field, 42);
        CameraRig.detachedPosition = Vec3d.of(site.at(-20, 5, 4));
        CameraRig.yaw = 180;
        CameraRig.pitch = 35;
        stage = 93;
        ticks = 0;
      } else if (stage == 93 && ticks > 45) {
        capture(c, "12-foundry-separation.png");
        server(
            c,
            p -> {
              var site = MeridianFoundry.site(field, 42);
              p.teleport(
                  p.getServerWorld(),
                  site.origin().getX() + 21.5,
                  site.origin().getY() + 9.1,
                  site.origin().getZ() - 1.5,
                  90,
                  0);
            });
        stage = 94;
        ticks = 0;
      } else if (stage == 94 && ticks > 35) {
        server(
            c,
            p -> {
              var site = MeridianFoundry.site(field, 42);
              ascentPassed =
                  AtlasState.get(p.getServerWorld()).completed.contains(site.id() + ":climb");
              p.teleport(
                  p.getServerWorld(),
                  site.origin().getX() + 17.5,
                  site.origin().getY() + 1,
                  site.origin().getZ() + 9.5,
                  180,
                  0);
              var mite = AtlasEntities.MITE.create(p.getServerWorld());
              mite.refreshPositionAndAngles(Vec3d.of(site.at(17, 1, 7)).add(.5, 0, .5), 0, 0);
              mite.setAiDisabled(true);
              mite.setPersistent();
              p.getServerWorld().spawnEntity(mite);
              p.setStackInHand(
                  net.minecraft.util.Hand.MAIN_HAND,
                  new ItemStack(net.minecraft.item.Items.IRON_NUGGET, 2));
              int before = mite.polarity();
              mite.interact(p, net.minecraft.util.Hand.MAIN_HAND);
              var nbt = new net.minecraft.nbt.NbtCompound();
              mite.writeCustomDataToNbt(nbt);
              var restored = AtlasEntities.MITE.create(p.getServerWorld());
              restored.readCustomDataFromNbt(nbt);
              mitePassed =
                  mite.polarity() == -before
                      && restored.polarity() == mite.polarity()
                      && p.getMainHandStack().getCount() == 1;
              mite.interact(p, net.minecraft.util.Hand.MAIN_HAND);
              mitePassed &= p.getMainHandStack().getCount() == 1;
              restored.discard();
            });
        var site = MeridianFoundry.site(field, 42);
        CameraRig.detachedPosition = Vec3d.of(site.at(19, 2, 9)).add(.2, .2, .2);
        CameraRig.yaw = 135;
        CameraRig.pitch = 18;
        stage = 95;
        ticks = 0;
      } else if (stage == 95 && ticks > 45) {
        if (!ascentPassed || !mitePassed)
          throw new IllegalStateException(
              "Foundry pressure plate or mite interaction/persistence failed");
        capture(c, "13-lodestone-mite.png");
        var site = MeridianFoundry.site(field, 42);
        server(
            c,
            p ->
                p.teleport(
                    p.getServerWorld(),
                    site.origin().getX() + .5,
                    site.origin().getY() + 22,
                    site.origin().getZ() + 33.5,
                    180,
                    20));
        CameraRig.detachedPosition = Vec3d.of(site.at(16, 25, 37));
        CameraRig.yaw = 153;
        CameraRig.pitch = 26;
        stage = 96;
        ticks = 0;
      } else if (stage == 96 && ticks > 65) {
        capture(c, "14-foundry-entrance.png");
        BlockPos verge = null;
        for (int dx = -380; dx <= 380 && verge == null; dx += 12)
          for (int dz = -380; dz <= 380; dz += 12) {
            var column = FieldMath.column(field.x() + dx, field.z() + dz, 42);
            if (column != null
                && column.tier() == 1
                && MeridianBiomes.at(field.x() + dx, field.z() + dz, 42) == MeridianBiomes.VERGE) {
              verge = new BlockPos(field.x() + dx, column.height() + 1, field.z() + dz);
              break;
            }
          }
        if (verge == null) throw new IllegalStateException("No Ironwind Verge around QA field");
        var goal = verge;
        vergeGoal = goal;
        vergeReady = false;
        vergeStable = 0;
        server(
            c,
            p -> {
              var w = p.getServerWorld();
              w.getChunk(goal);
              int y = w.getTopY(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, goal.getX(), goal.getZ());
              p.teleport(w, goal.getX() + .5, y + 1, goal.getZ() + .5, -60, 12);
              Atlas.LOGGER.info(
                  "Verge arrival pos={} biome={} surfaceY={}",
                  p.getPos(),
                  w.getBiome(p.getBlockPos()).getKey(),
                  y);
              vergeReady = true;
            });
        CameraRig.detached = 0;
        CameraRig.mode = CameraRig.Mode.FIRST;
        c.options.setPerspective(net.minecraft.client.option.Perspective.FIRST_PERSON);
        stage = 97;
        ticks = 0;
      } else if (stage == 97) {
        boolean arrived =
            vergeReady
                && Math.abs(c.player.getX() - vergeGoal.getX()) < 8
                && Math.abs(c.player.getZ() - vergeGoal.getZ()) < 8
                && c.world.getBiome(c.player.getBlockPos()).matchesKey(MeridianBiomes.VERGE)
                && c.player.getY() > 60;
        vergeStable = arrived ? vergeStable + 1 : 0;
        if (ticks > 1200)
          throw new IllegalStateException(
              "Verge timeout: ready="
                  + vergeReady
                  + " pos="
                  + c.player.getPos()
                  + " goal="
                  + vergeGoal
                  + " biome="
                  + c.world.getBiome(c.player.getBlockPos()).getKey());
        if (vergeStable < 80) return;
        capture(c, "15-ironwind-verge.png");
        Files.createDirectories(Path.of("logs"));
        Files.writeString(
            Path.of(REGION_ONLY ? "logs/atlas-regionalqa.json" : "logs/atlas-clientqa.json"),
            REGION_ONLY
                ? "{\"success\":true,\"mode\":\"region-only\",\"foundryAscent\":true,\"miteFeedingAndPersistence\":true,\"vergeLoaded\":true,\"screenshots\":6}"
                : "{\"success\":true,\"screenshots\":15,\"firstPersonRestored\":true,\"cameraOrbit\":true,\"eightWaySprint\":true,\"dodgePacket\":true,\"harmonicPuzzle\":true,\"timedMelee\":true,\"authoredLoopPlaying\":true,\"aurora\":true,\"bloodMoon\":true,\"fieldJournal\":true,\"foundryAscent\":true,\"miteFeedingAndPersistence\":true,\"note\":\"Automated"
                      + " client tour; manual game-feel assessment remains separate\"}");
        stage = 10;
        ticks = 0;
        Atlas.LOGGER.info("ATLAS_CLIENT_QA_SUCCESS");
      } else if (stage == 10 && ticks > 40) c.scheduleStop();
    } catch (Throwable e) {
      Atlas.LOGGER.error("ATLAS_CLIENT_QA_FAILURE", e);
      stage = 99;
      try {
        Files.createDirectories(Path.of("logs"));
        Files.writeString(
            Path.of(REGION_ONLY ? "logs/atlas-regionalqa.json" : "logs/atlas-clientqa.json"),
            "{\"success\":false,\"failure\":"
                + new com.google.gson.Gson().toJson(e.toString())
                + "}");
      } catch (Exception ignored) {
      }
      c.scheduleStop();
    }
  }

  private static void server(
      MinecraftClient c,
      java.util.function.Consumer<net.minecraft.server.network.ServerPlayerEntity> action) {
    var id = c.player.getUuid();
    c.getServer()
        .execute(
            () -> {
              var p = c.getServer().getPlayerManager().getPlayer(id);
              if (p != null) action.accept(p);
            });
  }

  private static void release(MinecraftClient c) {
    c.options.forwardKey.setPressed(false);
    c.options.backKey.setPressed(false);
    c.options.leftKey.setPressed(false);
    c.options.rightKey.setPressed(false);
    c.options.sprintKey.setPressed(false);
  }

  private static void damageWarden(MinecraftClient c, int phase) {
    if (ticks % 8 != 0) return;
    server(
        c,
        p -> {
          for (var b :
              p.getServerWorld()
                  .getEntitiesByClass(
                      AtlasBoss.class,
                      p.getBoundingBox().expand(180),
                      e -> e.kind().equals("warden"))) {
            if (b.phase() >= phase) return;
            for (int i = 0; i < 4; i++) b.crystalBroken(b.tower(i));
            p.equipStack(EquipmentSlot.FEET, ItemStack.EMPTY);
            b.damage(p.getServerWorld().getDamageSources().playerAttack(p), 30);
          }
        });
  }

  private static void capture(MinecraftClient c, String name) {
    ScreenshotRecorder.saveScreenshot(
        c.runDirectory,
        name,
        c.getFramebuffer(),
        message -> Atlas.LOGGER.info("QA screenshot: {}", message.getString()));
  }
}
