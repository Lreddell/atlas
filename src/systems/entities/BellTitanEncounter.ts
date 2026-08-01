import { BLOCKS } from '../../data/blocks';
import { BlockType } from '../../types';
import { worldManager } from '../WorldManager';
import { gameEvents } from '../events/GameEvents';
import { progression } from '../progression/ProgressionStore';
import { particleFx } from '../fx/particleFx';
import { addTrauma } from '../player/cameraShake';
import {
    BellTitanArena,
    type BellTitanPoint,
} from './BellTitanArena';
import { entityManager } from './EntityManager';
import {
    BellTitanEncounterCore,
    type BellTitanEventSink,
    type BellTitanHitZone,
} from './BellTitanEncounterCore';

export * from './BellTitanEncounterCore';

function isBlocking(type: BlockType | null): boolean {
    return type !== null
        && type !== BlockType.AIR
        && type !== BlockType.WATER
        && type !== BlockType.LAVA
        && BLOCKS[type]?.noCollision !== true;
}

function hasArenaLineOfSight(origin: BellTitanPoint, target: BellTitanPoint): boolean {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dz = target.z - origin.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance <= 1) return true;
    const steps = Math.max(1, Math.ceil(distance * 3));
    for (let index = 2; index < steps - 1; index += 1) {
        const t = index / steps;
        const x = Math.floor(origin.x + dx * t);
        const y = Math.floor(origin.y + 0.75 + dy * t);
        const z = Math.floor(origin.z + dz * t);
        if (isBlocking(worldManager.tryGetBlock(x, y, z) as BlockType | null)) return false;
    }
    return true;
}

const titanArena = new BellTitanArena();
const titanEvents: BellTitanEventSink = {
    emit: (name, payload) => {
        const entityId = typeof payload.entityId === 'number' ? payload.entityId : null;
        const entity = entityId === null ? null : entityManager.getEntity(entityId);
        if (entity && name === 'vault:titan-strike') {
            const attack = typeof payload.attack === 'string' ? payload.attack : '';
            const heavy = attack === 'vaultbreaker' || attack === 'phase_burst' || attack === 'bell_storm';
            particleFx.burst({
                x: entity.pos.x,
                y: entity.pos.y + (attack.includes('toll') || attack.includes('storm') ? 3 : 0.35),
                z: entity.pos.z,
                color: heavy ? [0.82, 0.62, 0.34] : [0.62, 0.5, 0.34],
                color2: [0.92, 0.82, 0.62],
                count: heavy ? 28 : 16,
                speed: heavy ? 8 : 5,
                upBias: heavy ? 2.6 : 1.2,
                spread: 0.9,
                size: heavy ? 0.22 : 0.16,
                life: heavy ? 0.9 : 0.6,
                gravity: 8,
                drag: 1.5,
            });
            addTrauma(heavy ? 0.58 : 0.28);
        } else if (entity && name === 'vault:titan-core') {
            if (payload.open === true) particleFx.burst({
                x: entity.pos.x,
                y: entity.pos.y + 2.9,
                z: entity.pos.z + 1.35,
                color: [0.88, 0.65, 0.35],
                color2: [1, 0.9, 0.66],
                count: 18,
                speed: 3.6,
                upBias: 0.8,
                spread: 0.65,
                size: 0.15,
                life: 0.85,
                gravity: 1.2,
                drag: 1.8,
            });
        } else if (entity && name === 'vault:titan-shell-broken') {
            particleFx.burst({
                x: entity.pos.x,
                y: entity.pos.y + 3.2,
                z: entity.pos.z,
                color: [0.46, 0.43, 0.36],
                color2: [0.78, 0.58, 0.3],
                count: payload.stage === 2 ? 42 : 32,
                speed: 9,
                upBias: 3,
                spread: 1,
                size: 0.24,
                life: 1.1,
                gravity: 12,
                drag: 1.2,
            });
            addTrauma(payload.stage === 2 ? 0.9 : 0.72);
        }
        gameEvents.emit(
            name as keyof import('../events/GameEvents').GameEventMap,
            payload as never,
        );
    },
};

export class BellTitanEncounter extends BellTitanEncounterCore {
    constructor() {
        super({
            arena: titanArena,
            entities: {
                spawn: (...args) => entityManager.spawn(...args),
                getEntity: (id) => entityManager.getEntity(id),
                despawn: (id) => entityManager.despawn(id),
                defeat: (id) => entityManager.defeatEntity(id),
            },
            progression,
            events: titanEvents,
            hasLineOfSight: hasArenaLineOfSight,
        });
        entityManager.registerDamageHandler('bell_titan', (entityId, amount, _knockX, _knockZ, _stagger, hitZone) => (
            this.applyHit(entityId, amount, hitZone as BellTitanHitZone | undefined)
        ));
    }
}

export const bellTitanEncounter = new BellTitanEncounter();
