package dev.atlas;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class EncounterRulesTest {
  @Test
  void crystalProtectionIsDirectionalAndNeverImmune() {
    assertEquals(.4, EncounterRules.crystalMultiplier(10, 0, 20, 0));
    assertEquals(1, EncounterRules.crystalMultiplier(0, 10, 20, 0));
    assertEquals(1, EncounterRules.crystalMultiplier(-10, 0, 20, 0));
  }

  @Test
  void nativeWardenTakesOrdinaryDamageWithCrystalsAndMatchingPolarity() {
    var state =
        BossLogic.play("warden", null, BossLogic.input("configure")).getAsJsonObject("state");
    var hit = BossLogic.input("damage");
    hit.addProperty("amount", 12);
    hit.addProperty("playerPolarity", state.get("polarity").getAsInt());
    var after = BossLogic.play("warden", state, hit).getAsJsonObject("state");
    assertTrue(after.get("hp").getAsDouble() < state.get("hp").getAsDouble());
  }

  @Test
  void nativeWardenDoesNotCapHitsOrDiscardThresholdOverflow() {
    var state =
        BossLogic.play("warden", null, BossLogic.input("configure")).getAsJsonObject("state");
    var hit = BossLogic.input("damage");
    hit.addProperty("amount", 190);
    hit.addProperty("playerPolarity", 0);
    var after = BossLogic.play("warden", state, hit).getAsJsonObject("state");
    assertEquals(210, after.get("hp").getAsDouble(), .001);
    assertEquals(2, after.get("form").getAsInt());
  }

  @Test
  void nativeTitanShellAllowsChipDamage() {
    var state = BossLogic.play("titan", null, BossLogic.input("wake")).getAsJsonObject("state");
    for (int i = 0; i < 100; i++) {
      var tick = BossLogic.input("tick");
      tick.addProperty("dt", .05);
      tick.addProperty("playerDistance", 7);
      state = BossLogic.play("titan", state, tick).getAsJsonObject("state");
    }
    var hit = BossLogic.input("damage");
    hit.addProperty("amount", 40);
    hit.addProperty("hitZone", "shell");
    var after = BossLogic.play("titan", state, hit).getAsJsonObject("state");
    assertEquals(state.get("hp").getAsDouble() - 10, after.get("hp").getAsDouble(), .001);
  }
}
