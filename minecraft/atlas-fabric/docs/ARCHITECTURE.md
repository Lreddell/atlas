# Native architecture and integration contracts

## Boundaries

`scripts/prepare-atlas.mjs` is a build-time bridge, not a second game runtime. It imports pinned source definitions and emits native resources, immutable geometry, fixtures and reducers. Rhino executes safe reducer scopes without Java access. `BossLogic.step` preserves source parity; `BossLogic.play` uses checked generated damage-policy adaptations. A failed expected source replacement aborts the build rather than silently applying a stale patch.

`AtlasBoss` owns server encounter state, attacks, committed vectors, delayed impacts, waves, minions, crystals and rewards. Clients receive tracked presentation state; they do not choose damage. Entity NBT stores reducer state/anchor/fight identity. `EncounterRules` holds pure directional mitigation/reset contracts. Retreat clears owned effects and leaves an altar or vault trigger available for a fresh attempt. Boss health is fixed, not scaled to equipment or visit order.

`AtlasState` stores shared completed/claimed milestones, puzzle values and escape deadlines in each world. `RegionProgress` adds discovery messages and bounded victory effects. Player tags survive respawn. Future regions should use namespaced milestone/site keys here before replacing this with a versioned campaign graph. Do not conflate a region, a biome and an encounter site.

`Worldgen` applies source-derived terrain/arena data during feature generation. It writes only the current chunk and explicitly updates biome palettes. `Vaults` rotates authored sparse columns/metadata, connects shafts to the native surface and owns progression. `VaultHazards` samples the source timing contract, synchronizes native display objects and restores authored gaps at completion. Existing generated chunks are not regenerated on update.

`PlayerMechanics` owns stamina, dodge, boots, bounded field forces and the upgraded pulse. C2S controls reject non-finite values, invalid actions, dead/spectator players and repeated same-tick packets. Costs, cooldowns, equipment, line of sight, dimensions and threat budgets are server decisions. The G ability cannot pull players or bosses. The induction relay shares field polarity/directionality with natural magnets; redstone updates its stored active state.

`Combat` owns attack commitments and contact ticks. `ClientCombat` animates presentation. `CameraRig` owns the local view and aim convergence; it never changes server gravity. `AtlasMusic` is the only music manager, with server encounter context and client biome/sky-time selection. `AtlasSky` is decorative and has no gameplay hit volumes.

## Integration rules

| System | Current authority | Required adapter before replacement |
|---|---|---|
| Player attacks | Combat + native damage | Better Combat must share one contact authority and expose Atlas reach/heavy/core/part semantics. No double attacks. |
| Dodge/stamina | PlayerMechanics | Combat Roll must consume the same budget and invulnerability window, or the native roll must be disabled. |
| Camera | CameraRig | Shoulder Surfing needs one aim ray and exclusive mode/input ownership. |
| Animation | VoxelModel / native player mixins | GeckoLib/Player Animator migration must preserve tracked action timing, remote-player poses and reduced motion. |
| Music | AtlasMusic | Music Triggers can replace this only through one context/priority interface; never run both managers. |
| Worldgen | Worldgen + Vaults | Lithostitched/biome-source migration must preserve source field centers, reserve critical sites and provide correct biome location. |
| Equipment | Native armor slots | Select Accessories or Trinkets once; do not duplicate boots/ability validation across both. |
| Progression | AtlasState / RegionProgress | Future chapter graphs must remain server-owned, namespaced and migration-aware. |

## Remaining engineering risks

Feature-stage biome painting is a compatibility compromise. Moving region placement into the biome source is the next major worldgen task. Modded dimensions, terrain overhauls and distant terrain renderers require separate tests. Force scans are local/bounded but should be profiled under many players and items before a larger pack. Progression schema is additive today; future migrations need explicit versioning. There is no claim of tested public-server latency, adversarial packet security or long-duration performance.

Do not hide these gaps by installing many mods. Use one small native region to validate each contract, then replace a backend only when there is concrete benefit and a passing compatibility fixture.
