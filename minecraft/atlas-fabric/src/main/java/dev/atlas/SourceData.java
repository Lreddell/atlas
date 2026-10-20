package dev.atlas;

import com.google.gson.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Objects;

public final class SourceData {
  public static InputStream stream(String path) {
    return Objects.requireNonNull(
        SourceData.class.getResourceAsStream("/assets/atlas/" + path), path);
  }

  public static JsonElement json(String path) {
    try (var reader = new InputStreamReader(stream(path), StandardCharsets.UTF_8)) {
      return JsonParser.parseReader(reader);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  public static int integer(JsonObject o, String key, int fallback) {
    return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsInt() : fallback;
  }

  public static double number(JsonObject o, String key, double fallback) {
    return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsDouble() : fallback;
  }

  public static String string(JsonObject o, String key, String fallback) {
    return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : fallback;
  }
}
