export interface FrameTimeSummary {
  samples: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  framesOver25Ms: number;
  framesOver50Ms: number;
  framesOver100Ms: number;
}

export const percentile = (values: readonly number[], ratio: number): number => {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const clamped = Math.min(1, Math.max(0, ratio));
  const position = (sorted.length - 1) * clamped;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return sorted[lowerIndex];
  const weight = position - lowerIndex;
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
};

export const summarizeFrameTimes = (values: readonly number[]): FrameTimeSummary => {
  if (values.length === 0) {
    return {
      samples: 0,
      averageMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      framesOver25Ms: 0,
      framesOver50Ms: 0,
      framesOver100Ms: 0,
    };
  }

  let total = 0;
  let framesOver25Ms = 0;
  let framesOver50Ms = 0;
  let framesOver100Ms = 0;
  for (const value of values) {
    total += value;
    if (value > 25) framesOver25Ms += 1;
    if (value > 50) framesOver50Ms += 1;
    if (value > 100) framesOver100Ms += 1;
  }

  return {
    samples: values.length,
    averageMs: total / values.length,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    framesOver25Ms,
    framesOver50Ms,
    framesOver100Ms,
  };
};
