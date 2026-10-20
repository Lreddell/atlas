package dev.atlas;

import com.google.gson.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.GZIPInputStream;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.*;
import net.minecraft.block.*;
import net.minecraft.block.entity.ChestBlockEntity;
import net.minecraft.entity.*;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.*;
import net.minecraft.particle.*;
import net.minecraft.registry.*;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.*;
import net.minecraft.util.math.*;
import net.minecraft.world.*;
import net.minecraft.world.chunk.Chunk;

public final class Vaults {
  public record Run(int lo, int hi, int block, int meta) {}

  public record Blueprint(Map<Long, List<Run>> columns, JsonObject layout) {}

  public record Site(BlockPos center, int rotation, int variant, int dy, long seed) {
    public String id() {
      return "vault:" + center.getX() + ":" + center.getZ();
    }

    public BlockPos world(int x, int y, int z) {
      return switch (rotation) {
        case 1 -> new BlockPos(center.getX() - z, y + dy, center.getZ() + x);
        case 2 -> new BlockPos(center.getX() - x, y + dy, center.getZ() - z);
        case 3 -> new BlockPos(center.getX() + z, y + dy, center.getZ() - x);
        default -> new BlockPos(center.getX() + x, y + dy, center.getZ() + z);
      };
    }

    public BlockPos world(JsonObject o) {
      return world(o.get("x").getAsInt(), o.get("y").getAsInt(), o.get("z").getAsInt());
    }

    public BlockPos local(BlockPos p) {
      int x = p.getX() - center.getX(), z = p.getZ() - center.getZ();
      return switch (rotation) {
        case 1 -> new BlockPos(z, p.getY() - dy, -x);
        case 2 -> new BlockPos(-x, p.getY() - dy, -z);
        case 3 -> new BlockPos(-z, p.getY() - dy, x);
        default -> new BlockPos(x, p.getY() - dy, z);
      };
    }

    public JsonObject layout() {
      return BLUEPRINTS[variant].layout;
    }
  }

  public static final Blueprint[] BLUEPRINTS = new Blueprint[3];
  private static final Map<String, Site> SITES = new ConcurrentHashMap<>();
  private static final Map<String, Long> ACTIVE_ROOMS = new HashMap<>();
  private static final Map<String, Playback> PLAYBACK = new HashMap<>();

  private record Playback(Site site, JsonObject descriptor, int[] notes, long start) {}

  private static long key(int x, int z) {
    return ((long) x << 32) | (z & 0xffffffffL);
  }

  public static void init() {
    for (int v = 0; v < 3; v++)
      try (var in =
          new DataInputStream(
              new GZIPInputStream(SourceData.stream("generation/vault-" + v + ".bin.gz")))) {
        int count = in.readInt();
        var cols = new HashMap<Long, List<Run>>();
        for (int c = 0; c < count; c++) {
          int x = in.readShort(), z = in.readShort(), n = in.readUnsignedShort();
          var runs = new ArrayList<Run>();
          for (int i = 0; i < n; i++)
            runs.add(
                new Run(
                    in.readShort(),
                    in.readShort(),
                    in.readUnsignedShort(),
                    in.readUnsignedShort()));
          cols.put(key(x, z), runs);
        }
        BLUEPRINTS[v] =
            new Blueprint(
                cols, SourceData.json("generation/vault-layout-" + v + ".json").getAsJsonObject());
      } catch (IOException e) {
        throw new UncheckedIOException(e);
      }
    PlayerBlockBreakEvents.BEFORE.register(
        (w, p, pos, state, be) -> p.isCreative() || !protectedAt((ServerWorld) w, pos, state));
    PlayerBlockBreakEvents.AFTER.register(
        (w, p, pos, state, be) -> {
          if (Content.path(state).equals("magnetic_shield_crystal"))
            for (var boss :
                w.getEntitiesByClass(
                    AtlasBoss.class, new Box(pos).expand(180), b -> b.kind().equals("warden")))
              boss.crystalBroken(pos);
        });
    UseBlockCallback.EVENT.register(
        (p, w, hand, hit) -> {
          if (!w.isClient
              && !p.isCreative()
              && p.getStackInHand(hand).getItem() instanceof BlockItem
              && protectedAt(
                  (ServerWorld) w,
                  hit.getBlockPos().offset(hit.getSide()),
                  Blocks.AIR.getDefaultState())) {
            p.sendMessage(
                Text.literal("The domain is sealed. Its guardian must fall first."), true);
            return ActionResult.FAIL;
          }
          return ActionResult.PASS;
        });
    ServerTickEvents.END_WORLD_TICK.register(Vaults::tick);
    net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents.SERVER_STOPPED.register(
        server -> {
          ACTIVE_ROOMS.clear();
          PLAYBACK.clear();
          SITES.clear();
          VaultHazards.reset();
        });
  }

