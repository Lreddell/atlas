package dev.atlas;

import java.util.*;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.block.*;
import net.minecraft.block.entity.*;
import net.minecraft.block.enums.*;
import net.minecraft.entity.vehicle.AbstractMinecartEntity;
import net.minecraft.item.*;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.*;
import net.minecraft.text.Text;
import net.minecraft.util.math.*;
import net.minecraft.world.*;
import net.minecraft.world.chunk.Chunk;

/** An original, ordinary-block foundry. Machinery can be built, repaired and repurposed. */
public final class MeridianFoundry {
  public record Site(FieldMath.Center field, BlockPos origin) {
    public BlockPos at(int x, int y, int z) {
      return origin.add(x, y, z);
    }

    public String id() {
      return "foundry:" + field.x() + ":" + field.z();
    }

    public boolean contains(BlockPos p) {
      return Math.abs(p.getX() - origin.getX()) <= 32
          && Math.abs(p.getZ() - origin.getZ()) <= 14
          && p.getY() >= origin.getY()
          && p.getY() < origin.getY() + 14;
    }
  }

  public static Site site(FieldMath.Center c, long seed) {
    int x = c.x() + 192, z = c.z();
    return new Site(c, new BlockPos(x, FieldMath.column(x, z, seed).height() - 10, z));
  }

  public static Site nearest(int x, int z, long seed) {
    return site(FieldMath.nearest(x - 192, z, seed), seed);
  }

  public static void init() {
    ServerTickEvents.END_WORLD_TICK.register(
        w -> {
          if (w.getRegistryKey() != World.OVERWORLD || w.getTime() % 5 != 0) return;
          var visited = new HashSet<String>();
          for (var p : w.getPlayers()) {
            var c = FieldMath.column(p.getBlockX(), p.getBlockZ(), w.getSeed());
            if (c == null) continue;
            var s = site(c.center(), w.getSeed());
            if (!s.contains(p.getBlockPos())) continue;
            if (p.addCommandTag("atlas:foundry:" + c.center().x() + ":" + c.center().z()))
              p.sendMessage(
                  Text.literal(
                      "Meridian Foundry · Three workshops share one field law. Read the"
                          + " copper-framed signs; the supply chest contains boots and test pieces."
                          + " J holds your notes."),
                  false);
            if (visited.add(s.id())) tick(w, s);
          }
        });
  }

  public static void tick(ServerWorld w, Site s) {
    // Never load distant workshop chunks just to advance a puzzle.
    for (int x : new int[] {-30, 0, 30})
      if (!w.isChunkLoaded(s.at(x, 1, -9)) || !w.isChunkLoaded(s.at(x, 1, 9))) return;
    var state = AtlasState.get(w);
    if (!state.completed.contains(s.id() + ":sort")
        && count(w, s.at(-23, 0, 0), Items.IRON_INGOT) >= 4
        && count(w, s.at(-17, 0, 0), Content.item("negative_magnet")) >= 2)
      complete(w, s, "sort", "Separation circuit restored. Opposite signs pull; equal signs push.");

    if (!state.completed.contains(s.id() + ":rail")) {
      boolean balanced = false;
      for (var cart :
          w.getEntitiesByClass(
              AbstractMinecartEntity.class,
              new Box(Vec3d.of(s.at(-8, 0, -2)), Vec3d.of(s.at(9, 4, 3))),
              e -> true)) {
        double x = cart.getX() - s.origin().getX();
        String key = s.id() + ":cart:" + cart.getUuid();
        int route = state.puzzles.getOrDefault(key, 0);
        if (route == 0 && x < -4) state.puzzle(key, 1);
        else if (route == 1 && x > 5) state.puzzle(key, 2);
        if (route == 2 && Math.abs(x - .5) < .7 && cart.getVelocity().horizontalLength() < .045)
          balanced = true;
      }
      String hold = s.id() + ":balance";
      int ticks = balanced ? state.puzzles.getOrDefault(hold, 0) + 5 : 0;
      if (ticks != state.puzzles.getOrDefault(hold, 0)) state.puzzle(hold, ticks);
      if (ticks >= 40)
        complete(
            w,
            s,
            "rail",
            "Transit circuit restored. The carriage has crossed both end markers and settled on the"
                + " central brake.");
    }
    if (!state.completed.contains(s.id() + ":climb")
        && w.getBlockState(s.at(21, 9, -2)).isOf(Blocks.STONE_PRESSURE_PLATE)
        && w.getBlockState(s.at(21, 9, -2)).get(PressurePlateBlock.POWERED))
      complete(w, s, "climb", "Ascent circuit restored. The upper service route is open.");
    if (List.of("sort", "rail", "climb").stream()
        .allMatch(k -> state.completed.contains(s.id() + ":" + k))) {
      if (!state.completed.contains(s.id() + ":open")) {
        state.complete(s.id() + ":open");
        for (int x = -1; x <= 1; x++)
          for (int y = 1; y <= 3; y++) {
            var pos = s.at(x, y, -7);
            if (w.getBlockState(pos).isOf(Blocks.IRON_BARS))
              w.setBlockState(pos, Blocks.AIR.getDefaultState());
          }
        announce(
            w,
            s,
            "The Meridian Foundry is running. The service archive is open; its equipment is yours."
                + " Follow the ruined rail west toward the four axis towers.");
      }
    }
  }

