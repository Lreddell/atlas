
import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3, MathUtils } from 'three';
import { CHUNK_SIZE } from '../constants';
import { worldManager } from '../systems/WorldManager';
import { BlockType } from '../types';
import { 
    onKeyDown, onKeyUp, getMovementIntent, inputState
} from '../systems/player/playerInput';
import { simulateStep } from '../systems/player/playerMovement';
import { 
    EYE_HEIGHT_STANDING, EYE_HEIGHT_SNEAKING, 
    FIXED_DT, MAX_SUBSTEPS, MAX_BREATH 
} from '../systems/player/playerConstants';
import { addExhaustion, EXHAUSTION_COSTS } from '../systems/player/playerFood';
import { soundManager } from '../systems/sound/SoundManager';
import { getBlockSoundGroup } from '../systems/sound/blockSoundGroups';

export interface PlayerHandle {
    teleport: (pos: Vector3) => void;
}

interface PlayerProps {
  position: Vector3;
  onChunkChange?: (cx: number, cz: number) => void;
  onTakeDamage?: (amount: number) => void;
  isLocked: boolean;
  isPaused: boolean;
  gameMode: 'survival' | 'creative' | 'spectator';
  setBreath: (val: number) => void;
  baseFov: number;
  setHeadBlock: (type: BlockType) => void;
  setIsOnFire: (val: boolean) => void;
  foodStateRef: any; 
  isDead: boolean;
    forcedFov?: number | null;
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
    isDead, forcedFov = null
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
      }
  }));

  // Sync physics state with prop updates (e.g. after world generation determines safe spawn)
  useEffect(() => {
    camera.rotation.order = 'YXZ'; 
    camera.up.set(0, 1, 0);
    camera.rotation.z = 0;
    
    // Reset physics state to match the new start position
    pos.current.copy(position);
    prevPos.current.copy(position);
    renderPos.current.copy(position);
    vel.current.set(0, 0, 0);
    grounded.current = false;
    fallDistance.current = 0;
    
    camera.position.copy(pos.current).add(new Vector3(0, EYE_HEIGHT_STANDING, 0));
  }, [position]); // Dependency on position ensures we teleport when the parent finishes loading

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!isLocked || isPaused) return;
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

    useFrame((_, delta) => {
    const intent = getMovementIntent();

    if (gameMode === 'survival' && foodStateRef.current.foodLevel <= 6) {
        intent.sprint = false;
    }

    if (camera.type === 'PerspectiveCamera') {
        const pc = camera as any;
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
                    applyDamage(Math.ceil(fallDistance.current - SAFE_FALL));
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
    
    camera.rotation.z = damageTilt.current;

    camera.position.set(
        renderPos.current.x,
        renderPos.current.y + currentEyeHeight.current,
        renderPos.current.z
    );
  });

  return null;
});
