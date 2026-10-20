package dev.atlas;

import net.minecraft.component.type.AttributeModifierSlot;
import net.minecraft.component.type.AttributeModifiersComponent;
import net.minecraft.entity.*;
import net.minecraft.entity.attribute.*;
import net.minecraft.item.*;

public final class AtlasWeaponItem extends SwordItem {
  public final String kind;

  public AtlasWeaponItem(String kind, Settings settings) {
    super(
        ToolMaterials.IRON,
        settings
            .maxDamage(kind.contains("titan") ? 1600 : 700)
            .attributeModifiers(attributes(kind)));
    this.kind = kind;
  }

  private static AttributeModifiersComponent attributes(String kind) {
    float damage =
        kind.endsWith("spear") ? 6 : kind.endsWith("maul") ? 9 : kind.endsWith("hammer") ? 11 : 5;
    double speed =
        kind.endsWith("spear")
            ? 1.6
            : kind.endsWith("maul") ? .952 : kind.endsWith("hammer") ? .909 : 1.7;
    var b =
        AttributeModifiersComponent.builder()
            .add(
                EntityAttributes.GENERIC_ATTACK_DAMAGE,
                new EntityAttributeModifier(
                    BASE_ATTACK_DAMAGE_MODIFIER_ID,
                    damage - 1,
                    EntityAttributeModifier.Operation.ADD_VALUE),
                AttributeModifierSlot.MAINHAND)
            .add(
                EntityAttributes.GENERIC_ATTACK_SPEED,
                new EntityAttributeModifier(
                    BASE_ATTACK_SPEED_MODIFIER_ID,
                    speed - 4,
                    EntityAttributeModifier.Operation.ADD_VALUE),
                AttributeModifierSlot.MAINHAND);
    if (kind.endsWith("spear") || kind.endsWith("maul") || kind.endsWith("hammer"))
      b.add(
          EntityAttributes.PLAYER_ENTITY_INTERACTION_RANGE,
          new EntityAttributeModifier(
              Atlas.id("weapon_reach"),
              kind.endsWith("spear") ? 2.4 : kind.endsWith("maul") ? 1.2 : 1.4,
              EntityAttributeModifier.Operation.ADD_VALUE),
          AttributeModifierSlot.MAINHAND);
    return b.build();
  }

  @Override
  public boolean postHit(ItemStack stack, LivingEntity target, LivingEntity attacker) {
    if (!attacker.getWorld().isClient) {
      if (kind.endsWith("maul")) {
        target.takeKnockback(.8, attacker.getX() - target.getX(), attacker.getZ() - target.getZ());
        if (target instanceof AtlasMob m) m.stagger(30);
      }
      if (kind.endsWith("hammer"))
        for (var e :
            attacker
                .getWorld()
                .getEntitiesByClass(
                    LivingEntity.class,
                    target.getBoundingBox().expand(3),
                    e -> e != attacker && e != target && e.isAlive()))
          e.damage(attacker.getDamageSources().mobAttack(attacker), 4);
    }
    return super.postHit(stack, target, attacker);
  }
}
