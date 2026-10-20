package dev.atlas.client.mixin;

import dev.atlas.client.ClientCombat;
import net.minecraft.client.render.entity.model.PlayerEntityModel;
import net.minecraft.entity.LivingEntity;
import net.minecraft.util.Arm;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(PlayerEntityModel.class)
public abstract class PlayerModelMixin {
  @Inject(method = "setAngles(Lnet/minecraft/entity/LivingEntity;FFFFF)V", at = @At("TAIL"))
  private void atlas$weaponPose(
      LivingEntity entity,
      float limb,
      float amount,
      float age,
      float yaw,
      float pitch,
      CallbackInfo ci) {
    var pose = ClientCombat.pose(entity.getId(), 0);
    if (pose == null) return;
    var m = (PlayerEntityModel<?>) (Object) this;
    var arm = entity.getMainArm() == Arm.LEFT ? m.leftArm : m.rightArm;
    arm.pitch = -pose[0];
    arm.yaw += pose[1];
    arm.roll += pose[2];
    m.body.yaw += pose[1] * .3f;
    m.leftSleeve.copyTransform(m.leftArm);
    m.rightSleeve.copyTransform(m.rightArm);
    m.jacket.copyTransform(m.body);
  }
}
