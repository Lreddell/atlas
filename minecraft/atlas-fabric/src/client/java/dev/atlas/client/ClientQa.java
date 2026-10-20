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
          CameraRig.detachedPosition = c.player.getEyePos();
          CameraRig.yaw = 0;
          CameraRig.pitch = -32;
          stage = 85;
          ticks = 0;
        }
      } else if (stage == 85 && ticks > 90) {
        if (AtlasSky.renderedRibbons == 0)
          throw new IllegalStateException("Aurora rendering path did not execute");
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
        c.setScreen(new AtlasSettingsScreen(null));
        stage = 9;
        ticks = 0;
      } else if (stage == 9 && ticks > 40) {
        capture(c, "07-settings.png");
        Files.createDirectories(Path.of("logs"));
        Files.writeString(
            Path.of("logs/atlas-clientqa.json"),
            "{\"success\":true,\"screenshots\":9,\"cameraOrbit\":true,\"eightWaySprint\":true,\"dodgePacket\":true,\"harmonicPuzzle\":true,\"timedMelee\":true,\"authoredLoopPlaying\":true,\"aurora\":true,\"bloodMoon\":true,\"note\":\"Automated"
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
            Path.of("logs/atlas-clientqa.json"),
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
