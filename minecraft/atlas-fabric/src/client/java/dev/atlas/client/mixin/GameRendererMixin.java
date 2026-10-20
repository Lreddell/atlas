package dev.atlas.client.mixin;

import dev.atlas.client.CameraRig;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.GameRenderer;
import net.minecraft.entity.projectile.ProjectileUtil;
import net.minecraft.util.hit.*;
import net.minecraft.util.math.*;
import net.minecraft.world.RaycastContext;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
  @Inject(method = "updateCrosshairTarget", at = @At("TAIL"))
  private void atlas$aim(float delta, CallbackInfo ci) {
    var c = MinecraftClient.getInstance();
    if (c.player == null
        || c.world == null
        || CameraRig.mode == CameraRig.Mode.FIRST
        || CameraRig.detached != 0
        || CameraRig.cinematic()) return;
    Vec3d eye = c.player.getCameraPosVec(delta),
        camera = c.gameRenderer.getCamera().getPos(),
        direction =
            Vec3d.fromPolar(
                CameraRig.mode == CameraRig.Mode.FREE ? CameraRig.pitch : c.player.getPitch(),
                CameraRig.mode == CameraRig.Mode.FREE ? CameraRig.yaw : c.player.getYaw());
    var seen =
        c.world.raycast(
            new RaycastContext(
                camera,
                camera.add(direction.multiply(64)),
                RaycastContext.ShapeType.OUTLINE,
                RaycastContext.FluidHandling.NONE,
                c.player));
    Vec3d aim =
        seen.getType() == HitResult.Type.MISS ? camera.add(direction.multiply(64)) : seen.getPos();
    double blockRange = c.player.getBlockInteractionRange(),
        entityRange = c.player.getEntityInteractionRange();
    Vec3d ray = aim.subtract(eye).normalize();
    var block =
        c.world.raycast(
            new RaycastContext(
                eye,
                eye.add(ray.multiply(blockRange)),
                RaycastContext.ShapeType.OUTLINE,
                RaycastContext.FluidHandling.NONE,
                c.player));
    double reach = Math.max(blockRange, entityRange);
    var entity =
        ProjectileUtil.raycast(
            c.player,
            eye,
            eye.add(ray.multiply(entityRange)),
            c.player.getBoundingBox().stretch(ray.multiply(reach)).expand(1),
            e -> !e.isSpectator() && e.canHit(),
            entityRange * entityRange);
    if (entity != null
        && (block.getType() == HitResult.Type.MISS
            || eye.squaredDistanceTo(entity.getPos()) < eye.squaredDistanceTo(block.getPos()))) {
      c.crosshairTarget = entity;
      c.targetedEntity = entity.getEntity();
    } else {
      c.crosshairTarget = block;
      c.targetedEntity = null;
    }
  }
}
