package dev.atlas;

import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.fabricmc.fabric.api.loot.v3.LootTableEvents;
import net.minecraft.entity.*;
import net.minecraft.item.*;
import net.minecraft.loot.*;
import net.minecraft.loot.condition.RandomChanceLootCondition;
import net.minecraft.loot.entry.ItemEntry;
import net.minecraft.loot.provider.number.ConstantLootNumberProvider;
import net.minecraft.registry.Registries;
import net.minecraft.util.math.*;
import net.minecraft.world.*;

public final class NativeExtras {
  public static void init() {
    LootTableEvents.MODIFY.register(
        (key, builder, source, registries) -> {
          String path = key.getValue().getPath();
          if (!source.isBuiltin()) return;
          if (path.equals("blocks/jungle_leaves"))
            builder.pool(
                LootPool.builder()
                    .rolls(ConstantLootNumberProvider.create(1))
                    .conditionally(RandomChanceLootCondition.builder(.02f))
                    .with(ItemEntry.builder(Content.item("banana"))));
          if (path.equals("blocks/glow_lichen"))
            builder.pool(
                LootPool.builder()
                    .rolls(ConstantLootNumberProvider.create(1))
                    .conditionally(RandomChanceLootCondition.builder(.25f))
                    .with(ItemEntry.builder(Content.item("lumen_berry"))));
        });
    ItemGroupEvents.modifyEntriesEvent(ItemGroups.SPAWN_EGGS)
        .register(
            entries -> {
              for (String n :
                  new String[] {
                    "magnetic_warden",
                    "bell_titan",
                    "vault_guard",
                    "vault_marksman",
                    "bell_hound",
                    "tollkeeper"
                  }) entries.add(Registries.ITEM.get(Atlas.id(n + "_spawn_egg")));
            });
    ServerTickEvents.END_WORLD_TICK.register(
        w -> {
          if (w.getRegistryKey() != World.OVERWORLD
              || !w.isNight()
              || !FieldMath.bloodMoon(w.getTimeOfDay(), w.getSeed())
              || w.getTime() % 100 != 0
              || !w.getGameRules().getBoolean(GameRules.DO_MOB_SPAWNING)) return;
          for (var p : w.getPlayers()) {
            if (p.isSpectator() || p.isCreative()) continue;
            double angle = w.random.nextDouble() * Math.PI * 2;
            int x = p.getBlockX() + (int) (Math.cos(angle) * 36),
                z = p.getBlockZ() + (int) (Math.sin(angle) * 36);
            var at = new BlockPos(x, w.getTopY(Heightmap.Type.MOTION_BLOCKING_NO_LEAVES, x, z), z);
            if (!w.isChunkLoaded(at) || !w.getBlockState(at).isAir() || w.getLightLevel(at) > 7)
              continue;
            var mob = (w.random.nextBoolean() ? EntityType.ZOMBIE : EntityType.SKELETON).create(w);
            mob.refreshPositionAndAngles(at, 0, 0);
            w.spawnEntity(mob);
          }
        });
  }
}
