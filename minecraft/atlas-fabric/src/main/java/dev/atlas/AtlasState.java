package dev.atlas;

import java.util.*;
import net.minecraft.nbt.*;
import net.minecraft.registry.RegistryWrapper;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.world.PersistentState;

/** All progression is world-owned, survives reloads, and is shared by co-op players. */
public final class AtlasState extends PersistentState {
  public final Set<String> completed = new HashSet<>(), claimed = new HashSet<>();
  public final Map<String, Integer> puzzles = new HashMap<>();
  public final Map<String, Long> escapes = new HashMap<>();

  public static AtlasState get(ServerWorld w) {
    return w.getPersistentStateManager()
        .getOrCreate(new Type<>(AtlasState::new, AtlasState::read, null), "atlas_adventures");
  }

  private static AtlasState read(NbtCompound n, RegistryWrapper.WrapperLookup lookup) {
    var s = new AtlasState();
    for (var v : n.getList("completed", NbtElement.STRING_TYPE)) s.completed.add(v.asString());
    for (var v : n.getList("claimed", NbtElement.STRING_TYPE)) s.claimed.add(v.asString());
    var p = n.getCompound("puzzles");
    for (var k : p.getKeys()) s.puzzles.put(k, p.getInt(k));
    var e = n.getCompound("escapes");
    for (var k : e.getKeys()) s.escapes.put(k, e.getLong(k));
    return s;
  }

  @Override
  public NbtCompound writeNbt(NbtCompound n, RegistryWrapper.WrapperLookup lookup) {
    var c = new NbtList();
    completed.stream().sorted().forEach(v -> c.add(NbtString.of(v)));
    n.put("completed", c);
    var cl = new NbtList();
    claimed.stream().sorted().forEach(v -> cl.add(NbtString.of(v)));
    n.put("claimed", cl);
    var p = new NbtCompound();
    puzzles.forEach(p::putInt);
    n.put("puzzles", p);
    var e = new NbtCompound();
    escapes.forEach(e::putLong);
    n.put("escapes", e);
    return n;
  }

  public void complete(String id) {
    if (completed.add(id)) markDirty();
  }

  public void puzzle(String id, int value) {
    puzzles.put(id, value);
    markDirty();
  }
}
