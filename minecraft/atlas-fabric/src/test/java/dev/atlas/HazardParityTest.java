package dev.atlas;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class HazardParityTest {
  @Test
  void hazardWarningsAndCollisionMatchAtlasAtEveryTier() {
    for (var e : SourceData.json("generation/golden-hazards.json").getAsJsonArray()) {
      var f = e.getAsJsonObject();
      var sample =
          HazardMath.sample(
              f.getAsJsonObject("descriptor"),
              f.get("time").getAsDouble(),
              f.get("tier").getAsInt());
      var expected = f.getAsJsonObject("expected");
      assertEquals(expected.get("phase").getAsString(), sample.phase());
      assertEquals(expected.get("phaseProgress").getAsDouble(), sample.progress(), 1e-12);
      assertEquals(expected.get("headY").getAsDouble(), sample.headY(), 1e-12);
      assertEquals(expected.get("collisionHeight").getAsDouble(), sample.collision(), 1e-12);
      assertEquals(expected.get("platformSolid").getAsBoolean(), sample.solid());
    }
  }
}