  private static int count(ServerWorld w, BlockPos p, Item item) {
    if (!(w.getBlockEntity(p) instanceof HopperBlockEntity hopper)) return 0;
    int n = 0;
    for (int i = 0; i < hopper.size(); i++)
      if (hopper.getStack(i).isOf(item)) n += hopper.getStack(i).getCount();
    return n;
  }

  private static void complete(ServerWorld w, Site s, String circuit, String message) {
    AtlasState.get(w).complete(s.id() + ":" + circuit);
    int x = circuit.equals("sort") ? -20 : circuit.equals("rail") ? 0 : 20;
    var p = s.at(x + 5, 3, 5);
    if (w.getBlockState(p).isOf(Blocks.COPPER_BULB))
      w.setBlockState(p, Blocks.COPPER_BULB.getDefaultState().with(BulbBlock.LIT, true));
    announce(w, s, message);
  }

  private static void announce(ServerWorld w, Site s, String text) {
    for (var p : w.getPlayers())
      if (p.squaredDistanceTo(Vec3d.ofCenter(s.origin())) < 80 * 80)
        p.sendMessage(Text.literal(text), false);
    w.playSound(
        null,
        s.at(0, 2, 6),
        SoundEvents.BLOCK_AMETHYST_BLOCK_CHIME,
        SoundCategory.BLOCKS,
        .5f,
        .85f);
  }

