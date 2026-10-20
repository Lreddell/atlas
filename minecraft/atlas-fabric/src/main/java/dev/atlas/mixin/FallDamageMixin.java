package dev.atlas.mixin;

import dev.atlas.Content;
import net.minecraft.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;

@Mixin(LivingEntity.class)
public abstract class FallDamageMixin {
  @ModifyArg(
      method = "handleFallDamage",
      at =
          @At(
              value = "INVOKE",
              target =
                  "Lnet/minecraft/entity/LivingEntity;damage(Lnet/minecraft/entity/damage/DamageSource;F)Z"),
      index = 1)
  private float atlas$spikes(float amount) {
    var e = (LivingEntity) (Object) this;
    return Content.path(e.getWorld().getBlockState(e.getBlockPos())).equals("magnetic_spike")
            || Content.path(e.getWorld().getBlockState(e.getBlockPos().down()))
                .equals("magnetic_spike")
        ? amount * 2.5f
        : amount;
  }
}
