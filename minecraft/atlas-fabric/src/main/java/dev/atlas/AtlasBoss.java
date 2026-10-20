package dev.atlas;

import com.google.gson.*;
import java.util.*;
import net.minecraft.block.Blocks;
import net.minecraft.entity.*;
import net.minecraft.entity.attribute.*;
import net.minecraft.entity.boss.*;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.entity.data.*;
import net.minecraft.entity.mob.PathAwareEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.particle.*;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.math.*;
import net.minecraft.world.World;

public final class AtlasBoss extends PathAwareEntity {
  private static final TrackedData<String> ACTION =
      DataTracker.registerData(AtlasBoss.class, TrackedDataHandlerRegistry.STRING);
  private static final TrackedData<Integer>
      PHASE = DataTracker.registerData(AtlasBoss.class, TrackedDataHandlerRegistry.INTEGER),
      POLARITY = DataTracker.registerData(AtlasBoss.class, TrackedDataHandlerRegistry.INTEGER),
      SHIELDS = DataTracker.registerData(AtlasBoss.class, TrackedDataHandlerRegistry.INTEGER),
      ACTION_TICK = DataTracker.registerData(AtlasBoss.class, TrackedDataHandlerRegistry.INTEGER),
      CINEMATIC = DataTracker.registerData(AtlasBoss.class, TrackedDataHandlerRegistry.INTEGER);
  private JsonObject logic;
  private BlockPos anchor = BlockPos.ORIGIN;
  private String fightId = "";
  private int deathClock = 0, openingClock = 0, emptyTicks = 0;
  private long lastHit = -100;
  private Vec3d lockedDirection = new Vec3d(0, 0, 1), slamPoint = Vec3d.ZERO;
  private boolean drawing = false;
  private Impact plungeWarning;
  private final List<Wave> waves = new ArrayList<>();
  private final List<Impact> impacts = new ArrayList<>();
  private final ServerBossBar bar =
      new ServerBossBar(Text.literal("Atlas"), BossBar.Color.PURPLE, BossBar.Style.PROGRESS);

  private static final class Wave {
    Vec3d pos;
    double radius, max, speed;
    float damage;
    int polarity;
    Set<UUID> hit = new HashSet<>();

    Wave(Vec3d p, double r, double max, double speed, float damage, int pol) {
      this.pos = p;
      this.radius = r;
      this.max = max;
      this.speed = speed;
      this.damage = damage;
      this.polarity = pol;
    }
  }

  private static final class Impact {
    Vec3d pos;
    double radius;
    int delay, life;
    float damage;
    boolean tracking;

    Impact(Vec3d p, double r, int d, int l, float damage) {
      pos = p;
      radius = r;
      delay = d;
      life = l;
      this.damage = damage;
    }
  }

  public AtlasBoss(EntityType<? extends AtlasBoss> type, World world) {
    super(type, world);
    setPersistent();
    setAiDisabled(true);
    setNoGravity(true);
    experiencePoints = 650;
  }

  public static DefaultAttributeContainer.Builder attributes(double hp) {
    return createMobAttributes()
        .add(EntityAttributes.GENERIC_MAX_HEALTH, hp)
        .add(EntityAttributes.GENERIC_MOVEMENT_SPEED, .26)
        .add(EntityAttributes.GENERIC_ATTACK_DAMAGE, 8)
        .add(EntityAttributes.GENERIC_FOLLOW_RANGE, 128)
        .add(EntityAttributes.GENERIC_KNOCKBACK_RESISTANCE, 1);
  }

  @Override
  protected void initDataTracker(DataTracker.Builder b) {
    super.initDataTracker(b);
    b.add(ACTION, "idle");
    b.add(PHASE, 1);
    b.add(POLARITY, 1);
    b.add(SHIELDS, 0);
    b.add(ACTION_TICK, 0);
    b.add(CINEMATIC, 0);
  }

  public String kind() {
    return getType() == AtlasEntities.TITAN ? "titan" : "warden";
  }

  public String action() {
    return dataTracker.get(ACTION);
  }

  public int phase() {
    return dataTracker.get(PHASE);
  }

  public int polarity() {
    return kind().equals("warden") ? dataTracker.get(POLARITY) : 0;
  }

  public int shields() {
    return dataTracker.get(SHIELDS);
  }

