package dev.atlas;

import com.google.gson.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import org.mozilla.javascript.*;

/**
 * Runs the original Atlas reducers. No rewritten attack-selection rules and no Java access from
 * scripts.
 */
public final class BossLogic {
  private static final ThreadLocal<ScriptableObject> SCOPES =
      ThreadLocal.withInitial(
          () -> {
            try (var context = Context.enter()) {
              context.setLanguageVersion(Context.VERSION_ES6);
              context.setOptimizationLevel(-1);
              context.setClassShutter(name -> false);
              var scope = context.initSafeStandardObjects();
              try (var reader =
                  new InputStreamReader(
                      SourceData.stream("logic/bosses.js"), StandardCharsets.UTF_8)) {
                context.evaluateReader(scope, reader, "atlas-main-bosses", 1, null);
              }
              return scope;
            } catch (IOException e) {
              throw new UncheckedIOException(e);
            }
          });

  public static JsonObject step(String kind, JsonObject state, JsonObject input) {
    try (var context = Context.enter()) {
      context.setLanguageVersion(Context.VERSION_ES6);
      context.setOptimizationLevel(-1);
      var scope = SCOPES.get();
      var api = (Scriptable) ScriptableObject.getProperty(scope, "AtlasCore");
      var fn = (Function) ScriptableObject.getProperty(api, "step");
      Object value =
          fn.call(
              context,
              scope,
              api,
              new Object[] {kind, state == null ? null : state.toString(), input.toString()});
      return JsonParser.parseString(Context.toString(value)).getAsJsonObject();
    }
  }

  public static JsonObject input(String type) {
    var o = new JsonObject();
    o.addProperty("type", type);
    return o;
  }
}
