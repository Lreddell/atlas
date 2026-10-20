package dev.atlas;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class HarmonicLockTest {
  @Test
  void cornerAndCentreHaveExpectedNeighbours() {
    assertEquals(11, HarmonicLock.press(0, 0));
    assertEquals(186, HarmonicLock.press(0, 4));
    assertEquals(0, HarmonicLock.press(HarmonicLock.press(0, 4), 4));
  }

  @Test
  void everyPossiblePanelCanBeSolved() {
    for (int initial = 0; initial < 512; initial++) {
      int sequence = HarmonicLock.solve(initial), state = initial;
      for (int i = 0; i < 9; i++)
        if ((sequence & (1 << i)) != 0) state = HarmonicLock.press(state, i);
      assertEquals(0, state, "panel " + initial);
    }
  }
}
