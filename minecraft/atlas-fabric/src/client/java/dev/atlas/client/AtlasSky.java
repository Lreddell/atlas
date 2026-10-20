package dev.atlas.client;

import com.mojang.blaze3d.systems.RenderSystem;
import dev.atlas.SkyTime;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.*;
import net.minecraft.util.math.*;
import org.joml.Matrix4f;

public final class AtlasSky {
  static int renderedRibbons = 0;

  public static void render(WorldRenderContext context) {
    var c = MinecraftClient.getInstance();
    if (c.world == null
        || c.player == null
        || !AtlasConfig.INSTANCE.atmosphere
        || !c.world.getDimension().hasSkyLight()
        || !SkyTime.night(c.world.getTimeOfDay())
        || c.world.getRainGradient(1) > .3f) return;
    String biome =
        c.world
            .getBiome(c.player.getBlockPos())
            .getKey()
            .map(k -> k.getValue().getPath())
            .orElse("");
    boolean cold =
        biome.contains("snow")
            || biome.contains("frozen")
            || biome.contains("taiga")
            || biome.contains("ice")
            || biome.contains("peaks");
    long day = c.world.getTimeOfDay() / 24000;
    boolean aurora =
        cold && !AtlasClient.bloodMoon && Math.floorMod(day + (int) AtlasClient.seed, 4) != 0;
    if (!aurora) return;
    var m = context.matrixStack();
    if (m == null) return;
    renderedRibbons++;
    var camera = context.camera().getPos();
    m.push();
    m.translate(-camera.x, -camera.y, -camera.z);
    Matrix4f matrix = m.peek().getPositionMatrix();
    RenderSystem.enableBlend();
    RenderSystem.defaultBlendFunc();
    RenderSystem.disableCull();
    RenderSystem.depthMask(false);
    RenderSystem.setShaderColor(1, 1, 1, 1);
    RenderSystem.setShader(GameRenderer::getPositionColorProgram);
    float time = (c.world.getTime() % 240000) / 20f;
    double baseX = Math.floor(camera.x / 512) * 512, baseZ = Math.floor(camera.z / 512) * 512;
    for (int ribbon = 0; ribbon < 3; ribbon++) {
      var buffer =
          Tessellator.getInstance()
              .begin(VertexFormat.DrawMode.TRIANGLE_STRIP, VertexFormats.POSITION_COLOR);
      for (int i = 0; i <= 64; i++) {
        float x = (float) (baseX - 320 + i * 16),
            z = (float) (baseZ + 180 + ribbon * 85 + Math.sin(i * .2 + time * .025) * 48),
            y =
                (float)
                    (camera.y + 95 + ribbon * 13 + Math.sin(i * .25 + time * .04 + ribbon) * 16);
        int alpha = (int) (45 * Math.sin(i * Math.PI / 64));
        buffer.vertex(matrix, x, y, z).color(ribbon == 1 ? 125 : 85, 165, 180, alpha);
        buffer
            .vertex(matrix, x, y + 24 + MathHelper.sin(i * .4f) * 9, z)
            .color(95, 150, ribbon == 1 ? 205 : 145, 0);
      }
      BufferRenderer.drawWithGlobalProgram(buffer.end());
    }
    RenderSystem.enableCull();
    RenderSystem.depthMask(true);
    RenderSystem.disableBlend();
    m.pop();
  }
}
