import { useEffect, useMemo, useState, type FC } from "react";
import { worldManager } from "../systems/WorldManager";
import {
  installStreamingSafety,
  type AtlasPerformanceSnapshot,
} from "../systems/performance/streamingSafety";
import {
  chunkKey,
  summarizeFrameTimes,
  type ChunkCoord,
  type FrameTimeSummary,
} from "../systems/performance/streamingSafetyCore";

const STARTING_COMMIT = "08ee5db4147dd755a7b1516c1f96d8ac40731d5c";
const SAMPLE_INTERVAL_MS = 500;
const SETTLE_TIMEOUT_MS = 180_000;

interface ScenarioResult {
  name: string;
  status: "completed" | "skipped" | "timed-out" | "unavailable";
  durationMs: number;
  detail: string;
  frameTimes: FrameTimeSummary;
  start: AtlasPerformanceSnapshot;
  end: AtlasPerformanceSnapshot;
  peakTrackedBytes: number;
  peakResidentChunks: number;
  peakInFlightBytes: number;
}

interface PerformanceReport {
  schemaVersion: 1;
  startingCommit: string;
  generatedAt: string;
  benchmarkVariant: "baseline" | "stage1";
  environment: {
    userAgent: string;
    viewport: { width: number; height: number; pixelRatio: number };
    browserMemoryApi: boolean;
    graphics: {
      antialiasing: "unavailable";
      shadows: "unavailable";
      clouds: "unavailable";
      mipmaps: "unavailable";
      chunkFade: "unavailable";
      vsync: "browser-controlled";
    };
  };
  scenarios: ScenarioResult[];
  samples: AtlasPerformanceSnapshot[];
  workerErrors: readonly unknown[];
}

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const desiredCircle = (center: ChunkCoord, radius: number): ChunkCoord[] => {
  const chunks: Array<ChunkCoord & { distance: number }> = [];
  const radiusSquared = radius * radius;
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const distance = dx * dx + dz * dz;
      if (distance > radiusSquared) continue;
      chunks.push({ cx: center.cx + dx, cz: center.cz + dz, distance });
    }
  }
  chunks.sort((a, b) => a.distance - b.distance);
  return chunks.map(({ cx, cz }) => ({ cx, cz }));
};

const downloadText = (
  filename: string,
  content: string,
  type: string,
): void => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

const bytes = (value: number): string =>
  `${(value / (1024 * 1024)).toFixed(1)} MiB`;

