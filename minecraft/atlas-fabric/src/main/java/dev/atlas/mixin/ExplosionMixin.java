package dev.atlas.mixin;

import dev.atlas.Vaults;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.world.World;
import net.minecraft.world.explosion.Explosion;
import org.spongepowered.asm.mixin.*;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Explosion.class)
public abstract class ExplosionMixin {
  @Shadow @Final private World world;

  @Inject(method = "collectBlocksAndDamageEntities", at = @At("TAIL"))
  private void atlas$sealedTerrain(CallbackInfo ci) {
    if (world instanceof ServerWorld server && server.getRegistryKey() == World.OVERWORLD)
      ((Explosion) (Object) this)
          .getAffectedBlocks()
          .removeIf(p -> Vaults.protectedAt(server, p, server.getBlockState(p)));
  }
}