  public static void generate(StructureWorldAccess world, Chunk chunk) {
    var cp = chunk.getPos();
    for (var c :
        FieldMath.touching(
            cp.getStartX() - 192,
            cp.getStartZ(),
            cp.getEndX() - 192,
            cp.getEndZ(),
            world.getSeed(),
            64)) {
      var s = site(c, world.getSeed());
      int ox = s.origin().getX(), oy = s.origin().getY(), oz = s.origin().getZ();
      for (int x = Math.max(-31, cp.getStartX() - ox); x <= Math.min(31, cp.getEndX() - ox); x++)
        for (int z = Math.max(-11, cp.getStartZ() - oz); z <= Math.min(11, cp.getEndZ() - oz); z++)
          for (int y = -1; y <= 11; y++) {
            boolean shell = y <= 0 || y == 11 || x == -31 || x == 31 || z == -11 || z == 11;
            boolean partition = Math.abs(x) == 10 && z < 5;
            var block =
                shell || partition
                    ? (y == 0 && (z == 6 || z == 10 || Math.floorMod(x + 10, 20) == 0)
                        ? Blocks.CUT_COPPER
                        : y == 0 ? Blocks.POLISHED_DEEPSLATE : Blocks.DEEPSLATE_BRICKS)
                    : Blocks.AIR;
            set(chunk, s, x, y, z, block.getDefaultState());
          }
      // Lit service hall, repeated copper ribs and a glazed roof above the workshops.
      for (int x = -29; x <= 29; x++) {
        if (Math.floorMod(x, 5) == 0) {
          for (int y = 1; y <= 10; y++)
            for (int z : new int[] {-10, 10})
              set(chunk, s, x, y, z, Blocks.WAXED_OXIDIZED_CUT_COPPER.getDefaultState());
          set(chunk, s, x, 5, 8, Blocks.SEA_LANTERN.getDefaultState());
        }
        for (int z = -8; z <= 3; z++)
          if (Math.floorMod(x, 20) >= 3 && Math.floorMod(x, 20) <= 17)
            set(chunk, s, x, 11, z, Blocks.TINTED_GLASS.getDefaultState());
      }
      // Copper roof trusses and basalt piers give each workshop a readable industrial frame.
      for (int room : new int[] {-20, 0, 20}) {
        for (int dx : new int[] {-8, 8})
          for (int z : new int[] {-8, 8})
            for (int y = 1; y <= 10; y++)
              set(
                  chunk,
                  s,
                  room + dx,
                  y,
                  z,
                  (y == 2 || y == 8 ? Blocks.WAXED_EXPOSED_CUT_COPPER : Blocks.POLISHED_BASALT)
                      .getDefaultState());
        for (int dx = -8; dx <= 8; dx++)
          for (int z : new int[] {-7, 7})
            set(chunk, s, room + dx, 9, z, Blocks.WAXED_EXPOSED_CUT_COPPER.getDefaultState());
        for (int dx : new int[] {-6, 6})
          for (int z : new int[] {-5, 4}) {
            for (int y = 6; y <= 8; y++)
              set(chunk, s, room + dx, y, z, Blocks.CHAIN.getDefaultState());
            set(chunk, s, room + dx, 5, z, Blocks.SEA_LANTERN.getDefaultState());
            for (int side : new int[] {-1, 1})
              set(
                  chunk,
                  s,
                  room + dx + side,
                  5,
                  z,
                  Blocks.WAXED_EXPOSED_CUT_COPPER.getDefaultState());
          }
        // Inactive coil banks and service benches are outside the moving machinery's lanes.
        for (int dx : new int[] {-6, 6}) {
          for (int y = 1; y <= 4; y++)
            set(
                chunk,
                s,
                room + dx,
                y,
                -9,
                (y % 2 == 0 ? Blocks.WAXED_OXIDIZED_CUT_COPPER : Blocks.CHISELED_DEEPSLATE)
                    .getDefaultState());
          set(chunk, s, room + dx, 5, -9, Blocks.LANTERN.getDefaultState());
        }
        for (int dx = -5; dx <= 5; dx++)
          set(chunk, s, room + dx, 0, 5, Blocks.WAXED_EXPOSED_CUT_COPPER.getDefaultState());
      }
      for (int x : new int[] {-3, 3}) set(chunk, s, x, 4, -8, Blocks.SEA_LANTERN.getDefaultState());
      // The archive can be approached only through its three-block service seal.
      for (int x = -9; x <= 9; x++)
        for (int y = 1; y <= 10; y++)
          set(
              chunk,
              s,
              x,
              y,
              -7,
              Math.abs(x) <= 1 && y <= 3
                  ? Blocks.IRON_BARS.getDefaultState()
                  : Blocks.DEEPSLATE_TILES.getDefaultState());
      for (int x : new int[] {-20, 0, 20}) {
        set(chunk, s, x + 5, 3, 5, Blocks.COPPER_BULB.getDefaultState());
        for (int y = 1; y <= 2; y++)
          set(chunk, s, x + 5, y, 5, Blocks.WAXED_EXPOSED_CUT_COPPER.getDefaultState());
        sign(
            world,
            chunk,
            s,
            x - 2,
            1,
            6,
            x == -20
                ? new String[] {
                  "I · SEPARATION", "4 iron -> LEFT", "2 negative -> RIGHT", "Drop at the centre"
                }
                : x == 0
                    ? new String[] {
                      "II · TRANSIT", "Cart: left, right,", "then centre brake", "Hold still for 2s"
                    }
                    : new String[] {
                      "III · ASCENT", "Oppose the wall", "Flip R halfway", "Reach upper plate"
                    });
      }
      // Separation: glass channel, native hoppers and deliberately switchable relays.
      for (int x = -24; x <= -16; x++) {
        for (int z : new int[] {-1, 1})
          for (int y = 1; y <= 2; y++) set(chunk, s, x, y, z, Blocks.GLASS.getDefaultState());
        if (x > -24 && x < -16)
          set(
              chunk,
              s,
              x,
              3,
              0,
              x == -20 ? Blocks.AIR.getDefaultState() : Blocks.GLASS.getDefaultState());
      }
      hopper(chunk, s, -23);
      hopper(chunk, s, -17);
      relay(chunk, s, -24, 0, 0, Direction.EAST);
      relay(chunk, s, -16, 0, 0, Direction.WEST);
      for (int z = 2; z <= 4; z++)
        for (int x = -22; x <= -18; x++)
          set(chunk, s, x, 3, z, Blocks.CUT_COPPER.getDefaultState());
      for (int i = 0; i < 3; i++)
        set(
            chunk,
            s,
            -20,
            i + 1,
            5 - i,
            Blocks.CUT_COPPER_STAIRS.getDefaultState().with(StairsBlock.FACING, Direction.NORTH));
      // Transit: a straight service line; both end stations and the middle brake are real rails.
      for (int x = -7; x <= 7; x++) {
        set(
            chunk,
            s,
            x,
            0,
            0,
            (Math.abs(x) == 5
                    ? Blocks.RED_TERRACOTTA
                    : x == 0 ? Blocks.YELLOW_TERRACOTTA : Blocks.POLISHED_DEEPSLATE)
                .getDefaultState());
        set(
            chunk,
            s,
            x,
            1,
            0,
            Blocks.RAIL.getDefaultState().with(RailBlock.SHAPE, RailShape.EAST_WEST));
      }
      set(
          chunk,
          s,
          0,
          1,
          0,
          Blocks.DETECTOR_RAIL
              .getDefaultState()
              .with(DetectorRailBlock.SHAPE, RailShape.EAST_WEST));
      relay(chunk, s, -8, 1, 0, Direction.EAST);
      relay(chunk, s, 8, 1, 0, Direction.WEST);
      relay(chunk, s, 0, 1, -3, Direction.SOUTH);
      set(chunk, s, 0, 1, -4, Blocks.POLISHED_DEEPSLATE.getDefaultState());
      // Ascent: the wall changes sign at its copper seam; an ordinary stair route is also valid.
      for (int y = 1; y <= 8; y++)
        for (int z = -4; z <= 1; z++)
          set(
              chunk,
              s,
              24,
              y,
              z,
              Content.block(y <= 4 ? "positive_magnet" : "negative_magnet").getDefaultState());
      for (int x = 20; x <= 23; x++)
        for (int z = -4; z <= -1; z++) set(chunk, s, x, 8, z, Blocks.CUT_COPPER.getDefaultState());
      set(chunk, s, 21, 9, -2, Blocks.STONE_PRESSURE_PLATE.getDefaultState());
      for (int i = 0; i < 8; i++)
        set(
            chunk,
            s,
            12 + i,
            i,
            -5,
            Blocks.DEEPSLATE_BRICK_STAIRS
                .getDefaultState()
                .with(StairsBlock.FACING, Direction.EAST));
      set(chunk, s, 19, 7, -4, Blocks.CUT_COPPER.getDefaultState());
      // Supply cache and a world-owned reward cache, not a scripted inventory grant.
      chest(
          chunk,
          s,
          -4,
          1,
          8,
          "Foundry service supplies",
          new ItemStack(Content.item("polarity_boots")),
          new ItemStack(Items.IRON_INGOT, 16),
          new ItemStack(Content.item("negative_magnet"), 4),
          new ItemStack(Items.MINECART),
          new ItemStack(Items.BREAD, 12));
      chest(
          chunk,
          s,
          0,
          1,
          -9,
          "Meridian service archive",
          new ItemStack(Content.item("induction_relay"), 8),
          new ItemStack(Content.item("echo_tuning_fork")),
          new ItemStack(Items.DIAMOND, 3),
          new ItemStack(Content.item("positive_magnetite_crystal"), 8),
          new ItemStack(Content.item("negative_magnetite_crystal"), 8));
      sign(
          world,
          chunk,
          s,
          4,
          1,
          8,
          new String[] {
            "MERIDIAN FOUNDRY", "Restore 3 circuits", "Archive beyond bars", "West: Warden towers"
          });
      sign(
          world,
          chunk,
          s,
          -22,
          4,
          3,
          new String[] {
            "USE RELAY: + / -", "Lever supplies power", "Iron responds as +", "Equal signs repel"
          });
      sign(
          world,
          chunk,
          s,
          0,
          1,
          4,
          new String[] {
            "Ends: launch / return",
            "Middle: attract brake",
            "Push or ride cart",
            "Visit both red marks"
          });
      // Broad carved staircase reaches the actual terrain, including irregular terrace lips.
      int end = 36;
      for (int d = 8; d <= 36; d++)
        if (d >= Worldgen.surface(world, ox, oz + 11 + d, world.getSeed()) - oy) {
          end = d;
          break;
        }
      for (int d = 0; d <= end; d++) {
        int z = 11 + d, y = d;
        for (int x = -2; x <= 2; x++) {
          set(
              chunk,
              s,
              x,
              y,
              z,
              Blocks.DEEPSLATE_BRICK_STAIRS
                  .getDefaultState()
                  .with(StairsBlock.FACING, Direction.SOUTH));
          for (int h = 1; h <= 5; h++) set(chunk, s, x, y + h, z, Blocks.AIR.getDefaultState());
          if (Math.abs(x) == 2 && d % 6 == 0)
            set(chunk, s, x, y + 2, z, Blocks.SEA_LANTERN.getDefaultState());
        }
      }
      // Beacon ribs stand above the entrance, visible from the eastern terraces.
      for (int x : new int[] {-4, 4})
        for (int y = 0; y <= 8; y++)
          set(
              chunk,
              s,
              x,
              end + y,
              11 + end,
              (y == 8 ? Blocks.SEA_LANTERN : Blocks.WAXED_OXIDIZED_CUT_COPPER).getDefaultState());
    }
  }

