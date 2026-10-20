package dev.atlas.client.mixin;

import dev.atlas.client.CameraRig;
import dev.atlas.client.ClientCombat;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.*;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.*;

@Mixin(MinecraftClient.class)
public abstract class MinecraftClientMixin {
  @Redirect(
      method = "handleInputEvents",
      at =
          @At(
              value = "INVOKE",
              target =
                  "Lnet/minecraft/client/option/GameOptions;setPerspective(Lnet/minecraft/client/option/Perspective;)V"))
  private void atlas$perspective(GameOptions options, Perspective next) {
    CameraRig.toggleFree();
  }

  @Inject(method = "doAttack", at = @At("HEAD"), cancellable = true)
  private void atlas$attack(CallbackInfoReturnable<Boolean> ci) {
    if (CameraRig.detached == 1 || CameraRig.cinematic()) {
      ci.setReturnValue(false);
      return;
    }
    CameraRig.faceForAction();
    if (ClientCombat.begin()) ci.setReturnValue(true);
  }

  @Inject(method = "doItemUse", at = @At("HEAD"), cancellable = true)
  private void atlas$use(CallbackInfo ci) {
    if (CameraRig.detached == 1 || CameraRig.cinematic()) {
      ci.cancel();
      return;
    }
    CameraRig.faceForAction();
  }
}
