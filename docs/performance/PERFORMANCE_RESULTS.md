# Atlas Performance Results — Stage 1 (crash-proof streaming)

Scope of this stage: memory growth, chunk residency, mesh ownership, worker
recovery, streaming lifecycle — the failure mode reported in the field as
`Uncaught RangeError: Array buffer allocation failed` +
`WorldWorker Failed - Switching to Main Thread` after traveling far.

- **Before:** `d9f4f00e684f6bb12c1c009e5532b1c83dca0a7d` (main `08ee5db` + harness only)
- **After:** the Stage-1 commit series on `claude/atlas-streaming-memory-nwq0a7`
- **Machine/settings:** identical for both runs (headless Chromium 141,
  production build, seed 12345; see `PERFORMANCE_BASELINE.md`)
- **Raw data:** `results/2026-07-13-04-41-14-baseline.json` vs
  `results/2026-07-13-05-21-55-stage1-after.json`

## Headline: the crash reproduction

10,000-block continuous travel at 64 blocks/s, render distance 16:

| Metric | Before | After | Change | Scenario |
| --- | --- | --- | --- | --- |
| Resident chunks at end (desired ≈ 797) | 7,618 (unbounded) | **815 (plateau)** | −89% | travel RD16 |
| Raw chunk bytes | 2.09 GiB | 229 MiB | −89% | travel RD16 |
| WorldManager-retained CPU mesh bytes | 2.28 GiB | 1 MiB | ~−100% | travel RD16 |
| JS heap end (peak) | 4.42 GiB (at ceiling) | 291 MiB (peak 585 MiB) | −93% | travel RD16 |
| Evictions performed | 1,664 | 20,531 | keeps up | travel RD16 |
| Worker mesh input cloned | 5.50 GiB | 1.94 GiB | −65% | travel RD16 |
| Frame p95 / p99 | 23.7 / 49.2 ms | 18.1 / 34.2 ms | −24% / −30% | travel RD16 |
| Frames > 50 ms / > 100 ms | 109 / 7 | 38 / 4 | −65% / −43% | travel RD16 |

The baseline ended the run within a few hundred MiB of Chromium's ~4.4 GiB
heap ceiling — the allocation-failure crash was one longer run or one higher
render distance away. After Stage 1 the run is flat: resident memory
plateaus at desired + a 2-chunk hysteresis ring and stays there.

## Full scenario table

All values end-of-scenario unless marked peak. "CPU mesh" is geometry
retained by WorldManager; "delivered" is renderer-owned mesh accounting
(same arrays the GPU upload wraps — in the harness the subscriber discards
them, in-game a mounted ChunkMesh holds them, so heap deltas here overstate
the in-game saving by roughly the delivered figure).

| Metric | Before | After | Change | Scenario |
| --- | --- | --- | --- | --- |
| Resident / raw / heap | 197 / 55 MiB / 284 MiB | 197 / 55 MiB / 129 MiB | heap −55% | stationary RD8 |
| CPU mesh retained | 158.9 MiB | 0.0 MiB (delivered 158.9) | released | stationary RD8 |
| Mesh input cloned | 229 MiB | 72 MiB | −69% | stationary RD8 |
| Time to idle | 11.2 s | 9.6 s | −14% | stationary RD8 |
| Resident / raw / heap | 797 / 224 MiB / 733 MiB | 797 / 224 MiB / 298 MiB | heap −59% | stationary RD16 |
| CPU mesh retained | 454.4 MiB | 0.0 MiB (delivered 454.4) | released | stationary RD16 |
| Frame p95 / p99 | 19.6 / 37.7 ms | 18.5 / 26.0 ms | −6% / −31% | stationary RD16 |
| Resident / raw / heap | 1,793 / 504 MiB / 1.43 GiB | 1,793 / 504 MiB / 584 MiB | heap −60% | stationary RD24 |
| CPU mesh retained | 927.9 MiB | 0.0 MiB (delivered 927.9) | released | stationary RD24 |
| Mesh input cloned | 1.79 GiB | 592 MiB | −68% | stationary RD24 |
| Frame p95 / p99 | 26.7 / 55.1 ms | 18.3 / 24.0 ms | −31% / −56% | stationary RD24 |
| Frames > 25 / 50 / 100 ms | 191 / 53 / 7 | 31 / 12 / **0** | −84% / −77% / −100% | stationary RD24 |
| Time to idle | 61.0 s | 55.8 s | −9% | stationary RD24 |
| Resident end (peak) | 2,730 (2,730) | 414 (415) | −85% | teleport ×8 RD16 |
| Heap end (peak) | 1.99 GiB (4.54 GiB) | 190 MiB (320 MiB) | peak −93% | teleport ×8 RD16 |
| Evictions | 16 | 5,579 | keeps up | teleport ×8 RD16 |
| Frame p95 / p99 | 18.9 / 31.6 ms | 19.0 / 44.0 ms | p99 **+39% (regression)** | teleport ×8 RD16 |
| Resident: idle → after return | 797 → 3,467 | 797 → **823** | plateau restored | outAndBack RD16 |
| Heap end (peak) | 2.29 GiB (2.31 GiB) | 299 MiB (316 MiB) | −87% | outAndBack RD16 |
| Mesh input cloned | 1.86 GiB / 30 s | 625 MiB / 30 s | −66% | editChurn RD8 |
| Frame p95 | 31.2 ms | 31.0 ms | ~unchanged | editChurn RD8 |