  public static BlockPos candidate(int cx, int cz, long seed) {
    int s = (int) seed;
    double ux = Integer.toUnsignedLong(FieldMath.vaultHash(s, cx, cz, 11)) / 4294967295.0,
        uz = Integer.toUnsignedLong(FieldMath.vaultHash(s, cx, cz, 17)) / 4294967295.0;
    int x = cx * 1536 + 288 + (int) Math.floor(ux * 960),
        z = cz * 1536 + 288 + (int) Math.floor(uz * 960);
    if (Math.hypot(x, z) < 1200
        || Integer.remainderUnsigned(FieldMath.vaultHash(s, cx, cz, 23), 4) != 0
        || !FieldMath.touching(x - 288, z - 288, x + 288, z + 288, seed, 492).isEmpty())
      return null;
    return new BlockPos(x, 0, z);
  }

  public static int nativeSurface(ServerWorld w, int x, int z) {
    return w.getChunkManager()
            .getChunkGenerator()
            .getHeight(
                x, z, Heightmap.Type.WORLD_SURFACE_WG, w, w.getChunkManager().getNoiseConfig())
        - 1;
  }

  public static Site site(ServerWorld w, BlockPos c) {
    String id = w.getSeed() + ":" + c.getX() + ":" + c.getZ();
    return SITES.computeIfAbsent(
        id,
        k -> {
          int gx = Math.floorDiv(c.getX(), 1536),
              gz = Math.floorDiv(c.getZ(), 1536),
              rot = FieldMath.vaultHash((int) w.getSeed(), gx, gz, 29) & 3,
              variant =
                  Integer.remainderUnsigned(FieldMath.vaultHash((int) w.getSeed(), gx, gz, 701), 3);
          int sx = c.getX(), sz = c.getZ();
          if (rot == 0) sz += 144;
          else if (rot == 1) sx -= 144;
          else if (rot == 2) sz -= 144;
          else sx += 144;
          int surface = nativeSurface(w, sx, sz);
          return new Site(c, rot, variant, Math.clamp(surface, 64, 98) - 70, w.getSeed());
        });
  }

  public static Site at(ServerWorld w, BlockPos p) {
    int gx = Math.floorDiv(p.getX(), 1536), gz = Math.floorDiv(p.getZ(), 1536);
    for (int x = gx - 1; x <= gx + 1; x++)
      for (int z = gz - 1; z <= gz + 1; z++) {
        var c = candidate(x, z, w.getSeed());
        if (c != null
            && Math.abs(c.getX() - p.getX()) <= 280
            && Math.abs(c.getZ() - p.getZ()) <= 280) return site(w, c);
      }
    return null;
  }

  public static JsonObject room(Site s, BlockPos p) {
    var local = s.local(p);
    for (var e : s.layout().getAsJsonArray("rooms")) {
      var r = e.getAsJsonObject();
      int x = r.get("x").getAsInt(),
          z = r.get("z").getAsInt(),
          y = r.get("y").getAsInt(),
          width = r.get("width").getAsInt(),
          depth = r.get("depth").getAsInt();
      if (Math.abs(local.getX() - x) <= width / 2
          && Math.abs(local.getZ() - z) <= depth / 2
          && local.getY() >= y - 12
          && local.getY() <= y + r.get("height").getAsInt() + 4) return r;
    }
    return null;
  }

  public static void generate(StructureWorldAccess world, Chunk chunk) {
    int sx = chunk.getPos().getStartX(),
        sz = chunk.getPos().getStartZ(),
        gx = Math.floorDiv(sx, 1536),
        gz = Math.floorDiv(sz, 1536);
    for (int cx = gx - 1; cx <= gx + 1; cx++)
      for (int cz = gz - 1; cz <= gz + 1; cz++) {
        var c = candidate(cx, cz, world.getSeed());
        if (c == null || Math.abs(c.getX() - (sx + 8)) > 285 || Math.abs(c.getZ() - (sz + 8)) > 285)
          continue;
        Site site = site(world.toServerWorld(), c);
        for (int x = sx; x <= sx + 15; x++)
          for (int z = sz; z <= sz + 15; z++) {
            var local = site.local(new BlockPos(x, 0, z));
            var runs = BLUEPRINTS[site.variant].columns.get(key(local.getX(), local.getZ()));
            if (runs == null) continue;
            for (var run : runs)
              for (int y = run.lo; y <= run.hi; y++)
                Worldgen.set(
                    chunk,
                    x,
                    y + site.dy,
                    z,
                    rotate(Content.state(run.block), site.rotation, run.meta));
          }
        for (var e : site.layout().getAsJsonArray("caches")) {
          var cache = e.getAsJsonObject();
          var p = site.world(cache);
          if (p.getX() >> 4 != chunk.getPos().x || p.getZ() >> 4 != chunk.getPos().z) continue;
          var state = Blocks.CHEST.getDefaultState();
          Worldgen.set(chunk, p.getX(), p.getY(), p.getZ(), state);
          var be = new ChestBlockEntity(p, state);
          for (var l : cache.getAsJsonArray("loot")) {
            var loot = l.getAsJsonObject();
            var def =
                Content.DEFINITIONS.values().stream()
                    .filter(d -> d.get("id").getAsInt() == loot.get("itemId").getAsInt())
                    .findFirst()
                    .orElse(null);
            if (def != null)
              be.setStack(
                  loot.get("slot").getAsInt(),
                  new ItemStack(
                      Registries.ITEM.get(Identifier.of(def.get("mc").getAsString())),
                      loot.get("count").getAsInt()));
          }
          chunk.setBlockEntity(be);
        }
        decorate(chunk, site);
        connectSurface(world.toServerWorld(), chunk, site);
      }
  }

