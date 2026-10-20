package dev.atlas;

import com.google.gson.*;
import net.minecraft.entity.*;
import net.minecraft.entity.ai.goal.*;
import net.minecraft.entity.attribute.*;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.data.*;
import net.minecraft.entity.mob.HostileEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.*;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.particle.*;
import net.minecraft.registry.Registries;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.math.*;
import net.minecraft.world.World;

public final class AtlasMob extends HostileEntity {
  private static final JsonObject PROFILES =
      SourceData.json("enemy-profiles.json").getAsJsonObject();
  private static final TrackedData<String> ACTION =
      DataTracker.registerData(AtlasMob.class, TrackedDataHandlerRegistry.STRING);
  private static final TrackedData<Integer> ACTION_TICK =
      DataTracker.registerData(AtlasMob.class, TrackedDataHandlerRegistry.INTEGER);
  public String roomId = "";
  private JsonObject attack;
  private int clock = 0, cooldown = 25, stagger = 0, guard = 0;
  private int sequence = 0;
  private boolean connected = false;
  private final java.util.Map<String, Integer> nextAttack = new java.util.HashMap<>();
  private Vec3d direction = Vec3d.ZERO;

  public AtlasMob(EntityType<? extends AtlasMob> type, World w) {
    super(type, w);
    setPersistent();
    experiencePoints = 12;
    var d = profile().getAsJsonObject("entity");
    getAttributeInstance(EntityAttributes.GENERIC_MAX_HEALTH)
        .setBaseValue(SourceData.number(d, "maxHp", 44));
    setHealth(getMaxHealth());
    getAttributeInstance(EntityAttributes.GENERIC_MOVEMENT_SPEED)
        .setBaseValue(kind().equals("bell_hound") ? .28 : .19);
  }

  public static DefaultAttributeContainer.Builder attributes() {
    return createHostileAttributes()
        .add(EntityAttributes.GENERIC_MAX_HEALTH, 44)
        .add(EntityAttributes.GENERIC_MOVEMENT_SPEED, .2)
        .add(EntityAttributes.GENERIC_ATTACK_DAMAGE, 5)
        .add(EntityAttributes.GENERIC_FOLLOW_RANGE, 48);
  }

  public String kind() {
    return Registries.ENTITY_TYPE.getId(getType()).getPath();
  }

  private JsonObject profile() {
    return PROFILES.getAsJsonObject(kind());
  }

  @Override
  protected void initGoals() {
    goalSelector.add(0, new SwimGoal(this));
    targetSelector.add(1, new RevengeGoal(this));
    targetSelector.add(2, new ActiveTargetGoal<>(this, PlayerEntity.class, true));
  }

  @Override
  protected void initDataTracker(DataTracker.Builder b) {
    super.initDataTracker(b);
    b.add(ACTION, "idle");
    b.add(ACTION_TICK, 0);
  }

  public String action() {
    return dataTracker.get(ACTION);
  }

  public int actionTick() {
    return dataTracker.get(ACTION_TICK);
  }

  public void stagger(int ticks) {
    stagger = Math.max(stagger, ticks);
    guard = 0;
    attack = null;
    dataTracker.set(ACTION, "stagger");
  }

  @Override
  public void tick() {
    super.tick();
    if (getWorld().isClient || !isAlive()) return;
    if (stagger > 0) {
      stagger--;
      getNavigation().stop();
      return;
    }
    if (cooldown > 0) cooldown--;
    if (guard > 0) guard--;
    var target = getTarget();
    if (target == null || !target.isAlive()) return;
    double distance = distanceTo(target);
    if (attack == null) lookAtEntity(target, 30, 30);
    else {
      setYaw((float) Math.toDegrees(Math.atan2(-direction.x, direction.z)));
      bodyYaw = headYaw = getYaw();
    }
    if (attack != null) {
      clock++;
      dataTracker.set(ACTION_TICK, clock);
      int wind = (int) (SourceData.number(attack, "anticipation", .7) * 20),
          active = (int) (SourceData.number(attack, "active", .2) * 20),
          recovery = (int) (SourceData.number(attack, "recovery", .8) * 20);
      if (clock < wind) {
        if (clock % 5 == 0)
          ((ServerWorld) getWorld())
              .spawnParticles(
                  ParticleTypes.END_ROD,
                  getX() + direction.x * 1.4,
                  getY() + 1.4,
                  getZ() + direction.z * 1.4,
                  2,
                  .1,
                  .1,
                  .1,
                  0);
        getNavigation().stop();
      }
      if (clock == wind) strike(target);
      if (clock >= wind && clock <= wind + active && !attack.has("projectile"))
        contact(target, (clock - wind) / (double) Math.max(1, active));
      if (clock > wind + active + recovery) {
        nextAttack.put(
            attack.get("id").getAsString(),
            age + (int) (SourceData.number(attack, "cooldownSeconds", 1) * 20));
        attack = null;
        dataTracker.set(ACTION, "idle");
        cooldown = 18;
      }
      return;
    }
    if (cooldown <= 0) {
      var actions = profile().getAsJsonArray("actions");
      for (int i = 0; i < actions.size(); i++) {
        int index = (sequence + i) % actions.size();
        var action = actions.get(index).getAsJsonObject();
        if (distance >= SourceData.number(action, "minRange", 0)
            && distance <= SourceData.number(action, "range", 4)
            && age >= nextAttack.getOrDefault(action.get("id").getAsString(), 0)
            && canSee(target)) {
          attack = action;
          clock = 0;
          connected = false;
          sequence = (index + 1) % actions.size();
          dataTracker.set(ACTION, action.get("id").getAsString());
          direction = target.getPos().subtract(getPos()).multiply(1, 0, 1).normalize();
          sound(
              kind().equals("bell_hound")
                  ? "hound_leap"
                  : kind().equals("tollkeeper")
                      ? "tollkeeper_windup"
                      : kind().equals("vault_marksman") ? "marksman_brace" : "guard_swing");
          break;
        }
      }
    }
    if (attack == null) {
      if (kind().equals("vault_marksman") && distance < 8) {
        getNavigation().stop();
        move(
            MovementType.SELF,
            getPos().subtract(target.getPos()).multiply(1, 0, 1).normalize().multiply(.08));
      } else getNavigation().startMovingTo(target, 1.0);
      if ((kind().equals("vault_guard") || kind().equals("tollkeeper")) && age % 80 == 0) {
        guard = 25;
        dataTracker.set(ACTION, "guard_block");
      }
    }
  }

