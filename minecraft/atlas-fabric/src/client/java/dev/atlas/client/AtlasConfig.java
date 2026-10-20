package dev.atlas.client;

import com.google.gson.GsonBuilder;
import java.nio.file.*;
import net.fabricmc.loader.api.FabricLoader;

public final class AtlasConfig {
  public boolean music = true,
      nightPitch = true,
      cinematics = true,
      atmosphere = true,
      reducedMotion = false,
      lowHealth = true;
  public int musicDelaySeconds = 5;
  public float cameraDistance = 5.5f, shoulderOffset = .65f;
  public static AtlasConfig INSTANCE = load();

  private static Path path() {
    return FabricLoader.getInstance().getConfigDir().resolve("atlas-client.json");
  }

  private static AtlasConfig load() {
    try {
      if (Files.exists(path()))
        return new GsonBuilder().create().fromJson(Files.readString(path()), AtlasConfig.class);
    } catch (Exception e) {
      dev.atlas.Atlas.LOGGER.warn("Invalid Atlas client settings; using defaults", e);
    }
    return new AtlasConfig();
  }

  public void save() {
    try {
      Files.createDirectories(path().getParent());
      Files.writeString(path(), new GsonBuilder().setPrettyPrinting().create().toJson(this));
    } catch (Exception e) {
      dev.atlas.Atlas.LOGGER.warn("Could not save Atlas settings", e);
    }
  }
}