  private static BlockState rotate(BlockState state, int rot, int metadata) {
    if (state.getBlock() instanceof SlabBlock)
      state =
          state.with(
              SlabBlock.TYPE,
              (metadata & 8) != 0
                  ? net.minecraft.block.enums.SlabType.TOP
                  : net.minecraft.block.enums.SlabType.BOTTOM);
    return state.rotate(
        switch (rot) {
          case 1 -> BlockRotation.CLOCKWISE_90;
          case 2 -> BlockRotation.CLOCKWISE_180;
          case 3 -> BlockRotation.COUNTERCLOCKWISE_90;
          default -> BlockRotation.NONE;
        });
  }

  public static boolean protectedAt(ServerWorld w, BlockPos p, BlockState state) {
    String name = Content.path(state);
    if (Set.of(
            "positive_magnetite_crystal",
            "negative_magnetite_crystal",
            "magnetic_shield_crystal",
            "echo_crystal")
        .contains(name)) return false;
    var c = FieldMath.column(p.getX(), p.getZ(), w.getSeed());
    if (c != null
        && c.arena()
        && !AtlasState.get(w).completed.contains("warden:" + c.center().x() + ":" + c.center().z()))
      return true;
    var s = at(w, p);
    if (s == null || AtlasState.get(w).completed.contains(s.id() + ":escaped")) return false;
    if (room(s, p) != null) return true;
    return inside(s, p);
  }

  public static boolean inside(Site s, BlockPos p) {
    var local = s.local(p);
    var runs = BLUEPRINTS[s.variant].columns.get(key(local.getX(), local.getZ()));
    return runs != null
        && runs.stream().anyMatch(run -> local.getY() >= run.lo - 1 && local.getY() <= run.hi + 1);
  }

