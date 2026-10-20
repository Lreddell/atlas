package dev.atlas.client.mixin;

import com.mojang.blaze3d.systems.RenderSystem;
import dev.atlas.client.*;
import net.minecraft.client.render.WorldRenderer;
import net.minecraft.util.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;

@Mixin(WorldRenderer.class)
public abstract class SkyMixin {
  @Redirect(
      method = "renderSky",
      at =
          @At(
              value = "INVOKE",
              target =
                  "Lcom/mojang/blaze3d/systems/RenderSystem;setShaderTexture(ILnet/minecraft/util/Identifier;)V"))
  private void atlas$moon(int slot, Identifier texture) {
    if (AtlasConfig.INSTANCE.atmosphere
        && AtlasClient.bloodMoon
        && texture.getPath().contains("moon")) RenderSystem.setShaderColor(.65f, .16f, .15f, 1);
    else RenderSystem.setShaderColor(1, 1, 1, 1);
    RenderSystem.setShaderTexture(slot, texture);
  }
}