  public int actionTick() {
    return dataTracker.get(ACTION_TICK);
  }

  public int cinematic() {
    return dataTracker.get(CINEMATIC);
  }

  public BlockPos anchor() {
    return anchor;
  }

  public String fightId() {
    return fightId;
  }

  public void initializeFight(BlockPos anchor, String id) {
    this.anchor = anchor;
    fightId = id;
    openingClock = 1;
    apply(kind().equals("warden") ? configure() : BossLogic.input("wake"));
  }

  private JsonObject configure() {
    var i = BossLogic.input("configure");
    i.addProperty("crystals", 4);
    return i;
  }

  private void apply(JsonObject input) {
    var t = BossLogic.play(kind(), logic, input);
    logic = t.getAsJsonObject("state");
    for (var event : t.getAsJsonArray("events")) event(event.getAsJsonObject());
    sync();
  }

  private void sync() {
    if (logic == null) return;
    dataTracker.set(ACTION, logic.get("action").getAsString());
    dataTracker.set(
        PHASE, SourceData.integer(logic, kind().equals("warden") ? "form" : "phase", 1));
    dataTracker.set(POLARITY, SourceData.integer(logic, "polarity", 0));
    dataTracker.set(
        SHIELDS,
        SourceData.integer(
            logic,
            "shieldLayers",
            logic.has("coreExposed") && logic.get("coreExposed").getAsBoolean() ? 0 : 1));
    dataTracker.set(ACTION_TICK, (int) (SourceData.number(logic, "actionTime", 0) * 20));
    setHealth((float) Math.max(1, SourceData.number(logic, "hp", getMaxHealth())));
    bar.setPercent(Math.clamp(getHealth() / getMaxHealth(), 0, 1));
    bar.setName(
        Text.literal(
            kind().equals("warden")
                ? "Magnetic Warden · "
                    + new String[] {"Warden", "Aegis", "Storm"}[phase() - 1]
                    + (shields() > 0 ? " · " + shields() + " directional wards" : " · Exposed")
                : "Bell Titan · " + (shields() == 0 ? "Core exposed" : "Resonant shell")));
    bar.setColor(
        polarity() > 0
            ? BossBar.Color.RED
            : polarity() < 0 ? BossBar.Color.BLUE : BossBar.Color.PURPLE);
  }

