package dev.atlas.client.mixin;

import dev.atlas.client.*;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.item.HeldItemRenderer;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.item.ItemStack;
import net.minecraft.util.Hand;
import net.minecraft.util.math.RotationAxis;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(HeldItemRenderer.class)
public abstract class HeldItemMixin {
  @Inject(method = "renderFirstPersonItem", at = @At("HEAD"))
  private void atlas$windup(
      AbstractClientPlayerEntity p,
      float delta,
      float pitch,
      Hand hand,
      float swing,
      ItemStack stack,
      float equip,
      MatrixStack m,
      VertexConsumerProvider out,
      int light,
      CallbackInfo ci) {
    m.push();
    var pose = ClientCombat.pose(p.getId(), delta);
    if (pose != null && hand == Hand.MAIN_HAND) {
      m.multiply(RotationAxis.POSITIVE_X.rotation(-pose[0] * .35f));
      m.multiply(RotationAxis.POSITIVE_Y.rotation(pose[1] * .65f));
      m.multiply(RotationAxis.POSITIVE_Z.rotation(-pose[2] * .45f));
      m.translate(0, pose[0] * .03, -pose[0] * .06);
    }
  }

  @Inject(method = "renderFirstPersonItem", at = @At("RETURN"))
  private void atlas$restore(
      AbstractClientPlayerEntity p,
      float delta,
      float pitch,
      Hand hand,
      float swing,
      ItemStack stack,
      float equip,
      MatrixStack m,
      VertexConsumerProvider out,
      int light,
      CallbackInfo ci) {
    m.pop();
  }
}
