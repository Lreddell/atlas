package dev.atlas.mixin;

import dev.atlas.Worldgen;
import net.minecraft.world.StructureWorldAccess;
import net.minecraft.world.chunk.Chunk;
import net.minecraft.world.gen.StructureAccessor;
import net.minecraft.world.gen.chunk.ChunkGenerator;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ChunkGenerator.class)
public abstract class ChunkGeneratorMixin {
  @Inject(method = "generateFeatures", at = @At("TAIL"))
  private void atlas$features(
      StructureWorldAccess world, Chunk chunk, StructureAccessor structures, CallbackInfo ci) {
    Worldgen.generate(world, chunk);
  }
}