  @Override
  public void tick() {
    super.tick();
    if (getWorld().isClient) return;
    var world = (ServerWorld) getWorld();
    if (logic == null) {
      initializeFight(getBlockPos().down(), kind() + ":" + getUuid());
    }
    if (action().equals("death")) {
      protectCinematicPlayers(world);
      dataTracker.set(CINEMATIC, -(++deathClock));
      if (deathClock == 1) {
        Vaults.bossDefeated(world, this);
        cleanupEncounter(world);
        if (kind().equals("warden")) RegionProgress.victory(world, this);
        for (var minion :
            world.getEntitiesByClass(
                AtlasMob.class,
                getBoundingBox().expand(200),
                m -> m.roomId.equals(fightId + ":minion"))) minion.discard();
        for (var bolt :
            world.getEntitiesByClass(
                AtlasBolt.class, getBoundingBox().expand(200), b -> b.getOwner() == this))
          bolt.discard();
        sound(kind().equals("warden") ? "magnetic_warden.defeat" : "resonant_vault.titan_death");
        for (var p : world.getPlayers())
          if (p.squaredDistanceTo(this) < 180 * 180) Network.sendCue(p, "defeat", getId(), kind());
      }
      if (deathClock % 10 == 0)
        world.spawnParticles(ParticleTypes.END_ROD, getX(), getY() + 2, getZ(), 30, 2, 2, 2, .03);
      if (deathClock >= 110) {
        dropStack(
            new ItemStack(
                Content.item(kind().equals("warden") ? "polarity_boots_upgrade" : "titan_hammer")));
        ExperienceOrbEntity.spawn(world, getPos(), 650);
        bar.clearPlayers();
        discard();
      }
      return;
    }
    if (openingClock > 0 && openingClock <= 80) {
      protectCinematicPlayers(world);
      dataTracker.set(CINEMATIC, openingClock++);
      if (openingClock == 2)
        for (var p : world.getPlayers())
          if (p.squaredDistanceTo(this) < 180 * 180) Network.sendCue(p, "intro", getId(), kind());
      if (openingClock > 80) {
        dataTracker.set(CINEMATIC, 0);
        openingClock = 0;
      }
      return;
    }
    var target =
        world.getClosestPlayer(
            anchor.getX(),
            anchor.getY(),
            anchor.getZ(),
            128,
            p ->
                p instanceof PlayerEntity player
                    && player.isAlive()
                    && !player.isSpectator()
                    && !player.isCreative());
    if (target == null) {
      if (EncounterRules.abandoned(++emptyTicks)) {
        cleanupEncounter(world);
        discard();
      }
      return;
    }
    emptyTicks = 0;
    lookAtEntity(target, 360, 360);
    Vec3d facing =
        (action().endsWith("windup") || action().endsWith("active"))
            ? lockedDirection
            : target.getPos().subtract(getPos());
    setYaw((float) (MathHelper.atan2(facing.z, facing.x) * 180 / Math.PI) - 90);
    bodyYaw = getYaw();
    headYaw = getYaw();
    if (action().endsWith("windup") && actionTick() == 0)
      lockedDirection = target.getPos().subtract(getPos()).multiply(1, 0, 1).normalize();
    var input = BossLogic.input("tick");
    input.addProperty("dt", .05);
    input.addProperty("playerDistance", distanceTo(target));
    if (kind().equals("warden")) {
      for (int i = 0; i < 4; i++) {
        var tower = tower(i);
        if (Math.hypot(target.getX() - tower.getX(), target.getZ() - tower.getZ()) < 7
            && target.getY() > anchor.getY() + 1) {
          input.addProperty("playerTower", i);
          break;
        }
      }
    }
    apply(input);
    moveFight(world, target);
    telegraph(world);
    tickHazards(world);
    if (kind().equals("warden")) {
      int pol = PlayerMechanics.polarity(target);
      Vec3d delta = getPos().add(0, 2, 0).subtract(target.getPos());
      double dist = delta.length();
      if (dist > 1 && dist < 12 && pol != 0) {
        double relation = pol == polarity() ? -1 : 1, force = drawing ? .13 : .018;
        target.addVelocity(delta.normalize().multiply(force * relation));
        target.velocityModified = true;
      }
    }
  }

  private void cleanupEncounter(ServerWorld world) {
    waves.clear();
    impacts.clear();
    drawing = false;
    for (var e :
        world.getEntitiesByClass(
            AtlasBolt.class,
            new Box(anchor).expand(220),
            b -> b.getOwner() == this || b.encounter.equals(getUuidAsString()))) e.discard();
    for (var e :
        world.getEntitiesByClass(
            AtlasMob.class, new Box(anchor).expand(200), m -> m.roomId.equals(fightId + ":minion")))
      e.discard();
    if (kind().equals("warden"))
      for (int i = 0; i < 4; i++) {
        var p = tower(i);
        var state = world.getBlockState(p);
        if (state.isOf(Content.block("magnetic_shield_crystal")))
          world.setBlockState(p, state.with(AtlasBlock.ACTIVE, false));
      }
    bar.clearPlayers();
  }

  private void moveFight(ServerWorld world, PlayerEntity target) {
    String a = action();
    if (kind().equals("warden") && (a.equals("plunge_windup") || a.equals("plunge_drop"))) {
      Vec3d desired = slamPoint.add(0, a.equals("plunge_windup") ? phase() == 3 ? 16 : 5 : 0, 0);
      move(
          MovementType.SELF,
          desired.subtract(getPos()).multiply(a.equals("plunge_drop") ? .6 : .13));
    } else if (kind().equals("warden") && phase() == 2 && shields() > 0) {
      Vec3d point = target.getPos();
      int tower = SourceData.integer(logic, "contestTower", -1);
      if (tower >= 0) point = Vec3d.ofCenter(tower(tower));
      Vec3d desired =
          Vec3d.ofCenter(anchor)
              .add(point.subtract(Vec3d.ofCenter(anchor)).multiply(.3))
              .add(0, tower >= 0 ? 18 : 8, 0);
      move(MovementType.SELF, desired.subtract(getPos()).multiply(.05));
    } else if (a.equals("charge_active")
        || a.equals("advance_active")
        || a.equals("vaultbreaker_active"))
      move(MovementType.SELF, lockedDirection.multiply(kind().equals("warden") ? 1.1 : .8));
    else if (a.equals("idle")
        || a.equals("hover")
        || a.equals("spiral")
        || a.endsWith("recovery")) {
      Vec3d d = target.getPos().subtract(getPos()).multiply(1, 0, 1);
      double speed = kind().equals("titan") ? .26 : phase() == 3 ? .09 : .19;
      if (d.length() > 5) move(MovementType.SELF, d.normalize().multiply(speed));
      var below = getBlockPos().down();
      if (world.getBlockState(below).isAir()
          || world.getBlockState(below).getBlock() == Blocks.LAVA) {
        Vec3d safe = Vec3d.ofCenter(anchor).add(0, kind().equals("warden") ? 4 : 1, 0);
        move(MovementType.SELF, safe.subtract(getPos()).multiply(.1));
      } else if (getY() > anchor.getY() + 4.5) move(MovementType.SELF, new Vec3d(0, -.15, 0));
    }
    setVelocity(Vec3d.ZERO);
  }

