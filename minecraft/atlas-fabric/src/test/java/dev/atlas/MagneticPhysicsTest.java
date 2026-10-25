package dev.atlas;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class MagneticPhysicsTest {
  @Test
  void finiteFalloffAndExactRange() {
    assertEquals(0, MagneticPhysics.strength(0, .01));
    assertEquals(0, MagneticPhysics.strength(5, .01));
    assertEquals(0, MagneticPhysics.strength(6, .01));
    assertTrue(MagneticPhysics.strength(1, .01) > MagneticPhysics.strength(2, .01));
    assertTrue(Double.isFinite(MagneticPhysics.strength(.1, .01)));
  }

  @Test
  void ironBackingHasNarrowForwardCone() {
    assertEquals(4, MagneticPhysics.cone(1), 1e-9);
    assertEquals(.01, MagneticPhysics.cone(-1));
    assertEquals(.01, MagneticPhysics.cone(Math.cos(Math.PI / 6)));
    assertTrue(MagneticPhysics.cone(.99) > MagneticPhysics.cone(.95));
  }
}
