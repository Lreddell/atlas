package dev.atlas.client.mixin;

import dev.atlas.client.*;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.PlayerEntityRenderer;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.math.RotationAxis;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(PlayerEntityRenderer.class)
public abstract class PlayerRendererMixin {
  @Inject(
      method =
          "render(Lnet/minecraft/client/network/AbstractClientPlayerEntity;FFLnet/minecraft/client/util/math/MatrixStack;Lnet/minecraft/client/render/VertexConsumerProvider;I)V",
      at = @At("HEAD"),
      cancellable = true)
  private void atlas$cinemaBody(
      AbstractClientPlayerEntity p,
      float yaw,
      float delta,
      MatrixStack m,
      VertexConsumerProvider out,
      int light,
      CallbackInfo ci) {
    if (CameraRig.cinematic() && p == MinecraftClient.getInstance().player) ci.cancel();
  }

  @Inject(
      method =
          "setupTransforms(Lnet/minecraft/client/network/AbstractClientPlayerEntity;Lnet/minecraft/client/util/math/MatrixStack;FFFF)V",
      at = @At("TAIL"))
  private void atlas$roll(
      AbstractClientPlayerEntity p,
      MatrixStack m,
      float a,
      float yaw,
      float delta,
      float scale,
      CallbackInfo ci) {
    float t = CameraRig.rollProgress(p.getId());
    if (t < 0 || AtlasConfig.INSTANCE.reducedMotion) return;
    m.translate(0, .65, 0);
    m.multiply(RotationAxis.POSITIVE_X.rotationDegrees(t * 360));
    m.translate(0, -.65, 0);
  }
}