  public static void use(ServerWorld world, BlockPos pos, PlayerEntity player, String kind) {
    if (kind.equals("induction_relay")) {
      var s = world.getBlockState(pos);
      int sign = s.get(AtlasBlock.TONE) == 0 ? 1 : 0;
      world.setBlockState(pos, s.with(AtlasBlock.TONE, sign));
      player.sendMessage(
          Text.literal(
              "Induction relay · "
                  + (sign == 0 ? "+ positive" : "− negative")
                  + " · "
                  + (s.get(AtlasBlock.ACTIVE) ? "powered" : "supply redstone power to activate")),
          true);
      return;
    }
    if (kind.equals("magnetic_boss_summoner")) {
      var c = FieldMath.column(pos.getX(), pos.getZ(), world.getSeed());
      BlockPos anchor = c == null ? pos.down(4) : new BlockPos(c.center().x(), 132, c.center().z());
      if (world
          .getEntitiesByClass(
              AtlasBoss.class, new Box(anchor).expand(180), e -> e.kind().equals("warden"))
          .isEmpty()) {
        String id = "warden:" + anchor.getX() + ":" + anchor.getZ();
        if (AtlasState.get(world).completed.contains(id) && !player.isSneaking()) {
          player.sendMessage(
              Text.literal("This field is unsealed. Sneak and use the altar for a rematch."), true);
          return;
        }
        var boss = AtlasEntities.WARDEN.create(world);
        boss.initializeFight(anchor, id);
        boss.refreshPositionAndAngles(
            anchor.getX() + .5, anchor.getY() + 4, anchor.getZ() + .5, 0, 0);
        world.spawnEntity(boss);
      }
      return;
    }
    var s = at(world, pos);
    if (s == null) {
      if (kind.equals("resonance_pylon")
          || kind.equals("pulse_conduit")
          || kind.equals("phase_block")
          || kind.equals("resonance_plate")) {
        world.setBlockState(pos, world.getBlockState(pos).cycle(AtlasBlock.ACTIVE));
        world.playSound(
            null,
            pos,
            Content.sound("resonant_vault.resonator_pulse_1"),
            SoundCategory.BLOCKS,
            .5f,
            1);
        for (var p : BlockPos.iterateOutwards(pos, 8, 4, 8)) {
          var b = world.getBlockState(p);
          if (b.getBlock() == Content.block("pulse_conduit")
              || b.getBlock() == Content.block("phase_block"))
            world.setBlockState(p, b.cycle(AtlasBlock.ACTIVE));
        }
      }
      return;
    }
    var r = room(s, pos);
    if (r == null) return;
    String roomId = r.get("id").getAsString(), key = s.id() + ":" + roomId;
    var state = AtlasState.get(world);
    if (r.get("kind").getAsString().equals("fractured_archive")) {
      harmonic(world, s, r, key, pos, player);
      return;
    }
    if (kind.equals("sentinel_core")) {
      if (!state.completed.contains(s.id() + ":titan")) {
        player.sendMessage(Text.literal("The core is bound to the Bell Titan."), true);
        return;
      }
      if (state.claimed.add(s.id())) {
        player.giveItemStack(new ItemStack(Content.item("echo_core"), 3));
        state.escapes.put(s.id(), world.getTime() + 8400);
        state.markDirty();
        broadcast(
            world,
            s,
            "The vault unravels. Seven minutes remain. The grand ascent is guarded; the fracture"
                + " stair is shorter and hazardous.");
        sound(world, pos, "escape_start");
      }
      return;
    }
    JsonObject puzzle = null;
    for (var el : s.layout().getAsJsonArray("puzzles"))
      if (el.getAsJsonObject().get("roomId").getAsString().equals(roomId))
        puzzle = el.getAsJsonObject();
    if (puzzle == null) {
      player.sendMessage(
          Text.literal(
              "Explore both circuits. Clear the guardians and tune each chamber to release the"
                  + " inner seal."),
          false);
      return;
    }
    if (state.completed.contains(key)) {
      player.sendMessage(Text.literal("This chamber is in harmony."), true);
      return;
    }
    String type = puzzle.get("kind").getAsString();
    var local = s.local(pos);
    var cells = puzzle.getAsJsonArray("responseCells");
    int index = -1;
    double nearest = Double.MAX_VALUE;
    for (int i = 0; i < cells.size(); i++) {
      var p = cells.get(i).getAsJsonObject();
      double d =
          local.getSquaredDistance(
              new Vec3i(p.get("x").getAsInt(), p.get("y").getAsInt(), p.get("z").getAsInt()));
      if (d < nearest) {
        nearest = d;
        index = i;
      }
    }
    if (type.equals("memory_choir")) {
      int[] notes = notes(s);
      if (nearest > 2
          || kind.equals("listening_stone")
          || pos.isWithinDistance(s.world(puzzle.getAsJsonObject("activation")), 1.5)) {
        PLAYBACK.put(key, new Playback(s, puzzle, notes, world.getTime()));
        state.puzzle(key, 0);
        player.sendMessage(
            Text.literal(
                "Memory Choir: listen, watch the four pillars, then repeat all six notes. Use the"
                    + " central stone to replay."),
            false);
        return;
      }
      if (PLAYBACK.containsKey(key)) return;
      int step = state.puzzles.getOrDefault(key, 0);
      if (index == notes[Math.min(step, notes.length - 1)]) {
        state.puzzle(key, ++step);
        sound(world, pos, "pylon_correct_" + (index % 3 + 1));
        if (step == notes.length) complete(world, s, key, puzzle);
      } else {
        state.puzzle(key, 0);
        sound(world, pos, "pylon_wrong");
        player.sendMessage(
            Text.literal("The choir resets. The central stone replays the melody."), true);
      }
    } else if (type.equals("counterweight_gallery")) {
      var controls = puzzle.getAsJsonArray("mechanismControls");
      int switchIndex = 0;
      double best = Double.MAX_VALUE;
      for (int i = 0; i < controls.size(); i++) {
        double d = pos.getSquaredDistance(s.world(controls.get(i).getAsJsonObject()));
        if (d < best) {
          switchIndex = i;
          best = d;
        }
      }
      int mask = state.puzzles.getOrDefault(key, 0) ^ (1 << switchIndex),
          target =
              1 + (int) (FieldMath.hash(s.center.getX(), 99, s.center.getZ(), (int) s.seed) * 7);
      state.puzzle(key, mask);
      player.sendMessage(
          Text.literal(
              "Counterweights: "
                  + (Integer.bitCount(mask))
                  + " banks engaged. Inscription: "
                  + Integer.toBinaryString(target | 8).substring(1)
                  + " (1 = raised)."),
          false);
      for (int i = 0; i < cells.size(); i++) {
        BlockPos p = s.world(cells.get(i).getAsJsonObject());
        if (world.isChunkLoaded(p))
          world.setBlockState(
              p,
              Content.block("phase_block")
                  .getDefaultState()
                  .with(AtlasBlock.ACTIVE, mask == target || (mask & (1 << ((i / 3) % 3))) != 0));
      }
      if (mask == target)
        player.sendMessage(
            Text.literal("The bridge holds. Reach the high landing to seal the harmony."), false);
    } else if (type.equals("acoustic_relay")) {
      int solved = state.puzzles.getOrDefault(key, 0);
      if (nearest <= 3) {
        int need = (index + s.variant) % 4;
        var b = world.getBlockState(pos);
        if (b.contains(AtlasBlock.TONE)) {
          int tone = (b.get(AtlasBlock.TONE) + 1) % 4;
          world.setBlockState(pos, b.with(AtlasBlock.TONE, tone));
          if (tone == need) solved |= 1 << index;
          else solved &= ~(1 << index);
          state.puzzle(key, solved);
          player.sendMessage(
              Text.literal(
                  "Relay "
                      + (index + 1)
                      + ": "
                      + new String[] {"North", "East", "South", "West"}[tone]
                      + ". Carving points "
                      + new String[] {"North", "East", "South", "West"}[need]
                      + "."),
              true);
        }
      }
      solved = 0;
      for (int i = 0; i < cells.size(); i++) {
        var at = s.world(cells.get(i).getAsJsonObject());
        var b = world.getBlockState(at);
        if (b.contains(AtlasBlock.TONE) && b.get(AtlasBlock.TONE) == (i + s.variant) % 4) {
          solved |= 1 << i;
          world.setBlockState(at, b.with(AtlasBlock.ACTIVE, true));
          world.spawnParticles(
              ParticleTypes.END_ROD,
              at.getX() + .5,
              at.getY() + 1.5,
              at.getZ() + .5,
              5,
              .1,
              .3,
              .1,
              .01);
        }
      }
      state.puzzle(key, solved);
      if (solved == (1 << cells.size()) - 1) complete(world, s, key, puzzle);
      else
        player.sendMessage(
            Text.literal(
                "Acoustic Relay: rotate every receiver to face its carved direction. The striker"
                    + " sends a visible pulse through aligned receivers."),
            false);
    } else
      player.sendMessage(
          Text.literal(
              "The broken crossing pulses in three beats. Move between the solid islands; a fall"
                  + " returns you to your last landing."),
          false);
  }