  public BlockPos tower(int i) {
    double a = Math.PI / 4 + i * Math.PI / 2;
    return new BlockPos(
        anchor.getX() + (int) Math.floor(Math.cos(a) * 35 + .5),
        anchor.getY() + 28,
        anchor.getZ() + (int) Math.floor(Math.sin(a) * 35 + .5));
  }

  public void crystalBroken(BlockPos pos) {
    for (int i = 0; i < 4; i++)
      if (tower(i).isWithinDistance(pos, 4)) {
        var input = BossLogic.input("crystal-broken");
        input.addProperty("crystal", i);
        apply(input);
        return;
      }
  }

  private void event(JsonObject e) {
    if (!(getWorld() instanceof ServerWorld world)) return;
    String type = e.get("type").getAsString();
    switch (type) {
      case "action" -> {
        String a = e.get("action").getAsString();
        if (a.endsWith("windup")) {
          var target = world.getClosestPlayer(this, 128);
          if (target != null) {
            lockedDirection = target.getPos().subtract(getPos()).multiply(1, 0, 1).normalize();
            if (a.startsWith("slam") || a.startsWith("plunge")) slamPoint = target.getPos();
          }
        }
        if (a.equals("swap_windup")) sound("magnetic_warden.hum");
        if (a.endsWith("windup") && kind().equals("titan")) sound("resonant_vault.titan_chain_1");
      }
      case "crystals" -> {
        if (e.has("crystals"))
          for (var el : e.getAsJsonArray("crystals")) {
            int i = el.getAsInt();
            world.setBlockState(
                tower(i),
                Content.block("magnetic_shield_crystal")
                    .getDefaultState()
                    .with(AtlasBlock.ACTIVE, true));
            setTowerPolarity(world, i, SourceData.integer(e, "polarity", 1));
          }
        sound("magnetic_warden.crystal_spawn");
      }
      case "polarity" -> {
        for (var i : e.getAsJsonArray("towers"))
          setTowerPolarity(world, i.getAsInt(), e.get("polarity").getAsInt());
        for (var p : world.getPlayers())
          if (p.squaredDistanceTo(this) < 180 * 180) PlayerMechanics.motion(p).magnetGrace = 7;
        sound("magnetic_warden.hum");
      }
      case "beat-tick" -> sound("magnetic_warden.hum");
      case "volley" -> {
        var spec = e.getAsJsonObject("spec");
        volley(
            world,
            SourceData.integer(spec, "count", 3),
            SourceData.number(spec, "spread", .3),
            SourceData.number(spec, "speed", 16),
            SourceData.number(spec, "damage", 2),
            SourceData.number(spec, "ttl", 5),
            SourceData.number(spec, "homing", 0),
            SourceData.integer(e, "polarity", 1));
      }
      case "spiral-bolt" -> {
        double angle = e.get("angle").getAsDouble();
        fire(
            world,
            new Vec3d(Math.sin(angle), .01, Math.cos(angle)),
            SourceData.number(e, "speed", 11),
            SourceData.number(e, "damage", 1),
            80,
            SourceData.number(e, "homing", 0),
            SourceData.integer(e, "polarity", 1));
      }
      case "shard-volley" -> volley(world, 4, .4, 14, 3, 3, 1, polarity());
      case "lash" ->
          melee(
              world,
              SourceData.number(e, "range", 4.5),
              SourceData.number(e, "halfAngle", .87),
              (float) SourceData.number(e, "damage", 8),
              false);
      case "charge" -> melee(world, 15, .2, (float) SourceData.number(e, "damage", 12), true);
      case "repel" ->
          melee(
              world,
              SourceData.number(e, "radius", 5),
              Math.PI,
              (float) SourceData.number(e, "damage", 9),
              false);
      case "draw" -> drawing = e.get("active").getAsBoolean();
      case "shockwave" -> {
        waves.add(
            new Wave(
                getPos(),
                SourceData.number(e, "startRadius", 0),
                SourceData.number(e, "maxRadius", SourceData.number(e, "endRadius", 24)),
                SourceData.number(e, "speed", 16),
                (float) SourceData.number(e, "damage", 6),
                SourceData.integer(e, "polarity", 0)));
        sound(kind().equals("warden") ? "magnetic_warden.slam" : "resonant_vault.titan_toll");
      }
      case "plunge" -> {
        String p = e.get("phase").getAsString();
        if (p.equals("mark")) {
          var target = world.getClosestPlayer(this, 128);
          if (target != null) slamPoint = target.getPos();
          plungeWarning =
              new Impact(
                  slamPoint,
                  SourceData.number(e, "impactRadius", 3.2),
                  SourceData.integer(logic, "form", 1) == 3 ? 38 : 23,
                  6,
                  (float) SourceData.number(e, "impactDamage", 12));
          plungeWarning.tracking = true;
          impacts.add(plungeWarning);
          sound("magnetic_warden.slam_rise");
        } else if (p.equals("impact")) {
          if (plungeWarning != null) plungeWarning.delay = 0;
          sound("magnetic_warden.slam");
        }
      }
      case "strike" -> {
        String attack = e.get("attack").getAsString();
        melee(
            world,
            attack.equals("chain_lash") ? 12 : attack.equals("advance") ? 20 : 9,
            attack.equals("chain_lash") ? 1.92 : 1.31,
            (float) SourceData.number(e, "damage", 8),
            attack.equals("advance"));
        sound("resonant_vault.titan_sweep");
      }
      case "impact" -> {
        var target = world.getClosestPlayer(this, 128);
        Vec3d at =
            e.has("anchor") && e.get("anchor").getAsString().equals("player") && target != null
                ? target.getPos()
                : getPos();
        at =
            at.add(lockedDirection.multiply(SourceData.number(e, "forwardOffset", 0)))
                .add(
                    new Vec3d(-lockedDirection.z, 0, lockedDirection.x)
                        .multiply(SourceData.number(e, "lateralOffset", 0)));
        impacts.add(
            new Impact(
                at,
                SourceData.number(e, "radius", 3),
                (int) (20 * SourceData.number(e, "warningSeconds", 1)),
                (int) (20 * SourceData.number(e, "activeSeconds", .2)),
                (float) SourceData.number(e, "damage", 8)));
      }
      case "lane" -> {
        double length = SourceData.number(e, "length", 24),
            offset = SourceData.number(e, "lateralOffset", 0);
        Vec3d axis = lockedDirection.rotateY((float) SourceData.number(e, "yawOffset", 0));
        for (int i = 0; i < length; i += 3)
          impacts.add(
              new Impact(
                  getPos()
                      .add(axis.multiply(i))
                      .add(new Vec3d(-axis.z, 0, axis.x).multiply(offset)),
                  SourceData.number(e, "halfWidth", 1.5),
                  (int) (20 * SourceData.number(e, "warningSeconds", 1)),
                  6,
                  (float) SourceData.number(e, "damage", 6)));
      }
      case "core" ->
          sound(
              e.get("open").getAsBoolean()
                  ? "resonant_vault.titan_core_open"
                  : "resonant_vault.titan_chain_2");
      case "shell-broken" -> {
        sound("resonant_vault.titan_shell_break");
        int stage = e.get("stage").getAsInt();
        var progress = AtlasState.get(world);
        if (!progress.completed.contains(fightId + ":reinforcements:" + getUuid() + ":" + stage)) {
          progress.complete(fightId + ":reinforcements:" + getUuid() + ":" + stage);
          var roster =
              SourceData.json("titan-reinforcements.json")
                  .getAsJsonArray()
                  .get(stage - 1)
                  .getAsJsonArray();
          for (int i = 0; i < roster.size(); i++) {
            var minionType =
                switch (roster.get(i).getAsString()) {
                  case "vault_marksman" -> AtlasEntities.MARKSMAN;
                  case "bell_hound" -> AtlasEntities.HOUND;
                  case "tollkeeper" -> AtlasEntities.TOLLKEEPER;
                  default -> AtlasEntities.GUARD;
                };
            var minion = minionType.create(world);
            minion.roomId = fightId + ":minion";
            double angle = i * Math.PI * 2 / roster.size();
            minion.refreshPositionAndAngles(
                anchor.getX() + .5 + Math.cos(angle) * 12,
                anchor.getY() + 1,
                anchor.getZ() + .5 + Math.sin(angle) * 12,
                0,
                0);
            world.spawnEntity(minion);
          }
        }
        world.spawnParticles(
            new BlockStateParticleEffect(
                ParticleTypes.BLOCK, Blocks.WEATHERED_COPPER.getDefaultState()),
            getX(),
            getY() + 3,
            getZ(),
            65,
            2,
            2,
            2,
            .08);
      }
      case "blocked", "deflected" ->
          sound(
              kind().equals("warden")
                  ? "magnetic_warden.shielded"
                  : "resonant_vault.bolt_deflect_1");
      case "hurt" ->
          sound(kind().equals("warden") ? "magnetic_warden.hurt" : "resonant_vault.titan_hurt_1");
      case "shield-broken" -> {
        sound("magnetic_warden.deflect");
        world.spawnParticles(ParticleTypes.END_ROD, getX(), getY() + 2, getZ(), 60, 2, 2, 2, .04);
      }
      default -> {}
    }
  }

