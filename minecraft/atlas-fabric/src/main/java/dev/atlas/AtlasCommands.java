package dev.atlas;

import static net.minecraft.server.command.CommandManager.literal;

import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.item.*;
import net.minecraft.server.command.*;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.math.*;

public final class AtlasCommands {
  public static void init() {
    CommandRegistrationCallback.EVENT.register(
        (dispatcher, access, env) ->
            dispatcher.register(
                literal("atlas")
                    .then(
                        literal("guide")
                            .executes(
                                c -> {
                                  guide(c.getSource().getPlayerOrThrow());
                                  return 1;
                                }))
                    .then(
                        literal("locate")
                            .then(literal("fields").executes(c -> locate(c.getSource(), false)))
                            .then(literal("vault").executes(c -> locate(c.getSource(), true))))
                    .then(
                        literal("kit")
                            .requires(s -> s.hasPermissionLevel(2))
                            .executes(
                                c -> {
                                  kit(c.getSource().getPlayerOrThrow());
                                  return 1;
                                }))
                    .then(
                        literal("travel")
                            .requires(s -> s.hasPermissionLevel(2))
                            .then(literal("fields").executes(c -> travel(c.getSource(), false)))
                            .then(literal("vault").executes(c -> travel(c.getSource(), true))))
                    .then(
                        literal("summon")
                            .requires(s -> s.hasPermissionLevel(2))
                            .then(literal("warden").executes(c -> summon(c.getSource(), false)))
                            .then(literal("titan").executes(c -> summon(c.getSource(), true))))
                    .then(
                        literal("vault")
                            .requires(s -> s.hasPermissionLevel(2))
                            .then(
                                literal("skip")
                                    .executes(
                                        c -> {
                                          var s = c.getSource();
                                          var site =
                                              Vaults.at(
                                                  s.getWorld(),
                                                  BlockPos.ofFloored(s.getPosition()));
                                          if (site == null) {
                                            s.sendError(
                                                Text.literal("Stand inside a vault first."));
                                            return 0;
                                          }
                                          for (var e : site.layout().getAsJsonArray("rooms")) {
                                            String id = e.getAsJsonObject().get("id").getAsString();
                                            if (id.startsWith("major_"))
                                              AtlasState.get(s.getWorld())
                                                  .complete(site.id() + ":" + id);
                                          }
                                          Vaults.openIfReady(s.getWorld(), site);
                                          s.sendFeedback(
                                              () ->
                                                  Text.literal(
                                                      "All pre-boss chambers are released. The"
                                                          + " Titan, core and escape remain."),
                                              false);
                                          return 1;
                                        })))
                    .then(
                        literal("verify")
                            .requires(s -> s.hasPermissionLevel(2))
                            .executes(
                                c -> {
                                  AtlasSmoke.start(c.getSource().getWorld());
                                  c.getSource()
                                      .sendFeedback(
                                          () ->
                                              Text.literal(
                                                  "Atlas verification started. Results are written"
                                                      + " to logs/atlas-smoke.json."),
                                          false);
                                  return 1;
                                }))));
  }

  private static int locate(ServerCommandSource s, boolean vault) {
    var p = BlockPos.ofFloored(s.getPosition());
    BlockPos goal;
    if (vault) goal = Worldgen.nearestVault(p.getX(), p.getZ(), s.getWorld().getSeed());
    else {
      var c = FieldMath.nearest(p.getX(), p.getZ(), s.getWorld().getSeed());
      goal = new BlockPos(c.x(), 132, c.z());
    }
    s.sendFeedback(
        () ->
            Text.literal(
                (vault ? "Listening Spire near " : "Magnetic Fields at ")
                    + goal.getX()
                    + ", "
                    + goal.getZ()),
        false);
    return 1;
  }

  private static int travel(ServerCommandSource s, boolean vault)
      throws com.mojang.brigadier.exceptions.CommandSyntaxException {
    var p = s.getPlayerOrThrow();
    BlockPos at;
    if (vault) {
      var center = Worldgen.nearestVault(p.getBlockX(), p.getBlockZ(), s.getWorld().getSeed());
      var site = Vaults.site(s.getWorld(), center);
      var entrance = site.world(0, 72, 144);
      s.getWorld().getChunk(entrance);
      at =
          new BlockPos(
              entrance.getX(),
              Math.max(
                  entrance.getY(),
                  Vaults.nativeSurface(s.getWorld(), entrance.getX(), entrance.getZ())),
              entrance.getZ());
    } else {
      var c = FieldMath.nearest(p.getBlockX(), p.getBlockZ(), s.getWorld().getSeed());
      at = new BlockPos(c.x() + 44, 134, c.z());
    }
    p.teleport(s.getWorld(), at.getX() + .5, at.getY() + 1, at.getZ() + .5, 90, 0);
    return 1;
  }

  private static int summon(ServerCommandSource s, boolean titan) {
    var b = (titan ? AtlasEntities.TITAN : AtlasEntities.WARDEN).create(s.getWorld());
    var at = BlockPos.ofFloored(s.getPosition());
    b.initializeFight(at, "manual:" + b.getUuid());
    b.refreshPositionAndAngles(at.getX() + .5, at.getY() + 1, at.getZ() + .5, 0, 0);
    s.getWorld().spawnEntity(b);
    return 1;
  }

  public static void kit(ServerPlayerEntity p) {
    for (String item :
        new String[] {
          "polarity_boots",
          "upgraded_polarity_boots",
          "vaultsteel_spear",
          "vault_crossbow",
          "bellbreaker_maul",
          "echo_tuning_fork",
          "titan_hammer"
        }) p.giveItemStack(new ItemStack(Content.item(item)));
    p.giveItemStack(new ItemStack(Content.item("vault_bolt"), 64));
    p.giveItemStack(new ItemStack(Items.GOLDEN_CARROT, 32));
    p.equipStack(EquipmentSlot.CHEST, new ItemStack(Items.IRON_CHESTPLATE));
    p.equipStack(EquipmentSlot.LEGS, new ItemStack(Items.IRON_LEGGINGS));
    p.equipStack(EquipmentSlot.FEET, new ItemStack(Content.item("polarity_boots")));
    guide(p);
  }

  public static void guide(ServerPlayerEntity p) {
    for (String line :
        new String[] {
          "ATLAS · LIGHT & POLARITY",
          "C: Dodge / magnetic dash · R: Flip polarity · V: Boots on/off",
          "F5: Free third person · F6: Shoulder view · F7: Place / lock / release camera",
          "Same polarity repels; opposite attracts. Oppose a tower to climb; flip when its warning"
              + " sounds.",
          "Warden: flank the lit crystal wards or break them. All weapons work. Dash into an"
              + " exposed opposing Warden for a Magnet Slam. Retreat resets the fight after 10s.",
          "J: Field journal · G: Warden Field with upgraded boots (40 stamina, 8s recovery).",
          "Vault: find a Listening Spire. Armory caches supply weapons. Clear both circuits, follow"
              + " each room's cues, then enter the inner seal.",
          "Bell Titan: dodge the white attack windups; strike the hanging bell when the core opens."
              + " Claim the core, then follow either ascent.",
          "O: Atlas settings. Minecraft's Music and Hostile Creatures sliders control soundtrack"
              + " and encounters."
        }) p.sendMessage(Text.literal(line), false);
  }
}