  private static int[] notes(Site s) {
    int[] n = new int[6];
    for (int i = 0; i < n.length; i++)
      n[i] = (int) (FieldMath.hash(s.center.getX(), i + 114, s.center.getZ(), (int) s.seed) * 4);
    return n;
  }

  private static void complete(ServerWorld w, Site s, String key, JsonObject puzzle) {
    var st = AtlasState.get(w);
    st.complete(key);
    sound(w, s.world(puzzle.getAsJsonObject("completion")), "wing_complete");
    broadcast(w, s, puzzle.get("kind").getAsString().replace('_', ' ') + " is in harmony.");
    for (var e : puzzle.getAsJsonArray("responseCells")) {
      var p = s.world(e.getAsJsonObject());
      var b = w.getBlockState(p);
      if (b.contains(AtlasBlock.ACTIVE)) w.setBlockState(p, b.with(AtlasBlock.ACTIVE, true));
    }
    openIfReady(w, s);
  }

  private static boolean ready(AtlasState st, Site s) {
    for (var e : s.layout().getAsJsonArray("rooms")) {
      var r = e.getAsJsonObject();
      if (r.get("id").getAsString().startsWith("major_")
          && !st.completed.contains(s.id() + ":" + r.get("id").getAsString())) return false;
    }
    return true;
  }

  public static void openIfReady(ServerWorld w, Site s) {
    if (!ready(AtlasState.get(w), s)) return;
    for (var e : s.layout().getAsJsonArray("doorways")) {
      var door = e.getAsJsonObject();
      if (!door.has("gate") || !door.get("gate").getAsString().equals("inner_seal")) continue;
      for (var p : door.getAsJsonArray("opening"))
        w.setBlockState(s.world(p.getAsJsonObject()), Blocks.AIR.getDefaultState());
    }
    AtlasState.get(w).complete(s.id() + ":open");
    sound(w, s.center, "seal_release");
  }

  public static void bossDefeated(ServerWorld w, AtlasBoss boss) {
    var st = AtlasState.get(w);
    st.complete(boss.fightId());
    if (boss.kind().equals("titan")) {
      var s = at(w, boss.getBlockPos());
      if (s != null) {
        for (var e : s.layout().getAsJsonArray("doorways")) {
          var d = e.getAsJsonObject();
          if (d.has("gate"))
            for (var p : d.getAsJsonArray("opening"))
              w.setBlockState(s.world(p.getAsJsonObject()), Blocks.AIR.getDefaultState());
        }
        broadcast(w, s, "The Bell Titan falls. Claim the Sentinel Core, then reach an outlet.");
      }
    }
  }

