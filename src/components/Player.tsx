
import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3, MathUtils, PerspectiveCamera, Quaternion, Matrix4, Euler } from 'three';
import { CHUNK_SIZE } from '../constants';
import { worldManager } from '../systems/WorldManager';
import { BlockType, type GameMode } from '../types';
import {
    onKeyDown, onKeyUp, getMovementIntent, inputState, lookBridge
} from '../systems/player/playerInput';
import { simulateStep } from '../systems/player/playerMovement';
import { applyMagneticForce, getMagnetPolarity, type MagneticMode } from '../systems/player/magnetism';
import { checkCollision, isSolid as isSolidCell } from '../systems/player/playerCollision';
import {
    createAdhesionState, findAdhesionCandidate, computeLocalBasis, projectInput, detachImpulse,
    evaluateSoftDetach, type AdhesionState, type Vec3,
    ADHESION_ATTACH_STRENGTH, ADHESION_CLIMB_SPEED, ADHESION_STICK_SPEED,
    ADHESION_JUMP_OFF_SPEED, ADHESION_POLARITY_LAUNCH_SPEED, ADHESION_TANGENT_PRESERVE,
    ADHESION_REATTACH_COOLDOWN_MS,
} from '../systems/player/magneticAdhesion';
import {
    EYE_HEIGHT_STANDING, EYE_HEIGHT_SNEAKING,
    FIXED_DT, MAX_SUBSTEPS, MAX_BREATH,
    PLAYER_HEIGHT, PLAYER_HEIGHT_SNEAK, PLAYER_WIDTH,
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

/** Duration (seconds) of the camera roll onto / off the wall. */
const ROLL_TIME = 0.22;
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

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
}

export const PlayerRefUpdater: React.FC<{ playerPosRef: React.MutableRefObject<Vector3> }> = ({ playerPosRef }) => {
  useFrame(({ camera }) => {
    playerPosRef.current.copy(camera.position);
    const eyeHeight = inputState.sneak ? EYE_HEIGHT_SNEAKING : EYE_HEIGHT_STANDING;
    playerPosRef.current.y -= eyeHeight; 
  });
  return null;
};

