package dev.atlas.client.mixin;

import dev.atlas.AtlasBoss;
import dev.atlas.client.*;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.Camera;
import net.minecraft.entity.Entity;
import net.minecraft.util.math.*;
import net.minecraft.world.BlockView;
import org.spongepowered.asm.mixin.*;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Camera.class)
public abstract class CameraMixin {
  @Shadow
  protected abstract void setRotation(float yaw, float pitch);

  @Shadow
  protected abstract void setPos(Vec3d pos);

  @Inject(method = "update", at = @At("TAIL"))
  private void atlas$camera(
      BlockView area,
      Entity focused,
      boolean third,
      boolean inverse,
      float delta,
      CallbackInfo ci) {
    var c = MinecraftClient.getInstance();
    if (c.player == null || focused != c.player || !CameraRig.custom()) return;
    Vec3d eye = CameraRig.eye(delta);
    if (CameraRig.cinematic()
        && c.world.getEntityById(CameraRig.bossId) instanceof AtlasBoss boss) {
      double t = CameraRig.cinematicProgress(),
          angle = Math.toRadians(boss.getYaw() + 145 - 85 * t);
      Vec3d target = boss.getLerpedPos(delta).add(0, 2.8, 0),
          desired =
              target.add(Math.cos(angle) * 10, 2.2 + Math.sin(t * Math.PI), Math.sin(angle) * 10);
      desired = CameraRig.collision(target, desired);
      Vec3d d = target.subtract(desired);
      setPos(desired);
      setRotation(
          (float) Math.toDegrees(Math.atan2(-d.x, d.z)),
          (float) -Math.toDegrees(Math.atan2(d.y, Math.hypot(d.x, d.z))));
      return;
    }
    if (CameraRig.detached != 0) {
      setPos(CameraRig.detachedPosition);
      setRotation(CameraRig.yaw, CameraRig.pitch);
      return;
    }
    float yaw = CameraRig.mode == CameraRig.Mode.FREE ? CameraRig.yaw : focused.getYaw(delta),
        pitch = CameraRig.mode == CameraRig.Mode.FREE ? CameraRig.pitch : focused.getPitch(delta);
    setRotation(yaw, pitch);
    double yr = Math.toRadians(yaw),
        pr = Math.toRadians(pitch),
        dist = AtlasConfig.INSTANCE.cameraDistance,
        shoulder =
            CameraRig.mode == CameraRig.Mode.SHOULDER ? AtlasConfig.INSTANCE.shoulderOffset : 0;
    Vec3d desired =
        eye.add(
            Math.sin(yr) * Math.cos(pr) * dist + Math.cos(yr) * shoulder,
            Math.sin(pr) * dist,
            -Math.cos(yr) * Math.cos(pr) * dist + Math.sin(yr) * shoulder);
    setPos(CameraRig.collision(eye, desired));
  }
}
