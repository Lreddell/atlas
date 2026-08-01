import { BlockType } from '../../types';
import { ENTITY_KINDS, type EntityKind } from './Entity';
import { registerVaultEnemies } from './resonantVaultEnemies';

// The definitive vault roster is the Bell Titan plus the four room enemies
// registered by registerVaultEnemies. The prototype Echo Sentinel family was
// retired with the definitive overhaul and is intentionally absent.
export const RESONANT_ENTITY_KINDS: Record<string, EntityKind> = {
    bell_titan: {
        id: 'bell_titan',
        maxHp: 390,
        width: 3.6,
        height: 6.5,
        speed: 0,
        aggroRange: 42,
        contactDamage: 0,
        attackCooldown: 1.1,
        color: 0x6f654f,
        armored: true,
        staggerResistance: 0.78,
        isBoss: true,
        leashRadius: 17,
        // The signature weapon belongs to the Titan, never an earlier cache.
        drops: [{ type: BlockType.TITAN_HAMMER, min: 1, max: 1, chance: 1 }],
    },
};

let registered = false;
export function registerResonantEntities(): void {
    if (registered) return;
    Object.assign(ENTITY_KINDS, RESONANT_ENTITY_KINDS);
    registerVaultEnemies(ENTITY_KINDS, {
        fracturedCore: BlockType.FRACTURED_CORE,
        echoShard: BlockType.ECHO_SHARD,
        vaultBolt: BlockType.VAULT_BOLT,
    });
    registered = true;
}

registerResonantEntities();
