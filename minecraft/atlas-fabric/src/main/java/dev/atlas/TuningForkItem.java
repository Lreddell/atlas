package dev.atlas;

import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.*;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.*;
import net.minecraft.world.World;

public final class TuningForkItem extends Item {
  public TuningForkItem(Settings s) {
    super(s);
  }

  @Override
  public TypedActionResult<ItemStack> use(World world, PlayerEntity player, Hand hand) {
    if (world instanceof ServerWorld sw) {
      var p = Worldgen.nearestVault(player.getBlockX(), player.getBlockZ(), sw.getSeed());
      player.sendMessage(
          Text.literal(
              "The fork answers from "
                  + p.getX()
                  + ", "
                  + p.getZ()
                  + ". Look for the Listening Spire."),
          false);
      world.playSound(
          null,
          player.getBlockPos(),
          Content.sound("resonant_vault.listening_stone"),
          SoundCategory.PLAYERS,
          .6f,
          1);
    }
    player.getItemCooldownManager().set(this, 30);
    return TypedActionResult.success(player.getStackInHand(hand), world.isClient);
  }
}