  private static void relay(Chunk chunk, Site s, int x, int y, int z, Direction inward) {
    set(chunk, s, x, y, z, Content.block("induction_relay").getDefaultState());
    var back = s.at(x, y, z).offset(inward.getOpposite());
    Worldgen.set(chunk, back.getX(), back.getY(), back.getZ(), Blocks.IRON_BLOCK.getDefaultState());
    set(
        chunk,
        s,
        x,
        y + 1,
        z,
        Blocks.LEVER.getDefaultState().with(LeverBlock.FACE, BlockFace.FLOOR));
  }

  private static void hopper(Chunk chunk, Site s, int x) {
    var p = s.at(x, 0, 0);
    if (!owns(chunk, p)) return;
    var state = Blocks.HOPPER.getDefaultState();
    set(chunk, s, x, 0, 0, state);
    chunk.setBlockEntity(new HopperBlockEntity(p, state));
  }

  private static boolean owns(Chunk c, BlockPos p) {
    return p.getX() >> 4 == c.getPos().x && p.getZ() >> 4 == c.getPos().z;
  }

  private static void set(Chunk c, Site s, int x, int y, int z, BlockState b) {
    var p = s.at(x, y, z);
    Worldgen.set(c, p.getX(), p.getY(), p.getZ(), b);
  }