  private void strike(LivingEntity target) {
    String id = attack.get("id").getAsString();
    float damage = (float) SourceData.number(attack, "damage", 5);
    double range = SourceData.number(attack, "range", 4);
    if (attack.has("projectile")) {
      var spec = attack.getAsJsonObject("projectile");
      int count = SourceData.integer(spec, "burst", 1);
      for (int i = 0; i < count; i++) {
        var bolt = AtlasEntities.BOLT.create(getWorld());
        bolt.setOwner(this);
        bolt.setPosition(getPos().add(0, 1.6, 0));
        bolt.setVelocity(
            target
                .getPos()
                .add(0, 1, 0)
                .subtract(bolt.getPos())
                .normalize()
                .rotateY((float) ((i - (count - 1) / 2.0) * .065))
                .multiply(SourceData.number(spec, "speed", 24) / 20));
        bolt.damage = damage;
        bolt.life =
            (int)
                (SourceData.number(spec, "maxDistance", 34)
                    / SourceData.number(spec, "speed", 24)
                    * 20);
        bolt.gravity = SourceData.number(spec, "gravity", 1.8) / 400;
        ((ServerWorld) getWorld()).spawnEntity(bolt);
      }
      sound("marksman_fire");
    } else {
      if (id.contains("leap") || id.contains("charge")) {
        setVelocity(direction.multiply(.7).add(0, .35, 0));
        velocityModified = true;
      }
      sound(
          kind().equals("tollkeeper")
              ? "tollkeeper_impact"
              : kind().equals("bell_hound") ? "hound_land" : "guard_swing");
    }
  }

  private void contact(LivingEntity target, double progress) {
    if (connected || !target.isAlive() || !canSee(target)) return;
    String id = attack.get("id").getAsString();
    Vec3d delta = target.getPos().subtract(getPos());
    double distance = delta.horizontalLength(), range = SourceData.number(attack, "range", 3);
    if (Math.abs(delta.y) > 2.5) return;
    if (id.equals("bell_toll")) {
      double radius = 1.5 + progress * (range - 1.5);
      ((ServerWorld) getWorld())
          .spawnParticles(
              ParticleTypes.SONIC_BOOM,
              getX() + direction.x * radius,
              getY() + .3,
              getZ() + direction.z * radius,
              1,
              0,
              0,
              0,
              0);
      if (Math.abs(distance - radius) > 1 || delta.y > .8) return;
    } else {
      if (id.contains("leap") || id.contains("charge")) range = 2.3;
      if (distance > range
          || delta.normalize().dotProduct(direction)
              < Math.cos(SourceData.number(attack, "arcRadians", 2) * .5)) return;
    }
    connected = true;
    target.damage(
        getDamageSources().mobAttack(this), (float) SourceData.number(attack, "damage", 5));
  }

  private void sound(String name) {
    getWorld()
        .playSound(
            null,
            getBlockPos(),
            Content.sound("resonant_vault." + name),
            SoundCategory.HOSTILE,
            .55f,
            1);
  }

  @Override
  public boolean damage(DamageSource source, float amount) {
    if (guard > 0 && source.getAttacker() != null && stagger <= 0) {
      Vec3d from = source.getAttacker().getPos().subtract(getPos()).normalize();
      if (getRotationVec(1).dotProduct(from) > .1) {
        sound("bolt_deflect_1");
        return false;
      }
    }
    return super.damage(source, amount);
  }

  @Override
  public void onDeath(DamageSource source) {
    super.onDeath(source);
    if (!getWorld().isClient) {
      dropStack(
          new ItemStack(
              Content.item(
                  kind().equals("vault_guard") || kind().equals("tollkeeper")
                      ? "fractured_core"
                      : "echo_shard"),
              kind().equals("tollkeeper") ? 4 : 1));
      if (kind().equals("vault_marksman")) dropStack(new ItemStack(Content.item("vault_bolt"), 3));
    }
  }

  @Override
  public boolean canImmediatelyDespawn(double d) {
    return false;
  }

  @Override
  public void writeCustomDataToNbt(NbtCompound n) {
    super.writeCustomDataToNbt(n);
    n.putString("AtlasRoom", roomId);
  }

  @Override
  public void readCustomDataFromNbt(NbtCompound n) {
    super.readCustomDataFromNbt(n);
    roomId = n.getString("AtlasRoom");
  }
}
