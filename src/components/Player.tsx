
import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3, MathUtils, PerspectiveCamera, Quaternion, Matrix4, Euler } from 'three';
import { CHUNK_SIZE } from '../constants';
import { worldManager } from '../systems/WorldManager';
import { BlockType, type GameMode } from '../types';
import {
    onKeyDown, onKeyUp, getMovementIntent, inputState, lookBridge, consumeDodgePress, dodgePressAge,
    DODGE_BUFFER_MS,
} from '../systems/player/playerInput';
import { simulateStep, type SimulationResult } from '../systems/player/playerMovement';
import { applyMagneticForce, applyBossMagneticFields, getMagnetPolarity, type MagneticMode } from '../systems/player/magnetism';
import { entityManager } from '../systems/entities/EntityManager';
import { bossSummon } from '../systems/boss/bossSummon';
import { sampleShake, addTrauma } from '../systems/player/cameraShake';
import { checkCollision, getSupportTop, isSolid as isSolidCell } from '../systems/player/playerCollision';
import {
    createAdhesionState, findAdhesionCandidate, computeLocalBasis, projectInput, detachImpulse,
    evaluateSoftDetach, type AdhesionState, type Vec3,
    ADHESION_ATTACH_STRENGTH, ADHESION_CLIMB_SPEED, ADHESION_STICK_SPEED,
    ADHESION_JUMP_OFF_SPEED, ADHESION_POLARITY_LAUNCH_SPEED, ADHESION_LAUNCH_UP, ADHESION_TANGENT_PRESERVE,
    ADHESION_REATTACH_COOLDOWN_MS,
} from '../systems/player/magneticAdhesion';
import {
    climbSurfaces, CLIMB_SHOCK_DAMAGE, CLIMB_SHOCK_LAUNCH_SPEED, CLIMB_SHOCK_LAUNCH_UP,
} from '../systems/player/climbSurfaces';
import {
    advanceMotion, armSurge, consumeSurge, createMotionState, endMotion, markDodgeRefused, motionRequests,
    previewDodge, resolveDodge, rollAbsorbsLanding, rollVelocity, writeMotionStatus,
    DASH_RANGE, DASH_SPEED, LEAP_SPEED, LEAP_UP,
    type DodgeContext, type MotionState, type MotionVec3,
} from '../systems/player/playerMotion';
import { aimRay, placeThirdPersonCamera, playerPose, viewRig } from '../systems/player/viewRig';
import { voxelRaycast } from '../systems/world/voxelRaycast';
import { gameEvents } from '../systems/events/GameEvents';
import { particleFx, polarityFxColor } from '../systems/fx/particleFx';
import {
    EYE_HEIGHT_STANDING, EYE_HEIGHT_SNEAKING,
    FIXED_DT, MAX_SUBSTEPS, MAX_BREATH,
    PLAYER_HEIGHT, PLAYER_HEIGHT_SNEAK, PLAYER_WIDTH,
    GRAVITY, TERMINAL_VELOCITY, GROUND_EPS, CONTACT_EPS,
} from '../systems/player/playerConstants';
import { addExhaustion, EXHAUSTION_COSTS, type FoodState } from '../systems/player/playerFood';
import { soundManager } from '../systems/sound/SoundManager';
import { getBlockSoundGroup } from '../systems/sound/blockSoundGroups';
import { getFallDamageMultiplierForLandingBlock } from '../systems/player/fallDamage';
import { isEditableElement } from '../utils/dom';

export interface PlayerHandle {
    teleport: (pos: Vector3) => void;
    applyImpulse: (x: number, y: number, z: number) => void;
}

// --- Magnetic wall adhesion camera helpers (Phase 10) ------------------------
// While latched to a wall, the camera's "up" is the surface normal. Look (yaw
// around the normal, pitch around the tangent right) is composed here into a
// world-space view direction and orientation quaternion.
const _wallFwd = new Vector3();
const _wallView = new Vector3();
const _wallUp = new Vector3();
const _wallMat = new Matrix4();
const _wallTarget = new Quaternion();
const _tmpEuler = new Euler(0, 0, 0, 'YXZ');
const _viewDir = new Vector3();
const _camRight = new Vector3();
const _camUp = new Vector3();

const _shakeOffset = { x: 0, y: 0, z: 0 };

/** Duration (seconds) of the camera roll onto / off the wall. */
const ROLL_TIME = 0.22;
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/** A voxel sweep for the spring arm and the aim: distance to the first solid, or null. */
const sweepVoxels = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): number | null => {
    const hit = voxelRaycast(ox, oy, oz, dx, dy, dz, maxDist);
    return hit ? hit.distance : null;
};

/** World-space view direction for the attached camera given its look yaw/pitch. */
function wallViewDir(a: AdhesionState, out: Vector3): Vector3 {
    const cy = Math.cos(a.lookYaw), sy = Math.sin(a.lookYaw);
    const cp = Math.cos(a.lookPitch), sp = Math.sin(a.lookPitch);
    // Yaw rotates the reference forward around localUp.
    const fx = a.localForward.x * cy + a.localRight.x * sy;
    const fy = a.localForward.y * cy + a.localRight.y * sy;
    const fz = a.localForward.z * cy + a.localRight.z * sy;
    // Pitch tilts that forward toward/away from localUp.
    out.set(
        fx * cp + a.localUp.x * sp,
        fy * cp + a.localUp.y * sp,
        fz * cp + a.localUp.z * sp,
    );
    return out.normalize();
}

/** Orientation quaternion for the attached camera (looks along the view dir, up = localUp-ish). */
function wallQuat(a: AdhesionState, out: Quaternion): Quaternion {
    const cy = Math.cos(a.lookYaw), sy = Math.sin(a.lookYaw);
    const cp = Math.cos(a.lookPitch), sp = Math.sin(a.lookPitch);
    const fx = a.localForward.x * cy + a.localRight.x * sy;
    const fy = a.localForward.y * cy + a.localRight.y * sy;
    const fz = a.localForward.z * cy + a.localRight.z * sy;
    _wallView.set(fx * cp + a.localUp.x * sp, fy * cp + a.localUp.y * sp, fz * cp + a.localUp.z * sp).normalize();
    // Keep the camera up perpendicular to the view as it pitches.
    _wallUp.set(-fx * sp + a.localUp.x * cp, -fy * sp + a.localUp.y * cp, -fz * sp + a.localUp.z * cp).normalize();
    // Matrix4.lookAt(eye, target, up) makes the camera's -z (its forward) point
    // from eye toward target; eye at origin so target is the view direction.
    _wallMat.lookAt(_wallFwd.set(0, 0, 0), _wallView, _wallUp);
    out.setFromRotationMatrix(_wallMat);
    return out;
}

