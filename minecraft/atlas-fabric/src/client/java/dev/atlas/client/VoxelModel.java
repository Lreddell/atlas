package dev.atlas.client;

import com.google.gson.*;
import dev.atlas.*;
import java.util.*;
import net.minecraft.client.model.*;
import net.minecraft.client.render.*;
import net.minecraft.client.render.entity.model.EntityModel;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.LivingEntity;
import net.minecraft.util.math.MathHelper;

/** Hierarchical Minecraft cuboids at sixteen texture pixels per block. */
public final class VoxelModel<T extends LivingEntity> extends EntityModel<T> {
  private final ModelPart root, body;
  private final Map<String, ModelPart> parts = new HashMap<>();
  private final Map<String, Integer> hidden = new HashMap<>();
  private final String kind;
  private final float[] scale = {1, 1, 1};

  public VoxelModel(String kind) {
    this.kind = kind;
    JsonObject model = SourceData.json("models/entity/" + kind + ".json").getAsJsonObject();
    var data = new ModelData();
    var body =
        data.getRoot()
            .addChild("body_root", ModelPartBuilder.create(), ModelTransform.pivot(0, 24, 0));
    var partData = new HashMap<String, ModelPartData>();
    partData.put("body_root", body);
    for (var e : model.getAsJsonArray("groups")) {
      var g = e.getAsJsonObject();
      String name = g.get("id").getAsString();
      var pos = g.getAsJsonArray("position");
      partData.put(
          name,
          body.addChild(
              name,
              ModelPartBuilder.create(),
              ModelTransform.pivot(v(pos, 0) * 16, -v(pos, 1) * 16, -v(pos, 2) * 16)));
    }
    var pending = new ArrayList<JsonObject>();
    model.getAsJsonArray("parts").forEach(e -> pending.add(e.getAsJsonObject()));
    while (!pending.isEmpty()) {
      boolean progress = false;
      var iterator = pending.iterator();
      while (iterator.hasNext()) {
        var p = iterator.next();
        String id = p.get("id").getAsString(),
            parent =
                p.has("parent") && !p.get("parent").isJsonNull()
                    ? p.get("parent").getAsString()
                    : "body_root";
        if (!partData.containsKey(parent)) continue;
        JsonArray size = p.getAsJsonArray("size"),
            pos = p.getAsJsonArray("position"),
            offset = p.has("meshOffset") ? p.getAsJsonArray("meshOffset") : null,
            rot =
                p.has("rotation") && !p.get("rotation").isJsonNull()
                    ? p.getAsJsonArray("rotation")
                    : null;
        int material =
            model.getAsJsonObject("materials").has(p.get("material").getAsString())
                ? model.getAsJsonObject("materials").get(p.get("material").getAsString()).getAsInt()
                : 0;
        float sx = v(size, 0) * 16, sy = v(size, 1) * 16, sz = v(size, 2) * 16;
        var builder =
            ModelPartBuilder.create()
                .uv(material % 4 * 256, material / 4 * 256)
                .cuboid(
                    -sx / 2 + v(offset, 0) * 16,
                    -sy / 2 - v(offset, 1) * 16,
                    -sz / 2 - v(offset, 2) * 16,
                    sx,
                    sy,
                    sz);
        partData.put(
            id,
            partData
                .get(parent)
                .addChild(
                    id,
                    builder,
                    ModelTransform.of(
                        v(pos, 0) * 16,
                        -v(pos, 1) * 16,
                        -v(pos, 2) * 16,
                        -v(rot, 0),
                        -v(rot, 1),
                        v(rot, 2))));
        if (p.has("hiddenAtStage")) hidden.put(id, p.get("hiddenAtStage").getAsInt());
        iterator.remove();
        progress = true;
      }
      if (!progress) throw new IllegalArgumentException("Cyclic model bones in " + kind);
    }
    root = TexturedModelData.of(data, 1024, 512).createModel();
    this.body = root.getChild("body_root");
    collect(root);
    if (model.has("scale"))
      for (int i = 0; i < 3; i++) scale[i] = model.getAsJsonArray("scale").get(i).getAsFloat();
  }

  private static float v(JsonArray a, int i) {
    return a == null ? 0 : a.get(i).getAsFloat();
  }

  private void collect(ModelPart p) {
    for (String name : sourceNames()) parts.put(name, find(root, name));
  }

  private List<String> sourceNames() {
    var m = SourceData.json("models/entity/" + kind + ".json").getAsJsonObject();
    var names = new ArrayList<String>();
    names.add("body_root");
    for (String list : List.of("groups", "parts"))
      for (var e : m.getAsJsonArray(list)) names.add(e.getAsJsonObject().get("id").getAsString());
    return names;
  }

  private ModelPart find(ModelPart p, String name) {
    if (p.hasChild(name)) return p.getChild(name);
    for (var q : p.traverse().toList()) if (q.hasChild(name)) return q.getChild(name);
    throw new NoSuchElementException(name);
  }

  private void angle(String name, float pitch, float yaw, float roll) {
    var p = parts.get(name);
    if (p != null) {
      p.pitch += pitch;
      p.yaw += yaw;
      p.roll += roll;
    }
  }