  private static void chest(Chunk c, Site s, int x, int y, int z, String title, ItemStack... loot) {
    var p = s.at(x, y, z);
    if (!owns(c, p)) return;
    var b = Blocks.CHEST.getDefaultState();
    set(c, s, x, y, z, b);
    var chest = new ChestBlockEntity(p, b);
    chest.setComponents(
        net.minecraft.component.ComponentMap.builder()
            .add(net.minecraft.component.DataComponentTypes.CUSTOM_NAME, Text.literal(title))
            .build());
    for (int i = 0; i < loot.length; i++) chest.setStack(i * 2, loot[i]);
    c.setBlockEntity(chest);
  }

  private static void sign(
      StructureWorldAccess w, Chunk c, Site s, int x, int y, int z, String[] lines) {
    var p = s.at(x, y, z);
    if (!owns(c, p)) return;
    var b = Blocks.OAK_SIGN.getDefaultState();
    set(c, s, x, y, z, b);
    var sign = new SignBlockEntity(p, b);
    var text = new net.minecraft.nbt.NbtCompound();
    var messages = new net.minecraft.nbt.NbtList();
    for (int i = 0; i < 4; i++)
      messages.add(
          net.minecraft.nbt.NbtString.of(
              Text.Serialization.toJsonString(
                  Text.literal(i < lines.length ? lines[i] : ""), w.getRegistryManager())));
    text.put("messages", messages);
    text.putString("color", "white");
    text.putBoolean("has_glowing_text", true);
    var nbt = new net.minecraft.nbt.NbtCompound();
    nbt.put("front_text", text);
    nbt.put("back_text", text.copy());
    nbt.putBoolean("is_waxed", true);
    sign.read(nbt, w.getRegistryManager());
    c.setBlockEntity(sign);
  }
}
