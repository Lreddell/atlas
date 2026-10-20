package dev.atlas.client;

import com.google.gson.*;
import dev.atlas.*;
import java.util.*;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.sound.*;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.math.random.Random;

public final class AtlasMusic {
  private static final JsonObject GROUPS = SourceData.json("music.json").getAsJsonObject(),
      DURATIONS = SourceData.json("music-durations.json").getAsJsonObject();
  private static final JsonObject LOOPS = SourceData.json("music-loops.json").getAsJsonObject();
  private static final Set<String> CONTINUOUS =
      Set.of(
          "bloodmoon",
          "boss_magnetic_warden",
          "boss_bell_titan",
          "resonant_vault",
          "resonant_combat",
          "resonant_escape");
  private static final java.util.Random RNG = new java.util.Random();
  private static Track current;
  private static final List<Track> FADING = new ArrayList<>();
  private static String context = "", pending = "", lastSong = "";
  private static int stable = 0, delay = 0;
  private static boolean enabled = false;
  private static boolean bossNight = false;

  static boolean authoredLoopPlaying(MinecraftClient c) {
    return current != null && current.looping && c.getSoundManager().isPlaying(current);
  }

  public static void tick(MinecraftClient c) {
    boolean wanted = AtlasConfig.INSTANCE.music;
    if (!wanted) {
      if (enabled) {
        if (current != null) current.fadeOut(30);
        current = null;
        FADING.forEach(t -> t.fadeOut(30));
        context = "";
      }
      enabled = false;
      return;
    }
    if (!enabled) {
      c.getMusicTracker().stop();
      enabled = true;
    }
    String next = resolve(c);
    if (!next.equals(pending)) {
      pending = next;
      stable = 0;
    } else stable++;
    boolean urgent =
        CONTINUOUS.contains(next)
            || CONTINUOUS.contains(context)
            || next.equals("menu")
            || next.equals("death");
    int threshold = urgent ? 0 : next.equals("caves") ? 80 : 160;
    if (!next.equals(context) && stable >= threshold) {
      if (next.equals("boss_magnetic_warden"))
        bossNight =
            c.world != null
                && SkyTime.night(c.world.getTimeOfDay())
                && AtlasConfig.INSTANCE.nightPitch;
      boolean carry = current != null && tags(next).contains(current.tag) && !urgent;
      context = next;
      if (!carry) {
        if (current != null) {
          current.fadeOut(next.equals("death") ? 20 : urgent ? 24 : 60);
          FADING.add(current);
        }
        current = null;
        delay = next.equals("death") ? 0 : urgent ? 0 : 5;
      }
    }
    if (current != null && !c.getSoundManager().isPlaying(current) && current.age > 20) {
      current = null;
      delay =
          context.equals("death")
              ? Integer.MAX_VALUE
              : CONTINUOUS.contains(context) ? 0 : AtlasConfig.INSTANCE.musicDelaySeconds * 20;
    }
    FADING.removeIf(t -> !c.getSoundManager().isPlaying(t) && t.age > 20);
    if (current != null) {
      boolean frenzy = false;
      if (context.equals("boss_magnetic_warden") && c.world != null)
        for (var e : c.world.getEntities())
          if (e instanceof AtlasBoss b && b.kind().equals("warden") && b.phase() == 3) {
            frenzy = true;
            break;
          }
      current.setFrenzy(frenzy);
      int seam = context.equals("bloodmoon") ? 200 : 50;
      boolean nearDawn =
          context.equals("bloodmoon")
              && c.world != null
              && 24000 - Math.floorMod(c.world.getTimeOfDay(), 24000) < 400;
      if (!current.looping
          && !nearDawn
          && CONTINUOUS.contains(context)
          && current.remainingTicks() < seam
          && current.age > 40) {
        current.fadeOut(seam);
        FADING.add(current);
        current = null;
        delay = 0;
      }
    }
    if (current == null && delay-- <= 0) {
      var pool = new ArrayList<String>();
      var owner = new HashMap<String, String>();
      for (var tag : tags(context)) {
        var list = GROUPS.getAsJsonArray(tag);
        if (list != null)
          for (var e : list) {
            pool.add(e.getAsString());
            owner.put(e.getAsString(), tag);
          }
      }
      if (pool.isEmpty()) {
        delay = 100;
        return;
      }
      if (pool.size() > 1) pool.remove(lastSong);
      String song = pool.get(RNG.nextInt(pool.size()));
      lastSong = song;
      boolean night =
          context.equals("boss_magnetic_warden")
              ? bossNight
              : c.world != null
                  && SkyTime.night(c.world.getTimeOfDay())
                  && AtlasConfig.INSTANCE.nightPitch
                  && !CONTINUOUS.contains(context)
                  && !context.equals("death")
                  && !context.equals("menu");
      current =
          new Track(
              song,
              owner.get(song),
              night,
              context.equals("death") ? 20 : context.equals("bloodmoon") ? 200 : 60);
      c.getSoundManager().play(current);
    }
  }