export const Player = forwardRef<PlayerHandle, PlayerProps>(({ 
    position, onChunkChange, onTakeDamage, isLocked, isPaused, gameMode, 
    setBreath, baseFov, setHeadBlock, setIsOnFire, foodStateRef,
    isDead, forcedFov = null, magneticMode = 'none'
}, ref) => {
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
          grounded.current = false;
          fallDistance.current = 0;
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
    
    camera.position.copy(pos.current).add(new Vector3(0, EYE_HEIGHT_STANDING, 0));
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
  // start the reattach cooldown, and begin easing the camera back to world-up.
  const detachWall = (reason: string, launchSpeed: number) => {
      const a = adhesion.current;
      if (!a.active) return;
      const imp = detachImpulse(a.localUp, { x: vel.current.x, y: vel.current.y, z: vel.current.z }, launchSpeed, ADHESION_TANGENT_PRESERVE);
      vel.current.set(imp.x, imp.y, imp.z);
      a.active = false;
      a.detachReason = reason;
      a.detachCooldownUntil = Date.now() + ADHESION_REATTACH_COOLDOWN_MS;
      // Snapshot the look direction so the un-roll preserves where the player is
      // looking — only the up-vector rotates back to world-up.
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
      const cand = findAdhesionCandidate(magnetPolarityAt, solidAt, center, inputState.magneticPolarity);
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
      const reason = evaluateSoftDetach(a, now, strength, !!cand);
      if (reason) detachWall(reason, ADHESION_JUMP_OFF_SPEED * 0.35);
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
            const targetFov = baseFov + (effectiveSprint ? 20 : 0);
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

    let steps = 0;
    while (timeAccumulator.current >= FIXED_DT && steps < MAX_SUBSTEPS) {
        prevPos.current.copy(pos.current);

        if (spawnImmunityTicks.current > 0) spawnImmunityTicks.current--;
        if (invulnerabilityTimer.current > 0) invulnerabilityTimer.current--;
        if (invulnerabilityTimer.current <= 0) lastDamageTaken.current = 0;

        // --- Magnetic wall adhesion: hard-detach triggers + path selection ---
        const a = adhesion.current;
        const polarityFlipped = inputState.magneticPolarity !== prevPolarity.current;
        prevPolarity.current = inputState.magneticPolarity;
        const jumpEdge = intent.jump && !prevJump.current;
        prevJump.current = intent.jump;
        if (a.active && (magneticMode !== 'controlled' || isFlying.current || isDead)) {
            detachWall('mode-change', 0);
        }
        if (a.active && polarityFlipped) detachWall('polarity-flip', ADHESION_POLARITY_LAUNCH_SPEED);
        if (a.active && jumpEdge) detachWall('jump', ADHESION_JUMP_OFF_SPEED);

        if (a.active) {
            // Attached: walk/climb along the wall, no gravity, no fall/footstep.
            const aHeight = intent.sneak ? PLAYER_HEIGHT_SNEAK : PLAYER_HEIGHT;
            stepAdhesionMovement(intent, aHeight);
            if (!Number.isFinite(pos.current.x) || !Number.isFinite(pos.current.y) || !Number.isFinite(pos.current.z)) {
                pos.current.copy(prevPos.current);
                vel.current.set(0, 0, 0);
                detachWall('failsafe', 0);
            }
            grounded.current = false;
            fallDistance.current = 0;
        } else {

        const startingJump = intent.jump && grounded.current && !isFlying.current;

        const simRes = simulateStep(
            worldManager, 
            pos.current, 
            vel.current, 
            intent, 
            camera.rotation.y, 
            FIXED_DT, 
            isFlying.current,
            gameMode === 'spectator'
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
            } else if (intent.sprint && !isFlying.current) {
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
                if (fallDistance.current > SAFE_FALL) {
                    // Magnetic Spikes (and any future hazard surface) amplify the
                    // base fall damage, applied once per landing.
                    const multiplier = getFallDamageMultiplierForLandingBlock(landedBlock);
                    applyDamage(Math.ceil((fallDistance.current - SAFE_FALL) * multiplier));
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

        // Magnetism (Phase 4): nudge velocity from nearby magnet blocks. Applied
        // after integration (like the sprint-jump boost) so this tick's friction
        // doesn't immediately cancel it; collision is resolved next substep.
        if (magneticMode !== 'none' && !isFlying.current) {
            applyMagneticForce(
                worldManager,
                pos.current,
                vel.current,
                magneticMode,
                inputState.magneticPolarity,
                FIXED_DT,
                intent.sneak ? PLAYER_HEIGHT_SNEAK : PLAYER_HEIGHT,
            );
        }

        // Latch onto a magnet wall when pressed against an attractive face. The
        // pull-through-air above brings the player in; only here (real contact)
        // does adhesion begin, so the camera never rolls mid-flight.
        if (magneticMode === 'controlled' && !isFlying.current && !isDead && Date.now() >= a.detachCooldownUntil) {
            const aHeight = intent.sneak ? PLAYER_HEIGHT_SNEAK : PLAYER_HEIGHT;
            const center: Vec3 = { x: pos.current.x, y: pos.current.y + aHeight * 0.5, z: pos.current.z };
            const cand = findAdhesionCandidate(magnetPolarityAt, solidAt, center, inputState.magneticPolarity);
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

    const alpha = Math.max(0, Math.min(1, timeAccumulator.current / FIXED_DT));
    renderPos.current.lerpVectors(prevPos.current, pos.current, alpha);

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
    // real attachment rolls the camera — being pulled through the air does not.
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
            camera.quaternion.copy(_wallTarget); // tracked directly — zero drag
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

    if (aCam.active) {
        // Stand the eye off the wall by the normal eye height (like walking
        // around normally) instead of sitting at the surface: push the body
        // centre out along the surface normal so the camera is ~one block out.
        const half = (intent.sneak ? PLAYER_HEIGHT_SNEAK : PLAYER_HEIGHT) * 0.5;
        const standoff = currentEyeHeight.current - aCam.contactDistance;
        camera.position.set(
            renderPos.current.x + aCam.normal.x * standoff,
            renderPos.current.y + half + aCam.normal.y * standoff,
            renderPos.current.z + aCam.normal.z * standoff,
        );
    } else {
        camera.position.set(
            renderPos.current.x,
            renderPos.current.y + currentEyeHeight.current,
            renderPos.current.z
        );
    }
  });

  return null;
});
