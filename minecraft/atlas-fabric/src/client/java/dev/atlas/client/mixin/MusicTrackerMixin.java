package dev.atlas.client.mixin;

import dev.atlas.client.AtlasConfig;
import net.minecraft.client.sound.MusicTracker;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MusicTracker.class)
public abstract class MusicTrackerMixin {
  @Inject(method = "tick", at = @At("HEAD"), cancellable = true)
  private void atlas$music(CallbackInfo ci) {
    if (AtlasConfig.INSTANCE.music) ci.cancel();
  }
}