  public static void tick(ServerWorld w) {
    if (w.getRegistryKey() != World.OVERWORLD) return;
    long t = w.getTime();
    var iterator = PLAYBACK.entrySet().iterator();
    while (iterator.hasNext()) {
      var entry = iterator.next();
      var play = entry.getValue();
      long elapsed = t - play.start;
      int step = (int) (elapsed / 16);
      if (step >= play.notes.length) {
        iterator.remove();
        continue;
      }
      if (elapsed % 16 == 0) {
        var cell =
            play.descriptor.getAsJsonArray("responseCells").get(play.notes[step]).getAsJsonObject();
        var p = play.site.world(cell);
        sound(w, p, "pylon_correct_" + (play.notes[step] % 3 + 1));
        w.spawnParticles(
            ParticleTypes.END_ROD, p.getX() + .5, p.getY() + 2, p.getZ() + .5, 14, .2, .5, .2, .03);
        broadcast(w, play.site, "♪ " + (play.notes[step] + 1));
      }
    }
    var st = AtlasState.get(w);
    for (var player : w.getPlayers()) {
      var s = at(w, player.getBlockPos());
      if (s == null) continue;
      Long escapeEnd = st.escapes.get(s.id());
      if (escapeEnd != null && !st.completed.contains(s.id() + ":escaped"))
        VaultHazards.tick(w, s, player, escapeEnd);
      if (t % 10 != 0) continue;
      var r = room(s, player.getBlockPos());
      if (r == null) continue;
      String id = r.get("id").getAsString(),
          kind = r.get("kind").getAsString(),
          key = s.id() + ":" + id;
      if (r.has("waves")
          && !r.getAsJsonArray("waves").isEmpty()
          && (!kind.equals("grand_ascent") || escapeEnd != null)
          && !st.completed.contains(key)) {
        tickCombatRoom(w, s, r, key);
      }
      for (var e : s.layout().getAsJsonArray("puzzles")) {
        var p = e.getAsJsonObject();
        if (!p.get("roomId").getAsString().equals(id)
            || !p.get("kind").getAsString().equals("broken_crossing")
            || st.completed.contains(key)) continue;
        var cells = p.getAsJsonArray("responseCells");
        for (int i = 0; i < cells.size(); i++) {
          BlockPos b = s.world(cells.get(i).getAsJsonObject());
          boolean solid = (t / 30 + i) % 3 != 0;
          for (int dx = -1; dx <= 1; dx++)
            for (int dz = -1; dz <= 1; dz++)
              if (w.isChunkLoaded(b))
                w.setBlockState(
                    b.add(dx, 0, dz),
                    solid
                        ? Content.block("phase_block")
                            .getDefaultState()
                            .with(AtlasBlock.ACTIVE, true)
                        : Blocks.AIR.getDefaultState());
        }
        var finish = s.world(p.getAsJsonObject("completion"));
        if (player.getPos().squaredDistanceTo(Vec3d.ofCenter(finish)) < 16) complete(w, s, key, p);
        if (player.getY() < s.world(r).getY() - 5) {
          BlockPos recover = s.world(p.getAsJsonArray("recoveryAnchors").get(0).getAsJsonObject());
          player.teleport(
              w, recover.getX() + .5, recover.getY() + 1, recover.getZ() + .5, player.getYaw(), 0);
          player.fallDistance = 0;
        }
      }
      if (kind.equals("counterweight_gallery") && !st.completed.contains(key)) {
        int target =
            1 + (int) (FieldMath.hash(s.center.getX(), 99, s.center.getZ(), (int) s.seed) * 7);
        for (var e : s.layout().getAsJsonArray("puzzles")) {
          var p = e.getAsJsonObject();
          if (p.get("roomId").getAsString().equals(id)
              && st.puzzles.getOrDefault(key, 0) == target
              && player
                      .getPos()
                      .squaredDistanceTo(Vec3d.ofCenter(s.world(p.getAsJsonObject("completion"))))
                  < 9) complete(w, s, key, p);
        }
      }
      if (kind.equals("arena")
          && ready(st, s)
          && !st.completed.contains(s.id() + ":titan")
          && w.getEntitiesByClass(
                  AtlasBoss.class, new Box(s.world(r)).expand(100), b -> b.kind().equals("titan"))
              .isEmpty()) {
        var boss = AtlasEntities.TITAN.create(w);
        var anchor = s.world(r);
        boss.initializeFight(anchor, s.id() + ":titan");
        boss.refreshPositionAndAngles(
            anchor.getX() + .5, anchor.getY() + 1, anchor.getZ() - 7.5, 0, 0);
        w.spawnEntity(boss);
      }
    }
  }

  public static BlockPos harmonicCell(Site s, JsonObject room, int index) {
    return s.world(
        room.get("x").getAsInt() - room.get("width").getAsInt() / 2 + 1,
        room.get("y").getAsInt() + 2 + (index / 3) * 2,
        room.get("z").getAsInt() - 2 + (index % 3) * 2);
  }

  private static void harmonic(
      ServerWorld w, Site s, JsonObject room, String key, BlockPos used, PlayerEntity player) {
    var st = AtlasState.get(w);
    if (st.completed.contains(key)) {
      player.sendMessage(Text.literal("The archive is silent. Its harmony is preserved."), true);
      return;
    }
    int selected = -1;
    for (int i = 0; i < 9; i++) if (harmonicCell(s, room, i).equals(used)) selected = i;
    if (selected < 0) {
      player.sendMessage(
          Text.literal(
              "Harmonic Lock: nine voices on the wall. A press reverses itself and its neighbours."
                  + " Silence every light."),
          false);
      return;
    }
    int mask =
        st.puzzles.getOrDefault(
            key, HarmonicLock.scramble(s.center.getX(), s.center.getZ(), (int) s.seed));
    mask = HarmonicLock.press(mask, selected);
    st.puzzle(key, mask);
    for (int i = 0; i < 9; i++)
      w.setBlockState(
          harmonicCell(s, room, i),
          Content.block("resonance_pylon")
              .getDefaultState()
              .with(AtlasBlock.ACTIVE, (mask & (1 << i)) != 0));
    sound(w, used, "resonator_pulse_" + (selected % 3 + 1));
    if (mask == 0) {
      st.complete(key);
      player.giveItemStack(new ItemStack(Content.item("echo_core")));
      sound(w, used, "wing_complete");
      broadcast(w, s, "The Harmonic Lock falls silent.");
      openIfReady(w, s);
    } else player.sendMessage(Text.literal(Integer.bitCount(mask) + " voices remain."), true);
  }

