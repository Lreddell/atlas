package dev.atlas;

/** A nine-note Lights Out lock. Scrambling by legal presses guarantees a solution. */
public final class HarmonicLock {
  public static int press(int state, int index) {
    int row = index / 3, col = index % 3;
    state ^= 1 << index;
    if (row > 0) state ^= 1 << (index - 3);
    if (row < 2) state ^= 1 << (index + 3);
    if (col > 0) state ^= 1 << (index - 1);
    if (col < 2) state ^= 1 << (index + 1);
    return state;
  }

  public static int scramble(int x, int z, int seed) {
    int mask = 0;
    for (int i = 0; i < 9; i++) if (FieldMath.hash(x, i + 401, z, seed) < .5) mask = press(mask, i);
    return mask == 0 ? press(0, 4) : mask;
  }

  public static int solve(int state) {
    for (int presses = 0; presses < 512; presses++) {
      int next = state;
      for (int i = 0; i < 9; i++) if ((presses & (1 << i)) != 0) next = press(next, i);
      if (next == 0) return presses;
    }
    throw new IllegalStateException("Unsolvable lock");
  }
}
