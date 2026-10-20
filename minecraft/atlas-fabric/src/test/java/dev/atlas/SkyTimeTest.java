package dev.atlas;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class SkyTimeTest {
  @Test
  void skyTimeHandlesMidnightSunriseAndNegativeTime() {
    assertFalse(SkyTime.night(6000));
    assertTrue(SkyTime.night(18000));
    assertTrue(SkyTime.night(13000));
    assertFalse(SkyTime.night(23000));
    assertTrue(SkyTime.night(-6000));
    assertTrue(SkyTime.night(42000));
  }
}