### Verification scenarios (after only — these paths didn't exist before)

| Check | Result |
| --- | --- |
| workerFault: 6 injected job errors (2 allocation-class) mid-stream | pipeline completed; 2 targeted restarts; 2/2 workers alive; **0 main-thread jobs**; pool never disabled |
| worldSwitch: seed switch with jobs in flight, no reset | 4 stale-session results discarded; every resident chunk hashes identical to fresh new-seed generation |
| Generation determinism (9 chunks incl. −1000,250 and 4096,0) | all FNV-1a hashes identical to baseline |
| Mesher output (4 neighborhoods × cull on/off) | all 8 geometry hashes identical to the pre-plane protocol |

## Stage-1 acceptance checklist

- ✅ No `Array buffer allocation failed` during the 10,000-block benchmark
  (heap peaks at 585 MiB vs a ~4.4 GiB ceiling; baseline sat at the ceiling)
- ✅ A worker error does not disable the pool (fault injection: restart only)
- ✅ No permanent main-thread generation/meshing (0 main-thread jobs in every
  scenario; pool-down keeps jobs queued + recovery retries; the `setTimeout`
  path survives only behind the explicit workers-disabled setting)
- ✅ Resident raw and mesh bytes plateau during continuous travel
- ✅ Moving away and returning restores the plateau (797 → 823 incl. ring)
- ✅ Stale results are counted and discarded (session/ticket/retention gates)
- ✅ Saves remain valid (dirty chunks never evicted before persisting —
  unchanged contract, covered by `storageWiring.test.mjs`; storage backends
  untouched by this stage)
- ✅ Deterministic chunk hashes unchanged; mesher output byte-identical

## Regressions and honest caveats

- **Teleport frame tail regressed** (p99 31.6 → 44.0 ms; frames > 50 ms
  17 → 32): each teleport now actually unloads ~700 chunks, and that
  eviction work lands in the frames after the jump. The drain has a 2–4 ms
  per-cycle time budget; the remaining spikes come from Chromium GC pressure
  during mass unload. Baseline "won" these frames only by leaking ~2.3 GiB.
  Worth revisiting when Stage 2 shrinks per-chunk unload cost.
- Harness heap figures overstate in-game savings where "delivered" bytes are
  concerned (see table note); the unambiguous in-game wins are the removed
  duplicate retention, the plateaued residency, and the transfer reduction.
- `editChurn` mesh input is still ~21 MiB/s while editing: one block edit
  still remeshes whole 384-block columns (center + border neighbor). That is
  Stage 2/3 work (sections + section dirtying).
- Renderer-side metrics (draw calls, triangles) are not covered by this
  harness mode; Stage 4 must add `renderer.info` capture in-game.
- The in-game smoke test (real UI → create world → gameplay) passes with
  terrain, clouds, HUD rendering and chunks delivered to components; the only
  console noise is the absent Vercel Analytics script and an aborted menu
  music fetch, both pre-existing environment artifacts of local preview.

## Reverted / not-kept experiments

None in this stage — every change listed above is retained. (The first
attempt at the eviction drain loop had an all-dirty-backlog spin bug that was
fixed before commit; no committed experiment was reverted.)

## Remaining work (future stages, unchanged from the plan)

Stage 2 section storage + section meshing, Stage 3 true greedy meshing +
packed attributes, Stage 4 renderer batching/LOD/shadows, Stage 5 clouds,
Stage 6–7 entities/drops/particles, Stage 8 fluids/plants, Stage 9
player/audio/environment, Stage 10 React/startup. See `ARCHITECTURE.md`
"Known limits".

## Reproduce

```bash
npm run perf -- --label mine --scenarios hashCheck meshHash \
  'stationary:renderDistance=16' \
  'travel:renderDistance=16,blocks=10000,speed=64' \
  'teleport:renderDistance=16,jumps=8,jumpDistance=4096' \
  'outAndBack:renderDistance=16,blocks=2000,speed=64' \
  'editChurn:renderDistance=8,durationMs=30000' workerFault worldSwitch
```