  private void setTowerPolarity(ServerWorld world, int i, int polarity) {
    var p = tower(i);
    for (int y = anchor.getY() - 7; y < anchor.getY() + 27; y++)
      for (int dx = -3; dx <= 3; dx++)
        for (int dz = -3; dz <= 3; dz++) {
          var b = new BlockPos(p.getX() + dx, y, p.getZ() + dz);
          String n = Content.path(world.getBlockState(b));
          if (n.equals("positive_magnet") || n.equals("negative_magnet"))
            world.setBlockState(
                b,
                Content.block(polarity > 0 ? "positive_magnet" : "negative_magnet")
                    .getDefaultState());
        }
  }

  private void volley(
      ServerWorld w,
      int count,
      double spread,
      double speed,
      double damage,
      double ttl,
      double homing,
      int polarity) {
    var target = w.getClosestPlayer(this, 128);
    if (target == null) return;
    Vec3d direction = target.getPos().add(0, 1, 0).subtract(getPos().add(0, 2.5, 0)).normalize();
    for (int i = 0; i < count; i++)
      fire(
          w,
          direction.rotateY((float) ((i - (count - 1) / 2.0) * spread)),
          speed,
          damage,
          (int) (ttl * 20),
          homing,
          polarity);
  }

  private void fire(
      ServerWorld w,
      Vec3d dir,
      double speed,
      double damage,
      int life,
      double homing,
      int polarity) {
    var bolt = AtlasEntities.BOLT.create(w);
    bolt.setOwner(this);
    bolt.encounter = getUuidAsString();
    bolt.setPosition(getPos().add(0, 2.5, 0));
    bolt.setVelocity(dir.multiply(speed / 20));
    bolt.damage = (float) damage;
    bolt.life = life;
    bolt.homing = homing;
    bolt.polarity(polarity);
    w.spawnEntity(bolt);
  }