  private static void decorate(Chunk chunk, Site s) {
    for (var el : s.layout().getAsJsonArray("rooms")) {
      var room = el.getAsJsonObject();
      String kind = room.get("kind").getAsString();
      if (kind.equals("spire")
          || kind.startsWith("outlet_")
          || kind.contains("ascent")
          || kind.contains("stair")) continue;
      int x = room.get("x").getAsInt(),
          z = room.get("z").getAsInt(),
          y = room.get("y").getAsInt(),
          width = room.get("width").getAsInt(),
          depth = room.get("depth").getAsInt(),
          h = room.get("height").getAsInt();
      for (int dx : new int[] {-width / 2 + 3, width / 2 - 3})
        for (int dz : new int[] {-depth / 2 + 3, depth / 2 - 3}) {
          var base = s.world(x + dx, y + 1, z + dz);
          Worldgen.set(
              chunk,
              base.getX(),
              base.getY(),
              base.getZ(),
              Blocks.WAXED_WEATHERED_CHISELED_COPPER.getDefaultState());
          var lamp = s.world(x + dx, y + 3, z + dz);
          Worldgen.set(
              chunk,
              lamp.getX(),
              lamp.getY(),
              lamp.getZ(),
              Content.block("resonant_lamp").getDefaultState());
        }
      for (int dx : new int[] {-width / 4, width / 4})
        for (int dz : new int[] {-depth / 4, depth / 4}) {
          for (int by = y + 7; by < y + h - 1; by++) {
            var at = s.world(x + dx, by, z + dz);
            Worldgen.set(
                chunk,
                at.getX(),
                at.getY(),
                at.getZ(),
                by == y + 7
                    ? Content.block("resonant_lamp").getDefaultState()
                    : Blocks.CHAIN.getDefaultState());
          }
        }
      if (kind.equals("fractured_archive")) {
        int mask = HarmonicLock.scramble(s.center.getX(), s.center.getZ(), (int) s.seed);
        for (int i = 0; i < 9; i++) {
          var at = harmonicCell(s, room, i);
          Worldgen.set(
              chunk,
              at.getX(),
              at.getY(),
              at.getZ(),
              Content.block("resonance_pylon")
                  .getDefaultState()
                  .with(AtlasBlock.ACTIVE, (mask & (1 << i)) != 0));
        }
      }
    }
  }

  private static void connectSurface(ServerWorld w, Chunk chunk, Site s) {
    for (var e : s.layout().getAsJsonArray("rooms")) {
      var r = e.getAsJsonObject();
      String kind = r.get("kind").getAsString();
      if (!kind.equals("spire") && !kind.startsWith("outlet_")) continue;
      int x = r.get("x").getAsInt(),
          z = r.get("z").getAsInt(),
          floor = kind.equals("spire") ? 70 : r.get("y").getAsInt();
      var at = s.world(x, floor, z);
      if (Math.abs(chunk.getPos().getStartX() + 8 - at.getX()) > 14
          || Math.abs(chunk.getPos().getStartZ() + 8 - at.getZ()) > 14) continue;
      int terrain = nativeSurface(w, at.getX(), at.getZ()) - s.dy();
      if (kind.equals("spire") && Math.abs(terrain - floor) <= 2) continue;
      int lo = Math.min(terrain, floor),
          hi = Math.max(terrain, floor),
          clear = Math.max(floor + 32, terrain + 6);
      for (int dx = -4; dx <= 4; dx++)
        for (int dz = -4; dz <= 4; dz++)
          for (int y = lo - 2; y <= clear; y++) {
            var p = s.world(x + dx, y, z + dz);
            if (Math.abs(dx) == 4 || Math.abs(dz) == 4) {
              Worldgen.set(
                  chunk,
                  p.getX(),
                  p.getY(),
                  p.getZ(),
                  y <= hi + 3
                      ? Content.block("echo_bricks").getDefaultState()
                      : Blocks.AIR.getDefaultState());
            } else
              Worldgen.set(
                  chunk,
                  p.getX(),
                  p.getY(),
                  p.getZ(),
                  y < lo
                      ? Content.block("echo_stone").getDefaultState()
                      : Blocks.AIR.getDefaultState());
          }
      var path = new ArrayList<BlockPos>();
      for (int dx = -2; dx < 2; dx++) path.add(new BlockPos(dx, 0, -2));
      for (int dz = -2; dz < 2; dz++) path.add(new BlockPos(2, 0, dz));
      for (int dx = 2; dx > -2; dx--) path.add(new BlockPos(dx, 0, 2));
      for (int dz = 2; dz > -2; dz--) path.add(new BlockPos(-2, 0, dz));
      for (int y = lo; y <= hi; y++) {
        int step = Math.floorMod(y - lo, 16);
        var p = path.get(step);
        var next = path.get((step + 1) % 16);
        var direction =
            next.getX() > p.getX()
                ? Direction.EAST
                : next.getX() < p.getX()
                    ? Direction.WEST
                    : next.getZ() > p.getZ() ? Direction.SOUTH : Direction.NORTH;
        var worldPos = s.world(x + p.getX(), y, z + p.getZ());
        Worldgen.set(
            chunk,
            worldPos.getX(),
            worldPos.getY(),
            worldPos.getZ(),
            rotate(
                Content.block("echo_stone_stairs")
                    .getDefaultState()
                    .with(StairsBlock.FACING, direction),
                s.rotation,
                0));
        if ((y - lo) % 8 == 0) {
          var lamp = s.world(x, y + 2, z);
          Worldgen.set(
              chunk,
              lamp.getX(),
              lamp.getY(),
              lamp.getZ(),
              Content.block("resonant_lamp").getDefaultState());
        }
      }
      for (int dx = -4; dx <= 4; dx++)
        for (int dz = -4; dz <= 4; dz++)
          if (Math.abs(dx) > 2 || Math.abs(dz) > 2) {
            for (int landing : new int[] {lo, hi}) {
              var p = s.world(x + dx, landing, z + dz);
              Worldgen.set(
                  chunk,
                  p.getX(),
                  p.getY(),
                  p.getZ(),
                  Content.block("echo_bricks").getDefaultState());
            }
          }
      // Each landing needs a walkable doorway through the shaft's retaining wall.
      for (int landing : new int[] {lo, hi})
        for (int side = 0; side < 4; side++)
          for (int width = -1; width <= 1; width++)
            for (int y = 1; y <= 3; y++) {
              var p =
                  s.world(
                      x + (side < 2 ? width : side == 2 ? -4 : 4),
                      landing + y,
                      z + (side < 2 ? side == 0 ? -4 : 4 : width));
              Worldgen.set(chunk, p.getX(), p.getY(), p.getZ(), Blocks.AIR.getDefaultState());
            }
    }
  }

