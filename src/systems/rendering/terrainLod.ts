export type TerrainLod = 'near' | 'middle' | 'far';

export interface TerrainLodPolicy {
  nearRadius: number;
  middleRadius: number;
  shadowRadius: number;
}

export const DEFAULT_TERRAIN_LOD_POLICY: TerrainLodPolicy = {
  nearRadius: 8,
  middleRadius: 16,
  shadowRadius: 6,
};

export const classifyTerrainLod = (
  distanceSq: number,
  policy: TerrainLodPolicy = DEFAULT_TERRAIN_LOD_POLICY,
): TerrainLod => {
  if (distanceSq <= policy.nearRadius * policy.nearRadius) return 'near';
  if (distanceSq <= policy.middleRadius * policy.middleRadius) return 'middle';
  return 'far';
};

export const shouldCastTerrainShadow = (
  distanceSq: number,
  shadowsEnabled: boolean,
  policy: TerrainLodPolicy = DEFAULT_TERRAIN_LOD_POLICY,
): boolean => shadowsEnabled && distanceSq <= policy.shadowRadius * policy.shadowRadius;

const LOD_CODE: Record<TerrainLod, number> = { near: 0, middle: 1, far: 2 };

class TerrainRenderPolicyStore {
  private centerCx = 0;
  private centerCz = 0;
  private version = 0;
  private listeners = new Set<() => void>();

  setCenter(cx: number, cz: number): void {
    if (cx === this.centerCx && cz === this.centerCz) return;
    this.centerCx = cx;
    this.centerCz = cz;
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getChunkFlags(cx: number, cz: number, shadowsEnabled: boolean): number {
    const dx = cx - this.centerCx;
    const dz = cz - this.centerCz;
    const distanceSq = dx * dx + dz * dz;
    const lod = classifyTerrainLod(distanceSq);
    const shadow = shouldCastTerrainShadow(distanceSq, shadowsEnabled) ? 1 : 0;
    return LOD_CODE[lod] | (shadow << 2);
  }

  getCenter(): { cx: number; cz: number; version: number } {
    return { cx: this.centerCx, cz: this.centerCz, version: this.version };
  }
}

export const terrainRenderPolicy = new TerrainRenderPolicyStore();

export const lodFromChunkFlags = (flags: number): TerrainLod =>
  (flags & 3) === 0 ? 'near' : (flags & 3) === 1 ? 'middle' : 'far';

export const shadowFromChunkFlags = (flags: number): boolean => (flags & 4) !== 0;
