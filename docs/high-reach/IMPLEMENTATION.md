# High Reach implementation record

Status: in progress. This branch does not yet provide the requested vertical slice.

Baseline: `4d2bf26e8e90f2ab0fc0c8a4ac8ae8867ac485b1`, fetched from
`Lreddell/atlas` main on 2026-09-04. Working branch: `codex/high-reach`.

## Scope and source decisions

The complete High Reach master prompt, launch message, and source checklist
supplied on 2026-09-04 define this implementation. The master document was read
in full, including its combat and content annexes. Supporting references inspected:

- Atlas combat master prompt (including comparison against the revised annex).
- Main-World Design Bible Illustrated: all text, with representative art plates.
- Atlas design conversation export dated 2026-08-02.
- Survey ship `ship-v2-13e8f418.json`.
- All four named MIDI references, including tracks, instruments, tempo, and length.
- Aether handoff inventory and both supplied reference archives; Cataclysm 3.32
  archive organization. These are completeness references, not source code/assets
  to incorporate.

The latest High Reach contract overrides inherited E-interaction, mobile, and
combat-only exclusions. E remains inventory. Desktop browser and Electron are
the runtime targets. Canonical entry depends on the First Surveyor; preview
progression must remain isolated. No main merge, force push, branch deletion, or
legacy-save destruction is authorized.

## Baseline verification

Commands executed before behavior changes:

| Check | Result |
| --- | --- |
| `npm.cmd run typecheck` | Pass |
| `npm.cmd run lint` | Four pre-existing Node global errors in `scripts/check-seo.mjs` |
| `npm.cmd run build` | Pass, 14.01 s; 819 modules; main JS 2,033.79 kB / gzip 586.10 kB |
| `node --test <all src/electron *.test.mjs>` | 574 pass, 1 fail, 17.14 s |

The failing test rejected every `/vault` command even though main deliberately
added `/vault skip`. The baseline repair gives Node scripts their correct lint
globals and restricts the test to the intended skip subcommand. Build warnings
include unresolved Monocraft weight URLs and the existing large main bundle.
Build/test esbuild subprocesses require unsandboxed directory access on this
Windows host; sandbox permission failures are not game failures.

`node scripts/measure-world-foundation.mjs docs/high-reach/baseline-foundation.json`
records the hardware, source hashes, every legacy ID, and twelve deterministic
chunks. Baseline generation p50/p95: 32.880/50.388 ms. ACR encode p50/p95:
0.136/0.285 ms; decode: 0.121/0.232 ms. Four-chunk export v2: 1,573,401 bytes.
There are 162 world blocks and 85 inventory-only definitions; unregistered byte
values are 4, 77, 90, 172, 174, 175, 176, 188, and 189. Light and placement
metadata are independent byte arrays. Container contents currently exist only
in memory, so the new save contract must add their persistence.

Browser baseline: Standard survival world `High Reach Baseline`, seed `1729`,
loaded and rendered without console errors. Screenshot:
`output/playwright/high-reach/baseline-standard.png`. Three-second stationary
requestAnimationFrame sample at 1280x720 on the AMD RX 6650 XT / ANGLE D3D11:
180 samples, p50 16.7 ms, p95/p99 16.8 ms. This is a short stationary sample,
not representative chapter gameplay. Electron gameplay remains pending.
No 60 FPS, playtime, migration, or completion claim is made from these checks.

## Dependency and risk map

| Boundary | Current source and required work |
| --- | --- |
| Identity | `types.ts`, `data/blocks.ts`, Resonant definitions/catalogs share `BlockType`; frozen legacy mapping, separate block/item registries and adapters required |
| Inventory | `useInventoryController`, equipment, recipes, drops, held models, creative catalogs, commands, and Feature Editor require item identities and offhand handling |
| Chunk runtime | `WorldManager`, `worldTypes`, `worldStore`, `baseChunkGeneration`, geometry, lighting, fluids, trees, and live `world.worker.ts` assume byte blocks |
| Persistence | WorldStorage selects Electron ACR, OPFS ACR worker, or IndexedDB; ACR body v1 and export v1/v2 require dual-read migration and recoverable backups |
| Campaign | App saves player, equipment, cursor, progression, boats, and Vault reservations; these must survive dimension routing |
| Containers | Furnace/chest live state and serialized metadata need an explicit preservation audit |
| Combat | InteractionController currently owns camera-ray melee; Vault weapons/projectiles and EntityManager need shared action/damage adapters |
| Movement/input | Player, CameraControls, playerInput, collision, magnetic adhesion, and boats must share camera-independent action truth |
| Presentation | ChunkMesh/geometry, atlas, HeldItem, entity models, sky/weather, particles, SoundManager/MusicController require scalable content and lifecycle ownership |
| World content | Standard generation, Resonant Vault reservation/edit/reset rules, Magnetic Fields, progression and boats are regression gates |

Runtime source and current tests take precedence over old skill descriptions
that say Atlas has no automated tests or only IndexedDB persistence.

## Production gates

- [ ] 0. Reproducible audit, runtime and storage baseline, risk map.
- [ ] 1. Stable registries and item/block split; existing content unchanged.

Registry implementation: `BlockId` and `ItemId` now use distinct enum domains;
inventory, recipes, equipment, loot, and use profiles consume `ItemId`. Placement
and block drops cross explicit registry adapters. Legacy numeric handles remain
runtime conveniences. A frozen 256-entry namespaced map includes every retired
slot. Saplings have explicit identities in both domains, preserving their placed
form despite the historical sprite flag. Compile-time tests reject accidental
item/block assignment, and runtime tests cover all legacy entries and collisions.
Save-wire migration is the next gate; the new key map is not yet the live codec.
- [ ] 2. Palette chunks, versioned saves/exports, frozen migration and golden fixtures.
- [ ] 3. Separate dimension domains; transactional transfer, return, recovery, lifecycle.
- [ ] 4. Complete shared combat foundation and all 13 Combat Lab facilities.
- [ ] 5. Validated sky topology, wind/shelter, glider/Anchor Line, arrival/camp/module route.
- [ ] 6. Fieldship/modules/travel; all recovery sites, biomes, stations, ordinary roster and building set.
- [ ] 7. Final material, cloud, lighting, effects, animation, audio, quality/accessibility pass.
- [ ] 8. Ballast Walker and all five contiguous Pressure Station Seven chapters.
- [ ] 9. Storm Engine's 14 attacks/three phases, reset, ending, Current Frame, return/rematch.
- [ ] 10. Full build/camera/runtime matrix, seed corpus, stress cycles, measurements, documentation and asset audit.

Each gate needs current evidence before it can be checked. Stretch goals remain
deferred until all required gates pass. Required unimplemented work is not a cut.
