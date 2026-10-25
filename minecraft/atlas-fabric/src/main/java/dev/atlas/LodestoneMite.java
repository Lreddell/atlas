package dev.atlas;

import net.minecraft.entity.*;
import net.minecraft.entity.ai.goal.*;
import net.minecraft.entity.attribute.*;
import net.minecraft.entity.data.*;
import net.minecraft.entity.mob.PathAwareEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.*;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.recipe.Ingredient;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.*;
import net.minecraft.text.Text;
import net.minecraft.util.*;
import net.minecraft.world.World;

/** Small, harmless ferric grazers. They share the field law and never take loose player items. */
public final class LodestoneMite extends PathAwareEntity {
  private static final TrackedData<Integer> SIGN =
      DataTracker.registerData(LodestoneMite.class, TrackedDataHandlerRegistry.INTEGER);
  private int moltCooldown;

  public LodestoneMite(EntityType<? extends LodestoneMite> type, World world) {
    super(type, world);
  }

  public static DefaultAttributeContainer.Builder attributes() {
    return createMobAttributes()
        .add(EntityAttributes.GENERIC_MAX_HEALTH, 8)
        .add(EntityAttributes.GENERIC_MOVEMENT_SPEED, .18)
        .add(EntityAttributes.GENERIC_FOLLOW_RANGE, 12);
  }

  @Override
  protected void initGoals() {
    goalSelector.add(0, new SwimGoal(this));
    goalSelector.add(1, new EscapeDangerGoal(this, 1.4));
    goalSelector.add(2, new TemptGoal(this, 1.1, Ingredient.ofItems(Items.IRON_NUGGET), false));
    goalSelector.add(3, new WanderAroundFarGoal(this, .8));
    goalSelector.add(4, new LookAtEntityGoal(this, PlayerEntity.class, 6));
    goalSelector.add(5, new LookAroundGoal(this));
  }

  @Override
  protected void initDataTracker(DataTracker.Builder b) {
    super.initDataTracker(b);
    b.add(SIGN, 1);
  }

  public int polarity() {
    return dataTracker.get(SIGN);
  }

  @Override
  public void tick() {
    super.tick();
    if (!(getWorld() instanceof ServerWorld w)) return;
    if (moltCooldown > 0) moltCooldown--;
    if (age % 5 == 0) {
      var force =
          MagneticPhysics.sample(w, getPos().add(0, .2, 0), polarity(), .004, .12, false, false)
              .force();
      if (force.lengthSquared() > .00001) {
        addVelocity(force);
        if (getVelocity().length() > .4) setVelocity(getVelocity().normalize().multiply(.4));
        velocityModified = true;
        fallDistance = 0;
      }
    }
  }

  @Override
  protected ActionResult interactMob(PlayerEntity p, Hand hand) {
    var stack = p.getStackInHand(hand);
    if (!stack.isOf(Items.IRON_NUGGET)) return super.interactMob(p, hand);
    if (getWorld().isClient) return ActionResult.SUCCESS;
    if (moltCooldown > 0) {
      p.sendMessage(
          Text.literal(
              "The mite's new plates are still growing. It will shed again in "
                  + ((moltCooldown + 1199) / 1200)
                  + " minutes."),
          true);
      return ActionResult.CONSUME;
    }
    if (!p.isCreative()) stack.decrement(1);
    moltCooldown = 6000;
    dataTracker.set(SIGN, -polarity());
    dropStack(new ItemStack(Content.item("magnetite_shard")));
    getWorld()
        .playSound(
            null,
            getBlockPos(),
            SoundEvents.BLOCK_AMETHYST_BLOCK_CHIME,
            SoundCategory.NEUTRAL,
            .25f,
            1.4f);
    p.sendMessage(
        Text.literal(
            "The lodestone mite sheds a ferric plate and reverses its sign. Hold an iron nugget to"
                + " lead it; natural magnets and powered relays move it too."),
        false);
    setPersistent();
    return ActionResult.CONSUME;
  }

  @Override
  public void writeCustomDataToNbt(NbtCompound n) {
    super.writeCustomDataToNbt(n);
    n.putInt("AtlasSign", polarity());
    n.putInt("AtlasMolt", moltCooldown);
  }

  @Override
  public void readCustomDataFromNbt(NbtCompound n) {
    super.readCustomDataFromNbt(n);
    dataTracker.set(SIGN, n.getInt("AtlasSign") < 0 ? -1 : 1);
    moltCooldown = Math.max(0, n.getInt("AtlasMolt"));
  }
}