  private static List<String> tags(String context) {
    return switch (context) {
      case "meadow" -> List.of("plains", "meadow");
      case "forest" -> List.of("forest");
      case "cold" -> List.of("cold");
      case "ocean" -> List.of("ocean");
      default -> List.of(context.isEmpty() ? "plains" : context);
    };
  }

  public static String resolve(MinecraftClient c) {
    if (c.player == null || c.world == null) return "menu";
    if (c.player.isDead()) return "death";
    if (!AtlasClient.serverContext.isEmpty()) return AtlasClient.serverContext;
    var entry = c.world.getBiome(c.player.getBlockPos());
    String biome = entry.getKey().map(k -> k.getValue().getPath()).orElse("plains");
    if (biome.equals("magnetic_fields")) return "magnetic_fields";
    if (c.player.getY()
            < c.world.getTopY(
                    net.minecraft.world.Heightmap.Type.WORLD_SURFACE,
                    c.player.getBlockX(),
                    c.player.getBlockZ())
                - 6
        && !c.world.isSkyVisible(c.player.getBlockPos())) return "caves";
    if (biome.equals("volcanic") || biome.contains("cave")) return "caves";
    if (biome.contains("ocean") || biome.contains("beach") || biome.contains("shore"))
      return biome.contains("frozen") ? "cold" : "ocean";
    if (biome.contains("snow")
        || biome.contains("frozen")
        || biome.contains("ice")
        || biome.contains("taiga")
        || biome.contains("peaks")
        || biome.contains("grove")) return biome.equals("cherry_grove") ? "forest" : "cold";
    if (biome.contains("forest") || biome.contains("jungle") || biome.contains("swamp"))
      return "forest";
    if (biome.equals("meadow")) return "meadow";
    return "plains";
  }

  private static final class Track extends MovingSoundInstance {
    final String event, tag;
    final boolean night;
    final boolean looping;
    final double seconds;
    int age = 0, fadeIn, fadeOut = 0, fadeLength = 1;
    double playbackTicks = 0;

    Track(String event, String tag, boolean night, int fade) {
      super(
          Content.sound(
              LOOPS.has(event) ? LOOPS.getAsJsonObject(event).get("event").getAsString() : event),
          SoundCategory.MUSIC,
          Random.create());
      this.event = event;
      this.tag = tag;
      this.night = night;
      seconds = DURATIONS.has(event) ? DURATIONS.get(event).getAsDouble() : 180;
      fadeIn = fade;
      volume = .002f;
      relative = true;
      attenuationType = AttenuationType.NONE;
      looping = LOOPS.has(event);
      repeat = looping;
      repeatDelay = 0;
      pitch = night ? (float) Math.pow(2, -1 / 12.0) : 1;
    }

    void fadeOut(int ticks) {
      if (fadeOut == 0) {
        fadeOut = ticks;
        fadeLength = ticks;
      }
    }

    void setFrenzy(boolean frenzy) {
      pitch = (float) Math.pow(2, ((night ? -1 : 0) + (frenzy ? 1 : 0)) / 12.0);
    }

    double remainingTicks() {
      return seconds * 20 - playbackTicks;
    }

    @Override
    public boolean shouldAlwaysPlay() {
      return true;
    }

    @Override
    public void tick() {
      age++;
      playbackTicks += pitch;
      float gain = fadeIn == 0 ? 1 : Math.min(1, age / (float) fadeIn);
      if (fadeOut > 0) {
        gain = Math.min(gain, fadeOut / (float) fadeLength);
        fadeOut--;
        if (fadeOut == 0) {
          setDone();
          return;
        }
      }
      volume = gain * .7f;
    }
  }
}
