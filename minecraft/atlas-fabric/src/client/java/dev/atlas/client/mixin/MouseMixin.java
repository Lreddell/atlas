package dev.atlas.client.mixin;

import dev.atlas.client.CameraRig;
import net.minecraft.client.Mouse;
import net.minecraft.client.network.ClientPlayerEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;

@Mixin(Mouse.class)
public abstract class MouseMixin {
  @Redirect(
      method = "updateMouse",
      at =
          @At(
              value = "INVOKE",
              target = "Lnet/minecraft/client/network/ClientPlayerEntity;changeLookDirection(DD)V"))
  private void atlas$orbit(ClientPlayerEntity player, double dx, double dy) {
    if (CameraRig.orbit()) CameraRig.mouse(dx, dy);
    else if (!CameraRig.cinematic()) player.changeLookDirection(dx, dy);
  }
}
