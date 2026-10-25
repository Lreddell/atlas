package dev.atlas.client;

import dev.atlas.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.blockrenderlayer.v1.BlockRenderLayerMap;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.*;
import net.fabricmc.fabric.api.client.rendering.v1.*;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.util.InputUtil;
import net.minecraft.particle.*;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.math.*;
import org.lwjgl.glfw.GLFW;

public final class AtlasClient implements ClientModInitializer {
  public static int stamina = 100, roll = 0, polarity = 0;
  public static long seed = 0;
  public static boolean bloodMoon = false;
  public static String serverContext = "";
  private static KeyBinding dodge, flip, boots, shoulder, detached, settings, field, journal;
  private static int ticks = 0;
  private static int heartbeatIn = 0;
  public static boolean lowHealth = false;

  @Override
  public void onInitializeClient() {
    AtlasRenderers.init();
    var container =
        net.fabricmc.loader.api.FabricLoader.getInstance().getModContainer("atlas").orElseThrow();
    for (String pack : java.util.List.of("riverlands", "tundra", "classic"))
      net.fabricmc.fabric.api.resource.ResourceManagerHelper.registerBuiltinResourcePack(
          Atlas.id(pack),
          container,
          net.fabricmc.fabric.api.resource.ResourcePackActivationType.NORMAL);
    for (var entry : Content.BLOCKS.entrySet())
      if (entry.getKey().equals("ferric_reed")
          || entry.getKey().contains("crystal")
          || entry.getKey().endsWith("spike")
          || entry.getKey().endsWith("spikes")
          || entry.getKey().equals("magnetite_shard"))
        BlockRenderLayerMap.INSTANCE.putBlock(entry.getValue(), RenderLayer.getCutout());
    dodge = key("dodge", GLFW.GLFW_KEY_C);
    flip = key("polarity", GLFW.GLFW_KEY_R);
    boots = key("boots", GLFW.GLFW_KEY_V);
    shoulder = key("shoulder", GLFW.GLFW_KEY_F6);
    detached = key("detached", GLFW.GLFW_KEY_F7);
    settings = key("config", GLFW.GLFW_KEY_O);
    field = key("field", GLFW.GLFW_KEY_G);
    journal = key("journal", GLFW.GLFW_KEY_J);
    ClientPlayNetworking.registerGlobalReceiver(
        Network.State.ID,
        (p, ctx) ->
            ctx.client()
                .execute(
                    () -> {
                      stamina = p.stamina();
                      roll = p.roll();
                      polarity = p.polarity();
                      seed = p.seed();
                      bloodMoon = p.bloodMoon();
                      serverContext = p.context();
                    }));
    ClientPlayNetworking.registerGlobalReceiver(
        Network.Cue.ID,
        (p, ctx) ->
            ctx.client()
                .execute(
                    () -> {
                      if (p.cue().equals("attack")) ClientCombat.cue(p.entity(), p.kind());
                      else CameraRig.cue(p.cue(), p.entity());
                    }));
    ClientPlayConnectionEvents.DISCONNECT.register(
        (h, c) -> {
          CameraRig.reset();
          serverContext = "";
          bloodMoon = false;
          lowHealth = false;
          heartbeatIn = 0;
        });
    ClientTickEvents.END_CLIENT_TICK.register(AtlasClient::tick);
    HudRenderCallback.EVENT.register((context, counter) -> hud(context));
    WorldRenderEvents.LAST.register(AtlasSky::render);
    WorldRenderEvents.BLOCK_OUTLINE.register((context, outline) -> !CameraRig.cinematic());
    ClientQa.init();
  }

  private static KeyBinding key(String name, int code) {
    return KeyBindingHelper.registerKeyBinding(
        new KeyBinding("key.atlas." + name, InputUtil.Type.KEYSYM, code, "key.categories.atlas"));
  }

  private static void send(int action) {
    var c = MinecraftClient.getInstance();
    if (c.player == null || !ClientPlayNetworking.canSend(Network.Control.ID)) return;
    float yaw = CameraRig.mode == CameraRig.Mode.FREE ? CameraRig.yaw : c.player.getYaw();
    float
        forward =
            (c.options.forwardKey.isPressed() ? 1 : 0) - (c.options.backKey.isPressed() ? 1 : 0),
        side = (c.options.leftKey.isPressed() ? 1 : 0) - (c.options.rightKey.isPressed() ? 1 : 0);
    ClientPlayNetworking.send(new Network.Control(action, yaw, forward, side));
  }