  private void melee(ServerWorld w, double range, double halfAngle, float damage, boolean lane) {
    for (var p : w.getPlayers()) {
      Vec3d d = p.getPos().subtract(getPos());
      if (d.length() > range || Math.abs(d.y) > 5) continue;
      double dot = d.multiply(1, 0, 1).normalize().dotProduct(lockedDirection);
      if (lane
          ? Math.abs(d.x * lockedDirection.z - d.z * lockedDirection.x) < 2 && dot > 0
          : dot >= Math.cos(halfAngle)) p.damage(getDamageSources().mobAttack(this), damage);
    }
  }

  private void tickHazards(ServerWorld w) {
    var it = waves.iterator();
    while (it.hasNext()) {
      var a = it.next();
      a.radius += a.speed / 20;
      if (a.radius > a.max) {
        it.remove();
        continue;
      }
      ring(w, a.pos, a.radius, a.polarity);
      for (var p : w.getPlayers()) {
        double dist = Math.hypot(p.getX() - a.pos.x, p.getZ() - a.pos.z);
        if (Math.abs(dist - a.radius) < 1.1
            && Math.abs(p.getY() - a.pos.y) < 1.4
            && a.hit.add(p.getUuid())) {
          if (a.polarity != 0 && PlayerMechanics.polarity(p) == -a.polarity) continue;
          p.damage(getDamageSources().mobAttack(this), a.damage);
          if (a.polarity != 0 && PlayerMechanics.polarity(p) == a.polarity) {
            p.addVelocity(0, .65, 0);
            p.velocityModified = true;
          }
        }
      }
    }
    var impactsIterator = impacts.iterator();
    while (impactsIterator.hasNext()) {
      var a = impactsIterator.next();
      if (a.tracking && a.delay > 17) {
        var target = w.getClosestPlayer(this, 128);
        if (target != null) {
          Vec3d horizontal = target.getPos().subtract(Vec3d.ofCenter(anchor)).multiply(1, 0, 1);
          if (horizontal.length() > 20) horizontal = horizontal.normalize().multiply(20);
          a.pos =
              new Vec3d(
                  anchor.getX() + .5 + horizontal.x,
                  target.getY(),
                  anchor.getZ() + .5 + horizontal.z);
          slamPoint = a.pos;
        }
      } else a.tracking = false;
      if (a.delay-- > 0) {
        if (a.delay % 3 == 0) ring(w, a.pos, a.radius, a.delay < 17 ? 0 : polarity());
        continue;
      }
      if (a.life-- <= 0) {
        impactsIterator.remove();
        continue;
      }
      for (var p : w.getPlayers())
        if (p.getPos().squaredDistanceTo(a.pos) < a.radius * a.radius
            && Math.abs(p.getY() - a.pos.y) < 4)
          p.damage(getDamageSources().mobAttack(this), a.damage);
      if (a.life % 3 == 0)
        w.spawnParticles(
            ParticleTypes.POOF, a.pos.x, a.pos.y + .2, a.pos.z, 18, a.radius, .3, a.radius, .03);
    }
  }