const renderMarkdown = (report: PerformanceReport): string => {
  const lines = [
    "# Atlas Performance Harness Report",
    "",
    `- Starting commit: \`${report.startingCommit}\``,
    `- Generated: ${report.generatedAt}`,
    `- Variant: ${report.benchmarkVariant}`,
    `- User agent: ${report.environment.userAgent}`,
    `- Viewport: ${report.environment.viewport.width}×${report.environment.viewport.height} @ ${report.environment.viewport.pixelRatio}x`,
    "",
    "| Scenario | Status | Duration | Frame p95 | Frame p99 | Peak tracked memory | Peak resident chunks | Peak worker input |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];

  for (const scenario of report.scenarios) {
    lines.push(
      `| ${scenario.name} | ${scenario.status} | ${(scenario.durationMs / 1000).toFixed(1)} s | ${scenario.frameTimes.p95Ms?.toFixed(2) ?? "n/a"} ms | ${scenario.frameTimes.p99Ms?.toFixed(2) ?? "n/a"} ms | ${bytes(scenario.peakTrackedBytes)} | ${scenario.peakResidentChunks} | ${bytes(scenario.peakInFlightBytes)} |`,
    );
  }

  lines.push(
    "",
    "## Metric availability",
    "",
    "- Heap metrics use `performance.memory` when Chromium exposes it; otherwise they are `null`.",
    "- Renderer draw calls, triangles, geometries, and textures are `null` in the streaming-only harness unless a renderer registers with the performance API.",
    "- Resident sections remain `null` until section-based storage is implemented.",
    "- Gameplay-heavy cave, fluid, plant, boss, cloud, shadow, and save/reload scenarios require the full-game automation layer and are reported as unavailable here.",
    "",
    "## Worker diagnostics",
    "",
    `- Worker errors: ${report.workerErrors.length}`,
    `- Last sample worker restarts: ${report.samples.at(-1)?.workerRestarts ?? 0}`,
    `- Last sample stale results discarded: ${report.samples.at(-1)?.staleResultsDiscarded ?? 0}`,
    `- Last sample main-thread fallbacks: ${report.samples.at(-1)?.mainThreadFallbacks ?? 0}`,
    `- Unavailable metrics: ${report.samples.at(-1)?.unavailableMetrics.join(", ") || "none"}`,
    "",
  );
  return `${lines.join("\n")}\n`;
};

export const PerformanceHarness: FC = () => {
  const benchmarkVariant = useMemo<"baseline" | "stage1">(() => {
    const value = new URLSearchParams(window.location.search).get("variant");
    return value === "baseline" ? "baseline" : "stage1";
  }, []);
  const api = useMemo(
    () => installStreamingSafety({ enforce: benchmarkVariant === "stage1" }),
    [benchmarkVariant],
  );
  const [status, setStatus] = useState(
    "Preparing deterministic streaming scenarios…",
  );
  const [report, setReport] = useState<PerformanceReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let previousFrame = performance.now();
    const frameTimes: number[] = [];
    const samples: AtlasPerformanceSnapshot[] = [];
    const subscriptions = new Map<string, () => void>();

    const frameLoop = (now: number) => {
      frameTimes.push(now - previousFrame);
      previousFrame = now;
      worldManager.processStreamingJobs();
      raf = requestAnimationFrame(frameLoop);
    };
    raf = requestAnimationFrame(frameLoop);

    const sampleTimer = window.setInterval(
      () => samples.push(api.sample()),
      SAMPLE_INTERVAL_MS,
    );

    const setDesired = (chunks: ChunkCoord[]) => {
      const nextKeys = new Set(
        chunks.map((chunk) => chunkKey(chunk.cx, chunk.cz)),
      );
      for (const [key, unsubscribe] of subscriptions) {
        if (!nextKeys.has(key)) {
          unsubscribe();
          subscriptions.delete(key);
        }
      }
      for (const chunk of chunks) {
        const key = chunkKey(chunk.cx, chunk.cz);
        if (!subscriptions.has(key)) {
          subscriptions.set(
            key,
            worldManager.subscribeMesh(chunk.cx, chunk.cz, () => undefined),
          );
        }
      }
      worldManager.setDesiredChunks(chunks);
      worldManager.processStreamingJobs();
    };

    const waitForSettled = async (): Promise<boolean> => {
      const deadline = performance.now() + SETTLE_TIMEOUT_MS;
      while (!cancelled && performance.now() < deadline) {
        const sample = api.sample();
        if (
          sample.generationQueue === 0 &&
          sample.meshQueue === 0 &&
          sample.inFlightJobs === 0 &&
          sample.evictionBacklog === 0
        )
          return true;
        await sleep(50);
      }
      return false;
    };

    const runMeasured = async (
      name: string,
      action: () => Promise<{ detail: string; settled?: boolean }>,
    ): Promise<ScenarioResult> => {
      setStatus(name);
      const startFrame = frameTimes.length;
      const startSampleIndex = samples.length;
      const start = api.sample();
      const startedAt = performance.now();
      const actionResult = await action();
      const durationMs = performance.now() - startedAt;
      const end = api.sample();
      const scenarioSamples = samples.slice(startSampleIndex);
      const frames = frameTimes.slice(startFrame);
      return {
        name,
        status: actionResult.settled === false ? "timed-out" : "completed",
        durationMs,
        detail: actionResult.detail,
        frameTimes: summarizeFrameTimes(frames),
        start,
        end,
        peakTrackedBytes: Math.max(
          start.totalTrackedBytes,
          end.totalTrackedBytes,
          ...scenarioSamples.map((sample) => sample.totalTrackedBytes),
        ),
        peakResidentChunks: Math.max(
          start.residentChunks,
          end.residentChunks,
          ...scenarioSamples.map((sample) => sample.residentChunks),
        ),
        peakInFlightBytes: Math.max(
          start.inFlightBytes,
          end.inFlightBytes,
          ...scenarioSamples.map((sample) => sample.inFlightBytes),
        ),
      };
    };

    const unavailable = (name: string, detail: string): ScenarioResult => {
      const snapshot = api.sample();
      return {
        name,
        status: "unavailable",
        durationMs: 0,
        detail,
        frameTimes: summarizeFrameTimes([]),
        start: snapshot,
        end: snapshot,
        peakTrackedBytes: snapshot.totalTrackedBytes,
        peakResidentChunks: snapshot.residentChunks,
        peakInFlightBytes: snapshot.inFlightBytes,
      };
    };

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const stress20k = params.get("stress") === "1";
      worldManager.reset();
      worldManager.setWorldContext(`perf-${Date.now()}`, 12345);

      const scenarios: ScenarioResult[] = [];
      for (const radius of [8, 16, 24]) {
        scenarios.push(
          await runMeasured(
            `Stationary spawn, render distance ${radius}`,
            async () => {
              const chunks = desiredCircle({ cx: 0, cz: 0 }, radius);
              setDesired(chunks);
              const settled = await waitForSettled();
              return { detail: `${chunks.length} desired chunks`, settled };
            },
          ),
        );
      }

      scenarios.push(
        await runMeasured(
          "Continuous straight-line travel, 10,000 blocks",
          async () => {
            const radius = 16;
            const targetChunk = Math.ceil(10_000 / 16);
            for (let cx = 0; cx <= targetChunk && !cancelled; cx += 1) {
              setDesired(desiredCircle({ cx, cz: 0 }, radius));
              await sleep(16);
            }
            const settled = await waitForSettled();
            return {
              detail: `${targetChunk + 1} chunk-center updates`,
              settled,
            };
          },
        ),
      );

      if (stress20k) {
        scenarios.push(
          await runMeasured(
            "Continuous straight-line travel, 20,000 blocks",
            async () => {
              const radius = 16;
              const targetChunk = Math.ceil(20_000 / 16);
              for (let cx = 0; cx <= targetChunk && !cancelled; cx += 1) {
                setDesired(desiredCircle({ cx, cz: 16 }, radius));
                await sleep(16);
              }
              const settled = await waitForSettled();
              return {
                detail: `${targetChunk + 1} chunk-center updates`,
                settled,
              };
            },
          ),
        );
      } else {
        scenarios.push(
          unavailable(
            "Continuous straight-line travel, 20,000 blocks",
            "Add `&stress=1` to run the extended stress scenario.",
          ),
        );
      }

      scenarios.push(
        await runMeasured("Repeated long-distance teleports", async () => {
          const radius = 16;
          const centers = [
            { cx: 0, cz: 0 },
            { cx: 256, cz: 256 },
            { cx: -512, cz: 128 },
            { cx: 768, cz: -384 },
            { cx: 0, cz: 0 },
          ];
          for (const center of centers) {
            setDesired(desiredCircle(center, radius));
            await sleep(500);
          }
          const settled = await waitForSettled();
          return { detail: `${centers.length} teleport centers`, settled };
        }),
      );

      scenarios.push(
        await runMeasured("Travel away and return", async () => {
          const radius = 16;
          setDesired(desiredCircle({ cx: 0, cz: 0 }, radius));
          await sleep(500);
          setDesired(desiredCircle({ cx: 640, cz: 0 }, radius));
          await sleep(500);
          setDesired(desiredCircle({ cx: 0, cz: 0 }, radius));
          const settled = await waitForSettled();
          return { detail: "Origin → 10,240 blocks east → origin", settled };
        }),
      );

      scenarios.push(
        unavailable(
          "Dense cave exploration",
          "Requires full player/camera automation and renderer visibility metrics.",
        ),
        unavailable(
          "Rapid block placement/breaking near chunk boundaries",
          "Requires deterministic interaction replay.",
        ),
        unavailable(
          "Water and lava propagation",
          "Requires a dedicated fluid fixture and game-tick driver.",
        ),
        unavailable(
          "Tree growth/bulk structure placement",
          "Requires deterministic growth/structure fixtures.",
        ),
        unavailable(
          "Magnetic Warden combat",
          "Requires combat replay with entities, particles, projectiles, audio, clouds, and shadows.",
        ),
        unavailable(
          "World save, close, reload, and continue travel",
          "Requires Electron lifecycle automation and a disposable save directory.",
        ),
        unavailable(
          "Clouds/shadows comparisons",
          "Requires the full renderer harness and graphics-setting control.",
        ),
      );

      if (cancelled) return;
      samples.push(api.sample());
      const finalReport: PerformanceReport = {
        schemaVersion: 1,
        startingCommit: STARTING_COMMIT,
        benchmarkVariant,
        generatedAt: new Date().toISOString(),
        environment: {
          userAgent: navigator.userAgent,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            pixelRatio: window.devicePixelRatio,
          },
          browserMemoryApi: "memory" in performance,
          graphics: {
            antialiasing: "unavailable",
            shadows: "unavailable",
            clouds: "unavailable",
            mipmaps: "unavailable",
            chunkFade: "unavailable",
            vsync: "browser-controlled",
          },
        },
        scenarios,
        samples,
        workerErrors: api.getRecentWorkerErrors(),
      };
      setReport(finalReport);
      setStatus("Completed. JSON and Markdown reports were downloaded.");
      const stamp = finalReport.generatedAt.replace(/[:.]/g, "-");
      downloadText(
        `atlas-perf-${stamp}.json`,
        `${JSON.stringify(finalReport, null, 2)}\n`,
        "application/json",
      );
      downloadText(
        `atlas-perf-${stamp}.md`,
        renderMarkdown(finalReport),
        "text/markdown",
      );
    };

    void run().catch((error) => {
      setStatus(
        `Harness failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearInterval(sampleTimer);
      for (const unsubscribe of subscriptions.values()) unsubscribe();
      subscriptions.clear();
    };
  }, [api, benchmarkVariant]);

  return (
    <main
      style={{
        fontFamily: "monospace",
        padding: 24,
        color: "#eee",
        background: "#111",
        minHeight: "100vh",
      }}
    >
      <h1>Atlas Performance Harness</h1>
      <p>{status}</p>
      <p>
        Starting commit: <code>{STARTING_COMMIT}</code>
      </p>
      <p>
        Variant: <code>{benchmarkVariant}</code>
      </p>
      {report && (
        <>
          <h2>Results</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{renderMarkdown(report)}</pre>
        </>
      )}
    </main>
  );
};
