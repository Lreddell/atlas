import * as THREE from 'three';
import { BlockType } from '../../types';

// A live entity instance. Positions follow the same convention as the player
// collision helpers: pos.x/pos.z are the horizontal center, pos.y is the feet
// (AABB bottom). width is the full footprint, height the full height.
export interface Entity {
    id: number;
    kind: string;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    width: number;
    height: number;
    hp: number;
    maxHp: number;
    grounded: boolean;
    aggro: boolean;
    /** ms timestamp until which the entity renders a hurt flash. */
    hurtUntil: number;
    /** seconds remaining before this entity can deal contact damage again. */
    attackCooldown: number;
    /** seconds remaining before AI may replace horizontal knockback velocity. */
    knockbackSeconds: number;
    /** facing yaw (radians) for rendering. */
    yaw: number;
    isBoss: boolean;
    bossId?: string;
    regionId?: string;
}

export interface DropSpec {
    type: BlockType;
    min: number;
    max: number;
    chance?: number; // 0..1, default 1
}

// Static, data-driven definition of an entity type. Add a new enemy/boss by
// adding an entry here (and, for bosses, wiring its bossId/region at spawn).
export interface EntityKind {
    id: string;
    maxHp: number;
    width: number;
    height: number;
    /** horizontal move speed in blocks/sec when chasing. */
    speed: number;
    /** distance (blocks) at which the entity notices and chases the player. */
    aggroRange: number;
    contactDamage: number;
    /** seconds between contact hits. */
    attackCooldown: number;
    /** render color (hex). */
    color: number;
    isBoss?: boolean;
    drops?: DropSpec[];
    /** can the entity jump up a 1-block step while chasing. */
    canStep?: boolean;
}

export const ENTITY_KINDS: Record<string, EntityKind> = {
    slime: {
        id: 'slime',
        maxHp: 16,
        width: 0.9,
        height: 0.9,
        speed: 2.6,
        aggroRange: 14,
        contactDamage: 3,
        attackCooldown: 0.8,
        color: 0x5bbf5b,
        drops: [{ type: BlockType.DIRT, min: 0, max: 2 }],
        canStep: true,
    },
    cinder_warden: {
        id: 'cinder_warden',
        maxHp: 200,
        width: 1.6,
        height: 2.6,
        speed: 2.0,
        aggroRange: 24,
        contactDamage: 7,
        attackCooldown: 1.1,
        color: 0xff5530,
        isBoss: true,
        canStep: true,
    },
};