  @Override
  public void setAngles(
      T entity, float limb, float amount, float animation, float yaw, float pitch) {
    root.traverse()
        .forEach(
            p -> {
              p.resetTransform();
              p.visible = true;
              p.xScale = p.yScale = p.zScale = 1;
            });
    float time = animation / 20, gait = MathHelper.sin(limb * .8f) * Math.min(amount, 1) * .65f;
    for (String n : List.of("left_leg", "leftLeg", "leftThigh", "frontLeftLeg", "backRightLeg"))
      angle(n, gait, 0, 0);
    for (String n : List.of("right_leg", "rightLeg", "rightThigh", "frontRightLeg", "backLeftLeg"))
      angle(n, -gait, 0, 0);
    angle(parts.containsKey("head_bone") ? "head_bone" : "head", pitch * .008f, yaw * .012f, 0);
    body.pivotY += Math.abs(gait) * .6f;
    if (entity instanceof AtlasBoss boss) {
      String action = boss.action();
      float beat = MathHelper.sin(Math.min(1, boss.actionTick() / 16f) * (float) Math.PI);
      boolean wind = action.contains("windup"),
          active = action.contains("active") || action.contains("drop");
      if (wind) {
        body.pitch -= .12f * beat;
        angle("right_arm", -1.4f * beat, 0, .2f * beat);
        angle("left_arm", -.8f * beat, 0, -.2f * beat);
        body.pivotY += beat * 1.2f;
      }
      if (active) {
        angle("right_arm", -1.5f + 2.4f * beat, 0, -.2f);
        angle("left_arm", -1 + 2 * beat, 0, .2f);
        body.pitch += beat * .22f;
      }
      if (action.equals("draw_active")) {
        angle("left_arm", -1.1f, 0, -.8f);
        angle("right_arm", -1.1f, 0, .8f);
      }
      if (kind.equals("bell_titan")) {
        int stage = boss.phase() - 1;
        hidden.forEach((n, hide) -> parts.get(n).visible = stage < hide);
        angle(
            "bell_bone", MathHelper.sin(time * 2.8f) * .08f, 0, MathHelper.sin(time * 1.5f) * .06f);
        if (boss.shields() == 0) {
          angle("bell_bone", .16f, 0, MathHelper.sin(time * 8) * .15f);
          var bell = parts.get("hanging_bell");
          if (bell != null) bell.xScale = bell.yScale = bell.zScale = 1.035f;
        }
        if (action.equals("awaken")) {
          float t = Math.min(1, boss.actionTick() / 60f);
          body.pitch = (1 - t) * .7f;
          body.pivotY += (1 - t) * 18;
        }
      } else {
        if (boss.phase() >= 2) {
          for (String n : List.of("left_leg", "right_leg")) parts.get(n).visible = false;
          body.pivotY -= MathHelper.sin(time * 2.3f) * 1.8f;
          angle("left_arm", -.4f, 0, -1.1f);
          angle("right_arm", -.4f, 0, 1.1f);
        }
        for (int i = 0; i < 4; i++) {
          var orbit = parts.get("orbit_" + i);
          orbit.visible = boss.phase() == 3;
          orbit.yaw = time * 1.5f + i * (float) Math.PI / 2;
          orbit.roll = MathHelper.sin(time * 2 + i) * .1f;
        }
        if (boss.phase() == 3) {
          parts.get("head_bone").visible = false;
          parts.get("left_arm").visible = false;
          parts.get("right_arm").visible = false;
          body.yaw = MathHelper.sin(time * .7f) * .16f;
        }
      }
      if (action.equals("death")) {
        float t = Math.min(1, -boss.cinematic() / 100f);
        body.pitch = t * 1.2f;
        body.pivotY += t * 18;
        angle("left_arm", .3f * t, 0, -.5f * t);
        angle("right_arm", .4f * t, 0, .5f * t);
      }
    } else if (entity instanceof AtlasMob mob) {
      String action = mob.action();
      float t = Math.min(1, mob.actionTick() / 14f), swing = MathHelper.sin(t * (float) Math.PI);
      for (String n : List.of("leftArm", "shieldArm")) angle(n, -.4f + gait * .2f, 0, -.08f);
      for (String n : List.of("rightArm", "weaponArm")) angle(n, -.5f - gait * .2f, 0, .08f);
      if (!action.equals("idle")) {
        if (action.contains("block")) angle("shieldArm", -.8f, .5f, -.4f);
        else {
          angle("weaponArm", -1.3f * swing, 0, .2f);
          angle("rightArm", -1.6f * swing, 0, .2f);
          body.pitch = -.15f * swing;
          if (action.contains("crossbow")) {
            angle("leftArm", -1.1f, 0, -.1f);
            angle("rightArm", -1.1f, 0, .1f);
          }
        }
      }
      if (mob.hurtTime > 0) body.roll = MathHelper.sin(mob.hurtTime * 1.4f) * .09f;
    }
  }

  @Override
  public void render(
      MatrixStack matrices, VertexConsumer vertices, int light, int overlay, int color) {
    matrices.push();
    matrices.scale(scale[0], scale[1], scale[2]);
    root.render(matrices, vertices, light, overlay, color);
    matrices.pop();
  }
}
