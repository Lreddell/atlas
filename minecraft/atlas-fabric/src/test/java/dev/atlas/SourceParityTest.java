package dev.atlas;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.*;
import org.junit.jupiter.api.Test;

final class SourceParityTest {
  @Test
  void shelfHeightsAndWarpedBoundariesMatchAtlas() {
    for (var e : SourceData.json("generation/golden-columns.json").getAsJsonArray()) {
      var row = e.getAsJsonObject();
      var actual =
          FieldMath.column(
              row.get("x").getAsInt(), row.get("z").getAsInt(), row.get("seed").getAsInt());
      if (row.get("column").isJsonNull()) {
        assertNull(actual);
        continue;
      }
      assertNotNull(actual);
      var c = row.getAsJsonObject("column");
      assertEquals(c.get("surfaceY").getAsInt(), actual.height());
      assertEquals(c.get("tier").getAsInt(), actual.tier());
      assertEquals(c.get("isArena").getAsBoolean(), actual.arena());
      assertEquals(c.get("edgeDistance").getAsDouble(), actual.edge(), 1e-10);
    }
  }

  @Test
  void absentTowerIsAValidHoverState() {
    var input = BossLogic.input("configure");
    input.addProperty("crystals", 4);
    var state = BossLogic.step("warden", null, input).getAsJsonObject("state");
    assertEquals(-1, SourceData.integer(state, "contestTower", -1));
  }

  @Test
  void fieldLocationsAndNoiseMatchAtlasMain() {
    for (var value : SourceData.json("generation/golden.json").getAsJsonArray()) {
      var f = value.getAsJsonObject();
      int seed = f.get("seed").getAsInt(), x = f.get("x").getAsInt(), z = f.get("z").getAsInt();
      assertEquals(
          f.get("noise").getAsDouble(), FieldMath.noise(seed).sample(x * .011, z * .011), 1e-12);
      var nearest = FieldMath.nearest(x, z, seed);
      assertEquals(f.getAsJsonObject("nearest").get("centerX").getAsInt(), nearest.x());
      assertEquals(f.getAsJsonObject("nearest").get("centerZ").getAsInt(), nearest.z());
    }
  }

  @Test
  void wardenRequiresCrystalsAndTraversesAllThreeForms() {
    var in = BossLogic.input("configure");
    in.addProperty("crystals", 4);
    JsonObject s = BossLogic.step("warden", null, in).getAsJsonObject("state");
    assertEquals(1, s.get("shieldLayers").getAsInt());
    var hit = BossLogic.input("damage");
    hit.addProperty("amount", 400);
    hit.addProperty("playerPolarity", -1);
    s = BossLogic.step("warden", s, hit).getAsJsonObject("state");
    assertEquals(400, s.get("hp").getAsInt());
    for (int i = 0; i < 4; i++) {
      var broken = BossLogic.input("crystal-broken");
      broken.addProperty("crystal", i);
      s = BossLogic.step("warden", s, broken).getAsJsonObject("state");
    }
    for (int n = 0; n < 2000 && !s.get("action").getAsString().equals("death"); n++) {
      var tick = BossLogic.input("tick");
      tick.addProperty("dt", .05);
      tick.addProperty("playerDistance", 6);
      s = BossLogic.step("warden", s, tick).getAsJsonObject("state");
      for (int i = 0; i < 4; i++) {
        var broken = BossLogic.input("crystal-broken");
        broken.addProperty("crystal", i);
        s = BossLogic.step("warden", s, broken).getAsJsonObject("state");
      }
      hit.addProperty("playerPolarity", -s.get("polarity").getAsInt());
      s = BossLogic.step("warden", s, hit).getAsJsonObject("state");
    }
    assertEquals("death", s.get("action").getAsString());
    assertEquals(3, s.get("form").getAsInt());
  }

  @Test
  void titanShellCannotBeDamaged() {
    var s = BossLogic.step("titan", null, BossLogic.input("wake")).getAsJsonObject("state");
    var hit = BossLogic.input("damage");
    hit.addProperty("amount", 390);
    hit.addProperty("hitZone", "shell");
    s = BossLogic.step("titan", s, hit).getAsJsonObject("state");
    assertEquals(390, s.get("hp").getAsInt());
  }

  @Test
  void titanExposesItsCoreAndShedsBothShellsBeforeDeath() {
    var s = BossLogic.step("titan", null, BossLogic.input("wake")).getAsJsonObject("state");
    int breaks = 0, maximumPhase = 1;
    for (int n = 0; n < 10000 && !s.get("action").getAsString().equals("death"); n++) {
      var tick = BossLogic.input("tick");
      tick.addProperty("dt", .05);
      tick.addProperty("playerDistance", 7 + (n / 120 % 3) * 5);
      var transition = BossLogic.step("titan", s, tick);
      s = transition.getAsJsonObject("state");
      if (n % 8 == 0 && s.get("coreExposed").getAsBoolean()) {
        var hit = BossLogic.input("damage");
        hit.addProperty("amount", 18);
        hit.addProperty("hitZone", "core");
        transition = BossLogic.step("titan", s, hit);
        s = transition.getAsJsonObject("state");
        for (var e : transition.getAsJsonArray("events"))
          if (e.getAsJsonObject().get("type").getAsString().equals("shell-broken")) breaks++;
      }
      maximumPhase = Math.max(maximumPhase, s.get("phase").getAsInt());
    }
    assertEquals(2, breaks);
    assertEquals(3, maximumPhase);
    assertEquals("death", s.get("action").getAsString());
  }
}