  private void protectCinematicPlayers(ServerWorld world) {
    if (age % 5 != 0) return;
    for (var p : world.getPlayers())
      if (p.squaredDistanceTo(this) < 180 * 180)
        p.addStatusEffect(
            new net.minecraft.entity.effect.StatusEffectInstance(
                net.minecraft.entity.effect.StatusEffects.RESISTANCE, 10, 4, true, false, false));
  }

  private void telegraph(ServerWorld world) {
    if (!action().endsWith("windup") || age % 4 != 0 || action().startsWith("plunge")) return;
    boolean lane =
        action().startsWith("charge")
            || action().startsWith("advance")
            || action().startsWith("vaultbreaker");
    double radius = lane ? 14 : kind().equals("titan") ? 9 : 4.5;
    for (int i = 0; i <= 16; i++) {
      Vec3d at;
      if (lane)
        at =
            getPos()
                .add(lockedDirection.multiply(radius * i / 16))
                .add(
                    -lockedDirection.z * (i % 2 == 0 ? 1.5 : -1.5),
                    .12,
                    lockedDirection.x * (i % 2 == 0 ? 1.5 : -1.5));
      else
        at =
            getPos()
                .add(lockedDirection.rotateY((float) (-1.3 + 2.6 * i / 16)).multiply(radius))
                .add(0, .12, 0);
      world.spawnParticles(ParticleTypes.END_ROD, at.x, at.y, at.z, 1, 0, 0, 0, 0);
    }
  }

  private void ring(ServerWorld w, Vec3d p, double radius, int pol) {
    for (int i = 0; i < 48; i++) {
      double a = i * Math.PI * 2 / 48;
      w.spawnParticles(
          new DustParticleEffect(AtlasBolt.color(pol), 1.0f),
          p.x + Math.cos(a) * radius,
          p.y + .2,
          p.z + Math.sin(a) * radius,
          1,
          0,
          0,
          0,
          0);
    }
  }