  private static void tick(MinecraftClient c) {
    ticks++;
    AtlasMusic.tick(c);
    ClientCombat.tick();
    if (c.player == null) return;
    CameraRig.tick();
    if (c.currentScreen == null) {
      while (dodge.wasPressed()) send(0);
      while (flip.wasPressed()) send(1);
      while (boots.wasPressed()) send(2);
      while (field.wasPressed()) send(4);
      if (journal.wasPressed()) c.setScreen(new FieldJournalScreen());
      while (shoulder.wasPressed()) CameraRig.toggleShoulder();
      while (detached.wasPressed()) CameraRig.toggleDetached();
      if (settings.wasPressed()) c.setScreen(new AtlasSettingsScreen(null));
      if (ticks % 4 == 0) send(3);
    }
    lowHealth =
        AtlasConfig.INSTANCE.lowHealth
            && HealthFeedback.active(lowHealth, c.player.getHealth(), c.player.getMaxHealth());
    if (!lowHealth) heartbeatIn = 0;
    if (lowHealth && !c.isPaused() && c.currentScreen == null && heartbeatIn-- <= 0) {
      c.world.playSound(
          c.player,
          c.player.getBlockPos(),
          Content.sound("player.heartbeat"),
          SoundCategory.PLAYERS,
          .25f,
          1);
      heartbeatIn =
          (int)
              Math.round(1200 / HealthFeedback.bpm(c.player.getHealth(), c.player.getMaxHealth()));
    }
    if (AtlasConfig.INSTANCE.atmosphere && !c.isPaused()) ambient(c);
  }

  private static void ambient(MinecraftClient c) {
    if (ticks % 3 != 0) return;
    var r = c.world.random;
    String biome =
        c.world
            .getBiome(c.player.getBlockPos())
            .getKey()
            .map(k -> k.getValue().getPath())
            .orElse("");
    double x = c.player.getX() + (r.nextDouble() - .5) * 28,
        z = c.player.getZ() + (r.nextDouble() - .5) * 28,
        y = c.player.getY() + r.nextDouble() * 8;
    var particle =
        MeridianBiomes.regional(biome)
            ? ParticleTypes.ELECTRIC_SPARK
            : biome.equals("volcanic")
                ? ParticleTypes.ASH
                : biome.contains("snow") || biome.contains("frozen")
                    ? ParticleTypes.SNOWFLAKE
                    : c.player.getY() < 40
                        ? ParticleTypes.WHITE_ASH
                        : SkyTime.night(c.world.getTimeOfDay())
                            ? ParticleTypes.GLOW
                            : ParticleTypes.CHERRY_LEAVES;
    if (c.world.getBlockState(BlockPos.ofFloored(x, y, z)).isAir())
      c.world.addParticle(particle, x, y, z, .007, -.006, .003);
    if (!AtlasConfig.INSTANCE.reducedMotion
        && SkyTime.night(c.world.getTimeOfDay())
        && ticks % 600 < 12
        && c.world.isSkyVisible(c.player.getBlockPos())) {
      double at = ticks % 600;
      for (int i = 0; i < 5; i++)
        c.world.addParticle(
            ParticleTypes.END_ROD,
            c.player.getX() + 80 - at * 5 + i * .7,
            c.player.getY() + 100 - at * .8,
            c.player.getZ() + 130,
            .02,
            -.003,
            0);
    }
  }

  private static void hud(DrawContext context) {
    var c = MinecraftClient.getInstance();
    if (c.player == null || c.options.hudHidden) return;
    int w = context.getScaledWindowWidth(), h = context.getScaledWindowHeight();
    if (CameraRig.cinematic()) {
      int bar = (int) (h * .09);
      context.fill(0, 0, w, bar, 0xff000000);
      context.fill(0, h - bar, w, h, 0xff000000);
      return;
    }
    if (stamina < 100 || roll > 0) {
      int x = w / 2 - 40, y = h - 65;
      context.fill(x - 1, y - 1, x + 81, y + 4, 0xb0202526);
      context.fill(
          x, y, x + (int) (80 * stamina / 100f), y + 3, stamina >= 30 ? 0xffbda56c : 0xff916458);
    }
    if (polarity != 0) {
      String label = polarity > 0 ? "+" : "−";
      int color = polarity > 0 ? 0xe08b81 : 0x87afd9;
      context.drawTextWithShadow(c.textRenderer, label, w / 2 + 101, h - 25, color);
    }
    if (bloodMoon) context.drawTextWithShadow(c.textRenderer, "Blood Moon", 8, 8, 0xb85e55);
    if (lowHealth && c.player.isAlive()) {
      int alpha = (int) (22 + 9 * Math.sin(ticks * .15));
      int color = (alpha << 24) | 0x801010;
      context.fill(0, 0, w, 5, color);
      context.fill(0, h - 5, w, h, color);
      context.fill(0, 0, 5, h, color);
      context.fill(w - 5, 0, w, h, color);
    }
    if (c.world != null) {
      AtlasBoss nearest = null;
      double best = Double.MAX_VALUE;
      for (var e : c.world.getEntities())
        if (e instanceof AtlasBoss b && !b.action().equals("death")) {
          double d = c.player.squaredDistanceTo(b);
          if (d < best) {
            nearest = b;
            best = d;
          }
        }
      if (nearest != null && best < 140 * 140) {
        double angle =
            MathHelper.wrapDegrees(
                (float)
                    (Math.toDegrees(
                            Math.atan2(
                                -(nearest.getX() - c.player.getX()),
                                nearest.getZ() - c.player.getZ()))
                        - c.gameRenderer.getCamera().getYaw()));
        if (Math.abs(angle) > 50)
          context.drawTextWithShadow(
              c.textRenderer, angle > 0 ? ">" : "<", angle > 0 ? w - 18 : 10, h / 2, 0xd5c99d);
      }
    }
  }
}
