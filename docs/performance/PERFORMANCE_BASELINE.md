# Atlas Performance Baseline

## Starting point

- Repository: `Lreddell/atlas`
- Base branch: `main`
- Base commit: `08ee5db4147dd755a7b1516c1f96d8ac40731d5c`
- Stage: crash-proof streaming foundation

## Verified static model

The current runtime layout stores three full-height byte arrays per resident chunk:

- blocks
- light
- metadata

With a 16×384×16 chunk column, the raw arrays require 294,912 bytes, or 288 KiB, per resident chunk.

| Render distance | Circular chunks | Raw arrays only |
|---:|---:|---:|
| 8 | 197 | 55.4 MiB |
| 16 | 797 | 224.2 MiB |
| 24 | 1,793 | 504.3 MiB |
| 32 | 3,209 | 902.5 MiB |
| 48 | 7,213 | 2,028.7 MiB |

Run `npm run perf` to regenerate the deterministic model under `artifacts/performance/`.

## Runtime capture workflow

After opening Atlas in a browser or Electron development build:

```js
window.__ATLAS_PERF__.resetCapture()
```

Run one deterministic scenario, then export it:

```js
window.__ATLAS_PERF__.downloadCapture('straight-line-10000-blocks-rd16')
```

The capture contains frame-time percentiles, long-frame counts, resident array bytes, cached and renderer-owned mesh bytes, in-flight worker bytes, desired and resident chunk counts, worker errors, worker restarts, stale-result discards, eviction backlog, and memory-pressure state.

## Measurement status

No browser or Electron before/after benchmark has been run in this connector-only session. The static model and unit tests are verified. Runtime performance, memory plateau behavior, save compatibility, and gameplay regression status remain unverified until the branch is run on the same machine and settings before and after the changes.