interface PlayerProps {
  position: Vector3;
  onChunkChange?: (cx: number, cz: number) => void;
  onTakeDamage?: (amount: number) => void;
  isLocked: boolean;
  isPaused: boolean;
  gameMode: GameMode;
  setBreath: (val: number) => void;
  baseFov: number;
  setHeadBlock: (type: BlockType) => void;
  setIsOnFire: (val: boolean) => void;
  foodStateRef: React.MutableRefObject<FoodState>;
  isDead: boolean;
    forcedFov?: number | null;
  magneticMode?: MagneticMode;
  /** Fall-damage multiplier from gear (polarity boots soften falls). 1 = normal. */
  fallDamageFactor?: number;
  /** Entity id of the boat being ridden (null = on foot). While riding, the
   *  player's boat physics drives the entity's position/yaw each frame. */
  ridingBoatId?: number | null;
  onExitBoat?: () => void;
}

export const PlayerRefUpdater: React.FC<{ playerPosRef: React.MutableRefObject<Vector3>; cinematicMode?: boolean }> = ({ playerPosRef, cinematicMode = false }) => {
  useFrame(() => {
    // During the summon cutscene the camera belongs to the cinematic (it flies far
    // out around the arena), so don't track it, that would teleport the player's
    // saved position to wherever the camera ended up. Leave playerPosRef frozen at
    // the spot they were standing when the cutscene began. We check BOTH the live
    // cinematic flag (covers the moment control hands back, before the player camera
    // is restored) and the React cinematicMode prop (covers the cutscene start), so
    // there is no frame in which a stale cutscene camera leaks into the saved pos.
    if (cinematicMode || bossSummon.isActive()) return;
    // The EYE, not the camera: in third person the camera hangs behind the body.
    const eyeHeight = inputState.sneak ? EYE_HEIGHT_SNEAKING : EYE_HEIGHT_STANDING;
    playerPosRef.current.set(viewRig.eye.x, viewRig.eye.y - eyeHeight, viewRig.eye.z);
  });
  return null;
};

