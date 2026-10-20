package dev.atlas;

import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.entity.*;
import net.minecraft.item.*;
import net.minecraft.registry.*;

public final class AtlasEntities {
  public static final EntityType<AtlasBoss> WARDEN =
      Registry.register(
          Registries.ENTITY_TYPE,
          Atlas.id("magnetic_warden"),
          EntityType.Builder.<AtlasBoss>create(AtlasBoss::new, SpawnGroup.MONSTER)
              .dimensions(3.6f, 5.8f)
              .maxTrackingRange(16)
              .trackingTickInterval(1)
              .makeFireImmune()
              .build("atlas:magnetic_warden"));
  public static final EntityType<AtlasBoss> TITAN =
      Registry.register(
          Registries.ENTITY_TYPE,
          Atlas.id("bell_titan"),
          EntityType.Builder.<AtlasBoss>create(AtlasBoss::new, SpawnGroup.MONSTER)
              .dimensions(4.4f, 6.5f)
              .maxTrackingRange(16)
              .trackingTickInterval(1)
              .makeFireImmune()
              .build("atlas:bell_titan"));
  public static final EntityType<AtlasMob> GUARD = mob("vault_guard", .92f, 1.82f),
      MARKSMAN = mob("vault_marksman", .86f, 1.78f),
      HOUND = mob("bell_hound", 1.08f, .92f),
      TOLLKEEPER = mob("tollkeeper", 1.5f, 2.74f);
  public static final EntityType<AtlasBolt> BOLT =
      Registry.register(
          Registries.ENTITY_TYPE,
          Atlas.id("echo_bolt"),
          EntityType.Builder.<AtlasBolt>create(AtlasBolt::new, SpawnGroup.MISC)
              .dimensions(.35f, .35f)
              .maxTrackingRange(12)
              .trackingTickInterval(1)
              .build("atlas:echo_bolt"));

  private static EntityType<AtlasMob> mob(String id, float w, float h) {
    return Registry.register(
        Registries.ENTITY_TYPE,
        Atlas.id(id),
        EntityType.Builder.<AtlasMob>create(AtlasMob::new, SpawnGroup.MONSTER)
            .dimensions(w, h)
            .maxTrackingRange(10)
            .trackingTickInterval(2)
            .build("atlas:" + id));
  }

  public static void init() {
    FabricDefaultAttributeRegistry.register(WARDEN, AtlasBoss.attributes(400));
    FabricDefaultAttributeRegistry.register(TITAN, AtlasBoss.attributes(390));
    for (var t : new EntityType[] {GUARD, MARKSMAN, HOUND, TOLLKEEPER}) {
      @SuppressWarnings("unchecked")
      EntityType<AtlasMob> type = (EntityType<AtlasMob>) t;
      FabricDefaultAttributeRegistry.register(type, AtlasMob.attributes());
    }
    for (var t : new EntityType[] {WARDEN, TITAN, GUARD, MARKSMAN, HOUND, TOLLKEEPER}) {
      String path = Registries.ENTITY_TYPE.getId(t).getPath();
      Registry.register(
          Registries.ITEM,
          Atlas.id(path + "_spawn_egg"),
          new SpawnEggItem(t, 0x485452, 0x9cae9e, new Item.Settings()));
    }
  }
}
