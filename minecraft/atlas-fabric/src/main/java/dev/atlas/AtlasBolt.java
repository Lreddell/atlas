package dev.atlas;

import net.minecraft.entity.*;
import net.minecraft.entity.data.*;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.entity.projectile.*;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.particle.*;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.hit.*;
import net.minecraft.util.math.*;
import net.minecraft.world.World;
import org.joml.Vector3f;

public final class AtlasBolt extends ProjectileEntity {
  private static final TrackedData<Integer> POLARITY =
      DataTracker.registerData(AtlasBolt.class, TrackedDataHandlerRegistry.INTEGER);
  public float damage = 3;
  public int life = 100;
  public double homing = 0;
  public double gravity = 0;

  public AtlasBolt(EntityType<? extends AtlasBolt> type, World world) {
    super(type, world);
    setNoGravity(true);
  }

  @Override
  protected void initDataTracker(DataTracker.Builder b) {
    b.add(POLARITY, 0);
  }

  public int polarity() {
    return dataTracker.get(POLARITY);
  }

  public void polarity(int v) {
    dataTracker.set(POLARITY, v);
  }

  @Override
  public void tick() {
    super.tick();
    if (getWorld().isClient) return;
    if (--life <= 0) {
      discard();
      return;
    }
    var world = (ServerWorld) getWorld();
    if (gravity > 0) setVelocity(getVelocity().add(0, -gravity, 0));
    var nearby = world.getClosestPlayer(getX(), getY(), getZ(), 4, false);
    if (nearby != null && PlayerMechanics.polarity(nearby) == polarity() && polarity() != 0) {
      setVelocity(
          getVelocity()
              .add(getPos().subtract(nearby.getPos().add(0, 1, 0)).normalize().multiply(.18)));
    } else if (homing > 0) {
      var target = world.getClosestPlayer(getX(), getY(), getZ(), 48, false);
      if (target != null) {
        double speed = getVelocity().length();
        Vec3d direction = target.getPos().add(0, 1, 0).subtract(getPos()).normalize();
        setVelocity(getVelocity().lerp(direction.multiply(speed), Math.min(.09, homing * .02)));
      }
    }
    HitResult hit = ProjectileUtil.getCollision(this, this::canHit);
    if (hit.getType() != HitResult.Type.MISS) {
      onCollision(hit);
      if (isRemoved()) return;
    }
    setPosition(getPos().add(getVelocity()));
    world.spawnParticles(
        new DustParticleEffect(color(polarity()), .8f),
        getX(),
        getY(),
        getZ(),
        2,
        .02,
        .02,
        .02,
        0);
  }

  @Override
  protected void onEntityHit(EntityHitResult hit) {
    var e = hit.getEntity();
    if (e instanceof PlayerEntity p
        && polarity() != 0
        && PlayerMechanics.polarity(p) == polarity()) {
      setVelocity(getVelocity().multiply(-1));
      setOwner(p);
      life = Math.min(life, 40);
      return;
    }
    e.damage(getDamageSources().thrown(this, getOwner()), damage);
    discard();
  }

  @Override
  protected void onBlockHit(BlockHitResult hit) {
    discard();
  }

  @Override
  protected void writeCustomDataToNbt(NbtCompound n) {
    super.writeCustomDataToNbt(n);
    n.putInt("Polarity", polarity());
    n.putFloat("Damage", damage);
    n.putInt("Life", life);
    n.putDouble("Homing", homing);
    n.putDouble("AtlasGravity", gravity);
  }

  @Override
  protected void readCustomDataFromNbt(NbtCompound n) {
    super.readCustomDataFromNbt(n);
    polarity(n.getInt("Polarity"));
    damage = n.getFloat("Damage");
    life = n.getInt("Life");
    homing = n.getDouble("Homing");
    gravity = n.getDouble("AtlasGravity");
  }

  public static Vector3f color(int pol) {
    return pol > 0
        ? new Vector3f(.93f, .34f, .34f)
        : pol < 0 ? new Vector3f(.28f, .58f, .93f) : new Vector3f(.68f, .9f, .82f);
  }
}