export const Player = forwardRef<PlayerHandle, PlayerProps>(({
    position, onChunkChange, onTakeDamage, isLocked, isPaused, gameMode, fallDamageFactor = 1,
    setBreath, baseFov, setHeadBlock, setIsOnFire, foodStateRef,
    isDead, forcedFov = null, magneticMode = 'none', ridingBoatId = null, onExitBoat
}, ref) => {
  const boating = ridingBoatId !== null;
  const { camera } = useThree();

  const pos = useRef(position.clone());
  const vel = useRef(new Vector3());
  const grounded = useRef(false);
  const fallDistance = useRef(0);
  const damageTilt = useRef(0);
  const isFlying = useRef(false);
  const spawnImmunityTicks = useRef(60);
  const prevPos = useRef(position.clone());
  const renderPos = useRef(position.clone());
  const currentEyeHeight = useRef(EYE_HEIGHT_STANDING);

  // Magnetic wall adhesion (Phase 10): explicit state + edge-detection for jump
  // and polarity-flip detach, plus the camera "unroll" easing back to world-up.
  const adhesion = useRef<AdhesionState>(createAdhesionState());
  const prevPolarity = useRef(inputState.magneticPolarity);
  const prevJump = useRef(false);
  const unrolling = useRef(false);
  const unrollTarget = useRef(new Quaternion());
  // Camera roll on/off the wall: eased only during the transition, then look is
  // tracked 1:1 (no drag). rollT 0→1, rollFrom is the orientation at the start.
  const rollT = useRef(1);
  const rollFrom = useRef(new Quaternion());

  // The F kit: roll / magnetic dash / repel leap, with its invulnerability
  // windows and the armed Magnet Slam. Pure state, advanced in the fixed loop.
  const motion = useRef<MotionState>(createMotionState());
  const simTime = useRef(0);

  const timeAccumulator = useRef(0);
  const lastSimTime = useRef<number | null>(null);
  const lastChunk = useRef<{cx: number, cz: number} | null>(null);
  const breathRef = useRef(MAX_BREATH);
  const drowningCooldown = useRef(0);

  const invulnerabilityTimer = useRef(0);
  const lastDamageTaken = useRef(0);
  const fireTicks = useRef(0);

  // Sound Accumulator for footsteps
  const stepAccumulator = useRef(0);

  useImperativeHandle(ref, () => ({
      teleport: (newPos: Vector3) => {
          pos.current.copy(newPos);
          vel.current.set(0, 0, 0);
          prevPos.current.copy(newPos);
          renderPos.current.copy(newPos);
          camera.position.copy(newPos).add(new Vector3(0, currentEyeHeight.current, 0));
          viewRig.eye.x = camera.position.x; viewRig.eye.y = camera.position.y; viewRig.eye.z = camera.position.z;
          grounded.current = false;
          fallDistance.current = 0;
          motion.current = endMotion(motion.current);
          const cx = Math.floor(newPos.x / CHUNK_SIZE);
          const cz = Math.floor(newPos.z / CHUNK_SIZE);
          if (onChunkChange) onChunkChange(cx, cz);
      },
      applyImpulse: (x: number, y: number, z: number) => {
          vel.current.x += x;
          vel.current.y += y;
          vel.current.z += z;
      },
  }));

  // Sync physics state with prop updates (e.g. after world generation determines safe spawn)
  useEffect(() => {
    camera.rotation.order = 'YXZ';
    camera.up.set(0, 1, 0);
    camera.rotation.set(0, 0, 0);

    // Reset physics state to match the new start position
    pos.current.copy(position);
    prevPos.current.copy(position);
    renderPos.current.copy(position);
    vel.current.set(0, 0, 0);
    grounded.current = false;
    fallDistance.current = 0;
    motion.current = createMotionState();

    camera.position.copy(pos.current).add(new Vector3(0, EYE_HEIGHT_STANDING, 0));
    viewRig.eye.x = camera.position.x; viewRig.eye.y = camera.position.y; viewRig.eye.z = camera.position.z;
  }, [position, camera]); // Dependency on position ensures we teleport when the parent finishes loading

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!isLocked || isPaused || isEditableElement(e.target)) return;
        onKeyDown(e.code, e);
    };
    const handleKeyUp = (e: KeyboardEvent) => onKeyUp(e.code);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
    }, [isLocked, isPaused]);

  const applyDamage = (amount: number) => {
      if (gameMode !== 'survival' || isDead) return;
      if (spawnImmunityTicks.current > 0) return;

      let damageToDeal = 0;
      if (invulnerabilityTimer.current > 0) {
          if (amount > lastDamageTaken.current) {
              damageToDeal = amount - lastDamageTaken.current;
              lastDamageTaken.current = amount;
          }
      } else {
          damageToDeal = amount;
          lastDamageTaken.current = amount;
          invulnerabilityTimer.current = 10;
          damageTilt.current = 0.35;
          addExhaustion(foodStateRef.current, EXHAUSTION_COSTS.DAMAGE);
      }
      if (damageToDeal > 0 && onTakeDamage) onTakeDamage(damageToDeal);
  };

  // --- Magnetic wall adhesion (Phase 10) -------------------------------------
  const magnetPolarityAt = (x: number, y: number, z: number): number =>
      getMagnetPolarity(worldManager.getBlock(x, y, z, false));
  const solidAt = (x: number, y: number, z: number): boolean =>
      isSolidCell(worldManager, x, y, z);
  // The attraction rule with the arena towers' flux windows applied: a tower
  // mid-flip holds a climber of either polarity (see climbSurfaces).
  const attractiveAt = (playerPolarity: number, blockPolarity: number, x: number, y: number, z: number): boolean =>
      climbSurfaces.isAttractive(playerPolarity, blockPolarity, x, y, z, climbSurfaces.clock);

  // Latch onto a magnet face: seat the local basis from the current gaze, reset
  // look, and drop the inward velocity so only tangent momentum carries in.
  const beginAttach = (cand: ReturnType<typeof findAdhesionCandidate>) => {
      if (!cand) return;
      const a = adhesion.current;
      const look = camera.getWorldDirection(_wallView.set(0, 0, -1)).clone();
      const basis = computeLocalBasis(cand.normal, { x: look.x, y: look.y, z: look.z });
      a.active = true;
      a.blockX = cand.blockX; a.blockY = cand.blockY; a.blockZ = cand.blockZ;
      a.normal = cand.normal;
      a.localUp = basis.up; a.localRight = basis.right; a.localForward = basis.forward;
      a.surfacePoint = cand.surfacePoint;
      a.contactDistance = cand.distance;
      a.attachStrength = cand.strength;
      a.polarity = cand.polarity;
      a.lookYaw = 0; a.lookPitch = 0;
      const t = Date.now();
      a.attachedAt = t; a.lastValidSurfaceAt = t;
      a.detachReason = null;
      a.targetUp = cand.normal; a.prevUp = { x: 0, y: 1, z: 0 }; a.transition = 0;
      // Keep only the velocity tangent to the wall.
      const vn = vel.current.x * a.normal.x + vel.current.y * a.normal.y + vel.current.z * a.normal.z;
      vel.current.x -= a.normal.x * vn;
      vel.current.y -= a.normal.y * vn;
      vel.current.z -= a.normal.z * vn;
      lookBridge.active = true; lookBridge.dYaw = 0; lookBridge.dPitch = 0;
      unrolling.current = false;
      // Ease the roll from the current (world-up) orientation onto the wall.
      rollFrom.current.copy(camera.quaternion);
      rollT.current = 0;
  };

  // Leave the wall: launch out along the normal (keeping some tangent momentum),
  // optionally with an upward kick (the magnetic launch arcs), start the
  // reattach cooldown, and begin easing the camera back to world-up.
  const detachWall = (reason: string, launchSpeed: number, upKick = 0) => {
      const a = adhesion.current;
      if (!a.active) return;
      const imp = detachImpulse(a.localUp, { x: vel.current.x, y: vel.current.y, z: vel.current.z }, launchSpeed, ADHESION_TANGENT_PRESERVE);
      vel.current.set(imp.x, imp.y, imp.z);
      // A launch off a wall face arcs; off a floor or ceiling the normal already carries the height.
      if (upKick > 0) vel.current.y += upKick * (1 - Math.abs(a.localUp.y));
      a.active = false;
      a.detachReason = reason;
      a.detachCooldownUntil = Date.now() + ADHESION_REATTACH_COOLDOWN_MS;
      // Snapshot the look direction so the un-roll preserves where the player is
      // looking, only the up-vector rotates back to world-up.
      const dir = wallViewDir(a, _wallView);
      const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
      const yaw = Math.atan2(-dir.x, -dir.z);
      _tmpEuler.set(pitch, yaw, 0, 'YXZ');
      unrollTarget.current.setFromEuler(_tmpEuler);
      unrolling.current = true;
      // Ease the roll back to world-up from the current wall orientation.
      rollFrom.current.copy(camera.quaternion);
      rollT.current = 0;
  };

  // Per-substep movement while attached: walk/climb along the wall plane (no
  // gravity), held in contact by a gentle inward pull resolved by collision.
  const stepAdhesionMovement = (intent: ReturnType<typeof getMovementIntent>, height: number) => {
      const a = adhesion.current;
      // Movement follows gaze: rebuild the tangent basis from the live view dir.
      const look = wallViewDir(a, _wallView);
      const moveBasis = computeLocalBasis(a.normal, { x: look.x, y: look.y, z: look.z });
      let f = 0, r = 0;
      if (intent.forward) f += 1;
      if (intent.backward) f -= 1;
      if (intent.right) r += 1;
      if (intent.left) r -= 1;
      const dir: Vec3 = projectInput(f, r, moveBasis);
      const speed = ADHESION_CLIMB_SPEED * (intent.sneak ? 0.45 : 1) * (intent.sprint ? 1.35 : 1);
      const desX = dir.x * speed, desY = dir.y * speed, desZ = dir.z * speed;
      const k = 1 - Math.exp(-14 * FIXED_DT);
      vel.current.x += (desX - vel.current.x) * k;
      vel.current.y += (desY - vel.current.y) * k;
      vel.current.z += (desZ - vel.current.z) * k;
      // Constant pull into the wall keeps the body pinned (collision absorbs it).
      vel.current.x -= a.normal.x * ADHESION_STICK_SPEED;
      vel.current.y -= a.normal.y * ADHESION_STICK_SPEED;
      vel.current.z -= a.normal.z * ADHESION_STICK_SPEED;

      const moveAxis = (axis: 'x' | 'y' | 'z') => {
          const d = vel.current[axis] * FIXED_DT;
          if (d === 0) return;
          pos.current[axis] += d;
          if (checkCollision(worldManager, pos.current, PLAYER_WIDTH, height)) {
              pos.current[axis] -= d;
              vel.current[axis] = 0;
          }
      };
      moveAxis('x'); moveAxis('z'); moveAxis('y');

      // Re-sense the surface for hysteresis / corner tracking.
      const center: Vec3 = { x: pos.current.x, y: pos.current.y + height * 0.5, z: pos.current.z };
      const cand = findAdhesionCandidate(magnetPolarityAt, solidAt, center, inputState.magneticPolarity, undefined, attractiveAt);
      const now = Date.now();
      let strength = 0;
      if (cand) {
          strength = cand.strength;
          a.lastValidSurfaceAt = now;
          a.surfacePoint = cand.surfacePoint;
          a.contactDistance = cand.distance;
          a.attachStrength = cand.strength;
          // Keep the basis when still on the same face; only refresh the anchor.
          if (cand.normal.x === a.normal.x && cand.normal.y === a.normal.y && cand.normal.z === a.normal.z) {
              a.blockX = cand.blockX; a.blockY = cand.blockY; a.blockZ = cand.blockZ;
          }
      }
      // A tower that settled against the climber's polarity throws them clear
      // toward the platform (never into the pit) and stings.
      const shock = climbSurfaces.shockAt(a.blockX, a.blockY, a.blockZ, inputState.magneticPolarity, climbSurfaces.clock, a.normal, { x: pos.current.x, y: pos.current.y, z: pos.current.z });
      if (shock) {
          detachWall('shocked', 0);
          vel.current.set(shock.x * CLIMB_SHOCK_LAUNCH_SPEED, CLIMB_SHOCK_LAUNCH_UP, shock.z * CLIMB_SHOCK_LAUNCH_SPEED);
          applyDamage(CLIMB_SHOCK_DAMAGE);
          addTrauma(0.5);
          particleFx.burst({ x: pos.current.x, y: pos.current.y + height * 0.5, z: pos.current.z, color: polarityFxColor(inputState.magneticPolarity), color2: [1, 1, 1], count: 30, speed: 8, upBias: 2, spread: 1, size: 0.24, life: 0.6, gravity: 4, drag: 1.1 });
          gameEvents.emit('player:shocked', { x: pos.current.x, y: pos.current.y, z: pos.current.z });
          return;
      }
      const reason = evaluateSoftDetach(a, now, strength, !!cand);
      if (reason) detachWall(reason, ADHESION_JUMP_OFF_SPEED * 0.35);
  };

  // --- The F kit -------------------------------------------------------------

  /** Horizontal look direction (unit) from the live view, world-up frame. */
  const lookForward = (out: MotionVec3): MotionVec3 => {
      const dx = viewRig.dir.x, dz = viewRig.dir.z;
      const h = Math.hypot(dx, dz);
      if (h < 1e-4) {
          const yaw = camera.rotation.y;
          out.x = -Math.sin(yaw); out.y = 0; out.z = -Math.cos(yaw);
      } else {
          out.x = dx / h; out.y = 0; out.z = dz / h;
      }
      return out;
  };

  const _forward: MotionVec3 = { x: 0, y: 0, z: -1 };
  const _moveDir: MotionVec3 = { x: 0, y: 0, z: 0 };

  /** Everything the kit needs to resolve F: the aim, the boss, the body. */
  const buildKitContext = (intent: ReturnType<typeof getMovementIntent>, height: number): DodgeContext => {
      const forward = lookForward(_forward);
      const f = (intent.forward ? 1 : 0) - (intent.backward ? 1 : 0);
      const r = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
      let moveDir: MotionVec3 | null = null;
      if (f !== 0 || r !== 0) {
          // right = forward × up for a world-up camera.
          _moveDir.x = forward.x * f + (-forward.z) * r;
          _moveDir.y = 0;
          _moveDir.z = forward.z * f + forward.x * r;
          const l = Math.hypot(_moveDir.x, _moveDir.z) || 1;
          _moveDir.x /= l; _moveDir.z /= l;
          moveDir = _moveDir;
      }
      // The aimed block, from the eye toward the crosshair (identical in both views).
      const ray = aimRay(viewRig.camera, viewRig.eye, viewRig.dir, sweepVoxels, 64);
      const hit = voxelRaycast(ray.origin.x, ray.origin.y, ray.origin.z, ray.dir.x, ray.dir.y, ray.dir.z, DASH_RANGE);
      let aimedMagnet: DodgeContext['aimedMagnet'] = null;
      if (hit) {
          const polarity = getMagnetPolarity(worldManager.getBlock(hit.bx, hit.by, hit.bz, false));
          if (polarity !== 0) {
              aimedMagnet = {
                  point: { x: ray.origin.x + ray.dir.x * hit.distance, y: ray.origin.y + ray.dir.y * hit.distance, z: ray.origin.z + ray.dir.z * hit.distance },
                  normal: { x: hit.nx, y: hit.ny, z: hit.nz },
                  polarity,
                  distance: hit.distance,
              };
          }
      }
      const bossEntity = entityManager.findBoss();
      const boss: DodgeContext['boss'] = bossEntity
          ? { x: bossEntity.pos.x, y: bossEntity.pos.y + bossEntity.height * 0.5, z: bossEntity.pos.z, polarity: bossEntity.polarity, radius: bossEntity.width * 0.5, vulnerable: !bossEntity.shielded }
          : null;
      return {
          attached: adhesion.current.active,
          grounded: grounded.current,
          flying: isFlying.current || boating,
          moveDir,
          forward,
          playerPolarity: magneticMode === 'controlled' ? inputState.magneticPolarity : 0,
          position: { x: pos.current.x, y: pos.current.y, z: pos.current.z },
          bodyHeight: height,
          bodyWidth: PLAYER_WIDTH,
          boss,
          aimedMagnet,
      };
  };

  /**
   * The dodge key was pressed: resolve it by the polarity rule and apply the
   * physics. Returns false when the kit could not answer (mid-action or on
   * cooldown) so the press stays queued for the next substep instead of being
   * thrown away, and the crosshair says why.
   */
  const pressKit = (intent: ReturnType<typeof getMovementIntent>, height: number): boolean => {
      const ctx = buildKitContext(intent, height);
      const { state, result } = resolveDodge(motion.current, ctx);
      if (result.kind === 'none') {
          if (result.reason === 'cooldown' || result.reason === 'busy') markDodgeRefused();
          return result.reason === 'flying';
      }
      motion.current = state;
      const at = { x: pos.current.x, y: pos.current.y, z: pos.current.z };
      switch (result.kind) {
          case 'jump-off':
              // The magnetic launch: thrown clear along the face (same repels).
              detachWall('launch', ADHESION_POLARITY_LAUNCH_SPEED, ADHESION_LAUNCH_UP);
              gameEvents.emit('player:dodge', { kind: 'jump-off', ...at });
              break;
          case 'roll':
              gameEvents.emit('player:dodge', { kind: 'roll', ...at });
              break;
          case 'dash':
              // Arriving pressed against a magnet face must latch at once.
              adhesion.current.detachCooldownUntil = 0;
              particleFx.burst({ x: at.x, y: at.y + height * 0.5, z: at.z, color: polarityFxColor(ctx.playerPolarity), color2: [1, 1, 1], count: 18, speed: 4, upBias: 0.5, spread: 0.6, dir: [-result.dir.x, -result.dir.y, -result.dir.z], size: 0.22, life: 0.45, gravity: 1, drag: 1.5 });
              gameEvents.emit('player:dodge', { kind: 'dash', ...at });
              break;
          case 'leap':
              vel.current.set(result.dir.x * LEAP_SPEED, LEAP_UP, result.dir.z * LEAP_SPEED);
              grounded.current = false;
              particleFx.burst({ x: at.x, y: at.y + 0.3, z: at.z, color: polarityFxColor(ctx.playerPolarity), color2: [1, 1, 1], count: 22, speed: 6, upBias: 1, spread: 0.8, size: 0.24, life: 0.5, gravity: 4, drag: 1.2 });
              gameEvents.emit('player:dodge', { kind: 'leap', ...at });
              break;
          default:
              break;
      }
      return true;
  };

  /** A dash ended (arrived or blocked): settle, and arm the slam if it reached the boss. */
  const finishDash = () => {
      const m = motion.current;
      if (m.action !== 'dash') return;
      const ontoBoss = m.onto === 'boss';
      motion.current = ontoBoss ? armSurge(endMotion(m)) : endMotion(m);
      if (ontoBoss) {
          addTrauma(0.2);
          particleFx.burst({ x: pos.current.x, y: pos.current.y + 1, z: pos.current.z, color: [1, 1, 1], color2: polarityFxColor(inputState.magneticPolarity), count: 24, speed: 5, upBias: 1.5, spread: 1, size: 0.22, life: 0.5, gravity: 3, drag: 1.2 });
          gameEvents.emit('player:surge', { armed: true });
      }
  };

  /**
   * The kit owns the body during a roll (a fast, easing run with gravity) and a
   * dash (a straight magnetic pull with no gravity), integrated per axis
   * against the voxels like the ordinary mover.
   */
  const stepKitMotion = (height: number): SimulationResult => {
      const m = motion.current;
      const newPos = pos.current.clone();
      const newVel = vel.current.clone();
      let blocked = false;
      const moveAxis = (axis: 'x' | 'y' | 'z', d: number) => {
          if (d === 0) return;
          newPos[axis] += d;
          if (checkCollision(worldManager, newPos, PLAYER_WIDTH, height)) {
              newPos[axis] -= d;
              newVel[axis] = 0;
              blocked = true;
          }
      };
      if (m.action === 'roll') {
          const wasGrounded = checkCollision(worldManager, { x: newPos.x, y: newPos.y - GROUND_EPS, z: newPos.z }, PLAYER_WIDTH, height);
          // Airborne the roll drives harder and keeps the fall going: this is
          // the move that saves you when the Warden launches you off the edge.
          const rv = rollVelocity(m, !wasGrounded);
          newVel.x = rv.x;
          newVel.z = rv.z;
          if (!wasGrounded) newVel.y = Math.max(newVel.y - GRAVITY * FIXED_DT, -TERMINAL_VELOCITY);
          else if (newVel.y < 0) newVel.y = 0;
          moveAxis('x', newVel.x * FIXED_DT);
          moveAxis('z', newVel.z * FIXED_DT);
          const dy = newVel.y * FIXED_DT;
          newPos.y += dy;
          let isGrounded = false;
          if (checkCollision(worldManager, newPos, PLAYER_WIDTH, height)) {
              newPos.y -= dy;
              if (newVel.y < 0) {
                  isGrounded = true;
                  const top = getSupportTop(worldManager, newPos, PLAYER_WIDTH);
                  if (top !== null) newPos.y = top + CONTACT_EPS;
              }
              newVel.y = 0;
          }
          if (newVel.y <= 0 && checkCollision(worldManager, { x: newPos.x, y: newPos.y - GROUND_EPS, z: newPos.z }, PLAYER_WIDTH, height)) {
              isGrounded = true;
              newVel.y = 0;
          }
          return { position: newPos, velocity: newVel, grounded: isGrounded };
      }
      // Dash: straight at the target, ending on arrival or against a block.
      const target = m.target ?? { x: newPos.x, y: newPos.y, z: newPos.z };
      const dx = target.x - newPos.x, dy = target.y - newPos.y, dz = target.z - newPos.z;
      const distance = Math.hypot(dx, dy, dz);
      const step = DASH_SPEED * FIXED_DT;
      let arrived = false;
      if (distance <= step + 1e-6) {
          moveAxis('x', dx); moveAxis('z', dz); moveAxis('y', dy);
          arrived = true;
      } else {
          const k = step / distance;
          moveAxis('x', dx * k); moveAxis('z', dz * k); moveAxis('y', dy * k);
      }
      newVel.set(m.dir.x, m.dir.y, m.dir.z).multiplyScalar(DASH_SPEED);
      if (arrived || blocked) {
          finishDash();
          newVel.multiplyScalar(0.15);
      }
      return { position: newPos, velocity: newVel, grounded: false };
  };

    useFrame((_, delta) => {
    const intent = getMovementIntent();

    if (gameMode === 'survival' && foodStateRef.current.foodLevel <= 6) {
        intent.sprint = false;
    }

    if (camera.type === 'PerspectiveCamera') {
        const pc = camera as PerspectiveCamera;
        if (forcedFov !== null && Number.isFinite(forcedFov)) {
            pc.fov = forcedFov;
        } else {
            const hSpeed = Math.sqrt(vel.current.x * vel.current.x + vel.current.z * vel.current.z);
            const effectiveSprint = !isPaused && isLocked && intent.sprint && !intent.sneak && hSpeed > 3.0;
            const dashing = motion.current.action === 'dash';
            const targetFov = baseFov + (effectiveSprint ? 20 : 0) + (dashing ? 12 : 0);
            // Use delta here for visual smoothing regardless of pause (if paused, FOV just freezes)
            const fovSmoothing = 1 - Math.exp(-10 * delta);
            pc.fov = MathUtils.lerp(pc.fov, targetFov, fovSmoothing);
        }
        pc.updateProjectionMatrix();
    }

    if (isPaused) {
        lastSimTime.current = null;
        return;
    }

    const now = performance.now() / 1000;
    if (lastSimTime.current === null) {
        lastSimTime.current = now;
        return;
    }
    const dt = Math.min(now - lastSimTime.current, 0.2);
    lastSimTime.current = now;

    timeAccumulator.current += dt;

    if (!isLocked) {
        intent.forward = false; intent.backward = false;
        intent.left = false; intent.right = false;
        intent.jump = false;
        intent.flyToggle = false;
        intent.dodge = false;
    }

    if (intent.flyToggle && gameMode === 'creative') {
        isFlying.current = !isFlying.current;
        if (isFlying.current) {
            vel.current.y = 0;
            grounded.current = false;
        }
    }
    if (gameMode === 'spectator') isFlying.current = true;
    if (gameMode === 'survival' && isFlying.current) isFlying.current = false;

    // (F5 toggles the view through App's global key handler, so it works whether
    // or not the pointer is locked; the rig below just applies viewRig.mode.)

    // The melee controller spent an armed Magnet Slam.
    if (motionRequests.consumeSurge) {
        motionRequests.consumeSurge = false;
        const spent = consumeSurge(motion.current);
        motion.current = spent.state;
        if (spent.slam) gameEvents.emit('player:surge', { armed: false });
    }

    // Boss magnetic field emitters (the Magnetic Warden's attract/repel aura),
    // fetched once per frame and applied each physics substep.
    const bossFields = entityManager.getMagneticFieldSources();

    // The dodge press stays queued in the input state until a physics substep
    // consumes it (at 60 fps only every third frame runs a 20 Hz substep, so a
    // per-frame flag would silently drop two presses out of three).
    let dodgePending = intent.dodge && !isDead && gameMode !== 'spectator';
    if (intent.dodge && !dodgePending) consumeDodgePress();

    let steps = 0;
    while (timeAccumulator.current >= FIXED_DT && steps < MAX_SUBSTEPS) {
        prevPos.current.copy(pos.current);
        simTime.current += FIXED_DT;

        if (spawnImmunityTicks.current > 0) spawnImmunityTicks.current--;
        if (invulnerabilityTimer.current > 0) invulnerabilityTimer.current--;
        if (invulnerabilityTimer.current <= 0) lastDamageTaken.current = 0;

        motion.current = advanceMotion(motion.current, FIXED_DT);
        const height = intent.sneak ? PLAYER_HEIGHT_SNEAK : PLAYER_HEIGHT;

        // --- Magnetic wall adhesion: hard-detach triggers + path selection ---
        const a = adhesion.current;
        const polarityFlipped = inputState.magneticPolarity !== prevPolarity.current;
        prevPolarity.current = inputState.magneticPolarity;
        const jumpEdge = intent.jump && !prevJump.current;
        prevJump.current = intent.jump;
        if (a.active && (magneticMode !== 'controlled' || isFlying.current || isDead)) {
            detachWall('mode-change', 0);
        }
        if (a.active && polarityFlipped) {
            if (climbSurfaces.inFlux(a.blockX, a.blockY, a.blockZ, climbSurfaces.clock)) {
                // The tower is mid-flip: the flip is the climber answering it, so
                // the grip holds (a re-grip spark, no launch).
                particleFx.burst({ x: pos.current.x, y: pos.current.y + height * 0.5, z: pos.current.z, color: polarityFxColor(inputState.magneticPolarity), color2: [1, 1, 1], count: 12, speed: 3, upBias: 0.5, spread: 1, size: 0.2, life: 0.4, gravity: 2, drag: 1.5 });
            } else {
                detachWall('polarity-flip', ADHESION_POLARITY_LAUNCH_SPEED, ADHESION_LAUNCH_UP);
            }
        }
        if (a.active && jumpEdge) detachWall('jump', ADHESION_JUMP_OFF_SPEED);

        if (dodgePending && pressKit(intent, height)) {
            dodgePending = false;
            consumeDodgePress();
        }

        if (a.active) {
            // Attached: walk/climb along the wall, no gravity, no fall/footstep.
            stepAdhesionMovement(intent, height);
            if (!Number.isFinite(pos.current.x) || !Number.isFinite(pos.current.y) || !Number.isFinite(pos.current.z)) {
                pos.current.copy(prevPos.current);
                vel.current.set(0, 0, 0);
                detachWall('failsafe', 0);
            }
            grounded.current = false;
            fallDistance.current = 0;
        } else {

        const startingJump = intent.jump && grounded.current && !isFlying.current;
        const kitOwnsBody = motion.current.action === 'roll' || motion.current.action === 'dash';

        // Boat dismount: a sneak press while riding hops out. The boat entity
        // stays parked where the ride ended.
        if (boating && intent.sneak && onExitBoat) {
            onExitBoat();
        }

        const simRes = kitOwnsBody
            ? stepKitMotion(height)
            : simulateStep(
                worldManager,
                pos.current,
                vel.current,
                intent,
                camera.rotation.y,
                FIXED_DT,
                isFlying.current,
                gameMode === 'spectator',
                boating && !isFlying.current
            );

        // --- Guard against Physics NaN ---
        if (!Number.isFinite(simRes.position.x) || !Number.isFinite(simRes.position.y) || !Number.isFinite(simRes.position.z)) {
            console.error("Physics NaN detected! Resetting position.", simRes.position);
            simRes.position.copy(prevPos.current);
            simRes.velocity.set(0, 0, 0);
        }

        if (gameMode === 'survival') {
            const dist = Math.hypot(simRes.position.x - pos.current.x, simRes.position.z - pos.current.z);
            const bx = Math.floor(pos.current.x);
            const by = Math.floor(pos.current.y);
            const bz = Math.floor(pos.current.z);
            const inFluid = worldManager.getBlock(bx, by, bz, false) === BlockType.WATER;

            if (inFluid) {
                if (intent.sprint || dist > 0) {
                    addExhaustion(foodStateRef.current, dist * EXHAUSTION_COSTS.SWIM);
                }
            } else if ((intent.sprint || kitOwnsBody) && !isFlying.current) {
                addExhaustion(foodStateRef.current, dist * EXHAUSTION_COSTS.SPRINT);
            }

            if (startingJump) {
                if (intent.sprint) {
                    addExhaustion(foodStateRef.current, EXHAUSTION_COSTS.JUMP_SPRINT);
                } else {
                    addExhaustion(foodStateRef.current, EXHAUSTION_COSTS.JUMP);
                }
            }
        }

        const feetBlock = worldManager.getBlock(Math.floor(simRes.position.x), Math.floor(simRes.position.y), Math.floor(simRes.position.z), false);
        if (feetBlock === BlockType.WATER) {
            fallDistance.current = 0;
        } else if (gameMode === 'survival' && !isFlying.current) {
            const dy = simRes.velocity.y * FIXED_DT;
            if (simRes.velocity.y < -0.01) {
                fallDistance.current += Math.abs(dy);
            } else if (simRes.velocity.y > 0) {
                fallDistance.current = 0;
            }

            if (simRes.grounded && !grounded.current) {
                // LANDED
                const landedBlock = worldManager.getBlock(Math.floor(simRes.position.x), Math.floor(simRes.position.y - 0.2), Math.floor(simRes.position.z), false);
                const group = getBlockSoundGroup(landedBlock);
                soundManager.playAt(`block.${group}.land`, simRes.position);

                const SAFE_FALL = 3.0;
                // A landing rolled through costs nothing: the fall is spent on
                // the roll. Pressing the dodge just before touchdown starts the
                // roll in the air, so the timing window is the roll itself.
                if (rollAbsorbsLanding(motion.current)) {
                    if (fallDistance.current > SAFE_FALL) {
                        soundManager.playAt('entity.player.roll', simRes.position, { volume: 0.8 });
                        particleFx.burst({
                            x: simRes.position.x, y: simRes.position.y + 0.2, z: simRes.position.z,
                            color: [0.85, 0.85, 0.9], color2: [1, 1, 1], count: 16, speed: 5, upBias: 1,
                            spread: 1, size: 0.18, life: 0.4, gravity: 6, drag: 1.6,
                        });
                    }
                } else if (fallDistance.current > SAFE_FALL) {
                    // Magnetic Spikes (and any future hazard surface) amplify the
                    // base fall damage, applied once per landing.
                    const multiplier = getFallDamageMultiplierForLandingBlock(landedBlock);
                    // Polarity boots cushion the impact (fallDamageFactor < 1 while
                    // the ability is active; upgraded boots cushion more).
                    applyDamage(Math.ceil((fallDistance.current - SAFE_FALL) * multiplier * fallDamageFactor));
                }
                fallDistance.current = 0;
            }
        } else {
            fallDistance.current = 0;
        }

        // FOOTSTEPS
        if (simRes.grounded && !isFlying.current && gameMode !== 'spectator') {
            const dx = simRes.position.x - pos.current.x;
            const dz = simRes.position.z - pos.current.z;
            const dist = Math.sqrt(dx*dx + dz*dz);

            if (dist > 0.001) {
                stepAccumulator.current += dist;
                let threshold = 0.45; // Walk
                if (intent.sprint) threshold = 0.33;
                if (intent.sneak) threshold = 0.7; // Slower footsteps
                if (kitOwnsBody) threshold = 0.9; // A roll scuffs, it doesn't step

                if (stepAccumulator.current >= threshold) {
                    stepAccumulator.current -= threshold;

                    const bx = Math.floor(simRes.position.x);
                    const by = Math.floor(simRes.position.y - 0.2);
                    const bz = Math.floor(simRes.position.z);
                    const blockBelow = worldManager.getBlock(bx, by, bz, false);

                    if (blockBelow !== BlockType.AIR) {
                        const group = getBlockSoundGroup(blockBelow);
                        soundManager.playAt(`block.${group}.step`, simRes.position, { volume: intent.sneak ? 0.5 : 1.0 });
                    }
                }
            }
        }

        // SWIM SOUNDS
        const headBlock = worldManager.getBlock(Math.floor(simRes.position.x), Math.floor(simRes.position.y + 1.5), Math.floor(simRes.position.z), false);
        const inWater = feetBlock === BlockType.WATER || headBlock === BlockType.WATER;

        if (inWater && !isFlying.current) {
             const vLen = simRes.velocity.length();
             if (vLen > 0.1) {
                 stepAccumulator.current += vLen * FIXED_DT;
                 if (stepAccumulator.current >= 0.7) {
                     stepAccumulator.current = 0;
                     soundManager.playAt("block.water.swim", simRes.position);
                 }
             }
        }

        pos.current.copy(simRes.position);
        vel.current.copy(simRes.velocity);
        grounded.current = simRes.grounded;

        const dashing = motion.current.action === 'dash';

        // Magnetism (Phase 4): nudge velocity from nearby magnet blocks. Applied
        // after integration (like the sprint-jump boost) so this tick's friction
        // doesn't immediately cancel it; collision is resolved next substep. A
        // dash owns the body outright.
        if (magneticMode !== 'none' && !isFlying.current && !boating && !dashing) {
            // Gentle pull while grounded (so you can stand and walk to a block's
            // edge), full strength airborne (so traversal/attaching still works).
            applyMagneticForce(
                worldManager,
                pos.current,
                vel.current,
                magneticMode,
                inputState.magneticPolarity,
                FIXED_DT,
                height,
                grounded.current ? 0.25 : 1,
            );
        }

        // Boss magnetic field (the Magnetic Warden): a strong, clamped attract/
        // repel force the player counters by flipping polarity. Skipped while
        // flying so creative flight is unaffected.
        if (bossFields.length > 0 && !isFlying.current && !dashing) {
            applyBossMagneticFields(
                pos.current,
                vel.current,
                inputState.magneticPolarity,
                FIXED_DT,
                bossFields,
                height,
            );
        }

        // Latch onto a magnet wall when pressed against an attractive face. The
        // pull-through-air above brings the player in; only here (real contact)
        // does adhesion begin, so the camera never rolls mid-flight.
        if (magneticMode === 'controlled' && !isFlying.current && !isDead && !boating && !dashing && Date.now() >= a.detachCooldownUntil) {
            const center: Vec3 = { x: pos.current.x, y: pos.current.y + height * 0.5, z: pos.current.z };
            const cand = findAdhesionCandidate(magnetPolarityAt, solidAt, center, inputState.magneticPolarity, undefined, attractiveAt);
            if (cand && cand.strength >= ADHESION_ATTACH_STRENGTH) beginAttach(cand);
        }
        } // end normal-movement path

        // Hazards / breath read the resolved feet & head blocks (both paths).
        const feetBlock = worldManager.getBlock(Math.floor(pos.current.x), Math.floor(pos.current.y), Math.floor(pos.current.z), false);
        const headBlock = worldManager.getBlock(Math.floor(pos.current.x), Math.floor(pos.current.y + 1.5), Math.floor(pos.current.z), false);

        const bx = Math.floor(pos.current.x);
        const by = Math.floor(pos.current.y);
        const bz = Math.floor(pos.current.z);
        const blockBelow = worldManager.getBlock(bx, Math.floor(pos.current.y - 0.2), bz, false);

        if (feetBlock === BlockType.LAVA || headBlock === BlockType.LAVA) {
            fireTicks.current = 300;
            if (gameMode === 'survival' && invulnerabilityTimer.current <= 0) applyDamage(4);
        } else if (feetBlock === BlockType.WATER || headBlock === BlockType.WATER) {
            fireTicks.current = 0;
        }

        if (blockBelow === BlockType.MAGMA && !intent.sneak && grounded.current) {
            applyDamage(1);
        }

        if (blockBelow === BlockType.CACTUS && grounded.current) {
            applyDamage(1);
        }

        if (fireTicks.current > 0) {
            fireTicks.current--;
            if (fireTicks.current % 20 === 0 && gameMode === 'survival') applyDamage(1);
        }

        const damageThreshold = 0.92;
        let cactusHit = false;

        for (let x = bx - 1; x <= bx + 1; x++) {
            for (let z = bz - 1; z <= bz + 1; z++) {
                const dx = Math.abs(pos.current.x - (x + 0.5));
                const dz = Math.abs(pos.current.z - (z + 0.5));

                if (dx < damageThreshold && dz < damageThreshold) {
                    if (worldManager.getBlock(x, by, z, false) === BlockType.CACTUS ||
                        worldManager.getBlock(x, by + 1, z, false) === BlockType.CACTUS) {
                        applyDamage(1);
                        cactusHit = true;
                        break;
                    }
                }
            }
            if (cactusHit) break;
        }

        if (headBlock === BlockType.WATER && gameMode === 'survival') {
            breathRef.current = Math.max(0, breathRef.current - 1);
            if (breathRef.current <= 0) {
                if (drowningCooldown.current <= 0) {
                    applyDamage(2);
                    drowningCooldown.current = 20;
                }
                drowningCooldown.current--;
            }
        } else {
            breathRef.current = Math.min(MAX_BREATH, breathRef.current + 5);
            drowningCooldown.current = 0;
        }

        const cx = Math.floor(pos.current.x / CHUNK_SIZE);
        const cz = Math.floor(pos.current.z / CHUNK_SIZE);
        if (!lastChunk.current || lastChunk.current.cx !== cx || lastChunk.current.cz !== cz) {
            if (Number.isFinite(cx) && Number.isFinite(cz)) {
                lastChunk.current = { cx, cz };
                if (onChunkChange) onChunkChange(cx, cz);
            }
        }

        timeAccumulator.current -= FIXED_DT;
        steps++;
    }

    // The press was offered to this frame's substeps and none could take it
    // (mid-action, on cooldown). Keep it queued briefly so it lands the moment
    // the kit frees up, then drop it so it cannot fire long after the fact.
    if (dodgePending && dodgePressAge() > DODGE_BUFFER_MS) consumeDodgePress();

    const alpha = Math.max(0, Math.min(1, timeAccumulator.current / FIXED_DT));
    renderPos.current.lerpVectors(prevPos.current, pos.current, alpha);

    // Carry the ridden boat: the entity's body tracks the rider's feet and the
    // hull yaws to the camera so the bow always points where you steer.
    if (boating && ridingBoatId !== null) {
        const boat = entityManager.getEntity(ridingBoatId);
        if (boat) {
            boat.pos.set(renderPos.current.x, renderPos.current.y - 0.05, renderPos.current.z);
            boat.yaw = camera.rotation.y;
            boat.vel.set(vel.current.x, 0, vel.current.z);
        }
    }

    const blockHeadUI = worldManager.getBlock(Math.floor(pos.current.x), Math.floor(pos.current.y + 1.5), Math.floor(pos.current.z), false);
    setHeadBlock(blockHeadUI);
    setBreath(breathRef.current);
    setIsOnFire(fireTicks.current > 0);

    const targetHeight = intent.sneak ? EYE_HEIGHT_SNEAKING : EYE_HEIGHT_STANDING;
    const smoothing = 1 - Math.exp(-15 * dt);
    currentEyeHeight.current = MathUtils.lerp(currentEyeHeight.current, targetHeight, smoothing);

    if (Math.abs(damageTilt.current) > 0.001) {
        damageTilt.current = MathUtils.lerp(damageTilt.current, 0, dt * 6.0);
    } else {
        damageTilt.current = 0;
    }

    // Camera orientation. While latched to a magnetic wall the "up" vector rolls
    // to the surface normal and look is around that normal; on detach it eases
    // back to world-up before handing control back to the FPS mouse-look. Only a
    // real attachment rolls the camera, being pulled through the air does not.
    const aCam = adhesion.current;
    if (aCam.active) {
        lookBridge.active = true;
        // Look is 1:1 with the mouse (no smoothing) so it feels exactly like the
        // normal FPS camera. Horizontal is negated so mouse-right turns right.
        aCam.lookYaw -= lookBridge.dYaw;
        aCam.lookPitch += lookBridge.dPitch;
        lookBridge.dYaw = 0;
        lookBridge.dPitch = 0;
        aCam.lookPitch = Math.max(-1.45, Math.min(1.45, aCam.lookPitch));
        wallQuat(aCam, _wallTarget);
        if (rollT.current < 1) {
            // Ease only the roll onto the wall, toward the live look target.
            rollT.current = Math.min(1, rollT.current + dt / ROLL_TIME);
            camera.quaternion.slerpQuaternions(rollFrom.current, _wallTarget, easeOutCubic(rollT.current));
        } else {
            camera.quaternion.copy(_wallTarget); // tracked directly, zero drag
        }
    } else if (unrolling.current) {
        // Ease the roll back to world-up, then hand look control to the FPS mouse.
        rollT.current = Math.min(1, rollT.current + dt / ROLL_TIME);
        camera.quaternion.slerpQuaternions(rollFrom.current, unrollTarget.current, easeOutCubic(rollT.current));
        if (rollT.current >= 1) {
            unrolling.current = false;
            lookBridge.active = false;
            lookBridge.dYaw = 0;
            lookBridge.dPitch = 0;
            _tmpEuler.setFromQuaternion(unrollTarget.current, 'YXZ');
            camera.rotation.set(_tmpEuler.x, _tmpEuler.y, 0);
        }
    } else {
        camera.rotation.z = damageTilt.current;
    }

    // The eye: where the player looks from, in both views.
    let eyeX: number, eyeY: number, eyeZ: number;
    if (aCam.active) {
        // Stand the eye off the wall by the normal eye height (like walking
        // around normally) instead of sitting at the surface: push the body
        // centre out along the surface normal so the camera is ~one block out.
        const half = (intent.sneak ? PLAYER_HEIGHT_SNEAK : PLAYER_HEIGHT) * 0.5;
        const standoff = currentEyeHeight.current - aCam.contactDistance;
        eyeX = renderPos.current.x + aCam.normal.x * standoff;
        eyeY = renderPos.current.y + half + aCam.normal.y * standoff;
        eyeZ = renderPos.current.z + aCam.normal.z * standoff;
    } else {
        eyeX = renderPos.current.x;
        eyeY = renderPos.current.y + currentEyeHeight.current;
        eyeZ = renderPos.current.z;
    }
    viewRig.eye.x = eyeX; viewRig.eye.y = eyeY; viewRig.eye.z = eyeZ;
    camera.getWorldDirection(_viewDir);
    viewRig.dir.x = _viewDir.x; viewRig.dir.y = _viewDir.y; viewRig.dir.z = _viewDir.z;

    // Third person: the camera hangs on a voxel-aware spring arm behind and over
    // the shoulder of the eye; first person puts it at the eye.
    if (viewRig.mode === 'third' && !bossSummon.isActive()) {
        _camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
        _camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
        const placement = placeThirdPersonCamera(
            viewRig.eye,
            viewRig.dir,
            { x: _camRight.x, y: _camRight.y, z: _camRight.z },
            { x: _camUp.x, y: _camUp.y, z: _camUp.z },
            sweepVoxels,
        );
        camera.position.set(placement.camera.x, placement.camera.y, placement.camera.z);
        viewRig.third = true;
        viewRig.armLength = placement.armLength;
        viewRig.showModel = placement.showModel && !isDead;
    } else {
        camera.position.set(eyeX, eyeY, eyeZ);
        viewRig.third = false;
        viewRig.armLength = 0;
        viewRig.showModel = false;
    }
    viewRig.camera.x = camera.position.x; viewRig.camera.y = camera.position.y; viewRig.camera.z = camera.position.z;

    // Global camera shake (boss slams etc.) on top of the resolved eye position.
    sampleShake(_shakeOffset, delta);
    camera.position.x += _shakeOffset.x;
    camera.position.y += _shakeOffset.y;
    camera.position.z += _shakeOffset.z;

    // The body, for the third-person model.
    playerPose.x = renderPos.current.x; playerPose.y = renderPos.current.y; playerPose.z = renderPos.current.z;
    if (aCam.active) {
        const look = wallViewDir(aCam, _wallView);
        playerPose.yaw = Math.atan2(-look.x, -look.z);
        playerPose.pitch = Math.asin(Math.max(-1, Math.min(1, look.y)));
        playerPose.up.x = aCam.localUp.x; playerPose.up.y = aCam.localUp.y; playerPose.up.z = aCam.localUp.z;
        const basis = computeLocalBasis(aCam.normal, { x: look.x, y: look.y, z: look.z });
        playerPose.wallForward.x = basis.forward.x; playerPose.wallForward.y = basis.forward.y; playerPose.wallForward.z = basis.forward.z;
        playerPose.wallRight.x = basis.right.x; playerPose.wallRight.y = basis.right.y; playerPose.wallRight.z = basis.right.z;
    } else {
        playerPose.yaw = Math.atan2(-_viewDir.x, -_viewDir.z);
        playerPose.pitch = Math.asin(Math.max(-1, Math.min(1, _viewDir.y)));
        playerPose.up.x = 0; playerPose.up.y = 1; playerPose.up.z = 0;
    }
    playerPose.vx = vel.current.x; playerPose.vy = vel.current.y; playerPose.vz = vel.current.z;
    playerPose.grounded = grounded.current;
    playerPose.sneak = intent.sneak;
    playerPose.sprint = intent.sprint;
    playerPose.attached = aCam.active;
    playerPose.polarity = magneticMode === 'controlled' ? inputState.magneticPolarity : 0;
    playerPose.time = simTime.current;

    // Which tower (if any) the climber clings to, for the HUD's flip warning,
    // and the kit's live status (the damage gate, the F prompt, the HUD).
    climbSurfaces.attachedZone = aCam.active ? (climbSurfaces.zoneAt(aCam.blockX, aCam.blockY, aCam.blockZ)?.id ?? null) : null;
    const kitHeight = intent.sneak ? PLAYER_HEIGHT_SNEAK : PLAYER_HEIGHT;
    const prompt = isDead || gameMode === 'spectator' ? 'none' : previewDodge(motion.current, buildKitContext(intent, kitHeight));
    writeMotionStatus(motion.current, prompt);
  });

  return null;
});
