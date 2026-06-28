# Entity and Combat Foundation

Status: In progress
Priority: Medium

Progress note, 2026-06-28:

- Atlas now has a central fixed-step `EntityManager`, an entity renderer, health,
  movement/collision, damage, drops, projectiles, boss state, and typed combat
  events. Those foundations should be preserved rather than recreated.
- The remaining plan is to separate Three.js/render state, add a spatial index,
  extract boss-specific data, generalize combat/effects/persistence, and add
  goals/navigation/spawning. See
  [`../minecraft-source-study/05-entities-ai-and-gameplay.md`](../minecraft-source-study/05-entities-ai-and-gameplay.md).

## Problem

Atlas has player, item-drop, and particle behavior, but no general simulation
foundation for creatures, projectiles, combat targets, or bosses. Adding each mob
as an independent React component with its own `useFrame` loop would recreate the
scaling problems already removed from chunk rendering.

## Goals

- Provide one fixed-step entity simulation.
- Separate simulation state from rendering.
- Support health, damage, movement, AI, spatial queries, persistence, and removal.
- Keep the data model compatible with a future authoritative multiplayer server.
- Allow many entities without one React component or frame callback per entity.

## Non-Goals

- Shipping a complete mob roster in the foundation phase.
- Implementing networking immediately.
- Building a full ECS framework before requirements are known.

## Core Data Model

Use stable numeric or UUID entity identifiers and component-like data records:

- transform: position, rotation, velocity
- collider: shape, dimensions, collision flags
- health: current, maximum, invulnerability window
- movement: speed, acceleration, gravity, step height
- AI: state, target, cooldowns, navigation request
- combat: attack range, damage, knockback, team/faction
- lifetime: age, despawn policy
- persistence: entity type and serialized state

Keep render-only objects, meshes, animations, and audio nodes outside the
simulation records.

## Simulation Loop

Create one entity manager updated from the existing fixed gameplay tick:

1. collect player and world inputs
2. update AI decisions at a lower configurable frequency
3. update movement and collisions
4. resolve attacks and damage events
5. process deaths, drops, and despawns
6. publish a render snapshot

Use a bounded accumulator so a stalled frame cannot trigger an unlimited number
of catch-up ticks.

## Spatial Index

Add a chunk or coarse-grid index mapping cells to entity IDs. It should support:

- nearby-entity queries
- collision candidate lookup
- attack radius queries
- spawn-density checks
- activation and despawn decisions

Do not scan every entity for each entity.

## Rendering Adapter

React should subscribe to entity snapshots by type or visible region. Use:

- instanced meshes for simple repeated creatures or projectiles
- pooled render objects for animated models
- interpolation between fixed simulation snapshots

Avoid one `useFrame` registration per entity. One renderer per entity family can
update visible instances.

## Combat Events

Model combat as explicit events:

```ts
interface DamageEvent {
  sourceId: EntityId | null
  targetId: EntityId
  amount: number
  kind: DamageKind
  knockback?: Vec3
}
```

Damage resolution should own armor, invulnerability, death, and drops. Callers
should request damage rather than directly mutating health.

## Persistence and Activation

Persistent entities should serialize with their chunk or a dedicated entity
store. Define:

- which entities persist
- when an entity becomes inactive outside simulation range
- whether inactive entities advance time
- how entity IDs avoid collisions after reload

Version the serialized format from its first release.

## Delivery Phases

1. Entity manager, IDs, transforms, health, fixed-step updates.
2. Spatial index and activation radius.
3. One test creature with idle and chase states.
4. Damage, knockback, death, and item drops.
5. Rendering adapter and pooled audio.
6. Persistence.
7. Spawn rules and celestial-event modifiers.
8. Boss-specific state machines only after the foundation is stable.

## Tests

- fixed-step outcomes are independent of render frame rate
- entity creation and removal preserve ID uniqueness
- spatial queries return nearby entities and exclude distant ones
- damage applies invulnerability and death exactly once
- inactive entities do not consume normal AI ticks
- serialization round-trips supported entity state
- deterministic AI decisions can be reproduced with an injected RNG

## Acceptance Criteria

- A test creature can spawn, move, target the player, take damage, die, and drop an
  item through general systems.
- Simulation does not require one React component or `useFrame` per entity.
- Entity updates run at a fixed rate and expose interpolated render state.
- Spatial queries avoid global scans.
- Persistent entity data is versioned.

## Risks

- An overly generic ECS can consume time without serving current gameplay.
- Navigation in a mutable voxel world is a separate hard problem; begin with local
  steering and simple obstacle handling.
- Multiplayer readiness means clear ownership and deterministic contracts, not
  prematurely implementing network transport.
- Entity audio should avoid an HRTF panner for every short-lived sound. Pool or
  prioritize spatial sources.
