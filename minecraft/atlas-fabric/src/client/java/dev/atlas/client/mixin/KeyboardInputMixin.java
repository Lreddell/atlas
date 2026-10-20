package dev.atlas.client.mixin;

import dev.atlas.client.CameraRig;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.input.Input;
import net.minecraft.client.input.KeyboardInput;
import net.minecraft.util.math.MathHelper;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(KeyboardInput.class)
public abstract class KeyboardInputMixin extends Input {
  @Inject(method = "tick", at = @At("RETURN"))
  private void atlas$movement(boolean slow, float factor, CallbackInfo ci) {
    var p = MinecraftClient.getInstance().player;
    if (p == null) return;
    if (CameraRig.detached == 1 || CameraRig.cinematic()) {
      movementForward = 0;
      movementSideways = 0;
      jumping = false;
      sneaking = false;
      return;
    }
    if (CameraRig.mode != CameraRig.Mode.FREE || CameraRig.detached != 0) return;
    double length = Math.hypot(movementForward, movementSideways);
    if (length > .01) {
      float heading =
          CameraRig.yaw - (float) Math.toDegrees(Math.atan2(movementSideways, movementForward));
      p.setYaw(p.getYaw() + MathHelper.wrapDegrees(heading - p.getYaw()) * .65f);
      movementForward = (float) Math.min(1, length);
      movementSideways = 0;
    }
  }
}