  private void sound(String s) {
    getWorld().playSound(null, getBlockPos(), Content.sound(s), SoundCategory.HOSTILE, .7f, 1);
  }

  @Override
  public boolean damage(DamageSource source, float amount) {
    if (source.isOf(net.minecraft.entity.damage.DamageTypes.GENERIC_KILL)
        || source.isOf(net.minecraft.entity.damage.DamageTypes.OUT_OF_WORLD)) {
      bar.clearPlayers();
      discard();
      return true;
    }
    if (getWorld().isClient || action().equals("death")) return false;
    if (logic == null) {
      initializeFight(getBlockPos().down(), kind() + ":" + getUuid());
    }
    if (getWorld().getTime() - lastHit < 6) return false;
    var input = BossLogic.input("damage");
    double multiplier = 1;
    if (kind().equals("warden") && source.getAttacker() != null && logic.has("crystals")) {
      Vec3d attack = source.getAttacker().getPos().subtract(getPos());
      var crystals = logic.getAsJsonArray("crystals");
      for (int i = 0; i < Math.min(4, crystals.size()); i++)
        if (crystals.get(i).getAsBoolean()) {
          Vec3d crystal = Vec3d.ofCenter(tower(i)).subtract(getPos());
          multiplier =
              Math.min(
                  multiplier,
                  EncounterRules.crystalMultiplier(attack.x, attack.z, crystal.x, crystal.z));
        }
      if (multiplier < 1 && source.getAttacker() instanceof PlayerEntity p)
        p.sendMessage(
            Text.literal("Crystal ward · 60% absorbed. Flank or break its lit crystal."), true);
    }
    if (!Float.isFinite(amount) || amount <= 0) return false;
    input.addProperty("amount", amount * multiplier);
    if (kind().equals("warden")) {
      int pol = source.getAttacker() instanceof PlayerEntity p ? PlayerMechanics.polarity(p) : 0;
      input.addProperty("playerPolarity", pol);
      input.addProperty(
          "slam", source.getAttacker() instanceof PlayerEntity p && PlayerMechanics.consumeSlam(p));
    } else input.addProperty("hitZone", coreHit(source.getAttacker()) ? "core" : "shell");
    float old = (float) SourceData.number(logic, "hp", getHealth());
    apply(input);
    float after = (float) SourceData.number(logic, "hp", getHealth());
    if (after >= old) return false;
    lastHit = getWorld().getTime();
    hurtTime = 10;
    maxHurtTime = 10;
    getWorld().sendEntityStatus(this, (byte) 2);
    return true;
  }

  private boolean coreHit(Entity attacker) {
    if (!(attacker instanceof PlayerEntity p) || shields() != 0) return false;
    Vec3d o = p.getEyePos().subtract(getPos()).rotateY((float) Math.toRadians(getYaw()));
    Vec3d d = p.getRotationVec(1).rotateY((float) Math.toRadians(getYaw()));
    return new Box(-1.1, 1.48, .1, 1.1, 4.1, 2.3).raycast(o, o.add(d.multiply(8))).isPresent();
  }

  @Override
  public void onStartedTrackingBy(ServerPlayerEntity p) {
    super.onStartedTrackingBy(p);
    bar.addPlayer(p);
  }

  @Override
  public void onStoppedTrackingBy(ServerPlayerEntity p) {
    super.onStoppedTrackingBy(p);
    bar.removePlayer(p);
  }

  @Override
  public boolean isPushable() {
    return false;
  }

  @Override
  public boolean canImmediatelyDespawn(double d) {
    return false;
  }

  @Override
  public void writeCustomDataToNbt(NbtCompound n) {
    super.writeCustomDataToNbt(n);
    if (logic != null) n.putString("AtlasLogic", logic.toString());
    n.putLong("AtlasAnchor", anchor.asLong());
    n.putString("AtlasFight", fightId);
    n.putInt("AtlasDeath", deathClock);
  }

  @Override
  public void readCustomDataFromNbt(NbtCompound n) {
    super.readCustomDataFromNbt(n);
    if (n.contains("AtlasLogic"))
      logic = JsonParser.parseString(n.getString("AtlasLogic")).getAsJsonObject();
    anchor = BlockPos.fromLong(n.getLong("AtlasAnchor"));
    fightId = n.getString("AtlasFight");
    deathClock = n.getInt("AtlasDeath");
    sync();
  }
}
