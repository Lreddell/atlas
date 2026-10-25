# Known issues and next priorities

## Current release boundaries

- This is a playable regional alpha. Full blind survival balance, repeated multiplayer sessions under latency and subjective audio/game-feel review remain open. Automated tours do not establish those results.
- New terrain, sub-biomes, flora and foundries require new chunks. Already-generated Atlas chunks are preserved; there is no retroactive terrain or structure replacement. A new world gives the complete 0.3 layout.
- Atlas biomes are painted during feature generation. Vanilla `/locate biome` does not reliably find them; use `/atlas locate fields`, `/atlas locate foundry` and `/atlas locate vault`.
- Existing Minecraft overworld generation provides the broader world. Atlas does not yet have a campaign world preset, settlements or a five-region progression graph.
- The ecological loop is deliberately small. The design bible's larger creature roster, Twin Poles, additional guardians and campaign transformations remain future work.
- Shader/renderer profiles are not certified. Sodium/Iris and Distant Horizons remain optional candidates pending telegraph, glow, sky and terrain checks. Avoid stacking combat, camera, dodge or music replacements without adapters.
- Source copper tools currently use the stone tool material. Universal posture/parry, skill sockets, ceiling walking and gravity/camera roll are not implemented.
- Completed vault escape settles loaded hazard floors. Exhaustive cleanup of every unloaded escape-hazard chunk remains future work.
- Large farms of magnetized dropped items or machinery need stress profiling. Field queries are bounded spatially but not yet backed by a world-wide spatial index.
- The normal production-client title/world launch is checked separately from the automated tour. The verification report records exactly which artifact was launched.

## Next regional priorities

1. Record blind first-person and third-person playtests: finding the foundry, solving each mechanism, recognizing Warden tells, melee/ranged participation, death recovery and reward usefulness.
2. Tune resources, supply caches, reed growth and mite recovery from measured survival play. Add targeted performance counters and profile busy magnetic builds.
3. Exercise multiple players, reconnects, chunk unload/reload and server restarts during each puzzle, encounter and escape. Keep shared milestones and encounter ownership explicit.
4. Improve animation and encounter presentation from observed readability problems. Integrate an external animation backend only when it provides a demonstrated improvement.
5. Prototype the proposed cooking, equipment and worldgen integrations individually. Keep one authority for combat, camera, music and campaign state.

## Total-conversion direction

Use one proven regional template: deterministic geography, materials/ecology, mechanics that teach through exploration, landmarks and machinery, a fair boss, a lateral ability and a bounded world change. Extend the current common/client split and world-owned progression state. A dedicated Atlas world preset can later coordinate authored regions without rebuilding individual encounters. Do not populate the campaign with placeholder bosses or force unrelated mod progression into the first region.
