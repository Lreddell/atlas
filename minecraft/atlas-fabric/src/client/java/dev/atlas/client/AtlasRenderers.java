package dev.atlas.client;

import dev.atlas.*;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.*;
import net.minecraft.client.render.entity.*;
import net.minecraft.client.render.entity.feature.EyesFeatureRenderer;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.LivingEntity;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.RotationAxis;

public final class AtlasRenderers {
  private static final Identifier MATERIALS = Atlas.id("textures/entity/atlas_materials.png");
  private static final RenderLayer GLOW =
      RenderLayer.getEyes(Atlas.id("textures/entity/atlas_glow.png"));

  private static final class AtlasLivingRenderer<T extends LivingEntity>
      extends LivingEntityRenderer<T, VoxelModel<T>> {
    AtlasLivingRenderer(EntityRendererFactory.Context context, String kind, float shadow) {
      super(context, new VoxelModel<>(kind), shadow);
      addFeature(
          new EyesFeatureRenderer<T, VoxelModel<T>>(this) {
            @Override
            public RenderLayer getEyesTexture() {
              return GLOW;
            }
          });
    }

    @Override
    public Identifier getTexture(T entity) {
      return MATERIALS;
    }

    @Override
    protected int getBlockLight(T entity, BlockPos pos) {
      return Math.max(4, super.getBlockLight(entity, pos));
    }
  }

  public static void init() {
    EntityRendererRegistry.register(
        AtlasEntities.WARDEN, c -> new AtlasLivingRenderer<>(c, "magnetic_warden", 1.8f));
    EntityRendererRegistry.register(
        AtlasEntities.TITAN, c -> new AtlasLivingRenderer<>(c, "bell_titan", 2.0f));
    for (var type :
        java.util.List.of(
            AtlasEntities.GUARD,
            AtlasEntities.MARKSMAN,
            AtlasEntities.HOUND,
            AtlasEntities.TOLLKEEPER)) {
      String name = net.minecraft.registry.Registries.ENTITY_TYPE.getId(type).getPath();
      EntityRendererRegistry.register(type, c -> new AtlasLivingRenderer<>(c, name, .6f));
    }
    EntityRendererRegistry.register(
        AtlasEntities.BOLT,
        c ->
            new EntityRenderer<AtlasBolt>(c) {
              @Override
              public Identifier getTexture(AtlasBolt b) {
                return MATERIALS;
              }

              @Override
              public void render(
                  AtlasBolt b,
                  float yaw,
                  float delta,
                  MatrixStack m,
                  VertexConsumerProvider out,
                  int light) {
                m.push();
                m.multiply(RotationAxis.POSITIVE_Y.rotationDegrees((b.age + delta) * 18));
                m.multiply(RotationAxis.POSITIVE_Z.rotationDegrees(45));
                m.scale(.2f, .2f, .2f);
                m.translate(-.5, -.5, -.5);
                MinecraftClient.getInstance()
                    .getBlockRenderManager()
                    .renderBlockAsEntity(
                        Content.block(b.polarity() > 0 ? "positive_magnet" : "negative_magnet")
                            .getDefaultState(),
                        m,
                        out,
                        LightmapTextureManager.MAX_LIGHT_COORDINATE,
                        OverlayTexture.DEFAULT_UV);
                m.pop();
                super.render(b, yaw, delta, m, out, light);
              }
            });
  }
}
