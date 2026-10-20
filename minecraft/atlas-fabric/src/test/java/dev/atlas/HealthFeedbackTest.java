package dev.atlas;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

final class HealthFeedbackTest {
  @Test
  void nativeHealthUsesAtlasThresholdsAndCadence() {
    assertTrue(HealthFeedback.active(false, 8, 20));
    assertTrue(HealthFeedback.active(true, 9, 20));
    assertFalse(HealthFeedback.active(false, 9, 20));
    assertFalse(HealthFeedback.active(true, 10, 20));
    assertFalse(HealthFeedback.active(true, 0, 20));
    assertEquals(72, HealthFeedback.bpm(8, 20), 1e-12);
    assertEquals(114, HealthFeedback.bpm(1, 20), 1e-12);
  }
}