  private static void tickCombatRoom(ServerWorld w, Site s, JsonObject room, String key) {
    var state = AtlasState.get(w);
    var alive =
        w.getEntitiesByClass(
            AtlasMob.class,
            new Box(s.center).expand(320),
            m -> m.roomId.equals(key) && m.isAlive());
    int wave = state.puzzles.getOrDefault(key + ":wave", 0);
    JsonArray waves = room.getAsJsonArray("waves");
    if (waves == null || waves.isEmpty()) return;
    if (!alive.isEmpty()) {
      ACTIVE_ROOMS.putIfAbsent(key, w.getTime());
      return;
    }
    boolean spawned = state.puzzles.getOrDefault(key + ":spawned", 0) == 1;
    if (spawned) {
      long since = ACTIVE_ROOMS.computeIfAbsent(key, k -> w.getTime());
      if (w.getTime() - since < 40) return;
      wave++;
      state.puzzle(key + ":wave", wave);
      state.puzzle(key + ":spawned", 0);
      ACTIVE_ROOMS.remove(key);
      if (wave >= waves.size()) {
        state.complete(key);
        sound(w, s.world(room), "wing_complete");
        openIfReady(w, s);
        return;
      }
    }
    if (w.getEntitiesByClass(AtlasMob.class, new Box(s.center).expand(300), LivingEntity::isAlive)
            .size()
        >= 12) return;
    ACTIVE_ROOMS.put(key, w.getTime());
    state.puzzle(key + ":spawned", 1);
    var center = s.world(room);
    var roster = waves.get(Math.min(wave, waves.size() - 1)).getAsJsonArray();
    for (int i = 0; i < roster.size(); i++) {
      var type =
          switch (roster.get(i).getAsString()) {
            case "vault_marksman" -> AtlasEntities.MARKSMAN;
            case "bell_hound" -> AtlasEntities.HOUND;
            case "tollkeeper" -> AtlasEntities.TOLLKEEPER;
            default -> AtlasEntities.GUARD;
          };
      var mob = type.create(w);
      mob.roomId = key;
      mob.refreshPositionAndAngles(
          center.getX() - 5 + (i % 3) * 5,
          center.getY() + 1,
          center.getZ() - 4 + (i / 3) * 8,
          0,
          0);
      w.spawnEntity(mob);
    }
    broadcast(
        w,
        s,
        "Sentinel wave " + (wave + 1) + ". Read their windups and use the pillars for cover.");
    sound(w, center, "sentinel_spawn");
  }

  public static void sound(ServerWorld w, BlockPos p, String sound) {
    w.playSound(null, p, Content.sound("resonant_vault." + sound), SoundCategory.HOSTILE, .65f, 1);
  }

  private static void broadcast(ServerWorld w, Site s, String message) {
    for (var p : w.getPlayers())
      if (Math.abs(p.getX() - s.center.getX()) < 320 && Math.abs(p.getZ() - s.center.getZ()) < 320)
        p.sendMessage(Text.literal(message), false);
  }
}
