export const CLOUD_SCALE = 12;
export const MAX_CLOUD_COVERAGE_BLOCKS = 768;

export interface CloudFieldLayout {
  radiusCells: number;
  instanceCount: number;
  cells: Float32Array;
  buildDurationMs: number;
}

export const cloudCoverageBlocks = (renderDistance: number, chunkSize = 16): number => {
  const requested = Math.min(renderDistance * 2, renderDistance + 16) * chunkSize;
  return Math.min(MAX_CLOUD_COVERAGE_BLOCKS, Math.max(192, requested));
};

export const buildCloudFieldLayout = (
  renderDistance: number,
  now: () => number = () => performance.now(),
): CloudFieldLayout => {
  const startedAt = now();
  const radiusCells = Math.ceil(cloudCoverageBlocks(renderDistance) / CLOUD_SCALE) + 1;
  const width = radiusCells * 2 + 1;
  const instanceCount = width * width;
  const cells = new Float32Array(instanceCount * 2);
  let offset = 0;
  for (let z = -radiusCells; z <= radiusCells; z += 1) {
    for (let x = -radiusCells; x <= radiusCells; x += 1) {
      cells[offset] = x;
      cells[offset + 1] = z;
      offset += 2;
    }
  }
  return { radiusCells, instanceCount, cells, buildDurationMs: now() - startedAt };
};

export const cloudGridState = (
  cameraX: number,
  cameraZ: number,
  scrollBlocks: number,
  chunkSize = 16,
): { originX: number; originZ: number; gridU: number; gridV: number } => {
  const originX = Math.floor(cameraX / chunkSize) * chunkSize;
  const originZ = Math.floor(cameraZ / chunkSize) * chunkSize;
  return {
    originX,
    originZ,
    gridU: Math.floor((originX - scrollBlocks) / CLOUD_SCALE),
    gridV: Math.floor(originZ / CLOUD_SCALE),
  };
};

export const cloudFieldTelemetry = {
  layoutBuilds: 0,
  lastBuildDurationMs: 0,
  maxBuildDurationMs: 0,
};

export const recordCloudFieldBuild = (durationMs: number): void => {
  cloudFieldTelemetry.layoutBuilds += 1;
  cloudFieldTelemetry.lastBuildDurationMs = durationMs;
  cloudFieldTelemetry.maxBuildDurationMs = Math.max(cloudFieldTelemetry.maxBuildDurationMs, durationMs);
};
