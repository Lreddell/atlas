package dev.atlas;

import net.fabricmc.api.ModInitializer;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class Atlas implements ModInitializer {
  public static final Logger LOGGER = LoggerFactory.getLogger("atlas");

  public static Identifier id(String path) {
    return Identifier.of("atlas", path);
  }

  @Override
  public void onInitialize() {
    Content.init();
    AtlasEntities.init();
    Worldgen.init();
    Network.init();
    Vaults.init();
    PlayerMechanics.init();
    Combat.init();
    NativeExtras.init();
    RegionProgress.init();
    AtlasCommands.init();
    AtlasSmoke.init();
    LOGGER.info("Atlas: Light & Polarity initialized from Atlas main d7444cb");
  }
}
